"""prevent overlapping bookings per resource (DB-level guard)

Revision ID: 0006
Revises: 0005
Create Date: 2026-06-01

"""
from collections.abc import Sequence

from alembic import op

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # btree_gist lets us combine the equality on resource_id with the range overlap.
    op.execute("CREATE EXTENSION IF NOT EXISTS btree_gist")
    op.execute(
        """
        ALTER TABLE bookings
        ADD CONSTRAINT no_overlap_per_resource
        EXCLUDE USING gist (
            resource_id WITH =,
            tstzrange(start_datetime, end_datetime) WITH &&
        )
        WHERE (status IN ('pending', 'confirmed', 'completed'))
        """
    )


def downgrade() -> None:
    op.execute("ALTER TABLE bookings DROP CONSTRAINT IF EXISTS no_overlap_per_resource")
