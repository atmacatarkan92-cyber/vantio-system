"""
Inventory catalog + assignments — org-scoped stock distributed across units/rooms.
Sum(assignment.quantity) must not exceed InventoryItem.total_quantity.
"""

from __future__ import annotations

import logging
from datetime import date, datetime
from typing import Any, Dict, List, Optional

from fastapi import HTTPException
from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, col, select

from db.models import InventoryAssignment, InventoryItem, Room, Unit

logger = logging.getLogger(__name__)


def _assert_org_item(session: Session, org_id: str, item_id: str) -> InventoryItem:
    row = session.get(InventoryItem, item_id)
    if not row or str(row.organization_id) != org_id:
        raise HTTPException(status_code=404, detail="Inventory item not found")
    return row


def _assert_unit_in_org(session: Session, org_id: str, unit_id: str) -> Unit:
    unit = session.get(Unit, unit_id)
    if not unit or str(getattr(unit, "organization_id", "")) != org_id:
        raise HTTPException(status_code=404, detail="Unit not found")
    return unit


def _assert_room_belongs_to_unit(session: Session, room_id: str, unit_id: str) -> Room:
    room = session.get(Room, room_id)
    if not room or str(room.unit_id) != str(unit_id):
        raise HTTPException(status_code=400, detail="Room does not belong to this unit")
    return room


def _assigned_sum(
    session: Session,
    item_id: str,
    *,
    exclude_assignment_id: Optional[str] = None,
) -> int:
    stmt = select(func.coalesce(func.sum(InventoryAssignment.quantity), 0)).where(
        InventoryAssignment.inventory_item_id == item_id
    )
    if exclude_assignment_id:
        stmt = stmt.where(InventoryAssignment.id != exclude_assignment_id)
    val = session.exec(stmt).one()
    return int(val or 0)


def _next_inventory_number(session: Session, org_id: str) -> str:
    year = datetime.utcnow().year
    prefix = f"INV-{year}-"
    rows = list(
        session.exec(
            select(InventoryItem.inventory_number).where(
                InventoryItem.organization_id == org_id,
                col(InventoryItem.inventory_number).like(f"{prefix}%"),
            )
        ).all()
    )
    max_seq = 0
    for num in rows:
        if not num:
            continue
        parts = str(num).split("-")
        if len(parts) >= 3:
            try:
                max_seq = max(max_seq, int(parts[-1]))
            except ValueError:
                continue
    return f"{prefix}{max_seq + 1:03d}"


def _item_to_dict(
    item: InventoryItem,
    *,
    assigned_total: Optional[int] = None,
    available: Optional[int] = None,
) -> Dict[str, Any]:
    out: Dict[str, Any] = {
        "id": str(item.id),
        "organization_id": str(item.organization_id),
        "inventory_number": item.inventory_number,
        "name": item.name,
        "category": item.category or "",
        "brand": item.brand,
        "total_quantity": int(item.total_quantity or 1),
        "condition": item.condition or "",
        "status": item.status or "active",
        "purchase_price_chf": item.purchase_price_chf,
        "purchase_date": item.purchase_date.isoformat() if item.purchase_date else None,
        "purchased_from": item.purchased_from,
        "notes": item.notes,
        "created_at": item.created_at.isoformat() if item.created_at else None,
        "updated_at": item.updated_at.isoformat() if item.updated_at else None,
    }
    if assigned_total is not None:
        out["assigned_total"] = int(assigned_total)
    if available is not None:
        out["available"] = int(available)
    return out


def _assignment_to_dict(
    a: InventoryAssignment,
    *,
    item: Optional[InventoryItem] = None,
    room_name: str = "",
) -> Dict[str, Any]:
    it = item
    return {
        "id": str(a.id),
        "organization_id": str(a.organization_id),
        "inventory_item_id": str(a.inventory_item_id),
        "unit_id": str(a.unit_id),
        "room_id": str(a.room_id) if a.room_id else None,
        "quantity": int(a.quantity or 0),
        "notes": a.notes,
        "created_at": a.created_at.isoformat() if a.created_at else None,
        "updated_at": a.updated_at.isoformat() if a.updated_at else None,
        "item_name": it.name if it else "",
        "item_category": (it.category or "") if it else "",
        "item_condition": (it.condition or "") if it else "",
        "item_status": (it.status or "") if it else "",
        "inventory_number": it.inventory_number if it else "",
        "room_name": room_name,
    }


