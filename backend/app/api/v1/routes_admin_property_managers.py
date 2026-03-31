"""
Admin property managers (Bewirtschafter): list, get, create, update, units.
Protected by require_roles("admin", "manager").
"""

from datetime import datetime
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import desc
from sqlmodel import select

from auth.dependencies import get_current_organization, get_db_session, require_roles
from app.api.v1.routes_admin_units import _unit_to_dict
from app.core.rate_limit import limiter
from app.services.tenant_crm import load_users_by_ids
from db.models import Landlord, Property, PropertyManager, PropertyManagerNote, Unit, User


router = APIRouter(prefix="/api/admin", tags=["admin-property-managers"])


def _assert_landlord_in_org(session, landlord_id: Optional[str], org_id: str) -> None:
    if not landlord_id:
        return
    ll = session.get(Landlord, landlord_id)
    if not ll or str(getattr(ll, "organization_id", "")) != org_id:
        raise HTTPException(status_code=400, detail="Invalid landlord reference")


def _pm_status(p: PropertyManager) -> str:
    s = (getattr(p, "status", None) or "active").strip().lower()
    return "inactive" if s == "inactive" else "active"


def _pm_to_dict(p: PropertyManager) -> dict:
    return {
        "id": str(p.id),
        "landlord_id": getattr(p, "landlord_id", None),
        "name": (getattr(p, "name", None) or "").strip(),
        "email": getattr(p, "email", None),
        "phone": getattr(p, "phone", None),
        "status": _pm_status(p),
        "created_at": p.created_at.isoformat() if getattr(p, "created_at", None) else None,
        "updated_at": p.updated_at.isoformat()
        if getattr(p, "updated_at", None)
        else None,
    }


def _pm_in_org_or_404(session, pm_id: str, org_id: str) -> PropertyManager:
    pm = session.get(PropertyManager, pm_id)
    if not pm or str(getattr(pm, "organization_id", "")) != org_id:
        raise HTTPException(status_code=404, detail="Property manager not found")
    return pm


def _pm_note_user_display_name(user: Optional[User]) -> str:
    """Prefer full_name, then email, else em dash (same as landlord notes API)."""
    if user is None:
        return "—"
    fn = (getattr(user, "full_name", None) or "").strip()
    if fn:
        return fn
    em = (getattr(user, "email", None) or "").strip()
    if em:
        return em
    return "—"


def _pm_note_to_dict(note: PropertyManagerNote, author_user: Optional[User]) -> dict:
    return {
        "id": note.id,
        "content": note.content,
        "created_at": note.created_at.isoformat(),
        "created_by_user_id": note.created_by_user_id,
        "author_name": _pm_note_user_display_name(author_user),
    }


class PropertyManagerNoteCreate(BaseModel):
    content: str

    @field_validator("content")
    @classmethod
    def _trim_nonempty(cls, v: str) -> str:
        s = (v or "").strip()
        if not s:
            raise ValueError("Notiz darf nicht leer sein.")
        return s


class PropertyManagerCreate(BaseModel):
    name: str = Field(min_length=1, max_length=500)
    email: Optional[str] = None
    phone: Optional[str] = None
    landlord_id: Optional[str] = None
    status: Optional[Literal["active", "inactive"]] = "active"


class PropertyManagerPatch(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=500)
    email: Optional[str] = None
    phone: Optional[str] = None
    landlord_id: Optional[str] = None
    status: Optional[Literal["active", "inactive"]] = None


@router.get("/property-managers", response_model=List[dict])
def admin_list_property_managers(
    org_id: str = Depends(get_current_organization),
    _=Depends(require_roles("admin", "manager")),
    session=Depends(get_db_session),
):
    rows = list(
        session.exec(
            select(PropertyManager)
            .where(PropertyManager.organization_id == org_id)
            .order_by(PropertyManager.name)
        ).all()
    )
    return [_pm_to_dict(p) for p in rows]


@router.get("/property-managers/{pm_id}", response_model=dict)
def admin_get_property_manager(
    pm_id: str,
    org_id: str = Depends(get_current_organization),
    _=Depends(require_roles("admin", "manager")),
    session=Depends(get_db_session),
):
    pm = session.get(PropertyManager, pm_id)
    if not pm or str(getattr(pm, "organization_id", "")) != org_id:
        raise HTTPException(status_code=404, detail="Property manager not found")
    return _pm_to_dict(pm)


