"""
Admin landlord CRUD, properties, units, property managers, notes, and serialization.

Used by routes_admin_landlords; HTTP framing stays in the router.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, List, Literal, Optional

from fastapi import HTTPException
from sqlalchemy import and_, desc, not_, or_
from sqlmodel import Session, select

from db.audit import create_audit_log, model_snapshot
from db.models import Landlord, LandlordNote, Property, PropertyManager, Unit, User
from app.services.tenant_crm import load_users_by_ids
from app.services.unit_admin_service import load_owner_names_map, unit_to_dict

# Fields logged per PUT (excludes updated_at; deleted_at uses archive/restore endpoints).
LANDLORD_PUT_AUDIT_FIELDS = frozenset(
    {
        "user_id",
        "company_name",
        "contact_name",
        "email",
        "phone",
        "address_line1",
        "postal_code",
        "city",
        "canton",
        "website",
        "notes",
        "status",
    }
)


def landlord_to_dict(l: Landlord) -> dict:
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


def landlord_in_org_or_404(session: Session, landlord_id: str, org_id: str) -> Landlord:
    landlord = session.get(Landlord, landlord_id)
    if not landlord or str(landlord.organization_id) != org_id:
        raise HTTPException(status_code=404, detail="Landlord not found")
    return landlord


def landlord_note_user_display_name(user: Optional[User]) -> str:
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


def landlord_note_to_dict(
    note: LandlordNote,
    author_user: Optional[User],
    editor_user: Optional[User],
) -> dict:
    return {
        "id": note.id,
        "content": note.content,
        "created_at": note.created_at.isoformat(),
        "created_by_user_id": note.created_by_user_id,
        "author_name": landlord_note_user_display_name(author_user),
        "updated_at": note.updated_at.isoformat() if note.updated_at else None,
        "updated_by_user_id": note.updated_by_user_id,
        "editor_name": landlord_note_user_display_name(editor_user)
        if note.updated_at
        else None,
    }


def validate_address_create(body: Any) -> None:
    if not (body.address_line1 or "").strip():
        raise HTTPException(status_code=400, detail="address_line1 is required")
    if not (body.postal_code or "").strip():
        raise HTTPException(status_code=400, detail="postal_code is required")
    if not (body.city or "").strip():
        raise HTTPException(status_code=400, detail="city is required")


def validate_address_update(data: dict) -> None:
    for k in ("address_line1", "postal_code", "city"):
        if k not in data:
            continue
        v = data.get(k)
        if not (str(v) if v is not None else "").strip():
            raise HTTPException(status_code=400, detail=f"{k} is required")


def landlord_property_manager_public_dict(p: PropertyManager) -> dict:
    return {
        "id": str(p.id),
        "name": (getattr(p, "name", None) or "").strip(),
        "email": getattr(p, "email", None),
        "phone": getattr(p, "phone", None),
        "landlord_id": getattr(p, "landlord_id", None),
    }


def list_landlords(
    session: Session, org_id: str, status: Literal["active", "archived", "all"]
) -> List[dict]:
    """List landlords. status=active (default): not archived; archived: soft-deleted only; all: both."""
    stmt = select(Landlord).where(Landlord.organization_id == org_id)
    if status == "active":
        stmt = stmt.where(Landlord.deleted_at.is_(None))
    elif status == "archived":
        stmt = stmt.where(not_(Landlord.deleted_at.is_(None)))
    stmt = stmt.order_by(Landlord.contact_name, Landlord.company_name)
    landlords = list(session.exec(stmt).all())
    return [landlord_to_dict(l) for l in landlords]


def get_landlord(session: Session, org_id: str, landlord_id: str) -> dict:
    """Get a single landlord by id (includes archived)."""
    landlord = session.get(Landlord, landlord_id)
    if not landlord or str(landlord.organization_id) != org_id:
        raise HTTPException(status_code=404, detail="Landlord not found")
    return landlord_to_dict(landlord)


def list_landlord_properties(session: Session, org_id: str, landlord_id: str) -> List[dict]:
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


def list_landlord_units(session: Session, org_id: str, landlord_id: str) -> List[dict]:
    """
    Units assigned to this landlord: direct (unit.landlord_id) or indirect via
    property (unit.property_id -> property.landlord_id). Non-deleted properties only for the indirect path.
    """
    landlord = session.get(Landlord, landlord_id)
    if not landlord or str(landlord.organization_id) != org_id:
        raise HTTPException(status_code=404, detail="Landlord not found")

    stmt = (
        select(Unit, Property)
        .select_from(Unit)
        .outerjoin(Property, Unit.property_id == Property.id)
        .where(Unit.organization_id == org_id)
        .where(
            or_(
                Unit.landlord_id == landlord_id,
                and_(
                    Property.id.isnot(None),
                    Property.landlord_id == landlord_id,
                    Property.organization_id == org_id,
                    Property.deleted_at.is_(None),
                ),
            )
        )
        .order_by(Unit.title)
    )
    rows = list(session.exec(stmt).all())
    owner_ids = {
        str(getattr(u, "owner_id"))
        for u, _p in rows
        if getattr(u, "owner_id", None)
    }
    owner_labels = load_owner_names_map(session, owner_ids)
    return [
        unit_to_dict(
            u,
            p.title if p else None,
            owner_labels.get(str(u.owner_id)) if getattr(u, "owner_id", None) else None,
        )
        for u, p in rows
    ]


def list_landlord_property_managers(session: Session, org_id: str, landlord_id: str) -> List[dict]:
    """Property managers linked to this Verwaltung (property_managers.landlord_id)."""
    landlord_in_org_or_404(session, landlord_id, org_id)
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
    return [landlord_property_manager_public_dict(p) for p in rows]


def create_landlord(session: Session, org_id: str, current_user_id: str, body: Any) -> dict:
    """Create a new landlord."""
    if body.user_id:
        u = session.get(User, body.user_id)
        if not u or str(u.organization_id) != org_id:
            raise HTTPException(status_code=400, detail="Invalid user reference")
    validate_address_create(body)
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
    session.flush()
    create_audit_log(
        session,
        str(current_user_id),
        "create",
        "landlord",
        str(landlord.id),
        old_values=None,
        new_values=model_snapshot(landlord),
        organization_id=org_id,
    )
    session.commit()
    session.refresh(landlord)
    return landlord_to_dict(landlord)


def archive_landlord(session: Session, org_id: str, current_user_id: str, landlord_id: str) -> dict:
    """Soft-delete (archive) a landlord: sets deleted_at; does not remove related rows."""
    landlord = session.get(Landlord, landlord_id)
    if (
        not landlord
        or str(landlord.organization_id) != org_id
        or getattr(landlord, "deleted_at", None) is not None
    ):
        raise HTTPException(status_code=404, detail="Landlord not found")
    old_snapshot = model_snapshot(landlord)
    now = datetime.utcnow()
    landlord.deleted_at = now
    landlord.updated_at = now
    session.add(landlord)
    new_snapshot = model_snapshot(landlord)
    ov = old_snapshot.get("deleted_at")
    nv = new_snapshot.get("deleted_at")
    if ov != nv:
        create_audit_log(
            session,
            str(current_user_id),
            "update",
            "landlord",
            landlord_id,
            old_values={"deleted_at": ov},
            new_values={"deleted_at": nv},
            organization_id=org_id,
        )
    session.commit()
    session.refresh(landlord)
    return landlord_to_dict(landlord)


def restore_landlord(session: Session, org_id: str, current_user_id: str, landlord_id: str) -> dict:
    """Clear deleted_at (reactivate). No-op if already active."""
    landlord = session.get(Landlord, landlord_id)
    if not landlord or str(landlord.organization_id) != org_id:
        raise HTTPException(status_code=404, detail="Landlord not found")
    if landlord.deleted_at is None:
        return landlord_to_dict(landlord)
    old_snapshot = model_snapshot(landlord)
    now = datetime.utcnow()
    landlord.deleted_at = None
    landlord.updated_at = now
    session.add(landlord)
    new_snapshot = model_snapshot(landlord)
    ov = old_snapshot.get("deleted_at")
    nv = new_snapshot.get("deleted_at")
    if ov != nv:
        create_audit_log(
            session,
            str(current_user_id),
            "update",
            "landlord",
            landlord_id,
            old_values={"deleted_at": ov},
            new_values={"deleted_at": nv},
            organization_id=org_id,
        )
    session.commit()
    session.refresh(landlord)
    return landlord_to_dict(landlord)


def put_landlord(session: Session, org_id: str, current_user_id: str, landlord_id: str, body: Any) -> dict:
    """Update a landlord (partial)."""
    landlord = session.get(Landlord, landlord_id)
    if (
        not landlord
        or str(landlord.organization_id) != org_id
        or getattr(landlord, "deleted_at", None) is not None
    ):
        raise HTTPException(status_code=404, detail="Landlord not found")
    old_snapshot = model_snapshot(landlord)
    data = body.model_dump(exclude_unset=True)
    validate_address_update(data)
    if "user_id" in data and data["user_id"]:
        u = session.get(User, data["user_id"])
        if not u or str(u.organization_id) != org_id:
            raise HTTPException(status_code=400, detail="Invalid user reference")
    for k, v in data.items():
        if hasattr(landlord, k):
            setattr(landlord, k, v)
    if data:
        landlord.updated_at = datetime.utcnow()
    session.add(landlord)
    new_snapshot = model_snapshot(landlord)
    for key in data:
        if key not in LANDLORD_PUT_AUDIT_FIELDS:
            continue
        ov = old_snapshot.get(key)
        nv = new_snapshot.get(key)
        if ov != nv:
            create_audit_log(
                session,
                str(current_user_id),
                "update",
                "landlord",
                landlord_id,
                old_values={key: ov},
                new_values={key: nv},
                organization_id=org_id,
            )
    session.commit()
    session.refresh(landlord)
    return landlord_to_dict(landlord)


def list_landlord_notes(session: Session, org_id: str, landlord_id: str) -> dict:
    landlord_in_org_or_404(session, landlord_id, org_id)
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
        landlord_note_to_dict(
            n,
            users.get(n.created_by_user_id),
            users.get(n.updated_by_user_id) if n.updated_by_user_id else None,
        )
        for n in rows
    ]
    return {"items": items}


def create_landlord_note(
    session: Session, org_id: str, current_user_id: str, landlord_id: str, body: Any
) -> dict:
    landlord_in_org_or_404(session, landlord_id, org_id)
    note = LandlordNote(
        landlord_id=landlord_id,
        organization_id=org_id,
        content=body.content,
        created_by_user_id=str(current_user_id),
    )
    session.add(note)
    session.commit()
    session.refresh(note)
    u = session.get(User, note.created_by_user_id) if note.created_by_user_id else None
    return landlord_note_to_dict(note, u, None)


def update_landlord_note(
    session: Session,
    org_id: str,
    current_user_id: str,
    landlord_id: str,
    note_id: str,
    body: Any,
) -> dict:
    landlord_in_org_or_404(session, landlord_id, org_id)
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
    note.updated_by_user_id = str(current_user_id)
    session.add(note)
    session.commit()
    session.refresh(note)
    author_u = (
        session.get(User, note.created_by_user_id) if note.created_by_user_id else None
    )
    editor_u = (
        session.get(User, note.updated_by_user_id) if note.updated_by_user_id else None
    )
    return landlord_note_to_dict(note, author_u, editor_u)
