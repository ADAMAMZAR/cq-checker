"""drop redundant file_url hash columns

Revision ID: o5h6i7j8k9l0
Revises: n4g5h6i7j8k9
Create Date: 2026-08-11 08:40:00.000000

Drops redundant file_url and file_hash columns from documents, certificate_verifications,
and document_evidence tables for full 3NF normalization.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'o5h6i7j8k9l0'
down_revision: Union[str, Sequence[str], None] = 'n4g5h6i7j8k9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Drop indexes if present
    op.drop_index("ix_documents_file_hash", table_name="documents", if_exists=True)
    op.drop_index("ix_certificate_verifications_file_hash", table_name="certificate_verifications", if_exists=True)

    # 2. Drop columns
    op.drop_column("documents", "file_url")
    op.drop_column("documents", "file_hash")

    op.drop_column("certificate_verifications", "file_url")
    op.drop_column("certificate_verifications", "file_hash")

    op.drop_column("document_evidence", "file_url")
    op.drop_column("document_evidence", "file_hash")


def downgrade() -> None:
    op.add_column("document_evidence", sa.Column("file_url", sa.Text(), nullable=True))
    op.add_column("document_evidence", sa.Column("file_hash", sa.String(length=64), nullable=True))

    op.add_column("certificate_verifications", sa.Column("file_hash", sa.String(length=64), nullable=True))
    op.add_column("certificate_verifications", sa.Column("file_url", sa.Text(), nullable=True))

    op.add_column("documents", sa.Column("file_hash", sa.String(length=64), nullable=True))
    op.add_column("documents", sa.Column("file_url", sa.Text(), nullable=True))

    op.create_index("ix_certificate_verifications_file_hash", "certificate_verifications", ["file_hash"], unique=True)
    op.create_index("ix_documents_file_hash", "documents", ["file_hash"], unique=True)
