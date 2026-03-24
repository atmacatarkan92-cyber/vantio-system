"""
Tenant CRM: activity events (notes timeline + field-level updates).
Explicit write helpers — no global event bus.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any, Optional

from sqlmodel import Session, select

from db.models import TenantEvent, User

# Snapshot keys to emit field-level tenant_updated events (JSON snapshots from model_snapshot).
TRACKED_EVENT_FIELDS: frozenset[str] = frozenset(
    {
        "name",
        "first_name",
        "last_name",
        "birth_date",
        "email",
        "phone",
        "company",
        "street",
        "postal_code",
        "city",
        "country",
        "nationality",
        "is_swiss",
        "residence_permit",
        "room_id",
    }
)

FIELD_LABEL_DE: dict[str, str] = {
    "name": "Name",
    "first_name": "Vorname",
    "last_name": "Nachname",
    "birth_date": "Geburtsdatum",
    "email": "E-Mail",
    "phone": "Telefon",
    "company": "Firma",
    "street": "Strasse",
    "postal_code": "PLZ",
    "city": "Ort",
    "country": "Land",
    "nationality": "Nationalität",
    "is_swiss": "Schweizer/in",
    "residence_permit": "Aufenthaltsbewilligung",
    "room_id": "Zimmer",
}


def _fmt_snapshot_val(v: Any) -> Optional[str]:
    if v is None:
        return None
    if isinstance(v, bool):
        return "Ja" if v else "Nein"
    if isinstance(v, (date, datetime)):
        return v.isoformat() if hasattr(v, "isoformat") else str(v)
    return str(v)


def record_tenant_event(
    session: Session,
    *,
    tenant_id: str,
    organization_id: str,
    action_type: str,
    created_by_user_id: Optional[str],
    field_name: Optional[str] = None,
    old_value: Optional[str] = None,
    new_value: Optional[str] = None,
    summary: Optional[str] = None,
) -> TenantEvent:
    ev = TenantEvent(
        tenant_id=tenant_id,
        organization_id=organization_id,
        action_type=action_type,
        field_name=field_name,
        old_value=old_value,
        new_value=new_value,
        summary=summary,
        created_by_user_id=created_by_user_id,
    )
    session.add(ev)
    return ev


def append_tenant_updated_events_from_snapshots(
    session: Session,
    *,
    tenant_id: str,
    organization_id: str,
    actor_user_id: Optional[str],
    old_snapshot: dict,
    new_snapshot: dict,
) -> None:
    """Emit one tenant_updated row per changed tracked field."""
    for key in TRACKED_EVENT_FIELDS:
        ov = old_snapshot.get(key)
        nv = new_snapshot.get(key)
        if ov == nv:
            continue
        label = FIELD_LABEL_DE.get(key, key)
        ovs = _fmt_snapshot_val(ov)
        nvs = _fmt_snapshot_val(nv)
        record_tenant_event(
            session,
            tenant_id=tenant_id,
            organization_id=organization_id,
            action_type="tenant_updated",
            created_by_user_id=actor_user_id,
            field_name=key,
            old_value=ovs,
            new_value=nvs,
            summary=f"{label} geändert",
        )


def load_users_by_ids(session: Session, ids: set[str]) -> dict[str, User]:
    if not ids:
        return {}
    rows = session.exec(select(User).where(User.id.in_(ids))).all()
    return {str(u.id): u for u in rows}


def author_display(user: Optional[User], user_id: Optional[str]) -> str:
    if user and getattr(user, "full_name", None):
        return str(user.full_name).strip() or "Benutzer"
    if user_id:
        short = user_id[:8]
        return f"Benutzer {short}…"
    return "System"
