"""add tokens and cost to documents table

Revision ID: l2f3a4b5c6d7
Revises: k1e2f3a4b5c6
Create Date: 2026-08-10 10:15:00.000000

Adds input_tokens, output_tokens, cost_usd to documents table to track
ingestion API costs per document.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'l2f3a4b5c6d7'
down_revision: Union[str, Sequence[str], None] = 'k1e2f3a4b5c6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("documents", sa.Column("input_tokens", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("documents", sa.Column("output_tokens", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("documents", sa.Column("cost_usd", sa.Numeric(12, 6), nullable=False, server_default="0"))


def downgrade() -> None:
    op.drop_column("documents", "cost_usd")
    op.drop_column("documents", "output_tokens")
    op.drop_column("documents", "input_tokens")
