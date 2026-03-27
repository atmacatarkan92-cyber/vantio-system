/**
 * Portfolio-level aggregates from units, rooms, and tenancies (frontend-only).
 * Aligns with AdminUnitDetailPage / AdminPerformancePage tenancy + cost logic.
 */

import { getCoLivingMetrics } from "./adminUnitCoLivingMetrics";
import { getRunningMonthlyCosts } from "./adminUnitRunningCosts";
import {
  sumActiveTenancyMonthlyRentForUnit,
  getUnitOccupancyStatus,
} from "./unitOccupancyStatus";
import { getDisplayUnitId } from "./unitDisplayId";

function compareProfitBest(a, b) {
  if (b.profit !== a.profit) return b.profit - a.profit;
  return b.revenue - a.revenue;
}

function compareProfitWorst(a, b) {
  if (a.profit !== b.profit) return a.profit - b.profit;
  return a.revenue - b.revenue;
}

/** Same label rules as AdminPerformancePage (APT/CL index + city / fallbacks). */
export function getPortfolioUnitLabel(unit, listIndex) {
  if (!unit) return "—";

  const city = unit.city ?? unit.place ?? "";

  if (typeof listIndex === "number" && listIndex >= 0 && city) {
    const rid = getDisplayUnitId(unit, listIndex);
    if (rid && rid !== "—") {
      return `${rid} · ${city}`;
    }
  }

  if (unit.unitId && city) {
    return `${unit.unitId} · ${city}`;
  }

  if (unit.address && city) {
    return `${unit.address} · ${city}`;
  }

  if (unit.label) {
    return unit.label;
  }

  if (unit.name) {
    return unit.name;
  }

  return unit.id;
}

/**
 * @param {object[]} units
 * @param {object[]|null|undefined} rooms
 * @param {object[]|null|undefined} tenancies — null = data not loaded yet
 */
export function getPortfolioMetrics(units, rooms, tenancies) {
  if (!Array.isArray(units)) return null;
  if (tenancies == null) return null;

  let totalUnits = units.length;
  let totalRevenue = 0;
  let totalFullPotential = 0;
  let totalVacancy = 0;
  let totalOccupiedRooms = 0;
  let totalRooms = 0;

  /** @type {{ unit: object, profit: number, revenue: number, listIndex: number }[]} */
  const rows = [];

  units.forEach((unit, listIndex) => {
    const runningCosts = getRunningMonthlyCosts(unit);
    const type = String(unit.type || "").trim();
    const isCoLiving = type === "Co-Living";

    if (isCoLiving) {
      const metrics = getCoLivingMetrics(unit, rooms, tenancies);
      const rev = Number(metrics.currentRevenue ?? 0);
      const full = metrics.fullRevenue != null ? Number(metrics.fullRevenue) : 0;
      const vacancy = Number(metrics.vacancyLoss ?? 0);

      totalRevenue += rev;
      totalFullPotential += full;
      totalVacancy += vacancy;
      totalOccupiedRooms += metrics.occupiedCount;
      totalRooms += metrics.totalRooms;

      const profit = rev - runningCosts;
      rows.push({ unit, profit, revenue: rev, listIndex });
    } else {
      const revenue = sumActiveTenancyMonthlyRentForUnit(unit, tenancies);
      const full = Number(unit.tenantPriceMonthly || 0);
      const vacancy = Math.max(0, full - revenue);
      const profit = revenue - runningCosts;

      totalRevenue += revenue;
      totalFullPotential += full;
      totalVacancy += vacancy;
      totalRooms += 1;
      if (getUnitOccupancyStatus(unit, rooms, tenancies) === "belegt") {
        totalOccupiedRooms += 1;
      }

      rows.push({ unit, profit, revenue, listIndex });
    }
  });

  const sortedBest = [...rows].sort(compareProfitBest);
  const sortedWorst = [...rows].sort(compareProfitWorst);
  const bestUnit = sortedBest[0] ?? null;
  const worstUnit = sortedWorst[0] ?? null;

  return {
    totalUnits,
    totalRevenue,
    totalFullPotential,
    totalVacancy,
    occupancyRate: totalRooms > 0 ? totalOccupiedRooms / totalRooms : null,
    bestUnit,
    worstUnit,
  };
}
