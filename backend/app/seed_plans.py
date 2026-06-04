"""Reusable plan/feature catalog seeding (used by tests; mirrors migration 0010)."""
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Feature, Plan

FEATURES = [
    ("full_calendar", "Calendario completo"),
    ("custom_branding", "Personalización"),
    ("whatsapp_reminders", "Recordatorios WhatsApp"),
    ("advanced_reports", "Reportes avanzados"),
    ("priority_support", "Soporte prioritario"),
    ("multi_branch", "Sucursales"),
    ("api_access", "Acceso API"),
    ("ai_assistant", "Asistente IA"),
]

# code, name, price, max_resources, max_services, max_bookings_per_month, max_users, sort, features
PLANS = [
    ("free", "Free", 0, 1, 1, 20, 1, 1, []),
    ("pro", "Pro", 99000, 3, None, None, 1, 2, ["full_calendar", "custom_branding"]),
    ("business", "Business", 199000, 10, None, None, None, 3,
     ["full_calendar", "custom_branding", "whatsapp_reminders", "advanced_reports", "priority_support"]),
    ("enterprise", "Enterprise", 399000, None, None, None, None, 4,
     ["full_calendar", "custom_branding", "whatsapp_reminders", "advanced_reports",
      "priority_support", "multi_branch", "api_access", "ai_assistant"]),
]


def seed_plans(db: Session) -> None:
    if db.scalar(select(Plan).limit(1)) is not None:
        return  # already seeded
    feats = {code: Feature(code=code, name=name) for code, name in FEATURES}
    db.add_all(feats.values())
    db.flush()
    for code, name, price, mr, ms, mb, mu, order, fcodes in PLANS:
        db.add(
            Plan(
                code=code, name=name, price=price, max_resources=mr, max_services=ms,
                max_bookings_per_month=mb, max_users=mu, sort_order=order,
                features=[feats[c] for c in fcodes],
            )
        )
    db.commit()
