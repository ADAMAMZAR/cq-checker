"""users table, real FKs, numeric cost columns

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-08-04

Fixes from the ERD review:
  1. Add `users` table.
  2. Real FKs: chat_messages.session_id -> chat_sessions.session_id,
     document_evidence.audit_id -> audit_logs.audit_id.
  3. cost_usd / comparison_cost_usd / total_run_cost_usd -> NUMERIC(12,6)
     so fractional USD costs are not truncated.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


# revision identifiers, used by Alembic.
revision: str = 'c3d4e5f6a7b8'
down_revision: Union[str, Sequence[str], None] = 'b2c3d4e5f6a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # ── Users ───────────────────────────────────────────────────────────
    op.create_table(
        "users",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("display_name", sa.String(255), nullable=True),
        sa.Column("role", sa.String(50), nullable=False, server_default="employee"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    # ── chat_sessions.user_id -> users.id ────────────────────────────────
    op.add_column("chat_sessions", sa.Column("user_id", UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        "fk_chat_sessions_user_id",
        "chat_sessions", "users",
        ["user_id"], ["id"],
        ondelete="SET NULL",
    )

    # ── Real FKs ─────────────────────────────────────────────────────────
    # chat_messages.session_id -> chat_sessions.session_id (session_id is UNIQUE)
    op.create_foreign_key(
        "fk_chat_messages_session_id",
        "chat_messages", "chat_sessions",
        ["session_id"], ["session_id"],
        ondelete="CASCADE",
    )

    # document_evidence.audit_id -> audit_logs.audit_id (audit_id is UNIQUE)
    op.create_foreign_key(
        "fk_document_evidence_audit_id",
        "document_evidence", "audit_logs",
        ["audit_id"], ["audit_id"],
        ondelete="CASCADE",
    )

    # ── cost columns -> NUMERIC(12,6) ────────────────────────────────────
    op.alter_column("chat_logs", "cost_usd", type_=sa.Numeric(12, 6), existing_type=sa.Integer, existing_nullable=False)
    op.alter_column("audit_logs", "comparison_cost_usd", type_=sa.Numeric(12, 6), existing_type=sa.Integer, existing_nullable=False)
    op.alter_column("audit_logs", "total_run_cost_usd", type_=sa.Numeric(12, 6), existing_type=sa.Integer, existing_nullable=False)
    op.alter_column("document_evidence", "cost_usd", type_=sa.Numeric(12, 6), existing_type=sa.Integer, existing_nullable=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.alter_column("document_evidence", "cost_usd", type_=sa.Integer, existing_type=sa.Numeric(12, 6), existing_nullable=False)
    op.alter_column("audit_logs", "total_run_cost_usd", type_=sa.Integer, existing_type=sa.Numeric(12, 6), existing_nullable=False)
    op.alter_column("audit_logs", "comparison_cost_usd", type_=sa.Integer, existing_type=sa.Numeric(12, 6), existing_nullable=False)
    op.alter_column("chat_logs", "cost_usd", type_=sa.Integer, existing_type=sa.Numeric(12, 6), existing_nullable=False)

    op.drop_constraint("fk_document_evidence_audit_id", "document_evidence", type_="foreignkey")
    op.drop_constraint("fk_chat_messages_session_id", "chat_messages", type_="foreignkey")
    op.drop_constraint("fk_chat_sessions_user_id", "chat_sessions", type_="foreignkey")
    op.drop_column("chat_sessions", "user_id")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
