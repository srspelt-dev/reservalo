from sqlalchemy import Boolean, Column, ForeignKey, Integer, String, Table, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

# Which features each plan includes. Decouples capabilities from plan limits so new
# features can be added without touching core logic — just insert rows here.
plan_features = Table(
    "plan_features",
    Base.metadata,
    Column("plan_id", ForeignKey("plans.id", ondelete="CASCADE"), primary_key=True),
    Column("feature_id", ForeignKey("features.id", ondelete="CASCADE"), primary_key=True),
)


class Feature(Base):
    """Catalog of capabilities that can be toggled per plan."""

    __tablename__ = "features"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)


class Plan(Base):
    """A subscription tier. Limits are columns (NULL = unlimited) so they live in the
    database, never hardcoded in business logic."""

    __tablename__ = "plans"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(32), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    price: Mapped[int] = mapped_column(Integer, default=0, nullable=False)  # Gs (guaraníes)

    # Limits — NULL means unlimited
    max_resources: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_services: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_bookings_per_month: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_users: Mapped[int | None] = mapped_column(Integer, nullable=True)

    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    features: Mapped[list[Feature]] = relationship(secondary=plan_features)

    @property
    def feature_codes(self) -> list[str]:
        return [f.code for f in self.features]
