/**
 * Derived unit occupancy from tenancies + rooms (frontend-only).
 * Single source of truth for occupancy labels used in admin UI.
 */

export function getTodayIsoForOccupancy() {
  return new Date().toISOString().slice(0, 10);
}

export function parseIsoDate(raw) {
  if (raw == null || raw === "") return null;
  const s = String(raw);
  if (!/^\d{4}-\d{2}-\d{2}/.test(s)) return null;
  return s.slice(0, 10);
}

export function isTenancyActiveByDates(t, todayIso) {
  const moveIn = parseIsoDate(t?.move_in_date);
  if (!moveIn || moveIn > todayIso) return false;
  const moveOut = t?.move_out_date ? parseIsoDate(t.move_out_date) : null;
  if (moveOut && moveOut < todayIso) return false;
  return true;
}

export function isTenancyFuture(t, todayIso) {
  const moveIn = parseIsoDate(t?.move_in_date);
  return moveIn != null && moveIn > todayIso;
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
  const uid = String(unit.unitId || unit.id || "");
  const unitTenancies = tenancies.filter(
    (t) => String(t.unit_id || t.unitId) === uid
  );

  const type = String(unit.type || "").trim();
  const isCoLiving = type === "Co-Living";

  if (!isCoLiving) {
    let hasActive = false;
    let hasFuture = false;
    for (const t of unitTenancies) {
      if (isTenancyActiveByDates(t, today)) hasActive = true;
      if (isTenancyFuture(t, today)) hasFuture = true;
    }
    if (hasActive) return "belegt";
    if (hasFuture) return "reserviert";
    return "frei";
  }

  const unitRooms = (rooms || []).filter(
    (r) => String(r.unitId || r.unit_id) === uid
  );
  const totalRooms =
    Math.floor(Number(unit.rooms) || 0) || unitRooms.length;
  if (totalRooms <= 0) return null;

  let occupiedRooms = 0;
  let futureRooms = 0;
  for (const room of unitRooms) {
    const rid = String(room.roomId || room.id || "");
    const roomT = unitTenancies.filter((t) => String(t.room_id) === rid);
    const hasActive = roomT.some((tt) => isTenancyActiveByDates(tt, today));
    const hasFuture = roomT.some((tt) => isTenancyFuture(tt, today));
    if (hasActive) occupiedRooms++;
    else if (hasFuture) futureRooms++;
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
 * Landlord contract lease start (Vertrag Vermieter). Empty / missing → treated as “started” for KPIs.
 */
export function isLandlordContractLeaseStarted(
  unit,
  todayIso = getTodayIsoForOccupancy()
) {
  const d = parseIsoDate(unit?.leaseStartDate ?? unit?.lease_start_date);
  if (d == null) return true;
  return d <= todayIso;
}
