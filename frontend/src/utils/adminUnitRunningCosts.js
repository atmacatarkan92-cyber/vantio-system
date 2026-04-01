/**
 * Monthly unit costs derived from unit_costs API rows.
 *
 * Rules (must match backend profit_service):
 * - monthly: amount_chf counts fully
 * - yearly: amount_chf / 12
 * - one_time: ignored for monthly profit
 */

/** Monthly-equivalent sum for unit_costs rows (excludes landlord deposit insurance premium). */
export function getUnitCostsTotal(unitCosts) {
  if (!Array.isArray(unitCosts)) return 0;
  return unitCosts.reduce((sum, row) => {
    const amt = Number(row?.amount_chf);
    if (!Number.isFinite(amt) || amt <= 0) return sum;
    const freq = String(row?.frequency || "monthly").trim().toLowerCase();
    if (freq === "monthly") return sum + amt;
    if (freq === "yearly") return sum + amt / 12;
    return sum;
  }, 0);
}

/** Sum amounts for rows whose cost_type matches (e.g. "Miete", "Nebenkosten"). */
export function sumUnitCostsByType(unitCosts, costTypeLabel) {
  if (!Array.isArray(unitCosts) || costTypeLabel == null || costTypeLabel === "") return 0;
  const label = String(costTypeLabel);
  return unitCosts.reduce((sum, row) => {
    if (String(row?.cost_type || "") !== label) return sum;
    const amt = Number(row?.amount_chf);
    if (!Number.isFinite(amt) || amt <= 0) return sum;
    const freq = String(row?.frequency || "monthly").trim().toLowerCase();
    if (freq === "monthly") return sum + amt;
    if (freq === "yearly") return sum + amt / 12;
    return sum;
  }, 0);
}

/** Monthly share of landlord insurance deposit premium (annual / 12). */
export function landlordDepositInsuranceMonthly(unit) {
  const t = String(unit?.landlordDepositType || "").trim().toLowerCase();
  if (t !== "insurance") return 0;
  const premium = Number(unit?.landlordDepositAnnualPremium);
  if (!Number.isFinite(premium) || premium <= 0) return 0;
  return premium / 12;
}

/** Full monthly running costs used in profitability (unit_costs monthly-equivalent + insurance monthly). */
export function getUnitMonthlyRunningCosts(unit, unitCosts) {
  return getUnitCostsTotal(unitCosts) + landlordDepositInsuranceMonthly(unit);
}
