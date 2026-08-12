"""add object_id fks and backfill

Revision ID: n4g5h6i7j8k9
Revises: m3f4a5b6c7d8
Create Date: 2026-08-11 08:30:00.000000

Adds object_id foreign key columns referencing object_storage.id across documents,
certificate_verifications, and document_evidence tables, with automatic data backfill.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = 'n4g5h6i7j8k9'
down_revision: Union[str, Sequence[str], None] = 'm3f4a5b6c7d8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add object_id columns with FK constraints
    op.add_column("documents", sa.Column("object_id", UUID(as_uuid=True), sa.ForeignKey("object_storage.id", ondelete="SET NULL"), nullable=True))
    op.add_column("certificate_verifications", sa.Column("object_id", UUID(as_uuid=True), sa.ForeignKey("object_storage.id", ondelete="SET NULL"), nullable=True))
    op.add_column("document_evidence", sa.Column("object_id", UUID(as_uuid=True), sa.ForeignKey("object_storage.id", ondelete="SET NULL"), nullable=True))

    op.create_index("ix_documents_object_id", "documents", ["object_id"])
    op.create_index("ix_certificate_verifications_object_id", "certificate_verifications", ["object_id"])
    op.create_index("ix_document_evidence_object_id", "document_evidence", ["object_id"])

    # 2. Backfill object_storage for existing file_urls that might not have an object_storage record
    op.execute("""
        INSERT INTO object_storage (id, file_url, object_key, created_at)
        SELECT gen_random_uuid(), file_url, file_url, now()
        FROM (
            SELECT file_url FROM documents WHERE file_url IS NOT NULL AND file_url != ''
            UNION
            SELECT file_url FROM certificate_verifications WHERE file_url IS NOT NULL AND file_url != ''
            UNION
            SELECT file_url FROM document_evidence WHERE file_url IS NOT NULL AND file_url != ''
        ) AS existing_urls
        WHERE NOT EXISTS (
            SELECT 1 FROM object_storage os WHERE os.file_url = existing_urls.file_url
        )
    """)

    # 3. Backfill object_id FK references by matching file_url
    op.execute("""
        UPDATE documents d
        SET object_id = os.id
        FROM object_storage os
        WHERE d.file_url = os.file_url AND d.object_id IS NULL;
    """)

    op.execute("""
        UPDATE certificate_verifications cv
        SET object_id = os.id
        FROM object_storage os
        WHERE cv.file_url = os.file_url AND cv.object_id IS NULL;
    """)

    op.execute("""
        UPDATE document_evidence de
        SET object_id = os.id
        FROM object_storage os
        WHERE de.file_url = os.file_url AND de.object_id IS NULL;
    """)


def downgrade() -> None:
    op.drop_index("ix_document_evidence_object_id", table_name="document_evidence")
    op.drop_index("ix_certificate_verifications_object_id", table_name="certificate_verifications")
    op.drop_index("ix_documents_object_id", table_name="documents")

    op.drop_column("document_evidence", "object_id")
    op.drop_column("certificate_verifications", "object_id")
    op.drop_column("documents", "object_id")
