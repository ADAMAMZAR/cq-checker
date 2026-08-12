"""refactor to hybrid page rag

Revision ID: i9c0d1e2f3a4
Revises: 4fd6750eb72c
Create Date: 2026-08-10 08:25:00.000000

Refactors RAG storage from parent_chunks / child_chunks to document_pages:
* Drop child_chunks table and indexes
* Drop parent_chunks table and indexes
* Create document_pages table with vector(1536) embedding + tsvector full-text search
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, TSVECTOR
from pgvector.sqlalchemy import Vector

# revision identifiers, used by Alembic.
revision: str = 'i9c0d1e2f3a4'
down_revision: Union[str, Sequence[str], None] = '7a74f51df5b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Drop child_chunks and parent_chunks tables safely
    op.execute("DROP TABLE IF EXISTS child_chunks CASCADE")
    op.execute("DROP TABLE IF EXISTS parent_chunks CASCADE")

    # 2. Create document_pages table
    op.create_table(
        "document_pages",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("document_id", UUID(as_uuid=True), sa.ForeignKey("documents.id", ondelete="CASCADE"), nullable=False),
        sa.Column("page_number", sa.Integer(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("embedding", Vector(1536), nullable=True),
        sa.Column("tsv_content", TSVECTOR, sa.Computed("to_tsvector('english', content)"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.UniqueConstraint("document_id", "page_number", name="uq_document_pages_doc_page"),
    )

    # 3. Create indexes
    op.create_index("ix_document_pages_document_id", "document_pages", ["document_id"])
    op.execute("CREATE INDEX ON document_pages USING hnsw (embedding vector_cosine_ops)")
    op.execute("CREATE INDEX ON document_pages USING gin (tsv_content)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS document_pages CASCADE")

    # Recreate parent_chunks and child_chunks for rollback safety
    op.create_table(
        "parent_chunks",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("document_id", UUID(as_uuid=True), sa.ForeignKey("documents.id", ondelete="CASCADE"), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("page_number", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_parent_chunks_document_id", "parent_chunks", ["document_id"])

    op.create_table(
        "child_chunks",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("parent_id", UUID(as_uuid=True), sa.ForeignKey("parent_chunks.id", ondelete="CASCADE"), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("embedding", Vector(1536), nullable=True),
        sa.Column("tsv_content", TSVECTOR, sa.Computed("to_tsvector('english', content)"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_child_chunks_parent_id", "child_chunks", ["parent_id"])
    op.execute("CREATE INDEX ON child_chunks USING hnsw (embedding vector_cosine_ops)")
    op.execute("CREATE INDEX ON child_chunks USING gin (tsv_content)")
