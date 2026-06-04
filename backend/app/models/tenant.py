from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Tenant(Base):
    __tablename__ = "tenants"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(120), unique=True, index=True, nullable=False)
    # IANA timezone (e.g. "America/Asuncion"). All booking times are interpreted in it.
    timezone: Mapped[str] = mapped_column(String(64), default="America/Asuncion", nullable=False)
    plan: Mapped[str] = mapped_column(String(50), default="free", nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # Branding for the public booking page
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    logo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    brand_color: Mapped[str] = mapped_column(String(9), default="#2563eb", nullable=False)
    # Contact / link-in-bio actions for the public page
    whatsapp: Mapped[str | None] = mapped_column(String(30), nullable=True)
    location_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    # Gallery of photo URLs shown on the public presentation page.
    photos: Mapped[list[str]] = mapped_column(JSON, default=list, server_default="[]", nullable=False)

    # Payment configuration (no gateway — alias/transfer + pay-at-venue)
    accept_cash: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    accept_transfer: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    payment_alias: Mapped[str | None] = mapped_column(String(255), nullable=True)
    payment_instructions: Mapped[str | None] = mapped_column(Text, nullable=True)
    # 0 = no deposit / pay full; 1-100 = percent of the service price required up front.
    deposit_percent: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Booking rules
    buffer_minutes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    min_advance_minutes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    max_advance_days: Mapped[int] = mapped_column(Integer, default=60, nullable=False)

    # Booking mode: "appointments" (services) or "events" (packages, fixed duration)
    booking_mode: Mapped[str] = mapped_column(String(20), default="appointments", nullable=False)
    event_duration_minutes: Mapped[int] = mapped_column(Integer, default=240, nullable=False)

    users: Mapped[list["User"]] = relationship(back_populates="tenant", cascade="all, delete-orphan")  # noqa: F821
    services: Mapped[list["Service"]] = relationship(back_populates="tenant", cascade="all, delete-orphan")  # noqa: F821
    resources: Mapped[list["Resource"]] = relationship(back_populates="tenant", cascade="all, delete-orphan")  # noqa: F821
    bookings: Mapped[list["Booking"]] = relationship(back_populates="tenant", cascade="all, delete-orphan")  # noqa: F821
