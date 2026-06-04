import os
import secrets
from datetime import date, datetime, time, timezone
from zoneinfo import ZoneInfo

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    HTTPException,
    Query,
    UploadFile,
    status,
)
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import (
    Booking,
    BookingStatus,
    Coupon,
    Package,
    PageView,
    PaymentMethod,
    Resource,
    Review,
    Schedule,
    Service,
    Tenant,
)
from app.routers.packages import packages_for
from app.schemas.booking import BookingCreate, BookingOut
from app.schemas.package import PackageOut
from app.schemas.resource import ResourceOut
from app.schemas.service import ServiceOut
from app.services.availability import (
    BookingError,
    available_slots,
    commit_or_conflict,
    event_slots,
    get_zone,
    validate_booking,
    validate_event_booking,
)
from app.services.email import queue_booking_notifications, queue_booking_status_email
from app.services.plans import enforce_limit


def resolve_payment_method(tenant: Tenant, requested: PaymentMethod | None) -> PaymentMethod | None:
    """Validate the chosen method against what the tenant accepts.

    Falls back to the only enabled method when the client didn't choose one.
    """
    allowed = []
    if tenant.accept_cash:
        allowed.append(PaymentMethod.cash)
    if tenant.accept_transfer:
        allowed.append(PaymentMethod.transfer)
    if not allowed:
        return None
    if requested is None:
        return allowed[0] if len(allowed) == 1 else None
    if requested not in allowed:
        raise BookingError("Selected payment method is not accepted by this business")
    return requested

# Booking states a client is still allowed to manage (cancel / reschedule).
_MANAGEABLE = (BookingStatus.pending, BookingStatus.confirmed)

router = APIRouter(prefix="/public", tags=["public"])


class DayHours(BaseModel):
    day: int  # 0 = Monday ... 6 = Sunday
    ranges: list[str]  # e.g. ["09:00–13:00", "15:00–18:00"]


class ReviewOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    rating: int
    comment: str | None
    client_name: str
    created_at: datetime


class PublicTenant(BaseModel):
    name: str
    slug: str
    description: str | None
    logo_url: str | None
    brand_color: str
    whatsapp: str | None
    location_url: str | None
    photos: list[str]
    promo_image_url: str | None
    promo_title: str | None
    accept_cash: bool
    accept_transfer: bool
    payment_alias: str | None
    payment_instructions: str | None
    deposit_percent: int
    booking_mode: str
    event_duration_minutes: int
    # Business hours (merged across resources) + live open/closed state
    weekly_hours: list[DayHours]
    is_open_now: bool
    closes_at: str | None
    # Reviews
    rating_avg: float | None
    rating_count: int
    reviews: list[ReviewOut]
    services: list[ServiceOut]
    resources: list[ResourceOut]
    packages: list[PackageOut]


