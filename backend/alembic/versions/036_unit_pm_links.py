"""Unit: optional landlord_id (Verwaltung) and property_manager_id (Bewirtschafter); property_managers table.

Revision ID: 036_unit_pm_links
Revises: 035_tenant_deposit_provider
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text

revision: str = "036_unit_pm_links"
down_revision: Union[str, None] = "035_tenant_deposit_provider"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "property_managers",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("organization_id", sa.String(), nullable=False),
        sa.Column("landlord_id", sa.String(), nullable=True),
        sa.Column("name", sa.String(), nullable=False, server_default=""),
        sa.Column("email", sa.String(), nullable=True),
        sa.Column("phone", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["organization_id"], ["organization.id"]),
        sa.ForeignKeyConstraint(["landlord_id"], ["landlords.id"]),
    )
    op.create_index("ix_property_managers_organization_id", "property_managers", ["organization_id"])
    op.create_index("ix_property_managers_landlord_id", "property_managers", ["landlord_id"])

    conn = op.get_bind()
    conn.execute(text("ALTER TABLE property_managers ENABLE ROW LEVEL SECURITY"))
    conn.execute(text("DROP POLICY IF EXISTS org_isolation_property_managers ON property_managers"))
    conn.execute(
        text(
            """
            CREATE POLICY org_isolation_property_managers ON property_managers FOR ALL
            USING (organization_id::text = current_setting('app.current_organization_id', true))
            WITH CHECK (organization_id::text = current_setting('app.current_organization_id', true))
            """
        )
    )

    op.add_column("unit", sa.Column("landlord_id", sa.String(), nullable=True))
    op.add_column("unit", sa.Column("property_manager_id", sa.String(), nullable=True))
    op.create_foreign_key(
        "unit_landlord_id_fkey",
        "unit",
        "landlords",
        ["landlord_id"],
        ["id"],
    )
    op.create_foreign_key(
        "unit_property_manager_id_fkey",
        "unit",
        "property_managers",
        ["property_manager_id"],
        ["id"],
    )
    op.create_index("ix_unit_landlord_id", "unit", ["landlord_id"])
    op.create_index("ix_unit_property_manager_id", "unit", ["property_manager_id"])


def downgrade() -> None:
    op.drop_index("ix_unit_property_manager_id", table_name="unit")
    op.drop_index("ix_unit_landlord_id", table_name="unit")
    op.drop_constraint("unit_property_manager_id_fkey", "unit", type_="foreignkey")
    op.drop_constraint("unit_landlord_id_fkey", "unit", type_="foreignkey")
    op.drop_column("unit", "property_manager_id")
    op.drop_column("unit", "landlord_id")

    conn = op.get_bind()
    conn.execute(text("DROP POLICY IF EXISTS org_isolation_property_managers ON property_managers"))
    conn.execute(text("ALTER TABLE property_managers DISABLE ROW LEVEL SECURITY"))

    op.drop_index("ix_property_managers_landlord_id", table_name="property_managers")
    op.drop_index("ix_property_managers_organization_id", table_name="property_managers")
    op.drop_table("property_managers")
