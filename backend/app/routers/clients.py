"""Mini-CRM: clients are not accounts — they are aggregated from bookings.

A client is grouped by email (lowercased) when present, otherwise by phone, otherwise
by name. Lets the business see who their recurring clients are and each one's history.
"""
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import require_staff
from app.models import Booking, User
from app.schemas.booking import BookingOut

router = APIRouter(prefix="/clients", tags=["clients"])


class ClientSummary(BaseModel):
    key: str
    name: str
    email: str | None
    phone: str | None
    total_bookings: int
    last_visit: datetime | None


def _key(b: Booking) -> str:
    if b.client_email:
        return f"email:{b.client_email.lower()}"
    if b.client_phone:
        return f"phone:{b.client_phone}"
    return f"name:{b.client_name.lower()}"


@router.get("", response_model=list[ClientSummary])
def list_clients(
    db: Session = Depends(get_db), user: User = Depends(require_staff)
) -> list[ClientSummary]:
    bookings = list(
        db.scalars(
            select(Booking)
            .where(Booking.tenant_id == user.tenant_id)
            .order_by(Booking.start_datetime)
        )
    )
    agg: dict[str, ClientSummary] = {}
    for b in bookings:
        k = _key(b)
        cur = agg.get(k)
        if cur is None:
            agg[k] = ClientSummary(
                key=k,
                name=b.client_name,
                email=b.client_email,
                phone=b.client_phone,
                total_bookings=1,
                last_visit=b.start_datetime,
            )
        else:
            cur.total_bookings += 1
            cur.name = b.client_name  # keep most recent name
            cur.email = b.client_email or cur.email
            cur.phone = b.client_phone or cur.phone
            if cur.last_visit is None or b.start_datetime > cur.last_visit:
                cur.last_visit = b.start_datetime
    return sorted(agg.values(), key=lambda c: c.last_visit or datetime.min, reverse=True)


@router.get("/history", response_model=list[BookingOut])
def client_history(
    key: str = Query(..., description="client key returned by GET /clients"),
    db: Session = Depends(get_db),
    user: User = Depends(require_staff),
) -> list[Booking]:
    bookings = list(
        db.scalars(
            select(Booking)
            .where(Booking.tenant_id == user.tenant_id)
            .order_by(Booking.start_datetime.desc())
        )
    )
    return [b for b in bookings if _key(b) == key]
