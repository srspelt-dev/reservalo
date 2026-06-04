from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user, require_owner
from app.models import User
from app.schemas.tenant import TenantOut, TenantUpdate

router = APIRouter(prefix="/tenant", tags=["tenant"])


@router.get("", response_model=TenantOut)
def get_tenant(user: User = Depends(get_current_user)) -> object:
    return user.tenant


@router.put("", response_model=TenantOut)
def update_tenant(
    payload: TenantUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_owner),
) -> object:
    tenant = user.tenant
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(tenant, field, value)
    db.commit()
    db.refresh(tenant)
    return tenant
