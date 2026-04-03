"""
Admin tenant CRUD, notes, events, org-safe lookups, and serialization.

Used by routes_admin_tenants; HTTP framing stays in the router.
"""

from __future__ import annotations

from typing import Any, Optional

from fastapi import HTTPException
from sqlalchemy import desc, func, or_
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from db.audit import create_audit_log, model_snapshot
from db.models import Room, Tenancy, Tenant, TenantEvent, TenantNote, Unit, User
from app.services.tenant_crm import (
    append_tenant_updated_events_from_snapshots,
    author_display,
    load_users_by_ids,
    record_tenant_event,
)

TENANT_DELETE_BLOCKED_TENANCY = (
    "Mieter kann nicht gelöscht werden, da noch Mietverhältnisse vorhanden sind."
)
TENANT_DELETE_BLOCKED_LINKED = (
    "Mieter kann nicht gelöscht werden, da noch verknüpfte Daten vorhanden sind."
)

# Allowed residence permit categories (free-text drift prevention).
ALLOWED_RESIDENCE_PERMITS = frozenset({"B", "C", "L", "G", "Other"})


def assert_room_in_org(session: Session, room_id: Optional[str], org_id: str) -> None:
    if not room_id:
        return
    room = session.get(Room, room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    unit = session.get(Unit, room.unit_id)
    if not unit or str(getattr(unit, "organization_id", "")) != org_id:
        raise HTTPException(status_code=404, detail="Room not found")


def display_name_from_tenant(t: Tenant) -> str:
    """Stable display label: canonical first_name + last_name, else legacy name."""
    fn = (getattr(t, "first_name", None) or "").strip()
    ln = (getattr(t, "last_name", None) or "").strip()
    if fn or ln:
        return f"{fn} {ln}".strip()
    return (getattr(t, "name", None) or "").strip() or ""


def refresh_legacy_name_field(tenant: Tenant) -> None:
    """Keep DB `name` in sync whenever first_name/last_name are present (compatibility column)."""
    fn = (getattr(tenant, "first_name", None) or "").strip()
    ln = (getattr(tenant, "last_name", None) or "").strip()
    if fn or ln:
        tenant.name = f"{fn} {ln}".strip()


def tenant_to_dict(t: Tenant) -> dict:
    """Serialize tenant; display_name/full_name always match display_name_from_tenant."""
    legacy = getattr(t, "name", "") or ""
    display = display_name_from_tenant(t)
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


def trim_opt_str(v: Optional[str]) -> Optional[str]:
    if v is None or (isinstance(v, str) and not v.strip()):
        return None
    return str(v).strip()


def validate_residence_permit_value(v: Optional[str]) -> Optional[str]:
    if v is None:
        return None
    s = str(v).strip()
    if not s:
        return None
    if s not in ALLOWED_RESIDENCE_PERMITS:
        raise ValueError("Aufenthaltsbewilligung: nur B, C, L, G oder Other.")
    return s


def tenant_in_org_or_404(session: Session, tenant_id: str, org_id: str) -> Tenant:
    tenant = session.get(Tenant, tenant_id)
    if not tenant or str(getattr(tenant, "organization_id", "")) != org_id:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return tenant


def note_to_dict(note: TenantNote, user: Optional[User]) -> dict:
    return {
        "id": note.id,
        "content": note.content,
        "created_at": note.created_at.isoformat(),
        "created_by_user_id": note.created_by_user_id,
        "author_name": author_display(user, note.created_by_user_id),
    }


def event_to_dict(ev: TenantEvent, user: Optional[User]) -> dict:
    return {
        "id": ev.id,
        "action_type": ev.action_type,
        "field_name": ev.field_name,
        "old_value": ev.old_value,
        "new_value": ev.new_value,
        "summary": ev.summary or ev.action_type,
        "created_at": ev.created_at.isoformat(),
        "created_by_user_id": ev.created_by_user_id,
        "author_name": author_display(user, ev.created_by_user_id),
    }


def list_tenants(session: Session, org_id: str, skip: int, limit: int, q: Optional[str]) -> dict:
    """Returns dict with items, total, skip, limit (TenantListResponse shape)."""
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
    items = [tenant_to_dict(t) for t in paged_rows]
    return {"items": items, "total": total, "skip": skip, "limit": limit}


def get_tenant(session: Session, org_id: str, tenant_id: str) -> dict:
    tenant = session.get(Tenant, tenant_id)
    if not tenant or str(getattr(tenant, "organization_id", "")) != org_id:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return tenant_to_dict(tenant)


def create_tenant(session: Session, org_id: str, current_user_id: str, body: Any) -> dict:
    assert_room_in_org(session, body.room_id, org_id)
    residence = None if body.is_swiss is True else body.residence_permit
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
    record_tenant_event(
        session,
        tenant_id=str(tenant.id),
        organization_id=org_id,
        action_type="tenant_created",
        created_by_user_id=str(current_user_id),
        summary="Mieter angelegt",
    )
    create_audit_log(
        session,
        str(current_user_id),
        "create",
        "tenant",
        str(tenant.id),
        old_values=None,
        new_values=model_snapshot(tenant),
        organization_id=org_id,
    )
    session.commit()
    session.refresh(tenant)
    return tenant_to_dict(tenant)


def patch_tenant(session: Session, org_id: str, current_user_id: str, tenant_id: str, body: Any) -> dict:
    tenant = session.get(Tenant, tenant_id)
    if not tenant or str(getattr(tenant, "organization_id", "")) != org_id:
        raise HTTPException(status_code=404, detail="Tenant not found")
    old_snapshot = model_snapshot(tenant)
    data = body.model_dump(exclude_unset=True)
    if "room_id" in data:
        assert_room_in_org(session, data.get("room_id"), org_id)
    if "full_name" in data and "name" not in data:
        data["name"] = data.pop("full_name")
    has_canonical_in_request = "first_name" in data or "last_name" in data
    if has_canonical_in_request:
        data.pop("name", None)
        data.pop("full_name", None)
    elif "name" in data or "full_name" in data:
        fn_existing = (getattr(tenant, "first_name", None) or "").strip()
        ln_existing = (getattr(tenant, "last_name", None) or "").strip()
        if fn_existing or ln_existing:
            data.pop("name", None)
            data.pop("full_name", None)
    for k, v in data.items():
        if hasattr(tenant, k):
            if k == "email" and v is None:
                setattr(tenant, "email", "")
            else:
                setattr(tenant, k, v)
    refresh_legacy_name_field(tenant)
    if getattr(tenant, "is_swiss", None) is True:
        tenant.residence_permit = None
    session.add(tenant)
    new_snapshot = model_snapshot(tenant)
    append_tenant_updated_events_from_snapshots(
        session,
        tenant_id=str(tenant_id),
        organization_id=org_id,
        actor_user_id=str(current_user_id),
        old_snapshot=old_snapshot or {},
        new_snapshot=new_snapshot or {},
    )
    create_audit_log(
        session,
        str(current_user_id),
        "update",
        "tenant",
        str(tenant_id),
        old_values=old_snapshot,
        new_values=new_snapshot,
        organization_id=org_id,
    )
    session.commit()
    session.refresh(tenant)
    return tenant_to_dict(tenant)


def delete_tenant(session: Session, org_id: str, current_user_id: str, tenant_id: str) -> dict:
    tenant = session.get(Tenant, tenant_id)
    if not tenant or str(getattr(tenant, "organization_id", "")) != org_id:
        raise HTTPException(status_code=404, detail="Tenant not found")
    if session.exec(select(Tenancy.id).where(Tenancy.tenant_id == tenant_id).limit(1)).first():
        raise HTTPException(status_code=400, detail=TENANT_DELETE_BLOCKED_TENANCY)
    old_snapshot = model_snapshot(tenant)
    try:
        session.delete(tenant)
        create_audit_log(
            session,
            str(current_user_id),
            "delete",
            "tenant",
            str(tenant_id),
            old_values=old_snapshot,
            new_values=None,
            organization_id=org_id,
        )
        session.commit()
    except IntegrityError:
        session.rollback()
        raise HTTPException(status_code=400, detail=TENANT_DELETE_BLOCKED_LINKED) from None
    return {"status": "ok", "message": "Tenant deleted"}


def list_tenant_notes(session: Session, org_id: str, tenant_id: str) -> dict:
    tenant_in_org_or_404(session, tenant_id, org_id)
    rows = session.exec(
        select(TenantNote)
        .where(
            TenantNote.tenant_id == tenant_id,
            TenantNote.organization_id == org_id,
        )
        .order_by(desc(TenantNote.created_at))
        .limit(200)
    ).all()
    uids = {n.created_by_user_id for n in rows if n.created_by_user_id}
    users = load_users_by_ids(session, uids)
    items = [note_to_dict(n, users.get(n.created_by_user_id)) for n in rows]
    return {"items": items}


def create_tenant_note(
    session: Session, org_id: str, current_user_id: str, tenant_id: str, body: Any
) -> dict:
    tenant_in_org_or_404(session, tenant_id, org_id)
    note = TenantNote(
        tenant_id=tenant_id,
        organization_id=org_id,
        content=body.content,
        created_by_user_id=str(current_user_id),
    )
    session.add(note)
    record_tenant_event(
        session,
        tenant_id=tenant_id,
        organization_id=org_id,
        action_type="tenant_note_added",
        created_by_user_id=str(current_user_id),
        summary="Notiz hinzugefügt",
    )
    session.commit()
    session.refresh(note)
    u = session.get(User, note.created_by_user_id) if note.created_by_user_id else None
    return note_to_dict(note, u)


def list_tenant_events(session: Session, org_id: str, tenant_id: str) -> dict:
    tenant_in_org_or_404(session, tenant_id, org_id)
    rows = session.exec(
        select(TenantEvent)
        .where(
            TenantEvent.tenant_id == tenant_id,
            TenantEvent.organization_id == org_id,
        )
        .order_by(desc(TenantEvent.created_at))
        .limit(300)
    ).all()
    uids = {e.created_by_user_id for e in rows if e.created_by_user_id}
    users = load_users_by_ids(session, uids)
    items = [event_to_dict(e, users.get(e.created_by_user_id)) for e in rows]
    return {"items": items}
