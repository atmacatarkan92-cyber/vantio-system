from sqlmodel import SQLModel, Field
from sqlalchemy import Column, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from datetime import datetime, date
from enum import Enum
from typing import Any, Optional
import uuid


# ---------------------------------------------------------------------------
# Reference: cities (for listings and units)
# ---------------------------------------------------------------------------

class City(SQLModel, table=True):
    """Reference table for city names (DE/EN) and code."""

    __tablename__ = "cities"

    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    code: str = Field(index=True, unique=True)  # e.g. "Zurich"
    name_de: str = Field(default="")
    name_en: str = Field(default="")


# ---------------------------------------------------------------------------
# Organization (multi-tenant V1)
# ---------------------------------------------------------------------------

class Organization(SQLModel, table=True):
    __tablename__ = "organization"

    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    name: str = Field(default="")
    # Human-stable idempotency key for onboarding (nullable for legacy rows). Enforced unique
    # in DB (see migration 062 ix_organization_slug); duplicate slugs fail at insert.
    slug: Optional[str] = Field(default=None, index=True, unique=True, max_length=128)
    created_at: datetime = Field(default_factory=datetime.utcnow)


# ---------------------------------------------------------------------------
# Landlords and properties (Phase D)
# ---------------------------------------------------------------------------

class Landlord(SQLModel, table=True):
    __tablename__ = "landlords"
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    organization_id: str = Field(foreign_key="organization.id", index=True)
    user_id: Optional[str] = Field(default=None, foreign_key="users.id", index=True)
    company_name: Optional[str] = Field(default=None)
    contact_name: str = Field(default="")
    email: str = Field(default="")
    phone: Optional[str] = Field(default=None)
    address_line1: Optional[str] = Field(default=None)
    postal_code: Optional[str] = Field(default=None)
    city: Optional[str] = Field(default=None)
    canton: Optional[str] = Field(default=None)
    website: Optional[str] = Field(default=None)
    notes: Optional[str] = Field(default=None)
    status: Optional[str] = Field(default="active")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    deleted_at: Optional[datetime] = Field(default=None)


class LandlordNote(SQLModel, table=True):
    """Internal CRM note on a landlord (organization-scoped)."""

    __tablename__ = "landlord_notes"

    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    landlord_id: str = Field(foreign_key="landlords.id", index=True)
    organization_id: str = Field(foreign_key="organization.id", index=True)
    content: str = Field(sa_column=Column(Text, nullable=False))
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    created_by_user_id: Optional[str] = Field(
        default=None, foreign_key="users.id", index=True, nullable=True
    )
    updated_at: Optional[datetime] = Field(default=None, nullable=True)
    updated_by_user_id: Optional[str] = Field(
        default=None, foreign_key="users.id", index=True, nullable=True
    )


class PropertyManager(SQLModel, table=True):
    """
    Bewirtschafter (property manager contact). Org-scoped; optional link to a Verwaltung (Landlord).
    """

    __tablename__ = "property_managers"

    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    organization_id: str = Field(foreign_key="organization.id", index=True)
    landlord_id: Optional[str] = Field(default=None, foreign_key="landlords.id", index=True)
    name: str = Field(default="")
    email: Optional[str] = Field(default=None)
    phone: Optional[str] = Field(default=None)
    status: str = Field(default="active", max_length=32)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = Field(default=None, nullable=True)


class PropertyManagerNote(SQLModel, table=True):
    """Internal CRM note on a property manager (organization-scoped)."""

    __tablename__ = "property_manager_notes"

    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    property_manager_id: str = Field(foreign_key="property_managers.id", index=True)
    organization_id: str = Field(foreign_key="organization.id", index=True)
    content: str = Field(sa_column=Column(Text, nullable=False))
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    created_by_user_id: Optional[str] = Field(
        default=None, foreign_key="users.id", index=True, nullable=True
    )


