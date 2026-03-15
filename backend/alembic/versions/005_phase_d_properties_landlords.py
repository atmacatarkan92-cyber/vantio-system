"""Phase D: add properties table, finalize landlords structure, unit.property_id.

Revision ID: 005_phase_d
Revises: 004_tenancies_unit_id
Create Date: Phase D properties and landlords.

- Rename landlords -> landlords_legacy (no drop, no data migration).
- Create new landlords table (id, user_id FK users.id, company_name, contact_name, email, phone, notes, status, created_at, updated_at, deleted_at).
- Create new properties table (id, landlord_id FK landlords.id, title, street, house_number, zip_code, city, country, lat, lng, status, notes, created_at, updated_at, deleted_at).
- Add unit.property_id (nullable, FK properties.id, index).
Uses VARCHAR for IDs to match existing schema (users.id, unit.id).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "005_phase_d"
down_revision: Union[str, None] = "004_tenancies_unit_id"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Step 1: Rename existing landlords table to landlords_legacy
    op.rename_table("landlords", "landlords_legacy")

    # Step 2: Create new landlords table (IDs as VARCHAR to match users.id for FK)
    op.create_table(
        "landlords",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=True),
        sa.Column("company_name", sa.String(), nullable=True),
        sa.Column("contact_name", sa.String(), nullable=False),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("phone", sa.String(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("status", sa.String(), nullable=True, server_default="active"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
    )
    op.create_index("ix_landlords_user_id", "landlords", ["user_id"], unique=False)

    # Step 3: Create new properties table
    op.create_table(
        "properties",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("landlord_id", sa.String(), nullable=True),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("street", sa.String(), nullable=True),
        sa.Column("house_number", sa.String(), nullable=True),
        sa.Column("zip_code", sa.String(), nullable=True),
        sa.Column("city", sa.String(), nullable=True),
        sa.Column("country", sa.String(), nullable=True, server_default="CH"),
        sa.Column("lat", sa.Float(), nullable=True),
        sa.Column("lng", sa.Float(), nullable=True),
        sa.Column("status", sa.String(), nullable=True, server_default="active"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["landlord_id"], ["landlords.id"]),
    )
    op.create_index("ix_properties_landlord_id", "properties", ["landlord_id"], unique=False)

    # Step 4: Add property_id to unit table
    op.add_column(
        "unit",
        sa.Column("property_id", sa.String(), nullable=True),
    )
    op.create_foreign_key(
        "unit_property_id_fkey",
        "unit",
        "properties",
        ["property_id"],
        ["id"],
    )
    op.create_index("ix_unit_property_id", "unit", ["property_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_unit_property_id", "unit")
    op.drop_constraint("unit_property_id_fkey", "unit", type_="foreignkey")
    op.drop_column("unit", "property_id")

    op.drop_index("ix_properties_landlord_id", "properties")
    op.drop_table("properties")

    op.drop_index("ix_landlords_user_id", "landlords")
    op.drop_table("landlords")

    op.rename_table("landlords_legacy", "landlords")
