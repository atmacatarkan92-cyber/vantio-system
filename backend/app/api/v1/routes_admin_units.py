"""
Admin units and rooms: CRUD + list rooms by unit.
Protected by require_roles("admin", "manager").
"""

from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError, OperationalError, ProgrammingError
from sqlmodel import select

from auth.dependencies import get_current_organization, get_db_session, require_roles
from db.models import Unit, Room, Property, Landlord, PropertyManager, User, Tenancy
from db.audit import create_audit_log, model_snapshot
from app.core.rate_limit import limiter


router = APIRouter(prefix="/api/admin", tags=["admin-units"])

_UNIT_DELETE_BLOCKED_FALLBACK = (
    "Unit kann nicht gelöscht werden, da noch verknüpfte Daten vorhanden sind."
)


def _unit_delete_blocked_detail(room_count: int, tenancy_count: int) -> str:
    """Precise German reason when rooms and/or tenancies block unit delete."""
    if room_count > 0 and tenancy_count > 0:
        rc = "1 Zimmer" if room_count == 1 else f"{room_count} Zimmer"
        tc = "1 Mietverhältnis" if tenancy_count == 1 else f"{tenancy_count} Mietverhältnisse"
        return (
            f"Unit kann nicht gelöscht werden, da noch {rc} und {tc} vorhanden sind."
        )
    if room_count > 0:
        subj = "1 Zimmer" if room_count == 1 else f"{room_count} Zimmer"
        verb = "ist" if room_count == 1 else "sind"
        return f"Unit kann nicht gelöscht werden, da noch {subj} vorhanden {verb}."
    if tenancy_count > 0:
        subj = "1 Mietverhältnis" if tenancy_count == 1 else f"{tenancy_count} Mietverhältnisse"
        verb = "ist" if tenancy_count == 1 else "sind"
        return f"Unit kann nicht gelöscht werden, da noch {subj} vorhanden {verb}."
    return _UNIT_DELETE_BLOCKED_FALLBACK


def _assert_property_and_landlord_in_org(session, property_id: Optional[str], org_id: str) -> None:
    if not property_id:
        return
    prop = session.get(Property, property_id)
    if not prop or str(getattr(prop, "organization_id", "")) != org_id:
        raise HTTPException(status_code=404, detail="Property not found")
    lid = getattr(prop, "landlord_id", None)
    if lid:
        ll = session.get(Landlord, lid)
        if not ll or str(getattr(ll, "organization_id", "")) != org_id:
            raise HTTPException(status_code=400, detail="Invalid landlord reference for property")


def _assert_landlord_in_org(session, landlord_id: Optional[str], org_id: str) -> None:
    if not landlord_id:
        return
    ll = session.get(Landlord, landlord_id)
    if not ll or str(getattr(ll, "organization_id", "")) != org_id:
        raise HTTPException(status_code=404, detail="Landlord not found")


def _assert_property_manager_in_org(session, property_manager_id: Optional[str], org_id: str) -> None:
    if not property_manager_id:
        return
    pm = session.get(PropertyManager, property_manager_id)
    if not pm or str(getattr(pm, "organization_id", "")) != org_id:
        raise HTTPException(status_code=404, detail="Property manager not found")


def _iso_date(d: Optional[date]) -> str:
    if d is None:
        return ""
    if hasattr(d, "isoformat"):
        return d.isoformat()[:10]
    return ""


def _iso_date_or_none(d: Optional[date]) -> Optional[str]:
    if d is None:
        return None
    if hasattr(d, "isoformat"):
        return d.isoformat()[:10]
    return None


