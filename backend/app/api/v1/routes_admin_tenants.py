"""
Admin tenants: CRUD.
Protected by require_roles("admin", "manager").
"""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import select

from db.database import get_session
from db.models import Tenant
from auth.dependencies import require_roles


router = APIRouter(prefix="/api/admin", tags=["admin-tenants"])


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
    email: str = ""
    phone: Optional[str] = None
    company: Optional[str] = None
    room_id: Optional[str] = None


class TenantPatch(BaseModel):
    full_name: Optional[str] = None
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    company: Optional[str] = None
    room_id: Optional[str] = None


@router.get("/tenants", response_model=List[dict])
def admin_list_tenants(
    _=Depends(require_roles("admin", "manager")),
):
    """List all tenants."""
    session = get_session()
    try:
        tenants = list(session.exec(select(Tenant).order_by(Tenant.name)).all())
        return [_tenant_to_dict(t) for t in tenants]
    finally:
        session.close()


@router.post("/tenants", response_model=dict)
def admin_create_tenant(
    body: TenantCreate,
    _=Depends(require_roles("admin", "manager")),
):
    """Create a new tenant."""
    session = get_session()
    try:
        name = (body.full_name or body.name or "").strip() or "Tenant"
        tenant = Tenant(
            name=name,
            email=body.email or "",
            room_id=body.room_id,
            phone=body.phone,
            company=body.company,
        )
        session.add(tenant)
        session.commit()
        session.refresh(tenant)
        return _tenant_to_dict(tenant)
    finally:
        session.close()


@router.patch("/tenants/{tenant_id}", response_model=dict)
def admin_patch_tenant(
    tenant_id: str,
    body: TenantPatch,
    _=Depends(require_roles("admin", "manager")),
):
    """Update a tenant (partial)."""
    session = get_session()
    try:
        tenant = session.get(Tenant, tenant_id)
        if not tenant:
            raise HTTPException(status_code=404, detail="Tenant not found")
        data = body.model_dump(exclude_unset=True)
        if "full_name" in data and "name" not in data:
            data["name"] = data.pop("full_name")
        elif "name" in data:
            pass
        for k, v in data.items():
            if hasattr(tenant, k):
                setattr(tenant, k, v)
        session.add(tenant)
        session.commit()
        session.refresh(tenant)
        return _tenant_to_dict(tenant)
    finally:
        session.close()


@router.delete("/tenants/{tenant_id}")
def admin_delete_tenant(
    tenant_id: str,
    _=Depends(require_roles("admin", "manager")),
):
    """Delete a tenant."""
    session = get_session()
    try:
        tenant = session.get(Tenant, tenant_id)
        if not tenant:
            raise HTTPException(status_code=404, detail="Tenant not found")
        session.delete(tenant)
        session.commit()
        return {"status": "ok", "message": "Tenant deleted"}
    finally:
        session.close()
