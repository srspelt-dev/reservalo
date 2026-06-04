from datetime import date, time

from sqlalchemy import Boolean, Date, ForeignKey, Time, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class ScheduleException(Base):
    """Per-resource override for a specific date.

    - is_closed=True  → the resource is closed that day (no availability).
    - is_closed=False → custom hours (start_time/end_time) replace the weekly schedule.
    """

    __tablename__ = "schedule_exceptions"
    __table_args__ = (
        UniqueConstraint("resource_id", "date", name="uq_exception_resource_date"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    resource_id: Mapped[int] = mapped_column(
        ForeignKey("resources.id", ondelete="CASCADE"), index=True, nullable=False
    )
    date: Mapped[date] = mapped_column(Date, nullable=False)
    is_closed: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    start_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    end_time: Mapped[time | None] = mapped_column(Time, nullable=True)

    resource: Mapped["Resource"] = relationship()  # noqa: F821
