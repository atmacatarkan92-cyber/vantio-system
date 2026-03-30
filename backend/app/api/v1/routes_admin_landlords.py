"""
Admin landlords API: list, get, create, update (Phase D table).
Protected by require_roles("admin", "manager").
"""

from datetime import datetime
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, EmailStr, field_validator
from sqlalchemy import desc, not_
from sqlmodel import select

from auth.dependencies import get_current_organization, get_db_session, require_roles
from db.models import Landlord, LandlordNote, Property, PropertyManager, User
from app.core.rate_limit import limiter
from app.services.tenant_crm import load_users_by_ids


router = APIRouter(prefix="/api/admin", tags=["admin-landlords"])


def _landlord_to_dict(l: Landlord) -> dict:
    return {
        "id": str(l.id),
        "user_id": getattr(l, "user_id", None),
        "company_name": getattr(l, "company_name", None),
        "contact_name": getattr(l, "contact_name", "") or "",
        "email": getattr(l, "email", "") or "",
        "phone": getattr(l, "phone", None),
        "address_line1": getattr(l, "address_line1", None),
        "postal_code": getattr(l, "postal_code", None),
        "city": getattr(l, "city", None),
        "canton": getattr(l, "canton", None),
        "website": getattr(l, "website", None),
        "notes": getattr(l, "notes", None),
        "status": getattr(l, "status", "active"),
        "created_at": l.created_at.isoformat() if getattr(l, "created_at", None) else None,
        "updated_at": l.updated_at.isoformat() if getattr(l, "updated_at", None) else None,
        "deleted_at": l.deleted_at.isoformat() if getattr(l, "deleted_at", None) and l.deleted_at else None,
    }


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


def _landlord_in_org_or_404(session, landlord_id: str, org_id: str) -> Landlord:
    landlord = session.get(Landlord, landlord_id)
    if not landlord or str(landlord.organization_id) != org_id:
        raise HTTPException(status_code=404, detail="Landlord not found")
    return landlord


def _landlord_note_user_display_name(user: Optional[User]) -> str:
    """Prefer full_name, then email, else em dash (landlord notes API)."""
    if user is None:
        return "—"
    fn = (getattr(user, "full_name", None) or "").strip()
    if fn:
        return fn
    em = (getattr(user, "email", None) or "").strip()
    if em:
        return em
    return "—"


def _landlord_note_to_dict(
    note: LandlordNote,
    author_user: Optional[User],
    editor_user: Optional[User],
) -> dict:
    return {
        "id": note.id,
        "content": note.content,
        "created_at": note.created_at.isoformat(),
        "created_by_user_id": note.created_by_user_id,
        "author_name": _landlord_note_user_display_name(author_user),
        "updated_at": note.updated_at.isoformat() if note.updated_at else None,
        "updated_by_user_id": note.updated_by_user_id,
        "editor_name": _landlord_note_user_display_name(editor_user)
        if note.updated_at
        else None,
    }


def _validate_address_create(body: LandlordCreate) -> None:
    if not (body.address_line1 or "").strip():
        raise HTTPException(status_code=400, detail="address_line1 is required")
    if not (body.postal_code or "").strip():
        raise HTTPException(status_code=400, detail="postal_code is required")
    if not (body.city or "").strip():
        raise HTTPException(status_code=400, detail="city is required")


def _validate_address_update(data: dict) -> None:
    for k in ("address_line1", "postal_code", "city"):
        if k not in data:
            continue
        v = data.get(k)
        if not (str(v) if v is not None else "").strip():
            raise HTTPException(status_code=400, detail=f"{k} is required")


@router.get("/landlords", response_model=List[dict])
def admin_list_landlords(
    status: Literal["active", "archived", "all"] = Query("active"),
    org_id: str = Depends(get_current_organization),
    _=Depends(require_roles("admin", "manager")),
    session=Depends(get_db_session),
):
    """List landlords. status=active (default): not archived; archived: soft-deleted only; all: both."""
    stmt = select(Landlord).where(Landlord.organization_id == org_id)
    if status == "active":
        stmt = stmt.where(Landlord.deleted_at.is_(None))
    elif status == "archived":
        stmt = stmt.where(not_(Landlord.deleted_at.is_(None)))
    # status == "all": no deleted_at filter
    stmt = stmt.order_by(Landlord.contact_name, Landlord.company_name)
    landlords = list(session.exec(stmt).all())
    return [_landlord_to_dict(l) for l in landlords]


