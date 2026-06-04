"""Automatic booking reminders.

A background scheduler periodically sends an email reminder to clients whose booking
starts within the configured window (default 24h) and hasn't been reminded yet.
``send_due_reminders`` is a pure, idempotent function (testable without the scheduler):
it marks ``reminder_sent_at`` so a reminder is sent at most once per booking.
"""
import logging
import sys
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.database import SessionLocal
from app.models import Booking, Service, Tenant
from app.services.availability import BLOCKING_STATUSES, get_zone
from app.services.email import send_email

logger = logging.getLogger("reservalo.reminders")
if not logger.handlers:
    _h = logging.StreamHandler()
    _h.setFormatter(logging.Formatter("%(levelname)s %(name)s: %(message)s"))
    logger.addHandler(_h)
    logger.setLevel(logging.INFO)
    logger.propagate = False


def send_due_reminders(db: Session, now: datetime | None = None) -> int:
    """Send reminders for bookings entering the window. Returns how many were sent."""
    now = now or datetime.now(timezone.utc)
    horizon = now + timedelta(hours=settings.reminder_hours_before)

    bookings = list(
        db.scalars(
            select(Booking).where(
                Booking.status.in_(BLOCKING_STATUSES),
                Booking.reminder_sent_at.is_(None),
                Booking.client_email.is_not(None),
                Booking.start_datetime > now,
                Booking.start_datetime <= horizon,
            )
        )
    )

    sent = 0
    for b in bookings:
        tenant = db.get(Tenant, b.tenant_id)
        service = db.get(Service, b.service_id)
        if not tenant:
            continue
        when = b.start_datetime.astimezone(get_zone(tenant)).strftime("%d/%m/%Y %H:%M")
        manage_url = f"{settings.public_base_url}/booking/{tenant.slug}/r/{b.public_code}"
        body = (
            f"Hola {b.client_name},\n\n"
            f"Te recordamos tu turno en {tenant.name}:\n"
            f"  Servicio: {service.name if service else 'Reserva'}\n"
            f"  Fecha y hora: {when}\n\n"
            f"Si no podés asistir, cancelá o reprogramá acá:\n{manage_url}\n"
        )
        send_email(b.client_email, f"Recordatorio de tu turno — {tenant.name}", body)
        b.reminder_sent_at = now
        sent += 1

    if sent:
        db.commit()
        logger.info("Sent %d booking reminder(s)", sent)
    return sent


def _job() -> None:
    db = SessionLocal()
    try:
        send_due_reminders(db)
    except Exception:  # noqa: BLE001 - keep the scheduler alive on any error
        logger.exception("Reminder job failed")
    finally:
        db.close()


def start_scheduler():
    """Start the background reminder scheduler. Returns the scheduler or None."""
    # Don't spin up a scheduler during the test suite.
    if not settings.reminder_enabled or "pytest" in sys.modules:
        return None
    from apscheduler.schedulers.background import BackgroundScheduler

    scheduler = BackgroundScheduler(timezone="UTC")
    scheduler.add_job(
        _job,
        "interval",
        minutes=settings.reminder_interval_minutes,
        id="booking_reminders",
        next_run_time=datetime.now(timezone.utc),  # run once shortly after startup
    )
    scheduler.start()
    logger.info("Reminder scheduler started (every %d min)", settings.reminder_interval_minutes)
    return scheduler
