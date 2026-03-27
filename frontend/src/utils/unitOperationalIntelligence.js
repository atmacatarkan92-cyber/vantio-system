/**
 * Forward-looking operational helpers (Phase 4A). Tenancy + calendar dates only.
 */

import {
  getTodayIsoForOccupancy,
  parseIsoDate,
  isTenancyActiveByDates,
  isTenancyFuture,
  getTenancyMonthlyRentValue,
  sumActiveTenancyMonthlyRentForUnit,
  tenanciesForRoom,
  getFutureTenancyForRoom,
} from "./unitOccupancyStatus";

export function addCalendarDays(iso, days) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return null;
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7)) - 1;
  const day = Number(iso.slice(8, 10));
  const dt = new Date(y, m, day);
  dt.setDate(dt.getDate() + days);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export function calendarDaysFromTo(isoFrom, isoTo) {
  if (
    !isoFrom ||
    !isoTo ||
    !/^\d{4}-\d{2}-\d{2}/.test(isoFrom) ||
    !/^\d{4}-\d{2}-\d{2}/.test(isoTo)
  ) {
    return null;
  }
  const y0 = Number(isoFrom.slice(0, 4));
  const m0 = Number(isoFrom.slice(5, 7)) - 1;
  const d0 = Number(isoFrom.slice(8, 10));
  const y1 = Number(isoTo.slice(0, 4));
  const m1 = Number(isoTo.slice(5, 7)) - 1;
  const d1 = Number(isoTo.slice(8, 10));
  const a = Date.UTC(y0, m0, d0);
  const b = Date.UTC(y1, m1, d1);
  return Math.round((b - a) / 86400000);
}

function formatDeDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
}

function roomIdsForUnit(unit, rooms) {
  const uid = String(unit?.unitId || unit?.id || "");
  return (rooms || []).filter(
    (r) => String(r.unitId || r.unit_id) === uid
  );
}

/**
 * @param {object} unit
 * @param {object[]|null|undefined} tenancies
 * @param {number} daysAhead
 * @param {string} [todayIso]
 */
export function getUpcomingMoveOutsForUnit(
  unit,
  tenancies,
  daysAhead = 30,
  todayIso = getTodayIsoForOccupancy()
) {
  if (!unit || !Array.isArray(tenancies)) return [];
  const uid = String(unit.unitId || unit.id || "");
  const horizonEnd = addCalendarDays(todayIso, daysAhead);
  if (horizonEnd == null) return [];
  const out = [];
  for (const t of tenancies) {
    if (String(t.unit_id || t.unitId) !== uid) continue;
    if (!isTenancyActiveByDates(t, todayIso)) continue;
    const mo = parseIsoDate(t.move_out_date);
    if (!mo) continue;
    if (mo >= todayIso && mo <= horizonEnd) out.push(t);
  }
  return out;
}

export function getUpcomingMoveInsForUnit(
  unit,
  tenancies,
  daysAhead = 30,
  todayIso = getTodayIsoForOccupancy()
) {
  if (!unit || !Array.isArray(tenancies)) return [];
  const uid = String(unit.unitId || unit.id || "");
  const horizonEnd = addCalendarDays(todayIso, daysAhead);
  if (horizonEnd == null) return [];
  const out = [];
  for (const t of tenancies) {
    if (String(t.unit_id || t.unitId) !== uid) continue;
    if (!isTenancyFuture(t, todayIso)) continue;
    const mi = parseIsoDate(t.move_in_date);
    if (!mi) continue;
    if (mi > todayIso && mi <= horizonEnd) out.push(t);
  }
  return out;
}

export function getUpcomingMoveOutsForRoom(
  room,
  tenancies,
  daysAhead = 30,
  todayIso = getTodayIsoForOccupancy()
) {
  if (!room || !Array.isArray(tenancies)) return [];
  const horizonEnd = addCalendarDays(todayIso, daysAhead);
  if (horizonEnd == null) return [];
  const out = [];
  for (const t of tenanciesForRoom(room, tenancies)) {
    if (!isTenancyActiveByDates(t, todayIso)) continue;
    const mo = parseIsoDate(t.move_out_date);
    if (!mo) continue;
    if (mo >= todayIso && mo <= horizonEnd) out.push(t);
  }
  return out;
}