def _fmt_minutes(m: int) -> str:
    h = (m // 60) % 24
    return f"{h:02d}:{m % 60:02d}"


def _business_hours(db: Session, tenant: Tenant) -> tuple[list[DayHours], bool, str | None]:
    """Merge every active resource's weekly schedule into per-day opening ranges and
    compute whether the business is open right now (in its own timezone)."""
    rows = db.execute(
        select(Schedule.day_of_week, Schedule.start_time, Schedule.end_time)
        .join(Resource, Schedule.resource_id == Resource.id)
        .where(Resource.tenant_id == tenant.id, Resource.active.is_(True))
    ).all()

    # Collect intervals per day in minutes; windows ending at/under their start wrap past midnight.
    by_day: dict[int, list[tuple[int, int]]] = {d: [] for d in range(7)}
    for dow, start, end in rows:
        start = start if isinstance(start, time) else time.fromisoformat(str(start))
        end = end if isinstance(end, time) else time.fromisoformat(str(end))
        sm = start.hour * 60 + start.minute
        em = end.hour * 60 + end.minute
        if em <= sm:
            em += 1440
        by_day[dow].append((sm, em))

    merged: dict[int, list[tuple[int, int]]] = {}
    for d, intervals in by_day.items():
        intervals.sort()
        out: list[tuple[int, int]] = []
        for s, e in intervals:
            if out and s <= out[-1][1]:
                out[-1] = (out[-1][0], max(out[-1][1], e))
            else:
                out.append((s, e))
        merged[d] = out

    weekly = [
        DayHours(day=d, ranges=[f"{_fmt_minutes(s)}–{_fmt_minutes(e)}" for s, e in merged[d]])
        for d in range(7)
    ]

    # Open-now check in the tenant timezone.
    try:
        now = datetime.now(ZoneInfo(tenant.timezone))
    except Exception:  # noqa: BLE001 - bad tz falls back to UTC
        now = datetime.now(timezone.utc)
    dow = now.weekday()
    cur = now.hour * 60 + now.minute
    is_open = False
    closes_at: str | None = None
    for s, e in merged[dow]:
        if s <= cur < e:
            is_open = True
            closes_at = _fmt_minutes(e)
            break
    if not is_open:  # a window from the previous day may still be running past midnight
        for s, e in merged[(dow - 1) % 7]:
            if e > 1440 and cur < (e - 1440):
                is_open = True
                closes_at = _fmt_minutes(e)
                break
    return weekly, is_open, closes_at


def _active_tenant(db: Session, slug: str) -> Tenant:
    tenant = db.scalar(select(Tenant).where(Tenant.slug == slug, Tenant.active.is_(True)))
    if not tenant:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Business not found")
    return tenant


@router.get("/{slug}", response_model=PublicTenant)
def public_tenant(slug: str, db: Session = Depends(get_db)) -> PublicTenant:
    tenant = _active_tenant(db, slug)
    services = list(
        db.scalars(
            select(Service)
            .where(Service.tenant_id == tenant.id, Service.active.is_(True))
            .order_by(Service.name)
        )
    )
    resources = list(
        db.scalars(
            select(Resource)
            .where(Resource.tenant_id == tenant.id, Resource.active.is_(True))
            .order_by(Resource.name)
        )
    )
    pkgs = list(
        db.scalars(
            select(Package)
            .where(Package.tenant_id == tenant.id, Package.active.is_(True))
            .order_by(Package.name)
        )
    )
    weekly_hours, is_open_now, closes_at = _business_hours(db, tenant)

    review_rows = list(
        db.scalars(
            select(Review).where(Review.tenant_id == tenant.id).order_by(Review.created_at.desc())
        )
    )
    rating_count = len(review_rows)
    rating_avg = round(sum(r.rating for r in review_rows) / rating_count, 1) if rating_count else None
    reviews_out = [ReviewOut.model_validate(r) for r in review_rows if r.comment][:6]

    return PublicTenant(
        name=tenant.name,
        slug=tenant.slug,
        description=tenant.description,
        logo_url=tenant.logo_url,
        brand_color=tenant.brand_color,
        whatsapp=tenant.whatsapp,
        location_url=tenant.location_url,
        photos=tenant.photos or [],
        promo_image_url=tenant.promo_image_url,
        promo_title=tenant.promo_title,
        accept_cash=tenant.accept_cash,
        accept_transfer=tenant.accept_transfer,
        payment_alias=tenant.payment_alias,
        payment_instructions=tenant.payment_instructions,
        deposit_percent=tenant.deposit_percent,
        booking_mode=tenant.booking_mode,
        event_duration_minutes=tenant.event_duration_minutes,
        weekly_hours=weekly_hours,
        is_open_now=is_open_now,
        closes_at=closes_at,
        rating_avg=rating_avg,
        rating_count=rating_count,
        reviews=reviews_out,
        services=[ServiceOut.model_validate(s) for s in services],
        resources=[ResourceOut.model_validate(r) for r in resources],
        packages=[PackageOut.model_validate(p) for p in pkgs],
    )


@router.post("/{slug}/view", status_code=status.HTTP_204_NO_CONTENT)
def track_view(slug: str, db: Session = Depends(get_db)) -> None:
    """Increment today's visit counter for the public link (best-effort, no auth)."""
    tenant = _active_tenant(db, slug)
    today = datetime.now(get_zone(tenant)).date()
    pv = db.scalar(
        select(PageView).where(PageView.tenant_id == tenant.id, PageView.day == today)
    )
    if pv:
        pv.count += 1
    else:
        db.add(PageView(tenant_id=tenant.id, day=today, count=1))
    db.commit()


class CouponCheck(BaseModel):
    code: str


class CouponResult(BaseModel):
    code: str
    percent: int


def _lookup_coupon(db: Session, tenant_id: int, code: str | None) -> Coupon | None:
    if not code:
        return None
    norm = code.strip().upper().replace(" ", "")
    return db.scalar(
        select(Coupon).where(
            Coupon.tenant_id == tenant_id, Coupon.code == norm, Coupon.active.is_(True)
        )
    )


@router.post("/{slug}/coupon", response_model=CouponResult)
def validate_coupon(slug: str, payload: CouponCheck, db: Session = Depends(get_db)) -> CouponResult:
    tenant = _active_tenant(db, slug)
    coupon = _lookup_coupon(db, tenant.id, payload.code)
    if not coupon:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Cupón inválido")
    return CouponResult(code=coupon.code, percent=coupon.percent)


class AvailabilityResponse(BaseModel):
    day: date
    service_id: int | None
    resource_id: int
    slots: list[datetime]
    ends: list[datetime] = []  # franja end per slot (event mode only)


@router.get("/{slug}/availability", response_model=AvailabilityResponse)
def availability(
    slug: str,
    resource_id: int = Query(...),
    day: date = Query(...),
    service_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
) -> AvailabilityResponse:
    tenant = _active_tenant(db, slug)
    resource = db.get(Resource, resource_id)
    if not resource or resource.tenant_id != tenant.id or not resource.active:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Resource not found")

    # Event mode: each schedule window is a bookable franja (start–end).
    if tenant.booking_mode == "events":
        franjas = event_slots(db, tenant=tenant, resource=resource, day=day)
        return AvailabilityResponse(
            day=day,
            service_id=None,
            resource_id=resource_id,
            slots=[s for s, _ in franjas],
            ends=[e for _, e in franjas],
        )

    service = None
    duration = tenant.event_duration_minutes
    if service_id is not None:
        service = db.get(Service, service_id)
        if not service or service.tenant_id != tenant.id or not service.active:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Service not found")
        duration = service.duration_minutes

    slots = available_slots(
        db, tenant=tenant, resource=resource, day=day, service=service, duration_minutes=duration
    )
    return AvailabilityResponse(
        day=day, service_id=service_id, resource_id=resource_id, slots=slots
    )


@router.post("/{slug}/booking", response_model=BookingOut, status_code=status.HTTP_201_CREATED)
def create_public_booking(
    slug: str,
    payload: BookingCreate,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
) -> Booking:
    tenant = _active_tenant(db, slug)
    resource = db.get(Resource, payload.resource_id)
    if not resource or resource.tenant_id != tenant.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Resource not found")

    is_events = tenant.booking_mode == "events"
    service = None
    duration = tenant.event_duration_minutes
    if not is_events and payload.service_id is not None:
        service = db.get(Service, payload.service_id)
        if not service or service.tenant_id != tenant.id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Service not found")
        duration = service.duration_minutes

    enforce_limit(db, tenant, "bookings")
    try:
        payment_method = resolve_payment_method(tenant, payload.payment_method)
        if is_events:
            start_utc, end_utc = validate_event_booking(
                db, tenant=tenant, resource=resource, start=payload.start_datetime,
                enforce_window=True,
            )
        else:
            start_utc, end_utc = validate_booking(
                db,
                tenant=tenant,
                service=service,
                duration_minutes=duration,
                resource=resource,
                start=payload.start_datetime,
                enforce_window=True,
            )
    except BookingError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc))

    coupon = _lookup_coupon(db, tenant.id, payload.coupon_code)
    booking = Booking(
        tenant_id=tenant.id,
        service_id=service.id if service else None,
        resource_id=resource.id,
        client_name=payload.client_name,
        client_phone=payload.client_phone,
        client_email=payload.client_email,
        start_datetime=start_utc,
        end_datetime=end_utc,
        notes=payload.notes,
        status=BookingStatus.pending,
        payment_method=payment_method,
        coupon_code=coupon.code if coupon else None,
        discount_percent=coupon.percent if coupon else 0,
    )
    booking.packages = packages_for(db, payload.package_ids, tenant.id)
    db.add(booking)
    try:
        commit_or_conflict(db)
    except BookingError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc))
    db.refresh(booking)
    queue_booking_notifications(background, db, tenant, booking)
    return booking


