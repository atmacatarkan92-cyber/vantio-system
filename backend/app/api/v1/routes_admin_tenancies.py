"""
Admin tenancies: CRUD + list by room.
Protected by require_roles("admin", "manager").
Validates tenant/room/unit exist, room belongs to unit, no overlapping tenancies.
"""

from datetime import date, datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy import func
from sqlmodel import select

from auth.dependencies import get_current_organization, get_db_session, require_roles
from db.models import Tenancy, TenancyRevenue, TenancyStatus, Tenant, Room, Unit, User
from db.audit import create_audit_log, model_snapshot
from app.core.rate_limit import limiter
from app.services.tenant_crm import record_tenant_event
from app.services.tenancy_lifecycle import (
    scheduling_end_date_from_parts,
    sync_tenancy_move_out_date,
    tenancy_derived_display_status,
    tenancy_display_end_date,
    tenancy_scheduling_end_date,
)


router = APIRouter(prefix="/api/admin", tags=["admin-tenancies"])

ALLOWED_TENANT_DEPOSIT_TYPES = frozenset({"bank", "insurance", "cash", "none"})
ALLOWED_TENANT_DEPOSIT_PROVIDERS = frozenset(
    {"swisscaution", "smartcaution", "firstcaution", "gocaution", "other"}
)
ALLOWED_TENANCY_REVENUE_FREQUENCIES = frozenset({"monthly", "yearly", "one_time"})
ALLOWED_TERMINATED_BY = frozenset({"tenant", "landlord", "other"})


def _tenancy_to_dict(t: Tenancy) -> dict:
    de = tenancy_display_end_date(t)
    return {
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
        # Optional: computed by list endpoints to support tenancy-driven revenue UI/KPIs.
        "monthly_revenue_equivalent": getattr(t, "_monthly_revenue_equivalent", None),
        "deposit_amount": float(t.deposit_amount) if t.deposit_amount is not None else None,
        "tenant_deposit_type": getattr(t, "tenant_deposit_type", None),
        "tenant_deposit_amount": (
            float(getattr(t, "tenant_deposit_amount"))
            if getattr(t, "tenant_deposit_amount", None) is not None
            else None
        ),
        "tenant_deposit_annual_premium": (
            float(getattr(t, "tenant_deposit_annual_premium"))
            if getattr(t, "tenant_deposit_annual_premium", None) is not None
            else None
        ),
        "tenant_deposit_provider": getattr(t, "tenant_deposit_provider", None),
        "status": t.status.value if hasattr(t.status, "value") else str(t.status),
        "created_at": t.created_at.isoformat() if getattr(t, "created_at", None) else None,
    }


def _tenancy_revenue_to_dict(r: TenancyRevenue) -> dict:
    return {
        "id": str(r.id),
        "tenancy_id": str(r.tenancy_id),
        "type": r.type,
        "amount_chf": float(r.amount_chf or 0),
        "frequency": (getattr(r, "frequency", None) or "monthly"),
        "start_date": r.start_date.isoformat() if getattr(r, "start_date", None) else None,
        "end_date": r.end_date.isoformat() if getattr(r, "end_date", None) else None,
        "notes": getattr(r, "notes", None),
        "created_at": r.created_at.isoformat() if getattr(r, "created_at", None) else None,
        "updated_at": r.updated_at.isoformat() if getattr(r, "updated_at", None) else None,
    }


def _monthly_equivalent_amount(freq: str, amount_chf: float) -> float:
    f = str(freq or "monthly").strip().lower()
    if f == "monthly":
        return amount_chf
    if f == "yearly":
        return amount_chf / 12.0
    return 0.0


def _overlap_days(a_start: date, a_end: date, b_start: date, b_end: date) -> int:
    start = max(a_start, b_start)
    end = min(a_end, b_end)
    if end < start:
        return 0
    return (end - start).days + 1


