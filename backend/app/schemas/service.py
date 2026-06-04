from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class ServiceBase(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    duration_minutes: int = Field(gt=0, le=24 * 60)
    price: Decimal = Field(default=Decimal("0"), ge=0, max_digits=10, decimal_places=2)
    active: bool = True


class ServiceCreate(ServiceBase):
    # Resources allowed to perform this service. Empty = any resource.
    resource_ids: list[int] = Field(default_factory=list)


class ServiceUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    duration_minutes: int | None = Field(default=None, gt=0, le=24 * 60)
    price: Decimal | None = Field(default=None, ge=0, max_digits=10, decimal_places=2)
    active: bool | None = None
    resource_ids: list[int] | None = None


class ServiceOut(ServiceBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tenant_id: int
    created_at: datetime
    resource_ids: list[int] = Field(default_factory=list)