export function getUpcomingMoveInsForRoom(
  room,
  tenancies,
  daysAhead = 30,
  todayIso = getTodayIsoForOccupancy()
) {
  if (!room || !Array.isArray(tenancies)) return [];
  const horizonEnd = addCalendarDays(todayIso, daysAhead);
  if (horizonEnd == null) return [];
  const out = [];
  for (const t of tenanciesForRoom(room, tenancies)) {
    if (!isTenancyFuture(t, todayIso)) continue;
    const mi = parseIsoDate(t.move_in_date);
    if (!mi) continue;
    if (mi > todayIso && mi <= horizonEnd) out.push(t);
  }
  return out;
}

export function hasFutureTenancyForApartment(unit, tenancies, todayIso) {
  if (!unit || !Array.isArray(tenancies)) return false;
  const uid = String(unit.unitId || unit.id || "");
  return tenancies.some((t) => {
    if (String(t.unit_id || t.unitId) !== uid) return false;
    return isTenancyFuture(t, todayIso);
  });
}

/**
 * @param {object} t
 * @param {string} landlordEndIso
 * @param {string} todayIso
 */
export function tenancyCollidesWithLandlordLeaseEnd(t, landlordEndIso, todayIso) {
  if (!landlordEndIso || !t) return false;
  const mi = parseIsoDate(t.move_in_date);
  const mo = t.move_out_date ? parseIsoDate(t.move_out_date) : null;
  if (isTenancyFuture(t, todayIso)) {
    if (mi && mi > landlordEndIso) return true;
    if (mi && mi <= landlordEndIso && (mo == null || mo > landlordEndIso))
      return true;
  }
  if (isTenancyActiveByDates(t, todayIso)) {
    if (mo == null || mo > landlordEndIso) return true;
  }
  return false;
}

/**
 * @param {object} unit
 * @param {object[]|null|undefined} rooms
 * @param {object[]|null|undefined} tenancies
 * @param {number} horizonDays
 * @param {string} [todayIso]
 */
export function getUnitRevenueForecast(
  unit,
  rooms,
  tenancies,
  horizonDays = 30,
  todayIso = getTodayIsoForOccupancy()
) {
  const currentRevenue = sumActiveTenancyMonthlyRentForUnit(
    unit,
    tenancies,
    todayIso
  );
  const uid = String(unit?.unitId || unit?.id || "");
  const unitT = Array.isArray(tenancies)
    ? tenancies.filter((t) => String(t.unit_id || t.unitId) === uid)
    : [];
  const horizonEnd = addCalendarDays(todayIso, horizonDays);
  if (horizonEnd == null) {
    return {
      currentRevenue,
      expiringRevenue: 0,
      futureBookedRevenue: 0,
      forecastRevenue: currentRevenue,
      openPotential: null,
      fullPotential: null,
      netChange: 0,
    };
  }

  let expiringRevenue = 0;
  for (const t of unitT) {
    if (!isTenancyActiveByDates(t, todayIso)) continue;
    const mo = parseIsoDate(t.move_out_date);
    if (!mo || mo < todayIso || mo > horizonEnd) continue;
    expiringRevenue += getTenancyMonthlyRentValue(t);
  }

  let futureBookedRevenue = 0;
  for (const t of unitT) {
    if (!isTenancyFuture(t, todayIso)) continue;
    const mi = parseIsoDate(t.move_in_date);
    if (!mi || mi <= todayIso || mi > horizonEnd) continue;
    futureBookedRevenue += getTenancyMonthlyRentValue(t);
  }

  const roomList = roomIdsForUnit(unit, rooms);
  let fullPotential = null;
  if (roomList.length > 0) {
    fullPotential = roomList.reduce(
      (s, r) => s + Number(r.priceMonthly || 0),
      0
    );
  } else {
    const tp = Number(
      unit?.tenantPriceMonthly ?? unit?.tenant_price_monthly_chf ?? 0
    );
    fullPotential = tp > 0 ? tp : null;
  }

  const openPotential =
    fullPotential != null
      ? Math.max(0, Number(fullPotential) - currentRevenue)
      : null;
  const forecastRevenue = currentRevenue - expiringRevenue + futureBookedRevenue;
  const netChange = forecastRevenue - currentRevenue;

  return {
    currentRevenue,
    expiringRevenue,
    futureBookedRevenue,
    forecastRevenue,
    openPotential,
    fullPotential,
    netChange,
  };
}

/**
 * Phase 4A alerts (dedupe by message text in caller).
 * @param {object} unit
 * @param {object[]|null|undefined} rooms
 * @param {object[]|null|undefined} unitTenancies
 * @param {number} horizonDays
 * @param {string} [todayIso]
 */
