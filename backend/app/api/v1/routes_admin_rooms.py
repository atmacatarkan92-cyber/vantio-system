"""
Admin rooms: CRUD. GET by unit is in routes_admin_units.
Protected by require_roles("admin", "manager").
"""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import func

ALLOWED_ROOM_STATUS = frozenset({"Frei", "Belegt", "Reserviert"})
from sqlmodel import select

from auth.dependencies import get_current_organization, get_db_session, require_roles
from db.audit import create_audit_log
from db.models import Unit, Room, Tenancy, User
from app.core.rate_limit import limiter


router = APIRouter(prefix="/api/admin", tags=["admin-rooms"])


def _room_audit_payload(r: Room) -> dict:
    """Namespaced child snapshot for unit parent-stream audit (rooms)."""
    return {
        "id": str(r.id),
        "unit_id": str(r.unit_id),
        "name": r.name,
        "price": int(getattr(r, "price", 0) or 0),
        "floor": getattr(r, "floor", None),
        "is_active": bool(getattr(r, "is_active", True)),
        "size_m2": getattr(r, "size_m2", None),
        "status": getattr(r, "status", None) or "Frei",
    }


def _room_to_dict(r: Room) -> dict:
    price = getattr(r, "price", 0)
    status = getattr(r, "status", None) or "Frei"
    return {
        "id": str(r.id),
        "unit_id": r.unit_id,
        "unitId": r.unit_id,
        "name": r.name,
        "price": price,
        "base_rent_chf": price,
        "floor": getattr(r, "floor", None),
        "is_active": getattr(r, "is_active", True),
        "size_m2": getattr(r, "size_m2", None),
        "status": status,
    }


class RoomCreate(BaseModel):
    unit_id: str
    name: str
    # Planning / Soll rent for forecasts & full-occupancy potential; actual rent lives on tenancy.
    price: int = Field(default=0, ge=0)
    floor: Optional[int] = Field(default=None, ge=0)
    is_active: bool = True
    size_m2: Optional[float] = Field(default=None, ge=0)
    status: str = Field(default="Frei")

    @model_validator(mode="after")
    def _no_whitespace_only(self):
        if not self.unit_id or not self.unit_id.strip():
            raise ValueError("unit_id must not be empty")
        if not self.name or not self.name.strip():
            raise ValueError("name must not be empty")
        if self.status not in ALLOWED_ROOM_STATUS:
            raise ValueError(
                f"status must be one of: {', '.join(sorted(ALLOWED_ROOM_STATUS))}"
            )
        return self


class RoomPatch(BaseModel):
    name: Optional[str] = None
    unit_id: Optional[str] = None
    price: Optional[int] = Field(default=None, ge=0)
    floor: Optional[int] = Field(default=None, ge=0)
    is_active: Optional[bool] = None
    size_m2: Optional[float] = Field(default=None, ge=0)
    status: Optional[str] = None

    @model_validator(mode="after")
    def _no_whitespace_only(self):
        if self.unit_id is not None and not self.unit_id.strip():
            raise ValueError("unit_id must not be empty")
        if self.name is not None and not self.name.strip():
            raise ValueError("name must not be empty")
        if self.status is not None and self.status not in ALLOWED_ROOM_STATUS:
            raise ValueError(
                f"status must be one of: {', '.join(sorted(ALLOWED_ROOM_STATUS))}"
            )
        return self


@router.get("/rooms", response_model=List[dict])
def admin_list_rooms(
    unit_id: Optional[str] = None,
    org_id: str = Depends(get_current_organization),
    _=Depends(require_roles("admin", "manager")),
    session=Depends(get_db_session),
):
    """List all rooms, optionally filtered by unit_id."""
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


@router.post("/rooms", response_model=dict)
@limiter.limit("10/minute")
def admin_create_room(
    request: Request,
    body: RoomCreate,
    org_id: str = Depends(get_current_organization),
    current_user: User = Depends(require_roles("admin", "manager")),
    session=Depends(get_db_session),
):
    """Create a new room."""
    unit = session.get(Unit, body.unit_id)
    if not unit or str(getattr(unit, "organization_id", "")) != org_id:
        raise HTTPException(status_code=404, detail="Unit not found")
    room = Room(
        unit_id=body.unit_id,
        name=body.name,
        price=body.price,
        floor=body.floor,
        is_active=body.is_active,
        size_m2=body.size_m2,
        status=body.status,
    )
    session.add(room)
    session.flush()
    create_audit_log(
        session,
        str(current_user.id),
        "create",
        "unit",
        str(body.unit_id),
        old_values=None,
        new_values={"room": _room_audit_payload(room)},
        organization_id=org_id,
    )
    session.commit()
    session.refresh(room)
    return _room_to_dict(room)


@router.patch("/rooms/{room_id}", response_model=dict)
@limiter.limit("10/minute")
def admin_patch_room(
    request: Request,
    room_id: str,
    body: RoomPatch,
    org_id: str = Depends(get_current_organization),
    current_user: User = Depends(require_roles("admin", "manager")),
    session=Depends(get_db_session),
):
    """Update a room (partial)."""
    room = session.get(Room, room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    cur_unit = session.get(Unit, room.unit_id)
    if not cur_unit or str(getattr(cur_unit, "organization_id", "")) != org_id:
        raise HTTPException(status_code=404, detail="Room not found")
    old_payload = _room_audit_payload(room)
    data = body.model_dump(exclude_unset=True)
    if "unit_id" in data:
        u = session.get(Unit, data["unit_id"])
        if not u or str(getattr(u, "organization_id", "")) != org_id:
            raise HTTPException(status_code=404, detail="Unit not found")
    for k, v in data.items():
        if hasattr(room, k):
            setattr(room, k, v)
    session.add(room)
    new_payload = _room_audit_payload(room)
    if old_payload != new_payload:
        create_audit_log(
            session,
            str(current_user.id),
            "update",
            "unit",
            str(room.unit_id),
            old_values={"room": old_payload},
            new_values={"room": new_payload},
            organization_id=org_id,
        )
    session.commit()
    session.refresh(room)
    return _room_to_dict(room)


@router.delete("/rooms/{room_id}")
@limiter.limit("10/minute")
def admin_delete_room(
    request: Request,
    room_id: str,
    org_id: str = Depends(get_current_organization),
    current_user: User = Depends(require_roles("admin", "manager")),
    session=Depends(get_db_session),
):
    """Delete a room."""
    room = session.get(Room, room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    cur_unit = session.get(Unit, room.unit_id)
    if not cur_unit or str(getattr(cur_unit, "organization_id", "")) != org_id:
        raise HTTPException(status_code=404, detail="Room not found")
    _blocking = session.execute(
        select(func.count())
        .select_from(Tenancy)
        .where(Tenancy.room_id == room_id)
        .where(Tenancy.organization_id == org_id)
    ).scalar()
    blocking_count = int(_blocking) if _blocking is not None else 0
    if blocking_count > 0:
        raise HTTPException(
            status_code=400,
            detail=(
                "Room kann nicht gelöscht werden, da noch Mietverhältnisse mit "
                "diesem Zimmer verknüpft sind."
            ),
        )
    uid = str(room.unit_id)
    old_payload = _room_audit_payload(room)
    session.delete(room)
    create_audit_log(
        session,
        str(current_user.id),
        "delete",
        "unit",
        uid,
        old_values={"room": old_payload},
        new_values=None,
        organization_id=org_id,
    )
    session.commit()
    return {"status": "ok", "message": "Room deleted"}
