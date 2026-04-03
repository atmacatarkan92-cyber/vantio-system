"""
Admin tenants: CRUD.
Protected by require_roles("admin", "manager").
"""

from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, EmailStr, TypeAdapter, field_validator, model_validator

from auth.dependencies import get_current_organization, get_db_session, require_roles
from db.models import User
from app.core.rate_limit import limiter
from app.services import tenant_admin_service as tas

router = APIRouter(prefix="/api/admin", tags=["admin-tenants"])

# Backward compatibility if other code imported helpers from this module
_tenant_to_dict = tas.tenant_to_dict
ALLOWED_RESIDENCE_PERMITS = tas.ALLOWED_RESIDENCE_PERMITS

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
    is_swiss: Optional[bool] = None
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

    @field_validator("phone", "company", "street", "postal_code", "city", "country", "nationality", mode="before")
    @classmethod
    def _optional_trim_or_none(cls, v):
        return tas.trim_opt_str(v) if v is not None else None

    @field_validator("residence_permit", mode="before")
    @classmethod
    def _residence_permit_trim_create(cls, v):
        return tas.trim_opt_str(v) if v is not None else None

    @field_validator("residence_permit")
    @classmethod
    def _residence_permit_allowed_create(cls, v: Optional[str]) -> Optional[str]:
        return tas.validate_residence_permit_value(v)

    @field_validator("birth_date", mode="before")
    @classmethod
    def _birth_empty(cls, v):
        if v is None or v == "":
            return None
        return v

    @field_validator("room_id", mode="before")
    @classmethod
    def _room_id_trim_or_none(cls, v):
        return tas.trim_opt_str(v) if v is not None else None

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

    @field_validator("phone", "company", "street", "postal_code", "city", "country", "nationality", mode="before")
    @classmethod
    def _optional_trim_or_none_patch(cls, v):
        if v is None:
            return None
        if isinstance(v, str) and not v.strip():
            return None
        return str(v).strip()

    @field_validator("residence_permit", mode="before")
    @classmethod
    def _residence_permit_trim_patch(cls, v):
        if v is None:
            return None
        if isinstance(v, str) and not v.strip():
            return None
        return str(v).strip()

    @field_validator("residence_permit")
    @classmethod
    def _residence_permit_allowed_patch(cls, v: Optional[str]) -> Optional[str]:
        return tas.validate_residence_permit_value(v)

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


class TenantNoteCreate(BaseModel):
    content: str

    @field_validator("content")
    @classmethod
    def _trim_nonempty(cls, v: str) -> str:
        s = (v or "").strip()
        if not s:
            raise ValueError("Notiz darf nicht leer sein.")
        return s


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
    data = tas.list_tenants(session, org_id, skip=skip, limit=limit, q=q)
    return TenantListResponse(**data)


@router.get("/tenants/{tenant_id}", response_model=dict)
def admin_get_tenant(
    tenant_id: str,
    org_id: str = Depends(get_current_organization),
    _=Depends(require_roles("admin", "manager")),
    session=Depends(get_db_session),
):
    """Return a single tenant if it belongs to the current organization."""
    return tas.get_tenant(session, org_id, tenant_id)


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
    return tas.create_tenant(session, org_id, str(current_user.id), body)


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
    return tas.patch_tenant(session, org_id, str(current_user.id), tenant_id, body)


@router.get("/tenants/{tenant_id}/notes", response_model=dict)
def admin_list_tenant_notes(
    tenant_id: str,
    org_id: str = Depends(get_current_organization),
    _=Depends(require_roles("admin", "manager")),
    session=Depends(get_db_session),
):
    return tas.list_tenant_notes(session, org_id, tenant_id)


@router.post("/tenants/{tenant_id}/notes", response_model=dict)
@limiter.limit("30/minute")
def admin_create_tenant_note(
    request: Request,
    tenant_id: str,
    body: TenantNoteCreate,
    org_id: str = Depends(get_current_organization),
    current_user: User = Depends(require_roles("admin", "manager")),
    session=Depends(get_db_session),
):
    return tas.create_tenant_note(session, org_id, str(current_user.id), tenant_id, body)


@router.get("/tenants/{tenant_id}/events", response_model=dict)
def admin_list_tenant_events(
    tenant_id: str,
    org_id: str = Depends(get_current_organization),
    _=Depends(require_roles("admin", "manager")),
    session=Depends(get_db_session),
):
    return tas.list_tenant_events(session, org_id, tenant_id)


@router.delete("/tenants/{tenant_id}")
@limiter.limit("10/minute")
def admin_delete_tenant(
    request: Request,
    tenant_id: str,
    org_id: str = Depends(get_current_organization),
    current_user: User = Depends(require_roles("admin", "manager")),
    session=Depends(get_db_session),
):
    """Delete a tenant when no blocking tenancy / FK dependencies."""
    return tas.delete_tenant(session, org_id, str(current_user.id), tenant_id)
