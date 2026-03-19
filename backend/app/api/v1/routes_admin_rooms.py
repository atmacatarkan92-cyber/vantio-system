"""
Admin rooms: CRUD. GET by unit is in routes_admin_units.
Protected by require_roles("admin", "manager").
"""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, model_validator
from sqlmodel import select

from db.database import get_session
from db.models import Unit, Room
from auth.dependencies import get_current_organization, require_roles
from app.core.rate_limit import limiter


router = APIRouter(prefix="/api/admin", tags=["admin-rooms"])


def _room_to_dict(r: Room) -> dict:
    price = getattr(r, "price", 0)
    return {
        "id": str(r.id),
        "unit_id": r.unit_id,
        "unitId": r.unit_id,
        "name": r.name,
        "price": price,
        "base_rent_chf": price,
        "floor": getattr(r, "floor", None),
        "is_active": getattr(r, "is_active", True),
    }


class RoomCreate(BaseModel):
    unit_id: str
    name: str
    price: int = Field(default=0, ge=0)
    floor: Optional[int] = Field(default=None, ge=0)
    is_active: bool = True

    @model_validator(mode="after")
    def _no_whitespace_only(self):
        if not self.unit_id or not self.unit_id.strip():
            raise ValueError("unit_id must not be empty")
        if not self.name or not self.name.strip():
            raise ValueError("name must not be empty")
        return self


class RoomPatch(BaseModel):
    name: Optional[str] = None
    unit_id: Optional[str] = None
    price: Optional[int] = Field(default=None, ge=0)
    floor: Optional[int] = Field(default=None, ge=0)
    is_active: Optional[bool] = None

    @model_validator(mode="after")
    def _no_whitespace_only(self):
        if self.unit_id is not None and not self.unit_id.strip():
            raise ValueError("unit_id must not be empty")
        if self.name is not None and not self.name.strip():
            raise ValueError("name must not be empty")
        return self


@router.get("/rooms", response_model=List[dict])
def admin_list_rooms(
    unit_id: Optional[str] = None,
    org_id: str = Depends(get_current_organization),
    _=Depends(require_roles("admin", "manager")),
):
    """List all rooms, optionally filtered by unit_id."""
    session = get_session()
    try:
        q = (
            select(Room)
            .join(Unit, Room.unit_id == Unit.id)
            .where(Unit.organization_id == org_id)
            .order_by(Room.unit_id, Room.name)
        )
        if unit_id:
            q = q.where(Room.unit_id == unit_id)
        rooms = list(session.exec(q).all())
        return [_room_to_dict(r) for r in rooms]
    finally:
        session.close()


@router.post("/rooms", response_model=dict)
@limiter.limit("10/minute")
def admin_create_room(
    request: Request,
    body: RoomCreate,
    org_id: str = Depends(get_current_organization),
    _=Depends(require_roles("admin", "manager")),
):
    """Create a new room."""
    session = get_session()
    try:
        unit = session.get(Unit, body.unit_id)
        if not unit or str(getattr(unit, "organization_id", "")) != org_id:
            raise HTTPException(status_code=404, detail="Unit not found")
        room = Room(
            unit_id=body.unit_id,
            name=body.name,
            price=body.price,
            floor=body.floor,
            is_active=body.is_active,
        )
        session.add(room)
        session.commit()
        session.refresh(room)
        return _room_to_dict(room)
    finally:
        session.close()


@router.patch("/rooms/{room_id}", response_model=dict)
@limiter.limit("10/minute")
def admin_patch_room(
    request: Request,
    room_id: str,
    body: RoomPatch,
    org_id: str = Depends(get_current_organization),
    _=Depends(require_roles("admin", "manager")),
):
    """Update a room (partial)."""
    session = get_session()
    try:
        room = session.get(Room, room_id)
        if not room:
            raise HTTPException(status_code=404, detail="Room not found")
        cur_unit = session.get(Unit, room.unit_id)
        if not cur_unit or str(getattr(cur_unit, "organization_id", "")) != org_id:
            raise HTTPException(status_code=404, detail="Room not found")
        data = body.model_dump(exclude_unset=True)
        if "unit_id" in data:
            u = session.get(Unit, data["unit_id"])
            if not u or str(getattr(u, "organization_id", "")) != org_id:
                raise HTTPException(status_code=404, detail="Unit not found")
        for k, v in data.items():
            if hasattr(room, k):
                setattr(room, k, v)
        session.add(room)
        session.commit()
        session.refresh(room)
        return _room_to_dict(room)
    finally:
        session.close()


@router.delete("/rooms/{room_id}")
@limiter.limit("10/minute")
def admin_delete_room(
    request: Request,
    room_id: str,
    org_id: str = Depends(get_current_organization),
    _=Depends(require_roles("admin", "manager")),
):
    """Delete a room."""
    session = get_session()
    try:
        room = session.get(Room, room_id)
        if not room:
            raise HTTPException(status_code=404, detail="Room not found")
        cur_unit = session.get(Unit, room.unit_id)
        if not cur_unit or str(getattr(cur_unit, "organization_id", "")) != org_id:
            raise HTTPException(status_code=404, detail="Room not found")
        session.delete(room)
        session.commit()
        return {"status": "ok", "message": "Room deleted"}
    finally:
        session.close()
