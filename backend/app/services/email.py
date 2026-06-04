"""Email notifications.

Uses SMTP when configured; otherwise logs the message to stdout so the full
notification flow is testable in development without an email provider. Sending is
best-effort: failures are logged and never propagate (a booking must not fail just
because an email could not be delivered).
"""
import logging
import smtplib
from email.message import EmailMessage

from fastapi import BackgroundTasks
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Booking, Service, Tenant, User, UserRole
from app.services.availability import get_zone

logger = logging.getLogger("reservalo.email")
# Ensure notifications are visible regardless of the surrounding (uvicorn) log config.
if not logger.handlers:
    _handler = logging.StreamHandler()
    _handler.setFormatter(logging.Formatter("%(levelname)s %(name)s: %(message)s"))
    logger.addHandler(_handler)
    logger.setLevel(logging.INFO)
    logger.propagate = False


def send_email(to: str, subject: str, body: str) -> None:
    if not to:
        return
    if not settings.smtp_host:
        logger.info(
            "[EMAIL — SMTP not configured, logging only]\nTo: %s\nSubject: %s\n\n%s",
            to, subject, body,
        )
        return
    try:
        msg = EmailMessage()
        msg["From"] = settings.smtp_from
        msg["To"] = to
        msg["Subject"] = subject
        msg.set_content(body)
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as server:
            if settings.smtp_tls:
                server.starttls()
            if settings.smtp_user:
                server.login(settings.smtp_user, settings.smtp_password)
            server.send_message(msg)
    except Exception:  # noqa: BLE001 - never let email break the request
        logger.exception("Failed to send email to %s", to)


def _when(booking: Booking, tenant: Tenant) -> str:
    return booking.start_datetime.astimezone(get_zone(tenant)).strftime("%d/%m/%Y %H:%M")


def queue_booking_notifications(
    background: BackgroundTasks, db: Session, tenant: Tenant, booking: Booking
) -> None:
    """Schedule confirmation (to client) and new-booking alert (to owners)."""
    service = db.get(Service, booking.service_id)
    service_name = service.name if service else "Reserva"
    when = _when(booking, tenant)
    manage_url = f"{settings.public_base_url}/booking/{tenant.slug}/r/{booking.public_code}"

    if booking.client_email:
        body = (
            f"Hola {booking.client_name},\n\n"
            f"Tu reserva en {tenant.name} quedó confirmada:\n"
            f"  Servicio: {service_name}\n"
            f"  Fecha y hora: {when}\n\n"
            f"Para cancelar o reprogramar tu turno, entrá a:\n{manage_url}\n\n"
            f"¡Te esperamos!"
        )
        background.add_task(
            send_email, booking.client_email, f"Reserva confirmada — {tenant.name}", body
        )

    owner_emails = list(
        db.scalars(
            select(User.email).where(
                User.tenant_id == tenant.id, User.role == UserRole.owner, User.active.is_(True)
            )
        )
    )
    owner_body = (
        f"Nueva reserva en {tenant.name}:\n\n"
        f"  Cliente: {booking.client_name}\n"
        f"  Teléfono: {booking.client_phone or '-'}\n"
        f"  Servicio: {service_name}\n"
        f"  Fecha y hora: {when}\n"
        f"  Estado: {booking.status.value}\n"
    )
    for email in owner_emails:
        background.add_task(send_email, email, f"Nueva reserva — {tenant.name}", owner_body)


def _owner_emails(db: Session, tenant_id: int) -> list[str]:
    return list(
        db.scalars(
            select(User.email).where(
                User.tenant_id == tenant_id, User.role == UserRole.owner, User.active.is_(True)
            )
        )
    )


def queue_booking_status_email(
    background: BackgroundTasks, db: Session, tenant: Tenant, booking: Booking, action: str
) -> None:
    """Notify client + owners that a booking was 'cancelled' or 'rescheduled'."""
    service = db.get(Service, booking.service_id)
    service_name = service.name if service else "Reserva"
    when = _when(booking, tenant)
    verb = "cancelada" if action == "cancelled" else "reprogramada"

    if booking.client_email:
        client_body = (
            f"Hola {booking.client_name},\n\n"
            f"Tu reserva en {tenant.name} ({service_name}) fue {verb}.\n"
            + (f"Nueva fecha y hora: {when}\n" if action == "rescheduled" else "")
        )
        background.add_task(
            send_email, booking.client_email, f"Reserva {verb} — {tenant.name}", client_body
        )

    owner_body = (
        f"La reserva de {booking.client_name} ({service_name}) fue {verb}.\n"
        f"Fecha y hora: {when}\n"
    )
    for email in _owner_emails(db, tenant.id):
        background.add_task(send_email, email, f"Reserva {verb} — {tenant.name}", owner_body)
