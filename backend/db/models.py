from sqlmodel import SQLModel, Field
from datetime import datetime, date
from enum import Enum
from typing import Optional
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
# Landlords and properties (Phase D)
# ---------------------------------------------------------------------------

class Landlord(SQLModel, table=True):
    __tablename__ = "landlords"
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    user_id: Optional[str] = Field(default=None, foreign_key="users.id", index=True)
    company_name: Optional[str] = Field(default=None)
    contact_name: str = Field(default="")
    email: str = Field(default="")
    phone: Optional[str] = Field(default=None)
    notes: Optional[str] = Field(default=None)
    status: Optional[str] = Field(default="active")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    deleted_at: Optional[datetime] = Field(default=None)


class Property(SQLModel, table=True):
    __tablename__ = "properties"
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
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
    title: str
    address: str
    city: str
    rooms: int
    type: Optional[str] = Field(default=None, max_length=50)
    city_id: Optional[str] = Field(default=None, foreign_key="cities.id", index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Room(SQLModel, table=True):
    __tablename__ = "room"

    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    unit_id: str = Field(index=True)
    name: str
    price: int = Field(default=0)
    floor: Optional[int] = Field(default=None)
    is_active: bool = Field(default=True)


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
    email_sent: bool = Field(default=False)
    created_at: datetime = Field(default_factory=datetime.utcnow)


# ---------------------------------------------------------------------------
# Tenants (operational)
# ---------------------------------------------------------------------------

class Tenant(SQLModel, table=True):
    __tablename__ = "tenant"

    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    user_id: Optional[str] = Field(default=None, foreign_key="users.id", index=True, unique=True)
    name: str
    email: str = Field(default="")
    room_id: Optional[str] = Field(default=None, index=True)
    phone: Optional[str] = Field(default=None, max_length=50)
    company: Optional[str] = Field(default=None, max_length=200)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class TenancyStatus(str, Enum):
    active = "active"
    ended = "ended"
    reserved = "reserved"


class Tenancy(SQLModel, table=True):
    """
    Links a tenant to a room for a period. Used for occupancy and revenue.
    Aligned to live DB column names where they differ from default (move_out_date date, monthly_rent, deposit_amount).
    """

    __tablename__ = "tenancies"

    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    tenant_id: str = Field(foreign_key="tenant.id", index=True)
    room_id: str = Field(foreign_key="room.id", index=True)
    unit_id: str = Field(foreign_key="unit.id", index=True)
    move_in_date: date = Field(...)
    move_out_date: Optional[date] = Field(default=None, sa_column_kwargs={"name": "move_out_date date"})
    rent_chf: float = Field(default=0, sa_column_kwargs={"name": "monthly_rent"})
    deposit_chf: Optional[float] = Field(default=None, sa_column_kwargs={"name": "deposit_amount"})
    status: TenancyStatus = Field(default=TenancyStatus.active, index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)


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
    created_at: datetime = Field(default_factory=datetime.utcnow)


class UserRole(str, Enum):
    """Roles allowed by DB CHECK (users_role_allowed)."""
    admin = "admin"
    manager = "manager"
    landlord = "landlord"
    tenant = "tenant"
    support = "support"


class User(SQLModel, table=True):
    """
    Authentication user for all portals (admin, tenant, landlord, manager).
    """

    __tablename__ = "users"

    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    email: str = Field(index=True, unique=True)
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
    password_hash: str
    password_algo: str = Field(default="argon2id")
    password_changed_at: datetime = Field(default_factory=datetime.utcnow)


class RefreshToken(SQLModel, table=True):
    __tablename__ = "refresh_tokens"
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    user_id: str = Field(foreign_key="users.id", index=True)
    token_hash: str = Field(index=True)
    expires_at: datetime = Field(index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    revoked_at: datetime | None = None
    replaced_by_token_id: str | None = Field(default=None, foreign_key="refresh_tokens.id", index=True)