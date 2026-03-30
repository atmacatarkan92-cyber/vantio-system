/** Build Google Maps search URL (new tab) from address parts — no backend call. */
export function buildGoogleMapsSearchUrl(addressLine1, postalCode, city) {
  const a1 = (addressLine1 || "").trim();
  const plz = (postalCode || "").trim();
  const c = (city || "").trim();
  const line2 = [plz, c].filter(Boolean).join(" ");
  const parts = [a1, line2].filter(Boolean);
  const q = parts.join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

/** Display line: "address_line1, postal_code city" or "—" if no address parts. */
export function formatLandlordAddressLine(row) {
  const a1 = (row?.address_line1 ?? "").trim();
  const plz = (row?.postal_code ?? "").trim();
  const c = (row?.city ?? "").trim();
  const line2 = [plz, c].filter(Boolean).join(" ");
  if (!a1 && !line2) return "—";
  if (!a1) return line2 || "—";
  if (!line2) return a1;
  return `${a1}, ${line2}`;
}