export function getPhase4OperationalWarnings(
  unit,
  rooms,
  unitTenancies,
  horizonDays = 30,
  todayIso = getTodayIsoForOccupancy()
) {
  if (!unit || unitTenancies == null) return [];
  const uid = String(unit.unitId || unit.id || "");
  const unitRooms = roomIdsForUnit(unit, rooms);
  const isCoLiving = String(unit.type || "").trim() === "Co-Living";
  const horizonEnd = addCalendarDays(todayIso, horizonDays);
  if (horizonEnd == null) return [];

  const forecast = getUnitRevenueForecast(
    unit,
    rooms,
    unitTenancies,
    horizonDays,
    todayIso
  );
  const out = [];
  const pushUnique = (tone, text) => {
    if (!text || out.some((w) => w.text === text)) return;
    out.push({ tone, text });
  };

  if (isCoLiving) {
    let hasVacancyRisk = false;
    for (const room of unitRooms) {
      const ups = getUpcomingMoveOutsForRoom(
        room,
        unitTenancies,
        horizonDays,
        todayIso
      );
      if (ups.length === 0) continue;
      const fut = getFutureTenancyForRoom(room, unitTenancies, todayIso);
      if (fut == null) hasVacancyRisk = true;
    }
    if (hasVacancyRisk) {
      pushUnique(
        "amber",
        "Achtung: Einnahmen enden bald – keine Nachbelegung geplant"
      );
    }
  } else {
    const ups = getUpcomingMoveOutsForUnit(
      unit,
      unitTenancies,
      horizonDays,
      todayIso
    );
    if (
      ups.length > 0 &&
      !hasFutureTenancyForApartment(unit, unitTenancies, todayIso)
    ) {
      pushUnique(
        "amber",
        "Achtung: Einnahmen enden bald – keine Nachbelegung geplant"
      );
    }
  }

  if (isCoLiving) {
    for (const room of unitRooms) {
      const ups = getUpcomingMoveOutsForRoom(
        room,
        unitTenancies,
        horizonDays,
        todayIso
      );
      if (ups.length === 0) continue;
      const t = ups[0];
      const mo = parseIsoDate(t.move_out_date);
      if (!mo) continue;
      const y = calendarDaysFromTo(todayIso, mo);
      if (y == null || y < 0) continue;
      const label = room.roomName || room.name || room.roomId || "Room";
      pushUnique("amber", `Zimmer ${label} wird in ${y} Tagen frei`);
    }
  }

  const seenBookingDates = new Set();
  if (isCoLiving) {
    for (const room of unitRooms) {
      const ins = getUpcomingMoveInsForRoom(
        room,
        unitTenancies,
        horizonDays,
        todayIso
      );
      for (const t of ins) {
        const mi = parseIsoDate(t.move_in_date);
        if (!mi) continue;
        const key = mi;
        if (seenBookingDates.has(key)) continue;
        seenBookingDates.add(key);
        pushUnique("emerald", `Nachbelegung geplant ab ${formatDeDate(mi)}`);
      }
    }
  } else {
    const ins = getUpcomingMoveInsForUnit(
      unit,
      unitTenancies,
      horizonDays,
      todayIso
    );
    for (const t of ins) {
      const mi = parseIsoDate(t.move_in_date);
      if (!mi) continue;
      const key = mi;
      if (seenBookingDates.has(key)) continue;
      seenBookingDates.add(key);
      pushUnique("emerald", `Nachbelegung geplant ab ${formatDeDate(mi)}`);
    }
  }

  const led = parseIsoDate(unit?.leaseEndDate ?? unit?.lease_end_date);
  if (led) {
    const unitT = unitTenancies.filter(
      (t) => String(t.unit_id || t.unitId) === uid
    );
    for (const t of unitT) {
      if (tenancyCollidesWithLandlordLeaseEnd(t, led, todayIso)) {
        pushUnique(
          "rose",
          "Zukünftiges Mietverhältnis kollidiert mit Vertragsende Vermieter"
        );
        break;
      }
    }
  }

  if (
    forecast.expiringRevenue > 0 &&
    forecast.futureBookedRevenue < forecast.expiringRevenue
  ) {
    pushUnique("amber", "Geplanter Umsatzrückgang in den nächsten 30 Tagen");
  }

  return out;
}