class Owner(SQLModel, table=True):
    """Eigentümer (property owner). Org-scoped contact; units link via unit.owner_id."""

    __tablename__ = "owners"

    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    organization_id: str = Field(foreign_key="organization.id", index=True)
    name: str = Field(default="")
    email: Optional[str] = Field(default=None)
    phone: Optional[str] = Field(default=None)
    address_line1: Optional[str] = Field(default=None)
    postal_code: Optional[str] = Field(default=None)
    city: Optional[str] = Field(default=None)
    canton: Optional[str] = Field(default=None)
    status: str = Field(default="active", max_length=32)
    notes: Optional[str] = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = Field(default=None, nullable=True)


class Property(SQLModel, table=True):
    __tablename__ = "properties"
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    organization_id: str = Field(foreign_key="organization.id", index=True)
    landlord_id: Optional[str] = Field(default=None, foreign_key="landlords.id", index=True)
    title: str = Field(default="")
    street: Optional[str] = Field(default=None)
    house_number: Optional[str] = Field(default=None)
    zip_code: Optional[str] = Field(default=None)
    city: Optional[str] = Field(default=None)
    country: Optional[str] = Field(default="CH")
    lat: Optional[float] = Field(default=None)
    lng: Optional[float] = Field(default=None)
    status: Optional[str] = Field(default="active")
    notes: Optional[str] = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    deleted_at: Optional[datetime] = Field(default=None)


# ---------------------------------------------------------------------------
# Operational: units + rooms (unchanged structure)
# ---------------------------------------------------------------------------

class Unit(SQLModel, table=True):
    __tablename__ = "unit"

    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    organization_id: str = Field(foreign_key="organization.id", index=True)
    title: str
    address: str
    city: str
    rooms: int
    type: Optional[str] = Field(default=None, max_length=50)
    city_id: Optional[str] = Field(default=None, foreign_key="cities.id", index=True)
    property_id: Optional[str] = Field(default=None, foreign_key="properties.id", index=True)
    landlord_id: Optional[str] = Field(default=None, foreign_key="landlords.id", index=True)
    property_manager_id: Optional[str] = Field(
        default=None, foreign_key="property_managers.id", index=True
    )
    owner_id: Optional[str] = Field(default=None, foreign_key="owners.id", index=True)
    tenant_price_monthly_chf: float = Field(default=0)
    landlord_rent_monthly_chf: float = Field(default=0)
    utilities_monthly_chf: float = Field(default=0)
    cleaning_cost_monthly_chf: float = Field(default=0)
    landlord_lease_start_date: Optional[date] = None
    available_from: Optional[date] = None
    occupancy_status: Optional[str] = Field(default=None, max_length=64)
    occupied_rooms: int = Field(default=0)
    postal_code: Optional[str] = Field(default=None, max_length=32)
    landlord_deposit_type: Optional[str] = Field(default=None, max_length=32)
    landlord_deposit_amount: Optional[float] = Field(default=None)
    landlord_deposit_annual_premium: Optional[float] = Field(default=None)
    lease_type: Optional[str] = Field(default=None, max_length=64)
    lease_start_date: Optional[date] = None
    lease_end_date: Optional[date] = None
    notice_given_date: Optional[date] = None
    termination_effective_date: Optional[date] = None
    returned_to_landlord_date: Optional[date] = None
    lease_status: Optional[str] = Field(default=None, max_length=64)
    lease_notes: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = Field(default=None, nullable=True)


class UnitDocument(SQLModel, table=True):
    """File metadata for unit attachments; binary stored in R2 (S3-compatible)."""

    __tablename__ = "unit_documents"

    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    organization_id: str = Field(foreign_key="organization.id", index=True)
    unit_id: str = Field(foreign_key="unit.id", index=True)
    file_name: Optional[str] = Field(default=None)
    file_url: str = Field(default="")
    object_key: Optional[str] = Field(default=None)
    file_size: Optional[int] = Field(default=None)
    mime_type: Optional[str] = Field(default=None)
    category: Optional[str] = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    uploaded_by: Optional[str] = Field(default=None, foreign_key="users.id", index=True)


