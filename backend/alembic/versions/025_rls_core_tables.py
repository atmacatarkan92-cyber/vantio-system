"""RLS: tenancies, invoices, properties, landlords (direct org); unit_costs via unit parent.

Revision ID: 025_rls_core_tables
Revises: 024_repair_org_schema_from_drift

Policies compare organization_id::text to current_setting('app.current_organization_id', true)
(text-to-text, tolerant of UUID vs VARCHAR column drift); missing setting yields NULL and denies rows (fail-closed).

unit_costs has no organization_id; isolation is via parent unit.organization_id.

Note: users and audit_logs are intentionally out of scope here — see project docs / task notes.

Drift: some DBs lack organization_id on tenancies and/or invoices; repair before RLS (no FK on
added columns here). properties/landlords are expected to already have organization_id.
"""

from typing import Sequence, Union

from alembic import op
from sqlalchemy import text

revision: str = "025_rls_core_tables"
down_revision: Union[str, None] = "024_repair_org_schema_from_drift"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()

    # Drift repair: tenancies.organization_id required for RLS policies below (no FK in this migration).
    conn.execute(
        text(
            """
            ALTER TABLE tenancies
            ADD COLUMN IF NOT EXISTS organization_id UUID
            """
        )
    )
    conn.execute(
        text(
            """
            UPDATE tenancies t
            SET organization_id = u.organization_id
            FROM unit u
            WHERE u.id = t.unit_id
              AND t.organization_id IS NULL
            """
        )
    )
    remaining = conn.execute(
        text("SELECT COUNT(*) FROM tenancies WHERE organization_id IS NULL")
    ).scalar()
    if remaining and int(remaining) > 0:
        raise RuntimeError(
            "Cannot enable RLS on tenancies: organization_id backfill incomplete"
        )
    conn.execute(
        text("ALTER TABLE tenancies ALTER COLUMN organization_id SET NOT NULL")
    )

    # Drift repair: invoices.organization_id required for RLS policies below (no FK in this migration).
    conn.execute(
        text(
            """
            ALTER TABLE invoices
            ADD COLUMN IF NOT EXISTS organization_id UUID
            """
        )
    )
    conn.execute(
        text(
            """
            UPDATE invoices i
            SET organization_id = t.organization_id
            FROM tenancies t
            WHERE i.tenancy_id = t.id
              AND i.organization_id IS NULL
            """
        )
    )
    conn.execute(
        text(
            """
            UPDATE invoices i
            SET organization_id = u.organization_id
            FROM unit u
            WHERE i.unit_id = u.id
              AND i.organization_id IS NULL
            """
        )
    )
    conn.execute(
        text(
            """
            UPDATE invoices i
            SET organization_id = te.organization_id
            FROM tenant te
            WHERE i.tenant_id = te.id
              AND i.organization_id IS NULL
            """
        )
    )
    remaining_invoices = conn.execute(
        text("SELECT COUNT(*) FROM invoices WHERE organization_id IS NULL")
    ).scalar()
    if remaining_invoices and int(remaining_invoices) > 0:
        raise RuntimeError(
            "Cannot enable RLS on invoices: organization_id backfill incomplete"
        )
    conn.execute(
        text("ALTER TABLE invoices ALTER COLUMN organization_id SET NOT NULL")
    )

    direct_tables = (
        ("tenancies", "org_isolation_tenancies"),
        ("invoices", "org_isolation_invoices"),
        ("properties", "org_isolation_properties"),
        ("landlords", "org_isolation_landlords"),
    )

    for table, policy in direct_tables:
        conn.execute(text(f"DROP POLICY IF EXISTS {policy} ON {table}"))
        conn.execute(text(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY"))
        conn.execute(text(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY"))
        conn.execute(
            text(
                f"""
            CREATE POLICY {policy} ON {table} FOR ALL
            USING (organization_id::text = current_setting('app.current_organization_id', true))
            WITH CHECK (organization_id::text = current_setting('app.current_organization_id', true))
        """
            )
        )

    conn.execute(text("DROP POLICY IF EXISTS org_isolation_unit_costs ON unit_costs"))
    conn.execute(text("ALTER TABLE unit_costs ENABLE ROW LEVEL SECURITY"))
    conn.execute(text("ALTER TABLE unit_costs FORCE ROW LEVEL SECURITY"))
    conn.execute(
        text(
            """
            CREATE POLICY org_isolation_unit_costs ON unit_costs FOR ALL
            USING (
                EXISTS (
                    SELECT 1 FROM unit u
                    WHERE u.id = unit_costs.unit_id
                      AND u.organization_id::text = current_setting('app.current_organization_id', true)
                )
            )
            WITH CHECK (
                EXISTS (
                    SELECT 1 FROM unit u
                    WHERE u.id = unit_costs.unit_id
                      AND u.organization_id::text = current_setting('app.current_organization_id', true)
                )
            )
        """
        )
    )


def downgrade() -> None:
    conn = op.get_bind()

    conn.execute(text("DROP POLICY IF EXISTS org_isolation_unit_costs ON unit_costs"))
    conn.execute(text("ALTER TABLE unit_costs NO FORCE ROW LEVEL SECURITY"))
    conn.execute(text("ALTER TABLE unit_costs DISABLE ROW LEVEL SECURITY"))

    for table, policy in (
        ("landlords", "org_isolation_landlords"),
        ("properties", "org_isolation_properties"),
        ("invoices", "org_isolation_invoices"),
        ("tenancies", "org_isolation_tenancies"),
    ):
        conn.execute(text(f"DROP POLICY IF EXISTS {policy} ON {table}"))
        conn.execute(text(f"ALTER TABLE {table} NO FORCE ROW LEVEL SECURITY"))
        conn.execute(text(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY"))
