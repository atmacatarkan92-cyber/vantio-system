"""Initial schema from db/models.py (sync SQLModel/PostgreSQL).

Revision ID: 001_initial
Revises: None
Create Date: Initial revision for FeelAtHomeNow backend.

Safe usage:
- New/empty database: run `alembic upgrade head` to create all tables.
- Existing database (tables already created by create_db() or scripts): run
  `alembic stamp head` only. Do NOT run upgrade head, or you will get
  "relation already exists" errors.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Reference and operational (no FKs or FK to cities only)
    op.create_table(
        "cities",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("code", sa.String(), nullable=False),
        sa.Column("name_de", sa.String(), nullable=False),
        sa.Column("name_en", sa.String(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_cities_code", "cities", ["code"], unique=True)

    op.create_table(
        "unit",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("address", sa.String(), nullable=False),
        sa.Column("city", sa.String(), nullable=False),
        sa.Column("rooms", sa.Integer(), nullable=False),
        sa.Column("type", sa.String(50), nullable=True),
        sa.Column("city_id", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["city_id"], ["cities.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_unit_city_id", "unit", ["city_id"], unique=False)

    op.create_table(
        "room",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("unit_id", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("price", sa.Integer(), nullable=False),
        sa.Column("floor", sa.Integer(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(["unit_id"], ["unit.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_room_unit_id", "room", ["unit_id"], unique=False)

    # 2. Listings (depend on unit, room, cities)
    op.create_table(
        "listings",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("unit_id", sa.String(), nullable=False),
        sa.Column("room_id", sa.String(), nullable=True),
        sa.Column("city_id", sa.String(), nullable=False),
        sa.Column("slug", sa.String(), nullable=False),
        sa.Column("title_de", sa.String(), nullable=False),
        sa.Column("title_en", sa.String(), nullable=False),
        sa.Column("description_de", sa.String(), nullable=False),
        sa.Column("description_en", sa.String(), nullable=False),
        sa.Column("price_chf_month", sa.Integer(), nullable=False),
        sa.Column("bedrooms", sa.Integer(), nullable=False),
        sa.Column("bathrooms", sa.Integer(), nullable=False),
        sa.Column("size_sqm", sa.Integer(), nullable=False),
        sa.Column("latitude", sa.Float(), nullable=True),
        sa.Column("longitude", sa.Float(), nullable=True),
        sa.Column("is_published", sa.Boolean(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("availability_status", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["city_id"], ["cities.id"]),
        sa.ForeignKeyConstraint(["room_id"], ["room.id"]),
        sa.ForeignKeyConstraint(["unit_id"], ["unit.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_listings_availability_status", "listings", ["availability_status"], unique=False)
    op.create_index("ix_listings_city_id", "listings", ["city_id"], unique=False)
    op.create_index("ix_listings_is_published", "listings", ["is_published"], unique=False)
    op.create_index("ix_listings_room_id", "listings", ["room_id"], unique=False)
    op.create_index("ix_listings_slug", "listings", ["slug"], unique=True)
    op.create_index("ix_listings_unit_id", "listings", ["unit_id"], unique=False)

    op.create_table(
        "listing_images",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("listing_id", sa.String(), nullable=False),
        sa.Column("url", sa.String(), nullable=False),
        sa.Column("is_main", sa.Boolean(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["listing_id"], ["listings.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_listing_images_listing_id", "listing_images", ["listing_id"], unique=False)

    op.create_table(
        "listing_amenities",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("listing_id", sa.String(), nullable=False),
        sa.Column("label_de", sa.String(), nullable=False),
        sa.Column("label_en", sa.String(), nullable=False),
        sa.ForeignKeyConstraint(["listing_id"], ["listings.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_listing_amenities_listing_id", "listing_amenities", ["listing_id"], unique=False)

    # 3. Inquiries (optional FK to listings)
    op.create_table(
        "inquiries",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("email", sa.String(200), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("phone", sa.String(50), nullable=True),
        sa.Column("company", sa.String(200), nullable=True),
        sa.Column("language", sa.String(10), nullable=True),
        sa.Column("apartment_id", sa.String(), nullable=True),
        sa.Column("email_sent", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["apartment_id"], ["listings.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_inquiries_apartment_id", "inquiries", ["apartment_id"], unique=False)

    # 4. Tenant and tenancies
    op.create_table(
        "tenant",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("room_id", sa.String(), nullable=True),
        sa.Column("phone", sa.String(50), nullable=True),
        sa.Column("company", sa.String(200), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_tenant_room_id", "tenant", ["room_id"], unique=False)

    op.create_table(
        "tenancies",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("tenant_id", sa.String(), nullable=False),
        sa.Column("room_id", sa.String(), nullable=False),
        sa.Column("unit_id", sa.String(), nullable=False),
        sa.Column("move_in_date", sa.Date(), nullable=False),
        sa.Column("move_out_date", sa.Date(), nullable=True),
        sa.Column("rent_chf", sa.Float(), nullable=False),
        sa.Column("deposit_chf", sa.Float(), nullable=True),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["room_id"], ["room.id"]),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenant.id"]),
        sa.ForeignKeyConstraint(["unit_id"], ["unit.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_tenancies_room_id", "tenancies", ["room_id"], unique=False)
    op.create_index("ix_tenancies_status", "tenancies", ["status"], unique=False)
    op.create_index("ix_tenancies_tenant_id", "tenancies", ["tenant_id"], unique=False)
    op.create_index("ix_tenancies_unit_id", "tenancies", ["unit_id"], unique=False)

    # 5. Invoices (no FK constraints in model; id columns are string refs)
    op.create_table(
        "invoices",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("invoice_number", sa.String(64), nullable=True),
        sa.Column("tenant_id", sa.String(), nullable=True),
        sa.Column("tenancy_id", sa.String(), nullable=True),
        sa.Column("room_id", sa.String(), nullable=True),
        sa.Column("unit_id", sa.String(), nullable=True),
        sa.Column("billing_year", sa.Integer(), nullable=True),
        sa.Column("billing_month", sa.Integer(), nullable=True),
        sa.Column("amount", sa.Float(), nullable=False),
        sa.Column("currency", sa.String(10), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("issue_date", sa.Date(), nullable=False),
        sa.Column("due_date", sa.Date(), nullable=False),
        sa.Column("paid_at", sa.DateTime(), nullable=True),
        sa.Column("payment_method", sa.String(100), nullable=True),
        sa.Column("payment_reference", sa.String(200), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_invoices_billing_month", "invoices", ["billing_month"], unique=False)
    op.create_index("ix_invoices_billing_year", "invoices", ["billing_year"], unique=False)
    op.create_index("ix_invoices_invoice_number", "invoices", ["invoice_number"], unique=False)
    op.create_index("ix_invoices_room_id", "invoices", ["room_id"], unique=False)
    op.create_index("ix_invoices_status", "invoices", ["status"], unique=False)
    op.create_index("ix_invoices_tenancy_id", "invoices", ["tenancy_id"], unique=False)
    op.create_index("ix_invoices_tenant_id", "invoices", ["tenant_id"], unique=False)
    op.create_index("ix_invoices_unit_id", "invoices", ["unit_id"], unique=False)

    # 6. Unit costs
    op.create_table(
        "unit_costs",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("unit_id", sa.String(), nullable=False),
        sa.Column("cost_type", sa.String(100), nullable=False),
        sa.Column("amount_chf", sa.Float(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["unit_id"], ["unit.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_unit_costs_unit_id", "unit_costs", ["unit_id"], unique=False)

    # 7. Auth: users and user_credentials
    op.create_table(
        "users",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("full_name", sa.String(), nullable=False),
        sa.Column("role", sa.String(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("last_login_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "user_credentials",
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("password_hash", sa.String(), nullable=False),
        sa.Column("password_algo", sa.String(), nullable=False),
        sa.Column("password_changed_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("user_id"),
    )


def downgrade() -> None:
    # Reverse order (drop tables with FKs first)
    op.drop_table("user_credentials")
    op.drop_index("ix_users_email", "users")
    op.drop_table("users")
    op.drop_index("ix_unit_costs_unit_id", "unit_costs")
    op.drop_table("unit_costs")
    op.drop_index("ix_invoices_unit_id", "invoices")
    op.drop_index("ix_invoices_tenant_id", "invoices")
    op.drop_index("ix_invoices_tenancy_id", "invoices")
    op.drop_index("ix_invoices_status", "invoices")
    op.drop_index("ix_invoices_room_id", "invoices")
    op.drop_index("ix_invoices_invoice_number", "invoices")
    op.drop_index("ix_invoices_billing_year", "invoices")
    op.drop_index("ix_invoices_billing_month", "invoices")
    op.drop_table("invoices")
    op.drop_index("ix_tenancies_unit_id", "tenancies")
    op.drop_index("ix_tenancies_tenant_id", "tenancies")
    op.drop_index("ix_tenancies_status", "tenancies")
    op.drop_index("ix_tenancies_room_id", "tenancies")
    op.drop_table("tenancies")
    op.drop_index("ix_tenant_room_id", "tenant")
    op.drop_table("tenant")
    op.drop_index("ix_inquiries_apartment_id", "inquiries")
    op.drop_table("inquiries")
    op.drop_index("ix_listing_amenities_listing_id", "listing_amenities")
    op.drop_table("listing_amenities")
    op.drop_index("ix_listing_images_listing_id", "listing_images")
    op.drop_table("listing_images")
    op.drop_index("ix_listings_unit_id", "listings")
    op.drop_index("ix_listings_slug", "listings")
    op.drop_index("ix_listings_room_id", "listings")
    op.drop_index("ix_listings_is_published", "listings")
    op.drop_index("ix_listings_city_id", "listings")
    op.drop_index("ix_listings_availability_status", "listings")
    op.drop_table("listings")
    op.drop_index("ix_room_unit_id", "room")
    op.drop_table("room")
    op.drop_index("ix_unit_city_id", "unit")
    op.drop_table("unit")
    op.drop_index("ix_cities_code", "cities")
    op.drop_table("cities")
