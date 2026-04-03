"""
Admin landlords API: list, get, create, update (Phase D table).
Protected by require_roles("admin", "manager").
"""

from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, EmailStr, field_validator

from auth.dependencies import get_current_organization, get_db_session, require_roles
from db.models import User
from app.core.rate_limit import limiter
from app.services import landlord_admin_service as las

router = APIRouter(prefix="/api/admin", tags=["admin-landlords"])

# Backward compatibility if other code imported helpers from this module
_landlord_to_dict = las.landlord_to_dict


class LandlordCreate(BaseModel):
    user_id: Optional[str] = None
    company_name: Optional[str] = None
    contact_name: str = ""
    email: EmailStr
    phone: Optional[str] = None
    address_line1: Optional[str] = None
    postal_code: Optional[str] = None
    city: Optional[str] = None
    canton: Optional[str] = None
    website: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = "active"


class LandlordUpdate(BaseModel):
    user_id: Optional[str] = None
    company_name: Optional[str] = None
    contact_name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    address_line1: Optional[str] = None
    postal_code: Optional[str] = None
    city: Optional[str] = None
    canton: Optional[str] = None
    website: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = None


class LandlordNoteCreate(BaseModel):
    content: str

    @field_validator("content")
    @classmethod
    def _trim_nonempty(cls, v: str) -> str:
        s = (v or "").strip()
        if not s:
            raise ValueError("Notiz darf nicht leer sein.")
        return s


class LandlordNoteUpdate(BaseModel):
    content: str

    @field_validator("content")
    @classmethod
    def _trim_nonempty(cls, v: str) -> str:
        s = (v or "").strip()
        if not s:
            raise ValueError("Notiz darf nicht leer sein.")
        return s


@router.get("/landlords", response_model=List[dict])
def admin_list_landlords(
    status: Literal["active", "archived", "all"] = Query("active"),
    org_id: str = Depends(get_current_organization),
    _=Depends(require_roles("admin", "manager")),
    session=Depends(get_db_session),
):
    """List landlords. status=active (default): not archived; archived: soft-deleted only; all: both."""
    return las.list_landlords(session, org_id, status=status)


@router.get("/landlords/{landlord_id}", response_model=dict)
def admin_get_landlord(
    landlord_id: str,
    org_id: str = Depends(get_current_organization),
    _=Depends(require_roles("admin", "manager")),
    session=Depends(get_db_session),
):
    """Get a single landlord by id (includes archived)."""
    return las.get_landlord(session, org_id, landlord_id)


@router.get("/landlords/{landlord_id}/properties", response_model=List[dict])
def admin_list_landlord_properties(
    landlord_id: str,
    org_id: str = Depends(get_current_organization),
    _=Depends(require_roles("admin", "manager")),
    session=Depends(get_db_session),
):
    """Properties linked to this landlord (org-scoped; excludes soft-deleted properties)."""
    return las.list_landlord_properties(session, org_id, landlord_id)


@router.get("/landlords/{landlord_id}/units", response_model=List[dict])
def admin_list_landlord_units(
    landlord_id: str,
    org_id: str = Depends(get_current_organization),
    _=Depends(require_roles("admin", "manager")),
    session=Depends(get_db_session),
):
    """
    Units assigned to this landlord: direct (unit.landlord_id) or indirect via
    property (unit.property_id -> property.landlord_id). Non-deleted properties only for the indirect path.
    """
    return las.list_landlord_units(session, org_id, landlord_id)


@router.get("/landlords/{landlord_id}/property-managers", response_model=List[dict])
def admin_list_landlord_property_managers(
    landlord_id: str,
    org_id: str = Depends(get_current_organization),
    _=Depends(require_roles("admin", "manager")),
    session=Depends(get_db_session),
):
    """Property managers linked to this Verwaltung (property_managers.landlord_id)."""
    return las.list_landlord_property_managers(session, org_id, landlord_id)


@router.post("/landlords", response_model=dict)
@limiter.limit("10/minute")
def admin_create_landlord(
    request: Request,
    body: LandlordCreate,
    org_id: str = Depends(get_current_organization),
    current_user: User = Depends(require_roles("admin", "manager")),
    session=Depends(get_db_session),
):
    """Create a new landlord."""
    return las.create_landlord(session, org_id, str(current_user.id), body)


@router.delete("/landlords/{landlord_id}", response_model=dict)
def admin_archive_landlord(
    landlord_id: str,
    org_id: str = Depends(get_current_organization),
    current_user: User = Depends(require_roles("admin", "manager")),
    session=Depends(get_db_session),
):
    """Soft-delete (archive) a landlord: sets deleted_at; does not remove related rows."""
    return las.archive_landlord(session, org_id, str(current_user.id), landlord_id)


@router.post("/landlords/{landlord_id}/restore", response_model=dict)
def admin_restore_landlord(
    landlord_id: str,
    org_id: str = Depends(get_current_organization),
    current_user: User = Depends(require_roles("admin", "manager")),
    session=Depends(get_db_session),
):
    """Clear deleted_at (reactivate). No-op if already active."""
    return las.restore_landlord(session, org_id, str(current_user.id), landlord_id)


@router.put("/landlords/{landlord_id}", response_model=dict)
def admin_put_landlord(
    landlord_id: str,
    body: LandlordUpdate,
    org_id: str = Depends(get_current_organization),
    current_user: User = Depends(require_roles("admin", "manager")),
    session=Depends(get_db_session),
):
    """Update a landlord (partial)."""
    return las.put_landlord(session, org_id, str(current_user.id), landlord_id, body)


@router.get("/landlords/{landlord_id}/notes", response_model=dict)
def admin_list_landlord_notes(
    landlord_id: str,
    org_id: str = Depends(get_current_organization),
    _=Depends(require_roles("admin", "manager")),
    session=Depends(get_db_session),
):
    return las.list_landlord_notes(session, org_id, landlord_id)


@router.post("/landlords/{landlord_id}/notes", response_model=dict)
@limiter.limit("30/minute")
def admin_create_landlord_note(
    request: Request,
    landlord_id: str,
    body: LandlordNoteCreate,
    org_id: str = Depends(get_current_organization),
    current_user: User = Depends(require_roles("admin", "manager")),
    session=Depends(get_db_session),
):
    return las.create_landlord_note(session, org_id, str(current_user.id), landlord_id, body)


@router.put("/landlords/{landlord_id}/notes/{note_id}", response_model=dict)
@limiter.limit("30/minute")
def admin_update_landlord_note(
    request: Request,
    landlord_id: str,
    note_id: str,
    body: LandlordNoteUpdate,
    org_id: str = Depends(get_current_organization),
    current_user: User = Depends(require_roles("admin", "manager")),
    session=Depends(get_db_session),
):
    return las.update_landlord_note(
        session, org_id, str(current_user.id), landlord_id, note_id, body
    )
