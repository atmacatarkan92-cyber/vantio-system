"""
Portfolio map V1: unit-level map status + property coordinates only (no geocoding).

Map status precedence (single winner per unit):
1. landlord_ended
2. notice (tenancy_derived_display_status == notice_given on any tenancy)
3. occupied (physical occupancy today via tenancy dates)
4. vacant
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date
from typing import Any, Dict, List, Optional, Tuple

from sqlmodel import Session, select

from db.models import Property, Tenancy, TenancyStatus, Unit
from app.services.tenancy_lifecycle import (
    tenancy_derived_display_status,
    tenancy_scheduling_end_date,
)


MAP_STATUS_LABELS_DE: Dict[str, str] = {
    "occupied": "Belegt",
    "vacant": "Leerstand",
    "notice": "Gekündigt",
    "landlord_ended": "Vertrag beendet",
}


def _is_business_apartment_unit(u: Unit) -> bool:
    t = (getattr(u, "type", None) or "").strip()
    return t in ("Apartment", "Business Apartment")


def unit_is_landlord_ended(u: Unit, today: date) -> bool:
    """Portfolio / landlord contract ended — safest stored signals only."""
    ls = (getattr(u, "lease_status", None) or "").strip().casefold()
    if ls == "ended":
        return True
    rtd = getattr(u, "returned_to_landlord_date", None)
    if rtd is not None and rtd <= today:
        return True
    return False


def tenancy_has_physical_occupancy_today(t: Tenancy, today: date) -> bool:
    """
    True if the tenancy represents someone in the unit today (move-in reached, scheduling end not passed).
    Aligns with occupancy_service date window semantics.
    """
    if t.status == TenancyStatus.ended:
        return False
    ds = tenancy_derived_display_status(t, today)
    if ds == "ended":
        return False
    if t.move_in_date > today:
        return False
    if ds == "reserved" and t.move_in_date > today:
        return False
    end = tenancy_scheduling_end_date(t)
    if end is not None and today > end:
        return False
    # Active living window: active, notice_given (still in), or reserved with move-in reached
    if ds in ("active", "notice_given"):
        return True
    if ds == "reserved" and t.move_in_date <= today:
        return True
    return False


def compute_unit_map_status(unit: Unit, tenancies: List[Tenancy], today: date) -> str:
    """
    Returns: occupied | vacant | notice | landlord_ended
    """
    if unit_is_landlord_ended(unit, today):
        return "landlord_ended"

    for t in tenancies:
        if tenancy_derived_display_status(t, today) == "notice_given":
            return "notice"

    for t in tenancies:
        if tenancy_has_physical_occupancy_today(t, today):
            return "occupied"

    return "vacant"


def _property_coords(prop: Optional[Property]) -> Tuple[Optional[float], Optional[float]]:
    if prop is None:
        return None, None
    lat = getattr(prop, "lat", None)
    lng = getattr(prop, "lng", None)
    if lat is None or lng is None:
        return None, None
    try:
        la = float(lat)
        lo = float(lng)
    except (TypeError, ValueError):
        return None, None
    return la, lo


def build_portfolio_map_payload(
    session: Session,
    org_id: str,
    *,
    business_apartments_only: bool = False,
    today: Optional[date] = None,
) -> Dict[str, Any]:
    """
    Read-only aggregate for GET /api/admin/portfolio-map.
    """
    today = today or date.today()

    units = list(
        session.exec(select(Unit).where(Unit.organization_id == org_id)).all()
    )
    if business_apartments_only:
        units = [u for u in units if _is_business_apartment_unit(u)]

    prop_ids = [str(u.property_id) for u in units if getattr(u, "property_id", None)]
    properties_by_id: Dict[str, Property] = {}
    if prop_ids:
        props = session.exec(select(Property).where(Property.id.in_(prop_ids))).all()
        properties_by_id = {str(p.id): p for p in props}

    tenancy_rows = list(
        session.exec(
            select(Tenancy).where(Tenancy.organization_id == org_id)
        ).all()
    )
    by_unit: Dict[str, List[Tenancy]] = defaultdict(list)
    for t in tenancy_rows:
        by_unit[str(t.unit_id)].append(t)

    items: List[Dict[str, Any]] = []
    summary_status = {"occupied": 0, "vacant": 0, "notice": 0, "landlord_ended": 0}
    plotted = 0
    missing_coord = 0

    for u in units:
        uid = str(u.id)
        ut_list = by_unit.get(uid, [])
        mstatus = compute_unit_map_status(u, ut_list, today)
        summary_status[mstatus] = summary_status.get(mstatus, 0) + 1

        prop = properties_by_id.get(str(u.property_id)) if u.property_id else None
        lat, lng = _property_coords(prop)
        has_coords = lat is not None and lng is not None
        if has_coords:
            plotted += 1
        else:
            missing_coord += 1

        sid = getattr(u, "short_unit_id", None) or ""
        items.append(
            {
                "unit_id": uid,
                "short_unit_id": sid,
                "title": getattr(u, "title", "") or "",
                "address": getattr(u, "address", "") or "",
                "postal_code": getattr(u, "postal_code", None) or "",
                "city": getattr(u, "city", "") or "",
                "latitude": lat,
                "longitude": lng,
                "has_coordinates": has_coords,
                "coordinate_source": "property" if has_coords else "none",
                "map_status": mstatus,
                "map_status_label": MAP_STATUS_LABELS_DE.get(mstatus, mstatus),
            }
        )

    total = len(units)
    return {
        "items": items,
        "summary": {
            "total_units": total,
            "plotted_units": plotted,
            "missing_coordinates": missing_coord,
            "occupied": summary_status["occupied"],
            "vacant": summary_status["vacant"],
            "notice": summary_status["notice"],
            "landlord_ended": summary_status["landlord_ended"],
        },
    }
