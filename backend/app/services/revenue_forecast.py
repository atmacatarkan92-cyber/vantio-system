"""
Revenue forecast: expected monthly revenue from tenancies.
"""

from calendar import monthrange
from datetime import date
from typing import Optional

from sqlmodel import select

from db.models import Tenancy, TenancyStatus, Room


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
    tenancies_by_room_id: dict[str, list[Tenancy]] = {}
    for t in overlapping_tenancies:
        tenancies_by_room_id.setdefault(str(t.room_id), []).append(t)

    for r in rooms:
        room_id = str(r.id)
        found = False
        for t in tenancies_by_room_id.get(room_id, []):
            move_out = t.move_out_date or date(9999, 12, 31)
            if t.move_in_date <= last and move_out >= first:
                start = max(first, t.move_in_date)
                end = min(last, move_out)
                days = (end - start).days + 1
                days_in_month = (last - first).days + 1
                expected_revenue += float(t.rent_chf) * (days / days_in_month)
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
