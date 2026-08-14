"""drop cert_type column from audit_logs table

Revision ID: q7r8s9t0u1v2
Revises: p6q7r8s9t0u1
Create Date: 2026-08-14 08:40:00.000000

Drops legacy cert_type column from audit_logs table.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'q7r8s9t0u1v2'
down_revision: Union[str, Sequence[str], None] = 'p6q7r8s9t0u1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    # Safely drop cert_type column if it exists in audit_logs
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'audit_logs' AND column_name = 'cert_type'
            ) THEN
                ALTER TABLE audit_logs DROP COLUMN cert_type;
            END IF;
        END $$;
    """)

def downgrade() -> None:
    op.add_column("audit_logs", sa.Column("cert_type", sa.String(100), nullable=True, server_default="Relational evidence"))
