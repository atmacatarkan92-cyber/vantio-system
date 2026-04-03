"""Invoices: NOT NULL tenancy_id, billing_year, billing_month; restore strong UNIQUE on billing period.

Revision ID: 061_invoice_integrity_hardening
Revises: 060_room_excl

Migration 012 added uq_invoices_tenancy_period on (tenancy_id, billing_year, billing_month), but
those columns stayed nullable. PostgreSQL UNIQUE does not treat NULLs like values, so duplicate
rows with NULL in any column were still allowed. This migration requires all three columns,
drops the old unique, sets NOT NULL, and recreates the same-named UNIQUE constraint.

Preserves ck_invoices_billing_month (billing_month IS NULL OR 1-12); after NOT NULL the NULL arm
is unused but the constraint remains valid.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import text

revision: str = "061_invoice_integrity_hardening"
down_revision: Union[str, None] = "060_room_excl"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

UNIQUE_TENANCY_PERIOD = "uq_invoices_tenancy_period"


def upgrade() -> None:
    conn = op.get_bind()

    n_bad = conn.execute(
        text(
            """
            SELECT COUNT(*)::bigint FROM invoices
            WHERE tenancy_id IS NULL
               OR billing_year IS NULL
               OR billing_month IS NULL
            """
        )
    ).scalar_one()
    if n_bad is not None and int(n_bad) > 0:
        raise RuntimeError(
            f"061_invoice_integrity_hardening: {int(n_bad)} invoice row(s) have NULL in "
            "tenancy_id, billing_year, or billing_month. Fix data before upgrading."
        )

    n_dup = conn.execute(
        text(
            """
            SELECT COUNT(*)::bigint FROM (
              SELECT 1
              FROM invoices
              GROUP BY tenancy_id, billing_year, billing_month
              HAVING COUNT(*) > 1
            ) d
            """
        )
    ).scalar_one()
    if n_dup is not None and int(n_dup) > 0:
        raise RuntimeError(
            "061_invoice_integrity_hardening: duplicate (tenancy_id, billing_year, billing_month) "
            "groups exist. Resolve duplicates before upgrading."
        )

    op.drop_constraint(UNIQUE_TENANCY_PERIOD, "invoices", type_="unique")

    op.alter_column(
        "invoices",
        "tenancy_id",
        existing_type=sa.String(),
        nullable=False,
    )
    op.alter_column(
        "invoices",
        "billing_year",
        existing_type=sa.Integer(),
        nullable=False,
    )
    op.alter_column(
        "invoices",
        "billing_month",
        existing_type=sa.Integer(),
        nullable=False,
    )

    op.create_unique_constraint(
        UNIQUE_TENANCY_PERIOD,
        "invoices",
        ["tenancy_id", "billing_year", "billing_month"],
    )


def downgrade() -> None:
    op.drop_constraint(UNIQUE_TENANCY_PERIOD, "invoices", type_="unique")

    op.alter_column(
        "invoices",
        "billing_month",
        existing_type=sa.Integer(),
        nullable=True,
    )
    op.alter_column(
        "invoices",
        "billing_year",
        existing_type=sa.Integer(),
        nullable=True,
    )
    op.alter_column(
        "invoices",
        "tenancy_id",
        existing_type=sa.String(),
        nullable=True,
    )

    op.create_unique_constraint(
        UNIQUE_TENANCY_PERIOD,
        "invoices",
        ["tenancy_id", "billing_year", "billing_month"],
    )
