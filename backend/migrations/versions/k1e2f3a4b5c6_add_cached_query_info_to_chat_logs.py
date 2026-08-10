"""add cached query info to chat logs

Revision ID: k1e2f3a4b5c6
Revises: j0d1e2f3a4b5
Create Date: 2026-08-10 10:00:00.000000

Adds cached_query_id (FK to query_cache.id) and cached_query_text to chat_logs
to record which exact cache entry was matched on a cache hit.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

# revision identifiers, used by Alembic.
revision: str = 'k1e2f3a4b5c6'
down_revision: Union[str, Sequence[str], None] = 'j0d1e2f3a4b5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("chat_logs", sa.Column("cached_query_id", UUID(as_uuid=True), sa.ForeignKey("query_cache.id", ondelete="SET NULL"), nullable=True))
    op.add_column("chat_logs", sa.Column("cached_query_text", sa.Text(), nullable=True))
    op.create_index("ix_chat_logs_cached_query_id", "chat_logs", ["cached_query_id"])


def downgrade() -> None:
    op.drop_index("ix_chat_logs_cached_query_id", table_name="chat_logs")
    op.drop_column("chat_logs", "cached_query_text")
    op.drop_column("chat_logs", "cached_query_id")
