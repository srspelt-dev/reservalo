"""Core reservation engine: availability checks and booking business rules.

Timezone model
--------------
Booking instants are stored in the database as timezone-aware **UTC**. A tenant
configures its local IANA timezone (e.g. ``America/Asuncion``); schedules are
expressed in that local wall-clock time. This module is the single boundary that
converts between the two.

Rules enforced here (single source of truth, shared by the authenticated and public
booking flows):
- end_datetime = start + service.duration
- within the resource's configured hours for that local date, considering per-date
  **exceptions** (holidays / vacation / custom hours)
- no overlap with other bookings on the resource, keeping a **buffer** between turns
- the resource can perform the service (service↔resource mapping)
- (public only) within the booking window: min advance / max advance
"""
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import and_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import (
    Booking,
    BookingStatus,
    Resource,
    Schedule,
    ScheduleException,
    Service,
    Tenant,
)

BLOCKING_STATUSES = (BookingStatus.pending, BookingStatus.confirmed, BookingStatus.completed)
SLOT_STEP_MINUTES = 15


class BookingError(ValueError):
    """Raised when a booking violates a business rule."""


def commit_or_conflict(db: Session) -> None:
    """Commit, translating a DB overlap-exclusion violation into a BookingError."""
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise BookingError("The resource is already booked for the requested time")


def get_zone(tenant: Tenant) -> ZoneInfo:
    try:
        return ZoneInfo(tenant.timezone)
    except Exception:  # noqa: BLE001
        return ZoneInfo("America/Asuncion")


def to_utc(dt: datetime, tz: ZoneInfo) -> datetime:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=tz)
    return dt.astimezone(timezone.utc)


def resource_allowed_for_service(service: Service, resource: Resource) -> bool:
    """A resource can perform a service if the service has no mapping (=any) or it's listed."""
    allowed = list(service.resources)
    return not allowed or any(r.id == resource.id for r in allowed)


def windows_for(db: Session, resource: Resource, local_date: date) -> list[tuple[time, time]]:
    """Opening windows for a resource on a local date, honoring date exceptions."""
    exc = db.scalar(
        select(ScheduleException).where(
            ScheduleException.resource_id == resource.id,
            ScheduleException.date == local_date,
        )
    )
    if exc is not None:
        if exc.is_closed or not exc.start_time or not exc.end_time:
            return []
        return [(exc.start_time, exc.end_time)]

    weekday = local_date.weekday()
    return [
        (s.start_time, s.end_time)
        for s in db.scalars(select(Schedule).where(Schedule.resource_id == resource.id))
        if s.day_of_week == weekday
    ]


def _has_conflict(
    db: Session,
    resource_id: int,
    start_utc: datetime,
    end_utc: datetime,
    buffer: timedelta,
    exclude_booking_id: int | None = None,
) -> bool:
    """True if a blocking booking overlaps [start-buffer, end+buffer) on the resource."""
    stmt = select(Booking.id).where(
        Booking.resource_id == resource_id,
        Booking.status.in_(BLOCKING_STATUSES),
        and_(
            Booking.start_datetime < end_utc + buffer,
            Booking.end_datetime > start_utc - buffer,
        ),
    )
    if exclude_booking_id is not None:
        stmt = stmt.where(Booking.id != exclude_booking_id)
    return db.execute(stmt).first() is not None


def validate_booking(
    db: Session,
    *,
    tenant: Tenant,
    resource: Resource,
    start: datetime,
    service: Service | None = None,
    duration_minutes: int | None = None,
    exclude_booking_id: int | None = None,
    enforce_window: bool = False,
) -> tuple[datetime, datetime]:
    """Validate a prospective booking; return ``(start_utc, end_utc)``.

    Duration comes from ``duration_minutes`` when given (event mode), otherwise from
    the service (appointment mode). When a service is given, its active state and the
    service↔resource mapping are enforced too.
    """
    if not resource.active:
        raise BookingError("Resource is not active")
    if resource.tenant_id != tenant.id:
        raise BookingError("Resource must belong to the tenant")
    if service is not None:
        if not service.active:
            raise BookingError("Service is not active")
        if service.tenant_id != tenant.id:
            raise BookingError("Service must belong to the tenant")
        if not resource_allowed_for_service(service, resource):
            raise BookingError("This resource cannot perform the selected service")

    minutes = duration_minutes if duration_minutes is not None else (
        service.duration_minutes if service else 0
    )
    if minutes <= 0:
        raise BookingError("Booking duration is not defined")

    tz = get_zone(tenant)
    start_utc = to_utc(start, tz)
    end_utc = start_utc + timedelta(minutes=minutes)

    if enforce_window:
        now = datetime.now(timezone.utc)
        if start_utc < now + timedelta(minutes=tenant.min_advance_minutes):
            raise BookingError("Too close to the start time to book")
        if start_utc > now + timedelta(days=tenant.max_advance_days):
            raise BookingError("That date is too far in advance")

    local_start = start_utc.astimezone(tz)
    local_end = end_utc.astimezone(tz)

    windows = windows_for(db, resource, local_start.date())
    if not windows:
        raise BookingError("The resource is not available on that date")
    fits = any(
        local_start
        >= local_start.replace(hour=ws.hour, minute=ws.minute, second=0, microsecond=0)
        and local_end
        <= local_start.replace(hour=we.hour, minute=we.minute, second=0, microsecond=0)
        for ws, we in windows
    )
    if not fits:
        raise BookingError("Requested time is outside the resource's configured schedule")

    buffer = timedelta(minutes=tenant.buffer_minutes)
    if _has_conflict(db, resource.id, start_utc, end_utc, buffer, exclude_booking_id):
        raise BookingError("The resource is already booked for the requested time")

    return start_utc, end_utc


