"""Tenancies: notice / termination / actual move-out lifecycle columns.

Revision ID: 058_tenancy_lifecycle
Revises: 057_tenancy_revenue
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "058_tenancy_lifecycle"
down_revision: Union[str, None] = "057_tenancy_revenue"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "tenancies",
        sa.Column("notice_given_at", sa.Date(), nullable=True),
    )
    op.add_column(
        "tenancies",
        sa.Column("termination_effective_date", sa.Date(), nullable=True),
    )
    op.add_column(
        "tenancies",
        sa.Column("actual_move_out_date", sa.Date(), nullable=True),
    )
    op.add_column(
        "tenancies",
        sa.Column("terminated_by", sa.String(length=32), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("tenancies", "terminated_by")
    op.drop_column("tenancies", "actual_move_out_date")
    op.drop_column("tenancies", "termination_effective_date")
    op.drop_column("tenancies", "notice_given_at")
