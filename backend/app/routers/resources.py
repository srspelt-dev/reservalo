from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user, require_owner
from app.models import Resource, User
from app.schemas.resource import ResourceCreate, ResourceOut, ResourceUpdate
from app.services.plans import enforce_limit

router = APIRouter(prefix="/resources", tags=["resources"])


def _get_owned(db: Session, resource_id: int, tenant_id: int) -> Resource:
    resource = db.get(Resource, resource_id)
    if not resource or resource.tenant_id != tenant_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Resource not found")
    return resource


@router.get("", response_model=list[ResourceOut])
def list_resources(
    include_inactive: bool = False,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[Resource]:
    stmt = select(Resource).where(Resource.tenant_id == user.tenant_id)
    if not include_inactive:
        stmt = stmt.where(Resource.active.is_(True))
    return list(db.scalars(stmt.order_by(Resource.name)))


@router.post("", response_model=ResourceOut, status_code=status.HTTP_201_CREATED)
def create_resource(
    payload: ResourceCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_owner),
) -> Resource:
    enforce_limit(db, user.tenant, "resources")
    resource = Resource(tenant_id=user.tenant_id, **payload.model_dump())
    db.add(resource)
    db.commit()
    db.refresh(resource)
    return resource


@router.put("/{resource_id}", response_model=ResourceOut)
def update_resource(
    resource_id: int,
    payload: ResourceUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_owner),
) -> Resource:
    resource = _get_owned(db, resource_id, user.tenant_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(resource, field, value)
    db.commit()
    db.refresh(resource)
    return resource


@router.delete("/{resource_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_resource(
    resource_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_owner),
) -> None:
    resource = _get_owned(db, resource_id, user.tenant_id)
    resource.active = False
    db.commit()
