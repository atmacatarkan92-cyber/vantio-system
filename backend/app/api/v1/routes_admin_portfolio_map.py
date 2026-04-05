"""
Admin portfolio map V1: read-only unit markers from property coordinates + map status.
"""

from __future__ import annotations

from datetime import date
from typing import Any, Optional

from fastapi import APIRouter, Depends, Query

from auth.dependencies import get_current_organization, get_db_session, require_roles
from app.services.portfolio_map_service import build_portfolio_map_payload

router = APIRouter(prefix="/api/admin", tags=["admin-portfolio-map"])


@router.get("/portfolio-map", response_model=dict)
def admin_portfolio_map(
    org_id: str = Depends(get_current_organization),
    _=Depends(require_roles("admin", "manager")),
    session=Depends(get_db_session),
    business_apartments_only: bool = Query(
        False,
        description="If true, only Apartment / Business Apartment units (dashboard scope).",
    ),
    as_of: Optional[date] = Query(None, description="Override current date for status logic (optional)."),
) -> dict[str, Any]:
    """Operational map data: one row per unit; coordinates only from linked property lat/lng."""
    payload = build_portfolio_map_payload(
        session,
        org_id,
        business_apartments_only=business_apartments_only,
        today=as_of,
    )
    return payload
