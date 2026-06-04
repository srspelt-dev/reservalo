import os
import secrets
from datetime import date, datetime, timezone

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
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import Booking, BookingStatus, Package, PaymentMethod, Resource, Service, Tenant
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


class PublicTenant(BaseModel):
    name: str
    slug: str
    description: str | None
    logo_url: str | None
    brand_color: str
    whatsapp: str | None
    location_url: str | None
    accept_cash: bool
    accept_transfer: bool
    payment_alias: str | None
    payment_instructions: str | None
    deposit_percent: int
    booking_mode: str
    event_duration_minutes: int
    services: list[ServiceOut]
    resources: list[ResourceOut]
    packages: list[PackageOut]


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
    return PublicTenant(
        name=tenant.name,
        slug=tenant.slug,
        description=tenant.description,
        logo_url=tenant.logo_url,
        brand_color=tenant.brand_color,
        whatsapp=tenant.whatsapp,
        location_url=tenant.location_url,
        accept_cash=tenant.accept_cash,
        accept_transfer=tenant.accept_transfer,
        payment_alias=tenant.payment_alias,
        payment_instructions=tenant.payment_instructions,
        deposit_percent=tenant.deposit_percent,
        booking_mode=tenant.booking_mode,
        event_duration_minutes=tenant.event_duration_minutes,
        services=[ServiceOut.model_validate(s) for s in services],
        resources=[ResourceOut.model_validate(r) for r in resources],
        packages=[PackageOut.model_validate(p) for p in pkgs],
    )


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


class RescheduleRequest(BaseModel):
    start_datetime: datetime


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
    )


@router.get("/{slug}/booking/{code}", response_model=PublicBookingDetail)
def get_public_booking(slug: str, code: str, db: Session = Depends(get_db)) -> PublicBookingDetail:
    tenant = _active_tenant(db, slug)
    booking = _get_managed_booking(db, tenant, code)
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
