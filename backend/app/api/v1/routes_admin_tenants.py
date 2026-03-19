"""
Admin tenants: CRUD.
Protected by require_roles("admin", "manager").
"""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, EmailStr, Field, model_validator
from sqlalchemy import func
from sqlalchemy import or_
from sqlmodel import select

from db.database import get_session
from db.models import Tenant, User, Room, Unit
from db.audit import create_audit_log, model_snapshot
from auth.dependencies import get_current_organization, require_roles
from app.core.rate_limit import limiter


router = APIRouter(prefix="/api/admin", tags=["admin-tenants"])


def _assert_room_in_org(session, room_id: Optional[str], org_id: str) -> None:
    if not room_id:
        return
    room = session.get(Room, room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    unit = session.get(Unit, room.unit_id)
    if not unit or str(getattr(unit, "organization_id", "")) != org_id:
        raise HTTPException(status_code=404, detail="Room not found")


def _tenant_to_dict(t: Tenant) -> dict:
    return {
        "id": str(t.id),
        "full_name": getattr(t, "name", "") or "",
        "name": getattr(t, "name", "") or "",
        "email": getattr(t, "email", "") or "",
        "phone": getattr(t, "phone", None),
        "company": getattr(t, "company", None),
        "room_id": getattr(t, "room_id", None),
        "created_at": t.created_at.isoformat() if getattr(t, "created_at", None) else None,
    }


class TenantCreate(BaseModel):
    full_name: Optional[str] = None
    name: Optional[str] = None
    email: EmailStr
    phone: Optional[str] = None
    company: Optional[str] = None
    room_id: Optional[str] = None

    @model_validator(mode="after")
    def _no_whitespace_only_strings(self):
        if self.full_name is not None and not self.full_name.strip():
            raise ValueError("full_name must not be empty")
        if self.name is not None and not self.name.strip():
            raise ValueError("name must not be empty")
        if self.room_id is not None and not self.room_id.strip():
            raise ValueError("room_id must not be empty")
        return self


class TenantPatch(BaseModel):
    full_name: Optional[str] = None
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    company: Optional[str] = None
    room_id: Optional[str] = None

    @model_validator(mode="after")
    def _no_whitespace_only_strings(self):
        if self.full_name is not None and not self.full_name.strip():
            raise ValueError("full_name must not be empty")
        if self.name is not None and not self.name.strip():
            raise ValueError("name must not be empty")
        if self.room_id is not None and not self.room_id.strip():
            raise ValueError("room_id must not be empty")
        return self


class TenantListResponse(BaseModel):
    items: List[dict]
    total: int
    skip: int
    limit: int


@router.get("/tenants", response_model=TenantListResponse)
def admin_list_tenants(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    org_id: str = Depends(get_current_organization),
    _=Depends(require_roles("admin", "manager")),
):
    """List all tenants."""
    session = get_session()
    try:
        base_query = (
            select(Tenant)
            .where(Tenant.organization_id == org_id)
            .order_by(Tenant.name)
        )
        _total_rows = session.exec(
            select(func.count())
            .select_from(Tenant)
            .where(Tenant.organization_id == org_id)
        ).all()
        total = int(_total_rows[0]) if _total_rows else 0
        paged_rows = session.exec(base_query.offset(skip).limit(limit)).all()
        items = [_tenant_to_dict(t) for t in paged_rows]
        return TenantListResponse(items=items, total=total, skip=skip, limit=limit)
    finally:
        session.close()


@router.post("/tenants", response_model=dict)
@limiter.limit("10/minute")
def admin_create_tenant(
    request: Request,
    body: TenantCreate,
    org_id: str = Depends(get_current_organization),
    current_user: User = Depends(require_roles("admin", "manager")),
):
    """Create a new tenant."""
    session = get_session()
    try:
        _assert_room_in_org(session, body.room_id, org_id)
        name = (body.full_name or body.name or "").strip() or "Tenant"
        tenant = Tenant(
            organization_id=org_id,
            name=name,
            email=body.email or "",
            room_id=body.room_id,
            phone=body.phone,
            company=body.company,
        )
        session.add(tenant)
        create_audit_log(
            session, str(current_user.id), "create", "tenant", str(tenant.id),
            old_values=None, new_values=model_snapshot(tenant),
        )
        session.commit()
        session.refresh(tenant)
        return _tenant_to_dict(tenant)
    finally:
        session.close()


@router.patch("/tenants/{tenant_id}", response_model=dict)
@limiter.limit("10/minute")
def admin_patch_tenant(
    request: Request,
    tenant_id: str,
    body: TenantPatch,
    org_id: str = Depends(get_current_organization),
    current_user: User = Depends(require_roles("admin", "manager")),
):
    """Update a tenant (partial)."""
    session = get_session()
    try:
        tenant = session.get(Tenant, tenant_id)
        if not tenant or str(getattr(tenant, "organization_id", "")) != org_id:
            raise HTTPException(status_code=404, detail="Tenant not found")
        old_snapshot = model_snapshot(tenant)
        data = body.model_dump(exclude_unset=True)
        if "room_id" in data:
            _assert_room_in_org(session, data.get("room_id"), org_id)
        if "full_name" in data and "name" not in data:
            data["name"] = data.pop("full_name")
        elif "name" in data:
            pass
        for k, v in data.items():
            if hasattr(tenant, k):
                setattr(tenant, k, v)
        session.add(tenant)
        create_audit_log(
            session, str(current_user.id), "update", "tenant", str(tenant_id),
            old_values=old_snapshot, new_values=model_snapshot(tenant),
        )
        session.commit()
        session.refresh(tenant)
        return _tenant_to_dict(tenant)
    finally:
        session.close()


@router.delete("/tenants/{tenant_id}")
@limiter.limit("10/minute")
def admin_delete_tenant(
    request: Request,
    tenant_id: str,
    org_id: str = Depends(get_current_organization),
    current_user: User = Depends(require_roles("admin", "manager")),
):
    """Delete a tenant."""
    session = get_session()
    try:
        tenant = session.get(Tenant, tenant_id)
        if not tenant or str(getattr(tenant, "organization_id", "")) != org_id:
            raise HTTPException(status_code=404, detail="Tenant not found")
        old_snapshot = model_snapshot(tenant)
        session.delete(tenant)
        create_audit_log(
            session, str(current_user.id), "delete", "tenant", str(tenant_id),
            old_values=old_snapshot, new_values=None,
        )
        session.commit()
        return {"status": "ok", "message": "Tenant deleted"}
    finally:
        session.close()