def _monthly_revenue_equivalent_for_tenancy_on_date(
    tenancy: Tenancy, revenue_rows: list[TenancyRevenue], on_date: date
) -> float:
    """
    Simple monthly-equivalent (not prorated): sum revenue rows active on on_date.
    Used for UI display; profit/KPI uses revenue_forecast for proration by month overlap.
    """
    if tenancy is None:
        return 0.0
    if tenancy.status not in (TenancyStatus.active, TenancyStatus.reserved):
        return 0.0
    if tenancy.move_in_date and on_date < tenancy.move_in_date:
        return 0.0
    sched_end = tenancy_scheduling_end_date(tenancy)
    if sched_end and on_date > sched_end:
        return 0.0
    total = 0.0
    for r in revenue_rows or []:
        f = str(getattr(r, "frequency", None) or "monthly").strip().lower()
        if f == "one_time":
            continue
        sd = getattr(r, "start_date", None) or tenancy.move_in_date
        ed = getattr(r, "end_date", None) or sched_end or date(9999, 12, 31)
        if on_date < sd or on_date > ed:
            continue
        total += _monthly_equivalent_amount(f, float(getattr(r, "amount_chf", 0) or 0))
    return round(total, 2)


def _batch_attach_monthly_revenue_equivalent(session, tenancies: list[Tenancy]) -> None:
    """
    Batch-load TenancyRevenue for the given tenancies and set t._monthly_revenue_equivalent
    using _monthly_revenue_equivalent_for_tenancy_on_date (same semantics as room tenancy list).
    """
    if not tenancies:
        return
    ids = [str(t.id) for t in tenancies]
    rev_rows: list[TenancyRevenue] = (
        list(session.exec(select(TenancyRevenue).where(TenancyRevenue.tenancy_id.in_(ids))).all())
        if ids
        else []
    )
    by_tid: dict[str, list[TenancyRevenue]] = {}
    for r in rev_rows:
        by_tid.setdefault(str(r.tenancy_id), []).append(r)
    today = date.today()
    for t in tenancies:
        rows = by_tid.get(str(t.id), [])
        t._monthly_revenue_equivalent = _monthly_revenue_equivalent_for_tenancy_on_date(
            t, rows, today
        )


class TenancyRevenueCreateBody(BaseModel):
    type: str
    amount_chf: float
    frequency: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    notes: Optional[str] = None

    @field_validator("type", mode="before")
    @classmethod
    def _normalize_type(cls, v):
        if v is None:
            raise ValueError("type is required")
        s = str(v).strip()
        if not s:
            raise ValueError("type must not be empty")
        return s

    @field_validator("frequency", mode="before")
    @classmethod
    def _normalize_frequency(cls, v):
        if v is None or v == "":
            return None
        s = str(v).strip().lower()
        if s not in ALLOWED_TENANCY_REVENUE_FREQUENCIES:
            raise ValueError("frequency must be one of: monthly, yearly, one_time")
        return s

    @field_validator("amount_chf")
    @classmethod
    def _amount_non_zero(cls, v):
        if v is None:
            raise ValueError("amount_chf is required")
        n = float(v)
        if n == 0:
            raise ValueError("amount_chf must not be 0")
        return n

    @model_validator(mode="after")
    def _validate_dates(self):
        if self.start_date is not None and self.end_date is not None:
            if self.end_date < self.start_date:
                raise ValueError("end_date must be on/after start_date")
        return self


class TenancyRevenuePatchBody(BaseModel):
    type: Optional[str] = None
    amount_chf: Optional[float] = None
    frequency: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    notes: Optional[str] = None

    @model_validator(mode="after")
    def _at_least_one_field(self) -> "TenancyRevenuePatchBody":
        if (
            self.type is None
            and self.amount_chf is None
            and self.frequency is None
            and self.start_date is None
            and self.end_date is None
            and self.notes is None
        ):
            raise ValueError("At least one field is required")
        return self

    @field_validator("type", mode="before")
    @classmethod
    def _normalize_type_patch(cls, v):
        if v is None:
            return None
        s = str(v).strip()
        if not s:
            raise ValueError("type must not be empty")
        return s

    @field_validator("frequency", mode="before")
    @classmethod
    def _normalize_frequency_patch(cls, v):
        if v is None:
            return None
        s = str(v).strip().lower()
        if not s:
            return None
        if s not in ALLOWED_TENANCY_REVENUE_FREQUENCIES:
            raise ValueError("frequency must be one of: monthly, yearly, one_time")
        return s

    @field_validator("amount_chf")
    @classmethod
    def _amount_non_zero_if_set(cls, v):
        if v is None:
            return None
        n = float(v)
        if n == 0:
            raise ValueError("amount_chf must not be 0")
        return n

    @model_validator(mode="after")
    def _validate_dates_patch(self):
        if self.start_date is not None and self.end_date is not None:
            if self.end_date < self.start_date:
                raise ValueError("end_date must be on/after start_date")
        return self


