"""object_storage metadata table

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-08-04

Fixes from the ERD review:
  5. Object-storage / file-metadata table (bucket, object key, size, mime,
     checksum) so Phase 8 GCS migration can map old URLs -> new GCS URLs.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


# revision identifiers, used by Alembic.
revision: str = 'e5f6a7b8c9d0'
down_revision: Union[str, Sequence[str], None] = 'd4e5f6a7b8c9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "object_storage",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("file_url", sa.Text, nullable=False),
        sa.Column("bucket", sa.String(255), nullable=True),
        sa.Column("object_key", sa.Text, nullable=True),
        sa.Column("content_type", sa.String(100), nullable=True),
        sa.Column("size_bytes", sa.Integer, nullable=True),
        sa.Column("checksum", sa.String(64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_object_storage_file_url", "object_storage", ["file_url"], unique=True)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_object_storage_file_url", table_name="object_storage")
    op.drop_table("object_storage")
