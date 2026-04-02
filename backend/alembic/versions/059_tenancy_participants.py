"""Tenancy participants: people linked to one occupancy contract (tenancy row).

Revision ID: 059_tenancy_participants
Revises: 058_tenancy_lifecycle

One tenancy row = one room occupancy contract. tenancy_participants links tenant persons to that
contract with a role (primary_tenant, co_tenant, solidarhafter). Existing tenancies.tenant_id is
backfilled as primary_tenant and remains the invoice / compatibility primary in Phase 1.

RLS: organization_id matches other org-scoped tables.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text

revision: str = "059_tenancy_participants"
down_revision: Union[str, None] = "058_tenancy_lifecycle"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()

    op.create_table(
        "tenancy_participants",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("organization_id", sa.String(), nullable=False),
        sa.Column("tenancy_id", sa.String(), nullable=False),
        sa.Column("tenant_id", sa.String(), nullable=False),
        sa.Column("role", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["organization_id"], ["organization.id"]),
        sa.ForeignKeyConstraint(["tenancy_id"], ["tenancies.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenant.id"]),
        sa.UniqueConstraint("tenancy_id", "tenant_id", name="uq_tenancy_participant_tenancy_tenant"),
        sa.CheckConstraint(
            "role IN ('primary_tenant', 'co_tenant', 'solidarhafter')",
            name="ck_tenancy_participants_role_allowed",
        ),
    )
    op.create_index("ix_tenancy_participants_organization_id", "tenancy_participants", ["organization_id"])
    op.create_index("ix_tenancy_participants_tenancy_id", "tenancy_participants", ["tenancy_id"])
    op.create_index("ix_tenancy_participants_tenant_id", "tenancy_participants", ["tenant_id"])

    # Backfill: each existing tenancy gets one primary_tenant row mirroring tenancies.tenant_id
    conn.execute(
        text(
            """
            INSERT INTO tenancy_participants (id, organization_id, tenancy_id, tenant_id, role, created_at)
            SELECT gen_random_uuid()::text, t.organization_id, t.id, t.tenant_id, 'primary_tenant', NOW()
            FROM tenancies t
            """
        )
    )

    conn.execute(text("ALTER TABLE tenancy_participants ENABLE ROW LEVEL SECURITY"))
    conn.execute(text("DROP POLICY IF EXISTS org_isolation_tenancy_participants ON tenancy_participants"))
    conn.execute(
        text(
            """
            CREATE POLICY org_isolation_tenancy_participants ON tenancy_participants FOR ALL
            USING (organization_id::text = current_setting('app.current_organization_id', true))
            WITH CHECK (organization_id::text = current_setting('app.current_organization_id', true))
            """
        )
    )


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(text("DROP POLICY IF EXISTS org_isolation_tenancy_participants ON tenancy_participants"))
    conn.execute(text("ALTER TABLE tenancy_participants DISABLE ROW LEVEL SECURITY"))
    op.drop_index("ix_tenancy_participants_tenant_id", table_name="tenancy_participants")
    op.drop_index("ix_tenancy_participants_tenancy_id", table_name="tenancy_participants")
    op.drop_index("ix_tenancy_participants_organization_id", table_name="tenancy_participants")
    op.drop_table("tenancy_participants")
