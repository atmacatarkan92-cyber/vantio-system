/**
 * Canonical display name for a tenant from API payload.
 * Prefers first_name + last_name; falls back to legacy name / full_name.
 */
export function tenantDisplayName(t) {
  if (!t) return "";
  if (t.display_name) return String(t.display_name).trim();
  const fn = (t.first_name || "").trim();
  const ln = (t.last_name || "").trim();
  if (fn || ln) return `${fn} ${ln}`.trim();
  return (t.full_name || t.name || "").trim() || "";
}
