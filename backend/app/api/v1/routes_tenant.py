"""
Tenant portal API: scoped to the authenticated tenant only.
Uses get_current_tenant (role=tenant + resolve tenant by User.email → Tenant.email).
All data filtered by tenant.id; no cross-tenant access.
"""

from typing import Any, Dict, List, Tuple

from fastapi import APIRouter, Depends
from sqlmodel import select

from db.database import get_session
from db.models import Tenant, Tenancy, Invoice, User, Unit, Room
from auth.dependencies import get_current_tenant
from app.services.invoice_service import _invoice_to_api


router = APIRouter(prefix="/api/tenant", tags=["tenant-portal"])


def _tenancy_to_tenant_dict(
    t: Tenancy,
    unit_title: str | None = None,
    room_name: str | None = None,
) -> Dict[str, Any]:
    return {
        "id": str(t.id) if t.id is not None else None,
        "unit_id": str(t.unit_id) if t.unit_id is not None else None,
        "room_id": str(t.room_id) if t.room_id is not None else None,
        "unit_title": unit_title,
        "room_name": room_name,
        "move_in_date": t.move_in_date.isoformat() if t.move_in_date else None,
        "move_out_date": t.move_out_date.isoformat() if t.move_out_date else None,
        "status": t.status.value if hasattr(t.status, "value") else str(t.status),
        "rent_chf": float(t.rent_chf) if t.rent_chf is not None else 0,
    }


@router.get("/me")
def tenant_me(user_tenant: Tuple[User, Tenant] = Depends(get_current_tenant)):
    """Tenant profile: user + tenant record. Scoped to current tenant only."""
    user, tenant = user_tenant
    role_str = getattr(user.role, "value", user.role) if getattr(user, "role", None) is not None else ""
    return {
        "user_id": str(user.id),
        "tenant_id": str(tenant.id),
        "full_name": user.full_name or tenant.name,
        "email": user.email or tenant.email or "",
        "phone": tenant.phone or "",
        "role": role_str,
    }


@router.get("/tenancies")
def tenant_tenancies(user_tenant: Tuple[User, Tenant] = Depends(get_current_tenant)):
    """List tenancies for the current tenant only. Includes unit/room display names where available."""
    _, tenant = user_tenant
    session = get_session()
    try:
        q = (
            select(Tenancy)
            .where(Tenancy.tenant_id == str(tenant.id))
            .order_by(Tenancy.move_in_date.desc())
        )
        tenancies = list(session.exec(q).all())
        result = []
        for t in tenancies:
            unit = session.get(Unit, t.unit_id) if t.unit_id else None
            room = session.get(Room, t.room_id) if t.room_id else None
            result.append(_tenancy_to_tenant_dict(
                t,
                unit_title=getattr(unit, "title", None) if unit else None,
                room_name=getattr(room, "name", None) if room else None,
            ))
        return result
    finally:
        session.close()


@router.get("/invoices")
def tenant_invoices(user_tenant: Tuple[User, Tenant] = Depends(get_current_tenant)):
    """List invoices for the current tenant only. Scoped by tenant_id in DB."""
    _, tenant = user_tenant
    session = get_session()
    try:
        stmt = (
            select(Invoice)
            .where(Invoice.tenant_id == str(tenant.id))
            .order_by(Invoice.issue_date.desc())
        )
        rows = session.exec(stmt).all()
        return [_invoice_to_api(inv) for inv in rows]
    finally:
        session.close()
