"""schedule exceptions, service-resource mapping, booking rules

Revision ID: 0009
Revises: 0008
Create Date: 2026-06-01

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0009"
down_revision: str | None = "0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Per-resource date exceptions (holidays / vacation / custom hours)
    op.create_table(
        "schedule_exceptions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "resource_id",
            sa.Integer(),
            sa.ForeignKey("resources.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("is_closed", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("start_time", sa.Time(), nullable=True),
        sa.Column("end_time", sa.Time(), nullable=True),
        sa.UniqueConstraint("resource_id", "date", name="uq_exception_resource_date"),
    )
    op.create_index(
        "ix_schedule_exceptions_resource_id", "schedule_exceptions", ["resource_id"]
    )

    # Service <-> Resource mapping
    op.create_table(
        "service_resources",
        sa.Column(
            "service_id",
            sa.Integer(),
            sa.ForeignKey("services.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "resource_id",
            sa.Integer(),
            sa.ForeignKey("resources.id", ondelete="CASCADE"),
            primary_key=True,
        ),
    )

    # Tenant booking rules
    op.add_column(
        "tenants", sa.Column("buffer_minutes", sa.Integer(), nullable=False, server_default="0")
    )
    op.add_column(
        "tenants",
        sa.Column("min_advance_minutes", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "tenants",
        sa.Column("max_advance_days", sa.Integer(), nullable=False, server_default="60"),
    )


def downgrade() -> None:
    op.drop_column("tenants", "max_advance_days")
    op.drop_column("tenants", "min_advance_minutes")
    op.drop_column("tenants", "buffer_minutes")
    op.drop_table("service_resources")
    op.drop_index("ix_schedule_exceptions_resource_id", table_name="schedule_exceptions")
    op.drop_table("schedule_exceptions")