class TenantDocument(SQLModel, table=True):
    """File metadata for tenant attachments; binary stored in R2 (S3-compatible)."""

    __tablename__ = "tenant_documents"

    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    organization_id: str = Field(foreign_key="organization.id", index=True)
    tenant_id: str = Field(foreign_key="tenant.id", index=True)
    file_name: Optional[str] = Field(default=None)
    file_url: str = Field(default="")
    object_key: Optional[str] = Field(default=None)
    file_size: Optional[int] = Field(default=None)
    mime_type: Optional[str] = Field(default=None)
    category: Optional[str] = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    uploaded_by: Optional[str] = Field(default=None, foreign_key="users.id", index=True)


class LandlordDocument(SQLModel, table=True):
    """File metadata for landlord (Verwaltung) attachments; binary stored in R2 (S3-compatible)."""

    __tablename__ = "landlord_documents"

    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    organization_id: str = Field(foreign_key="organization.id", index=True)
    landlord_id: str = Field(foreign_key="landlords.id", index=True)
    file_name: Optional[str] = Field(default=None)
    file_url: str = Field(default="")
    object_key: Optional[str] = Field(default=None)
    file_size: Optional[int] = Field(default=None)
    mime_type: Optional[str] = Field(default=None)
    category: Optional[str] = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    uploaded_by: Optional[str] = Field(default=None, foreign_key="users.id", index=True)


class OwnerDocument(SQLModel, table=True):
    """File metadata for owner (Eigentümer) attachments; binary stored in R2 (S3-compatible)."""

    __tablename__ = "owner_documents"

    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    organization_id: str = Field(foreign_key="organization.id", index=True)
    owner_id: str = Field(foreign_key="owners.id", index=True)
    file_name: Optional[str] = Field(default=None)
    file_url: str = Field(default="")
    object_key: Optional[str] = Field(default=None)
    file_size: Optional[int] = Field(default=None)
    mime_type: Optional[str] = Field(default=None)
    category: Optional[str] = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    uploaded_by: Optional[str] = Field(default=None, foreign_key="users.id", index=True)


class Room(SQLModel, table=True):
    __tablename__ = "room"

    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    unit_id: str = Field(foreign_key="unit.id", index=True)
    name: str
    # Planned target rent (Soll) for forecasting; actual rent is on tenancy / tenant.
    price: int = Field(default=0)
    floor: Optional[int] = Field(default=None)
    is_active: bool = Field(default=True)
    size_m2: Optional[float] = Field(default=None)
    # Legacy; admin UI derives operational status from tenancies where possible.
    status: str = Field(default="Frei", max_length=32)


# ---------------------------------------------------------------------------
# Website listing layer (public-facing; links to units/rooms)
# ---------------------------------------------------------------------------

class Listing(SQLModel, table=True):
    """
    One public listing (website card). Links to one Unit; optionally to one Room.
    """

    __tablename__ = "listings"

    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    unit_id: str = Field(foreign_key="unit.id", index=True)
    room_id: Optional[str] = Field(default=None, foreign_key="room.id", index=True)
    city_id: str = Field(foreign_key="cities.id", index=True)

    slug: str = Field(unique=True, index=True)
    title_de: str = Field(default="")
    title_en: str = Field(default="")
    description_de: str = Field(default="")
    description_en: str = Field(default="")

    price_chf_month: int = Field(default=0)
    bedrooms: int = Field(default=0)
    bathrooms: int = Field(default=0)
    size_sqm: int = Field(default=0)

    latitude: Optional[float] = Field(default=None)
    longitude: Optional[float] = Field(default=None)

    is_published: bool = Field(default=False, index=True)
    sort_order: int = Field(default=0)
    availability_status: str = Field(default="available", index=True)  # available | occupied | unavailable

    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class ListingImage(SQLModel, table=True):
    """Image for a listing (gallery + main)."""

    __tablename__ = "listing_images"

    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    listing_id: str = Field(foreign_key="listings.id", index=True)
    url: str = Field(default="")
    is_main: bool = Field(default=False)
    position: int = Field(default=0)


class ListingAmenity(SQLModel, table=True):
    """Amenity label (DE/EN) for a listing."""

    __tablename__ = "listing_amenities"

    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    listing_id: str = Field(foreign_key="listings.id", index=True)
    label_de: str = Field(default="")
    label_en: str = Field(default="")