@router.get("/property-managers/{pm_id}/notes", response_model=dict)
def admin_list_property_manager_notes(
    pm_id: str,
    org_id: str = Depends(get_current_organization),
    _=Depends(require_roles("admin", "manager")),
    session=Depends(get_db_session),
):
    _pm_in_org_or_404(session, pm_id, org_id)
    rows = session.exec(
        select(PropertyManagerNote)
        .where(
            PropertyManagerNote.property_manager_id == pm_id,
            PropertyManagerNote.organization_id == org_id,
        )
        .order_by(desc(PropertyManagerNote.created_at))
        .limit(200)
    ).all()
    uids = {n.created_by_user_id for n in rows if n.created_by_user_id}
    users = load_users_by_ids(session, uids)
    items = [_pm_note_to_dict(n, users.get(n.created_by_user_id)) for n in rows]
    return {"items": items}


@router.post("/property-managers/{pm_id}/notes", response_model=dict)
@limiter.limit("30/minute")
def admin_create_property_manager_note(
    request: Request,
    pm_id: str,
    body: PropertyManagerNoteCreate,
    org_id: str = Depends(get_current_organization),
    current_user: User = Depends(require_roles("admin", "manager")),
    session=Depends(get_db_session),
):
    _pm_in_org_or_404(session, pm_id, org_id)
    note = PropertyManagerNote(
        property_manager_id=pm_id,
        organization_id=org_id,
        content=body.content,
        created_by_user_id=str(current_user.id),
    )
    session.add(note)
    session.commit()
    session.refresh(note)
    u = session.get(User, note.created_by_user_id) if note.created_by_user_id else None
    return _pm_note_to_dict(note, u)


@router.get("/property-managers/{pm_id}/units", response_model=List[dict])
def admin_list_property_manager_units(
    pm_id: str,
    org_id: str = Depends(get_current_organization),
    _=Depends(require_roles("admin", "manager")),
    session=Depends(get_db_session),
):
    """Units with property_manager_id == pm_id (org-scoped)."""
    pm = session.get(PropertyManager, pm_id)
    if not pm or str(getattr(pm, "organization_id", "")) != org_id:
        raise HTTPException(status_code=404, detail="Property manager not found")
    stmt = (
        select(Unit, Property)
        .select_from(Unit)
        .outerjoin(Property, Unit.property_id == Property.id)
        .where(Unit.organization_id == org_id)
        .where(Unit.property_manager_id == pm_id)
        .order_by(Unit.title)
    )
    rows = list(session.exec(stmt).all())
    return [_unit_to_dict(u, p.title if p else None) for u, p in rows]


@router.post("/property-managers", response_model=dict)
@limiter.limit("10/minute")
def admin_create_property_manager(
    request: Request,
    body: PropertyManagerCreate,
    org_id: str = Depends(get_current_organization),
    _=Depends(require_roles("admin", "manager")),
    session=Depends(get_db_session),
):
    name = (body.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")
    _assert_landlord_in_org(session, body.landlord_id, org_id)
    st = (body.status or "active").strip().lower()
    if st not in ("active", "inactive"):
        st = "active"
    now = datetime.utcnow()
    pm = PropertyManager(
        organization_id=org_id,
        name=name,
        email=(body.email or "").strip() or None,
        phone=(body.phone or "").strip() or None,
        landlord_id=body.landlord_id or None,
        status=st,
        created_at=now,
        updated_at=now,
    )
    session.add(pm)
    session.commit()
    session.refresh(pm)
    return _pm_to_dict(pm)


@router.patch("/property-managers/{pm_id}", response_model=dict)
@limiter.limit("20/minute")
def admin_patch_property_manager(
    request: Request,
    pm_id: str,
    body: PropertyManagerPatch,
    org_id: str = Depends(get_current_organization),
    _=Depends(require_roles("admin", "manager")),
    session=Depends(get_db_session),
):
    pm = session.get(PropertyManager, pm_id)
    if not pm or str(getattr(pm, "organization_id", "")) != org_id:
        raise HTTPException(status_code=404, detail="Property manager not found")
    data = body.model_dump(exclude_unset=True)
    if "landlord_id" in data:
        lid = data["landlord_id"] if data["landlord_id"] else None
        _assert_landlord_in_org(session, lid, org_id)
        data["landlord_id"] = lid
    if "name" in data and data["name"] is not None:
        n = str(data["name"]).strip()
        if not n:
            raise HTTPException(status_code=400, detail="Name must not be empty")
        data["name"] = n
    if "email" in data:
        data["email"] = (data["email"] or "").strip() or None
    if "phone" in data:
        data["phone"] = (data["phone"] or "").strip() or None
    if "status" in data and data["status"] is not None:
        st = str(data["status"]).strip().lower()
        if st not in ("active", "inactive"):
            raise HTTPException(status_code=400, detail="status must be active or inactive")
        data["status"] = st
    if data:
        data["updated_at"] = datetime.utcnow()
    for k, v in data.items():
        if hasattr(pm, k):
            setattr(pm, k, v)
    session.add(pm)
    session.commit()
    session.refresh(pm)
    return _pm_to_dict(pm)
