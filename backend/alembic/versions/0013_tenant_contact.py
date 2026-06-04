"""tenant whatsapp + location_url

Revision ID: 0013
Revises: 0012
Create Date: 2026-06-01

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0013"
down_revision: str | None = "0012"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("tenants", sa.Column("whatsapp", sa.String(30), nullable=True))
    op.add_column("tenants", sa.Column("location_url", sa.String(500), nullable=True))


def downgrade() -> None:
    op.drop_column("tenants", "location_url")
    op.drop_column("tenants", "whatsapp")
