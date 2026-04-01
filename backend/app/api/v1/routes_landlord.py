"""
Landlord portal API: scoped to the authenticated landlord only.
Uses get_current_landlord (role=landlord + resolve Landlord by user_id).
Read for properties, units, tenancies, invoices; create for units only (Phase 1).
"""

from typing import List, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator
from sqlmodel import select

from auth.dependencies import get_current_landlord, get_db_session
from app.services.tenancy_lifecycle import tenancy_derived_display_status, tenancy_display_end_date
from db.models import User, Landlord, Property, Unit, Tenancy, TenancyRevenue, Tenant, Invoice
from app.services.invoice_service import _invoice_to_api


class LandlordUnitCreate(BaseModel):
    """Body for creating a unit; property_id must belong to the authenticated landlord."""
    property_id: str
    title: str = ""
    address: str = ""
    city: str = ""
    rooms: int = Field(default=0, ge=0)
    type: Optional[str] = None
    city_id: Optional[str] = None

    @model_validator(mode="after")
    def _validate_property_id(self):
        if not self.property_id or not self.property_id.strip():
            raise ValueError("property_id must not be empty")
        return self


router = APIRouter(prefix="/api/landlord", tags=["landlord-portal"])


def _property_to_dict(p: Property) -> dict:
    return {
        "id": str(p.id),
        "landlord_id": getattr(p, "landlord_id", None),
        "title": getattr(p, "title", "") or "",
        "street": getattr(p, "street", None),
        "house_number": getattr(p, "house_number", None),
        "zip_code": getattr(p, "zip_code", None),
        "city": getattr(p, "city", None),
        "country": getattr(p, "country", "CH"),
        "lat": getattr(p, "lat", None),
        "lng": getattr(p, "lng", None),
        "status": getattr(p, "status", "active"),
        "notes": getattr(p, "notes", None),
        "created_at": p.created_at.isoformat() if getattr(p, "created_at", None) else None,
        "updated_at": p.updated_at.isoformat() if getattr(p, "updated_at", None) else None,
        "deleted_at": p.deleted_at.isoformat() if getattr(p, "deleted_at", None) and p.deleted_at else None,
    }


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


def _tenancy_to_dict(
    t: Tenancy,
    unit: Optional[Unit] = None,
    prop: Optional[Property] = None,
    tenant: Optional[Tenant] = None,
) -> dict:
    de = tenancy_display_end_date(t)
    base = {
        "id": str(t.id),
        "tenant_id": str(t.tenant_id),
        "room_id": str(t.room_id),
        "unit_id": str(t.unit_id),
        "move_in_date": t.move_in_date.isoformat() if t.move_in_date else None,
        "move_out_date": t.move_out_date.isoformat() if t.move_out_date else None,
        "notice_given_at": (
            t.notice_given_at.isoformat() if getattr(t, "notice_given_at", None) else None
        ),
        "termination_effective_date": (
            t.termination_effective_date.isoformat()
            if getattr(t, "termination_effective_date", None)
            else None
        ),
        "actual_move_out_date": (
            t.actual_move_out_date.isoformat()
            if getattr(t, "actual_move_out_date", None)
            else None
        ),
        "terminated_by": getattr(t, "terminated_by", None),
        "display_end_date": de.isoformat() if de else None,
        "display_status": tenancy_derived_display_status(t),
        "monthly_rent": float(t.monthly_rent),
        "deposit_amount": float(t.deposit_amount) if t.deposit_amount is not None else None,
        "status": t.status.value if hasattr(t.status, "value") else str(t.status),
        "created_at": t.created_at.isoformat() if getattr(t, "created_at", None) else None,
    }
    if unit is not None:
        base["unit_title"] = getattr(unit, "title", "") or ""
        base["unit_name"] = getattr(unit, "title", "") or ""
    if prop is not None:
        base["property_id"] = str(prop.id)
        base["property_title"] = getattr(prop, "title", "") or ""
    if tenant is not None:
        base["tenant_name"] = getattr(tenant, "name", "") or ""
        base["tenant_email"] = getattr(tenant, "email", "") or ""
    return base


