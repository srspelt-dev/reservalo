"""tenant booking mode (appointments/events) + nullable service on bookings

Revision ID: 0012
Revises: 0011
Create Date: 2026-06-01

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0012"
down_revision: str | None = "0011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "tenants",
        sa.Column("booking_mode", sa.String(20), nullable=False, server_default="appointments"),
    )
    op.add_column(
        "tenants",
        sa.Column("event_duration_minutes", sa.Integer(), nullable=False, server_default="240"),
    )
    op.alter_column("bookings", "service_id", existing_type=sa.Integer(), nullable=True)


def downgrade() -> None:
    op.alter_column("bookings", "service_id", existing_type=sa.Integer(), nullable=False)
    op.drop_column("tenants", "event_duration_minutes")
    op.drop_column("tenants", "booking_mode")