class TenancyCreate(BaseModel):
    tenant_id: str
    room_id: str
    unit_id: str
    move_in_date: date
    move_out_date: Optional[date] = None
    notice_given_at: Optional[date] = None
    termination_effective_date: Optional[date] = None
    actual_move_out_date: Optional[date] = None
    terminated_by: Optional[str] = None
    monthly_rent: float = Field(default=0, ge=0)
    deposit_amount: Optional[float] = Field(default=None, ge=0)
    tenant_deposit_type: Optional[str] = None
    tenant_deposit_amount: Optional[float] = Field(default=None, ge=0)
    tenant_deposit_annual_premium: Optional[float] = Field(default=None, ge=0)
    tenant_deposit_provider: Optional[str] = None
    status: TenancyStatus = TenancyStatus.active

    @field_validator("tenant_deposit_type", mode="before")
    @classmethod
    def _normalize_tenant_deposit_type_create(cls, v):
        if v is None or v == "":
            return None
        s = str(v).strip().lower()
        if s not in ALLOWED_TENANT_DEPOSIT_TYPES:
            raise ValueError(
                "tenant_deposit_type must be one of: bank, insurance, cash, none"
            )
        return s

    @field_validator("tenant_deposit_provider", mode="before")
    @classmethod
    def _normalize_tenant_deposit_provider_create(cls, v):
        if v is None or v == "":
            return None
        s = str(v).strip().lower()
        if s not in ALLOWED_TENANT_DEPOSIT_PROVIDERS:
            raise ValueError(
                "tenant_deposit_provider must be one of: "
                "swisscaution, smartcaution, firstcaution, gocaution, other"
            )
        return s

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
        if (
            self.termination_effective_date is not None
            and self.termination_effective_date < self.move_in_date
        ):
            raise ValueError("termination_effective_date must be on/after move_in_date")
        if self.actual_move_out_date is not None and self.actual_move_out_date < self.move_in_date:
            raise ValueError("actual_move_out_date must be on/after move_in_date")
        return self

    @field_validator("terminated_by", mode="before")
    @classmethod
    def _normalize_terminated_by_create(cls, v):
        if v is None or v == "":
            return None
        s = str(v).strip().lower()
        if s not in ALLOWED_TERMINATED_BY:
            raise ValueError("terminated_by must be one of: tenant, landlord, other")
        return s

    @model_validator(mode="after")
    def _clear_tenant_deposit_provider_if_not_insurance_create(self):
        t = self.tenant_deposit_type
        if t is None or str(t).lower() != "insurance":
            self.tenant_deposit_provider = None
        return self