@router.get("/landlords/{landlord_id}", response_model=dict)
def admin_get_landlord(
    landlord_id: str,
    org_id: str = Depends(get_current_organization),
    _=Depends(require_roles("admin", "manager")),
    session=Depends(get_db_session),
):
    """Get a single landlord by id (includes archived)."""
    landlord = session.get(Landlord, landlord_id)
    if not landlord or str(landlord.organization_id) != org_id:
        raise HTTPException(status_code=404, detail="Landlord not found")
    return _landlord_to_dict(landlord)


@router.get("/landlords/{landlord_id}/properties", response_model=List[dict])
def admin_list_landlord_properties(
    landlord_id: str,
    org_id: str = Depends(get_current_organization),
    _=Depends(require_roles("admin", "manager")),
    session=Depends(get_db_session),
):
    """Properties linked to this landlord (org-scoped; excludes soft-deleted properties)."""
    landlord = session.get(Landlord, landlord_id)
    if not landlord or str(landlord.organization_id) != org_id:
        raise HTTPException(status_code=404, detail="Landlord not found")
    rows = list(
        session.exec(
            select(Property)
            .where(Property.organization_id == org_id)
            .where(Property.landlord_id == landlord_id)
            .where(Property.deleted_at.is_(None))
            .order_by(Property.title)
        ).all()
    )
    return [
        {
            "id": str(p.id),
            "title": getattr(p, "title", "") or "",
            "street": getattr(p, "street", None),
            "house_number": getattr(p, "house_number", None),
            "zip_code": getattr(p, "zip_code", None),
            "city": getattr(p, "city", None),
            "status": getattr(p, "status", "active"),
        }
        for p in rows
    ]


def _landlord_property_manager_public_dict(p: PropertyManager) -> dict:
    return {
        "id": str(p.id),
        "name": (getattr(p, "name", None) or "").strip(),
        "email": getattr(p, "email", None),
        "phone": getattr(p, "phone", None),
        "landlord_id": getattr(p, "landlord_id", None),
    }


@router.get("/landlords/{landlord_id}/property-managers", response_model=List[dict])
def admin_list_landlord_property_managers(
    landlord_id: str,
    org_id: str = Depends(get_current_organization),
    _=Depends(require_roles("admin", "manager")),
    session=Depends(get_db_session),
):
    """Property managers linked to this Verwaltung (property_managers.landlord_id)."""
    _landlord_in_org_or_404(session, landlord_id, org_id)
    rows = list(
        session.exec(
            select(PropertyManager)
            .where(
                PropertyManager.landlord_id == landlord_id,
                PropertyManager.organization_id == org_id,
            )
            .order_by(PropertyManager.name)
        ).all()
    )
    return [_landlord_property_manager_public_dict(p) for p in rows]


@router.post("/landlords", response_model=dict)
@limiter.limit("10/minute")
def admin_create_landlord(
    request: Request,
    body: LandlordCreate,
    org_id: str = Depends(get_current_organization),
    _=Depends(require_roles("admin", "manager")),
    session=Depends(get_db_session),
):
    """Create a new landlord."""
    if body.user_id:
        u = session.get(User, body.user_id)
        if not u or str(u.organization_id) != org_id:
            raise HTTPException(status_code=400, detail="Invalid user reference")
    _validate_address_create(body)
    landlord = Landlord(
        organization_id=org_id,
        user_id=body.user_id,
        company_name=body.company_name,
        contact_name=(body.contact_name or "").strip() or "—",
        email=(body.email or "").strip() or "",
        phone=body.phone,
        address_line1=(body.address_line1 or "").strip(),
        postal_code=(body.postal_code or "").strip(),
        city=(body.city or "").strip(),
        canton=body.canton,
        website=body.website,
        notes=body.notes,
        status=(body.status or "active").strip() or "active",
    )
    session.add(landlord)
    session.commit()
    session.refresh(landlord)
    return _landlord_to_dict(landlord)


@router.delete("/landlords/{landlord_id}", response_model=dict)
def admin_archive_landlord(
    landlord_id: str,
    org_id: str = Depends(get_current_organization),
    _=Depends(require_roles("admin", "manager")),
    session=Depends(get_db_session),
):
    """Soft-delete (archive) a landlord: sets deleted_at; does not remove related rows."""
    landlord = session.get(Landlord, landlord_id)
    if (
        not landlord
        or str(landlord.organization_id) != org_id
        or getattr(landlord, "deleted_at", None) is not None
    ):
        raise HTTPException(status_code=404, detail="Landlord not found")
    now = datetime.utcnow()
    landlord.deleted_at = now
    landlord.updated_at = now
    session.add(landlord)
    session.commit()
    session.refresh(landlord)
    return _landlord_to_dict(landlord)


