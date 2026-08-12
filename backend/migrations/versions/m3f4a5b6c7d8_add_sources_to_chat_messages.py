"""add sources to chat_messages

Revision ID: m3f4a5b6c7d8
Revises: l2f3a4b5c6d7
Create Date: 2026-08-10 10:36:00.000000

Adds sources JSONB column to chat_messages table to persist source references
for chat history reloads.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

# revision identifiers, used by Alembic.
revision: str = 'm3f4a5b6c7d8'
down_revision: Union[str, Sequence[str], None] = 'l2f3a4b5c6d7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("chat_messages", sa.Column("sources", JSONB, nullable=True))


def downgrade() -> None:
    op.drop_column("chat_messages", "sources")
