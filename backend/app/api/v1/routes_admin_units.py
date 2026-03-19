"""
Admin units and rooms: CRUD + list rooms by unit.
Protected by require_roles("admin", "manager").
"""

from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy import or_
from sqlalchemy.exc import OperationalError, ProgrammingError
from sqlmodel import select

from db.database import get_session
from db.models import Unit, Room, Property, Landlord, User
from db.audit import create_audit_log, model_snapshot
from auth.dependencies import get_current_organization, require_roles
from app.core.rate_limit import limiter


router = APIRouter(prefix="/api/admin", tags=["admin-units"])


def _assert_property_and_landlord_in_org(session, property_id: Optional[str], org_id: str) -> None:
    if not property_id:
        return
    prop = session.get(Property, property_id)
    if not prop or str(getattr(prop, "organization_id", "")) != org_id:
        raise HTTPException(status_code=404, detail="Property not found")
    lid = getattr(prop, "landlord_id", None)
    if lid:
        ll = session.get(Landlord, lid)
        if not ll or str(getattr(ll, "organization_id", "")) != org_id:
            raise HTTPException(status_code=400, detail="Invalid landlord reference for property")


def _unit_to_dict(u: Unit, property_title: Optional[str] = None) -> dict:
    return {
        "id": str(u.id),
        "unitId": str(u.id),
        "name": u.title,
        "title": u.title,
        "address": getattr(u, "address", "") or "",
        "city": getattr(u, "city", "") or "",
        "city_id": getattr(u, "city_id", None),
        "type": getattr(u, "type", None),
        "rooms": getattr(u, "rooms", 0),
        "property_id": getattr(u, "property_id", None),
        "property_title": property_title,
        "created_at": u.created_at.isoformat() if getattr(u, "created_at", None) else None,
    }


def _room_to_dict(r: Room) -> dict:
    price = getattr(r, "price", 0)
    return {
        "id": str(r.id),
        "unit_id": r.unit_id,
        "unitId": r.unit_id,
        "name": r.name,
        "price": price,
        "base_rent_chf": getattr(r, "base_rent_chf", None) or price,
        "floor": getattr(r, "floor", None),
        "is_active": getattr(r, "is_active", True),
    }


class UnitCreate(BaseModel):
    name: Optional[str] = None
    title: Optional[str] = None
    address: str = ""
    city: str = ""
    city_id: Optional[str] = None
    type: Optional[str] = None
    rooms: int = Field(default=0, ge=0)
    property_id: Optional[str] = None


class UnitPatch(BaseModel):
    name: Optional[str] = None
    title: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    city_id: Optional[str] = None
    type: Optional[str] = None
    rooms: Optional[int] = Field(default=None, ge=0)
    property_id: Optional[str] = None


class UnitListResponse(BaseModel):
    items: List[dict]
    total: int
    skip: int
    limit: int


@router.get("/units", response_model=UnitListResponse)
def admin_list_units(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    org_id: str = Depends(get_current_organization),
    _=Depends(require_roles("admin", "manager")),
):
    """List units (listings dropdown + admin pages) with basic pagination."""
    session = get_session()
    try:
        base_query = (
            select(Unit, Property)
            .select_from(Unit)
            .outerjoin(Property, Unit.property_id == Property.id)
            .where(Unit.organization_id == org_id)
            .order_by(Unit.title)
        )
        _total_rows = session.exec(
            select(func.count())
            .select_from(Unit)
            .outerjoin(Property, Unit.property_id == Property.id)
            .where(Unit.organization_id == org_id)
        ).all()
        total = int(_total_rows[0]) if _total_rows else 0

        # Apply offset/limit for items
        paged_rows = session.exec(
            base_query.offset(skip).limit(limit)
        ).all()
        items = [_unit_to_dict(u, p.title if p else None) for u, p in paged_rows]
        return UnitListResponse(
            items=items,
            total=total,
            skip=skip,
            limit=limit,
        )
    except (OperationalError, ProgrammingError) as e:
        session.rollback()
        msg = str(e).strip() or "database error"
        if "does not exist" in msg or "column" in msg.lower() or "relation" in msg.lower():
            raise HTTPException(
                status_code=503,
                detail=(
                    "Unit table schema may be outdated. Run: python -m scripts.ensure_units_rooms_tenants_columns"
                ),
            ) from e
        raise HTTPException(status_code=503, detail=msg) from e
    finally:
        session.close()


