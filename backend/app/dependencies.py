from collections.abc import Callable

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User, UserRole
from app.security import ACCESS, decode_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

_CREDENTIALS_EXC = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Could not validate credentials",
    headers={"WWW-Authenticate": "Bearer"},
)


def get_current_user(
    token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)
) -> User:
    try:
        payload = decode_token(token, expected_type=ACCESS)
        user_id = int(payload["sub"])
        token_version = int(payload["tv"])
    except (JWTError, KeyError, ValueError):
        raise _CREDENTIALS_EXC

    user = db.get(User, user_id)
    if user is None or not user.active:
        raise _CREDENTIALS_EXC
    if token_version != user.token_version:  # token was revoked (logout)
        raise _CREDENTIALS_EXC
    if not user.tenant or not user.tenant.active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant inactive")
    return user


def require_roles(*roles: UserRole) -> Callable[[User], User]:
    """Dependency factory that enforces the current user has one of the given roles."""

    def checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions for this action",
            )
        return current_user

    return checker


# Convenience dependencies
require_owner = require_roles(UserRole.owner)
require_staff = require_roles(UserRole.owner, UserRole.staff)
