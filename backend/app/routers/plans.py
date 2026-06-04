from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user, require_owner
from app.models import Plan, User
from app.services.plans import get_subscription, limits as plan_limits, usage

router = APIRouter(tags=["plans"])


class FeatureOut(BaseModel):
    code: str
    name: str


class PlanOut(BaseModel):
    code: str
    name: str
    price: int
    limits: dict[str, int | None]
    features: list[FeatureOut]


class SubscriptionOut(BaseModel):
    plan: PlanOut
    status: str
    usage: dict[str, int]
    limits: dict[str, int | None]
    features: list[str]


def _plan_out(plan: Plan) -> PlanOut:
    return PlanOut(
        code=plan.code,
        name=plan.name,
        price=plan.price,
        limits=plan_limits(plan),
        features=[FeatureOut(code=f.code, name=f.name) for f in plan.features],
    )


@router.get("/plans", response_model=list[PlanOut])
def list_plans(db: Session = Depends(get_db), _: User = Depends(get_current_user)) -> list[PlanOut]:
    plans = db.scalars(
        select(Plan).where(Plan.active.is_(True)).order_by(Plan.sort_order)
    )
    return [_plan_out(p) for p in plans]


@router.get("/subscription", response_model=SubscriptionOut)
def current_subscription(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> SubscriptionOut:
    sub = get_subscription(db, user.tenant)
    plan = sub.plan
    return SubscriptionOut(
        plan=_plan_out(plan),
        status=sub.status.value,
        usage=usage(db, user.tenant),
        limits=plan_limits(plan),
        features=plan.feature_codes,
    )


class ChangePlanRequest(BaseModel):
    plan_code: str


@router.post("/subscription/change", response_model=SubscriptionOut)
def change_plan(
    payload: ChangePlanRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_owner),
) -> SubscriptionOut:
    plan = db.scalar(select(Plan).where(Plan.code == payload.plan_code, Plan.active.is_(True)))
    if not plan:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Plan not found")
    sub = get_subscription(db, user.tenant)
    sub.plan_id = plan.id
    db.commit()
    db.refresh(sub)
    return SubscriptionOut(
        plan=_plan_out(sub.plan),
        status=sub.status.value,
        usage=usage(db, user.tenant),
        limits=plan_limits(sub.plan),
        features=sub.plan.feature_codes,
    )
