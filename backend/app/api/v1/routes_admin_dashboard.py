"""
Admin dashboard: occupancy and revenue forecast aggregates.
Protected by require_roles("admin", "manager").
"""

from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text

from db.database import get_session
from db.models import Unit
from sqlmodel import select
from auth.dependencies import require_roles

from app.services.occupancy_service import get_unit_occupancy, get_unit_rooms_occupancy
from app.services.revenue_forecast import calculate_monthly_revenue
from app.services.profit_service import calculate_unit_profit
from app.services.kpi_service import compute_kpis


router = APIRouter(prefix="/api/admin", tags=["admin-dashboard"])


@router.get("/occupancy")
def admin_get_occupancy(
    unit_id: Optional[str] = Query(None, description="Filter by unit"),
    on_date: Optional[str] = Query(None, description="Date YYYY-MM-DD; default today"),
    _=Depends(require_roles("admin", "manager")),
):
    """
    Aggregated occupancy for dashboard: per-unit and global.
    Returns list of unit occupancy + summary totals.
    """
    session = get_session()
    try:
        day = date.today()
        if on_date:
            try:
                day = date.fromisoformat(on_date)
            except ValueError:
                day = date.today()
        q = select(Unit).order_by(Unit.title)
        if unit_id:
            q = q.where(Unit.id == unit_id)
        units = list(session.exec(q).all())
        results = []
        total_rooms = 0
        total_occupied = 0
        total_reserved = 0
        total_free = 0
        for u in units:
            occ = get_unit_occupancy(session, str(u.id), day)
            results.append(occ)
            total_rooms += occ["total_rooms"]
            total_occupied += occ["occupied_rooms"]
            total_reserved += occ["reserved_rooms"]
            total_free += occ["free_rooms"]
        overall_rate = (total_occupied / total_rooms * 100) if total_rooms else 0.0
        return {
            "on_date": day.isoformat(),
            "units": results,
            "summary": {
                "total_rooms": total_rooms,
                "occupied_rooms": total_occupied,
                "reserved_rooms": total_reserved,
                "free_rooms": total_free,
                "occupancy_rate": round(overall_rate, 1),
            },
        }
    finally:
        session.close()


@router.get("/occupancy/rooms")
def admin_get_occupancy_rooms(
    unit_id: Optional[str] = Query(..., description="Unit ID"),
    on_date: Optional[str] = Query(None, description="Date YYYY-MM-DD; default today"),
    _=Depends(require_roles("admin", "manager")),
):
    """
    Per-room occupancy for a unit: room_id, room_name, status (occupied|reserved|free), tenant_name?, rent?.
    For use with OccupancyMap component.
    """
    session = get_session()
    try:
        day = date.today()
        if on_date:
            try:
                day = date.fromisoformat(on_date)
            except ValueError:
                day = date.today()
        rooms_occupancy = get_unit_rooms_occupancy(session, unit_id, day)
        return {
            "unit_id": unit_id,
            "on_date": day.isoformat(),
            "rooms": rooms_occupancy,
        }
    finally:
        session.close()


@router.get("/revenue-forecast")
def admin_get_revenue_forecast(
    unit_id: Optional[str] = Query(None, description="Filter by unit"),
    year: Optional[int] = Query(None, description="Year; default current year"),
    month: Optional[int] = Query(None, description="Month (1-12); if omitted, entire year"),
    _=Depends(require_roles("admin", "manager")),
):
    """
    Revenue forecast for dashboard: expected revenue and room counts per unit (and optionally per month).
    """
    session = get_session()
    try:
        y = year or date.today().year
        q = select(Unit).order_by(Unit.title)
        if unit_id:
            q = q.where(Unit.id == unit_id)
        units = list(session.exec(q).all())
        if month is not None:
            results = []
            total_revenue = 0.0
            total_occupied = 0
            total_vacant = 0
            for u in units:
                rec = calculate_monthly_revenue(session, str(u.id), y, month)
                results.append(rec)
                total_revenue += rec["expected_revenue"]
                total_occupied += rec["occupied_rooms"]
                total_vacant += rec["vacant_rooms"]
            return {
                "year": y,
                "month": month,
                "units": results,
                "summary": {
                    "expected_revenue": round(total_revenue, 2),
                    "occupied_rooms": total_occupied,
                    "vacant_rooms": total_vacant,
                },
            }
        # Full year: all 12 months
        months_data = []
        for m in range(1, 13):
            month_revenue = 0.0
            for u in units:
                rec = calculate_monthly_revenue(session, str(u.id), y, m)
                month_revenue += rec["expected_revenue"]
            months_data.append({"year": y, "month": m, "expected_revenue": round(month_revenue, 2)})
        total_year = sum(m["expected_revenue"] for m in months_data)
        return {
            "year": y,
            "by_month": months_data,
            "total_expected_revenue": round(total_year, 2),
        }
    finally:
        session.close()


