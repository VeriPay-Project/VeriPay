"""add layoutlm_model_id to analysis_results

Revision ID: a1b2c3d4e5f6
Revises: 2c69db27d09c
Create Date: 2026-04-19

Adds layoutlm_model_id column so each invoice can store one analysis result
per model, enabling per-model result lookup without re-running analysis.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = "2c69db27d09c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "analysis_results",
        sa.Column("layoutlm_model_id", sa.String(), nullable=True),
    )
    op.create_index(
        "ix_analysis_results_layoutlm_model_id",
        "analysis_results",
        ["layoutlm_model_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_analysis_results_layoutlm_model_id", table_name="analysis_results")
    op.drop_column("analysis_results", "layoutlm_model_id")
