"""Phase A: additive schema only (listings, unit_costs, payments).

Revision ID: 002_phase_a
Revises: 001_initial
Create Date: Phase A consolidation

- listings: available_from, available_to (DATE, nullable)
- unit_costs: billing_cycle (VARCHAR, nullable, server default 'monthly')
- payments: external_payment_id (VARCHAR, nullable)
- users.role: CHECK constraint only if all existing values in allowed set;
  current DB has 'platform_admin' which is not in ('admin','manager','landlord','tenant','support'),
  so constraint is NOT added in this migration.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text


revision: str = "002_phase_a"
down_revision: Union[str, None] = "001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


ALLOWED_ROLES = ("admin", "manager", "landlord", "tenant", "support")
CHECK_CONSTRAINT_NAME = "users_role_allowed"


def upgrade() -> None:
    # 1. listings: available_from, available_to (DATE, nullable)
    op.add_column("listings", sa.Column("available_from", sa.Date(), nullable=True))
    op.add_column("listings", sa.Column("available_to", sa.Date(), nullable=True))

    # 2. unit_costs: billing_cycle (VARCHAR, nullable, server default 'monthly')
    op.add_column(
        "unit_costs",
        sa.Column("billing_cycle", sa.String(length=50), nullable=True, server_default="monthly"),
    )

    # 3. payments: external_payment_id (VARCHAR, nullable) — alter legacy table only
    op.add_column("payments", sa.Column("external_payment_id", sa.String(length=255), nullable=True))

    # 4. users.role CHECK: only if all existing values are in allowed set
    conn = op.get_bind()
    result = conn.execute(text("SELECT DISTINCT role FROM users"))
    roles = {row[0] for row in result if row[0] is not None}
    invalid = roles - set(ALLOWED_ROLES)
    if invalid:
        # Do not add constraint; report via comment (visible in migration source)
        # Existing values e.g. platform_admin, ops_admin are not in allowed set.
        pass
    else:
        op.create_check_constraint(
            CHECK_CONSTRAINT_NAME,
            "users",
            "role IN ('admin', 'manager', 'landlord', 'tenant', 'support')",
        )


def downgrade() -> None:
    # 4. users.role CHECK (drop if exists; safe when constraint was skipped)
    op.execute(text(f"ALTER TABLE users DROP CONSTRAINT IF EXISTS {CHECK_CONSTRAINT_NAME}"))

    # 3. payments
    op.drop_column("payments", "external_payment_id")

    # 2. unit_costs
    op.drop_column("unit_costs", "billing_cycle")

    # 1. listings
    op.drop_column("listings", "available_to")
    op.drop_column("listings", "available_from")
