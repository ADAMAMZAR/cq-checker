"""add roles, features, user_roles, role_features tables

Revision ID: r8s9t0u1v2w3
Revises: q7r8s9t0u1v2
Create Date: 2026-08-19

Creates RBAC tables for role-based feature access control:
  1. `roles`: system roles (platform_admin, category_manager, gpo_analyst, gpo_lead, viewer).
  2. `features`: registered feature modules and routes.
  3. `user_roles`: user to role assignments.
  4. `role_features`: role to feature permissions mapping.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

# revision identifiers, used by Alembic.
revision: str = 'r8s9t0u1v2w3'
down_revision: Union[str, Sequence[str], None] = 'q7r8s9t0u1v2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── Roles ───────────────────────────────────────────────────────────
    op.create_table(
        "roles",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("name", sa.String(50), nullable=False, unique=True),
        sa.Column("display_name", sa.String(100), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
    )
    op.create_index("ix_roles_name", "roles", ["name"], unique=True)

    # ── Features ────────────────────────────────────────────────────────
    op.create_table(
        "features",
        sa.Column("id", sa.String(50), primary_key=True),
        sa.Column("display_name", sa.String(100), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("route_path", sa.String(200), nullable=True),
        sa.Column("is_external", sa.String(1), nullable=False, server_default="0"),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
    )

    # ── User Roles ──────────────────────────────────────────────────────
    op.create_table(
        "user_roles",
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("role_id", UUID(as_uuid=True), sa.ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("granted_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ── Role Features ───────────────────────────────────────────────────
    op.create_table(
        "role_features",
        sa.Column("role_id", UUID(as_uuid=True), sa.ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("feature_id", sa.String(50), sa.ForeignKey("features.id", ondelete="CASCADE"), primary_key=True),
    )


def downgrade() -> None:
    op.drop_table("role_features")
    op.drop_table("user_roles")
    op.drop_table("features")
    op.drop_index("ix_roles_name", table_name="roles")
    op.drop_table("roles")
