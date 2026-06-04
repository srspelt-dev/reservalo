from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Coupon(Base):
    """A percentage discount code a client can apply when booking."""

    __tablename__ = "coupons"
    __table_args__ = (UniqueConstraint("tenant_id", "code", name="uq_coupon_tenant_code"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), index=True, nullable=False
    )
    code: Mapped[str] = mapped_column(String(40), nullable=False)  # stored uppercase
    percent: Mapped[int] = mapped_column(Integer, nullable=False)  # 1–100
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
