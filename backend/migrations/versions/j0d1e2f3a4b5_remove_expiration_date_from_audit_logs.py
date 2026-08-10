"""remove expiration_date from audit_logs

Revision ID: j0d1e2f3a4b5
Revises: i9c0d1e2f3a4
Create Date: 2026-08-10 09:37:00.000000

Drops expiration_date column from audit_logs table since each file in an audit
carries its own expirationDate in document_evidence / compiled_extracted_data.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'j0d1e2f3a4b5'
down_revision: Union[str, Sequence[str], None] = 'i9c0d1e2f3a4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column("audit_logs", "expiration_date")


def downgrade() -> None:
    op.add_column(
        "audit_logs",
        sa.Column("expiration_date", sa.String(50), nullable=True, server_default="N/A"),
    )