def _unit_to_dict(u: Unit, property_title: Optional[str] = None) -> dict:
    tp = float(getattr(u, "tenant_price_monthly_chf", 0) or 0)
    lr = float(getattr(u, "landlord_rent_monthly_chf", 0) or 0)
    ut = float(getattr(u, "utilities_monthly_chf", 0) or 0)
    cl = float(getattr(u, "cleaning_cost_monthly_chf", 0) or 0)
    occ = getattr(u, "occupancy_status", None) or ""
    ld = getattr(u, "landlord_lease_start_date", None)
    af = getattr(u, "available_from", None)
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
        "landlord_id": getattr(u, "landlord_id", None),
        "property_manager_id": getattr(u, "property_manager_id", None),
        "property_title": property_title,
        "created_at": u.created_at.isoformat() if getattr(u, "created_at", None) else None,
        "tenantPriceMonthly": tp,
        "landlordRentMonthly": lr,
        "utilitiesMonthly": ut,
        "cleaningCostMonthly": cl,
        "landlordLeaseStartDate": _iso_date(ld),
        "availableFrom": _iso_date(af),
        "status": occ or "Frei",
        "occupiedRooms": int(getattr(u, "occupied_rooms", 0) or 0),
        "zip": getattr(u, "postal_code", None) or "",
        "landlordDepositType": getattr(u, "landlord_deposit_type", None) or "",
        "landlordDepositAmount": (
            float(getattr(u, "landlord_deposit_amount"))
            if getattr(u, "landlord_deposit_amount", None) is not None
            else None
        ),
        "landlordDepositAnnualPremium": (
            float(getattr(u, "landlord_deposit_annual_premium"))
            if getattr(u, "landlord_deposit_annual_premium", None) is not None
            else None
        ),
        "leaseType": getattr(u, "lease_type", None),
        "leaseStartDate": _iso_date_or_none(getattr(u, "lease_start_date", None)),
        "leaseEndDate": _iso_date_or_none(getattr(u, "lease_end_date", None)),
        "noticeGivenDate": _iso_date_or_none(getattr(u, "notice_given_date", None)),
        "terminationEffectiveDate": _iso_date_or_none(
            getattr(u, "termination_effective_date", None)
        ),
        "returnedToLandlordDate": _iso_date_or_none(
            getattr(u, "returned_to_landlord_date", None)
        ),
        "leaseStatus": getattr(u, "lease_status", None),
        "leaseNotes": getattr(u, "lease_notes", None),
    }


ALLOWED_ROOM_STATUS = frozenset({"Frei", "Belegt", "Reserviert"})
ALLOWED_LANDLORD_DEPOSIT_TYPES = frozenset({"bank", "insurance", "cash", "none"})


def _room_to_dict(r: Room) -> dict:
    price = getattr(r, "price", 0)
    status = getattr(r, "status", None) or "Frei"
    return {
        "id": str(r.id),
        "unit_id": r.unit_id,
        "unitId": r.unit_id,
        "name": r.name,
        "price": price,
        "base_rent_chf": getattr(r, "base_rent_chf", None) or price,
        "floor": getattr(r, "floor", None),
        "is_active": getattr(r, "is_active", True),
        "size_m2": getattr(r, "size_m2", None),
        "status": status,
    }


class CoLivingRoomInput(BaseModel):
    name: str
    price: int = Field(default=0, ge=0)
    floor: Optional[int] = Field(default=None, ge=0)
    size_m2: Optional[float] = Field(default=None, ge=0)
    status: str = Field(default="Frei")

    @model_validator(mode="after")
    def _normalize(self) -> "CoLivingRoomInput":
        n = self.name.strip()
        if not n:
            raise ValueError("name must not be empty")
        self.name = n
        if self.status not in ALLOWED_ROOM_STATUS:
            raise ValueError(
                f"status must be one of: {', '.join(sorted(ALLOWED_ROOM_STATUS))}"
            )
        return self


class UnitCreate(BaseModel):
    name: Optional[str] = None
    title: Optional[str] = None
    address: str = ""
    city: str = ""
    city_id: Optional[str] = None
    type: Optional[str] = None
    rooms: int = Field(default=0, ge=0)
    property_id: Optional[str] = None
    landlord_id: Optional[str] = None
    property_manager_id: Optional[str] = None
    co_living_rooms: Optional[List[CoLivingRoomInput]] = None
    tenant_price_monthly_chf: float = Field(default=0, ge=0)
    landlord_rent_monthly_chf: float = Field(default=0, ge=0)
    utilities_monthly_chf: float = Field(default=0, ge=0)
    cleaning_cost_monthly_chf: float = Field(default=0, ge=0)
    landlord_lease_start_date: Optional[date] = None
    available_from: Optional[date] = None
    occupancy_status: Optional[str] = None
    occupied_rooms: int = Field(default=0, ge=0)
    postal_code: Optional[str] = None
    landlord_deposit_type: Optional[str] = None
    landlord_deposit_amount: Optional[float] = Field(default=None, ge=0)
    landlord_deposit_annual_premium: Optional[float] = Field(default=None, ge=0)
    lease_type: Optional[str] = None
    lease_start_date: Optional[date] = None
    lease_end_date: Optional[date] = None
    notice_given_date: Optional[date] = None
    termination_effective_date: Optional[date] = None
    returned_to_landlord_date: Optional[date] = None
    lease_status: Optional[str] = None
    lease_notes: Optional[str] = None

    @field_validator("landlord_deposit_type", mode="before")
    @classmethod
    def _normalize_landlord_deposit_type_create(cls, v):
        if v is None or v == "":
            return None
        s = str(v).strip().lower()
        if s not in ALLOWED_LANDLORD_DEPOSIT_TYPES:
            raise ValueError(
                "landlord_deposit_type must be one of: bank, insurance, cash, none"
            )
        return s

    @model_validator(mode="after")
    def _co_living_rooms_match_count(self) -> "UnitCreate":
        t = (self.type or "").strip()
        if t == "Co-Living":
            if self.rooms > 0:
                if not self.co_living_rooms or len(self.co_living_rooms) != self.rooms:
                    raise ValueError(
                        "co_living_rooms must have exactly one entry per room (rooms) for Co-Living"
                    )
            elif self.co_living_rooms:
                raise ValueError("co_living_rooms must be omitted when rooms is 0")
        return self


