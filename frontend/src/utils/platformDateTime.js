/**
 * Shared datetime display for platform org list/detail (de-CH, short date + time).
 */
export function formatPlatformDateTime(raw) {
  if (raw == null || raw === "") return "—";
  try {
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString("de-CH", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return "—";
  }
}