@router.get("/profit")
def admin_get_profit(
    unit_id: Optional[str] = Query(None, description="Filter by unit; if omitted, all units"),
    year: Optional[int] = Query(None, description="Year; default current year"),
    month: Optional[int] = Query(None, description="Month (1-12); default current month"),
    _=Depends(require_roles("admin", "manager")),
):
    """
    Profit per unit for a given month: revenue (from tenancies) minus costs (from unit_costs).
    Returns list of { unit_id, year, month, revenue, costs, profit } plus summary.
    """
    session = get_session()
    try:
        today = date.today()
        y = year if year is not None else today.year
        m = month if month is not None else today.month
        if not (1 <= m <= 12):
            m = today.month
        q = select(Unit).order_by(Unit.title)
        if unit_id:
            q = q.where(Unit.id == unit_id)
        units = list(session.exec(q).all())
        results = []
        total_revenue = 0.0
        total_costs = 0.0
        total_profit = 0.0
        for u in units:
            rec = calculate_unit_profit(session, str(u.id), y, m)
            results.append(rec)
            total_revenue += rec["revenue"]
            total_costs += rec["costs"]
            total_profit += rec["profit"]
        return {
            "year": y,
            "month": m,
            "units": results,
            "summary": {
                "total_revenue": round(total_revenue, 2),
                "total_costs": round(total_costs, 2),
                "total_profit": round(total_profit, 2),
            },
        }
    finally:
        session.close()


@router.get("/dashboard/kpis")
def admin_get_dashboard_kpis(
    year: Optional[int] = Query(None, description="Year; default current year"),
    month: Optional[int] = Query(None, description="Month (1-12); default current month"),
    _=Depends(require_roles("admin", "manager")),
):
    """
    KPI dashboard: average revenue per room, average profit per unit, weakest/best unit,
    vacant days, break-even per unit, forecast next month, trend vs previous month, warnings.
    All from live PostgreSQL; no mock data.
    """
    session = get_session()
    try:
        return compute_kpis(session, year=year, month=month)
    finally:
        session.close()


@router.get("/invoice-summary")
def admin_get_invoice_summary(
    _=Depends(require_roles("admin", "manager")),
):
    """
    Dashboard invoice KPIs: open_invoices_count, paid_invoices_count,
    overdue_invoices_count, open_invoices_amount.
    """
    session = get_session()
    try:
        result = session.execute(
            text("""
                SELECT
                    COUNT(*) FILTER (WHERE LOWER(TRIM(status)) = 'paid') AS paid_invoices_count,
                    COUNT(*) FILTER (WHERE LOWER(TRIM(status)) != 'paid' AND due_date < CURRENT_DATE) AS overdue_invoices_count,
                    COUNT(*) FILTER (WHERE LOWER(TRIM(status)) != 'paid' AND due_date >= CURRENT_DATE) AS open_invoices_count,
                    COALESCE(SUM(amount) FILTER (WHERE LOWER(TRIM(status)) != 'paid'), 0) AS open_invoices_amount
                FROM invoices
            """)
        )
        row = result.fetchone()
        if not row:
            return {
                "open_invoices_count": 0,
                "paid_invoices_count": 0,
                "overdue_invoices_count": 0,
                "open_invoices_amount": 0.0,
            }
        return {
            "open_invoices_count": row.open_invoices_count or 0,
            "paid_invoices_count": row.paid_invoices_count or 0,
            "overdue_invoices_count": row.overdue_invoices_count or 0,
            "open_invoices_amount": round(float(row.open_invoices_amount or 0), 2),
        }
    finally:
        session.close()
