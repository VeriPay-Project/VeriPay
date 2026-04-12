"""initial_schema_sync

Revision ID: 2c69db27d09c
Revises:
Create Date: 2026-04-05 19:49:00.539447

Baseline migration that syncs the SQLAlchemy models with the live database.
The database already has all core tables; this migration only adds the new
ensemble fraud-score columns introduced alongside the review system.

Columns that exist in the DB but not in models (e.g. legacy JSON columns on
analysis_results) are deliberately left untouched — they still hold data.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '2c69db27d09c'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add ensemble fraud score columns to analysis_results
    op.add_column('analysis_results', sa.Column('fraud_score', sa.Float(), nullable=True))
    op.add_column('analysis_results', sa.Column('risk_level', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('analysis_results', 'risk_level')
    op.drop_column('analysis_results', 'fraud_score')
