/**
 * Derived unit occupancy from tenancies + rooms (frontend-only).
 * Single source of truth for occupancy labels used in admin UI.
 */

import { normalizeUnitTypeLabel } from "./unitDisplayId";

/** Calendar "today" in local timezone (YYYY-MM-DD), for date-only API fields. */
export function getTodayIsoForOccupancy() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseIsoDate(raw) {
  if (raw == null || raw === "") return null;
  const s = String(raw);
  if (!/^\d{4}-\d{2}-\d{2}/.test(s)) return null;
  return s.slice(0, 10);
}

function normalizeTenancyStatus(t) {
  return String(t?.status ?? "").trim().toLowerCase();
}

/**
 * ACTIVE: status active, move_in <= today, move_out null or >= today.
 * Ignores ended / unknown statuses (aligned with backend occupancy/revenue).
 */
export function isTenancyActiveByDates(t, todayIso = getTodayIsoForOccupancy()) {
  if (!t) return false;
  const ds = String(t?.display_status || "").trim().toLowerCase();
  if (ds === "ended") return false;
  const moveIn = parseIsoDate(t?.move_in_date);
  const endIso = parseIsoDate(t?.display_end_date ?? t?.move_out_date);

  if (ds === "notice_given" || ds === "active") {
    if (normalizeTenancyStatus(t) !== "active") return false;
    if (!moveIn || moveIn > todayIso) return false;
    if (endIso && endIso < todayIso) return false;
    return true;
  }
  if (ds === "reserved") return false;

  if (normalizeTenancyStatus(t) !== "active") return false;
  if (!moveIn || moveIn > todayIso) return false;
  const moveOut = t?.move_out_date ? parseIsoDate(t.move_out_date) : null;
  if (moveOut && moveOut < todayIso) return false;
  return true;
}

/**
 * FUTURE (upcoming active tenancy): status active, move_in > today.
 */
export function isTenancyFuture(t, todayIso = getTodayIsoForOccupancy()) {
  if (!t) return false;
  if (normalizeTenancyStatus(t) !== "active") return false;
  const moveIn = parseIsoDate(t?.move_in_date);
  if (!moveIn || moveIn <= todayIso) return false;
  return true;
}

/** RESERVED: status reserved, move_in > today. */
export function isTenancyReservedSlot(t, todayIso = getTodayIsoForOccupancy()) {
  if (!t) return false;
  if (normalizeTenancyStatus(t) !== "reserved") return false;
  const moveIn = parseIsoDate(t?.move_in_date);
  if (!moveIn || moveIn <= todayIso) return false;
  return true;
}

/**
 * CRM tenant status from all tenancies for one tenant (caller passes tenant-scoped rows).
 * Aligns with unit/room occupancy: active today → active; future reserved or future active → reserved;
 * no tenancies → inactive; otherwise ended (past-only / no current slot).
 *
 * @returns {"active"|"reserved"|"ended"|"inactive"}
 */
export function deriveTenantOperationalStatus(
  tenantTenancies,
  todayIso = getTodayIsoForOccupancy()
) {
  const list = Array.isArray(tenantTenancies) ? tenantTenancies : [];
  if (list.some((t) => isTenancyActiveByDates(t, todayIso))) {
    return "active";
  }
  if (
    list.some(
      (t) => isTenancyReservedSlot(t, todayIso) || isTenancyFuture(t, todayIso)
    )
  ) {
    return "reserved";
  }
  if (list.length === 0) {
    return "inactive";
  }
  return "ended";
}