def list_inventory_items(
    session: Session,
    org_id: str,
    *,
    skip: int = 0,
    limit: int = 50,
    q: Optional[str] = None,
    category: Optional[str] = None,
    status: Optional[str] = None,
) -> Dict[str, Any]:
    conditions = [InventoryItem.organization_id == org_id]
    if category and str(category).strip():
        conditions.append(InventoryItem.category == str(category).strip())
    if status and str(status).strip():
        conditions.append(InventoryItem.status == str(status).strip())
    if q and str(q).strip():
        term = f"%{str(q).strip()}%"
        conditions.append(
            or_(
                col(InventoryItem.name).ilike(term),
                col(InventoryItem.inventory_number).ilike(term),
                col(InventoryItem.brand).ilike(term),
            )
        )

    count_stmt = select(func.count()).select_from(InventoryItem).where(*conditions)
    _total_rows = session.exec(count_stmt).all()
    total = int(_total_rows[0]) if _total_rows else 0

    rows = list(
        session.exec(
            select(InventoryItem)
            .where(*conditions)
            .order_by(InventoryItem.inventory_number)
            .offset(skip)
            .limit(limit)
        ).all()
    )

    items_out: List[dict] = []
    for it in rows:
        at = _assigned_sum(session, str(it.id))
        tot = int(it.total_quantity or 1)
        av = max(0, tot - at)
        d = _item_to_dict(it, assigned_total=at, available=av)
        items_out.append(d)

    return {"items": items_out, "total": total, "skip": skip, "limit": limit}


def get_inventory_summary(session: Session, org_id: str) -> dict:
    items = list(
        session.exec(
            select(InventoryItem).where(InventoryItem.organization_id == org_id)
        ).all()
    )
    total_skus = len(items)
    total_pieces = sum(int(i.total_quantity or 1) for i in items)
    assigned = 0
    for i in items:
        assigned += _assigned_sum(session, str(i.id))
    available = max(0, total_pieces - assigned)
    return {
        "organization_id": org_id,
        "total_skus": total_skus,
        "total_pieces": total_pieces,
        "assigned_total": assigned,
        "available_total": available,
    }


