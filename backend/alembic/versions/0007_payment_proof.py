"""add booking payment_proof_url

Revision ID: 0007
Revises: 0006
Create Date: 2026-06-01

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("bookings", sa.Column("payment_proof_url", sa.String(500), nullable=True))


def downgrade() -> None:
    op.drop_column("bookings", "payment_proof_url")