class TenancyPatch(BaseModel):
    move_in_date: Optional[date] = None
    move_out_date: Optional[date] = None
    notice_given_at: Optional[date] = None
    termination_effective_date: Optional[date] = None
    actual_move_out_date: Optional[date] = None
    terminated_by: Optional[str] = None
    monthly_rent: Optional[float] = Field(default=None, ge=0)
    deposit_amount: Optional[float] = Field(default=None, ge=0)
    tenant_deposit_type: Optional[str] = None
    tenant_deposit_amount: Optional[float] = Field(default=None, ge=0)
    tenant_deposit_annual_premium: Optional[float] = Field(default=None, ge=0)
    tenant_deposit_provider: Optional[str] = None
    status: Optional[TenancyStatus] = None

    @field_validator("tenant_deposit_type", mode="before")
    @classmethod
    def _normalize_tenant_deposit_type_patch(cls, v):
        if v is None or v == "":
            return None
        s = str(v).strip().lower()
        if s not in ALLOWED_TENANT_DEPOSIT_TYPES:
            raise ValueError(
                "tenant_deposit_type must be one of: bank, insurance, cash, none"
            )
        return s

    @field_validator("tenant_deposit_provider", mode="before")
    @classmethod
    def _normalize_tenant_deposit_provider_patch(cls, v):
        if v is None or v == "":
            return None
        s = str(v).strip().lower()
        if s not in ALLOWED_TENANT_DEPOSIT_PROVIDERS:
            raise ValueError(
                "tenant_deposit_provider must be one of: "
                "swisscaution, smartcaution, firstcaution, gocaution, other"
            )
        return s

    @field_validator("terminated_by", mode="before")
    @classmethod
    def _normalize_terminated_by_patch(cls, v):
        if v is None or v == "":
            return None
        s = str(v).strip().lower()
        if s not in ALLOWED_TERMINATED_BY:
            raise ValueError("terminated_by must be one of: tenant, landlord, other")
        return s

    @model_validator(mode="after")
    def _validate_dates_if_both_present(self):
        if self.move_in_date is not None and self.move_out_date is not None:
            if self.move_out_date < self.move_in_date:
                raise ValueError("move_out_date must be on/after move_in_date")
        if self.move_in_date is not None and self.termination_effective_date is not None:
            if self.termination_effective_date < self.move_in_date:
                raise ValueError("termination_effective_date must be on/after move_in_date")
        if self.move_in_date is not None and self.actual_move_out_date is not None:
            if self.actual_move_out_date < self.move_in_date:
                raise ValueError("actual_move_out_date must be on/after move_in_date")
        return self

    @model_validator(mode="after")
    def _clear_tenant_deposit_provider_if_not_insurance_patch(self):
        if self.tenant_deposit_type is None:
            return self
        if str(self.tenant_deposit_type).lower() != "insurance":
            self.tenant_deposit_provider = None
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
        t_end = tenancy_scheduling_end_date(t) or date(9999, 12, 31)
        # overlap: our start < their end and our end > their start
        our_end = move_out or date(9999, 12, 31)
        if move_in < t_end and our_end > t.move_in_date:
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
    tenant_id: Optional[str] = None,
    status: Optional[str] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    org_id: str = Depends(get_current_organization),
    _=Depends(require_roles("admin", "manager")),
    session=Depends(get_db_session),
):
    """List tenancies, optionally filtered by room_id, unit_id, tenant_id, status."""
    base_query = (
        select(Tenancy)
        .where(Tenancy.organization_id == org_id)
        .order_by(Tenancy.move_in_date.desc())
    )
    if room_id:
        base_query = base_query.where(Tenancy.room_id == room_id)
    if unit_id:
        base_query = base_query.where(Tenancy.unit_id == unit_id)
    if tenant_id:
        base_query = base_query.where(Tenancy.tenant_id == tenant_id)
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
    if tenant_id:
        count_query = count_query.where(Tenancy.tenant_id == tenant_id)
    if status:
        count_query = count_query.where(Tenancy.status == status)
    _total_rows = session.exec(count_query).all()
    total = int(_total_rows[0]) if _total_rows else 0
    paged_rows = list(session.exec(base_query.offset(skip).limit(limit)).all())
    _batch_attach_monthly_revenue_equivalent(session, paged_rows)
    items = [_tenancy_to_dict(t) for t in paged_rows]
    return TenancyListResponse(items=items, total=total, skip=skip, limit=limit)


@router.get("/rooms/{room_id}/tenancies", response_model=List[dict])
def admin_list_tenancies_for_room(
    room_id: str,
    org_id: str = Depends(get_current_organization),
    _=Depends(require_roles("admin", "manager")),
    session=Depends(get_db_session),
):
    """List tenancies for a room."""
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
    _batch_attach_monthly_revenue_equivalent(session, tenancies)
    return [_tenancy_to_dict(t) for t in tenancies]