# ----------------------------------------------------------------------------
# Self-service management of an existing booking (no login, by public_code)
# ----------------------------------------------------------------------------

class PublicBookingDetail(BaseModel):
    public_code: str
    status: BookingStatus
    client_name: str
    start_datetime: datetime
    end_datetime: datetime
    service_id: int | None
    resource_id: int
    service_name: str
    resource_name: str
    tenant_name: str
    payment_method: str | None
    payment_status: str
    payment_proof_url: str | None
    accept_transfer: bool
    payment_alias: str | None
    can_manage: bool
    can_review: bool
    reviewed: bool


class RescheduleRequest(BaseModel):
    start_datetime: datetime


class ReviewCreate(BaseModel):
    rating: int = Field(ge=1, le=5)
    comment: str | None = Field(default=None, max_length=1000)


def _get_managed_booking(db: Session, tenant: Tenant, code: str) -> Booking:
    booking = db.scalar(
        select(Booking).where(Booking.tenant_id == tenant.id, Booking.public_code == code)
    )
    if not booking:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Booking not found")
    return booking


def _detail(db: Session, tenant: Tenant, booking: Booking) -> PublicBookingDetail:
    service = db.get(Service, booking.service_id)
    resource = db.get(Resource, booking.resource_id)
    is_future = booking.start_datetime > datetime.now(timezone.utc)
    reviewed = (
        db.scalar(select(Review.id).where(Review.booking_id == booking.id)) is not None
    )
    can_review = (not is_future) and booking.status != BookingStatus.cancelled and not reviewed
    return PublicBookingDetail(
        public_code=booking.public_code,
        status=booking.status,
        client_name=booking.client_name,
        start_datetime=booking.start_datetime,
        end_datetime=booking.end_datetime,
        service_id=booking.service_id,
        resource_id=booking.resource_id,
        service_name=service.name if service else "",
        resource_name=resource.name if resource else "",
        tenant_name=tenant.name,
        payment_method=booking.payment_method.value if booking.payment_method else None,
        payment_status=booking.payment_status.value,
        payment_proof_url=booking.payment_proof_url,
        accept_transfer=tenant.accept_transfer,
        payment_alias=tenant.payment_alias,
        can_manage=booking.status in _MANAGEABLE and is_future,
        can_review=can_review,
        reviewed=reviewed,
    )


