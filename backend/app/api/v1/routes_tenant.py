"""
Tenant portal API: scoped to the authenticated tenant only.
Uses get_current_tenant (role=tenant + resolve tenant by User.email → Tenant.email).
All data filtered by tenant.id; no cross-tenant access.
"""

from typing import Any, Dict, List, Tuple

from fastapi import APIRouter, Depends
from sqlmodel import select

from auth.dependencies import get_current_tenant, get_db_session
from db.models import Tenant, Tenancy, TenancyRevenue, Invoice, User, Unit, Room
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
        "monthly_revenue_equivalent": getattr(t, "_monthly_revenue_equivalent", 0) or 0,
        "monthly_rent": float(t.monthly_rent) if t.monthly_rent is not None else 0,
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
def tenant_tenancies(
    user_tenant: Tuple[User, Tenant] = Depends(get_current_tenant),
    session=Depends(get_db_session),
):
    """List tenancies for the current tenant only. Includes unit/room display names where available."""
    _, tenant = user_tenant
    q = (
        select(Tenancy)
        .where(Tenancy.tenant_id == str(tenant.id))
        .order_by(Tenancy.move_in_date.desc())
    )
    tenancies = list(session.exec(q).all())
    ids = [str(t.id) for t in tenancies]
    rev_rows = (
        list(
            session.exec(
                select(TenancyRevenue).where(TenancyRevenue.tenancy_id.in_(ids))
            ).all()
        )
        if ids
        else []
    )
    by_tid: dict[str, list[TenancyRevenue]] = {}
    for rr in rev_rows:
        by_tid.setdefault(str(rr.tenancy_id), []).append(rr)

    def _monthly_equiv(freq: str, amount: float) -> float:
        f = str(freq or "monthly").strip().lower()
        if f == "monthly":
            return amount
        if f == "yearly":
            return amount / 12.0
        return 0.0

    for t in tenancies:
        total = 0.0
        for rr in by_tid.get(str(t.id), []):
            f = str(getattr(rr, "frequency", None) or "monthly").strip().lower()
            if f == "one_time":
                continue
            amt = float(getattr(rr, "amount_chf", 0) or 0)
            total += _monthly_equiv(f, amt)
        t._monthly_revenue_equivalent = round(total, 2)
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


@router.get("/invoices")
def tenant_invoices(
    user_tenant: Tuple[User, Tenant] = Depends(get_current_tenant),
    session=Depends(get_db_session),
):
    """List invoices for the current tenant only. Scoped by tenant_id in DB."""
    _, tenant = user_tenant
    stmt = (
        select(Invoice)
        .where(Invoice.tenant_id == str(tenant.id))
        .order_by(Invoice.issue_date.desc())
    )
    rows = session.exec(stmt).all()
    return [_invoice_to_api(inv) for inv in rows]