@router.post("/tenancies", response_model=dict)
@limiter.limit("10/minute")
def admin_create_tenancy(
    request: Request,
    body: TenancyCreate,
    org_id: str = Depends(get_current_organization),
    current_user: User = Depends(require_roles("admin", "manager")),
    session=Depends(get_db_session),
):
    """Create a tenancy. Validates tenant/room/unit and prevents overlapping tenancies."""
    _validate_relations(session, body.tenant_id, body.room_id, body.unit_id, org_id)
    status = body.status
    eff_move_out = scheduling_end_date_from_parts(
        body.move_out_date,
        body.termination_effective_date,
        body.actual_move_out_date,
    )
    if _overlaps(session, body.room_id, body.move_in_date, eff_move_out, org_id):
        raise HTTPException(status_code=400, detail="Another tenancy overlaps this room for the given dates")
    tenancy = Tenancy(
        organization_id=org_id,
        tenant_id=body.tenant_id,
        room_id=body.room_id,
        unit_id=body.unit_id,
        move_in_date=body.move_in_date,
        move_out_date=body.move_out_date,
        notice_given_at=body.notice_given_at,
        termination_effective_date=body.termination_effective_date,
        actual_move_out_date=body.actual_move_out_date,
        terminated_by=body.terminated_by,
        monthly_rent=body.monthly_rent,
        deposit_amount=body.deposit_amount,
        tenant_deposit_type=body.tenant_deposit_type,
        tenant_deposit_amount=body.tenant_deposit_amount,
        tenant_deposit_annual_premium=body.tenant_deposit_annual_premium,
        tenant_deposit_provider=body.tenant_deposit_provider,
        status=status,
    )
    sync_tenancy_move_out_date(tenancy)
    session.add(tenancy)
    room_row = session.get(Room, body.room_id)
    unit_row = session.get(Unit, body.unit_id)
    room_nm = (getattr(room_row, "name", None) or "").strip() or str(body.room_id)
    unit_nm = (getattr(unit_row, "title", None) or "").strip() or str(body.unit_id)
    summary = (
        f"Mietverhältnis zugewiesen: {unit_nm} · {room_nm} · "
        f"{body.move_in_date.isoformat()} · {body.monthly_rent:g} CHF/Monat"
    )
    record_tenant_event(
        session,
        tenant_id=str(body.tenant_id),
        organization_id=org_id,
        action_type="tenancy_assigned",
        created_by_user_id=str(current_user.id),
        summary=summary,
    )
    create_audit_log(
        session, str(current_user.id), "create", "tenancy", str(tenancy.id),
        old_values=None, new_values=model_snapshot(tenancy),
    )
    session.commit()
    session.refresh(tenancy)
    return _tenancy_to_dict(tenancy)


@router.patch("/tenancies/{tenancy_id}", response_model=dict)
@limiter.limit("10/minute")
def admin_patch_tenancy(
    request: Request,
    tenancy_id: str,
    body: TenancyPatch,
    org_id: str = Depends(get_current_organization),
    current_user: User = Depends(require_roles("admin", "manager")),
    session=Depends(get_db_session),
):
    """Update a tenancy (partial). Checks overlap when dates change."""
    tenancy = session.get(Tenancy, tenancy_id)
    if not tenancy or str(getattr(tenancy, "organization_id", "")) != org_id:
        raise HTTPException(status_code=404, detail="Tenancy not found")
    old_snapshot = model_snapshot(tenancy)
    data = body.model_dump(exclude_unset=True)
    if data:
        merged = tenancy.model_dump()
        merged.update(data)
        try:
            t_prop = Tenancy.model_validate(merged)
        except Exception as e:
            raise HTTPException(status_code=400, detail=str(e)) from e
        sync_tenancy_move_out_date(t_prop)
        if t_prop.move_out_date is not None and t_prop.move_out_date < t_prop.move_in_date:
            raise HTTPException(status_code=400, detail="move_out_date must be on/after move_in_date")
        if _overlaps(
            session,
            t_prop.room_id,
            t_prop.move_in_date,
            t_prop.move_out_date,
            org_id,
            exclude_tenancy_id=tenancy_id,
        ):
            raise HTTPException(status_code=400, detail="Another tenancy overlaps this room for the given dates")
        for k, v in data.items():
            if hasattr(tenancy, k):
                setattr(tenancy, k, v)
        sync_tenancy_move_out_date(tenancy)
    session.add(tenancy)
    new_snapshot = model_snapshot(tenancy)

    def _de_date_display(val) -> str:
        if val is None or val == "":
            return "—"
        s = str(val)[:10]
        if len(s) == 10 and s[4] == "-" and s[7] == "-":
            y, m, d = s.split("-")
            return f"{d}.{m}.{y}"
        return str(val)

    def _status_de(val) -> str:
        if val is None or val == "":
            return "—"
        key = str(val).lower()
        return {"active": "Aktiv", "reserved": "Reserviert", "ended": "Beendet"}.get(key, str(val))

    if data:
        parts: List[str] = []
        if "move_in_date" in data:
            parts.append(
                f"Einzug {_de_date_display(old_snapshot.get('move_in_date'))} → "
                f"{_de_date_display(new_snapshot.get('move_in_date'))}"
            )
        if "move_out_date" in data:
            parts.append(
                f"Auszug {_de_date_display(old_snapshot.get('move_out_date'))} → "
                f"{_de_date_display(new_snapshot.get('move_out_date'))}"
            )
        if "status" in data:
            parts.append(
                f"Status {_status_de(old_snapshot.get('status'))} → {_status_de(new_snapshot.get('status'))}"
            )
        if "monthly_rent" in data:
            parts.append(
                f"Miete {old_snapshot.get('monthly_rent')} → {new_snapshot.get('monthly_rent')} CHF/Monat"
            )
        if "deposit_amount" in data:
            parts.append(
                f"Kaution {old_snapshot.get('deposit_amount')} → {new_snapshot.get('deposit_amount')} CHF"
            )
        summary = (
            "Mietverhältnis aktualisiert: " + ", ".join(parts)
            if parts
            else "Mietverhältnis aktualisiert"
        )
        record_tenant_event(
            session,
            tenant_id=str(tenancy.tenant_id),
            organization_id=org_id,
            action_type="tenancy_updated",
            created_by_user_id=str(current_user.id),
            summary=summary,
        )

    create_audit_log(
        session, str(current_user.id), "update", "tenancy", str(tenancy_id),
        old_values=old_snapshot, new_values=new_snapshot,
    )
    session.commit()
    session.refresh(tenancy)
    return _tenancy_to_dict(tenancy)


