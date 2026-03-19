"""
Admin tenancies: CRUD + list by room.
Protected by require_roles("admin", "manager").
Validates tenant/room/unit exist, room belongs to unit, no overlapping tenancies.
"""

from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import func
from sqlalchemy import or_
from sqlmodel import select

from db.database import get_session
from db.models import Tenancy, TenancyStatus, Tenant, Room, Unit, User
from db.audit import create_audit_log, model_snapshot
from auth.dependencies import get_current_organization, require_roles
from app.core.rate_limit import limiter


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
    rent_chf: float = Field(default=0, ge=0)
    deposit_chf: Optional[float] = Field(default=None, ge=0)
    status: TenancyStatus = TenancyStatus.active

    @model_validator(mode="after")
    def _validate_dates(self):
        if not self.tenant_id or not self.tenant_id.strip():
            raise ValueError("tenant_id must not be empty")
        if not self.room_id or not self.room_id.strip():
            raise ValueError("room_id must not be empty")
        if not self.unit_id or not self.unit_id.strip():
            raise ValueError("unit_id must not be empty")
        if self.move_out_date is not None and self.move_out_date < self.move_in_date:
            raise ValueError("move_out_date must be on/after move_in_date")
        return self


class TenancyPatch(BaseModel):
    move_in_date: Optional[date] = None
    move_out_date: Optional[date] = None
    rent_chf: Optional[float] = Field(default=None, ge=0)
    deposit_chf: Optional[float] = Field(default=None, ge=0)
    status: Optional[TenancyStatus] = None

    @model_validator(mode="after")
    def _validate_dates_if_both_present(self):
        if self.move_in_date is not None and self.move_out_date is not None:
            if self.move_out_date < self.move_in_date:
                raise ValueError("move_out_date must be on/after move_in_date")
        return self