def create_inventory_item(session: Session, org_id: str, body: Any) -> dict:
    name = str(getattr(body, "name", "") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="name is required")
    tq = int(getattr(body, "total_quantity", 1) or 1)
    if tq < 1:
        raise HTTPException(status_code=400, detail="total_quantity must be at least 1")

    pp = getattr(body, "purchase_price_chf", None)
    purchase_price_chf = float(pp) if pp is not None else None

    for _attempt in range(8):
        inv_num = _next_inventory_number(session, org_id)
        row = InventoryItem(
            organization_id=org_id,
            inventory_number=inv_num,
            name=name,
            category=str(getattr(body, "category", "") or "").strip(),
            brand=(str(getattr(body, "brand")).strip() if getattr(body, "brand", None) else None)
            or None,
            total_quantity=tq,
            condition=str(getattr(body, "condition", "") or "").strip(),
            status=str(getattr(body, "status", "active") or "active").strip() or "active",
            purchase_price_chf=purchase_price_chf,
            purchase_date=getattr(body, "purchase_date", None),
            purchased_from=(str(getattr(body, "purchased_from")).strip() if getattr(body, "purchased_from", None) else None)
            or None,
            notes=(str(getattr(body, "notes")).strip() if getattr(body, "notes", None) else None) or None,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        session.add(row)
        try:
            session.commit()
            session.refresh(row)
            at = _assigned_sum(session, str(row.id))
            tot = int(row.total_quantity or 1)
            return _item_to_dict(row, assigned_total=at, available=max(0, tot - at))
        except IntegrityError:
            session.rollback()
            logger.warning("inventory_number collision, retrying")
            continue
    raise HTTPException(status_code=500, detail="Could not allocate inventory number")


def update_inventory_item(session: Session, org_id: str, item_id: str, body: Any) -> dict:
    row = _assert_org_item(session, org_id, item_id)
    data = body.model_dump(exclude_unset=True) if hasattr(body, "model_dump") else {}
    if not data:
        at = _assigned_sum(session, item_id)
        tot = int(row.total_quantity or 1)
        return _item_to_dict(row, assigned_total=at, available=max(0, tot - at))

    if "total_quantity" in data and data["total_quantity"] is not None:
        nq = int(data["total_quantity"])
        if nq < 1:
            raise HTTPException(status_code=400, detail="total_quantity must be at least 1")
        assigned = _assigned_sum(session, item_id)
        if nq < assigned:
            raise HTTPException(
                status_code=400,
                detail=f"total_quantity ({nq}) cannot be less than assigned quantity ({assigned})",
            )
        row.total_quantity = nq

    if "name" in data and data["name"] is not None:
        n = str(data["name"]).strip()
        if not n:
            raise HTTPException(status_code=400, detail="name must not be empty")
        row.name = n
    if "category" in data and data["category"] is not None:
        row.category = str(data["category"]).strip()
    if "brand" in data:
        row.brand = (
            str(data["brand"]).strip() if data.get("brand") not in (None, "") else None
        )
    if "condition" in data and data["condition"] is not None:
        row.condition = str(data["condition"]).strip()
    if "status" in data and data["status"] is not None:
        row.status = str(data["status"]).strip() or "active"
    if "purchase_price_chf" in data:
        v = data["purchase_price_chf"]
        row.purchase_price_chf = float(v) if v is not None else None
    if "purchase_date" in data:
        row.purchase_date = data["purchase_date"]
    if "purchased_from" in data:
        pv = data["purchased_from"]
        row.purchased_from = str(pv).strip() if pv not in (None, "") else None
    if "notes" in data:
        nv = data["notes"]
        row.notes = str(nv).strip() if nv not in (None, "") else None

    row.updated_at = datetime.utcnow()
    session.add(row)
    session.commit()
    session.refresh(row)
    at = _assigned_sum(session, item_id)
    tot = int(row.total_quantity or 1)
    return _item_to_dict(row, assigned_total=at, available=max(0, tot - at))


def delete_inventory_item(session: Session, org_id: str, item_id: str) -> dict:
    row = _assert_org_item(session, org_id, item_id)
    session.delete(row)
    session.commit()
    return {"status": "ok"}


def list_assignments_for_item(session: Session, org_id: str, item_id: str) -> List[dict]:
    item = _assert_org_item(session, org_id, item_id)
    assigns = list(
        session.exec(
            select(InventoryAssignment)
            .where(
                InventoryAssignment.organization_id == org_id,
                InventoryAssignment.inventory_item_id == str(item.id),
            )
            .order_by(InventoryAssignment.created_at)
        ).all()
    )
    out: List[dict] = []
    for a in assigns:
        rn = ""
        if a.room_id:
            r = session.get(Room, a.room_id)
            rn = r.name if r else ""
        out.append(_assignment_to_dict(a, item=item, room_name=rn))
    return out


def list_assignments_for_unit(session: Session, org_id: str, unit_id: str) -> List[dict]:
    _assert_unit_in_org(session, org_id, unit_id)
    assigns = list(
        session.exec(
            select(InventoryAssignment)
            .where(
                InventoryAssignment.organization_id == org_id,
                InventoryAssignment.unit_id == unit_id,
            )
            .order_by(InventoryAssignment.created_at)
        ).all()
    )
    out: List[dict] = []
    for a in assigns:
        item = session.get(InventoryItem, a.inventory_item_id)
        if not item:
            continue
        rn = ""
        if a.room_id:
            r = session.get(Room, a.room_id)
            rn = r.name if r else ""
        d = _assignment_to_dict(a, item=item, room_name=rn)
        tot = int(item.total_quantity or 1)
        at = _assigned_sum(session, str(item.id))
        d["item_total_quantity"] = tot
        d["item_assigned_total"] = at
        d["item_available"] = max(0, tot - at)
        out.append(d)
    return out


def create_assignment(session: Session, org_id: str, item_id: str, body: Any) -> dict:
    item = _assert_org_item(session, org_id, item_id)
    uid = str(getattr(body, "unit_id", "") or "").strip()
    if not uid:
        raise HTTPException(status_code=400, detail="unit_id is required")
    unit = _assert_unit_in_org(session, org_id, uid)
    if str(unit.organization_id) != str(item.organization_id):
        raise HTTPException(status_code=400, detail="Unit and inventory item organization mismatch")

    room_id = getattr(body, "room_id", None)
    if room_id:
        _assert_room_belongs_to_unit(session, str(room_id), uid)

    qty = int(getattr(body, "quantity", 0) or 0)
    if qty < 1:
        raise HTTPException(status_code=400, detail="quantity must be at least 1")

    current = _assigned_sum(session, str(item.id))
    if current + qty > int(item.total_quantity or 1):
        raise HTTPException(
            status_code=400,
            detail=(
                f"Insufficient stock: assigned {current} + {qty} exceeds "
                f"total_quantity {item.total_quantity}"
            ),
        )

    row = InventoryAssignment(
        organization_id=org_id,
        inventory_item_id=str(item.id),
        unit_id=uid,
        room_id=str(room_id) if room_id else None,
        quantity=qty,
        notes=(str(getattr(body, "notes")).strip() if getattr(body, "notes", None) else None) or None,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    session.add(row)
    try:
        session.commit()
        session.refresh(row)
    except IntegrityError as e:
        session.rollback()
        logger.warning("assignment unique or fk failed: %s", e)
        raise HTTPException(
            status_code=400,
            detail="Duplicate assignment for this item, unit and room, or invalid reference",
        ) from None

    rn = ""
    if row.room_id:
        r = session.get(Room, row.room_id)
        rn = r.name if r else ""
    return _assignment_to_dict(row, item=item, room_name=rn)


def _get_assignment_org(session: Session, org_id: str, assignment_id: str) -> InventoryAssignment:
    row = session.get(InventoryAssignment, assignment_id)
    if not row or str(row.organization_id) != org_id:
        raise HTTPException(status_code=404, detail="Assignment not found")
    return row


def update_assignment(session: Session, org_id: str, assignment_id: str, body: Any) -> dict:
    a = _get_assignment_org(session, org_id, assignment_id)
    item = _assert_org_item(session, org_id, str(a.inventory_item_id))
    data = body.model_dump(exclude_unset=True) if hasattr(body, "model_dump") else {}
    if not data:
        rn = ""
        if a.room_id:
            r = session.get(Room, a.room_id)
            rn = r.name if r else ""
        return _assignment_to_dict(a, item=item, room_name=rn)

    new_unit_id = str(a.unit_id)
    new_room_id = a.room_id
    new_qty = int(a.quantity or 1)

    if "unit_id" in data and data["unit_id"] is not None:
        new_unit_id = str(data["unit_id"]).strip()
        if not new_unit_id:
            raise HTTPException(status_code=400, detail="unit_id must not be empty")
        u = _assert_unit_in_org(session, org_id, new_unit_id)
        if str(u.organization_id) != str(item.organization_id):
            raise HTTPException(status_code=400, detail="Unit organization mismatch")

    if "room_id" in data:
        rid = data["room_id"]
        if rid is None or rid == "":
            new_room_id = None
        else:
            _assert_room_belongs_to_unit(session, str(rid), new_unit_id)
            new_room_id = str(rid)

    if "quantity" in data and data["quantity"] is not None:
        new_qty = int(data["quantity"])
        if new_qty < 1:
            raise HTTPException(status_code=400, detail="quantity must be at least 1")

    if new_room_id:
        _assert_room_belongs_to_unit(session, str(new_room_id), new_unit_id)

    # Capacity check excluding this assignment
    other = _assigned_sum(session, str(item.id), exclude_assignment_id=str(a.id))
    if other + new_qty > int(item.total_quantity or 1):
        raise HTTPException(
            status_code=400,
            detail=(
                f"Insufficient stock: other assignments {other} + {new_qty} exceeds "
                f"total_quantity {item.total_quantity}"
            ),
        )

    if "notes" in data:
        nv = data["notes"]
        a.notes = str(nv).strip() if nv not in (None, "") else None

    a.unit_id = new_unit_id
    a.room_id = new_room_id
    a.quantity = new_qty
    a.updated_at = datetime.utcnow()
    session.add(a)
    try:
        session.commit()
        session.refresh(a)
    except IntegrityError:
        session.rollback()
        raise HTTPException(
            status_code=400,
            detail="Duplicate assignment for this item, unit and room, or invalid reference",
        ) from None

    item = session.get(InventoryItem, a.inventory_item_id)
    rn = ""
    if a.room_id:
        r = session.get(Room, a.room_id)
        rn = r.name if r else ""
    return _assignment_to_dict(a, item=item, room_name=rn)


def delete_assignment(session: Session, org_id: str, assignment_id: str) -> dict:
    a = _get_assignment_org(session, org_id, assignment_id)
    session.delete(a)
    session.commit()
    return {"status": "ok"}
