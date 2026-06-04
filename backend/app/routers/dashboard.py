from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models import Booking, BookingStatus, Package, Resource, Schedule, Service, User
from app.schemas.booking import BookingOut
from app.services.availability import get_zone

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


class DayCount(BaseModel):
    day: date
    count: int


class DashboardStats(BaseModel):
    bookings_today: int
    bookings_week: int
    bookings_week_prev: int
    upcoming_bookings: int
    total_clients: int
    total_services: int
    total_packages: int
    total_resources: int
    has_schedules: bool
    has_bookings: bool
    today: list[BookingOut]
    upcoming: list[BookingOut]
    week: list[DayCount]
    recent: list[BookingOut]


@router.get("", response_model=DashboardStats)
def dashboard(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> DashboardStats:
    tid = user.tenant_id
    tz = get_zone(user.tenant)
    now = datetime.now(timezone.utc)
    today_local = now.astimezone(tz).date()
    start_today = datetime.combine(today_local, datetime.min.time()).replace(tzinfo=tz)
    end_today = datetime.combine(today_local, datetime.max.time()).replace(tzinfo=tz)

    active = Booking.status.in_([BookingStatus.pending, BookingStatus.confirmed])

    today_bookings = list(
        db.scalars(
            select(Booking)
            .where(
                Booking.tenant_id == tid,
                active,
                Booking.start_datetime >= start_today,
                Booking.start_datetime <= end_today,
            )
            .order_by(Booking.start_datetime)
        )
    )

    upcoming_bookings = list(
        db.scalars(
            select(Booking)
            .where(Booking.tenant_id == tid, active, Booking.start_datetime > now)
            .order_by(Booking.start_datetime)
            .limit(10)
        )
    )

    # Distinct clients by email (falling back to name when email is absent).
    total_clients = db.scalar(
        select(func.count(func.distinct(func.coalesce(Booking.client_email, Booking.client_name))))
        .where(Booking.tenant_id == tid)
    ) or 0

    total_services = db.scalar(
        select(func.count(Service.id)).where(Service.tenant_id == tid, Service.active.is_(True))
    ) or 0
    total_resources = db.scalar(
        select(func.count(Resource.id)).where(Resource.tenant_id == tid, Resource.active.is_(True))
    ) or 0
    total_packages = db.scalar(
        select(func.count(Package.id)).where(Package.tenant_id == tid, Package.active.is_(True))
    ) or 0
    has_schedules = (
        db.scalar(
            select(Schedule.id)
            .join(Resource, Schedule.resource_id == Resource.id)
            .where(Resource.tenant_id == tid)
            .limit(1)
        )
        is not None
    )
    has_bookings = (
        db.scalar(select(Booking.id).where(Booking.tenant_id == tid).limit(1)) is not None
    )

    # Current week (Monday–Sunday, tenant-local)
    week_start_local = today_local - timedelta(days=today_local.weekday())
    week_days = [week_start_local + timedelta(days=i) for i in range(7)]
    week_lo = datetime.combine(week_days[0], datetime.min.time()).replace(tzinfo=tz)
    week_hi = datetime.combine(week_days[-1], datetime.max.time()).replace(tzinfo=tz)
    week_bookings = list(
        db.scalars(
            select(Booking).where(
                Booking.tenant_id == tid,
                active,
                Booking.start_datetime >= week_lo,
                Booking.start_datetime <= week_hi,
            )
        )
    )
    counts: dict[date, int] = {d: 0 for d in week_days}
    for b in week_bookings:
        d = b.start_datetime.astimezone(tz).date()
        if d in counts:
            counts[d] += 1
    week = [DayCount(day=d, count=counts[d]) for d in week_days]

    # Previous week total (for the "vs. semana pasada" comparison).
    prev_lo = datetime.combine(
        week_days[0] - timedelta(days=7), datetime.min.time()
    ).replace(tzinfo=tz)
    prev_hi = datetime.combine(
        week_days[0] - timedelta(days=1), datetime.max.time()
    ).replace(tzinfo=tz)
    bookings_week_prev = db.scalar(
        select(func.count(Booking.id)).where(
            Booking.tenant_id == tid,
            active,
            Booking.start_datetime >= prev_lo,
            Booking.start_datetime <= prev_hi,
        )
    ) or 0

    recent = list(
        db.scalars(
            select(Booking)
            .where(Booking.tenant_id == tid)
            .order_by(Booking.created_at.desc())
            .limit(6)
        )
    )

    return DashboardStats(
        bookings_today=len(today_bookings),
        bookings_week=len(week_bookings),
        bookings_week_prev=bookings_week_prev,
        upcoming_bookings=db.scalar(
            select(func.count(Booking.id)).where(
                Booking.tenant_id == tid, active, Booking.start_datetime > now
            )
        ) or 0,
        total_clients=total_clients,
        total_services=total_services,
        total_packages=total_packages,
        total_resources=total_resources,
        has_schedules=has_schedules,
        has_bookings=has_bookings,
        today=today_bookings,
        upcoming=upcoming_bookings,
        week=week,
        recent=recent,
    )
