"""RLS for tenant CRM tables (notes + events).

Revision ID: 030_rls_tenant_crm
Revises: 029_tenant_crm_notes

Same org isolation pattern as tenant (023): app.current_organization_id.
"""

from typing import Sequence, Union

from alembic import op
from sqlalchemy import text

revision: str = "030_rls_tenant_crm"
down_revision: Union[str, None] = "029_tenant_crm_notes"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()

    conn.execute(text("ALTER TABLE tenant_notes ENABLE ROW LEVEL SECURITY"))
    conn.execute(text("ALTER TABLE tenant_notes FORCE ROW LEVEL SECURITY"))
    conn.execute(
        text("""
            CREATE POLICY org_isolation_tenant_notes ON tenant_notes FOR ALL
            USING (organization_id = current_setting('app.current_organization_id', true))
            WITH CHECK (organization_id = current_setting('app.current_organization_id', true))
        """)
    )

    conn.execute(text("ALTER TABLE tenant_events ENABLE ROW LEVEL SECURITY"))
    conn.execute(text("ALTER TABLE tenant_events FORCE ROW LEVEL SECURITY"))
    conn.execute(
        text("""
            CREATE POLICY org_isolation_tenant_events ON tenant_events FOR ALL
            USING (organization_id = current_setting('app.current_organization_id', true))
            WITH CHECK (organization_id = current_setting('app.current_organization_id', true))
        """)
    )


def downgrade() -> None:
    conn = op.get_bind()

    conn.execute(text("DROP POLICY IF EXISTS org_isolation_tenant_events ON tenant_events"))
    conn.execute(text("ALTER TABLE tenant_events NO FORCE ROW LEVEL SECURITY"))
    conn.execute(text("ALTER TABLE tenant_events DISABLE ROW LEVEL SECURITY"))

    conn.execute(text("DROP POLICY IF EXISTS org_isolation_tenant_notes ON tenant_notes"))
    conn.execute(text("ALTER TABLE tenant_notes NO FORCE ROW LEVEL SECURITY"))
    conn.execute(text("ALTER TABLE tenant_notes DISABLE ROW LEVEL SECURITY"))
