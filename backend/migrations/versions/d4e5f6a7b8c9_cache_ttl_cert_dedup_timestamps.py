"""cache ttl/hits, cert dedup + checks, legacy timestamptz

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-08-04

Fixes from the ERD review:
  4. query_cache: hit_count + last_hit_at columns + created_at index (TTL/eviction).
  6. certificate_verifications: file_hash dedup + status CHECK constraint.
     Bonus CHECK constraints: audit_logs.result, chat_messages.role.
  7. Legacy audit_logs/document_evidence.timestamp VARCHAR(50) -> TIMESTAMPTZ.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


# revision identifiers, used by Alembic.
revision: str = 'd4e5f6a7b8c9'
down_revision: Union[str, Sequence[str], None] = 'c3d4e5f6a7b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Legacy timestamps are ISO 8601 (from the Supabase migration, e.g.
# "2026-07-20T16:29:15+00:00") OR the old dd/mm/YYYY, HH:MM:SS format that the
# pre-fix main.py writers produced (e.g. "18/07/2026, 11:00:00"). Handle both.
TIMESTAMP_CAST = (
    "CASE WHEN timestamp ~ '^\\d{4}-' THEN timestamp::timestamptz "
    "ELSE to_timestamp(timestamp, 'DD/MM/YYYY, HH24:MI:SS') END"
)
# Back to the legacy display format on downgrade.
TIMESTAMP_BACK = "to_char(timestamp, 'DD/MM/YYYY, HH24:MI:SS')"


def upgrade() -> None:
    """Upgrade schema."""
    # ── #4 query_cache: hit tracking + TTL support ──────────────────────
    op.add_column("query_cache", sa.Column("hit_count", sa.Integer, nullable=False, server_default="0"))
    op.add_column("query_cache", sa.Column("last_hit_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_query_cache_created_at", "query_cache", ["created_at"])

    # ── #6 certificate_verifications: dedup + status check ──────────────
    op.add_column("certificate_verifications", sa.Column("file_hash", sa.String(64), nullable=True))
    op.create_index("ix_certificate_verifications_file_hash", "certificate_verifications", ["file_hash"], unique=True)
    op.create_check_constraint(
        "chk_certificate_verifications_status",
        "certificate_verifications",
        "status IN ('PASS', 'FAIL', 'REQUIRES_HUMAN_REVIEW')",
    )

    # ── Bonus CHECK constraints ─────────────────────────────────────────
    op.create_check_constraint(
        "chk_audit_logs_result",
        "audit_logs",
        "result IN ('Match', 'Mismatch')",
    )
    op.create_check_constraint(
        "chk_chat_messages_role",
        "chat_messages",
        "role IN ('user', 'assistant')",
    )

    # ── #7 legacy timestamps -> timestamptz ─────────────────────────────
    op.execute(f"ALTER TABLE audit_logs ALTER COLUMN timestamp TYPE TIMESTAMPTZ USING {TIMESTAMP_CAST}")
    op.execute(f"ALTER TABLE document_evidence ALTER COLUMN timestamp TYPE TIMESTAMPTZ USING {TIMESTAMP_CAST}")


def downgrade() -> None:
    """Downgrade schema."""
    op.execute(f"ALTER TABLE document_evidence ALTER COLUMN timestamp TYPE VARCHAR(50) USING {TIMESTAMP_BACK}")
    op.execute(f"ALTER TABLE audit_logs ALTER COLUMN timestamp TYPE VARCHAR(50) USING {TIMESTAMP_BACK}")

    op.drop_constraint("chk_chat_messages_role", "chat_messages", type_="check")
    op.drop_constraint("chk_audit_logs_result", "audit_logs", type_="check")
    op.drop_constraint("chk_certificate_verifications_status", "certificate_verifications", type_="check")

    op.drop_index("ix_certificate_verifications_file_hash", table_name="certificate_verifications")
    op.drop_column("certificate_verifications", "file_hash")

    op.drop_index("ix_query_cache_created_at", table_name="query_cache")
    op.drop_column("query_cache", "last_hit_at")
    op.drop_column("query_cache", "hit_count")
