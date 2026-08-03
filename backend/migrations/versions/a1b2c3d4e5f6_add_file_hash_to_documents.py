"""add file_hash to documents

Revision ID: a1b2c3d4e5f6
Revises: d24c6dbb2fb0
Create Date: 2026-07-31

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = 'd24c6dbb2fb0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("documents", sa.Column("file_hash", sa.String(64), nullable=True))
    op.create_index("ix_documents_file_hash", "documents", ["file_hash"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_documents_file_hash", table_name="documents")
    op.drop_column("documents", "file_hash")
