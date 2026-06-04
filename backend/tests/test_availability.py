"""Unit tests for the reservation engine — the highest-value logic in the system."""
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

import pytest

from app.models import Booking, BookingStatus, Resource, Schedule, Service, Tenant
from app.services.availability import BookingError, available_slots, validate_booking

ASUNCION = ZoneInfo("America/Asuncion")


def _seed(db, *, tz="America/Asuncion", duration=30, day_of_week=2):
    """Create a tenant + service + resource + a Wed 09:00-12:00 schedule."""
    tenant = Tenant(name="Barbería", slug="barberia", timezone=tz)
    db.add(tenant)
    db.flush()
    service = Service(tenant_id=tenant.id, name="Corte", duration_minutes=duration, price=0)
    resource = Resource(tenant_id=tenant.id, name="Silla 1")
    db.add_all([service, resource])
    db.flush()
    db.add(
        Schedule(
            resource_id=resource.id,
            day_of_week=day_of_week,
            start_time=time(9, 0),
            end_time=time(12, 0),
        )
    )
    db.commit()
    return tenant, service, resource


def _next_weekday(weekday: int) -> date:
    """A future date (well ahead of 'now') falling on the given weekday."""
    base = datetime.now(ASUNCION).date()
    d = base
    # jump at least a week forward so slots are always in the future
    d = date.fromordinal(d.toordinal() + 7)
    while d.weekday() != weekday:
        d = date.fromordinal(d.toordinal() + 1)
    return d


def test_end_datetime_is_start_plus_duration(db):
    tenant, service, resource = _seed(db, duration=45)
    day = _next_weekday(2)
    local_start = datetime.combine(day, time(9, 0))
    start_utc, end_utc = validate_booking(
        db, tenant=tenant, service=service, resource=resource, start=local_start
    )
    assert (end_utc - start_utc).total_seconds() == 45 * 60


def test_naive_start_is_interpreted_as_tenant_local(db):
    tenant, service, resource = _seed(db)
    day = _next_weekday(2)
    # 09:00 naive == 09:00 in Asunción -> 12:00 UTC (Paraguay is UTC-3)
    start_utc, _ = validate_booking(
        db, tenant=tenant, service=service, resource=resource, start=datetime.combine(day, time(9, 0))
    )
    local = start_utc.astimezone(ASUNCION)
    assert local.hour == 9 and local.minute == 0
    assert start_utc.tzinfo is not None  # stored aware/UTC


def test_outside_schedule_is_rejected(db):
    tenant, service, resource = _seed(db)
    day = _next_weekday(2)
    with pytest.raises(BookingError, match="outside"):
        validate_booking(
            db, tenant=tenant, service=service, resource=resource,
            start=datetime.combine(day, time(7, 0)),  # before 09:00
        )


def test_wrong_weekday_is_rejected(db):
    tenant, service, resource = _seed(db, day_of_week=2)  # only Wednesday
    thursday = _next_weekday(3)
    with pytest.raises(BookingError, match="not available"):
        validate_booking(
            db, tenant=tenant, service=service, resource=resource,
            start=datetime.combine(thursday, time(9, 0)),
        )


def test_double_booking_conflict(db):
    tenant, service, resource = _seed(db, duration=30)
    day = _next_weekday(2)
    start_utc, end_utc = validate_booking(
        db, tenant=tenant, service=service, resource=resource, start=datetime.combine(day, time(9, 0))
    )
    db.add(
        Booking(
            tenant_id=tenant.id, service_id=service.id, resource_id=resource.id,
            client_name="Juan", start_datetime=start_utc, end_datetime=end_utc,
            status=BookingStatus.confirmed,
        )
    )
    db.commit()
    # overlapping 09:15 should conflict
    with pytest.raises(BookingError, match="already booked"):
        validate_booking(
            db, tenant=tenant, service=service, resource=resource,
            start=datetime.combine(day, time(9, 15)),
        )


def test_cancelled_booking_frees_the_slot(db):
    tenant, service, resource = _seed(db, duration=30)
    day = _next_weekday(2)
    start_utc, end_utc = validate_booking(
        db, tenant=tenant, service=service, resource=resource, start=datetime.combine(day, time(9, 0))
    )
    db.add(
        Booking(
            tenant_id=tenant.id, service_id=service.id, resource_id=resource.id,
            client_name="Juan", start_datetime=start_utc, end_datetime=end_utc,
            status=BookingStatus.cancelled,
        )
    )
    db.commit()
    # same slot is bookable again because the previous one is cancelled
    again, _ = validate_booking(
        db, tenant=tenant, service=service, resource=resource, start=datetime.combine(day, time(9, 0))
    )
    assert again == start_utc


def test_available_slots_respects_window_and_duration(db):
    tenant, service, resource = _seed(db, duration=60)  # 09-12 with 60min, step 15
    day = _next_weekday(2)
    slots = available_slots(db, tenant=tenant, service=service, resource=resource, day=day)
    locals_ = [s.astimezone(ASUNCION).strftime("%H:%M") for s in slots]
    # last slot that fits a 60-min service in a 09:00-12:00 window starts 11:00
    assert "09:00" in locals_
    assert "11:00" in locals_
    assert "11:15" not in locals_
    assert all(s.tzinfo is not None for s in slots)


def test_available_slots_excludes_booked(db):
    tenant, service, resource = _seed(db, duration=60)
    day = _next_weekday(2)
    start_utc = datetime.combine(day, time(9, 0)).replace(tzinfo=ASUNCION).astimezone(timezone.utc)
    db.add(
        Booking(
            tenant_id=tenant.id, service_id=service.id, resource_id=resource.id,
            client_name="Juan", start_datetime=start_utc,
            end_datetime=start_utc + timedelta(hours=1),
            status=BookingStatus.confirmed,
        )
    )
    db.commit()
    slots = available_slots(db, tenant=tenant, service=service, resource=resource, day=day)
    locals_ = [s.astimezone(ASUNCION).strftime("%H:%M") for s in slots]
    assert "09:00" not in locals_  # taken
    assert "11:00" in locals_
