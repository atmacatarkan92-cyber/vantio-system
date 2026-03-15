"""
Admin listing management: CRUD for website listings (PostgreSQL).
Protected by require_roles("admin", "manager").
Validates unit, city, and optional room exist before create/update to avoid FK errors.
"""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session

from db.database import get_session
from db.models import City, Unit, Room
from auth.dependencies import require_roles
from app.services.listings_service import (
    get_all_listings_admin,
    get_listing_admin_by_id,
    create_listing,
    update_listing,
    delete_listing,
)


router = APIRouter(prefix="/api/admin", tags=["admin-listings"])


def _validate_listing_relations(
    session: Session,
    *,
    unit_id: Optional[str] = None,
    city_id: Optional[str] = None,
    room_id: Optional[str] = None,
) -> None:
    """
    Ensure referenced unit, city, and (if provided) room exist.
    Raises HTTPException 404 with a clear message if any is missing.
    """
    if unit_id is not None:
        if session.get(Unit, unit_id) is None:
            raise HTTPException(status_code=404, detail="Unit not found")
    if city_id is not None:
        if session.get(City, city_id) is None:
            raise HTTPException(status_code=404, detail="City not found")
    if room_id is not None and room_id.strip() != "":
        if session.get(Room, room_id) is None:
            raise HTTPException(status_code=404, detail="Room not found")


# ---------------------------------------------------------------------------
# Schemas (request/response)
# ---------------------------------------------------------------------------

class ListingImageInput(BaseModel):
    url: str = ""
    is_main: bool = False
    position: int = 0


class ListingImageResponse(BaseModel):
    id: str
    url: str
    is_main: bool
    position: int


class ListingAmenityInput(BaseModel):
    label_de: str = ""
    label_en: str = ""


class ListingAmenityResponse(BaseModel):
    id: str
    label_de: str
    label_en: str


class ListingCreate(BaseModel):
    unit_id: str
    city_id: str
    slug: Optional[str] = None  # optional; auto-generated from city + title if omitted (Phase C)
    title_de: str = ""
    title_en: str = ""
    description_de: str = ""
    description_en: str = ""
    room_id: Optional[str] = None
    price_chf_month: int = 0
    bedrooms: int = 0
    bathrooms: int = 0
    size_sqm: int = 0
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    is_published: bool = False
    sort_order: int = 0
    images: List[ListingImageInput] = []
    amenities: List[ListingAmenityInput] = []


class ListingStatusUpdate(BaseModel):
    """Optional fields for PATCH /listings/{id}/status."""
    is_published: Optional[bool] = None
    availability_status: Optional[str] = None  # available | occupied | unavailable


class ListingUpdate(BaseModel):
    unit_id: Optional[str] = None
    city_id: Optional[str] = None
    slug: Optional[str] = None
    title_de: Optional[str] = None
    title_en: Optional[str] = None
    description_de: Optional[str] = None
    description_en: Optional[str] = None
    room_id: Optional[str] = None
    price_chf_month: Optional[int] = None
    bedrooms: Optional[int] = None
    bathrooms: Optional[int] = None
    size_sqm: Optional[int] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    is_published: Optional[bool] = None
    sort_order: Optional[int] = None
    images: Optional[List[ListingImageInput]] = None
    amenities: Optional[List[ListingAmenityInput]] = None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/listings", response_model=List[dict])
def admin_list_listings(
    _=Depends(require_roles("admin", "manager")),
):
    """List all listings (including unpublished) for admin."""
    session = get_session()
    try:
        return get_all_listings_admin(session)
    finally:
        session.close()


@router.post("/listings", response_model=dict)
def admin_create_listing(
    body: ListingCreate,
    _=Depends(require_roles("admin", "manager")),
):
    """Create a new listing with optional images and amenities. Unit and city must exist."""
    session = get_session()
    try:
        _validate_listing_relations(
            session,
            unit_id=body.unit_id,
            city_id=body.city_id,
            room_id=body.room_id,
        )
        data = body.model_dump()
        data["images"] = [x.model_dump() for x in body.images]
        data["amenities"] = [x.model_dump() for x in body.amenities]
        return create_listing(session, data)
    finally:
        session.close()


@router.put("/listings/{listing_id}", response_model=dict)
def admin_update_listing(
    listing_id: str,
    body: ListingUpdate,
    _=Depends(require_roles("admin", "manager")),
):
    """Update a listing by id. Omitted fields are left unchanged; images/amenities replace existing if provided."""
    session = get_session()
    try:
        data = body.model_dump(exclude_unset=True)
        _validate_listing_relations(
            session,
            unit_id=data.get("unit_id"),
            city_id=data.get("city_id"),
            room_id=data.get("room_id"),
        )
        if body.images is not None:
            data["images"] = [x.model_dump() for x in body.images]
        if body.amenities is not None:
            data["amenities"] = [x.model_dump() for x in body.amenities]
        result = update_listing(session, listing_id, data)
        if result is None:
            raise HTTPException(status_code=404, detail="Listing not found")
        return result
    finally:
        session.close()


@router.patch("/listings/{listing_id}/status", response_model=dict)
def admin_patch_listing_status(
    listing_id: str,
    body: ListingStatusUpdate,
    _=Depends(require_roles("admin", "manager")),
):
    """Update only is_published and/or availability_status. Both fields optional."""
    session = get_session()
    try:
        data = body.model_dump(exclude_unset=True)
        if "availability_status" in data and data["availability_status"] not in ("available", "occupied", "unavailable"):
            raise HTTPException(status_code=400, detail="availability_status must be available, occupied, or unavailable")
        result = update_listing(session, listing_id, data)
        if result is None:
            raise HTTPException(status_code=404, detail="Listing not found")
        return result
    finally:
        session.close()


@router.delete("/listings/{listing_id}")
def admin_delete_listing(
    listing_id: str,
    _=Depends(require_roles("admin", "manager")),
):
    """Delete a listing and its images and amenities."""
    session = get_session()
    try:
        if not delete_listing(session, listing_id):
            raise HTTPException(status_code=404, detail="Listing not found")
        return {"status": "deleted", "id": listing_id}
    finally:
        session.close()
