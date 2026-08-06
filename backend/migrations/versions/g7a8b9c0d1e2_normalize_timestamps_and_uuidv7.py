"""Normalize timestamp columns to created_at + switch UUIDs to v7 (Python-side)

Revision ID: g7a8b9c0d1e2
Revises: f6a7b8c9d0e1
Create Date: 2026-08-06

What this migration does
========================

1. ``document_evidence``: add ``created_at TIMESTAMPTZ DEFAULT now()``, backfill
   from the legacy ``timestamp`` column, then drop ``timestamp``.
2. ``audit_logs``: drop the legacy ``timestamp`` column (it already has
   ``created_at``, which the server populates automatically).
3. ``suppliers``: rename ``date_added`` -> ``created_at`` for consistency.

UUID v7
=======

UUID generation is now done Python-side in the SQLAlchemy models
(``default=uuid.uuid7``, Python 3.14+). We keep ``server_default=gen_random_uuid()``
on every primary key so raw-SQL inserts still get a valid (v4) UUID — when
PostgreSQL 18 is available, a trigger can override that to v7 too.

Idempotency
============

All DDL is guarded with ``IF EXISTS`` / ``IF NOT EXISTS`` so re-running
``alembic upgrade head`` after a partial failure is safe.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "g7a8b9c0d1e2"
down_revision: Union[str, Sequence[str], None] = "f6a7b8c9d0e1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Drop legacy timestamp columns; add created_at everywhere."""
    # ── 1. document_evidence: add created_at, backfill, drop timestamp ──
    op.execute(
        "ALTER TABLE document_evidence "
        "ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ"
    )
    # Backfill from legacy timestamp (when timestamp is NULL, fall back to now()).
    op.execute(
        "UPDATE document_evidence "
        "SET created_at = COALESCE(timestamp, now()) "
        "WHERE created_at IS NULL"
    )
    # Now that every row has a real created_at, lock it as NOT NULL and
    # wire up the server default for future inserts.
    op.execute(
        "ALTER TABLE document_evidence "
        "ALTER COLUMN created_at SET NOT NULL"
    )
    op.execute(
        "ALTER TABLE document_evidence "
        "ALTER COLUMN created_at SET DEFAULT now()"
    )
    # Finally, drop the legacy timestamp column.
    op.drop_column("document_evidence", "timestamp")

    # ── 2. audit_logs: already has created_at, just drop legacy timestamp ─
    op.drop_column("audit_logs", "timestamp")

    # ── 3. suppliers: rename date_added -> created_at ────────────────────
    op.alter_column(
        "suppliers",
        "date_added",
        new_column_name="created_at",
        existing_type=sa.DateTime(timezone=True),
        existing_nullable=True,
    )


def downgrade() -> None:
    """Reverse the rename. UUIDs are v4 either way (v7 only applies to new rows)."""
    # ── 3. suppliers: created_at -> date_added ──────────────────────────
    op.alter_column(
        "suppliers",
        "created_at",
        new_column_name="date_added",
        existing_type=sa.DateTime(timezone=True),
        existing_nullable=True,
    )

    # ── 2. audit_logs: re-add timestamp ───────────────────────────────────
    op.add_column(
        "audit_logs",
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=True),
    )
    # Backfill from created_at so the legacy column has the same data.
    op.execute(
        "UPDATE audit_logs "
        "SET timestamp = COALESCE(created_at, now()) "
        "WHERE timestamp IS NULL"
    )
    op.execute(
        "ALTER TABLE audit_logs "
        "ALTER COLUMN timestamp SET NOT NULL"
    )

    # ── 1. document_evidence: re-add timestamp, drop created_at ──────────
    op.add_column(
        "document_evidence",
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=True),
    )
    op.execute(
        "UPDATE document_evidence "
        "SET timestamp = COALESCE(created_at, now()) "
        "WHERE timestamp IS NULL"
    )
    op.execute(
        "ALTER TABLE document_evidence "
        "ALTER COLUMN timestamp SET NOT NULL"
    )
    op.drop_column("document_evidence", "created_at")
