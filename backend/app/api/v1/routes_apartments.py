"""
Public marketing API: intentionally unauthenticated.

Returns only published listings (is_published) in the legacy website shape. No admin fields,
no tenant/invoice data. Published listings from all organizations may appear (shared public site);
this is not an org-scoped admin surface.
"""

from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query

from app.services.listings_service import get_listings, get_listing_by_id, get_listing_by_slug
from db.database import engine, get_session


router = APIRouter(prefix="/api", tags=["apartments"])


@router.get("/apartments", response_model=List[dict])
async def get_apartments(city: Optional[str] = Query(None)):
    """
    Published listings only (PostgreSQL). Same response shape as legacy frontend.
    """
    if engine is None:
        return []
    session = get_session()
    try:
        return get_listings(session, city_code=city)
    finally:
        session.close()


@router.get("/apartments/{apartment_id}", response_model=dict)
async def get_apartment(apartment_id: str):
    """
    One published listing by id or slug (tries id first). Unpublished or missing -> 404.
    """
    if engine is None:
        raise HTTPException(status_code=404, detail="Apartment not found")
    session = get_session()
    try:
        listing = get_listing_by_id(session, apartment_id)
        if listing is not None:
            return listing
        listing = get_listing_by_slug(session, apartment_id)
        if listing is not None:
            return listing
        raise HTTPException(status_code=404, detail="Apartment not found")
    finally:
        session.close()