@router.get("/me")
def landlord_me(user_landlord: Tuple[User, Landlord] = Depends(get_current_landlord)):
    """Landlord profile: user + landlord record. Scoped to current landlord only."""
    user, landlord = user_landlord
    role_str = getattr(user.role, "value", user.role) if getattr(user, "role", None) is not None else ""
    return {
        "user_id": str(user.id),
        "landlord_id": str(landlord.id),
        "full_name": user.full_name or landlord.contact_name or "",
        "email": user.email or landlord.email or "",
        "company_name": landlord.company_name or "",
        "contact_name": landlord.contact_name or "",
        "phone": landlord.phone or "",
        "role": role_str,
    }


@router.get("/properties", response_model=List[dict])
def landlord_list_properties(
    user_landlord: Tuple[User, Landlord] = Depends(get_current_landlord),
    session=Depends(get_db_session),
):
    """List properties for the current landlord. Scoped by Property.landlord_id == current_landlord.id."""
    _, landlord = user_landlord
    q = (
        select(Property)
        .where(Property.landlord_id == str(landlord.id))
        .where(Property.organization_id == str(landlord.organization_id))
        .order_by(Property.title)
    )
    properties = list(session.exec(q).all())
    return [_property_to_dict(p) for p in properties]


@router.get("/properties/{property_id}", response_model=dict)
def landlord_get_property(
    property_id: str,
    user_landlord: Tuple[User, Landlord] = Depends(get_current_landlord),
    session=Depends(get_db_session),
):
    """Get one property. 404 if not found or not owned by current landlord."""
    _, landlord = user_landlord
    prop = session.get(Property, property_id)
    if (
        not prop
        or str(prop.landlord_id) != str(landlord.id)
        or str(prop.organization_id) != str(landlord.organization_id)
    ):
        raise HTTPException(status_code=404, detail="Property not found")
    return _property_to_dict(prop)


@router.get("/units", response_model=List[dict])
def landlord_list_units(
    property_id: Optional[str] = None,
    user_landlord: Tuple[User, Landlord] = Depends(get_current_landlord),
    session=Depends(get_db_session),
):
    """List units for the current landlord's properties. Optional ?property_id= (must belong to landlord)."""
    _, landlord = user_landlord
    # Resolve landlord's property ids
    q_props = select(Property.id).where(
        Property.landlord_id == str(landlord.id),
        Property.organization_id == str(landlord.organization_id),
    )
    landlord_property_ids = [str(row) for row in session.exec(q_props).all()]
    if property_id is not None:
        if property_id not in landlord_property_ids:
            return []
        landlord_property_ids = [property_id]
    if not landlord_property_ids:
        return []
    q = (
        select(Unit, Property)
        .select_from(Unit)
        .join(Property, Unit.property_id == Property.id)
        .where(Unit.property_id.in_(landlord_property_ids))
        .where(Unit.organization_id == str(landlord.organization_id))
        .order_by(Unit.title)
    )
    rows = session.exec(q).all()
    return [_unit_to_dict(u, p.title if p else None) for u, p in rows]


@router.post("/units", response_model=dict)
def landlord_create_unit(
    body: LandlordUnitCreate,
    user_landlord: Tuple[User, Landlord] = Depends(get_current_landlord),
    session=Depends(get_db_session),
):
    """Create a unit only if the selected property belongs to the current landlord."""
    _, landlord = user_landlord
    q_props = select(Property.id).where(
        Property.landlord_id == str(landlord.id),
        Property.organization_id == str(landlord.organization_id),
    )
    landlord_property_ids = [str(row) for row in session.exec(q_props).all()]
    if body.property_id not in landlord_property_ids:
        raise HTTPException(
            status_code=403,
            detail="Property not found or you do not have permission to add units to it.",
        )
    title = (body.title or "").strip() or "New Unit"
    unit = Unit(
        organization_id=str(landlord.organization_id),
        title=title,
        address=body.address or "",
        city=body.city or "",
        rooms=body.rooms,
        type=body.type,
        city_id=body.city_id,
        property_id=body.property_id,
    )
    session.add(unit)
    session.commit()
    session.refresh(unit)
    prop = session.get(Property, unit.property_id) if unit.property_id else None
    property_title = getattr(prop, "title", None) if prop else None
    return _unit_to_dict(unit, property_title)


