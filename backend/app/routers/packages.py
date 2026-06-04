from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user, require_owner
from app.models import Package, User
from app.schemas.package import PackageCreate, PackageOut, PackageUpdate

router = APIRouter(prefix="/packages", tags=["packages"])


def _get_owned(db: Session, package_id: int, tenant_id: int) -> Package:
    pkg = db.get(Package, package_id)
    if not pkg or pkg.tenant_id != tenant_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Package not found")
    return pkg


def packages_for(db: Session, ids: list[int], tenant_id: int) -> list[Package]:
    """Resolve package ids to the tenant's active packages (ignores invalid ids)."""
    if not ids:
        return []
    return list(
        db.scalars(
            select(Package).where(
                Package.tenant_id == tenant_id,
                Package.id.in_(ids),
                Package.active.is_(True),
            )
        )
    )


@router.get("", response_model=list[PackageOut])
def list_packages(
    include_inactive: bool = False,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[Package]:
    stmt = select(Package).where(Package.tenant_id == user.tenant_id)
    if not include_inactive:
        stmt = stmt.where(Package.active.is_(True))
    return list(db.scalars(stmt.order_by(Package.name)))


@router.post("", response_model=PackageOut, status_code=status.HTTP_201_CREATED)
def create_package(
    payload: PackageCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_owner),
) -> Package:
    pkg = Package(tenant_id=user.tenant_id, **payload.model_dump())
    db.add(pkg)
    db.commit()
    db.refresh(pkg)
    return pkg


@router.put("/{package_id}", response_model=PackageOut)
def update_package(
    package_id: int,
    payload: PackageUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_owner),
) -> Package:
    pkg = _get_owned(db, package_id, user.tenant_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(pkg, field, value)
    db.commit()
    db.refresh(pkg)
    return pkg


@router.delete("/{package_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_package(
    package_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_owner),
) -> None:
    pkg = _get_owned(db, package_id, user.tenant_id)
    pkg.active = False
    db.commit()
