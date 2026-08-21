"""sso user columns and auth_events table

Revision ID: s9t0u1v2w3x4
Revises: r8s9t0u1v2w3
Create Date: 2026-08-21

Adds SSO metadata columns to `users` and creates `auth_events` table:
  1. `users`: sso_subject, sso_provider, sso_tenant_id, last_login_at, is_active.
  2. `auth_events`: login/logout and impersonation audit trail table.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

# revision identifiers, used by Alembic.
revision: str = 's9t0u1v2w3x4'
down_revision: Union[str, Sequence[str], None] = 'r8s9t0u1v2w3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── SSO Columns on users ────────────────────────────────────────────
    op.add_column("users", sa.Column("sso_subject", sa.String(255), nullable=True))
    op.add_column("users", sa.Column("sso_provider", sa.String(50), nullable=True, server_default="entra"))
    op.add_column("users", sa.Column("sso_tenant_id", sa.String(100), nullable=True))
    op.add_column("users", sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")))

    op.create_index("ix_users_sso_subject", "users", ["sso_subject"], unique=True)

    # ── Auth Events Audit Table ─────────────────────────────────────────
    op.create_table(
        "auth_events",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("actor_user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("event_type", sa.String(50), nullable=False),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column("user_agent", sa.Text(), nullable=True),
        sa.Column("details", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_auth_events_user_id", "auth_events", ["user_id"])
    op.create_index("ix_auth_events_created_at", "auth_events", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_auth_events_created_at", table_name="auth_events")
    op.drop_index("ix_auth_events_user_id", table_name="auth_events")
    op.drop_table("auth_events")

    op.drop_index("ix_users_sso_subject", table_name="users")
    op.drop_column("users", "is_active")
    op.drop_column("users", "last_login_at")
    op.drop_column("users", "sso_tenant_id")
    op.drop_column("users", "sso_provider")
    op.drop_column("users", "sso_subject")
