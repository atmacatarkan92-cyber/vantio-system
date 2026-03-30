"""
Profit calculation: revenue (from tenancies) minus monthly costs per unit/month.

Costs = sum of unit_costs rows (UnitCost.amount_chf) for the unit.
"""

from typing import Dict, Any

from sqlmodel import select

from db.models import UnitCost
from app.services.revenue_forecast import calculate_monthly_revenue


def calculate_unit_profit(session, unit_id: str, year: int, month: int) -> Dict[str, Any]:
    """
    For the given unit and month, compute revenue (from tenancies), total monthly costs
    (sum of unit_costs rows), and profit = revenue - costs.
    unit_costs rows are summed as monthly amounts (no period filter).
    """
    rev = calculate_monthly_revenue(session, unit_id, year, month)
    revenue = rev["expected_revenue"]

    cost_rows = session.exec(
        select(UnitCost).where(UnitCost.unit_id == unit_id)
    ).all()
    costs = sum(float(c.amount_chf or 0) for c in cost_rows)
    profit = round(revenue - costs, 2)

    return {
        "unit_id": unit_id,
        "year": year,
        "month": month,
        "revenue": round(revenue, 2),
        "costs": round(costs, 2),
        "profit": profit,
    }
