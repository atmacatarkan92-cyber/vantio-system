"""Add frequency to unit_costs (monthly/yearly/one_time).

Revision ID: 056_unit_cost_frequency
Revises: 055_owner_documents
"""

from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "056_unit_cost_frequency"
down_revision: Union[str, None] = "055_owner_documents"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add nullable first, backfill, then enforce NOT NULL (safe for existing rows).
    op.add_column(
        "unit_costs",
        sa.Column("frequency", sa.String(length=32), nullable=True, server_default="monthly"),
    )
    op.execute("UPDATE unit_costs SET frequency = 'monthly' WHERE frequency IS NULL")
    op.alter_column(
        "unit_costs",
        "frequency",
        existing_type=sa.String(length=32),
        nullable=False,
        server_default="monthly",
    )


def downgrade() -> None:
    op.drop_column("unit_costs", "frequency")