class UnitPatch(BaseModel):
    name: Optional[str] = None
    title: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    city_id: Optional[str] = None
    type: Optional[str] = None
    rooms: Optional[int] = Field(default=None, ge=0)
    property_id: Optional[str] = None
    landlord_id: Optional[str] = None
    property_manager_id: Optional[str] = None
    tenant_price_monthly_chf: Optional[float] = Field(default=None, ge=0)
    landlord_rent_monthly_chf: Optional[float] = Field(default=None, ge=0)
    utilities_monthly_chf: Optional[float] = Field(default=None, ge=0)
    cleaning_cost_monthly_chf: Optional[float] = Field(default=None, ge=0)
    landlord_lease_start_date: Optional[date] = None
    available_from: Optional[date] = None
    occupancy_status: Optional[str] = None
    occupied_rooms: Optional[int] = Field(default=None, ge=0)
    postal_code: Optional[str] = None
    landlord_deposit_type: Optional[str] = None
    landlord_deposit_amount: Optional[float] = Field(default=None, ge=0)
    landlord_deposit_annual_premium: Optional[float] = Field(default=None, ge=0)
    lease_type: Optional[str] = None
    lease_start_date: Optional[date] = None
    lease_end_date: Optional[date] = None
    notice_given_date: Optional[date] = None
    termination_effective_date: Optional[date] = None
    returned_to_landlord_date: Optional[date] = None
    lease_status: Optional[str] = None
    lease_notes: Optional[str] = None

    @field_validator("landlord_deposit_type", mode="before")
    @classmethod
    def _normalize_landlord_deposit_type_patch(cls, v):
        if v is None or v == "":
            return None
        s = str(v).strip().lower()
        if s not in ALLOWED_LANDLORD_DEPOSIT_TYPES:
            raise ValueError(
                "landlord_deposit_type must be one of: bank, insurance, cash, none"
            )
        return s


class UnitListResponse(BaseModel):
    items: List[dict]
    total: int
    skip: int
    limit: int


def _create_initial_rooms_for_unit(session, unit: Unit, body: UnitCreate) -> None:
    """Apartment: one synthetic room. Co-Living: N rooms from body (validated)."""
    ut = (unit.type or "").strip()
    if ut == "Apartment":
        existing = session.exec(select(Room).where(Room.unit_id == unit.id)).first()
        if existing is None:
            session.add(
                Room(
                    unit_id=unit.id,
                    name="Gesamte Wohnung",
                    price=0,
                    floor=None,
                    is_active=True,
                    size_m2=None,
                    status="Frei",
                )
            )
    elif ut == "Co-Living" and body.rooms > 0 and body.co_living_rooms:
        for r in body.co_living_rooms:
            session.add(
                Room(
                    unit_id=unit.id,
                    name=r.name.strip(),
                    price=r.price,
                    floor=r.floor,
                    is_active=True,
                    size_m2=r.size_m2,
                    status=r.status,
                )
            )