def _validate_relations(session, tenant_id: str, room_id: str, unit_id: str, org_id: str) -> Room:
    tenant = session.get(Tenant, tenant_id)
    if not tenant or str(getattr(tenant, "organization_id", "")) != org_id:
        raise HTTPException(status_code=404, detail="Tenant not found")
    room = session.get(Room, room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    unit = session.get(Unit, unit_id)
    if not unit or str(getattr(unit, "organization_id", "")) != org_id:
        raise HTTPException(status_code=404, detail="Unit not found")
    if str(room.unit_id) != str(unit_id):
        raise HTTPException(status_code=400, detail="Room does not belong to unit")
    return room


def _overlaps(
    session,
    room_id: str,
    move_in: date,
    move_out: Optional[date],
    org_id: str,
    exclude_tenancy_id: Optional[str] = None,
) -> bool:
    """True if another tenancy for this room overlaps the given date range."""
    q = select(Tenancy).where(
        Tenancy.room_id == room_id,
        Tenancy.organization_id == org_id,
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


class TenancyListResponse(BaseModel):
    items: List[dict]
    total: int
    skip: int
    limit: int


@router.get("/tenancies", response_model=TenancyListResponse)
def admin_list_tenancies(
    room_id: Optional[str] = None,
    unit_id: Optional[str] = None,
    status: Optional[str] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    org_id: str = Depends(get_current_organization),
    _=Depends(require_roles("admin", "manager")),
):
    """List tenancies, optionally filtered by room_id, unit_id, status."""
    session = get_session()
    try:
        base_query = (
            select(Tenancy)
            .where(Tenancy.organization_id == org_id)
            .order_by(Tenancy.move_in_date.desc())
        )
        if room_id:
            base_query = base_query.where(Tenancy.room_id == room_id)
        if unit_id:
            base_query = base_query.where(Tenancy.unit_id == unit_id)
        if status:
            base_query = base_query.where(Tenancy.status == status)
        count_query = (
            select(func.count())
            .select_from(Tenancy)
            .where(Tenancy.organization_id == org_id)
        )
        if room_id:
            count_query = count_query.where(Tenancy.room_id == room_id)
        if unit_id:
            count_query = count_query.where(Tenancy.unit_id == unit_id)
        if status:
            count_query = count_query.where(Tenancy.status == status)
        _total_rows = session.exec(count_query).all()
        total = int(_total_rows[0]) if _total_rows else 0
        paged_rows = session.exec(base_query.offset(skip).limit(limit)).all()
        items = [_tenancy_to_dict(t) for t in paged_rows]
        return TenancyListResponse(items=items, total=total, skip=skip, limit=limit)
    finally:
        session.close()


@router.get("/rooms/{room_id}/tenancies", response_model=List[dict])
def admin_list_tenancies_for_room(
    room_id: str,
    org_id: str = Depends(get_current_organization),
    _=Depends(require_roles("admin", "manager")),
):
    """List tenancies for a room."""
    session = get_session()
    try:
        room = session.get(Room, room_id)
        if not room:
            raise HTTPException(status_code=404, detail="Room not found")
        unit = session.get(Unit, room.unit_id)
        if not unit or str(getattr(unit, "organization_id", "")) != org_id:
            raise HTTPException(status_code=404, detail="Room not found")
        q = (
            select(Tenancy)
            .where(Tenancy.room_id == room_id, Tenancy.organization_id == org_id)
            .order_by(Tenancy.move_in_date.desc())
        )
        tenancies = list(session.exec(q).all())
        return [_tenancy_to_dict(t) for t in tenancies]
    finally:
        session.close()


@router.post("/tenancies", response_model=dict)
@limiter.limit("10/minute")
def admin_create_tenancy(
    request: Request,
    body: TenancyCreate,
    org_id: str = Depends(get_current_organization),
    current_user: User = Depends(require_roles("admin", "manager")),
):
    """Create a tenancy. Validates tenant/room/unit and prevents overlapping tenancies."""
    session = get_session()
    try:
        _validate_relations(session, body.tenant_id, body.room_id, body.unit_id, org_id)
        status = body.status
        if _overlaps(session, body.room_id, body.move_in_date, body.move_out_date, org_id):
            raise HTTPException(status_code=400, detail="Another tenancy overlaps this room for the given dates")
        tenancy = Tenancy(
            organization_id=org_id,
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
        create_audit_log(
            session, str(current_user.id), "create", "tenancy", str(tenancy.id),
            old_values=None, new_values=model_snapshot(tenancy),
        )
        session.commit()
        session.refresh(tenancy)
        return _tenancy_to_dict(tenancy)
    finally:
        session.close()


@router.patch("/tenancies/{tenancy_id}", response_model=dict)
@limiter.limit("10/minute")
def admin_patch_tenancy(
    request: Request,
    tenancy_id: str,
    body: TenancyPatch,
    org_id: str = Depends(get_current_organization),
    current_user: User = Depends(require_roles("admin", "manager")),
):
    """Update a tenancy (partial). Checks overlap when dates change."""
    session = get_session()
    try:
        tenancy = session.get(Tenancy, tenancy_id)
        if not tenancy or str(getattr(tenancy, "organization_id", "")) != org_id:
            raise HTTPException(status_code=404, detail="Tenancy not found")
        old_snapshot = model_snapshot(tenancy)
        data = body.model_dump(exclude_unset=True)
        move_in = data.get("move_in_date") or tenancy.move_in_date
        move_out = data.get("move_out_date") if "move_out_date" in data else tenancy.move_out_date

        if move_out is not None and move_out < move_in:
            raise HTTPException(status_code=400, detail="move_out_date must be on/after move_in_date")

        if _overlaps(session, tenancy.room_id, move_in, move_out, org_id, exclude_tenancy_id=tenancy_id):
            raise HTTPException(status_code=400, detail="Another tenancy overlaps this room for the given dates")
        for k, v in data.items():
            if hasattr(tenancy, k):
                setattr(tenancy, k, v)
        session.add(tenancy)
        create_audit_log(
            session, str(current_user.id), "update", "tenancy", str(tenancy_id),
            old_values=old_snapshot, new_values=model_snapshot(tenancy),
        )
        session.commit()
        session.refresh(tenancy)
        return _tenancy_to_dict(tenancy)
    finally:
        session.close()


@router.delete("/tenancies/{tenancy_id}")
@limiter.limit("10/minute")
def admin_delete_tenancy(
    request: Request,
    tenancy_id: str,
    org_id: str = Depends(get_current_organization),
    current_user: User = Depends(require_roles("admin", "manager")),
):
    """Delete a tenancy."""
    session = get_session()
    try:
        tenancy = session.get(Tenancy, tenancy_id)
        if not tenancy or str(getattr(tenancy, "organization_id", "")) != org_id:
            raise HTTPException(status_code=404, detail="Tenancy not found")
        old_snapshot = model_snapshot(tenancy)
        session.delete(tenancy)
        create_audit_log(
            session, str(current_user.id), "delete", "tenancy", str(tenancy_id),
            old_values=old_snapshot, new_values=None,
        )
        session.commit()
        return {"status": "ok", "message": "Tenancy deleted"}
    finally:
        session.close()