@router.get("/{slug}/booking/{code}", response_model=PublicBookingDetail)
def get_public_booking(slug: str, code: str, db: Session = Depends(get_db)) -> PublicBookingDetail:
    tenant = _active_tenant(db, slug)
    booking = _get_managed_booking(db, tenant, code)
    return _detail(db, tenant, booking)


@router.post("/{slug}/booking/{code}/review", response_model=PublicBookingDetail)
def create_review(
    slug: str, code: str, payload: ReviewCreate, db: Session = Depends(get_db)
) -> PublicBookingDetail:
    tenant = _active_tenant(db, slug)
    booking = _get_managed_booking(db, tenant, code)
    if booking.start_datetime > datetime.now(timezone.utc):
        raise HTTPException(status.HTTP_409_CONFLICT, "Solo podés opinar después de tu turno")
    if booking.status == BookingStatus.cancelled:
        raise HTTPException(status.HTTP_409_CONFLICT, "Una reserva cancelada no se puede calificar")
    if db.scalar(select(Review.id).where(Review.booking_id == booking.id)):
        raise HTTPException(status.HTTP_409_CONFLICT, "Ya dejaste tu opinión, ¡gracias!")
    db.add(
        Review(
            tenant_id=tenant.id,
            booking_id=booking.id,
            rating=payload.rating,
            comment=(payload.comment or None),
            client_name=booking.client_name,
        )
    )
    db.commit()
    return _detail(db, tenant, booking)


