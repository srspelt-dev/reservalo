import csv
import io
from datetime import date, datetime

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Response, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user, require_owner, require_staff
from app.models import Booking, BookingStatus, Resource, Service, User, UserRole
from app.routers.packages import packages_for
from app.schemas.booking import BookingCreate, BookingOut, BookingUpdate
from app.services.availability import (
    BookingError,
    commit_or_conflict,
    get_zone,
    validate_booking,
)
from app.services.email import queue_booking_notifications, queue_booking_status_email
from app.services.plans import enforce_limit


def _filtered_query(user: User, db: Session, status_filter, resource_id, date_from, date_to, q):
    stmt = select(Booking).where(Booking.tenant_id == user.tenant_id)
    # Staff tied to a resource only ever see that resource's bookings.
    if user.role == UserRole.staff and user.resource_id is not None:
        stmt = stmt.where(Booking.resource_id == user.resource_id)
    if status_filter is not None:
        stmt = stmt.where(Booking.status == status_filter)
    if resource_id is not None:
        stmt = stmt.where(Booking.resource_id == resource_id)
    if q:
        like = f"%{q.lower()}%"
        stmt = stmt.where(
            or_(
                Booking.client_name.ilike(like),
                Booking.client_email.ilike(like),
                Booking.client_phone.ilike(like),
            )
        )
    tz = get_zone(user.tenant)
    if date_from is not None:
        lo = datetime.combine(date_from, datetime.min.time()).replace(tzinfo=tz)
        stmt = stmt.where(Booking.start_datetime >= lo)
    if date_to is not None:
        hi = datetime.combine(date_to, datetime.max.time()).replace(tzinfo=tz)
        stmt = stmt.where(Booking.start_datetime <= hi)
    return stmt

router = APIRouter(prefix="/bookings", tags=["bookings"])


def _get_owned(db: Session, booking_id: int, user: User) -> Booking:
    booking = db.get(Booking, booking_id)
    if not booking or booking.tenant_id != user.tenant_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Booking not found")
    if (
        user.role == UserRole.staff
        and user.resource_id is not None
        and booking.resource_id != user.resource_id
    ):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Booking not found")
    return booking


def _tenant_service(db: Session, service_id: int, tenant_id: int) -> Service:
    service = db.get(Service, service_id)
    if not service or service.tenant_id != tenant_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Service not found")
    return service


def _tenant_resource(db: Session, resource_id: int, tenant_id: int) -> Resource:
    resource = db.get(Resource, resource_id)
    if not resource or resource.tenant_id != tenant_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Resource not found")
    return resource


@router.get("", response_model=list[BookingOut])
def list_bookings(
    status_filter: BookingStatus | None = None,
    resource_id: int | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    q: str | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[Booking]:
    stmt = _filtered_query(user, db, status_filter, resource_id, date_from, date_to, q)
    stmt = stmt.order_by(Booking.start_datetime.desc()).limit(limit).offset(offset)
    return list(db.scalars(stmt))


@router.get("/export.csv")
def export_bookings_csv(
    status_filter: BookingStatus | None = None,
    resource_id: int | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    q: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_owner),
) -> Response:
    stmt = _filtered_query(user, db, status_filter, resource_id, date_from, date_to, q).order_by(
        Booking.start_datetime
    )
    bookings = list(db.scalars(stmt))
    tz = get_zone(user.tenant)
    services = {s.id: s.name for s in db.scalars(select(Service).where(Service.tenant_id == user.tenant_id))}
    resources = {r.id: r.name for r in db.scalars(select(Resource).where(Resource.tenant_id == user.tenant_id))}

    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["Fecha", "Hora", "Cliente", "Teléfono", "Email", "Servicio", "Recurso", "Estado", "Pago"])
    for b in bookings:
        local = b.start_datetime.astimezone(tz)
        w.writerow([
            local.strftime("%Y-%m-%d"),
            local.strftime("%H:%M"),
            b.client_name,
            b.client_phone or "",
            b.client_email or "",
            services.get(b.service_id, ""),
            resources.get(b.resource_id, ""),
            b.status.value,
            b.payment_status.value,
        ])
    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=reservas.csv"},
    )


@router.post("", response_model=BookingOut, status_code=status.HTTP_201_CREATED)
def create_booking(
    payload: BookingCreate,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(require_staff),
) -> Booking:
    enforce_limit(db, user.tenant, "bookings")
    resource = _tenant_resource(db, payload.resource_id, user.tenant_id)
    service = _tenant_service(db, payload.service_id, user.tenant_id) if payload.service_id else None
    duration = service.duration_minutes if service else user.tenant.event_duration_minutes
    try:
        start_utc, end_utc = validate_booking(
            db,
            tenant=user.tenant,
            service=service,
            duration_minutes=duration,
            resource=resource,
            start=payload.start_datetime,
        )
    except BookingError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc))

    booking = Booking(
        tenant_id=user.tenant_id,
        service_id=service.id if service else None,
        resource_id=resource.id,
        client_name=payload.client_name,
        client_phone=payload.client_phone,
        client_email=payload.client_email,
        start_datetime=start_utc,
        end_datetime=end_utc,
        notes=payload.notes,
        status=BookingStatus.confirmed,
        payment_method=payload.payment_method,
    )
    booking.packages = packages_for(db, payload.package_ids, user.tenant_id)
    db.add(booking)
    try:
        commit_or_conflict(db)
    except BookingError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc))
    db.refresh(booking)
    queue_booking_notifications(background, db, user.tenant, booking)
    return booking


@router.put("/{booking_id}", response_model=BookingOut)
def update_booking(
    booking_id: int,
    payload: BookingUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_staff),
) -> Booking:
    booking = _get_owned(db, booking_id, user)
    data = payload.model_dump(exclude_unset=True)

    # Determine the effective service/resource/start for revalidation.
    sid = data.get("service_id", booking.service_id)
    service = _tenant_service(db, sid, user.tenant_id) if sid else None
    resource = _tenant_resource(db, data.get("resource_id", booking.resource_id), user.tenant_id)
    new_start = data.get("start_datetime", booking.start_datetime)
    duration = service.duration_minutes if service else user.tenant.event_duration_minutes

    reschedule = any(k in data for k in ("service_id", "resource_id", "start_datetime"))
    if reschedule:
        try:
            start_utc, end_utc = validate_booking(
                db,
                tenant=user.tenant,
                service=service,
                duration_minutes=duration,
                resource=resource,
                start=new_start,
                exclude_booking_id=booking.id,
            )
        except BookingError as exc:
            raise HTTPException(status.HTTP_409_CONFLICT, str(exc))
        booking.start_datetime = start_utc
        booking.end_datetime = end_utc

    if "package_ids" in data:
        booking.packages = packages_for(db, data.pop("package_ids"), user.tenant_id)

    # Apply remaining mutable fields (start_datetime handled above on reschedule).
    for field, value in data.items():
        if field == "start_datetime":
            continue
        setattr(booking, field, value)

    try:
        commit_or_conflict(db)
    except BookingError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc))
    db.refresh(booking)
    return booking


@router.delete("/{booking_id}", status_code=status.HTTP_204_NO_CONTENT)
def cancel_booking(
    booking_id: int,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(require_staff),
) -> None:
    booking = _get_owned(db, booking_id, user)
    booking.status = BookingStatus.cancelled
    db.commit()
    db.refresh(booking)
    queue_booking_status_email(background, db, user.tenant, booking, "cancelled")
