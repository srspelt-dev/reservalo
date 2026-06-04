from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import require_owner
from app.models import Coupon, User
from app.schemas.coupon import CouponCreate, CouponOut, CouponUpdate

router = APIRouter(prefix="/coupons", tags=["coupons"])


def _normalize(code: str) -> str:
    return code.strip().upper().replace(" ", "")


def _get_owned(db: Session, coupon_id: int, tenant_id: int) -> Coupon:
    coupon = db.get(Coupon, coupon_id)
    if not coupon or coupon.tenant_id != tenant_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Coupon not found")
    return coupon


@router.get("", response_model=list[CouponOut])
def list_coupons(db: Session = Depends(get_db), current: User = Depends(require_owner)) -> list[Coupon]:
    return list(
        db.scalars(
            select(Coupon).where(Coupon.tenant_id == current.tenant_id).order_by(Coupon.code)
        )
    )


@router.post("", response_model=CouponOut, status_code=status.HTTP_201_CREATED)
def create_coupon(
    payload: CouponCreate, db: Session = Depends(get_db), current: User = Depends(require_owner)
) -> Coupon:
    code = _normalize(payload.code)
    if db.scalar(
        select(Coupon).where(Coupon.tenant_id == current.tenant_id, Coupon.code == code)
    ):
        raise HTTPException(status.HTTP_409_CONFLICT, "Ya existe un cupón con ese código")
    coupon = Coupon(
        tenant_id=current.tenant_id, code=code, percent=payload.percent, active=payload.active
    )
    db.add(coupon)
    db.commit()
    db.refresh(coupon)
    return coupon


@router.put("/{coupon_id}", response_model=CouponOut)
def update_coupon(
    coupon_id: int,
    payload: CouponUpdate,
    db: Session = Depends(get_db),
    current: User = Depends(require_owner),
) -> Coupon:
    coupon = _get_owned(db, coupon_id, current.tenant_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(coupon, field, value)
    db.commit()
    db.refresh(coupon)
    return coupon


@router.delete("/{coupon_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_coupon(
    coupon_id: int, db: Session = Depends(get_db), current: User = Depends(require_owner)
) -> None:
    coupon = _get_owned(db, coupon_id, current.tenant_id)
    db.delete(coupon)
    db.commit()
