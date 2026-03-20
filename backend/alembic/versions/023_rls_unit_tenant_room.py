"""Enable RLS on unit, tenant, room (first rollout).

Revision ID: 023_rls_unit_tenant_room
Revises: 022_room_unit_fk_invoice_org
Create Date: 2026-03-20

Policies use current_setting('app.current_organization_id', true) — VARCHAR-safe; missing
setting yields NULL and denies rows (fail-closed).

room has no organization_id column; isolation is via parent unit.organization_id.
"""

from typing import Sequence, Union

from alembic import op
from sqlalchemy import text

revision: str = "023_rls_unit_tenant_room"
down_revision: Union[str, None] = "022_room_unit_fk_invoice_org"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()

    # unit: direct organization_id match
    conn.execute(text("ALTER TABLE unit ENABLE ROW LEVEL SECURITY"))
    conn.execute(text("ALTER TABLE unit FORCE ROW LEVEL SECURITY"))
    conn.execute(
        text("""
            CREATE POLICY org_isolation_unit ON unit FOR ALL
            USING (organization_id = current_setting('app.current_organization_id', true))
            WITH CHECK (organization_id = current_setting('app.current_organization_id', true))
        """)
    )

    # tenant: direct organization_id match
    conn.execute(text("ALTER TABLE tenant ENABLE ROW LEVEL SECURITY"))
    conn.execute(text("ALTER TABLE tenant FORCE ROW LEVEL SECURITY"))
    conn.execute(
        text("""
            CREATE POLICY org_isolation_tenant ON tenant FOR ALL
            USING (organization_id = current_setting('app.current_organization_id', true))
            WITH CHECK (organization_id = current_setting('app.current_organization_id', true))
        """)
    )

    # room: no organization_id — scope via parent unit
    conn.execute(text("ALTER TABLE room ENABLE ROW LEVEL SECURITY"))
    conn.execute(text("ALTER TABLE room FORCE ROW LEVEL SECURITY"))
    conn.execute(
        text("""
            CREATE POLICY org_isolation_room ON room FOR ALL
            USING (
                EXISTS (
                    SELECT 1 FROM unit u
                    WHERE u.id = room.unit_id
                      AND u.organization_id = current_setting('app.current_organization_id', true)
                )
            )
            WITH CHECK (
                EXISTS (
                    SELECT 1 FROM unit u
                    WHERE u.id = room.unit_id
                      AND u.organization_id = current_setting('app.current_organization_id', true)
                )
            )
        """)
    )


def downgrade() -> None:
    conn = op.get_bind()

    conn.execute(text("DROP POLICY IF EXISTS org_isolation_room ON room"))
    conn.execute(text("ALTER TABLE room NO FORCE ROW LEVEL SECURITY"))
    conn.execute(text("ALTER TABLE room DISABLE ROW LEVEL SECURITY"))

    conn.execute(text("DROP POLICY IF EXISTS org_isolation_tenant ON tenant"))
    conn.execute(text("ALTER TABLE tenant NO FORCE ROW LEVEL SECURITY"))
    conn.execute(text("ALTER TABLE tenant DISABLE ROW LEVEL SECURITY"))

    conn.execute(text("DROP POLICY IF EXISTS org_isolation_unit ON unit"))
    conn.execute(text("ALTER TABLE unit NO FORCE ROW LEVEL SECURITY"))
    conn.execute(text("ALTER TABLE unit DISABLE ROW LEVEL SECURITY"))
