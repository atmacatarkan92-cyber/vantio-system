"""Tenancy: optional tenant deposit fields (type, amount, annual premium).

Revision ID: 034_tenant_deposit
Revises: 033_unit_landlord_deposit
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "034_tenant_deposit"
down_revision: Union[str, None] = "033_unit_landlord_deposit"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "tenancies",
        sa.Column("tenant_deposit_type", sa.String(length=32), nullable=True),
    )
    op.add_column("tenancies", sa.Column("tenant_deposit_amount", sa.Float(), nullable=True))
    op.add_column(
        "tenancies",
        sa.Column("tenant_deposit_annual_premium", sa.Float(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("tenancies", "tenant_deposit_annual_premium")
    op.drop_column("tenancies", "tenant_deposit_amount")
    op.drop_column("tenancies", "tenant_deposit_type")
