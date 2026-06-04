"""Tests for the automatic reminder selection/sending logic (no scheduler involved)."""
from datetime import datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from app.models import Booking, BookingStatus, Resource, Schedule, Service, Tenant
from app.services.reminders import send_due_reminders

ASUNCION = ZoneInfo("America/Asuncion")


def _seed_booking(db, *, hours_from_now: float, email: str | None = "c@cli.com",
                  status=BookingStatus.confirmed, reminded=False):
    tenant = Tenant(name="Barbería", slug=f"b{hours_from_now}{email}{status.value}{reminded}")
    db.add(tenant)
    db.flush()
    service = Service(tenant_id=tenant.id, name="Corte", duration_minutes=30, price=0)
    resource = Resource(tenant_id=tenant.id, name="Silla")
    db.add_all([service, resource])
    db.flush()
    db.add(Schedule(resource_id=resource.id, day_of_week=0, start_time=time(8), end_time=time(20)))
    start = datetime.now(timezone.utc) + timedelta(hours=hours_from_now)
    booking = Booking(
        tenant_id=tenant.id, service_id=service.id, resource_id=resource.id,
        client_name="Juan", client_email=email,
        start_datetime=start, end_datetime=start + timedelta(minutes=30),
        status=status, reminder_sent_at=(datetime.now(timezone.utc) if reminded else None),
    )
    db.add(booking)
    db.commit()
    return booking


def test_reminder_sent_for_booking_within_window(db):
    b = _seed_booking(db, hours_from_now=12)
    assert send_due_reminders(db) == 1
    db.refresh(b)
    assert b.reminder_sent_at is not None


def test_reminder_idempotent(db):
    _seed_booking(db, hours_from_now=12)
    assert send_due_reminders(db) == 1
    assert send_due_reminders(db) == 0  # already reminded


def test_booking_outside_window_not_reminded(db):
    b = _seed_booking(db, hours_from_now=48)  # beyond 24h
    assert send_due_reminders(db) == 0
    db.refresh(b)
    assert b.reminder_sent_at is None


def test_cancelled_and_no_email_skipped(db):
    _seed_booking(db, hours_from_now=10, status=BookingStatus.cancelled)
    _seed_booking(db, hours_from_now=10, email=None)
    assert send_due_reminders(db) == 0
