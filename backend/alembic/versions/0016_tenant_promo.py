"""tenant promo pop-up fields

Revision ID: 0016
Revises: 0015
Create Date: 2026-06-04

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0016"
down_revision: str | None = "0015"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("tenants", sa.Column("promo_image_url", sa.String(500), nullable=True))
    op.add_column("tenants", sa.Column("promo_title", sa.String(255), nullable=True))


def downgrade() -> None:
    op.drop_column("tenants", "promo_title")
    op.drop_column("tenants", "promo_image_url")
