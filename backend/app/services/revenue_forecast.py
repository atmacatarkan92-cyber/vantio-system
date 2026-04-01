"""
Revenue forecast: expected monthly revenue from tenancies.
"""

from calendar import monthrange
from datetime import date
from typing import Optional

from sqlmodel import select

from db.models import Tenancy, TenancyRevenue, TenancyStatus, Room


def calculate_monthly_revenue(session, unit_id: str, year: int, month: int) -> dict:
    """
    For the given unit and month, compute expected revenue and room counts
    based on tenancies (active/reserved) that overlap that month.
    """
    first = date(year, month, 1)
    _, last_day = monthrange(year, month)
    last = date(year, month, last_day)

    rooms = list(session.exec(select(Room).where(Room.unit_id == unit_id).where(Room.is_active == True)).all())
    total_rooms = len(rooms)
    expected_revenue = 0.0
    occupied_rooms = 0
    vacant_rooms = 0
    days_in_month = (last - first).days + 1

    # Fetch tenancies once for the unit and compute per-room results in Python.
    # This avoids the failing query shape `Tenancy.room_id == "<uuid>"` when
    # the DB column type is integer (UUID/string vs integer mismatch).
    overlapping_tenancies = list(
        session.exec(
            select(Tenancy)
            .where(Tenancy.unit_id == unit_id)
            .where(
                Tenancy.status.in_([TenancyStatus.active, TenancyStatus.reserved])
            )
            .where(Tenancy.move_in_date <= last)
            .where((Tenancy.move_out_date == None) | (Tenancy.move_out_date >= first))
        ).all()
    )

    ten_ids = [str(t.id) for t in overlapping_tenancies]
    revenue_rows = (
        list(
            session.exec(
                select(TenancyRevenue).where(TenancyRevenue.tenancy_id.in_(ten_ids))
            ).all()
        )
        if ten_ids
        else []
    )
    rev_by_tenancy_id: dict[str, list[TenancyRevenue]] = {}
    for rr in revenue_rows:
        rev_by_tenancy_id.setdefault(str(rr.tenancy_id), []).append(rr)

    def _monthly_equiv(freq: str, amount: float) -> float:
        f = str(freq or "monthly").strip().lower()
        if f == "monthly":
            return amount
        if f == "yearly":
            return amount / 12.0
        return 0.0

    def _days_overlap(a_start: date, a_end: date, b_start: date, b_end: date) -> int:
        start = max(a_start, b_start)
        end = min(a_end, b_end)
        if end < start:
            return 0
        return (end - start).days + 1
    tenancies_by_room_id: dict[str, list[Tenancy]] = {}
    for t in overlapping_tenancies:
        tenancies_by_room_id.setdefault(str(t.room_id), []).append(t)

    for r in rooms:
        room_id = str(r.id)
        found = False
        for t in tenancies_by_room_id.get(room_id, []):
            move_out = t.move_out_date or date(9999, 12, 31)
            if t.move_in_date <= last and move_out >= first:
                base_start = max(first, t.move_in_date)
                base_end = min(last, move_out)

                tid = str(t.id)
                rows = rev_by_tenancy_id.get(tid, [])
                added = 0.0
                for rr in rows:
                    freq = str(getattr(rr, "frequency", None) or "monthly").strip().lower()
                    if freq == "one_time":
                        continue
                    amt = float(getattr(rr, "amount_chf", 0) or 0)
                    rs = getattr(rr, "start_date", None) or base_start
                    re = getattr(rr, "end_date", None) or base_end
                    ds = _days_overlap(base_start, base_end, rs, re)
                    if ds <= 0:
                        continue
                    added += _monthly_equiv(freq, amt) * (ds / days_in_month)

                expected_revenue += added
                occupied_rooms += 1
                found = True
                break
        if not found:
            vacant_rooms += 1

    return {
        "unit_id": unit_id,
        "year": year,
        "month": month,
        "expected_revenue": round(expected_revenue, 2),
        "occupied_rooms": occupied_rooms,
        "vacant_rooms": vacant_rooms,
        "total_rooms": total_rooms,
    }