# ---------------------------------------------------------------------------
# Contact inquiries (website form)
# ---------------------------------------------------------------------------

class Inquiry(SQLModel, table=True):
    """Contact form submission. Stored in PostgreSQL."""

    __tablename__ = "inquiries"

    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    name: str = Field(max_length=200)
    email: str = Field(max_length=200)
    message: str
    phone: Optional[str] = Field(default=None, max_length=50)
    company: Optional[str] = Field(default=None, max_length=200)
    language: Optional[str] = Field(default="de", max_length=10)
    apartment_id: Optional[str] = Field(default=None, foreign_key="listings.id", index=True)
    organization_id: Optional[str] = Field(default=None, foreign_key="organization.id", index=True)
    email_sent: bool = Field(default=False)
    created_at: datetime = Field(default_factory=datetime.utcnow)


# ---------------------------------------------------------------------------
# Tenants (operational)
# ---------------------------------------------------------------------------

class Tenant(SQLModel, table=True):
    __tablename__ = "tenant"

    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    organization_id: str = Field(foreign_key="organization.id", index=True)
    user_id: Optional[str] = Field(default=None, foreign_key="users.id", index=True, unique=True)
    name: str
    first_name: Optional[str] = Field(default=None, max_length=200)
    last_name: Optional[str] = Field(default=None, max_length=200)
    birth_date: Optional[date] = Field(default=None)
    street: Optional[str] = Field(default=None, max_length=300)
    postal_code: Optional[str] = Field(default=None, max_length=32)
    city: Optional[str] = Field(default=None, max_length=120)
    country: Optional[str] = Field(default=None, max_length=120)
    nationality: Optional[str] = Field(default=None, max_length=120)
    is_swiss: Optional[bool] = Field(default=None)
    residence_permit: Optional[str] = Field(default=None, max_length=200)
    email: str = Field(default="")
    room_id: Optional[str] = Field(default=None, index=True, nullable=True)
    phone: Optional[str] = Field(default=None, max_length=50)
    company: Optional[str] = Field(default=None, max_length=200)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class TenantNote(SQLModel, table=True):
    """Internal CRM note on a tenant (organization-scoped)."""

    __tablename__ = "tenant_notes"

    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    tenant_id: str = Field(foreign_key="tenant.id", index=True)
    organization_id: str = Field(foreign_key="organization.id", index=True)
    content: str = Field(sa_column=Column(Text, nullable=False))
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    created_by_user_id: Optional[str] = Field(
        default=None, foreign_key="users.id", index=True, nullable=True
    )


class TenantEvent(SQLModel, table=True):
    """Lightweight activity / audit row for tenant CRM timeline."""

    __tablename__ = "tenant_events"

    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    tenant_id: str = Field(foreign_key="tenant.id", index=True)
    organization_id: str = Field(foreign_key="organization.id", index=True)
    action_type: str = Field(max_length=64, index=True)
    field_name: Optional[str] = Field(default=None, max_length=128)
    old_value: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    new_value: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    summary: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    created_by_user_id: Optional[str] = Field(
        default=None, foreign_key="users.id", index=True, nullable=True
    )


class TenancyStatus(str, Enum):
    active = "active"
    ended = "ended"
    reserved = "reserved"


class TenancyParticipantRole(str, Enum):
    """Role of a person on a tenancy (occupancy contract). Not boolean flags."""

    primary_tenant = "primary_tenant"
    co_tenant = "co_tenant"
    solidarhafter = "solidarhafter"


