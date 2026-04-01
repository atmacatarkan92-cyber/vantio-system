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

/** Sort key for insurance line in breakdown (not a unit_costs row). */
export const UNIT_COST_INSURANCE_TYPE_KEY = "__kautionsversicherung__";

/** Display order for known recurring cost_type values; then insurance; then other keys; empty last. */
const RECURRING_COST_TYPE_ORDER = ["Miete", "Nebenkosten", "Reinigung", "Internet"];

function monthlyEquivalentForCostRow(row) {
  const amt = Number(row?.amount_chf);
  if (!Number.isFinite(amt) || amt <= 0) return 0;
  const freq = String(row?.frequency || "monthly").trim().toLowerCase();
  if (freq === "one_time") return 0;
  if (freq === "monthly") return amt;
  if (freq === "yearly") return amt / 12;
  return 0;
}

function compareRecurringCostBreakdown(a, b) {
  const rank = (typeKey) => {
    const k = String(typeKey || "").trim();
    if (k === "__empty__") return [3, ""];
    if (k === UNIT_COST_INSURANCE_TYPE_KEY) return [1, ""];
    const idx = RECURRING_COST_TYPE_ORDER.indexOf(k);
    if (idx >= 0) return [0, String(idx).padStart(2, "0")];
    return [2, k.toLowerCase()];
  };
  const [ta, ka] = rank(a.typeKey);
  const [tb, kb] = rank(b.typeKey);
  if (ta !== tb) return ta - tb;
  return ka.localeCompare(kb, "de");
}

function sortRecurringBreakdown(entries) {
  return [...entries].sort(compareRecurringCostBreakdown);
}

function compareOneTimeCostBreakdown(a, b) {
  const rank = (typeKey) => {
    const k = String(typeKey || "").trim();
    if (k === "__empty__") return [2, ""];
    const idx = RECURRING_COST_TYPE_ORDER.indexOf(k);
    if (idx >= 0) return [0, String(idx).padStart(2, "0")];
    return [1, k.toLowerCase()];
  };
  const [ta, ka] = rank(a.typeKey);
  const [tb, kb] = rank(b.typeKey);
  if (ta !== tb) return ta - tb;
  return ka.localeCompare(kb, "de");
}

function sortOneTimeBreakdown(entries) {
  return [...entries].sort(compareOneTimeCostBreakdown);
}

/**
 * Recurring-only breakdown from unit_costs rows (monthly + yearly normalized).
 * @returns {{ typeKey: string, label: string, total: number }[]}
 */
export function recurringUnitCostBreakdownFromRows(unitCosts) {
  if (!Array.isArray(unitCosts)) return [];
  const map = new Map();
  for (const row of unitCosts) {
    const add = monthlyEquivalentForCostRow(row);
    if (add === 0) continue;
    const ct = String(row?.cost_type || "").trim();
    const k = ct || "__empty__";
    map.set(k, (map.get(k) || 0) + add);
  }
  const out = Array.from(map.entries())
    .map(([typeKey, total]) => ({
      typeKey,
      label: typeKey === "__empty__" ? "—" : typeKey,
      total,
    }))
    .filter((x) => x.total !== 0);
  return sortRecurringBreakdown(out);
}

/**
 * Recurring breakdown + Kautionsversicherung (Prämie / 12) when applicable.
 */
export function recurringUnitCostBreakdownWithInsurance(unit, unitCosts) {
  const rows = recurringUnitCostBreakdownFromRows(unitCosts);
  const ins = landlordDepositInsuranceMonthly(unit);
  if (ins > 0) {
    rows.push({
      typeKey: UNIT_COST_INSURANCE_TYPE_KEY,
      label: "Kautionsversicherung",
      total: ins,
    });
  }
  return sortRecurringBreakdown(rows);
}

/** Sum of one_time amount_chf across unit_costs rows. */
export function totalOneTimeUnitCosts(unitCosts) {
  if (!Array.isArray(unitCosts)) return 0;
  let sum = 0;
  for (const row of unitCosts) {
    if (String(row?.frequency || "").trim().toLowerCase() !== "one_time") continue;
    const amt = Number(row?.amount_chf);
    if (!Number.isFinite(amt) || amt <= 0) continue;
    sum += amt;
  }
  return sum;
}

/**
 * One-time costs grouped by cost_type (full amount).
 * @returns {{ typeKey: string, label: string, total: number }[]}
 */
export function oneTimeUnitCostBreakdownEntries(unitCosts) {
  if (!Array.isArray(unitCosts)) return [];
  const map = new Map();
  for (const row of unitCosts) {
    if (String(row?.frequency || "").trim().toLowerCase() !== "one_time") continue;
    const amt = Number(row?.amount_chf);
    if (!Number.isFinite(amt) || amt <= 0) continue;
    const ct = String(row?.cost_type || "").trim();
    const k = ct || "__empty__";
    map.set(k, (map.get(k) || 0) + amt);
  }
  const out = Array.from(map.entries())
    .map(([typeKey, total]) => ({
      typeKey,
      label: typeKey === "__empty__" ? "—" : typeKey,
      total,
    }))
    .filter((x) => x.total !== 0);
  return sortOneTimeBreakdown(out);
}