@router.get("/units", response_model=UnitListResponse)
def admin_list_units(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    org_id: str = Depends(get_current_organization),
    _=Depends(require_roles("admin", "manager")),
    session=Depends(get_db_session),
):
    """List units (listings dropdown + admin pages) with basic pagination."""
    try:
        base_query = (
            select(Unit, Property)
            .select_from(Unit)
            .outerjoin(Property, Unit.property_id == Property.id)
            .where(Unit.organization_id == org_id)
            .order_by(Unit.title)
        )
        _total_rows = session.exec(
            select(func.count())
            .select_from(Unit)
            .outerjoin(Property, Unit.property_id == Property.id)
            .where(Unit.organization_id == org_id)
        ).all()
        total = int(_total_rows[0]) if _total_rows else 0

        # Apply offset/limit for items
        paged_rows = session.exec(
            base_query.offset(skip).limit(limit)
        ).all()
        items = [_unit_to_dict(u, p.title if p else None) for u, p in paged_rows]
        return UnitListResponse(
            items=items,
            total=total,
            skip=skip,
            limit=limit,
        )
    except (OperationalError, ProgrammingError) as e:
        session.rollback()
        msg = str(e).strip() or "database error"
        if "does not exist" in msg or "column" in msg.lower() or "relation" in msg.lower():
            raise HTTPException(
                status_code=503,
                detail=(
                    "Unit table schema may be outdated. Run: python -m scripts.ensure_units_rooms_tenants_columns"
                ),
            ) from e
        raise HTTPException(status_code=503, detail=msg) from e


@router.get("/units/{unit_id}", response_model=dict)
def admin_get_unit(
    unit_id: str,
    org_id: str = Depends(get_current_organization),
    _=Depends(require_roles("admin", "manager")),
    session=Depends(get_db_session),
):
    """Get a single unit by id. Includes property_id and property_title."""
    unit = session.get(Unit, unit_id)
    if not unit or str(getattr(unit, "organization_id", "")) != org_id:
        raise HTTPException(status_code=404, detail="Unit not found")
    property_title = None
    if getattr(unit, "property_id", None):
        prop = session.get(Property, unit.property_id)
        if prop:
            property_title = getattr(prop, "title", None)
    return _unit_to_dict(unit, property_title)


@router.post("/units", response_model=dict)
@limiter.limit("10/minute")
def admin_create_unit(
    request: Request,
    body: UnitCreate,
    org_id: str = Depends(get_current_organization),
    current_user: User = Depends(require_roles("admin", "manager")),
    session=Depends(get_db_session),
):
    """Create a new unit."""
    _assert_property_and_landlord_in_org(session, body.property_id, org_id)
    _assert_landlord_in_org(session, body.landlord_id, org_id)
    _assert_property_manager_in_org(session, body.property_manager_id, org_id)
    title = (body.title or body.name or "").strip() or "New Unit"
    unit = Unit(
        organization_id=org_id,
        title=title,
        address=body.address or "",
        city=body.city or "",
        rooms=body.rooms,
        type=body.type,
        city_id=body.city_id,
        property_id=body.property_id,
        landlord_id=body.landlord_id,
        property_manager_id=body.property_manager_id,
        tenant_price_monthly_chf=body.tenant_price_monthly_chf,
        landlord_rent_monthly_chf=body.landlord_rent_monthly_chf,
        utilities_monthly_chf=body.utilities_monthly_chf,
        cleaning_cost_monthly_chf=body.cleaning_cost_monthly_chf,
        landlord_lease_start_date=body.landlord_lease_start_date,
        available_from=body.available_from,
        occupancy_status=(body.occupancy_status or "").strip() or None,
        occupied_rooms=body.occupied_rooms,
        postal_code=(body.postal_code or "").strip() or None,
        landlord_deposit_type=body.landlord_deposit_type,
        landlord_deposit_amount=body.landlord_deposit_amount,
        landlord_deposit_annual_premium=body.landlord_deposit_annual_premium,
        lease_type=body.lease_type,
        lease_start_date=body.lease_start_date,
        lease_end_date=body.lease_end_date,
        notice_given_date=body.notice_given_date,
        termination_effective_date=body.termination_effective_date,
        returned_to_landlord_date=body.returned_to_landlord_date,
        lease_status=body.lease_status,
        lease_notes=body.lease_notes,
    )
    session.add(unit)
    session.flush()
    _create_initial_rooms_for_unit(session, unit, body)
    create_audit_log(
        session, str(current_user.id), "create", "unit", str(unit.id),
        old_values=None, new_values=model_snapshot(unit),
    )
    session.commit()
    session.refresh(unit)
    return _unit_to_dict(unit)