@router.delete("/tenancies/{tenancy_id}")
@limiter.limit("10/minute")
def admin_delete_tenancy(
    request: Request,
    tenancy_id: str,
    org_id: str = Depends(get_current_organization),
    current_user: User = Depends(require_roles("admin", "manager")),
    session=Depends(get_db_session),
):
    """Delete a tenancy."""
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


@router.get("/tenancies/{tenancy_id}/revenue", response_model=List[dict])
def admin_list_tenancy_revenue(
    tenancy_id: str,
    org_id: str = Depends(get_current_organization),
    _=Depends(require_roles("admin", "manager")),
    session=Depends(get_db_session),
):
    tenancy = session.get(Tenancy, tenancy_id)
    if not tenancy or str(getattr(tenancy, "organization_id", "")) != org_id:
        raise HTTPException(status_code=404, detail="Tenancy not found")
    rows = list(
        session.exec(
            select(TenancyRevenue)
            .where(TenancyRevenue.tenancy_id == tenancy_id)
            .where(TenancyRevenue.organization_id == org_id)
            .order_by(TenancyRevenue.created_at)
        ).all()
    )
    return [_tenancy_revenue_to_dict(r) for r in rows]


@router.post("/tenancies/{tenancy_id}/revenue", response_model=dict)
@limiter.limit("30/minute")
def admin_create_tenancy_revenue(
    request: Request,
    tenancy_id: str,
    body: TenancyRevenueCreateBody,
    org_id: str = Depends(get_current_organization),
    current_user: User = Depends(require_roles("admin", "manager")),
    session=Depends(get_db_session),
):
    tenancy = session.get(Tenancy, tenancy_id)
    if not tenancy or str(getattr(tenancy, "organization_id", "")) != org_id:
        raise HTTPException(status_code=404, detail="Tenancy not found")
    row = TenancyRevenue(
        organization_id=org_id,
        tenancy_id=tenancy_id,
        type=body.type,
        amount_chf=float(body.amount_chf),
        frequency=(body.frequency or "monthly"),
        start_date=body.start_date,
        end_date=body.end_date,
        notes=(body.notes.strip() if isinstance(body.notes, str) and body.notes.strip() else None),
        created_at=datetime.utcnow(),
        updated_at=None,
    )
    session.add(row)
    create_audit_log(
        session,
        str(current_user.id),
        "update",
        "tenancy",
        str(tenancy_id),
        old_values=None,
        new_values={"tenancy_revenue_create": model_snapshot(row)},
    )
    record_tenant_event(
        session,
        tenant_id=str(tenancy.tenant_id),
        organization_id=org_id,
        action_type="tenancy_revenue_created",
        created_by_user_id=str(current_user.id),
        summary=f"Einnahme hinzugefügt: {row.type} · {row.amount_chf:g} CHF · {(row.frequency or 'monthly')}",
    )
    session.commit()
    session.refresh(row)
    return _tenancy_revenue_to_dict(row)


