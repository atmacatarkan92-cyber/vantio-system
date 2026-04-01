"""Create tenancy_revenue table (tenancy-driven revenue lines).

Revision ID: 057_tenancy_revenue
Revises: 056_unit_cost_frequency
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text

revision: str = "057_tenancy_revenue"
down_revision: Union[str, None] = "056_unit_cost_frequency"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _organization_id_column_sa_type(conn) -> sa.types.TypeEngine:
    r = conn.execute(
        text(
            """
            SELECT data_type FROM information_schema.columns
            WHERE table_schema = current_schema()
              AND table_name = 'organization'
              AND column_name = 'id'
            """
        )
    ).scalar()
    if not r:
        return sa.String()
    dtl = str(r).lower()
    if "uuid" in dtl:
        return sa.UUID()
    return sa.String()


def upgrade() -> None:
    conn = op.get_bind()
    org_id_type = _organization_id_column_sa_type(conn)

    op.create_table(
        "tenancy_revenue",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("organization_id", org_id_type, nullable=False),
        sa.Column("tenancy_id", sa.String(), nullable=False),
        sa.Column("type", sa.String(length=64), nullable=False),
        sa.Column("amount_chf", sa.Float(), nullable=False, server_default="0"),
        sa.Column("frequency", sa.String(length=32), nullable=False, server_default="monthly"),
        sa.Column("start_date", sa.Date(), nullable=True),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["organization_id"], ["organization.id"]),
        sa.ForeignKeyConstraint(["tenancy_id"], ["tenancies.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_tenancy_revenue_organization_id", "tenancy_revenue", ["organization_id"])
    op.create_index("ix_tenancy_revenue_tenancy_id", "tenancy_revenue", ["tenancy_id"])

    conn.execute(text("ALTER TABLE tenancy_revenue ENABLE ROW LEVEL SECURITY"))
    conn.execute(text("DROP POLICY IF EXISTS org_isolation_tenancy_revenue ON tenancy_revenue"))
    conn.execute(
        text(
            """
            CREATE POLICY org_isolation_tenancy_revenue ON tenancy_revenue FOR ALL
            USING (organization_id::text = current_setting('app.current_organization_id', true))
            WITH CHECK (organization_id::text = current_setting('app.current_organization_id', true))
            """
        )
    )


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(text("DROP POLICY IF EXISTS org_isolation_tenancy_revenue ON tenancy_revenue"))
    conn.execute(text("ALTER TABLE tenancy_revenue DISABLE ROW LEVEL SECURITY"))

    op.drop_index("ix_tenancy_revenue_tenancy_id", table_name="tenancy_revenue")
    op.drop_index("ix_tenancy_revenue_organization_id", table_name="tenancy_revenue")
    op.drop_table("tenancy_revenue")

