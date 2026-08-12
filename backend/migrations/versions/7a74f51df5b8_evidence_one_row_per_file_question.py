"""evidence one row per file question

Revision ID: 7a74f51df5b8
Revises: 4fd6750eb72c
Create Date: 2026-08-09 23:10:21.472199

A merged file attached to several Ariba questions now yields one
``document_evidence`` row per (file, question). Replace the old
``(audit_id, filename)`` unique constraint with ``(audit_id, filename,
ariba_question_label)`` so the same file can appear once per question in one
audit.
"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = '7a74f51df5b8'
down_revision: Union[str, Sequence[str], None] = '4fd6750eb72c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.drop_constraint("uq_document_evidence_audit_filename", "document_evidence", type_="unique")
    # Collapse any true (audit_id, filename, question) duplicates before locking.
    op.execute(
        """
        WITH ranked AS (
            SELECT id,
                   ROW_NUMBER() OVER (
                       PARTITION BY audit_id, filename, COALESCE(ariba_question_label, '')
                       ORDER BY created_at DESC, id DESC
                   ) AS rn
            FROM document_evidence
        )
        DELETE FROM document_evidence
        WHERE id IN (SELECT id FROM ranked WHERE rn > 1)
        """
    )
    op.create_unique_constraint(
        "uq_document_evidence_audit_filename_label",
        "document_evidence",
        ["audit_id", "filename", "ariba_question_label"],
    )


def downgrade() -> None:
    """Downgrade schema — restore the per-file unique constraint."""
    op.drop_constraint("uq_document_evidence_audit_filename_label", "document_evidence", type_="unique")
    # Re-collapse to one row per (audit_id, filename) before re-locking.
    op.execute(
        """
        WITH ranked AS (
            SELECT id,
                   ROW_NUMBER() OVER (
                       PARTITION BY audit_id, filename
                       ORDER BY created_at DESC, id DESC
                   ) AS rn
            FROM document_evidence
        )
        DELETE FROM document_evidence
        WHERE id IN (SELECT id FROM ranked WHERE rn > 1)
        """
    )
    op.create_unique_constraint(
        "uq_document_evidence_audit_filename",
        "document_evidence",
        ["audit_id", "filename"],
    )
