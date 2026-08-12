"""add chat_feedback table

Revision ID: p6q7r8s9t0u1
Revises: o5h6i7j8k9l0
Create Date: 2026-08-12 10:00:00.000000

Adds chat_feedback table for user satisfaction ratings on chatbot responses.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = 'p6q7r8s9t0u1'
down_revision: Union[str, Sequence[str], None] = 'o5h6i7j8k9l0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "chat_feedback",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "message_id",
            UUID(as_uuid=True),
            sa.ForeignKey("chat_messages.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("session_id", sa.String(100), nullable=False, index=True),
        sa.Column("rating", sa.String(20), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
        sa.CheckConstraint(
            "rating IN ('satisfied', 'not_satisfied')",
            name="chk_chat_feedback_rating",
        ),
    )


def downgrade() -> None:
    op.drop_table("chat_feedback")
