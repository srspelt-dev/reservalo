from datetime import date

from sqlalchemy import Date, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class PageView(Base):
    """Daily counter of public booking-page visits, per tenant (for link metrics)."""

    __tablename__ = "page_views"
    __table_args__ = (UniqueConstraint("tenant_id", "day", name="uq_pageview_tenant_day"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), index=True, nullable=False
    )
    day: Mapped[date] = mapped_column(Date, index=True, nullable=False)
    count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