/** Monthly rent from tenancy row (frontend field variants). */
export function getTenancyMonthlyRentValue(t) {
  if (!t) return 0;
  const equiv = t.monthly_revenue_equivalent ?? t.monthlyRevenueEquivalent;
  if (equiv != null && equiv !== "") {
    const n = Number(equiv);
    if (Number.isFinite(n)) return n;
  }
  const rent = t.monthly_rent ?? t.monthlyRent;
  if (rent != null && rent !== "") {
    const n = Number(rent);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/**
 * Sum of monthly rent for tenancies that are active on todayIso for this unit.
 */
export function sumActiveTenancyMonthlyRentForUnit(
  unit,
  tenancies,
  todayIso = getTodayIsoForOccupancy()
) {
  if (!unit || !Array.isArray(tenancies)) return 0;
  const uid = String(unit.unitId || unit.id || "").trim();
  let sum = 0;
  for (const t of tenancies) {
    if (String(t.unit_id || t.unitId || "").trim() !== uid) continue;
    if (!isTenancyActiveByDates(t, todayIso)) continue;
    sum += getTenancyMonthlyRentValue(t);
  }
  return sum;
}

/**
 * Per-room occupancy from tenancies (Co-Living). Matches getUnitOccupancyStatus room loop.
 * @param {object} room
 * @param {object[]|null|undefined} tenancies
 * @returns {null | 'frei' | 'reserviert' | 'belegt'}
 */
export function tenanciesForRoom(room, tenancies) {
  if (!room || !Array.isArray(tenancies)) return [];
  const rid = String(room.room_id || room.roomId || room.id || "");
  return tenancies.filter(
    (t) => String(t.room_id || t.roomId || "") === rid
  );
}

export function getActiveTenancyForRoom(
  room,
  tenancies,
  todayIso = getTodayIsoForOccupancy()
) {
  return (
    tenanciesForRoom(room, tenancies).find((t) =>
      isTenancyActiveByDates(t, todayIso)
    ) || null
  );
}

export function getFutureTenancyForRoom(
  room,
  tenancies,
  todayIso = getTodayIsoForOccupancy()
) {
  return (
    tenanciesForRoom(room, tenancies).find(
      (t) =>
        isTenancyReservedSlot(t, todayIso) || isTenancyFuture(t, todayIso)
    ) || null
  );
}

export function getRoomOccupancyStatus(room, tenancies) {
  if (!room) return null;
  if (tenancies == null) return null;
  const today = getTodayIsoForOccupancy();
  const roomT = tenanciesForRoom(room, tenancies);
  if (roomT.some((t) => isTenancyActiveByDates(t, today))) return "belegt";
  if (roomT.some((t) => isTenancyReservedSlot(t, today))) return "reserviert";
  if (roomT.some((t) => isTenancyFuture(t, today))) return "reserviert";
  return "frei";
}

/**
 * @param {object} unit
 * @param {object[]|null|undefined} rooms
 * @param {object[]|null|undefined} tenancies — null/undefined = data not available
 * @returns {null | 'frei' | 'reserviert' | 'belegt' | 'teilbelegt'}
 */
export function getUnitOccupancyStatus(unit, rooms, tenancies) {
  if (!unit) return null;
  if (tenancies == null) return null;
  const today = getTodayIsoForOccupancy();
  const uid = String(unit.unitId || unit.id || "").trim();
  const unitTenancies = tenancies.filter(
    (t) => String(t.unit_id || t.unitId || "").trim() === uid
  );

  const isCoLiving = normalizeUnitTypeLabel(unit.type) === "Co-Living";

  if (!isCoLiving) {
    let hasActive = false;
    let hasFuture = false;
    for (const t of unitTenancies) {
      if (isTenancyActiveByDates(t, today)) hasActive = true;
      if (isTenancyReservedSlot(t, today) || isTenancyFuture(t, today)) {
        hasFuture = true;
      }
    }
    if (hasActive) return "belegt";
    if (hasFuture) return "reserviert";
    return "frei";
  }

  const unitRooms = (rooms || []).filter(
    (r) => String(r.unitId || r.unit_id || "").trim() === uid
  );
  const totalRooms =
    Math.floor(Number(unit.rooms) || 0) || unitRooms.length;
  if (totalRooms <= 0) return null;

  let occupiedRooms = 0;
  let futureRooms = 0;
  for (const room of unitRooms) {
    const occ = getRoomOccupancyStatus(room, unitTenancies);
    if (occ === "belegt") occupiedRooms++;
    else if (occ === "reserviert") futureRooms++;
  }

  if (occupiedRooms === 0 && futureRooms === 0) return "frei";
  if (occupiedRooms === 0 && futureRooms > 0) return "reserviert";
  if (occupiedRooms >= totalRooms) return "belegt";
  if (occupiedRooms > 0 && occupiedRooms < totalRooms) return "teilbelegt";
  return "frei";
}

export function formatOccupancyStatusDe(key) {
  if (key == null) return "—";
  const m = {
    frei: "Frei",
    reserviert: "Reserviert",
    belegt: "Belegt",
    teilbelegt: "Teilbelegt",
  };
  return m[key] || key;
}

/** Tailwind badge tone for admin Badge / spans (matches AdminUnitDetailPage Badge). */
export function occupancyStatusBadgeTone(key) {
  if (key === "frei") return "slate";
  if (key === "reserviert") return "blue";
  if (key === "teilbelegt") return "orange";
  if (key === "belegt") return "green";
  return "slate";
}

const BADGE_TONE_CLASSES = {
  slate: "bg-slate-100 text-slate-700",
  green: "bg-emerald-100 text-emerald-700",
  orange: "bg-orange-100 text-orange-700",
  blue: "bg-sky-100 text-sky-700",
};

export function occupancyStatusBadgeClassName(statusKey) {
  const tone = occupancyStatusBadgeTone(statusKey);
  return BADGE_TONE_CLASSES[tone] || BADGE_TONE_CLASSES.slate;
}

/**
 * Landlord contract lease start (Vertrag Vermieter).
 * Missing lease_start_date → not started (exclude from revenue / active KPIs).
 */
export function isLandlordContractLeaseStarted(
  unit,
  todayIso = getTodayIsoForOccupancy()
) {
  const d = parseIsoDate(unit?.leaseStartDate ?? unit?.lease_start_date);
  if (d == null) return false;
  return d <= todayIso;
}

function isoDateAddDays(iso, days) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return null;
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7)) - 1;
  const day = Number(iso.slice(8, 10));
  const dt = new Date(Date.UTC(y, m, day));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/**
 * Single contract state for Vertrag Vermieter (deterministic order).
 * @returns {"active"|"expiring_soon"|"expired"|"ended"|"unknown"}
 */
export function getUnitContractState(unit) {
  if (!unit) return "unknown";
  const ls = String(unit.leaseStatus ?? unit.lease_status ?? "").trim();
  if (ls === "ended") return "ended";

  const start = parseIsoDate(unit?.leaseStartDate ?? unit?.lease_start_date);
  if (start == null) return "unknown";

  const today = getTodayIsoForOccupancy();
  const end = parseIsoDate(unit?.leaseEndDate ?? unit?.lease_end_date);
  if (end != null && end < today) return "expired";

  if (end != null) {
    const limit = isoDateAddDays(today, 60);
    if (limit != null && end <= limit) return "expiring_soon";
  }

  return "active";
}

/** Block new tenancies when landlord lease contract is ended (frontend-only). */
export const UNIT_LANDLORD_LEASE_ENDED_TENANCY_MESSAGE =
  "Diese Einheit ist beendet (Vertrag Vermieter). Es können keine neuen Mietverhältnisse erstellt werden.";
