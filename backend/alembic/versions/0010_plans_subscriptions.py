"""plans, features, subscriptions

Revision ID: 0010
Revises: 0009
Create Date: 2026-06-01

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0010"
down_revision: str | None = "0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

sub_status = sa.Enum("active", "trialing", "past_due", "cancelled", name="subscription_status")


def upgrade() -> None:
    op.create_table(
        "plans",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("code", sa.String(32), nullable=False),
        sa.Column("name", sa.String(64), nullable=False),
        sa.Column("price", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("max_resources", sa.Integer(), nullable=True),
        sa.Column("max_services", sa.Integer(), nullable=True),
        sa.Column("max_bookings_per_month", sa.Integer(), nullable=True),
        sa.Column("max_users", sa.Integer(), nullable=True),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.UniqueConstraint("code", name="uq_plans_code"),
    )
    op.create_index("ix_plans_code", "plans", ["code"])

    op.create_table(
        "features",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("code", sa.String(64), nullable=False),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.UniqueConstraint("code", name="uq_features_code"),
    )
    op.create_index("ix_features_code", "features", ["code"])

    op.create_table(
        "plan_features",
        sa.Column("plan_id", sa.Integer(), sa.ForeignKey("plans.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("feature_id", sa.Integer(), sa.ForeignKey("features.id", ondelete="CASCADE"), primary_key=True),
    )

    op.create_table(
        "subscriptions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("plan_id", sa.Integer(), sa.ForeignKey("plans.id"), nullable=False),
        sa.Column("status", sub_status, nullable=False, server_default="active"),
        sa.Column("current_period_end", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("tenant_id", name="uq_subscription_tenant"),
    )
    op.create_index("ix_subscriptions_tenant_id", "subscriptions", ["tenant_id"])

    # --- Seed plans -----------------------------------------------------------
    op.execute(
        """
        INSERT INTO plans (code, name, price, max_resources, max_services, max_bookings_per_month, max_users, active, sort_order) VALUES
        ('free',       'Free',       0,      1,    1,    20,   1,    true, 1),
        ('pro',        'Pro',        99000,  3,    NULL, NULL, 1,    true, 2),
        ('business',   'Business',   199000, 10,   NULL, NULL, NULL, true, 3),
        ('enterprise', 'Enterprise', 399000, NULL, NULL, NULL, NULL, true, 4)
        """
    )
    op.execute(
        """
        INSERT INTO features (code, name, description) VALUES
        ('full_calendar',      'Calendario completo',   'Vistas día, semana y mes con gestión avanzada'),
        ('custom_branding',    'Personalización',       'Logo, color de marca y descripción en la página pública'),
        ('whatsapp_reminders', 'Recordatorios WhatsApp','Recordatorios automáticos por WhatsApp'),
        ('advanced_reports',   'Reportes avanzados',    'Ingresos, ocupación y métricas'),
        ('priority_support',   'Soporte prioritario',   'Atención prioritaria'),
        ('multi_branch',       'Sucursales',            'Múltiples sucursales'),
        ('api_access',         'Acceso API',            'API e integraciones'),
        ('ai_assistant',       'Asistente IA',          'Asistente con IA')
        """
    )

    def link(plan_code: str, feature_codes: list[str]) -> None:
        codes = ", ".join(f"'{c}'" for c in feature_codes)
        op.execute(
            f"""
            INSERT INTO plan_features (plan_id, feature_id)
            SELECT p.id, f.id FROM plans p, features f
            WHERE p.code = '{plan_code}' AND f.code IN ({codes})
            """
        )

    link("pro", ["full_calendar", "custom_branding"])
    link("business", ["full_calendar", "custom_branding", "whatsapp_reminders", "advanced_reports", "priority_support"])
    link("enterprise", [
        "full_calendar", "custom_branding", "whatsapp_reminders", "advanced_reports",
        "priority_support", "multi_branch", "api_access", "ai_assistant",
    ])

    # Every existing tenant starts on Free.
    op.execute(
        """
        INSERT INTO subscriptions (tenant_id, plan_id, status, created_at)
        SELECT t.id, (SELECT id FROM plans WHERE code = 'free'), 'active', now()
        FROM tenants t
        """
    )


def downgrade() -> None:
    op.drop_table("subscriptions")
    sub_status.drop(op.get_bind(), checkfirst=True)
    op.drop_table("plan_features")
    op.drop_index("ix_features_code", table_name="features")
    op.drop_table("features")
    op.drop_index("ix_plans_code", table_name="plans")
    op.drop_table("plans")
