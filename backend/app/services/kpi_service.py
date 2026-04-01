"""
KPI Dashboard: aggregate metrics from occupancy, revenue, profit, and units.
Used by GET /api/admin/dashboard/kpis. All values from live PostgreSQL only.
"""

from calendar import monthrange
from datetime import date
from typing import Any, Dict, List, Optional

from sqlmodel import select

from db.models import Unit
from app.services.occupancy_service import get_unit_occupancy
from app.services.revenue_forecast import calculate_monthly_revenue
from app.services.profit_service import calculate_unit_profit


def _current_period() -> tuple:
    today = date.today()
    return today.year, today.month


def _prev_month(year: int, month: int) -> tuple:
    if month == 1:
        return year - 1, 12
    return year, month - 1


def compute_kpis(
    session,
    year: Optional[int] = None,
    month: Optional[int] = None,
    *,
    organization_id: str,
) -> Dict[str, Any]:
    """
    Compute dashboard KPIs for the given month (default: current month).
    Returns structured dict with period, summary_cards, unit_performance, vacancy,
    forecast, trend, warnings, assumptions, availability.
    """
    y, m = year or date.today().year, month or date.today().month
    if not (1 <= m <= 12):
        y, m = _current_period()
    first = date(y, m, 1)
    _, last_day = monthrange(y, m)
    last = date(y, m, last_day)
    days_in_month = (last - first).days + 1

    units = list(
        session.exec(
            select(Unit).where(Unit.organization_id == organization_id).order_by(Unit.title)
        ).all()
    )
    period_label = f"{y}-{m:02d}"

    # --- Revenue & profit for current month (from existing services) ---
    total_revenue = 0.0
    total_costs = 0.0
    total_profit = 0.0
    total_rooms = 0
    unit_performance: List[Dict[str, Any]] = []

    for u in units:
        rev = calculate_monthly_revenue(session, str(u.id), y, m)
        prof = calculate_unit_profit(session, str(u.id), y, m)
        total_revenue += prof["revenue"]
        total_costs += prof["costs"]
        total_profit += prof["profit"]
        total_rooms += rev["total_rooms"]
        unit_performance.append({
            "unit_id": str(u.id),
            "unit_title": getattr(u, "title", None) or str(u.id),
            "revenue": round(prof["revenue"], 2),
            "costs": round(prof["costs"], 2),
            "profit": prof["profit"],
            "total_rooms": rev["total_rooms"],
            "occupied_rooms": rev["occupied_rooms"],
            "vacant_rooms": rev["vacant_rooms"],
            "methodology": "revenue from tenancies overlapping month; costs from unit_costs (monthly + yearly/12; one_time excluded) plus insurance/12 when applicable.",
        })

    # --- Average revenue per room ---
    avg_revenue_per_room: Optional[float] = None
    avg_revenue_per_room_note = "exact"
    if total_rooms > 0:
        avg_revenue_per_room = round(total_revenue / total_rooms, 2)
    else:
        avg_revenue_per_room_note = "unavailable (no rooms)"

    # --- Average profit per unit ---
    avg_profit_per_unit: Optional[float] = None
    avg_profit_per_unit_note = "exact"
    if units:
        avg_profit_per_unit = round(total_profit / len(units), 2)
    else:
        avg_profit_per_unit_note = "unavailable (no units)"

    # --- Weakest / best unit (by profit) ---
    weakest_unit: Optional[Dict[str, Any]] = None
    best_unit: Optional[Dict[str, Any]] = None
    if unit_performance:
        by_profit = sorted(unit_performance, key=lambda x: x["profit"])
        weakest_unit = {
            "unit_id": by_profit[0]["unit_id"],
            "unit_title": by_profit[0]["unit_title"],
            "metric": "profit",
            "value": by_profit[0]["profit"],
            "methodology": "lowest profit this month (revenue - monthly costs derived from unit_costs + insurance/12).",
        }
        best_unit = {
            "unit_id": by_profit[-1]["unit_id"],
            "unit_title": by_profit[-1]["unit_title"],
            "metric": "profit",
            "value": by_profit[-1]["profit"],
            "methodology": "highest profit this month (revenue - monthly costs derived from unit_costs + insurance/12).",
        }

    # --- Vacant days per month (estimated: free room-days) ---
    occupancy_today = {}
    for u in units:
        occ = get_unit_occupancy(session, str(u.id), last)  # end of month
        occupancy_today[str(u.id)] = occ
    total_free_rooms = sum(occ["free_rooms"] for occ in occupancy_today.values())
    vacant_room_days = total_free_rooms * days_in_month  # approximate
    vacancy_note = "estimated (free_rooms at month-end × days_in_month); no day-level vacancy tracking."

    # --- Break-even per unit ---
    break_even: List[Dict[str, Any]] = []
    for perf in unit_performance:
        rev = perf["revenue"]
        cost = perf["costs"]
        if cost > 0:
            # Break-even: revenue needed to cover costs. If revenue >= cost, already above.
            status = "above" if rev >= cost else "below"
            break_even.append({
                "unit_id": perf["unit_id"],
                "unit_title": perf["unit_title"],
                "costs": cost,
                "revenue": rev,
                "status": status,
                "note": "Break-even when revenue >= costs (monthly costs derived from unit_costs + insurance/12).",
            })
        else:
            break_even.append({
                "unit_id": perf["unit_id"],
                "unit_title": perf["unit_title"],
                "costs": 0,
                "revenue": rev,
                "status": "no_costs",
                "note": "No unit_costs; profit = revenue (except insurance/12 if applicable).",
            })

    # --- Forecast next month (simple: use current month as proxy) ---
    next_y, next_m = (y, m + 1) if m < 12 else (y + 1, 1)
    forecast_revenue = total_revenue  # same as current month as simple proxy
    forecast_note = "Simple forecast: used current month revenue as next-month proxy (no trend model)."

    # --- Trend vs previous month ---
    prev_y, prev_m = _prev_month(y, m)
    prev_revenue = 0.0
    prev_profit = 0.0
    for u in units:
        rec = calculate_unit_profit(session, str(u.id), prev_y, prev_m)
        prev_revenue += rec["revenue"]
        prev_profit += rec["profit"]
    revenue_diff = total_revenue - prev_revenue
    revenue_pct = (revenue_diff / prev_revenue * 100) if prev_revenue else None
    profit_diff = total_profit - prev_profit
    profit_pct = (profit_diff / prev_profit * 100) if prev_profit else None
    trend = {
        "current_month": {"year": y, "month": m, "revenue": round(total_revenue, 2), "profit": round(total_profit, 2)},
        "previous_month": {"year": prev_y, "month": prev_m, "revenue": round(prev_revenue, 2), "profit": round(prev_profit, 2)},
        "revenue_diff": round(revenue_diff, 2),
        "revenue_diff_pct": round(revenue_pct, 1) if revenue_pct is not None else None,
        "profit_diff": round(profit_diff, 2),
        "profit_diff_pct": round(profit_pct, 1) if profit_pct is not None else None,
        "methodology": "Compare current month vs previous month (revenue from tenancies; profit uses unit_costs frequency + insurance/12).",
    }

    # --- Warnings: units with costs but no/little occupancy, or free rooms ---
    warnings: List[Dict[str, Any]] = []
    for perf in unit_performance:
        uid = perf["unit_id"]
        utitle = perf["unit_title"]
        if perf["costs"] > 0 and perf["revenue"] <= 0:
            warnings.append({
                "type": "cost_no_occupancy",
                "unit_id": uid,
                "unit_title": utitle,
                "message": f"Unit {utitle} has costs (CHF {perf['costs']:.0f}) but no revenue this month.",
                "severity": "high",
            })
        elif perf["vacant_rooms"] > 0 and perf["total_rooms"] > 0:
            warnings.append({
                "type": "vacant_rooms",
                "unit_id": uid,
                "unit_title": utitle,
                "message": f"Unit {utitle}: {perf['vacant_rooms']} of {perf['total_rooms']} rooms vacant.",
                "severity": "medium",
            })
        if perf["profit"] < 0:
            warnings.append({
                "type": "negative_profit",
                "unit_id": uid,
                "unit_title": utitle,
                "message": f"Unit {utitle} has negative profit (CHF {perf['profit']:.0f}) this month.",
                "severity": "high",
            })

    assumptions = [
        "Revenue: from tenancies overlapping the selected month (active/reserved).",
        "Costs: monthly costs derived from unit_costs (monthly + yearly/12; one_time excluded) plus insurance/12 when applicable.",
        "Vacant days: estimated as free_rooms × days_in_month (no day-level vacancy log).",
        "Forecast: current month revenue used as next-month proxy; no trend or seasonality.",
        "Break-even: revenue >= monthly costs; one_time costs excluded from monthly profit by design.",
    ]

    return {
        "period": {
            "year": y,
            "month": m,
            "label": period_label,
            "days_in_month": days_in_month,
        },
        "summary_cards": {
            "average_revenue_per_room": {
                "value": avg_revenue_per_room,
                "currency": "CHF",
                "note": avg_revenue_per_room_note,
                "methodology": "Total revenue (from tenancies) / total rooms, for selected month.",
            },
            "average_profit_per_unit": {
                "value": avg_profit_per_unit,
                "currency": "CHF",
                "note": avg_profit_per_unit_note,
                "methodology": "Total profit (revenue - monthly costs derived from unit_costs + insurance/12) / number of units.",
            },
            "weakest_unit": weakest_unit,
            "best_unit": best_unit,
            "vacant_days_this_month": {
                "value": int(vacant_room_days),
                "unit": "room-days",
                "note": "estimated",
                "methodology": vacancy_note,
            },
            "forecast_next_month": {
                "revenue": round(forecast_revenue, 2),
                "currency": "CHF",
                "note": "estimated",
                "methodology": forecast_note,
            },
            "trend_vs_previous_month": trend,
            "total_revenue": round(total_revenue, 2),
            "total_costs": round(total_costs, 2),
            "total_profit": round(total_profit, 2),
            "total_rooms": total_rooms,
            "unit_count": len(units),
        },
        "unit_performance": unit_performance,
        "vacancy": {
            "total_free_rooms": total_free_rooms,
            "vacant_room_days": int(vacant_room_days),
            "note": vacancy_note,
        },
        "forecast": {
            "next_year": next_y,
            "next_month": next_m,
            "revenue": round(forecast_revenue, 2),
            "methodology": forecast_note,
        },
        "trend": trend,
        "warnings": warnings,
        "assumptions": assumptions,
        "availability": {
            "revenue": "exact",
            "profit": "exact",
            "vacant_days": "estimated",
            "forecast": "estimated",
            "break_even": "exact",
        },
        "break_even_per_unit": break_even,
    }
