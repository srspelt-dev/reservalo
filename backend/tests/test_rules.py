"""Tests for booking rules: date exceptions, service↔resource mapping, buffer, window."""
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

import pytest

from app.models import Booking, BookingStatus, Resource, Schedule, ScheduleException, Service, Tenant
from app.services.availability import BookingError, available_slots, validate_booking

ASUNCION = ZoneInfo("America/Asuncion")


def _seed(db, *, buffer=0, min_adv=0, max_adv=60):
    tenant = Tenant(
        name="N", slug=f"s{buffer}{min_adv}{max_adv}", timezone="America/Asuncion",
        buffer_minutes=buffer, min_advance_minutes=min_adv, max_advance_days=max_adv,
    )
    db.add(tenant)
    db.flush()
    service = Service(tenant_id=tenant.id, name="Corte", duration_minutes=30, price=0)
    r1 = Resource(tenant_id=tenant.id, name="R1")
    r2 = Resource(tenant_id=tenant.id, name="R2")
    db.add_all([service, r1, r2])
    db.flush()
    for r in (r1, r2):
        for dow in range(7):
            db.add(Schedule(resource_id=r.id, day_of_week=dow, start_time=time(0), end_time=time(23, 59)))
    db.commit()
    return tenant, service, r1, r2


def _future_day(days=7):
    return date.fromordinal(datetime.now(ASUNCION).date().toordinal() + days)


def test_closed_exception_blocks_day(db):
    tenant, service, r1, _ = _seed(db)
    day = _future_day()
    db.add(ScheduleException(resource_id=r1.id, date=day, is_closed=True))
    db.commit()
    assert available_slots(db, tenant=tenant, service=service, resource=r1, day=day) == []
    with pytest.raises(BookingError, match="not available"):
        validate_booking(
            db, tenant=tenant, service=service, resource=r1,
            start=datetime.combine(day, time(10, 0)),
        )


def test_custom_hours_exception(db):
    tenant, service, r1, _ = _seed(db)
    day = _future_day()
    db.add(
        ScheduleException(
            resource_id=r1.id, date=day, is_closed=False,
            start_time=time(14, 0), end_time=time(16, 0),
        )
    )
    db.commit()
    slots = available_slots(db, tenant=tenant, service=service, resource=r1, day=day)
    locals_ = [s.astimezone(ASUNCION).strftime("%H:%M") for s in slots]
    assert "10:00" not in locals_  # outside custom window
    assert "14:00" in locals_


def test_service_resource_mapping(db):
    tenant, service, r1, r2 = _seed(db)
    service.resources = [r1]  # only R1 can perform it
    db.commit()
    day = _future_day()
    # R2 is not allowed
    assert available_slots(db, tenant=tenant, service=service, resource=r2, day=day) == []
    with pytest.raises(BookingError, match="cannot perform"):
        validate_booking(
            db, tenant=tenant, service=service, resource=r2,
            start=datetime.combine(day, time(10, 0)),
        )
    # R1 is allowed
    start, _ = validate_booking(
        db, tenant=tenant, service=service, resource=r1,
        start=datetime.combine(day, time(10, 0)),
    )
    assert start is not None


def test_buffer_between_bookings(db):
    tenant, service, r1, _ = _seed(db, buffer=15)
    day = _future_day()
    start, end = validate_booking(
        db, tenant=tenant, service=service, resource=r1,
        start=datetime.combine(day, time(10, 0)),
    )
    db.add(Booking(
        tenant_id=tenant.id, service_id=service.id, resource_id=r1.id,
        client_name="A", start_datetime=start, end_datetime=end, status=BookingStatus.confirmed,
    ))
    db.commit()
    # 10:30 has 0 gap (< 15 buffer) -> conflict
    with pytest.raises(BookingError, match="already booked"):
        validate_booking(
            db, tenant=tenant, service=service, resource=r1,
            start=datetime.combine(day, time(10, 30)),
        )
    # 10:45 has 15 min gap -> ok
    ok, _ = validate_booking(
        db, tenant=tenant, service=service, resource=r1,
        start=datetime.combine(day, time(10, 45)),
    )
    assert ok is not None


def test_min_advance_window(db):
    tenant, service, r1, _ = _seed(db, min_adv=120)
    soon_local = datetime.now(ASUNCION).replace(tzinfo=None) + timedelta(minutes=30)
    with pytest.raises(BookingError, match="close to the start"):
        validate_booking(
            db, tenant=tenant, service=service, resource=r1,
            start=soon_local, enforce_window=True,
        )