@router.post("/landlords/{landlord_id}/restore", response_model=dict)
def admin_restore_landlord(
    landlord_id: str,
    org_id: str = Depends(get_current_organization),
    _=Depends(require_roles("admin", "manager")),
    session=Depends(get_db_session),
):
    """Clear deleted_at (reactivate). No-op if already active."""
    landlord = session.get(Landlord, landlord_id)
    if not landlord or str(landlord.organization_id) != org_id:
        raise HTTPException(status_code=404, detail="Landlord not found")
    if landlord.deleted_at is None:
        return _landlord_to_dict(landlord)
    now = datetime.utcnow()
    landlord.deleted_at = None
    landlord.updated_at = now
    session.add(landlord)
    session.commit()
    session.refresh(landlord)
    return _landlord_to_dict(landlord)


@router.put("/landlords/{landlord_id}", response_model=dict)
def admin_put_landlord(
    landlord_id: str,
    body: LandlordUpdate,
    org_id: str = Depends(get_current_organization),
    _=Depends(require_roles("admin", "manager")),
    session=Depends(get_db_session),
):
    """Update a landlord (partial)."""
    landlord = session.get(Landlord, landlord_id)
    if (
        not landlord
        or str(landlord.organization_id) != org_id
        or getattr(landlord, "deleted_at", None) is not None
    ):
        raise HTTPException(status_code=404, detail="Landlord not found")
    data = body.model_dump(exclude_unset=True)
    _validate_address_update(data)
    if "user_id" in data and data["user_id"]:
        u = session.get(User, data["user_id"])
        if not u or str(u.organization_id) != org_id:
            raise HTTPException(status_code=400, detail="Invalid user reference")
    for k, v in data.items():
        if hasattr(landlord, k):
            setattr(landlord, k, v)
    session.add(landlord)
    session.commit()
    session.refresh(landlord)
    return _landlord_to_dict(landlord)


@router.get("/landlords/{landlord_id}/notes", response_model=dict)
def admin_list_landlord_notes(
    landlord_id: str,
    org_id: str = Depends(get_current_organization),
    _=Depends(require_roles("admin", "manager")),
    session=Depends(get_db_session),
):
    _landlord_in_org_or_404(session, landlord_id, org_id)
    rows = session.exec(
        select(LandlordNote)
        .where(
            LandlordNote.landlord_id == landlord_id,
            LandlordNote.organization_id == org_id,
        )
        .order_by(desc(LandlordNote.created_at))
        .limit(200)
    ).all()
    uids = set()
    for n in rows:
        if n.created_by_user_id:
            uids.add(n.created_by_user_id)
        if n.updated_by_user_id:
            uids.add(n.updated_by_user_id)
    users = load_users_by_ids(session, uids)
    items = [
        _landlord_note_to_dict(
            n,
            users.get(n.created_by_user_id),
            users.get(n.updated_by_user_id) if n.updated_by_user_id else None,
        )
        for n in rows
    ]
    return {"items": items}


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
    _landlord_in_org_or_404(session, landlord_id, org_id)
    note = LandlordNote(
        landlord_id=landlord_id,
        organization_id=org_id,
        content=body.content,
        created_by_user_id=str(current_user.id),
    )
    session.add(note)
    session.commit()
    session.refresh(note)
    u = session.get(User, note.created_by_user_id) if note.created_by_user_id else None
    return _landlord_note_to_dict(note, u, None)


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
    _landlord_in_org_or_404(session, landlord_id, org_id)
    note = session.get(LandlordNote, note_id)
    if (
        not note
        or str(note.landlord_id) != landlord_id
        or str(note.organization_id) != org_id
    ):
        raise HTTPException(status_code=404, detail="Note not found")
    now = datetime.utcnow()
    note.content = body.content
    note.updated_at = now
    note.updated_by_user_id = str(current_user.id)
    session.add(note)
    session.commit()
    session.refresh(note)
    author_u = (
        session.get(User, note.created_by_user_id) if note.created_by_user_id else None
    )
    editor_u = (
        session.get(User, note.updated_by_user_id) if note.updated_by_user_id else None
    )
    return _landlord_note_to_dict(note, author_u, editor_u)
