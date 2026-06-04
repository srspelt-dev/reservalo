from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user, require_owner
from app.models import Resource, Service, User
from app.schemas.service import ServiceCreate, ServiceOut, ServiceUpdate
from app.services.plans import enforce_limit

router = APIRouter(prefix="/services", tags=["services"])


def _get_owned(db: Session, service_id: int, tenant_id: int) -> Service:
    service = db.get(Service, service_id)
    if not service or service.tenant_id != tenant_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Service not found")
    return service


def _resources_for(db: Session, ids: list[int], tenant_id: int) -> list[Resource]:
    """Resolve resource ids to the tenant's resources (ignores foreign/invalid ids)."""
    if not ids:
        return []
    return list(
        db.scalars(
            select(Resource).where(Resource.tenant_id == tenant_id, Resource.id.in_(ids))
        )
    )


@router.get("", response_model=list[ServiceOut])
def list_services(
    include_inactive: bool = False,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[Service]:
    stmt = select(Service).where(Service.tenant_id == user.tenant_id)
    if not include_inactive:
        stmt = stmt.where(Service.active.is_(True))
    return list(db.scalars(stmt.order_by(Service.name)))


@router.post("", response_model=ServiceOut, status_code=status.HTTP_201_CREATED)
def create_service(
    payload: ServiceCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_owner),
) -> Service:
    enforce_limit(db, user.tenant, "services")
    data = payload.model_dump()
    resource_ids = data.pop("resource_ids", [])
    service = Service(tenant_id=user.tenant_id, **data)
    service.resources = _resources_for(db, resource_ids, user.tenant_id)
    db.add(service)
    db.commit()
    db.refresh(service)
    return service


@router.put("/{service_id}", response_model=ServiceOut)
def update_service(
    service_id: int,
    payload: ServiceUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_owner),
) -> Service:
    service = _get_owned(db, service_id, user.tenant_id)
    data = payload.model_dump(exclude_unset=True)
    if "resource_ids" in data:
        service.resources = _resources_for(db, data.pop("resource_ids"), user.tenant_id)
    for field, value in data.items():
        setattr(service, field, value)
    db.commit()
    db.refresh(service)
    return service


@router.delete("/{service_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_service(
    service_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_owner),
) -> None:
    service = _get_owned(db, service_id, user.tenant_id)
    # Soft-delete to preserve historical bookings that reference this service.
    service.active = False
    db.commit()
