"""Plan limits & feature access — the single, reusable enforcement layer.

Limits live on the Plan row (NULL = unlimited), so adding or changing tiers never
requires code changes. Features are decoupled via the Feature/PlanFeature tables, so
new capabilities are added by inserting rows, not by editing this logic.
"""
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Booking, Plan, Resource, Service, Subscription, Tenant, User
from app.services.availability import get_zone

# kind -> (Plan limit attribute, human message)
_LIMITS = {
    "resources": ("max_resources", "Has alcanzado el límite de recursos de tu plan."),
    "services": ("max_services", "Has alcanzado el límite de servicios de tu plan."),
    "bookings": ("max_bookings_per_month", "Has alcanzado el límite de reservas de tu plan este mes."),
    "users": ("max_users", "Has alcanzado el límite de usuarios de tu plan."),
}


def get_subscription(db: Session, tenant: Tenant) -> Subscription:
    """Return the tenant's subscription, creating a Free one if missing."""
    sub = db.scalar(select(Subscription).where(Subscription.tenant_id == tenant.id))
    if sub is None:
        free = db.scalar(select(Plan).where(Plan.code == "free"))
        sub = Subscription(tenant_id=tenant.id, plan_id=free.id)
        db.add(sub)
        db.commit()
        db.refresh(sub)
    return sub


def get_plan(db: Session, tenant: Tenant) -> Plan:
    return get_subscription(db, tenant).plan


def _month_start_utc(tenant: Tenant) -> datetime:
    tz = get_zone(tenant)
    local = datetime.now(tz)
    return datetime(local.year, local.month, 1, tzinfo=tz).astimezone(timezone.utc)


def usage(db: Session, tenant: Tenant) -> dict[str, int]:
    return {
        "resources": db.scalar(
            select(func.count(Resource.id)).where(
                Resource.tenant_id == tenant.id, Resource.active.is_(True)
            )
        ) or 0,
        "services": db.scalar(
            select(func.count(Service.id)).where(
                Service.tenant_id == tenant.id, Service.active.is_(True)
            )
        ) or 0,
        "users": db.scalar(
            select(func.count(User.id)).where(User.tenant_id == tenant.id, User.active.is_(True))
        ) or 0,
        "bookings": db.scalar(
            select(func.count(Booking.id)).where(
                Booking.tenant_id == tenant.id, Booking.created_at >= _month_start_utc(tenant)
            )
        ) or 0,
    }


def limits(plan: Plan) -> dict[str, int | None]:
    return {
        "resources": plan.max_resources,
        "services": plan.max_services,
        "bookings": plan.max_bookings_per_month,
        "users": plan.max_users,
    }


def has_feature(db: Session, tenant: Tenant, code: str) -> bool:
    return code in get_plan(db, tenant).feature_codes


def enforce_limit(db: Session, tenant: Tenant, kind: str) -> None:
    """Raise 403 if creating one more `kind` would exceed the plan limit."""
    attr, message = _LIMITS[kind]
    plan = get_plan(db, tenant)
    cap = getattr(plan, attr)
    if cap is None:  # unlimited
        return
    current = usage(db, tenant)[kind]
    if current >= cap:
        raise HTTPException(status.HTTP_403_FORBIDDEN, message)


def require_feature(db: Session, tenant: Tenant, code: str) -> None:
    """Raise 403 if the tenant's plan does not include the feature."""
    if not has_feature(db, tenant, code):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Tu plan no incluye esta función. Actualizá tu plan para acceder.",
        )
