"""
Admin tenancies: CRUD + list by room.
Protected by require_roles("admin", "manager").
Validates tenant/room/unit exist, room belongs to unit, no overlapping tenancies.
"""

from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import select

from db.database import get_session
from db.models import Tenancy, TenancyStatus, Tenant, Room, Unit
from auth.dependencies import require_roles


router = APIRouter(prefix="/api/admin", tags=["admin-tenancies"])


def _tenancy_to_dict(t: Tenancy) -> dict:
    return {
        "id": str(t.id),
        "tenant_id": str(t.tenant_id),
        "room_id": str(t.room_id),
        "unit_id": str(t.unit_id),
        "move_in_date": t.move_in_date.isoformat() if t.move_in_date else None,
        "move_out_date": t.move_out_date.isoformat() if t.move_out_date else None,
        "rent_chf": float(t.rent_chf),
        "deposit_chf": float(t.deposit_chf) if t.deposit_chf is not None else None,
        "status": t.status.value if hasattr(t.status, "value") else str(t.status),
        "created_at": t.created_at.isoformat() if getattr(t, "created_at", None) else None,
    }


class TenancyCreate(BaseModel):
    tenant_id: str
    room_id: str
    unit_id: str
    move_in_date: date
    move_out_date: Optional[date] = None
    rent_chf: float = 0
    deposit_chf: Optional[float] = None
    status: str = "active"


class TenancyPatch(BaseModel):
    move_in_date: Optional[date] = None
    move_out_date: Optional[date] = None
    rent_chf: Optional[float] = None
    deposit_chf: Optional[float] = None
    status: Optional[str] = None


def _validate_relations(session, tenant_id: str, room_id: str, unit_id: str) -> Room:
    tenant = session.get(Tenant, tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    room = session.get(Room, room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    unit = session.get(Unit, unit_id)
    if not unit:
        raise HTTPException(status_code=404, detail="Unit not found")
    if str(room.unit_id) != str(unit_id):
        raise HTTPException(status_code=400, detail="Room does not belong to unit")
    return room


def _overlaps(session, room_id: str, move_in: date, move_out: Optional[date], exclude_tenancy_id: Optional[str] = None) -> bool:
    """True if another tenancy for this room overlaps the given date range."""
    q = select(Tenancy).where(
        Tenancy.room_id == room_id,
        Tenancy.status.in_([TenancyStatus.active, TenancyStatus.reserved]),
    )
    if exclude_tenancy_id:
        q = q.where(Tenancy.id != exclude_tenancy_id)
    for t in session.exec(q).all():
        t_out = t.move_out_date or date(9999, 12, 31)
        # overlap: our start < their end and our end > their start
        our_end = move_out or date(9999, 12, 31)
        if move_in < t_out and our_end > t.move_in_date:
            return True
    return False


@router.get("/tenancies", response_model=List[dict])
def admin_list_tenancies(
    room_id: Optional[str] = None,
    unit_id: Optional[str] = None,
    status: Optional[str] = None,
    _=Depends(require_roles("admin", "manager")),
):
    """List tenancies, optionally filtered by room_id, unit_id, status."""
    session = get_session()
    try:
        q = select(Tenancy).order_by(Tenancy.move_in_date.desc())
        if room_id:
            q = q.where(Tenancy.room_id == room_id)
        if unit_id:
            q = q.where(Tenancy.unit_id == unit_id)
        if status:
            q = q.where(Tenancy.status == status)
        tenancies = list(session.exec(q).all())
        return [_tenancy_to_dict(t) for t in tenancies]
    finally:
        session.close()


@router.get("/rooms/{room_id}/tenancies", response_model=List[dict])
def admin_list_tenancies_for_room(
    room_id: str,
    _=Depends(require_roles("admin", "manager")),
):
    """List tenancies for a room."""
    session = get_session()
    try:
        room = session.get(Room, room_id)
        if not room:
            raise HTTPException(status_code=404, detail="Room not found")
        q = select(Tenancy).where(Tenancy.room_id == room_id).order_by(Tenancy.move_in_date.desc())
        tenancies = list(session.exec(q).all())
        return [_tenancy_to_dict(t) for t in tenancies]
    finally:
        session.close()


@router.post("/tenancies", response_model=dict)
def admin_create_tenancy(
    body: TenancyCreate,
    _=Depends(require_roles("admin", "manager")),
):
    """Create a tenancy. Validates tenant/room/unit and prevents overlapping tenancies."""
    session = get_session()
    try:
        _validate_relations(session, body.tenant_id, body.room_id, body.unit_id)
        status = TenancyStatus(body.status) if body.status in ("active", "ended", "reserved") else TenancyStatus.active
        if _overlaps(session, body.room_id, body.move_in_date, body.move_out_date):
            raise HTTPException(status_code=400, detail="Another tenancy overlaps this room for the given dates")
        tenancy = Tenancy(
            tenant_id=body.tenant_id,
            room_id=body.room_id,
            unit_id=body.unit_id,
            move_in_date=body.move_in_date,
            move_out_date=body.move_out_date,
            rent_chf=body.rent_chf,
            deposit_chf=body.deposit_chf,
            status=status,
        )
        session.add(tenancy)
        session.commit()
        session.refresh(tenancy)
        return _tenancy_to_dict(tenancy)
    finally:
        session.close()


@router.patch("/tenancies/{tenancy_id}", response_model=dict)
def admin_patch_tenancy(
    tenancy_id: str,
    body: TenancyPatch,
    _=Depends(require_roles("admin", "manager")),
):
    """Update a tenancy (partial). Checks overlap when dates change."""
    session = get_session()
    try:
        tenancy = session.get(Tenancy, tenancy_id)
        if not tenancy:
            raise HTTPException(status_code=404, detail="Tenancy not found")
        data = body.model_dump(exclude_unset=True)
        if "status" in data and data["status"] not in ("active", "ended", "reserved"):
            raise HTTPException(status_code=400, detail="status must be active, ended, or reserved")
        move_in = data.get("move_in_date") or tenancy.move_in_date
        move_out = data.get("move_out_date") if "move_out_date" in data else tenancy.move_out_date
        if _overlaps(session, tenancy.room_id, move_in, move_out, exclude_tenancy_id=tenancy_id):
            raise HTTPException(status_code=400, detail="Another tenancy overlaps this room for the given dates")
        for k, v in data.items():
            if hasattr(tenancy, k):
                if k == "status":
                    setattr(tenancy, k, TenancyStatus(v))
                else:
                    setattr(tenancy, k, v)
        session.add(tenancy)
        session.commit()
        session.refresh(tenancy)
        return _tenancy_to_dict(tenancy)
    finally:
        session.close()


@router.delete("/tenancies/{tenancy_id}")
def admin_delete_tenancy(
    tenancy_id: str,
    _=Depends(require_roles("admin", "manager")),
):
    """Delete a tenancy."""
    session = get_session()
    try:
        tenancy = session.get(Tenancy, tenancy_id)
        if not tenancy:
            raise HTTPException(status_code=404, detail="Tenancy not found")
        session.delete(tenancy)
        session.commit()
        return {"status": "ok", "message": "Tenancy deleted"}
    finally:
        session.close()
