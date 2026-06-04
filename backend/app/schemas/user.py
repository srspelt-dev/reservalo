from pydantic import BaseModel, EmailStr, Field, field_validator

from app.models import UserRole


def _staff_or_owner(value: UserRole | None) -> UserRole | None:
    # Panel users are owners or staff; "client" is not a real login account here.
    if value is not None and value not in (UserRole.owner, UserRole.staff):
        raise ValueError("Role must be 'owner' or 'staff'")
    return value


class UserCreate(BaseModel):
    name: str = Field(min_length=2, max_length=255)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    role: UserRole = UserRole.staff

    _check_role = field_validator("role")(_staff_or_owner)


class UserUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=255)
    role: UserRole | None = None
    active: bool | None = None
    password: str | None = Field(default=None, min_length=8, max_length=128)

    _check_role = field_validator("role")(_staff_or_owner)
