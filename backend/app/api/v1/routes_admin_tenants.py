"""
Admin tenants: CRUD.
Protected by require_roles("admin", "manager").
"""

from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, EmailStr, TypeAdapter, field_validator, model_validator
from sqlalchemy import func, or_
from sqlmodel import select

from auth.dependencies import get_current_organization, get_db_session, require_roles
from db.models import Tenant, User, Room, Unit
from db.audit import create_audit_log, model_snapshot
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


def _display_name_from_tenant(t: Tenant) -> str:
    fn = (getattr(t, "first_name", None) or "").strip()
    ln = (getattr(t, "last_name", None) or "").strip()
    if fn or ln:
        return f"{fn} {ln}".strip()
    return (getattr(t, "name", None) or "").strip() or ""


def _refresh_legacy_name_field(tenant: Tenant) -> None:
    fn = (getattr(tenant, "first_name", None) or "").strip()
    ln = (getattr(tenant, "last_name", None) or "").strip()
    if fn or ln:
        tenant.name = f"{fn} {ln}".strip()


def _tenant_to_dict(t: Tenant) -> dict:
    legacy = getattr(t, "name", "") or ""
    display = _display_name_from_tenant(t)
    return {
        "id": str(t.id),
        "name": legacy,
        "full_name": display,
        "display_name": display,
        "first_name": getattr(t, "first_name", None),
        "last_name": getattr(t, "last_name", None),
        "birth_date": t.birth_date.isoformat() if getattr(t, "birth_date", None) else None,
        "street": getattr(t, "street", None),
        "postal_code": getattr(t, "postal_code", None),
        "city": getattr(t, "city", None),
        "country": getattr(t, "country", None),
        "nationality": getattr(t, "nationality", None),
        "is_swiss": getattr(t, "is_swiss", None),
        "residence_permit": getattr(t, "residence_permit", None),
        "email": getattr(t, "email", "") or "",
        "phone": getattr(t, "phone", None),
        "company": getattr(t, "company", None),
        "room_id": getattr(t, "room_id", None),
        "created_at": t.created_at.isoformat() if getattr(t, "created_at", None) else None,
    }


def _trim_opt_str(v: Optional[str]) -> Optional[str]:
    if v is None or (isinstance(v, str) and not v.strip()):
        return None
    return str(v).strip()


_email_str_adapter = TypeAdapter(EmailStr)


class TenantCreate(BaseModel):
    """Create tenant: first_name + last_name required (legacy single `name` supported)."""

    first_name: Optional[str] = None
    last_name: Optional[str] = None
    name: Optional[str] = None
    full_name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    company: Optional[str] = None
    room_id: Optional[str] = None
    birth_date: Optional[date] = None
    street: Optional[str] = None
    postal_code: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = None
    nationality: Optional[str] = None
    is_swiss: bool = False
    residence_permit: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def _legacy_single_name_to_parts(cls, data):
        if not isinstance(data, dict):
            return data
        if data.get("first_name") is None and data.get("last_name") is None:
            raw = (data.get("name") or data.get("full_name") or "").strip()
            if raw:
                parts = raw.split(None, 1)
                data["first_name"] = parts[0]
                data["last_name"] = parts[1] if len(parts) > 1 else parts[0]
        return data

    @field_validator("first_name", "last_name")
    @classmethod
    def _first_last_required(cls, v: Optional[str]) -> str:
        s = (v or "").strip()
        if not s:
            raise ValueError("Vorname und Nachname sind erforderlich.")
        return s

    @field_validator("email", mode="before")
    @classmethod
    def _email_empty_to_none(cls, v):
        if v is None or (isinstance(v, str) and not v.strip()):
            return None
        return str(v).strip()

    @field_validator("phone", "company", "street", "postal_code", "city", "country", "nationality", "residence_permit", mode="before")
    @classmethod
    def _optional_trim_or_none(cls, v):
        return _trim_opt_str(v) if v is not None else None

    @field_validator("birth_date", mode="before")
    @classmethod
    def _birth_empty(cls, v):
        if v is None or v == "":
            return None
        return v

    @field_validator("room_id", mode="before")
    @classmethod
    def _room_id_trim_or_none(cls, v):
        return _trim_opt_str(v) if v is not None else None

    @model_validator(mode="after")
    def _clear_permit_if_swiss(self):
        if self.is_swiss is True:
            object.__setattr__(self, "residence_permit", None)
        return self


