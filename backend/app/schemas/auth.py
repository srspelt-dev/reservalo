from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.models import UserRole
from app.schemas.tenant import validate_timezone


class RegisterRequest(BaseModel):
    """Registers a new tenant (business) together with its owner user."""

    business_name: str = Field(min_length=2, max_length=255)
    slug: str = Field(min_length=2, max_length=120, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    name: str = Field(min_length=2, max_length=255)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    timezone: str = Field(default="America/Asuncion", max_length=64)
    booking_mode: str = Field(default="appointments", pattern=r"^(appointments|events)$")

    _check_tz = field_validator("timezone")(validate_timezone)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(min_length=8, max_length=128)


class VerifyEmailRequest(BaseModel):
    token: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tenant_id: int
    name: str
    email: EmailStr
    role: UserRole
    resource_id: int | None = None
    active: bool
    email_verified: bool
    created_at: datetime
