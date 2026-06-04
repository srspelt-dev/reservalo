"""staff user → resource link

Revision ID: 0015
Revises: 0014
Create Date: 2026-06-04

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0015"
down_revision: str | None = "0014"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("resource_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_users_resource_id",
        "users",
        "resources",
        ["resource_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_users_resource_id", "users", type_="foreignkey")
    op.drop_column("users", "resource_id")