class Tenancy(SQLModel, table=True):
    """
    Links a tenant to a room for a period. Used for occupancy and revenue.
    One tenancy row = one room slot / occupancy contract. People on that contract
    are modeled in TenancyParticipant; tenant_id remains the primary tenant for
    invoice and backward compatibility (Phase 1).
    """

    __tablename__ = "tenancies"

    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    organization_id: str = Field(foreign_key="organization.id", index=True)
    tenant_id: str = Field(foreign_key="tenant.id", index=True)
    room_id: str = Field(foreign_key="room.id", index=True)
    unit_id: str = Field(foreign_key="unit.id", index=True)
    move_in_date: date = Field(...)
    move_out_date: Optional[date] = Field(default=None)
    notice_given_at: Optional[date] = Field(default=None)
    termination_effective_date: Optional[date] = Field(default=None)
    actual_move_out_date: Optional[date] = Field(default=None)
    terminated_by: Optional[str] = Field(default=None, max_length=32)
    monthly_rent: float = Field(default=0)
    deposit_amount: Optional[float] = Field(default=None)
    tenant_deposit_type: Optional[str] = Field(default=None, max_length=32)
    tenant_deposit_amount: Optional[float] = Field(default=None)
    tenant_deposit_annual_premium: Optional[float] = Field(default=None)
    tenant_deposit_provider: Optional[str] = Field(default=None, max_length=32)
    status: TenancyStatus = Field(default=TenancyStatus.active, index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class TenancyParticipant(SQLModel, table=True):
    """
    People linked to one tenancy (occupancy contract). One tenancy row = one room slot;
    participants identify primary tenant, co-tenants, and solidarhafters.
    Phase 1: tenancy.tenant_id is kept in sync with the primary_tenant participant row
    for invoices and legacy readers.
    """

    __tablename__ = "tenancy_participants"
    __table_args__ = (
        UniqueConstraint("tenancy_id", "tenant_id", name="uq_tenancy_participant_tenancy_tenant"),
    )

    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    organization_id: str = Field(foreign_key="organization.id", index=True)
    tenancy_id: str = Field(foreign_key="tenancies.id", index=True)
    tenant_id: str = Field(foreign_key="tenant.id", index=True)
    role: str = Field(max_length=32)
    created_at: datetime = Field(default_factory=datetime.utcnow)


# ---------------------------------------------------------------------------
# Tenancy revenue (V1: tenancy-driven pricing lines)
# ---------------------------------------------------------------------------

class TenancyRevenue(SQLModel, table=True):
    """
    Revenue line item attached to a tenancy.
    Frequency defines how it contributes to normalized monthly revenue:
    - monthly: full
    - yearly: amount_chf / 12
    - one_time: excluded from monthly profit/KPIs (still stored + auditable)
    start_date/end_date optionally scope the line within the tenancy lifecycle.
    """

    __tablename__ = "tenancy_revenue"

    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    organization_id: str = Field(foreign_key="organization.id", index=True)
    tenancy_id: str = Field(foreign_key="tenancies.id", index=True)
    type: str = Field(max_length=64)  # e.g. rent, service_fee, furniture, setup_fee, discount
    amount_chf: float = Field(default=0)
    frequency: str = Field(default="monthly", max_length=32)
    start_date: Optional[date] = Field(default=None)
    end_date: Optional[date] = Field(default=None)
    notes: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = Field(default=None, nullable=True)


# ---------------------------------------------------------------------------
# Invoices (billing from tenancies; payment tracking)
# ---------------------------------------------------------------------------

class Invoice(SQLModel, table=True):
    """
    Invoice record. id is auto-generated (SERIAL) on insert.
    Links to tenant/tenancy/room/unit for reporting; billing_year/billing_month for duplicate prevention.
    """

    __tablename__ = "invoices"

    id: Optional[int] = Field(default=None, primary_key=True)
    organization_id: str = Field(foreign_key="organization.id", index=True)
    invoice_number: Optional[str] = Field(default=None, max_length=64, index=True)
    tenant_id: Optional[str] = Field(default=None, index=True)
    tenancy_id: Optional[str] = Field(default=None, index=True)
    room_id: Optional[str] = Field(default=None, index=True)
    unit_id: Optional[str] = Field(default=None, index=True)
    billing_year: Optional[int] = Field(default=None, index=True)
    billing_month: Optional[int] = Field(default=None, index=True)
    amount: float = Field(default=0)
    currency: str = Field(default="CHF", max_length=10)
    status: str = Field(default="unpaid", max_length=32, index=True)  # unpaid | paid | open | overdue | cancelled
    issue_date: date = Field(...)
    due_date: date = Field(...)
    paid_at: Optional[datetime] = Field(default=None)
    payment_method: Optional[str] = Field(default=None, max_length=100)
    payment_reference: Optional[str] = Field(default=None, max_length=200)


# ---------------------------------------------------------------------------
# Unit costs (for profit calculation)
# ---------------------------------------------------------------------------

class UnitCost(SQLModel, table=True):
    """
    Recurring or one-off cost per unit (e.g. rent, utilities, cleaning).
    amount_chf is treated as monthly for profit calculation.
    """

    __tablename__ = "unit_costs"

    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    unit_id: str = Field(foreign_key="unit.id", index=True)
    cost_type: str = Field(max_length=100)  # e.g. "rent", "utilities", "cleaning"
    amount_chf: float = Field(default=0)
    frequency: str = Field(default="monthly", max_length=32)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class UserRole(str, Enum):
    """Roles allowed by DB CHECK (users_role_allowed)."""
    admin = "admin"
    manager = "manager"
    landlord = "landlord"
    tenant = "tenant"
    support = "support"
    # Vantio platform operators; not a customer org role. See migration 063_platform_admin_role.
    platform_admin = "platform_admin"


class User(SQLModel, table=True):
    """
    Authentication user for all portals (admin, tenant, landlord, manager).
    Scoped to an organization; uniqueness of email is per-organization (see migration uq_users_organization_email_lower).
    """

    __tablename__ = "users"

    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    organization_id: str = Field(foreign_key="organization.id", index=True)
    email: str = Field(index=True)
    full_name: str
    role: UserRole = Field(
        default=UserRole.admin,
        description="Application role (must match users_role_allowed CHECK).",
    )
    is_active: bool = Field(default=True)
    last_login_at: datetime | None = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class UserCredentials(SQLModel, table=True):
    """
    Password-based credentials for a user. Exists only for password auth.
    """

    __tablename__ = "user_credentials"

    user_id: str = Field(primary_key=True, foreign_key="users.id")
    organization_id: Optional[str] = Field(default=None, foreign_key="organization.id", index=True)
    password_hash: str
    password_algo: str = Field(default="argon2id")
    password_changed_at: datetime = Field(default_factory=datetime.utcnow)


class RefreshToken(SQLModel, table=True):
    __tablename__ = "refresh_tokens"
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    user_id: str = Field(foreign_key="users.id", index=True)
    organization_id: Optional[str] = Field(default=None, foreign_key="organization.id", index=True)
    token_hash: str = Field(index=True)
    expires_at: datetime = Field(index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    revoked_at: datetime | None = None
    replaced_by_token_id: str | None = Field(default=None, foreign_key="refresh_tokens.id", index=True)


class PasswordResetToken(SQLModel, table=True):
    """
    Password reset tokens (custom recovery flow).

    Security:
    - only store token_hash in DB
    - single-use enforced via used_at
    - expiration enforced via expires_at (checked in code)
    """

    __tablename__ = "password_reset_tokens"

    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    user_id: str = Field(foreign_key="users.id", index=True)
    token_hash: str = Field(index=True, unique=True)
    expires_at: datetime = Field(index=True)
    used_at: datetime | None = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


# ---------------------------------------------------------------------------
# Audit log (V1: write-action trail)
# ---------------------------------------------------------------------------

class AuditLog(SQLModel, table=True):
    """Immutable log of create/update/delete actions on key entities."""

    __tablename__ = "audit_logs"

    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    organization_id: str = Field(foreign_key="organization.id", index=True)
    actor_user_id: Optional[str] = Field(default=None, foreign_key="users.id", index=True)
    action: str = Field(max_length=32, index=True)  # create | update | delete
    entity_type: str = Field(max_length=64, index=True)  # unit | tenant | tenancy | ...
    entity_id: str = Field(max_length=64, index=True)
    old_values: Optional[dict] = Field(
        default=None,
        sa_column=Column(JSONB, nullable=True),
    )
    new_values: Optional[dict] = Field(
        default=None,
        sa_column=Column(JSONB, nullable=True),
    )
    created_at: datetime = Field(default_factory=datetime.utcnow)