class TenantPatch(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    name: Optional[str] = None
    full_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    company: Optional[str] = None
    room_id: Optional[str] = None
    birth_date: Optional[date] = None
    street: Optional[str] = None
    postal_code: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = None
    nationality: Optional[str] = None
    is_swiss: Optional[bool] = None
    residence_permit: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def _merge_full_name_into_name(cls, data):
        if isinstance(data, dict):
            if data.get("name") is None and data.get("full_name") is not None:
                data["name"] = data["full_name"]
        return data

    @field_validator("first_name", "last_name")
    @classmethod
    def _first_last_not_empty_if_set(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        s = str(v).strip()
        if not s:
            raise ValueError("Vor- bzw. Nachname darf nicht leer sein.")
        return s

    @field_validator("name")
    @classmethod
    def _name_not_empty_if_set(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        s = str(v).strip()
        if not s:
            raise ValueError("Name darf nicht leer sein.")
        return s

    @field_validator("email", mode="before")
    @classmethod
    def _email_strip(cls, v):
        if v is None:
            return None
        if isinstance(v, str) and not v.strip():
            return ""
        return str(v).strip()

    @field_validator("email")
    @classmethod
    def _email_format_if_non_empty(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        if v == "":
            return ""
        return str(_email_str_adapter.validate_python(v))

    @field_validator("phone", "company", "street", "postal_code", "city", "country", "nationality", "residence_permit", mode="before")
    @classmethod
    def _optional_trim_or_none_patch(cls, v):
        if v is None:
            return None
        if isinstance(v, str) and not v.strip():
            return None
        return str(v).strip()

    @field_validator("birth_date", mode="before")
    @classmethod
    def _birth_empty_patch(cls, v):
        if v is None or v == "":
            return None
        return v

    @field_validator("room_id", mode="before")
    @classmethod
    def _room_id_trim_or_none_patch(cls, v):
        if v is None:
            return None
        if isinstance(v, str) and not v.strip():
            return None
        return str(v).strip()

    @model_validator(mode="after")
    def _clear_permit_if_swiss_patch(self):
        if self.is_swiss is True:
            object.__setattr__(self, "residence_permit", None)
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
    q: Optional[str] = Query(None, max_length=200, description="Search name, email, phone"),
    org_id: str = Depends(get_current_organization),
    _=Depends(require_roles("admin", "manager")),
    session=Depends(get_db_session),
):
    """List tenants for the current organization, optionally filtered by search."""
    org_filter = Tenant.organization_id == org_id
    search_filter = None
    if q and q.strip():
        term = f"%{q.strip()}%"
        search_filter = or_(
            Tenant.name.ilike(term),
            Tenant.first_name.ilike(term),
            Tenant.last_name.ilike(term),
            Tenant.email.ilike(term),
            Tenant.phone.ilike(term),
            Tenant.city.ilike(term),
            Tenant.postal_code.ilike(term),
        )

    base_query = select(Tenant).where(org_filter)
    count_query = select(func.count()).select_from(Tenant).where(org_filter)
    if search_filter is not None:
        base_query = base_query.where(search_filter)
        count_query = count_query.where(search_filter)

    base_query = base_query.order_by(Tenant.name)
    _total_rows = session.exec(count_query).all()
    total = int(_total_rows[0]) if _total_rows else 0
    paged_rows = session.exec(base_query.offset(skip).limit(limit)).all()
    items = [_tenant_to_dict(t) for t in paged_rows]
    return TenantListResponse(items=items, total=total, skip=skip, limit=limit)


@router.get("/tenants/{tenant_id}", response_model=dict)
def admin_get_tenant(
    tenant_id: str,
    org_id: str = Depends(get_current_organization),
    _=Depends(require_roles("admin", "manager")),
    session=Depends(get_db_session),
):
    """Return a single tenant if it belongs to the current organization."""
    tenant = session.get(Tenant, tenant_id)
    if not tenant or str(getattr(tenant, "organization_id", "")) != org_id:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return _tenant_to_dict(tenant)


@router.post("/tenants", response_model=dict)
@limiter.limit("10/minute")
def admin_create_tenant(
    request: Request,
    body: TenantCreate,
    org_id: str = Depends(get_current_organization),
    current_user: User = Depends(require_roles("admin", "manager")),
    session=Depends(get_db_session),
):
    """Create a new tenant."""
    _assert_room_in_org(session, body.room_id, org_id)
    residence = None if body.is_swiss else body.residence_permit
    tenant = Tenant(
        organization_id=org_id,
        name=f"{body.first_name} {body.last_name}".strip(),
        first_name=body.first_name,
        last_name=body.last_name,
        birth_date=body.birth_date,
        street=body.street,
        postal_code=body.postal_code,
        city=body.city,
        country=body.country,
        nationality=body.nationality,
        is_swiss=body.is_swiss,
        residence_permit=residence,
        email="" if body.email is None else str(body.email),
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


@router.patch("/tenants/{tenant_id}", response_model=dict)
@limiter.limit("10/minute")
def admin_patch_tenant(
    request: Request,
    tenant_id: str,
    body: TenantPatch,
    org_id: str = Depends(get_current_organization),
    current_user: User = Depends(require_roles("admin", "manager")),
    session=Depends(get_db_session),
):
    """Update a tenant (partial)."""
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
            if k == "email" and v is None:
                setattr(tenant, "email", "")
            else:
                setattr(tenant, k, v)
    if any(k in data for k in ("first_name", "last_name")):
        _refresh_legacy_name_field(tenant)
    if getattr(tenant, "is_swiss", None) is True:
        tenant.residence_permit = None
    session.add(tenant)
    create_audit_log(
        session, str(current_user.id), "update", "tenant", str(tenant_id),
        old_values=old_snapshot, new_values=model_snapshot(tenant),
    )
    session.commit()
    session.refresh(tenant)
    return _tenant_to_dict(tenant)


@router.delete("/tenants/{tenant_id}")
@limiter.limit("10/minute")
def admin_delete_tenant(
    request: Request,
    tenant_id: str,
    org_id: str = Depends(get_current_organization),
    current_user: User = Depends(require_roles("admin", "manager")),
    session=Depends(get_db_session),
):
    """Delete a tenant."""
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