def available_slots(
    db: Session,
    *,
    tenant: Tenant,
    resource: Resource,
    day: date,
    service: Service | None = None,
    duration_minutes: int | None = None,
) -> list[datetime]:
    """Return bookable start instants (UTC) for a resource on a local day."""
    if service is not None and not resource_allowed_for_service(service, resource):
        return []

    minutes = duration_minutes if duration_minutes is not None else (
        service.duration_minutes if service else 0
    )
    if minutes <= 0:
        return []

    tz = get_zone(tenant)
    duration = timedelta(minutes=minutes)
    step = timedelta(minutes=SLOT_STEP_MINUTES)
    buffer = timedelta(minutes=tenant.buffer_minutes)
    now_utc = datetime.now(timezone.utc)
    earliest = now_utc + timedelta(minutes=tenant.min_advance_minutes)
    latest = now_utc + timedelta(days=tenant.max_advance_days)

    windows = windows_for(db, resource, day)
    if not windows:
        return []

    day_start_utc = datetime.combine(day, time.min).replace(tzinfo=tz).astimezone(timezone.utc)
    day_end_utc = datetime.combine(day, time.max).replace(tzinfo=tz).astimezone(timezone.utc)
    existing = list(
        db.scalars(
            select(Booking).where(
                Booking.resource_id == resource.id,
                Booking.status.in_(BLOCKING_STATUSES),
                Booking.start_datetime < day_end_utc + buffer,
                Booking.end_datetime > day_start_utc - buffer,
            )
        )
    )

    slots: list[datetime] = []
    for ws, we in windows:
        cursor = datetime.combine(day, ws).replace(tzinfo=tz)
        window_end = datetime.combine(day, we).replace(tzinfo=tz)
        while cursor + duration <= window_end:
            slot_utc = cursor.astimezone(timezone.utc)
            slot_end_utc = slot_utc + duration
            conflict = any(
                b.start_datetime < slot_end_utc + buffer and b.end_datetime > slot_utc - buffer
                for b in existing
            )
            if not conflict and earliest <= slot_utc <= latest:
                slots.append(slot_utc)
            cursor += step
    return sorted(slots)


def _day_existing(db: Session, resource: Resource, day, tz: ZoneInfo, buffer: timedelta) -> list:
    day_start = datetime.combine(day, time.min).replace(tzinfo=tz).astimezone(timezone.utc)
    day_end = datetime.combine(day, time.max).replace(tzinfo=tz).astimezone(timezone.utc)
    return list(
        db.scalars(
            select(Booking).where(
                Booking.resource_id == resource.id,
                Booking.status.in_(BLOCKING_STATUSES),
                Booking.start_datetime < day_end + buffer,
                Booking.end_datetime > day_start - buffer,
            )
        )
    )


def event_slots(
    db: Session, *, tenant: Tenant, resource: Resource, day: date
) -> list[tuple[datetime, datetime]]:
    """Event mode: each configured schedule window IS a bookable franja.

    Returns (start_utc, end_utc) per open, conflict-free franja on the day.
    """
    tz = get_zone(tenant)
    buffer = timedelta(minutes=tenant.buffer_minutes)
    now = datetime.now(timezone.utc)
    earliest = now + timedelta(minutes=tenant.min_advance_minutes)
    latest = now + timedelta(days=tenant.max_advance_days)

    windows = windows_for(db, resource, day)
    if not windows:
        return []
    existing = _day_existing(db, resource, day, tz, buffer)

    out: list[tuple[datetime, datetime]] = []
    for ws, we in windows:
        s = datetime.combine(day, ws).replace(tzinfo=tz).astimezone(timezone.utc)
        e = datetime.combine(day, we).replace(tzinfo=tz).astimezone(timezone.utc)
        conflict = any(
            b.start_datetime < e + buffer and b.end_datetime > s - buffer for b in existing
        )
        if not conflict and earliest <= s <= latest:
            out.append((s, e))
    return sorted(out)


def validate_event_booking(
    db: Session,
    *,
    tenant: Tenant,
    resource: Resource,
    start: datetime,
    exclude_booking_id: int | None = None,
    enforce_window: bool = False,
) -> tuple[datetime, datetime]:
    """Validate an event booking: start must match a configured franja; end = franja end."""
    if not resource.active:
        raise BookingError("Resource is not active")
    if resource.tenant_id != tenant.id:
        raise BookingError("Resource must belong to the tenant")

    tz = get_zone(tenant)
    start_utc = to_utc(start, tz)
    local = start_utc.astimezone(tz)
    windows = windows_for(db, resource, local.date())
    match_end = next(
        (we for ws, we in windows if ws.hour == local.hour and ws.minute == local.minute), None
    )
    if match_end is None:
        raise BookingError("Requested time is not an available slot")
    end_utc = local.replace(
        hour=match_end.hour, minute=match_end.minute, second=0, microsecond=0
    ).astimezone(timezone.utc)

    if enforce_window:
        now = datetime.now(timezone.utc)
        if start_utc < now + timedelta(minutes=tenant.min_advance_minutes):
            raise BookingError("Too close to the start time to book")
        if start_utc > now + timedelta(days=tenant.max_advance_days):
            raise BookingError("That date is too far in advance")

    buffer = timedelta(minutes=tenant.buffer_minutes)
    if _has_conflict(db, resource.id, start_utc, end_utc, buffer, exclude_booking_id):
        raise BookingError("The resource is already booked for the requested time")
    return start_utc, end_utc
