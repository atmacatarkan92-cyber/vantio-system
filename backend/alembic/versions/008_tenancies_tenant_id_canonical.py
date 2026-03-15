"""Tenant/Tenancy schema alignment: tenancies.tenant_id -> canonical tenant table.

Revision ID: 008_tenancies_tenant_canonical
Revises: 007_tenant_user_id
Create Date: Align tenancies.tenant_id with tenant.id (application canonical table).

- Live DB had tenancies.tenant_id as integer FK to tenants.id (plural); app uses tenant (singular).
- Add tenant_id_canonical (varchar, FK tenant.id), backfill only where safe (legacy tenants -> tenant by email 1:1).
- Drop old FK and integer tenant_id, rename tenant_id_canonical -> tenant_id.
- Optionally backfill invoices.tenant_id from tenancies.tenant_id where set (no-op if all NULL).
- Rollback-safe: downgrade restores integer column and FK to tenants.id.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "008_tenancies_tenant_canonical"
down_revision: Union[str, None] = "007_tenant_user_id"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add temporary column for canonical tenant reference (tenant table = app canonical)
    op.add_column(
        "tenancies",
        sa.Column("tenant_id_canonical", sa.String(), nullable=True),
    )
    op.create_foreign_key(
        "tenancies_tenant_id_canonical_fkey",
        "tenancies",
        "tenant",
        ["tenant_id_canonical"],
        ["id"],
    )
    op.create_index(
        "ix_tenancies_tenant_id_canonical",
        "tenancies",
        ["tenant_id_canonical"],
        unique=False,
    )

    # 2. Backfill only where safe: legacy tenants (plural) row matches exactly one tenant (singular) by normalized email
    #    and this tenancy is the only one pointing at that legacy tenant (no ambiguous mapping).
    op.execute(sa.text("""
        UPDATE tenancies t
        SET tenant_id_canonical = tcan.id
        FROM tenants tp
        JOIN tenant tcan ON LOWER(TRIM(tp.email)) = LOWER(TRIM(tcan.email))
        WHERE t.tenant_id = tp.id
          AND (SELECT COUNT(*) FROM tenant t2 WHERE LOWER(TRIM(t2.email)) = LOWER(TRIM(tp.email))) = 1
          AND (SELECT COUNT(*) FROM tenancies t3 WHERE t3.tenant_id = tp.id) = 1
    """))

    # 3. Drop old FK and column, rename canonical column to tenant_id
    op.drop_constraint("tenancies_tenant_fk", "tenancies", type_="foreignkey")
    op.drop_column("tenancies", "tenant_id")
    op.alter_column(
        "tenancies",
        "tenant_id_canonical",
        new_column_name="tenant_id",
    )
    # Standard naming for constraint and index (column is now tenant_id)
    op.drop_constraint("tenancies_tenant_id_canonical_fkey", "tenancies", type_="foreignkey")
    op.create_foreign_key(
        "tenancies_tenant_id_fkey",
        "tenancies",
        "tenant",
        ["tenant_id"],
        ["id"],
    )
    op.drop_index("ix_tenancies_tenant_id_canonical", table_name="tenancies")
    op.create_index("ix_tenancies_tenant_id", "tenancies", ["tenant_id"], unique=False)

    # 4. Backfill invoices.tenant_id from tenancies.tenant_id where tenancy is linked (safe, no invent)
    op.execute(sa.text("""
        UPDATE invoices i
        SET tenant_id = t.tenant_id
        FROM tenancies t
        WHERE i.tenancy_id = t.id AND t.tenant_id IS NOT NULL AND i.tenant_id IS NULL
    """))


def downgrade() -> None:
    # 1. Drop FK and index on tenant_id (varchar), then rename column so we can add back integer tenant_id
    op.drop_constraint("tenancies_tenant_id_fkey", "tenancies", type_="foreignkey")
    op.drop_index("ix_tenancies_tenant_id", table_name="tenancies")
    op.alter_column(
        "tenancies",
        "tenant_id",
        new_column_name="tenant_id_canonical",
    )

    # 2. Add back integer tenant_id (nullable) and FK to tenants.id
    op.add_column(
        "tenancies",
        sa.Column("tenant_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "tenancies_tenant_fk",
        "tenancies",
        "tenants",
        ["tenant_id"],
        ["id"],
    )
    op.create_index("ix_tenancies_tenant_id", "tenancies", ["tenant_id"], unique=False)

    # 3. Drop canonical column (any canonical ids are lost on rollback)
    op.drop_column("tenancies", "tenant_id_canonical")
