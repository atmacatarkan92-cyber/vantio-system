"""
Single source for tenancy end / display interpretation (admin UI, APIs, overlap helpers).

Stored TenancyStatus enum is unchanged; display_status is derived for presentation.
move_out_date is kept in sync with scheduling end for PostgreSQL unit exclusion + legacy code.
"""

from __future__ import annotations

from datetime import date
from typing import TYPE_CHECKING, Optional

if TYPE_CHECKING:
    from db.models import Tenancy


def tenancy_display_end_date(t: "Tenancy") -> Optional[date]:
    """User-facing Mietende / Auszug: actual, then contractual effective, then legacy move_out."""
    act = getattr(t, "actual_move_out_date", None)
    te = getattr(t, "termination_effective_date", None)
    mo = getattr(t, "move_out_date", None)
    return act or te or mo


def scheduling_end_date_from_parts(
    move_out: Optional[date],
    termination_effective_date: Optional[date],
    actual_move_out_date: Optional[date],
) -> Optional[date]:
    """
    Inclusive last day for occupancy / overlap / DB move_out sync.
    Contract end = max(termination_effective, move_out) when both set; combined with actual via max.
    """
    parts = [d for d in (termination_effective_date, move_out) if d is not None]
    contract = max(parts) if parts else None
    act = actual_move_out_date
    if act is not None:
        if contract is not None:
            return max(contract, act)
        return act
    return contract


def tenancy_scheduling_end_date(t: "Tenancy") -> Optional[date]:
    return scheduling_end_date_from_parts(
        getattr(t, "move_out_date", None),
        getattr(t, "termination_effective_date", None),
        getattr(t, "actual_move_out_date", None),
    )


def sync_tenancy_move_out_date(t: "Tenancy") -> None:
    """Set move_out_date to scheduling end so PG unit exclusion + legacy readers stay consistent."""
    t.move_out_date = tenancy_scheduling_end_date(t)


def tenancy_derived_display_status(t: "Tenancy", today: Optional[date] = None) -> str:
    """
    Machine keys for admin UI: active | reserved | notice_given | ended.
    Does not replace stored TenancyStatus; complements it for badges.
    """
    from db.models import TenancyStatus

    today = today or date.today()
    act = getattr(t, "actual_move_out_date", None)
    te = getattr(t, "termination_effective_date", None)
    mo = getattr(t, "move_out_date", None)
    mi = getattr(t, "move_in_date", None)

    if act is not None and act < today:
        return "ended"
    if te is not None and te >= today:
        return "notice_given"
    if te is not None and te < today and (act is None or act >= today):
        return "notice_given"
    if act is None and te is None and mo is not None and mo < today:
        return "ended"
    if mi is not None and mi > today:
        return "reserved"
    if getattr(t, "status", None) == TenancyStatus.reserved:
        return "reserved"
    if mi is not None:
        if getattr(t, "status", None) == TenancyStatus.ended:
            return "ended"
        return "active"
    if getattr(t, "status", None) == TenancyStatus.ended:
        return "ended"
    return "active"
