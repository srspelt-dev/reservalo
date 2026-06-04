from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import require_owner
from app.models import Booking, BookingStatus, PaymentStatus, Service, User
from app.services.availability import get_zone
from app.services.plans import require_feature

router = APIRouter(prefix="/reports", tags=["reports"])


class StatusCounts(BaseModel):
    pending: int = 0
    confirmed: int = 0
    cancelled: int = 0
    completed: int = 0


class TopService(BaseModel):
    name: str
    count: int


class DayCount(BaseModel):
    day: date
    count: int


class ReportOut(BaseModel):
    date_from: date
    date_to: date
    total_bookings: int
    by_status: StatusCounts
    cancellation_rate: float  # 0..1
    revenue: float            # confirmed + completed (precio del servicio)
    revenue_paid: float       # solo reservas marcadas como pagadas
    top_services: list[TopService]
    by_day: list[DayCount]


@router.get("", response_model=ReportOut)
def report(
    date_from: date | None = None,
    date_to: date | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_owner),
) -> ReportOut:
    require_feature(db, user.tenant, "advanced_reports")
    tz = get_zone(user.tenant)
    today = datetime.now(tz).date()
    if date_to is None:
        date_to = today
    if date_from is None:
        date_from = date_to - timedelta(days=29)

    lo = datetime.combine(date_from, datetime.min.time()).replace(tzinfo=tz)
    hi = datetime.combine(date_to, datetime.max.time()).replace(tzinfo=tz)

    base = (
        select(Booking)
        .where(Booking.tenant_id == user.tenant_id)
        .where(Booking.start_datetime >= lo, Booking.start_datetime <= hi)
    )
    bookings = list(db.scalars(base))

    counts = StatusCounts()
    revenue = 0.0
    revenue_paid = 0.0
    # price lookup
    prices = dict(
        db.execute(
            select(Service.id, Service.price).where(Service.tenant_id == user.tenant_id)
        ).all()
    )
    per_service: dict[str, int] = {}
    per_day: dict[date, int] = {}
    names = dict(
        db.execute(
            select(Service.id, Service.name).where(Service.tenant_id == user.tenant_id)
        ).all()
    )

    for b in bookings:
        setattr(counts, b.status.value, getattr(counts, b.status.value) + 1)
        price = float(prices.get(b.service_id, 0) or 0)
        if b.status in (BookingStatus.confirmed, BookingStatus.completed):
            revenue += price
        if b.payment_status == PaymentStatus.paid:
            revenue_paid += price
        if b.status != BookingStatus.cancelled:
            name = names.get(b.service_id, f"#{b.service_id}")
            per_service[name] = per_service.get(name, 0) + 1
            local_day = b.start_datetime.astimezone(tz).date()
            per_day[local_day] = per_day.get(local_day, 0) + 1

    total = len(bookings)
    top = sorted(per_service.items(), key=lambda kv: kv[1], reverse=True)[:5]

    return ReportOut(
        date_from=date_from,
        date_to=date_to,
        total_bookings=total,
        by_status=counts,
        cancellation_rate=(counts.cancelled / total) if total else 0.0,
        revenue=revenue,
        revenue_paid=revenue_paid,
        top_services=[TopService(name=n, count=c) for n, c in top],
        by_day=[DayCount(day=d, count=c) for d, c in sorted(per_day.items())],
    )