@router.patch("/units/{unit_id}", response_model=dict)
@limiter.limit("10/minute")
def admin_patch_unit(
    request: Request,
    unit_id: str,
    body: UnitPatch,
    org_id: str = Depends(get_current_organization),
    current_user: User = Depends(require_roles("admin", "manager")),
    session=Depends(get_db_session),
):
    """Update a unit (partial)."""
    unit = session.get(Unit, unit_id)
    if not unit or str(getattr(unit, "organization_id", "")) != org_id:
        raise HTTPException(status_code=404, detail="Unit not found")
    old_snapshot = model_snapshot(unit)
    data = body.model_dump(exclude_unset=True)
    if "property_id" in data:
        pid = data["property_id"] if data["property_id"] else None
        _assert_property_and_landlord_in_org(session, pid, org_id)
    if "landlord_id" in data:
        lid = data["landlord_id"] if data["landlord_id"] else None
        _assert_landlord_in_org(session, lid, org_id)
    if "property_manager_id" in data:
        pmid = data["property_manager_id"] if data["property_manager_id"] else None
        _assert_property_manager_in_org(session, pmid, org_id)
    if "name" in data and "title" not in data:
        data["title"] = data.pop("name")
    elif "title" in data:
        pass
    for k, v in data.items():
        if hasattr(unit, k):
            setattr(unit, k, v)
    if "property_id" in data and data["property_id"] == "":
        unit.property_id = None
    if "landlord_id" in data and data["landlord_id"] == "":
        unit.landlord_id = None
    if "property_manager_id" in data and data["property_manager_id"] == "":
        unit.property_manager_id = None
    if "postal_code" in data and data["postal_code"] == "":
        unit.postal_code = None
    session.add(unit)
    create_audit_log(
        session, str(current_user.id), "update", "unit", str(unit_id),
        old_values=old_snapshot, new_values=model_snapshot(unit),
    )
    session.commit()
    session.refresh(unit)
    property_title = None
    if getattr(unit, "property_id", None):
        prop = session.get(Property, unit.property_id)
        if prop:
            property_title = getattr(prop, "title", None)
    return _unit_to_dict(unit, property_title)


@router.delete("/units/{unit_id}")
@limiter.limit("10/minute")
def admin_delete_unit(
    request: Request,
    unit_id: str,
    org_id: str = Depends(get_current_organization),
    current_user: User = Depends(require_roles("admin", "manager")),
    session=Depends(get_db_session),
):
    """Delete a unit (caller must ensure no dependent listings/rooms)."""
    unit = session.get(Unit, unit_id)
    if not unit or str(getattr(unit, "organization_id", "")) != org_id:
        raise HTTPException(status_code=404, detail="Unit not found")
    room_count = session.execute(
        select(func.count()).select_from(Room).where(Room.unit_id == unit_id)
    ).scalar() or 0
    tenancy_count = session.execute(
        select(func.count()).select_from(Tenancy).where(Tenancy.unit_id == unit_id)
    ).scalar() or 0
    if room_count > 0 or tenancy_count > 0:
        raise HTTPException(
            status_code=400,
            detail=_unit_delete_blocked_detail(room_count, tenancy_count),
        )
    old_snapshot = model_snapshot(unit)
    try:
        session.delete(unit)
        create_audit_log(
            session, str(current_user.id), "delete", "unit", str(unit_id),
            old_values=old_snapshot, new_values=None,
        )
        session.commit()
    except IntegrityError:
        session.rollback()
        raise HTTPException(status_code=400, detail=_UNIT_DELETE_BLOCKED_FALLBACK) from None
    return {"status": "ok", "message": "Unit deleted"}


@router.get("/units/{unit_id}/rooms", response_model=List[dict])
def admin_list_rooms_for_unit(
    unit_id: str,
    org_id: str = Depends(get_current_organization),
    _=Depends(require_roles("admin", "manager")),
    session=Depends(get_db_session),
):
    """List rooms belonging to the given unit (listings dropdown + admin)."""
    unit = session.get(Unit, unit_id)
    if not unit or str(getattr(unit, "organization_id", "")) != org_id:
        raise HTTPException(status_code=404, detail="Unit not found")
    rooms = list(
        session.exec(
            select(Room).where(Room.unit_id == unit_id).order_by(Room.name)
        ).all()
    )
    return [_room_to_dict(r) for r in rooms]