@router.patch("/tenancy-revenue/{revenue_id}", response_model=dict)
@limiter.limit("30/minute")
def admin_patch_tenancy_revenue(
    request: Request,
    revenue_id: str,
    body: TenancyRevenuePatchBody,
    org_id: str = Depends(get_current_organization),
    current_user: User = Depends(require_roles("admin", "manager")),
    session=Depends(get_db_session),
):
    row = session.get(TenancyRevenue, revenue_id)
    if not row or str(getattr(row, "organization_id", "")) != org_id:
        raise HTTPException(status_code=404, detail="Revenue row not found")
    tenancy = session.get(Tenancy, str(row.tenancy_id))
    if not tenancy or str(getattr(tenancy, "organization_id", "")) != org_id:
        raise HTTPException(status_code=404, detail="Tenancy not found")
    old_snapshot = model_snapshot(row)
    data = body.model_dump(exclude_unset=True)
    if "type" in data:
        row.type = data["type"]
    if "amount_chf" in data:
        row.amount_chf = float(data["amount_chf"])
    if "frequency" in data:
        row.frequency = data["frequency"] or "monthly"
    if "start_date" in data:
        row.start_date = data["start_date"]
    if "end_date" in data:
        row.end_date = data["end_date"]
    if "notes" in data:
        n = data["notes"]
        row.notes = n.strip() if isinstance(n, str) and n.strip() else None
    if row.start_date is not None and row.end_date is not None and row.end_date < row.start_date:
        raise HTTPException(status_code=400, detail="end_date must be on/after start_date")
    row.updated_at = datetime.utcnow()
    session.add(row)
    new_snapshot = model_snapshot(row)
    create_audit_log(
        session,
        str(current_user.id),
        "update",
        "tenancy",
        str(tenancy.id),
        old_values={"tenancy_revenue_update": old_snapshot},
        new_values={"tenancy_revenue_update": new_snapshot},
    )
    record_tenant_event(
        session,
        tenant_id=str(tenancy.tenant_id),
        organization_id=org_id,
        action_type="tenancy_revenue_updated",
        created_by_user_id=str(current_user.id),
        summary=f"Einnahme aktualisiert: {row.type} · {row.amount_chf:g} CHF · {(row.frequency or 'monthly')}",
    )
    session.commit()
    session.refresh(row)
    return _tenancy_revenue_to_dict(row)


@router.delete("/tenancy-revenue/{revenue_id}")
@limiter.limit("30/minute")
def admin_delete_tenancy_revenue(
    request: Request,
    revenue_id: str,
    org_id: str = Depends(get_current_organization),
    current_user: User = Depends(require_roles("admin", "manager")),
    session=Depends(get_db_session),
):
    row = session.get(TenancyRevenue, revenue_id)
    if not row or str(getattr(row, "organization_id", "")) != org_id:
        raise HTTPException(status_code=404, detail="Revenue row not found")
    tenancy = session.get(Tenancy, str(row.tenancy_id))
    if not tenancy or str(getattr(tenancy, "organization_id", "")) != org_id:
        raise HTTPException(status_code=404, detail="Tenancy not found")
    old_snapshot = model_snapshot(row)
    session.delete(row)
    create_audit_log(
        session,
        str(current_user.id),
        "update",
        "tenancy",
        str(tenancy.id),
        old_values={"tenancy_revenue_delete": old_snapshot},
        new_values=None,
    )
    record_tenant_event(
        session,
        tenant_id=str(tenancy.tenant_id),
        organization_id=org_id,
        action_type="tenancy_revenue_deleted",
        created_by_user_id=str(current_user.id),
        summary=f"Einnahme entfernt: {old_snapshot.get('type')} · {old_snapshot.get('amount_chf')} CHF",
    )
    session.commit()
    return {"status": "ok"}
