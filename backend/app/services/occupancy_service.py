"""
Occupancy engine: room status and unit occupancy from tenancies.
"""

from datetime import date
from typing import Optional, List, Dict, Any

from sqlmodel import select

from db.models import Tenancy, TenancyStatus, Room, Tenant


def get_room_status(session, room_id: str, on_date: Optional[date] = None) -> str:
    """
    Returns: "occupied" | "reserved" | "free"
    - occupied: tenancy status==active and on_date between move_in_date and move_out_date (or no move_out)
    - reserved: tenancy status==reserved and move_in_date in future (or on_date before move_in)
    - free: otherwise
    """
    today = on_date or date.today()
    q = (
        select(Tenancy)
        .where(Tenancy.room_id == room_id)
        .where(Tenancy.status.in_([TenancyStatus.active, TenancyStatus.reserved]))
        .order_by(Tenancy.move_in_date.desc())
    )
    for t in session.exec(q).all():
        move_out = t.move_out_date or date(9999, 12, 31)
        if t.status == TenancyStatus.active and t.move_in_date <= today <= move_out:
            return "occupied"
        if t.status == TenancyStatus.reserved and today < t.move_in_date:
            return "reserved"
        if t.status == TenancyStatus.reserved and t.move_in_date <= today <= move_out:
            return "occupied"
    return "free"


def _status_from_tenancies(tenancies: List[Tenancy], today: date) -> str:
    """
    Mirrors `get_room_status` semantics, but takes already-fetched tenancies.
    This avoids querying by Tenancy.room_id using a potentially incompatible ID type.
    """
    for t in tenancies:
        move_out = t.move_out_date or date(9999, 12, 31)
        if t.status == TenancyStatus.active and t.move_in_date <= today <= move_out:
            return "occupied"
        if t.status == TenancyStatus.reserved and today < t.move_in_date:
            return "reserved"
        if t.status == TenancyStatus.reserved and t.move_in_date <= today <= move_out:
            return "occupied"
    return "free"


def get_unit_occupancy(session, unit_id: str, on_date: Optional[date] = None) -> dict:
    """
    Returns: total_rooms, occupied_rooms, reserved_rooms, free_rooms, occupancy_rate (0-100).
    """
    today = on_date or date.today()
    rooms = list(
        session.exec(
            select(Room)
            .where(Room.unit_id == unit_id)
            .where(Room.is_active == True)
        ).all()
    )
    total_rooms = len(rooms)
    occupied_rooms = 0
    reserved_rooms = 0

    # Fetch tenancies once for the unit and compute per-room status in Python.
    # This avoids the failing query shape: Tenancy.room_id == "<uuid>" when the DB column
    # is an integer (UUID/string vs integer mismatch).
    unit_tenancies = list(
        session.exec(
            select(Tenancy)
            .where(Tenancy.unit_id == unit_id)
            .where(
                Tenancy.status.in_([TenancyStatus.active, TenancyStatus.reserved])
            )
            .order_by(Tenancy.move_in_date.desc())
        ).all()
    )
    tenancies_by_room_id: Dict[str, List[Tenancy]] = {}
    for t in unit_tenancies:
        tenancies_by_room_id.setdefault(str(t.room_id), []).append(t)

    for r in rooms:
        room_id = str(r.id)
        status = _status_from_tenancies(tenancies_by_room_id.get(room_id, []), today)
        if status == "occupied":
            occupied_rooms += 1
        elif status == "reserved":
            reserved_rooms += 1
    free_rooms = total_rooms - occupied_rooms - reserved_rooms
    occupancy_rate = (occupied_rooms / total_rooms * 100) if total_rooms else 0.0
    return {
        "unit_id": unit_id,
        "on_date": today.isoformat(),
        "total_rooms": total_rooms,
        "occupied_rooms": occupied_rooms,
        "reserved_rooms": reserved_rooms,
        "free_rooms": free_rooms,
        "occupancy_rate": round(occupancy_rate, 1),
    }


def _get_tenant_name_and_rent(session, room_id: str, on_date: date) -> tuple:
    """Return (tenant_name, rent_chf) for the tenancy covering this room on on_date, or (None, None)."""
    today = on_date
    q = (
        select(Tenancy, Tenant)
        .join(Tenant, Tenancy.tenant_id == Tenant.id)
        .where(Tenancy.room_id == room_id)
        .where(Tenancy.status.in_([TenancyStatus.active, TenancyStatus.reserved]))
        .order_by(Tenancy.move_in_date.desc())
    )
    for row in session.exec(q).all():
        t, tenant = row[0], row[1]
        move_out = t.move_out_date or date(9999, 12, 31)
        if t.move_in_date <= today <= move_out:
            return (getattr(tenant, "name", None) or None, float(t.rent_chf or 0))
    return (None, None)


def get_unit_rooms_occupancy(
    session, unit_id: str, on_date: Optional[date] = None
) -> List[Dict[str, Any]]:
    """
    Per-room occupancy for a unit: room_id, room_name, status (occupied|reserved|free), tenant_name?, rent?.
    """
    today = on_date or date.today()
    rooms = list(
        session.exec(
            select(Room)
            .where(Room.unit_id == unit_id)
            .where(Room.is_active == True)
        ).all()
    )
    result = []

    # Prefetch all tenancies (and their tenant rows) for this unit once.
    # We then compute per-room status and tenant_name/rent in Python.
    tenancy_rows = list(
        session.exec(
            select(Tenancy, Tenant)
            .join(Tenant, Tenancy.tenant_id == Tenant.id)
            .where(Tenancy.unit_id == unit_id)
            .where(
                Tenancy.status.in_([TenancyStatus.active, TenancyStatus.reserved])
            )
            .order_by(Tenancy.move_in_date.desc())
        ).all()
    )
    tenancy_rows_by_room_id: Dict[str, List[tuple]] = {}
    for t, tenant in tenancy_rows:
        tenancy_rows_by_room_id.setdefault(str(t.room_id), []).append((t, tenant))

    for r in rooms:
        room_id = str(r.id)

        room_tenancy_rows = tenancy_rows_by_room_id.get(room_id, [])
        status = _status_from_tenancies(
            [row[0] for row in room_tenancy_rows],
            today,
        )

        tenant_name = None
        rent = None
        for t, tenant in room_tenancy_rows:
            move_out = t.move_out_date or date(9999, 12, 31)
            if t.move_in_date <= today <= move_out:
                tenant_name = getattr(tenant, "name", None) or None
                rent = float(t.rent_chf or 0)
                break

        result.append({
            "room_id": room_id,
            "room_name": r.name or f"Room {room_id[:8]}",
            "status": status,
            "tenant_name": tenant_name,
            "rent": round(rent, 2) if rent is not None else None,
            "price": getattr(r, "price", None),
        })
    return result
