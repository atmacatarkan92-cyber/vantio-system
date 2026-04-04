import { computeDeviceFingerprint } from "./loginDeviceFingerprint";

/**
 * Rows must be in API order: newest first (same as GET /api/platform/audit-logs).
 * "Older" entries are later indices in the array.
 */

/** @typedef {'new'|'known'|'unknown'} LoginDeviceStatus */

function fingerprintFromRow(row) {
  const meta = row.metadata;
  if (!meta || typeof meta !== "object") {
    return null;
  }
  return computeDeviceFingerprint(meta.user_agent, meta.ip_address);
}

/**
 * For each login row, compare device fingerprint to strictly older logins
 * (same actor_user_id, action login) in this list only.
 *
 * @param {Array<Record<string, unknown>>} rowsNewestFirst
 * @returns {Map<string, LoginDeviceStatus>} row id → status
 */
export function buildLoginDeviceStatusMap(rowsNewestFirst) {
  const map = new Map();
  if (!Array.isArray(rowsNewestFirst)) {
    return map;
  }
  for (let i = 0; i < rowsNewestFirst.length; i++) {
    const row = rowsNewestFirst[i];
    if (row.action !== "login") {
      continue;
    }
    const fp = fingerprintFromRow(row);
    if (fp == null) {
      map.set(row.id, "unknown");
      continue;
    }
    const actorId = row.actor_user_id != null ? String(row.actor_user_id) : "";
    let seenBefore = false;
    for (let j = i + 1; j < rowsNewestFirst.length; j++) {
      const older = rowsNewestFirst[j];
      if (older.action !== "login") {
        continue;
      }
      if (String(older.actor_user_id || "") !== actorId) {
        continue;
      }
      const ofp = fingerprintFromRow(older);
      if (ofp != null && ofp === fp) {
        seenBefore = true;
        break;
      }
    }
    map.set(row.id, seenBefore ? "known" : "new");
  }
  return map;
}

/**
 * @param {LoginDeviceStatus|undefined} status
 * @returns {string}
 */
export function loginDeviceStatusLabel(status) {
  switch (status) {
    case "new":
      return "Neues Gerät";
    case "known":
      return "Bekanntes Gerät";
    default:
      return "Unbekannt";
  }
}
