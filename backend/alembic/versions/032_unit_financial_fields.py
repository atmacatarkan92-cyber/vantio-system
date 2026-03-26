"""Unit: financial and occupancy fields (tenant/landlord rent, dates, zip).

Revision ID: 032_unit_financial_fields
Revises: 031_room_size_m2_and_status
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "032_unit_financial_fields"
down_revision: Union[str, None] = "031_room_size_m2_and_status"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "unit",
        sa.Column("tenant_price_monthly_chf", sa.Float(), nullable=False, server_default="0"),
    )
    op.add_column(
        "unit",
        sa.Column("landlord_rent_monthly_chf", sa.Float(), nullable=False, server_default="0"),
    )
    op.add_column(
        "unit",
        sa.Column("utilities_monthly_chf", sa.Float(), nullable=False, server_default="0"),
    )
    op.add_column(
        "unit",
        sa.Column("cleaning_cost_monthly_chf", sa.Float(), nullable=False, server_default="0"),
    )
    op.add_column("unit", sa.Column("landlord_lease_start_date", sa.Date(), nullable=True))
    op.add_column("unit", sa.Column("available_from", sa.Date(), nullable=True))
    op.add_column("unit", sa.Column("occupancy_status", sa.String(length=64), nullable=True))
    op.add_column(
        "unit",
        sa.Column("occupied_rooms", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column("unit", sa.Column("postal_code", sa.String(length=32), nullable=True))
    # Drop server defaults used for backfill so new rows rely on application defaults.
    op.alter_column(
        "unit",
        "tenant_price_monthly_chf",
        existing_type=sa.Float(),
        server_default=None,
    )
    op.alter_column(
        "unit",
        "landlord_rent_monthly_chf",
        existing_type=sa.Float(),
        server_default=None,
    )
    op.alter_column(
        "unit",
        "utilities_monthly_chf",
        existing_type=sa.Float(),
        server_default=None,
    )
    op.alter_column(
        "unit",
        "cleaning_cost_monthly_chf",
        existing_type=sa.Float(),
        server_default=None,
    )
    op.alter_column(
        "unit",
        "occupied_rooms",
        existing_type=sa.Integer(),
        server_default=None,
    )


def downgrade() -> None:
    op.drop_column("unit", "postal_code")
    op.drop_column("unit", "occupied_rooms")
    op.drop_column("unit", "occupancy_status")
    op.drop_column("unit", "available_from")
    op.drop_column("unit", "landlord_lease_start_date")
    op.drop_column("unit", "cleaning_cost_monthly_chf")
    op.drop_column("unit", "utilities_monthly_chf")
    op.drop_column("unit", "landlord_rent_monthly_chf")
    op.drop_column("unit", "tenant_price_monthly_chf")
