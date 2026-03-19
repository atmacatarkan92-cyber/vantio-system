"""Backfill invoices.organization_id when NULL (safe chain, no guessing).

Revision ID: 021_invoice_org_backfill
Revises: 020_landlords_org
Create Date: 2026-03-14

Applies in order (each step only updates rows still NULL):
1) tenancies.organization_id via invoices.tenancy_id
2) units.organization_id via invoices.unit_id
3) tenant.organization_id via invoices.tenant_id

Does not resolve conflicts between sources; first successful join wins. Remaining NULL -> unchanged.
Downgrade does not revert data (cannot distinguish backfilled rows).
"""

from typing import Sequence, Union

from alembic import op
from sqlalchemy import text

revision: str = "021_invoice_org_backfill"
down_revision: Union[str, None] = "020_landlords_org"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(
        text("""
            UPDATE invoices i
            SET organization_id = t.organization_id
            FROM tenancies t
            WHERE i.organization_id IS NULL
              AND i.tenancy_id IS NOT NULL
              AND i.tenancy_id = t.id
              AND t.organization_id IS NOT NULL
        """)
    )
    conn.execute(
        text("""
            UPDATE invoices i
            SET organization_id = u.organization_id
            FROM unit u
            WHERE i.organization_id IS NULL
              AND i.unit_id IS NOT NULL
              AND i.unit_id = u.id
              AND u.organization_id IS NOT NULL
        """)
    )
    conn.execute(
        text("""
            UPDATE invoices i
            SET organization_id = te.organization_id
            FROM tenant te
            WHERE i.organization_id IS NULL
              AND i.tenant_id IS NOT NULL
              AND i.tenant_id = te.id
              AND te.organization_id IS NOT NULL
        """)
    )


def downgrade() -> None:
    """Data backfill is not reversed (ambiguous which rows were NULL before)."""
    pass