@router.post("/{slug}/booking/{code}/cancel", response_model=PublicBookingDetail)
def cancel_public_booking(
    slug: str, code: str, background: BackgroundTasks, db: Session = Depends(get_db)
) -> PublicBookingDetail:
    tenant = _active_tenant(db, slug)
    booking = _get_managed_booking(db, tenant, code)
    if booking.status not in _MANAGEABLE:
        raise HTTPException(status.HTTP_409_CONFLICT, "This booking can no longer be cancelled")
    if booking.start_datetime <= datetime.now(timezone.utc):
        raise HTTPException(status.HTTP_409_CONFLICT, "Past bookings cannot be cancelled")
    booking.status = BookingStatus.cancelled
    db.commit()
    db.refresh(booking)
    queue_booking_status_email(background, db, tenant, booking, "cancelled")
    return _detail(db, tenant, booking)


@router.put("/{slug}/booking/{code}/reschedule", response_model=PublicBookingDetail)
def reschedule_public_booking(
    slug: str,
    code: str,
    payload: RescheduleRequest,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
) -> PublicBookingDetail:
    tenant = _active_tenant(db, slug)
    booking = _get_managed_booking(db, tenant, code)
    if booking.status not in _MANAGEABLE:
        raise HTTPException(status.HTTP_409_CONFLICT, "This booking can no longer be rescheduled")
    if booking.start_datetime <= datetime.now(timezone.utc):
        raise HTTPException(status.HTTP_409_CONFLICT, "Past bookings cannot be rescheduled")

    service = db.get(Service, booking.service_id) if booking.service_id else None
    resource = db.get(Resource, booking.resource_id)
    duration = service.duration_minutes if service else tenant.event_duration_minutes
    try:
        if tenant.booking_mode == "events":
            start_utc, end_utc = validate_event_booking(
                db, tenant=tenant, resource=resource, start=payload.start_datetime,
                exclude_booking_id=booking.id,
            )
        else:
            start_utc, end_utc = validate_booking(
                db,
                tenant=tenant,
                service=service,
                duration_minutes=duration,
                resource=resource,
                start=payload.start_datetime,
                exclude_booking_id=booking.id,
            )
    except BookingError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc))

    booking.start_datetime = start_utc
    booking.end_datetime = end_utc
    try:
        commit_or_conflict(db)
    except BookingError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc))
    db.refresh(booking)
    queue_booking_status_email(background, db, tenant, booking, "rescheduled")
    return _detail(db, tenant, booking)


_ALLOWED_PROOF_TYPES = {"image/jpeg", "image/png", "image/webp", "application/pdf"}
_EXT = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "application/pdf": ".pdf"}


@router.post("/{slug}/booking/{code}/proof", response_model=PublicBookingDetail)
async def upload_payment_proof(
    slug: str,
    code: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
) -> PublicBookingDetail:
    """Client uploads a transfer receipt (image/PDF) for their booking."""
    tenant = _active_tenant(db, slug)
    booking = _get_managed_booking(db, tenant, code)

    if file.content_type not in _ALLOWED_PROOF_TYPES:
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "Only JPG, PNG, WEBP or PDF are allowed"
        )
    data = await file.read()
    if len(data) > settings.upload_max_bytes:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "File is too large (max 5MB)")

    os.makedirs(settings.upload_dir, exist_ok=True)
    name = f"{booking.public_code}_{secrets.token_hex(4)}{_EXT[file.content_type]}"
    with open(os.path.join(settings.upload_dir, name), "wb") as fh:
        fh.write(data)

    booking.payment_proof_url = f"/uploads/{name}"
    db.commit()
    db.refresh(booking)
    return _detail(db, tenant, booking)
