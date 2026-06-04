from datetime import datetime, timedelta, timezone
from typing import Any

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

ACCESS = "access"
REFRESH = "refresh"
RESET = "reset"
VERIFY = "verify"


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def _create_token(subject: str | int, token_type: str, expires_delta: timedelta, **extra: Any) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(subject),
        "type": token_type,
        "iat": now,
        "exp": now + expires_delta,
        **extra,
    }
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)


def create_access_token(user_id: int, tenant_id: int, role: str, token_version: int) -> str:
    return _create_token(
        user_id,
        ACCESS,
        timedelta(minutes=settings.access_token_expire_minutes),
        tenant_id=tenant_id,
        role=role,
        tv=token_version,
    )


def create_refresh_token(user_id: int, token_version: int) -> str:
    return _create_token(
        user_id, REFRESH, timedelta(days=settings.refresh_token_expire_days), tv=token_version
    )


def create_reset_token(user_id: int) -> str:
    return _create_token(user_id, RESET, timedelta(minutes=settings.reset_token_expire_minutes))


def create_verify_token(user_id: int) -> str:
    return _create_token(user_id, VERIFY, timedelta(days=3))


def decode_token(token: str, expected_type: str | None = None) -> dict[str, Any]:
    """Decode and validate a JWT. Raises JWTError on failure or type mismatch."""
    payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
    if expected_type is not None and payload.get("type") != expected_type:
        raise JWTError("Invalid token type")
    return payload
