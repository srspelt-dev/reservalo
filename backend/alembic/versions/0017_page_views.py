"""page views (link metrics)

Revision ID: 0017
Revises: 0016
Create Date: 2026-06-04

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0017"
down_revision: str | None = "0016"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "page_views",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("count", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "day", name="uq_pageview_tenant_day"),
    )
    op.create_index("ix_page_views_tenant_id", "page_views", ["tenant_id"])
    op.create_index("ix_page_views_day", "page_views", ["day"])


def downgrade() -> None:
    op.drop_index("ix_page_views_day", table_name="page_views")
    op.drop_index("ix_page_views_tenant_id", table_name="page_views")
    op.drop_table("page_views")
