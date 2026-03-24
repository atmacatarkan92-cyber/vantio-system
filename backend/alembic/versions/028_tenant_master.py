"""Tenant: master data columns (identity, address, residency).

Revision ID: 028_tenant_master
Revises: 027_tenancies_rename_cols

Adds nullable columns only — existing rows keep working; application fills
fields over time. Does not modify legacy `name`.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "028_tenant_master"
down_revision: Union[str, None] = "027_tenancies_rename_cols"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("tenant", sa.Column("first_name", sa.String(length=200), nullable=True))
    op.add_column("tenant", sa.Column("last_name", sa.String(length=200), nullable=True))
    op.add_column("tenant", sa.Column("birth_date", sa.Date(), nullable=True))
    op.add_column("tenant", sa.Column("street", sa.String(length=300), nullable=True))
    op.add_column("tenant", sa.Column("postal_code", sa.String(length=32), nullable=True))
    op.add_column("tenant", sa.Column("city", sa.String(length=120), nullable=True))
    op.add_column("tenant", sa.Column("country", sa.String(length=120), nullable=True))
    op.add_column("tenant", sa.Column("nationality", sa.String(length=120), nullable=True))
    op.add_column("tenant", sa.Column("is_swiss", sa.Boolean(), nullable=True))
    op.add_column("tenant", sa.Column("residence_permit", sa.String(length=200), nullable=True))


def downgrade() -> None:
    op.drop_column("tenant", "residence_permit")
    op.drop_column("tenant", "is_swiss")
    op.drop_column("tenant", "nationality")
    op.drop_column("tenant", "country")
    op.drop_column("tenant", "city")
    op.drop_column("tenant", "postal_code")
    op.drop_column("tenant", "street")
    op.drop_column("tenant", "birth_date")
    op.drop_column("tenant", "last_name")
    op.drop_column("tenant", "first_name")
