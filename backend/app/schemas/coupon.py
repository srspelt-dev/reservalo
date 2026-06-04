from pydantic import BaseModel, ConfigDict, Field


class CouponCreate(BaseModel):
    code: str = Field(min_length=2, max_length=40)
    percent: int = Field(ge=1, le=100)
    active: bool = True


class CouponUpdate(BaseModel):
    percent: int | None = Field(default=None, ge=1, le=100)
    active: bool | None = None


class CouponOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    code: str
    percent: int
    active: bool
