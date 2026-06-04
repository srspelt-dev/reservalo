"""add booking public_code

Revision ID: 0003
Revises: 0002
Create Date: 2026-06-01

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # server_default backfills any existing rows with a unique random value;
    # new rows get their value from the application-side default.
    op.add_column(
        "bookings",
        sa.Column(
            "public_code",
            sa.String(32),
            nullable=False,
            server_default=sa.text("md5(random()::text)"),
        ),
    )
    op.create_unique_constraint("uq_bookings_public_code", "bookings", ["public_code"])
    op.create_index("ix_bookings_public_code", "bookings", ["public_code"])
    # Drop the server default so application code is the source of truth going forward.
    op.alter_column("bookings", "public_code", server_default=None)


def downgrade() -> None:
    op.drop_index("ix_bookings_public_code", table_name="bookings")
    op.drop_constraint("uq_bookings_public_code", "bookings", type_="unique")
    op.drop_column("bookings", "public_code")
