"""Phase B: add tenancies.unit_id (additive only).

Revision ID: 004_tenancies_unit_id
Revises: 003_users_role_check
Create Date: Phase B tenancies alignment.

Adds unit_id to tenancies table only if missing. No drops, no renames.
unit.id is VARCHAR (UUID string); FK to unit.id per project schema.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "004_tenancies_unit_id"
down_revision: Union[str, None] = "003_users_role_check"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "tenancies",
        sa.Column("unit_id", sa.String(), nullable=True),
    )
    op.create_foreign_key(
        "tenancies_unit_id_fkey",
        "tenancies",
        "unit",
        ["unit_id"],
        ["id"],
    )
    op.create_index("ix_tenancies_unit_id", "tenancies", ["unit_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_tenancies_unit_id", "tenancies")
    op.drop_constraint("tenancies_unit_id_fkey", "tenancies", type_="foreignkey")
    op.drop_column("tenancies", "unit_id")
