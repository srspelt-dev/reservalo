"""payments and branding

Revision ID: 0004
Revises: 0003
Create Date: 2026-06-01

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

payment_method = sa.Enum("cash", "transfer", name="payment_method")
payment_status = sa.Enum("pending", "paid", name="payment_status")


def upgrade() -> None:
    # Tenant: branding
    op.add_column("tenants", sa.Column("description", sa.Text(), nullable=True))
    op.add_column("tenants", sa.Column("logo_url", sa.String(500), nullable=True))
    op.add_column(
        "tenants",
        sa.Column("brand_color", sa.String(9), nullable=False, server_default="#2563eb"),
    )
    # Tenant: payments
    op.add_column(
        "tenants",
        sa.Column("accept_cash", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.add_column(
        "tenants",
        sa.Column("accept_transfer", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column("tenants", sa.Column("payment_alias", sa.String(255), nullable=True))
    op.add_column("tenants", sa.Column("payment_instructions", sa.Text(), nullable=True))
    op.add_column(
        "tenants",
        sa.Column("deposit_percent", sa.Integer(), nullable=False, server_default="0"),
    )

    # Booking: payment tracking
    bind = op.get_bind()
    payment_method.create(bind, checkfirst=True)
    payment_status.create(bind, checkfirst=True)
    op.add_column("bookings", sa.Column("payment_method", payment_method, nullable=True))
    op.add_column(
        "bookings",
        sa.Column("payment_status", payment_status, nullable=False, server_default="pending"),
    )


def downgrade() -> None:
    op.drop_column("bookings", "payment_status")
    op.drop_column("bookings", "payment_method")
    payment_status.drop(op.get_bind(), checkfirst=True)
    payment_method.drop(op.get_bind(), checkfirst=True)
    for col in (
        "deposit_percent",
        "payment_instructions",
        "payment_alias",
        "accept_transfer",
        "accept_cash",
        "brand_color",
        "logo_url",
        "description",
    ):
        op.drop_column("tenants", col)
