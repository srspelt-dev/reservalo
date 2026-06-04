import enum
import secrets
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class BookingStatus(str, enum.Enum):
    pending = "pending"
    confirmed = "confirmed"
    cancelled = "cancelled"
    completed = "completed"


class PaymentMethod(str, enum.Enum):
    cash = "cash"          # pago en el local
    transfer = "transfer"  # transferencia / alias / billetera


class PaymentStatus(str, enum.Enum):
    pending = "pending"
    paid = "paid"


def generate_public_code() -> str:
    """Unguessable token used by clients to manage their own booking without login."""
    return secrets.token_urlsafe(9)


class Booking(Base):
    __tablename__ = "bookings"

    id: Mapped[int] = mapped_column(primary_key=True)
    public_code: Mapped[str] = mapped_column(
        String(32), default=generate_public_code, unique=True, index=True, nullable=False
    )
    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), index=True, nullable=False
    )
    # Nullable: event-mode bookings have no service (packages define the offering).
    service_id: Mapped[int | None] = mapped_column(
        ForeignKey("services.id", ondelete="RESTRICT"), index=True, nullable=True
    )
    resource_id: Mapped[int] = mapped_column(
        ForeignKey("resources.id", ondelete="RESTRICT"), index=True, nullable=False
    )
    client_name: Mapped[str] = mapped_column(String(255), nullable=False)
    client_phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    client_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    start_datetime: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_datetime: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[BookingStatus] = mapped_column(
        SAEnum(BookingStatus, name="booking_status"), default=BookingStatus.pending, nullable=False
    )
    payment_method: Mapped[PaymentMethod | None] = mapped_column(
        SAEnum(PaymentMethod, name="payment_method"), nullable=True
    )
    payment_status: Mapped[PaymentStatus] = mapped_column(
        SAEnum(PaymentStatus, name="payment_status"),
        default=PaymentStatus.pending,
        nullable=False,
    )
    # Relative URL of an uploaded transfer receipt (served by the API under /uploads).
    payment_proof_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    # Discount applied via a coupon code at booking time.
    coupon_code: Mapped[str | None] = mapped_column(String(40), nullable=True)
    discount_percent: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    # Set when the automatic "24h before" reminder has been sent (prevents duplicates).
    reminder_sent_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    tenant: Mapped["Tenant"] = relationship(back_populates="bookings")  # noqa: F821
    service: Mapped["Service"] = relationship()  # noqa: F821
    resource: Mapped["Resource"] = relationship()  # noqa: F821
    packages: Mapped[list["Package"]] = relationship(  # noqa: F821
        secondary="booking_packages"
    )

    @property
    def package_ids(self) -> list[int]:
        return [p.id for p in self.packages]

    @property
    def total_price(self) -> float:
        base = float(self.service.price) if self.service else 0.0
        subtotal = base + sum(float(p.price) for p in self.packages)
        return round(subtotal * (1 - (self.discount_percent or 0) / 100), 2)
