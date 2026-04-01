"""
V1 audit logging: reusable helper to record create/update/delete actions.
Only backend; no frontend UI. Call after successful write within the same transaction.

Parent-stream convention (admin timelines): log child changes under the same
entity_type/entity_id as the detail page (unit / tenant / owner) with namespaced
payloads (e.g. tenancy, tenancy_revenue, room, unit_cost). Extend the same
pattern for assignments, invoices, communications, and other sub-resources later.
"""
from datetime import date, datetime
from typing import Any, Optional

from sqlmodel import Session

from db.models import AuditLog, User


def _serialize_value(v: Any) -> Any:
    """Convert a single value to a JSON-serializable form."""
    if v is None:
        return None
    if isinstance(v, (str, int, float, bool)):
        return v
    if isinstance(v, datetime):
        return v.isoformat()
    if isinstance(v, date):
        return v.isoformat()
    if hasattr(v, "value"):  # Enum
        return v.value
    return str(v)


def model_snapshot(obj: Any) -> Optional[dict]:
    """
    Build a JSON-serializable snapshot of a SQLModel instance (table columns only).
    Returns None if obj is None. Used for old_values/new_values in audit logs.
    """
    if obj is None:
        return None
    out: dict = {}
    for key in obj.__class__.model_fields:
        try:
            v = getattr(obj, key, None)
            out[key] = _serialize_value(v)
        except Exception:
            continue
    return out


def create_audit_log(
    session: Session,
    actor_user_id: Optional[str],
    action: str,
    entity_type: str,
    entity_id: str,
    old_values: Optional[dict] = None,
    new_values: Optional[dict] = None,
    organization_id: Optional[str] = None,
) -> None:
    """
    Append one audit log row. Call after a successful create/update/delete within
    the same transaction so it commits with the write.
    - create: old_values=None, new_values=snapshot of created entity
    - update: old_values=before snapshot, new_values=after snapshot
    - delete: old_values=snapshot of deleted entity, new_values=None
    """
    org_id = organization_id
    if org_id is None and actor_user_id:
        actor = session.get(User, actor_user_id)
        org_id = getattr(actor, "organization_id", None) if actor else None
    if not org_id or not str(org_id).strip():
        raise ValueError(
            "create_audit_log requires organization_id or resolvable actor organization"
        )
    entry = AuditLog(
        organization_id=str(org_id).strip(),
        actor_user_id=actor_user_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        old_values=old_values,
        new_values=new_values,
    )
    session.add(entry)
