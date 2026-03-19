"""
Admin properties API: list, get, create, update (Phase D table).
Protected by require_roles("admin", "manager").
"""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlmodel import select

from db.database import get_session
from db.models import Property, Landlord
from auth.dependencies import get_current_organization, require_roles
from app.core.rate_limit import limiter


router = APIRouter(prefix="/api/admin", tags=["admin-properties"])


def _assert_landlord_in_org(session, landlord_id: Optional[str], org_id: str) -> None:
    if not landlord_id:
        return
    ll = session.get(Landlord, landlord_id)
    if not ll or str(getattr(ll, "organization_id", "")) != org_id:
        raise HTTPException(status_code=400, detail="Invalid landlord reference")


def _property_to_dict(p: Property) -> dict:
    return {
        "id": str(p.id),
        "landlord_id": getattr(p, "landlord_id", None),
        "title": getattr(p, "title", "") or "",
        "street": getattr(p, "street", None),
        "house_number": getattr(p, "house_number", None),
        "zip_code": getattr(p, "zip_code", None),
        "city": getattr(p, "city", None),
        "country": getattr(p, "country", "CH"),
        "lat": getattr(p, "lat", None),
        "lng": getattr(p, "lng", None),
        "status": getattr(p, "status", "active"),
        "notes": getattr(p, "notes", None),
        "created_at": p.created_at.isoformat() if getattr(p, "created_at", None) else None,
        "updated_at": p.updated_at.isoformat() if getattr(p, "updated_at", None) else None,
        "deleted_at": p.deleted_at.isoformat() if getattr(p, "deleted_at", None) and p.deleted_at else None,
    }


class PropertyCreate(BaseModel):
    landlord_id: Optional[str] = None
    title: str = ""
    street: Optional[str] = None
    house_number: Optional[str] = None
    zip_code: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = "CH"
    lat: Optional[float] = None
    lng: Optional[float] = None
    status: Optional[str] = "active"
    notes: Optional[str] = None


class PropertyUpdate(BaseModel):
    landlord_id: Optional[str] = None
    title: Optional[str] = None
    street: Optional[str] = None
    house_number: Optional[str] = None
    zip_code: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    status: Optional[str] = None
    notes: Optional[str] = None


@router.get("/properties", response_model=List[dict])
def admin_list_properties(
    org_id: str = Depends(get_current_organization),
    _=Depends(require_roles("admin", "manager")),
):
    """List all properties (Phase D table)."""
    session = get_session()
    try:
        properties = list(
            session.exec(
                select(Property).where(Property.organization_id == org_id).order_by(Property.title)
            ).all()
        )
        return [_property_to_dict(p) for p in properties]
    finally:
        session.close()


@router.get("/properties/{property_id}", response_model=dict)
def admin_get_property(
    property_id: str,
    org_id: str = Depends(get_current_organization),
    _=Depends(require_roles("admin", "manager")),
):
    """Get a single property by id."""
    session = get_session()
    try:
        prop = session.get(Property, property_id)
        if not prop or str(getattr(prop, "organization_id", "")) != org_id:
            raise HTTPException(status_code=404, detail="Property not found")
        return _property_to_dict(prop)
    finally:
        session.close()


@router.post("/properties", response_model=dict)
@limiter.limit("10/minute")
def admin_create_property(
    request: Request,
    body: PropertyCreate,
    org_id: str = Depends(get_current_organization),
    _=Depends(require_roles("admin", "manager")),
):
    """Create a new property."""
    session = get_session()
    try:
        _assert_landlord_in_org(session, body.landlord_id, org_id)
        prop = Property(
            organization_id=org_id,
            landlord_id=body.landlord_id,
            title=(body.title or "").strip() or "—",
            street=body.street,
            house_number=body.house_number,
            zip_code=body.zip_code,
            city=body.city,
            country=(body.country or "CH").strip() or "CH",
            lat=body.lat,
            lng=body.lng,
            status=(body.status or "active").strip() or "active",
            notes=body.notes,
        )
        session.add(prop)
        session.commit()
        session.refresh(prop)
        return _property_to_dict(prop)
    finally:
        session.close()


@router.put("/properties/{property_id}", response_model=dict)
def admin_put_property(
    property_id: str,
    body: PropertyUpdate,
    org_id: str = Depends(get_current_organization),
    _=Depends(require_roles("admin", "manager")),
):
    """Update a property (partial)."""
    session = get_session()
    try:
        prop = session.get(Property, property_id)
        if not prop or str(getattr(prop, "organization_id", "")) != org_id:
            raise HTTPException(status_code=404, detail="Property not found")
        data = body.model_dump(exclude_unset=True)
        if "landlord_id" in data:
            _assert_landlord_in_org(session, data.get("landlord_id"), org_id)
        for k, v in data.items():
            if hasattr(prop, k):
                setattr(prop, k, v)
        session.add(prop)
        session.commit()
        session.refresh(prop)
        return _property_to_dict(prop)
    finally:
        session.close()
