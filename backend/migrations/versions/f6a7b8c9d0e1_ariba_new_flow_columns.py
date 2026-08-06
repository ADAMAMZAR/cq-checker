"""Ariba new-flow columns + evidence unique constraint

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-08-05

Adds columns required by the Docling -> DeepSeek -> Qwen (inline correction) -> Python
rules pipeline that replaces the legacy Gemini-Worker path. All new columns are
NULLABLE so the migration is purely additive and zero-downtime; the existing
``document_evidence.gemini_extracted_metadata`` / ``input_tokens`` / ``output_tokens``
/ ``cost_usd`` columns are left in place as back-compat aliases.

Also adds ``uq_document_evidence_audit_filename`` (audit_id, filename) so a
partial retry can never produce duplicate evidence rows inside one transaction.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


# revision identifiers, used by Alembic.
revision: str = "f6a7b8c9d0e1"
down_revision: Union[str, Sequence[str], None] = "e5f6a7b8c9d0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # ── Pre-flight: dedupe legacy (audit_id, filename) duplicates ────────
    # The legacy two-pass flow (extract -> comparison) sometimes inserted the
    # same evidence row twice. We must collapse them before adding the
    # uq_document_evidence_audit_filename UNIQUE constraint. Keep the row
    # with the latest timestamp per (audit_id, filename); tiebreak on the
    # higher UUID (lexicographic) so the choice is deterministic. Raw SQL so we
    # can use a CTE that Alembic's op layer doesn't expose.
    op.execute(
        """
        WITH ranked AS (
            SELECT id,
                   ROW_NUMBER() OVER (
                       PARTITION BY audit_id, filename
                       ORDER BY timestamp DESC, id DESC
                   ) AS rn
            FROM document_evidence
        )
        DELETE FROM document_evidence
        WHERE id IN (SELECT id FROM ranked WHERE rn > 1)
        """
    )

    # ── document_evidence: Docling + DeepSeek + Qwen columns ───────────
    op.add_column("document_evidence", sa.Column("parse_model", sa.String(50), nullable=True))
    op.add_column("document_evidence", sa.Column("parse_duration_ms", sa.Integer(), nullable=True))
    op.add_column("document_evidence", sa.Column("parse_format", sa.String(50), nullable=True))
    op.add_column("document_evidence", sa.Column("parse_page_count", sa.Integer(), nullable=True))
    op.add_column("document_evidence", sa.Column("parse_has_ocr", sa.Boolean(), nullable=True))
    op.add_column("document_evidence", sa.Column("parse_has_tables", sa.Boolean(), nullable=True))
    op.add_column("document_evidence", sa.Column("source_markdown", sa.Text(), nullable=True))

    op.add_column("document_evidence", sa.Column("extraction_model", sa.String(50), nullable=True))
    op.add_column("document_evidence", sa.Column("extraction_input_tokens", sa.Integer(), nullable=True))
    op.add_column("document_evidence", sa.Column("extraction_output_tokens", sa.Integer(), nullable=True))
    op.add_column(
        "document_evidence",
        sa.Column("extraction_cost_usd", sa.Numeric(12, 6), nullable=True),
    )

    op.add_column("document_evidence", sa.Column("qwen_corrections", JSONB(), nullable=True))
    op.add_column("document_evidence", sa.Column("qwen_status", sa.String(50), nullable=True))
    op.add_column("document_evidence", sa.Column("qwen_reasoning", sa.Text(), nullable=True))
    op.add_column(
        "document_evidence",
        sa.Column("qwen_confidence", sa.Numeric(4, 3), nullable=True),
    )
    op.add_column("document_evidence", sa.Column("qwen_input_tokens", sa.Integer(), nullable=True))
    op.add_column("document_evidence", sa.Column("qwen_output_tokens", sa.Integer(), nullable=True))
    op.add_column(
        "document_evidence",
        sa.Column("qwen_cost_usd", sa.Numeric(12, 6), nullable=True),
    )
    op.add_column("document_evidence", sa.Column("corrected_extracted_data", JSONB(), nullable=True))

    # ── audit_logs: rollup columns ──────────────────────────────────────
    op.add_column("audit_logs", sa.Column("parse_total_duration_ms", sa.Integer(), nullable=True))
    op.add_column("audit_logs", sa.Column("judge_total_input_tokens", sa.Integer(), nullable=True))
    op.add_column("audit_logs", sa.Column("judge_total_output_tokens", sa.Integer(), nullable=True))
    op.add_column(
        "audit_logs",
        sa.Column("judge_total_cost_usd", sa.Numeric(12, 6), nullable=True),
    )
    op.add_column("audit_logs", sa.Column("judge_status_aggregate", sa.String(50), nullable=True))

    # ── (audit_id, filename) unique so a partial retry never dupes ─────
    op.create_unique_constraint(
        "uq_document_evidence_audit_filename",
        "document_evidence",
        ["audit_id", "filename"],
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint("uq_document_evidence_audit_filename", "document_evidence", type_="unique")

    op.drop_column("audit_logs", "judge_status_aggregate")
    op.drop_column("audit_logs", "judge_total_cost_usd")
    op.drop_column("audit_logs", "judge_total_output_tokens")
    op.drop_column("audit_logs", "judge_total_input_tokens")
    op.drop_column("audit_logs", "parse_total_duration_ms")

    op.drop_column("document_evidence", "corrected_extracted_data")
    op.drop_column("document_evidence", "qwen_cost_usd")
    op.drop_column("document_evidence", "qwen_output_tokens")
    op.drop_column("document_evidence", "qwen_input_tokens")
    op.drop_column("document_evidence", "qwen_confidence")
    op.drop_column("document_evidence", "qwen_reasoning")
    op.drop_column("document_evidence", "qwen_status")
    op.drop_column("document_evidence", "qwen_corrections")
    op.drop_column("document_evidence", "extraction_cost_usd")
    op.drop_column("document_evidence", "extraction_output_tokens")
    op.drop_column("document_evidence", "extraction_input_tokens")
    op.drop_column("document_evidence", "extraction_model")
    op.drop_column("document_evidence", "source_markdown")
    op.drop_column("document_evidence", "parse_has_tables")
    op.drop_column("document_evidence", "parse_has_ocr")
    op.drop_column("document_evidence", "parse_page_count")
    op.drop_column("document_evidence", "parse_format")
    op.drop_column("document_evidence", "parse_duration_ms")
    op.drop_column("document_evidence", "parse_model")
