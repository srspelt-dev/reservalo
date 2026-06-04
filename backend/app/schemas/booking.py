from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models import BookingStatus, PaymentMethod, PaymentStatus
from app.schemas.package import PackageOut


class BookingBase(BaseModel):
    service_id: int | None = None
    resource_id: int
    client_name: str = Field(min_length=1, max_length=255)
    client_phone: str | None = Field(default=None, max_length=50)
    client_email: EmailStr | None = None
    start_datetime: datetime
    notes: str | None = None


class BookingCreate(BookingBase):
    """end_datetime is computed from the service duration."""

    payment_method: PaymentMethod | None = None
    package_ids: list[int] = Field(default_factory=list)
    coupon_code: str | None = Field(default=None, max_length=40)


class BookingUpdate(BaseModel):
    service_id: int | None = None
    resource_id: int | None = None
    client_name: str | None = Field(default=None, min_length=1, max_length=255)
    client_phone: str | None = Field(default=None, max_length=50)
    client_email: EmailStr | None = None
    start_datetime: datetime | None = None
    notes: str | None = None
    status: BookingStatus | None = None
    payment_method: PaymentMethod | None = None
    payment_status: PaymentStatus | None = None
    package_ids: list[int] | None = None


class BookingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    public_code: str
    tenant_id: int
    service_id: int | None
    resource_id: int
    client_name: str
    client_phone: str | None
    client_email: str | None
    start_datetime: datetime
    end_datetime: datetime
    notes: str | None
    status: BookingStatus
    payment_method: PaymentMethod | None
    payment_status: PaymentStatus
    payment_proof_url: str | None
    coupon_code: str | None = None
    discount_percent: int = 0
    packages: list[PackageOut] = Field(default_factory=list)
    total_price: Decimal
    created_at: datetime
