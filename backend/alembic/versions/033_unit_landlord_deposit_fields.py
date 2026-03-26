"""Unit: optional landlord deposit fields.

Revision ID: 033_unit_landlord_deposit
Revises: 032_unit_financial_fields
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "033_unit_landlord_deposit"
down_revision: Union[str, None] = "032_unit_financial_fields"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "unit",
        sa.Column("landlord_deposit_type", sa.String(length=32), nullable=True),
    )
    op.add_column("unit", sa.Column("landlord_deposit_amount", sa.Float(), nullable=True))
    op.add_column(
        "unit",
        sa.Column("landlord_deposit_annual_premium", sa.Float(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("unit", "landlord_deposit_annual_premium")
    op.drop_column("unit", "landlord_deposit_amount")
    op.drop_column("unit", "landlord_deposit_type")
