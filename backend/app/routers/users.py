from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import require_owner
from app.models import Resource, User, UserRole
from app.schemas.auth import UserOut
from app.schemas.user import UserCreate, UserUpdate
from app.security import hash_password
from app.services.plans import enforce_limit

router = APIRouter(prefix="/users", tags=["users"])


def _get_owned(db: Session, user_id: int, tenant_id: int) -> User:
    user = db.get(User, user_id)
    if not user or user.tenant_id != tenant_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    return user


def _validate_resource(db: Session, tenant_id: int, resource_id: int | None) -> None:
    if resource_id is None:
        return
    resource = db.get(Resource, resource_id)
    if not resource or resource.tenant_id != tenant_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Resource not found")


def _active_owner_count(db: Session, tenant_id: int, exclude_id: int | None = None) -> int:
    stmt = select(func.count(User.id)).where(
        User.tenant_id == tenant_id, User.role == UserRole.owner, User.active.is_(True)
    )
    if exclude_id is not None:
        stmt = stmt.where(User.id != exclude_id)
    return db.scalar(stmt) or 0


@router.get("", response_model=list[UserOut])
def list_users(
    db: Session = Depends(get_db), current: User = Depends(require_owner)
) -> list[User]:
    return list(
        db.scalars(
            select(User).where(User.tenant_id == current.tenant_id).order_by(User.name)
        )
    )


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
    current: User = Depends(require_owner),
) -> User:
    enforce_limit(db, current.tenant, "users")
    email = payload.email.lower()
    exists = db.scalar(
        select(User).where(User.tenant_id == current.tenant_id, User.email == email)
    )
    if exists:
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already in use in this business")
    _validate_resource(db, current.tenant_id, payload.resource_id)

    user = User(
        tenant_id=current.tenant_id,
        name=payload.name,
        email=email,
        password_hash=hash_password(payload.password),
        role=payload.role,
        resource_id=payload.resource_id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.put("/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    payload: UserUpdate,
    db: Session = Depends(get_db),
    current: User = Depends(require_owner),
) -> User:
    user = _get_owned(db, user_id, current.tenant_id)
    data = payload.model_dump(exclude_unset=True)
    if "resource_id" in data:
        _validate_resource(db, current.tenant_id, data["resource_id"])

    # Guard: never leave the business without an active owner.
    demoting = "role" in data and data["role"] != UserRole.owner and user.role == UserRole.owner
    deactivating = data.get("active") is False and user.role == UserRole.owner
    if (demoting or deactivating) and _active_owner_count(
        db, current.tenant_id, exclude_id=user.id
    ) == 0:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "The business must keep at least one active owner"
        )

    if "password" in data:
        user.password_hash = hash_password(data.pop("password"))
    for field, value in data.items():
        setattr(user, field, value)
    db.commit()
    db.refresh(user)
    return user


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def deactivate_user(
    user_id: int,
    db: Session = Depends(get_db),
    current: User = Depends(require_owner),
) -> None:
    user = _get_owned(db, user_id, current.tenant_id)
    if user.id == current.id:
        raise HTTPException(status.HTTP_409_CONFLICT, "You cannot deactivate your own account")
    if user.role == UserRole.owner and _active_owner_count(
        db, current.tenant_id, exclude_id=user.id
    ) == 0:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "The business must keep at least one active owner"
        )
    user.active = False
    db.commit()
