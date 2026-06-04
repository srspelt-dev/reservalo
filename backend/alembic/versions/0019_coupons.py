"""coupons + booking discount

Revision ID: 0019
Revises: 0018
Create Date: 2026-06-04

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0019"
down_revision: str | None = "0018"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "coupons",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(40), nullable=False),
        sa.Column("percent", sa.Integer(), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "code", name="uq_coupon_tenant_code"),
    )
    op.create_index("ix_coupons_tenant_id", "coupons", ["tenant_id"])
    op.add_column("bookings", sa.Column("coupon_code", sa.String(40), nullable=True))
    op.add_column(
        "bookings",
        sa.Column("discount_percent", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("bookings", "discount_percent")
    op.drop_column("bookings", "coupon_code")
    op.drop_index("ix_coupons_tenant_id", table_name="coupons")
    op.drop_table("coupons")
