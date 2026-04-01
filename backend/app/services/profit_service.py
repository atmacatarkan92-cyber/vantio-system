"""
Profit calculation: revenue (from tenancies) minus monthly costs per unit/month.

Costs = sum of unit_costs rows (UnitCost.amount_chf) for the unit.
"""

from typing import Dict, Any

from sqlmodel import select

from db.models import Unit, UnitCost
from app.services.revenue_forecast import calculate_monthly_revenue


def calculate_unit_profit(session, unit_id: str, year: int, month: int) -> Dict[str, Any]:
    """
    For the given unit and month, compute revenue (from tenancies), total monthly costs
    (sum of unit_costs rows), and profit = revenue - costs.
    unit_costs rows are summed as monthly amounts (no period filter).
    """
    rev = calculate_monthly_revenue(session, unit_id, year, month)
    revenue = rev["expected_revenue"]

    unit = session.get(Unit, unit_id)
    cost_rows = session.exec(select(UnitCost).where(UnitCost.unit_id == unit_id)).all()

    monthly_costs = 0.0
    for c in cost_rows:
        freq = str(getattr(c, "frequency", None) or "monthly").strip().lower()
        amt = float(getattr(c, "amount_chf", 0) or 0)
        if freq == "monthly":
            monthly_costs += amt
        elif freq == "yearly":
            monthly_costs += amt / 12.0
        # one_time ignored

    deposit_type = str(getattr(unit, "landlord_deposit_type", None) or "").strip().lower()
    annual_premium = float(getattr(unit, "landlord_deposit_annual_premium", 0) or 0)
    if deposit_type == "insurance" and annual_premium > 0:
        monthly_costs += annual_premium / 12.0

    profit = round(revenue - monthly_costs, 2)

    return {
        "unit_id": unit_id,
        "year": year,
        "month": month,
        "revenue": round(revenue, 2),
        "costs": round(monthly_costs, 2),
        "profit": profit,
    }
