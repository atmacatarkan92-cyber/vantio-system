/**
 * Swiss PLZ → city + canton (2-letter code).
 * Static data derived from williambelle/switzerland-postal-codes
 * (dist/postal-codes-full.json), first locality per PLZ when multiple exist.
 */
import swissPlz from "./swissPlz.json";

/**
 * @param {string} plz
 * @returns {{ city: string, canton: string } | null}
 */
export function lookupSwissPlz(plz) {
  const k = String(plz ?? "").trim();
  if (!/^\d{4}$/.test(k)) return null;
  const row = swissPlz[k];
  if (!row || !row.city || !row.canton) return null;
  return { city: row.city, canton: String(row.canton).trim().toUpperCase() };
}
