"""Inventory catalog (stock) + assignments (distribution to units/rooms).

Revision ID: 066_inventory_catalog_and_assignments
Revises: 065_email_verification_schema

- inventory_items: org-scoped article stock with total_quantity (not UnitCost).
- inventory_assignments: quantity per unit/optional room; sum(assignments) <= total_quantity.
- Unique (inventory_item_id, unit_id, COALESCE(room_id::text, '')) prevents duplicate slots.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import text

revision: str = "066_inventory_catalog_and_assignments"
down_revision: Union[str, None] = "065_email_verification_schema"
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
        "inventory_items",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("organization_id", org_id_type, nullable=False),
        sa.Column("inventory_number", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=500), nullable=False),
        sa.Column("category", sa.String(length=200), nullable=False, server_default=""),
        sa.Column("brand", sa.String(length=200), nullable=True),
        sa.Column("total_quantity", sa.Integer(), nullable=False, server_default=sa.text("1")),
        sa.Column("condition", sa.String(length=100), nullable=False, server_default=""),
        sa.Column("status", sa.String(length=100), nullable=False, server_default="active"),
        sa.Column("purchase_price_chf", sa.Float(), nullable=True),
        sa.Column("purchase_date", sa.Date(), nullable=True),
        sa.Column("purchased_from", sa.String(length=500), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["organization_id"], ["organization.id"]),
        sa.UniqueConstraint(
            "organization_id",
            "inventory_number",
            name="uq_inventory_items_org_inventory_number",
        ),
    )
    op.create_index("ix_inventory_items_organization_id", "inventory_items", ["organization_id"])
    op.create_index("ix_inventory_items_inventory_number", "inventory_items", ["inventory_number"])

    op.create_table(
        "inventory_assignments",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("organization_id", org_id_type, nullable=False),
        sa.Column("inventory_item_id", sa.String(), nullable=False),
        sa.Column("unit_id", sa.String(), nullable=False),
        sa.Column("room_id", sa.String(), nullable=True),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["organization_id"], ["organization.id"]),
        sa.ForeignKeyConstraint(["inventory_item_id"], ["inventory_items.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["unit_id"], ["unit.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["room_id"], ["room.id"], ondelete="SET NULL"),
    )
    op.create_index(
        "ix_inventory_assignments_organization_id",
        "inventory_assignments",
        ["organization_id"],
    )
    op.create_index(
        "ix_inventory_assignments_inventory_item_id",
        "inventory_assignments",
        ["inventory_item_id"],
    )
    op.create_index("ix_inventory_assignments_unit_id", "inventory_assignments", ["unit_id"])
    op.create_index("ix_inventory_assignments_room_id", "inventory_assignments", ["room_id"])

    conn.execute(
        text(
            """
            CREATE UNIQUE INDEX uq_inventory_assignments_item_unit_room
            ON inventory_assignments (
                inventory_item_id,
                unit_id,
                (COALESCE(room_id::text, ''))
            )
            """
        )
    )

    for tbl in ("inventory_items", "inventory_assignments"):
        conn.execute(text(f"ALTER TABLE {tbl} ENABLE ROW LEVEL SECURITY"))
        conn.execute(text(f"ALTER TABLE {tbl} FORCE ROW LEVEL SECURITY"))
        conn.execute(text(f"DROP POLICY IF EXISTS org_isolation_{tbl} ON {tbl}"))
        conn.execute(
            text(
                f"""
                CREATE POLICY org_isolation_{tbl} ON {tbl} FOR ALL
                USING (organization_id::text = current_setting('app.current_organization_id', true))
                WITH CHECK (organization_id::text = current_setting('app.current_organization_id', true))
                """
            )
        )


def downgrade() -> None:
    conn = op.get_bind()
    for tbl in ("inventory_assignments", "inventory_items"):
        conn.execute(text(f"DROP POLICY IF EXISTS org_isolation_{tbl} ON {tbl}"))
        conn.execute(text(f"ALTER TABLE {tbl} DISABLE ROW LEVEL SECURITY"))

    conn.execute(text("DROP INDEX IF EXISTS uq_inventory_assignments_item_unit_room"))

    op.drop_index("ix_inventory_assignments_room_id", table_name="inventory_assignments")
    op.drop_index("ix_inventory_assignments_unit_id", table_name="inventory_assignments")
    op.drop_index(
        "ix_inventory_assignments_inventory_item_id", table_name="inventory_assignments"
    )
    op.drop_index(
        "ix_inventory_assignments_organization_id", table_name="inventory_assignments"
    )
    op.drop_table("inventory_assignments")

    op.drop_index("ix_inventory_items_inventory_number", table_name="inventory_items")
    op.drop_index("ix_inventory_items_organization_id", table_name="inventory_items")
    op.drop_table("inventory_items")
