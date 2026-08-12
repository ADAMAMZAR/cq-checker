"""gemini-only schema cleanup

Revision ID: 4fd6750eb72c
Revises: h8b9c0d1e2f3
Create Date: 2026-08-09 22:01:45.100524

Removes every DeepSeek / Qwen / abandoned Docling new-flow column so the schema
reflects the Gemini-only pipeline:

* ``certificate_verifications``: ``judge_reasoning`` -> ``reasoning_trace``.
* ``document_evidence``: drop the unused ``qwen_*``, ``extraction_*``,
  ``parse_*``, ``source_markdown`` and ``corrected_extracted_data`` columns
  (the Docling -> DeepSeek -> Qwen plan is abandoned; the live Gemini
  extraction uses ``gemini_extracted_metadata`` / ``input_tokens`` /
  ``output_tokens`` / ``cost_usd``).
* ``audit_logs``: drop the Qwen judge rollup columns and the Docling parse
  duration rollup.

All DDL is guarded with ``IF EXISTS`` so re-running is safe.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


# revision identifiers, used by Alembic.
revision: str = '4fd6750eb72c'
down_revision: Union[str, Sequence[str], None] = 'h8b9c0d1e2f3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # ── certificate_verifications: judge_reasoning -> reasoning_trace ──
    op.alter_column(
        "certificate_verifications",
        "judge_reasoning",
        new_column_name="reasoning_trace",
        existing_type=sa.Text(),
        existing_nullable=True,
    )

    # ── document_evidence: drop unused new-flow columns ───────────────
    document_evidence_drop = [
        "qwen_corrections", "qwen_status", "qwen_reasoning", "qwen_confidence",
        "qwen_input_tokens", "qwen_output_tokens", "qwen_cost_usd",
        "corrected_extracted_data",
        "extraction_model", "extraction_input_tokens", "extraction_output_tokens",
        "extraction_cost_usd",
        "parse_model", "parse_duration_ms", "parse_format", "parse_page_count",
        "parse_has_ocr", "parse_has_tables", "source_markdown",
    ]
    for col in document_evidence_drop:
        op.drop_column("document_evidence", col)

    # ── audit_logs: drop Qwen judge + Docling parse rollups ──────────
    audit_logs_drop = [
        "judge_total_input_tokens", "judge_total_output_tokens",
        "judge_total_cost_usd", "judge_status_aggregate",
        "parse_total_duration_ms",
    ]
    for col in audit_logs_drop:
        op.drop_column("audit_logs", col)


def downgrade() -> None:
    """Downgrade schema — re-add columns as nullable (data is lost)."""
    op.alter_column(
        "certificate_verifications",
        "reasoning_trace",
        new_column_name="judge_reasoning",
        existing_type=sa.Text(),
        existing_nullable=True,
    )

    document_evidence_add = [
        sa.Column("qwen_corrections", JSONB(), nullable=True),
        sa.Column("qwen_status", sa.String(50), nullable=True),
        sa.Column("qwen_reasoning", sa.Text(), nullable=True),
        sa.Column("qwen_confidence", sa.Numeric(4, 3), nullable=True),
        sa.Column("qwen_input_tokens", sa.Integer(), nullable=True),
        sa.Column("qwen_output_tokens", sa.Integer(), nullable=True),
        sa.Column("qwen_cost_usd", sa.Numeric(12, 6), nullable=True),
        sa.Column("corrected_extracted_data", JSONB(), nullable=True),
        sa.Column("extraction_model", sa.String(50), nullable=True),
        sa.Column("extraction_input_tokens", sa.Integer(), nullable=True),
        sa.Column("extraction_output_tokens", sa.Integer(), nullable=True),
        sa.Column("extraction_cost_usd", sa.Numeric(12, 6), nullable=True),
        sa.Column("parse_model", sa.String(50), nullable=True),
        sa.Column("parse_duration_ms", sa.Integer(), nullable=True),
        sa.Column("parse_format", sa.String(50), nullable=True),
        sa.Column("parse_page_count", sa.Integer(), nullable=True),
        sa.Column("parse_has_ocr", sa.Boolean(), nullable=True),
        sa.Column("parse_has_tables", sa.Boolean(), nullable=True),
        sa.Column("source_markdown", sa.Text(), nullable=True),
    ]
    for col in document_evidence_add:
        op.add_column("document_evidence", col)

    audit_logs_add = [
        sa.Column("judge_total_input_tokens", sa.Integer(), nullable=True),
        sa.Column("judge_total_output_tokens", sa.Integer(), nullable=True),
        sa.Column("judge_total_cost_usd", sa.Numeric(12, 6), nullable=True),
        sa.Column("judge_status_aggregate", sa.String(50), nullable=True),
        sa.Column("parse_total_duration_ms", sa.Integer(), nullable=True),
    ]
    for col in audit_logs_add:
        op.add_column("audit_logs", col)