@router.get("/units/{unit_id}", response_model=dict)
def admin_get_unit(
    unit_id: str,
    org_id: str = Depends(get_current_organization),
    _=Depends(require_roles("admin", "manager")),
):
    """Get a single unit by id. Includes property_id and property_title."""
    session = get_session()
    try:
        unit = session.get(Unit, unit_id)
        if not unit or str(getattr(unit, "organization_id", "")) != org_id:
            raise HTTPException(status_code=404, detail="Unit not found")
        property_title = None
        if getattr(unit, "property_id", None):
            prop = session.get(Property, unit.property_id)
            if prop:
                property_title = getattr(prop, "title", None)
        return _unit_to_dict(unit, property_title)
    finally:
        session.close()


@router.post("/units", response_model=dict)
@limiter.limit("10/minute")
def admin_create_unit(
    request: Request,
    body: UnitCreate,
    org_id: str = Depends(get_current_organization),
    current_user: User = Depends(require_roles("admin", "manager")),
):
    """Create a new unit."""
    session = get_session()
    try:
        _assert_property_and_landlord_in_org(session, body.property_id, org_id)
        title = (body.title or body.name or "").strip() or "New Unit"
        unit = Unit(
            organization_id=org_id,
            title=title,
            address=body.address or "",
            city=body.city or "",
            rooms=body.rooms,
            type=body.type,
            city_id=body.city_id,
            property_id=body.property_id,
        )
        session.add(unit)
        create_audit_log(
            session, str(current_user.id), "create", "unit", str(unit.id),
            old_values=None, new_values=model_snapshot(unit),
        )
        session.commit()
        session.refresh(unit)
        return _unit_to_dict(unit)
    finally:
        session.close()


@router.patch("/units/{unit_id}", response_model=dict)
@limiter.limit("10/minute")
def admin_patch_unit(
    request: Request,
    unit_id: str,
    body: UnitPatch,
    org_id: str = Depends(get_current_organization),
    current_user: User = Depends(require_roles("admin", "manager")),
):
    """Update a unit (partial)."""
    session = get_session()
    try:
        unit = session.get(Unit, unit_id)
        if not unit or str(getattr(unit, "organization_id", "")) != org_id:
            raise HTTPException(status_code=404, detail="Unit not found")
        old_snapshot = model_snapshot(unit)
        data = body.model_dump(exclude_unset=True)
        if "property_id" in data:
            pid = data["property_id"] if data["property_id"] else None
            _assert_property_and_landlord_in_org(session, pid, org_id)
        if "name" in data and "title" not in data:
            data["title"] = data.pop("name")
        elif "title" in data:
            pass
        for k, v in data.items():
            if hasattr(unit, k):
                setattr(unit, k, v)
        if "property_id" in data and data["property_id"] == "":
            unit.property_id = None
        session.add(unit)
        create_audit_log(
            session, str(current_user.id), "update", "unit", str(unit_id),
            old_values=old_snapshot, new_values=model_snapshot(unit),
        )
        session.commit()
        session.refresh(unit)
        property_title = None
        if getattr(unit, "property_id", None):
            prop = session.get(Property, unit.property_id)
            if prop:
                property_title = getattr(prop, "title", None)
        return _unit_to_dict(unit, property_title)
    finally:
        session.close()


@router.delete("/units/{unit_id}")
@limiter.limit("10/minute")
def admin_delete_unit(
    request: Request,
    unit_id: str,
    org_id: str = Depends(get_current_organization),
    current_user: User = Depends(require_roles("admin", "manager")),
):
    """Delete a unit (caller must ensure no dependent listings/rooms)."""
    session = get_session()
    try:
        unit = session.get(Unit, unit_id)
        if not unit or str(getattr(unit, "organization_id", "")) != org_id:
            raise HTTPException(status_code=404, detail="Unit not found")
        old_snapshot = model_snapshot(unit)
        session.delete(unit)
        create_audit_log(
            session, str(current_user.id), "delete", "unit", str(unit_id),
            old_values=old_snapshot, new_values=None,
        )
        session.commit()
        return {"status": "ok", "message": "Unit deleted"}
    finally:
        session.close()


@router.get("/units/{unit_id}/rooms", response_model=List[dict])
def admin_list_rooms_for_unit(
    unit_id: str,
    org_id: str = Depends(get_current_organization),
    _=Depends(require_roles("admin", "manager")),
):
    """List rooms belonging to the given unit (listings dropdown + admin)."""
    session = get_session()
    try:
        unit = session.get(Unit, unit_id)
        if not unit or str(getattr(unit, "organization_id", "")) != org_id:
            raise HTTPException(status_code=404, detail="Unit not found")
        rooms = list(
            session.exec(
                select(Room).where(Room.unit_id == unit_id).order_by(Room.name)
            ).all()
        )
        return [_room_to_dict(r) for r in rooms]
    finally:
        session.close()
