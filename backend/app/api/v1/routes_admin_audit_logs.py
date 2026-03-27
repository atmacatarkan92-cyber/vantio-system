"""
Admin audit log reads: timeline from audit_logs (org-scoped via parent entity).
"""

from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select

from auth.dependencies import get_current_organization, get_db_session, require_roles
from db.models import AuditLog, Tenant, Unit, User


router = APIRouter(prefix="/api/admin", tags=["admin-audit-logs"])


@router.get("/audit-logs")
def admin_list_audit_logs(
    entity_type: str = Query(..., description="e.g. unit"),
    entity_id: str = Query(..., description="Entity id"),
    limit: int = Query(200, ge=1, le=500),
    org_id: str = Depends(get_current_organization),
    _=Depends(require_roles("admin", "manager")),
    session: Session = Depends(get_db_session),
):
    """Return audit log rows for an entity; verifies organization via Unit or Tenant row."""
    if entity_type == "unit":
        unit = session.get(Unit, entity_id)
        if not unit or str(getattr(unit, "organization_id", "")) != org_id:
            raise HTTPException(status_code=404, detail="Unit not found")
    elif entity_type == "tenant":
        tenant = session.get(Tenant, entity_id)
        if not tenant or str(getattr(tenant, "organization_id", "")) != org_id:
            raise HTTPException(status_code=404, detail="Tenant not found")
    else:
        raise HTTPException(status_code=400, detail="entity_type must be unit or tenant")

    logs: List[AuditLog] = list(
        session.exec(
            select(AuditLog)
            .where(AuditLog.entity_type == entity_type)
            .where(AuditLog.entity_id == entity_id)
            .order_by(AuditLog.created_at.desc())
            .limit(limit)
        ).all()
    )

    actor_ids = {str(log.actor_user_id) for log in logs if log.actor_user_id}
    users_by_id: dict[str, User] = {}
    if actor_ids:
        id_list = list(actor_ids)
        users = session.exec(select(User).where(User.id.in_(id_list))).all()
        for u in users:
            users_by_id[str(u.id)] = u

    items: List[dict[str, Any]] = []
    for log in logs:
        actor: Optional[User] = (
            users_by_id.get(str(log.actor_user_id)) if log.actor_user_id else None
        )
        items.append(
            {
                "id": str(log.id),
                "action": log.action,
                "created_at": log.created_at.isoformat() if log.created_at else None,
                "actor_user_id": str(log.actor_user_id) if log.actor_user_id else None,
                "actor_email": getattr(actor, "email", None) if actor else None,
                "actor_name": getattr(actor, "full_name", None) if actor else None,
                "old_values": log.old_values,
                "new_values": log.new_values,
            }
        )

    return {"items": items}
