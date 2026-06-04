from datetime import datetime
from zoneinfo import ZoneInfo, available_timezones

from pydantic import BaseModel, ConfigDict, Field, field_validator


def validate_timezone(value: str | None) -> str | None:
    if value is None:
        return None
    try:
        ZoneInfo(value)
    except Exception:  # noqa: BLE001
        raise ValueError("Invalid IANA timezone")
    return value


# Cached set used only to expose suggestions; validation uses ZoneInfo directly.
KNOWN_TIMEZONES = sorted(available_timezones())


class TenantOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    slug: str
    timezone: str
    plan: str
    active: bool
    created_at: datetime
    # Branding
    description: str | None
    logo_url: str | None
    brand_color: str
    whatsapp: str | None
    location_url: str | None
    photos: list[str]
    promo_image_url: str | None
    promo_title: str | None
    # Payments
    accept_cash: bool
    accept_transfer: bool
    payment_alias: str | None
    payment_instructions: str | None
    deposit_percent: int
    # Booking rules
    buffer_minutes: int
    min_advance_minutes: int
    max_advance_days: int
    booking_mode: str
    event_duration_minutes: int


class TenantUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=255)
    timezone: str | None = Field(default=None, max_length=64)
    plan: str | None = Field(default=None, max_length=50)
    description: str | None = None
    logo_url: str | None = Field(default=None, max_length=500)
    brand_color: str | None = Field(default=None, pattern=r"^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")
    whatsapp: str | None = Field(default=None, max_length=30)
    location_url: str | None = Field(default=None, max_length=500)
    photos: list[str] | None = Field(default=None, max_length=12)
    promo_image_url: str | None = Field(default=None, max_length=500)
    promo_title: str | None = Field(default=None, max_length=255)
    accept_cash: bool | None = None
    accept_transfer: bool | None = None
    payment_alias: str | None = Field(default=None, max_length=255)
    payment_instructions: str | None = None
    deposit_percent: int | None = Field(default=None, ge=0, le=100)
    buffer_minutes: int | None = Field(default=None, ge=0, le=240)
    min_advance_minutes: int | None = Field(default=None, ge=0, le=60 * 24 * 30)
    max_advance_days: int | None = Field(default=None, ge=1, le=365)
    booking_mode: str | None = Field(default=None, pattern=r"^(appointments|events)$")
    event_duration_minutes: int | None = Field(default=None, ge=15, le=60 * 24)

    _check_tz = field_validator("timezone")(validate_timezone)
