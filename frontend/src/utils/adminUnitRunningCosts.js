/**
 * Running monthly costs for admin unit views (matches AdminUnitDetailPage economics).
 */

import { isLandlordContractLeaseStarted } from "./unitOccupancyStatus";

/** Monthly share of landlord insurance deposit premium (annual / 12). */
export function landlordDepositInsuranceMonthly(unit) {
  const t = String(unit?.landlordDepositType || "").trim().toLowerCase();
  if (t !== "insurance") return 0;
  const premium = Number(unit?.landlordDepositAnnualPremium);
  if (!Number.isFinite(premium) || premium <= 0) return 0;
  return premium / 12;
}

export function getRunningMonthlyCosts(unit) {
  if (!isLandlordContractLeaseStarted(unit)) return 0;
  return (
    Number(unit?.landlordRentMonthly || 0) +
    Number(unit?.utilitiesMonthly || 0) +
    Number(unit?.cleaningCostMonthly || 0) +
    landlordDepositInsuranceMonthly(unit)
  );
}
