/**
 * Tenant portal API: GET /api/tenant/me, /tenancies, /invoices.
 * Uses same auth as admin (Bearer token from authStore); requires role=tenant.
 */
import { API_BASE_URL, getApiHeaders } from "../config";

const opts = () => ({ headers: getApiHeaders(), credentials: "include" });

export function fetchTenantMe() {
  return fetch(`${API_BASE_URL}/api/tenant/me`, opts()).then((res) => {
    if (res.status === 403) throw new Error("Kein Mieter-Zugang.");
    if (!res.ok) throw new Error("Profil konnte nicht geladen werden.");
    return res.json();
  });
}

export function fetchTenantTenancies() {
  return fetch(`${API_BASE_URL}/api/tenant/tenancies`, opts()).then((res) => {
    if (res.status === 403) throw new Error("Kein Mieter-Zugang.");
    if (!res.ok) throw new Error("Mietverhältnisse konnten nicht geladen werden.");
    return res.json();
  });
}

export function fetchTenantInvoices() {
  return fetch(`${API_BASE_URL}/api/tenant/invoices`, opts()).then((res) => {
    if (res.status === 403) throw new Error("Kein Mieter-Zugang.");
    if (!res.ok) throw new Error("Rechnungen konnten nicht geladen werden.");
    return res.json();
  });
}
