"""initial_schema

Revision ID: d24c6dbb2fb0
Revises: 
Create Date: 2026-07-31 11:01:29.435560

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB
from pgvector.sqlalchemy import Vector


# revision identifiers, used by Alembic.
revision: str = 'd24c6dbb2fb0'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # ── Extensions ──────────────────────────────────────────────────────
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")

    # ── Documents ───────────────────────────────────────────────────────
    op.create_table(
        "documents",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("file_url", sa.Text, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ── Parent Chunks ───────────────────────────────────────────────────
    op.create_table(
        "parent_chunks",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("document_id", UUID(as_uuid=True), sa.ForeignKey("documents.id", ondelete="CASCADE"), nullable=False),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("page_number", sa.Integer, nullable=True),
    )

    # ── Child Chunks ────────────────────────────────────────────────────
    op.create_table(
        "child_chunks",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("parent_id", UUID(as_uuid=True), sa.ForeignKey("parent_chunks.id", ondelete="CASCADE"), nullable=False),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("embedding", Vector(1536), nullable=True),
        sa.Column("tsv_content", sa.dialects.postgresql.TSVECTOR, sa.Computed("to_tsvector('english', content)"), nullable=False),
    )

    # ── Certificate Verifications ───────────────────────────────────────
    op.create_table(
        "certificate_verifications",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("file_url", sa.Text, nullable=False),
        sa.Column("extracted_data", JSONB, nullable=False),
        sa.Column("status", sa.String(50), nullable=False),
        sa.Column("judge_reasoning", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ── Query Cache ─────────────────────────────────────────────────────
    op.create_table(
        "query_cache",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("query_text", sa.Text, nullable=False),
        sa.Column("query_embedding", Vector(1536), nullable=True),
        sa.Column("cached_response", sa.Text, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ── Suppliers (legacy) ──────────────────────────────────────────────
    op.create_table(
        "suppliers",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("supplier_name", sa.String(255), nullable=False, unique=True),
        sa.Column("date_added", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ── Audit Logs (legacy) ─────────────────────────────────────────────
    op.create_table(
        "audit_logs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("audit_id", sa.String(100), nullable=False),
        sa.Column("supplier_id", sa.Integer, sa.ForeignKey("suppliers.id"), nullable=False),
        sa.Column("timestamp", sa.String(50), nullable=False),
        sa.Column("supplier_name", sa.String(255), nullable=False),
        sa.Column("workspace_title", sa.String(255), nullable=True, server_default="Ariba Workspace"),
        sa.Column("cert_type", sa.String(100), nullable=True, server_default="Relational evidence"),
        sa.Column("complete_qa_data_dump", sa.Text, nullable=True, server_default="[]"),
        sa.Column("compiled_extracted_data", sa.Text, nullable=False),
        sa.Column("result", sa.String(50), nullable=True, server_default="Mismatch"),
        sa.Column("expiration_date", sa.String(50), nullable=True, server_default="N/A"),
        sa.Column("suggested_comment", sa.Text, nullable=False),
        sa.Column("screenshot_url", sa.Text, nullable=True),
        sa.Column("comparison_input_tokens", sa.Integer, nullable=False, server_default="0"),
        sa.Column("comparison_output_tokens", sa.Integer, nullable=False, server_default="0"),
        sa.Column("comparison_cost_usd", sa.Integer, nullable=False, server_default="0"),
        sa.Column("total_run_cost_usd", sa.Integer, nullable=False, server_default="0"),
        sa.Column("comparison_table", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ── Document Evidence (legacy) ──────────────────────────────────────
    op.create_table(
        "document_evidence",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("audit_id", sa.String(100), nullable=False),
        sa.Column("supplier_id", sa.Integer, sa.ForeignKey("suppliers.id"), nullable=False),
        sa.Column("timestamp", sa.String(50), nullable=False),
        sa.Column("supplier_name", sa.String(255), nullable=False),
        sa.Column("filename", sa.String(500), nullable=False),
        sa.Column("ariba_question_label", sa.String(500), nullable=False),
        sa.Column("ariba_qa_answers", sa.Text, nullable=False),
        sa.Column("gemini_extracted_supplier_name", sa.Text, nullable=False),
        sa.Column("gemini_extracted_metadata", sa.Text, nullable=False),
        sa.Column("file_content_type", sa.String(100), nullable=False),
        sa.Column("input_tokens", sa.Integer, nullable=False, server_default="0"),
        sa.Column("output_tokens", sa.Integer, nullable=False, server_default="0"),
        sa.Column("cost_usd", sa.Integer, nullable=False, server_default="0"),
        sa.Column("file_hash", sa.String(64), nullable=True),
        sa.Column("file_url", sa.Text, nullable=True),
    )

    # ── Indexes ─────────────────────────────────────────────────────────
    op.create_index("ix_child_chunks_parent_id", "child_chunks", ["parent_id"])
    op.create_index("ix_parent_chunks_document_id", "parent_chunks", ["document_id"])
    op.create_index("ix_document_evidence_audit_id", "document_evidence", ["audit_id"])
    op.create_index("ix_audit_logs_audit_id", "audit_logs", ["audit_id"])
    op.create_unique_constraint("uq_audit_logs_audit_id", "audit_logs", ["audit_id"])

    # HNSW index for vector similarity search
    op.execute("CREATE INDEX ON child_chunks USING hnsw (embedding vector_cosine_ops)")

    # GIN index for full-text search
    op.execute("CREATE INDEX ON child_chunks USING gin (tsv_content)")


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint("uq_audit_logs_audit_id", "audit_logs", type_="unique")
    op.drop_index("ix_audit_logs_audit_id", table_name="audit_logs")
    op.drop_index("ix_document_evidence_audit_id", table_name="document_evidence")
    op.drop_index("ix_parent_chunks_document_id", table_name="parent_chunks")
    op.drop_index("ix_child_chunks_parent_id", table_name="child_chunks")
    op.execute("DROP INDEX IF EXISTS child_chunks_tsv_content_idx")
    op.execute("DROP INDEX IF EXISTS child_chunks_embedding_idx")
    op.drop_table("document_evidence")
    op.drop_table("audit_logs")
    op.drop_table("suppliers")
    op.drop_table("query_cache")
    op.drop_table("certificate_verifications")
    op.drop_table("child_chunks")
    op.drop_table("parent_chunks")
    op.drop_table("documents")
