"""
Admin rooms: CRUD. GET by unit is in routes_admin_units.
Protected by require_roles("admin", "manager").
"""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import select

from db.database import get_session
from db.models import Unit, Room
from auth.dependencies import require_roles


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
    price: int = 0
    floor: Optional[int] = None
    is_active: bool = True


class RoomPatch(BaseModel):
    name: Optional[str] = None
    unit_id: Optional[str] = None
    price: Optional[int] = None
    floor: Optional[int] = None
    is_active: Optional[bool] = None


@router.get("/rooms", response_model=List[dict])
def admin_list_rooms(
    unit_id: Optional[str] = None,
    _=Depends(require_roles("admin", "manager")),
):
    """List all rooms, optionally filtered by unit_id."""
    session = get_session()
    try:
        q = select(Room).order_by(Room.unit_id, Room.name)
        if unit_id:
            q = q.where(Room.unit_id == unit_id)
        rooms = list(session.exec(q).all())
        return [_room_to_dict(r) for r in rooms]
    finally:
        session.close()


@router.post("/rooms", response_model=dict)
def admin_create_room(
    body: RoomCreate,
    _=Depends(require_roles("admin", "manager")),
):
    """Create a new room."""
    session = get_session()
    try:
        unit = session.get(Unit, body.unit_id)
        if not unit:
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
def admin_patch_room(
    room_id: str,
    body: RoomPatch,
    _=Depends(require_roles("admin", "manager")),
):
    """Update a room (partial)."""
    session = get_session()
    try:
        room = session.get(Room, room_id)
        if not room:
            raise HTTPException(status_code=404, detail="Room not found")
        data = body.model_dump(exclude_unset=True)
        if "unit_id" in data:
            u = session.get(Unit, data["unit_id"])
            if not u:
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
def admin_delete_room(
    room_id: str,
    _=Depends(require_roles("admin", "manager")),
):
    """Delete a room."""
    session = get_session()
    try:
        room = session.get(Room, room_id)
        if not room:
            raise HTTPException(status_code=404, detail="Room not found")
        session.delete(room)
        session.commit()
        return {"status": "ok", "message": "Room deleted"}
    finally:
        session.close()