@router.get("/tenancies", response_model=List[dict])
def landlord_list_tenancies(
    user_landlord: Tuple[User, Landlord] = Depends(get_current_landlord),
    session=Depends(get_db_session),
):
    """List tenancies for units belonging to the current landlord. Scope: Unit.property_id -> Property.landlord_id."""
    _, landlord = user_landlord
    q_props = select(Property.id).where(
        Property.landlord_id == str(landlord.id),
        Property.organization_id == str(landlord.organization_id),
    )
    landlord_property_ids = [str(row) for row in session.exec(q_props).all()]
    if not landlord_property_ids:
        return []
    q_units = select(Unit.id).where(
        Unit.property_id.in_(landlord_property_ids),
        Unit.organization_id == str(landlord.organization_id),
    )
    landlord_unit_ids = [str(row) for row in session.exec(q_units).all()]
    if not landlord_unit_ids:
        return []
    q = (
        select(Tenancy, Unit, Property, Tenant)
        .select_from(Tenancy)
        .join(Unit, Tenancy.unit_id == Unit.id)
        .join(Property, Unit.property_id == Property.id)
        .outerjoin(Tenant, Tenancy.tenant_id == Tenant.id)
        .where(Tenancy.unit_id.in_(landlord_unit_ids))
        .where(Tenancy.organization_id == str(landlord.organization_id))
        .order_by(Tenancy.move_in_date.desc())
    )
    rows = list(session.exec(q).all())
    ten_ids = [str(t.id) for t, _, _, _ in rows]
    rev_rows = (
        list(session.exec(select(TenancyRevenue).where(TenancyRevenue.tenancy_id.in_(ten_ids))).all())
        if ten_ids
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

    out = []
    for t, unit, prop, tenant in rows:
        total = 0.0
        for rr in by_tid.get(str(t.id), []):
            f = str(getattr(rr, "frequency", None) or "monthly").strip().lower()
            if f == "one_time":
                continue
            amt = float(getattr(rr, "amount_chf", 0) or 0)
            total += _monthly_equiv(f, amt)
        rec = _tenancy_to_dict(t, unit, prop, tenant)
        rec["monthly_revenue_equivalent"] = round(total, 2)
        out.append(rec)
    return out


def _enrich_invoice_for_landlord(inv: Invoice, unit: Optional[Unit], prop: Optional[Property], tenant: Optional[Tenant]) -> dict:
    """API shape from invoice_service plus unit/property/tenant for landlord display."""
    out = dict(_invoice_to_api(inv))
    out["unit_id"] = str(inv.unit_id) if getattr(inv, "unit_id", None) else None
    if unit is not None:
        out["unit_title"] = getattr(unit, "title", "") or ""
        out["unit_name"] = getattr(unit, "title", "") or ""
    if prop is not None:
        out["property_id"] = str(prop.id)
        out["property_title"] = getattr(prop, "title", "") or ""
    if tenant is not None:
        out["tenant_name"] = getattr(tenant, "name", "") or ""
        out["tenant_email"] = getattr(tenant, "email", "") or ""
    return out


@router.get("/invoices", response_model=List[dict])
def landlord_list_invoices(
    user_landlord: Tuple[User, Landlord] = Depends(get_current_landlord),
    session=Depends(get_db_session),
):
    """List invoices for the current landlord's units. Scope: Landlord -> Property -> Unit -> Invoice."""
    _, landlord = user_landlord
    q_props = select(Property.id).where(
        Property.landlord_id == str(landlord.id),
        Property.organization_id == str(landlord.organization_id),
    )
    landlord_property_ids = [str(row) for row in session.exec(q_props).all()]
    if not landlord_property_ids:
        return []
    q_units = select(Unit.id).where(
        Unit.property_id.in_(landlord_property_ids),
        Unit.organization_id == str(landlord.organization_id),
    )
    landlord_unit_ids = [str(row) for row in session.exec(q_units).all()]
    if not landlord_unit_ids:
        return []
    stmt = (
        select(Invoice, Unit, Property, Tenant)
        .select_from(Invoice)
        .join(Unit, Invoice.unit_id == Unit.id)
        .join(Property, Unit.property_id == Property.id)
        .outerjoin(Tenant, Invoice.tenant_id == Tenant.id)
        .where(Invoice.unit_id.in_(landlord_unit_ids))
        .where(Invoice.organization_id == str(landlord.organization_id))
        .order_by(Invoice.issue_date.desc())
    )
    rows = list(session.exec(stmt).all())
    return [_enrich_invoice_for_landlord(inv, unit, prop, tenant) for inv, unit, prop, tenant in rows]
