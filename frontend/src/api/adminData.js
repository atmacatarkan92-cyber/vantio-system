/**
 * Admin API: units, rooms, tenants from PostgreSQL.
 * Use getApiHeaders() so requests are authenticated.
 */
import { API_BASE_URL, getApiHeaders } from "../config";

export function fetchAdminUnits() {
  return fetch(`${API_BASE_URL}/api/admin/units`, { headers: getApiHeaders() }).then((res) => {
    if (!res.ok) throw new Error("Units konnten nicht geladen werden.");
    return res.json();
  });
}

export function fetchAdminUnit(id) {
  return fetch(`${API_BASE_URL}/api/admin/units/${encodeURIComponent(id)}`, {
    headers: getApiHeaders(),
  }).then((res) => {
    if (!res.ok) {
      if (res.status === 404) return null;
      throw new Error("Unit konnte nicht geladen werden.");
    }
    return res.json();
  });
}

export function createAdminUnit(body) {
  return fetch(`${API_BASE_URL}/api/admin/units`, {
    method: "POST",
    headers: getApiHeaders(),
    body: JSON.stringify(body),
  }).then((res) => {
    if (!res.ok) throw new Error("Unit konnte nicht erstellt werden.");
    return res.json();
  });
}

export function updateAdminUnit(id, body) {
  return fetch(`${API_BASE_URL}/api/admin/units/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: getApiHeaders(),
    body: JSON.stringify(body),
  }).then((res) => {
    if (!res.ok) throw new Error("Unit konnte nicht gespeichert werden.");
    return res.json();
  });
}

export function fetchAdminRooms(unitId = null) {
  const url = unitId
    ? `${API_BASE_URL}/api/admin/units/${encodeURIComponent(unitId)}/rooms`
    : `${API_BASE_URL}/api/admin/rooms`;
  return fetch(url, { headers: getApiHeaders() }).then((res) => {
    if (!res.ok) {
      if (res.status === 404) return [];
      throw new Error("Rooms konnten nicht geladen werden.");
    }
    return res.json();
  });
}

export function fetchAdminTenants() {
  return fetch(`${API_BASE_URL}/api/admin/tenants`, { headers: getApiHeaders() }).then((res) => {
    if (!res.ok) throw new Error("Tenants konnten nicht geladen werden.");
    return res.json();
  });
}

/**
 * Fetch all tenancies (for AdminTenantsPage). Optional params: room_id, unit_id, status.
 */
export function fetchAdminTenancies(params = {}) {
  const sp = new URLSearchParams();
  if (params.room_id) sp.set("room_id", params.room_id);
  if (params.unit_id) sp.set("unit_id", params.unit_id);
  if (params.status) sp.set("status", params.status);
  const qs = sp.toString();
  const url = `${API_BASE_URL}/api/admin/tenancies${qs ? `?${qs}` : ""}`;
  return fetch(url, { headers: getApiHeaders() }).then((res) => {
    if (!res.ok) throw new Error("Tenancies konnten nicht geladen werden.");
    return res.json();
  });
}

/**
 * Fetch all invoices (same as GET /api/invoices). Used by AdminTenantsPage for per-tenant invoice context.
 */
export function fetchAdminInvoices() {
  return fetch(`${API_BASE_URL}/api/invoices`, { headers: getApiHeaders() }).then((res) => {
    if (!res.ok) throw new Error("Rechnungen konnten nicht geladen werden.");
    return res.json();
  });
}

/**
 * Normalize unit from API for pages that expect unitId, place, etc.
 */
export function normalizeUnit(u) {
  if (!u) return u;
  return {
    ...u,
    unitId: u.unitId ?? u.id,
    place: u.place ?? u.city ?? u.address ?? "",
  };
}

/**
 * Normalize room from API for pages that expect unitId, status, priceMonthly.
 */
export function normalizeRoom(r) {
  if (!r) return r;
  return {
    ...r,
    unitId: r.unitId ?? r.unit_id,
    priceMonthly: r.priceMonthly ?? r.price ?? r.base_rent_chf ?? 0,
    status: r.status ?? (r.is_active ? "Frei" : "Inaktiv"),
    roomName: r.roomName ?? r.name,
  };
}

/**
 * Fetch occupancy from backend (tenancy-based). Query params: unit_id?, on_date?
 */
export function fetchAdminOccupancy(params = {}) {
  const sp = new URLSearchParams();
  if (params.unit_id) sp.set("unit_id", params.unit_id);
  if (params.on_date) sp.set("on_date", params.on_date);
  const qs = sp.toString();
  const url = `${API_BASE_URL}/api/admin/occupancy${qs ? `?${qs}` : ""}`;
  return fetch(url, { headers: getApiHeaders() }).then((res) => {
    if (!res.ok) throw new Error("Occupancy konnte nicht geladen werden.");
    return res.json();
  });
}

/**
 * Fetch per-room occupancy for a unit (for OccupancyMap). Params: unit_id (required), on_date? (YYYY-MM-DD).
 */
export function fetchAdminOccupancyRooms(params = {}) {
  const sp = new URLSearchParams();
  if (params.unit_id) sp.set("unit_id", params.unit_id);
  if (params.on_date) sp.set("on_date", params.on_date);
  const qs = sp.toString();
  const url = `${API_BASE_URL}/api/admin/occupancy/rooms?${qs}`;
  return fetch(url, { headers: getApiHeaders() }).then((res) => {
    if (!res.ok) throw new Error("Room occupancy konnte nicht geladen werden.");
    return res.json();
  });
}

/**
 * Fetch revenue forecast. Params: year, month? (1-12; if omitted returns full year).
 */
export function fetchAdminRevenueForecast(params = {}) {
  const sp = new URLSearchParams();
  if (params.year != null) sp.set("year", String(params.year));
  if (params.month != null) sp.set("month", String(params.month));
  if (params.unit_id) sp.set("unit_id", params.unit_id);
  const qs = sp.toString();
  const url = `${API_BASE_URL}/api/admin/revenue-forecast?${qs}`;
  return fetch(url, { headers: getApiHeaders() }).then((res) => {
    if (!res.ok) throw new Error("Revenue Forecast konnte nicht geladen werden.");
    return res.json();
  });
}

/**
 * Fetch invoice summary KPIs: open_invoices_count, paid_invoices_count,
 * overdue_invoices_count, open_invoices_amount.
 */
export function fetchAdminInvoiceSummary() {
  return fetch(`${API_BASE_URL}/api/admin/invoice-summary`, {
    headers: getApiHeaders(),
  }).then((res) => {
    if (!res.ok) throw new Error("Invoice summary konnte nicht geladen werden.");
    return res.json();
  });
}

/**
 * Fetch profit per unit (revenue - costs) for a given month.
 * Params: year?, month? (default current), unit_id? (optional filter).
 */
export function fetchAdminProfit(params = {}) {
  const sp = new URLSearchParams();
  if (params.year != null) sp.set("year", String(params.year));
  if (params.month != null) sp.set("month", String(params.month));
  if (params.unit_id) sp.set("unit_id", params.unit_id);
  const qs = sp.toString();
  const url = `${API_BASE_URL}/api/admin/profit${qs ? `?${qs}` : ""}`;
  return fetch(url, { headers: getApiHeaders() }).then((res) => {
    if (!res.ok) throw new Error("Profit konnte nicht geladen werden.");
    return res.json();
  });
}

/**
 * Dashboard KPIs: avg revenue per room, avg profit per unit, weakest/best unit,
 * vacant days, break-even, forecast, trend, warnings. Params: year?, month? (default current).
 */
export function fetchAdminDashboardKpis(params = {}) {
  const sp = new URLSearchParams();
  if (params.year != null) sp.set("year", String(params.year));
  if (params.month != null) sp.set("month", String(params.month));
  const qs = sp.toString();
  const url = `${API_BASE_URL}/api/admin/dashboard/kpis${qs ? `?${qs}` : ""}`;
  return fetch(url, { headers: getApiHeaders() }).then((res) => {
    if (!res.ok) throw new Error("KPI-Daten konnten nicht geladen werden.");
    return res.json();
  });
}

/**
 * Landlords (Phase D). List, get, create, update.
 */
export function fetchAdminLandlords() {
  return fetch(`${API_BASE_URL}/api/admin/landlords`, { headers: getApiHeaders() }).then((res) => {
    if (!res.ok) throw new Error("Verwaltungen konnten nicht geladen werden.");
    return res.json();
  });
}

export function fetchAdminLandlord(id) {
  return fetch(`${API_BASE_URL}/api/admin/landlords/${encodeURIComponent(id)}`, {
    headers: getApiHeaders(),
  }).then((res) => {
    if (!res.ok) {
      if (res.status === 404) return null;
      throw new Error("Verwaltung konnte nicht geladen werden.");
    }
    return res.json();
  });
}

export function createAdminLandlord(body) {
  return fetch(`${API_BASE_URL}/api/admin/landlords`, {
    method: "POST",
    headers: getApiHeaders(),
    body: JSON.stringify(body),
  }).then((res) => {
    if (!res.ok) throw new Error("Verwaltung konnte nicht erstellt werden.");
    return res.json();
  });
}

export function updateAdminLandlord(id, body) {
  return fetch(`${API_BASE_URL}/api/admin/landlords/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: getApiHeaders(),
    body: JSON.stringify(body),
  }).then((res) => {
    if (!res.ok) throw new Error("Verwaltung konnte nicht gespeichert werden.");
    return res.json();
  });
}

/**
 * Properties (Phase D). List, get, create, update.
 */
export function fetchAdminProperties() {
  return fetch(`${API_BASE_URL}/api/admin/properties`, { headers: getApiHeaders() }).then((res) => {
    if (!res.ok) throw new Error("Liegenschaften konnten nicht geladen werden.");
    return res.json();
  });
}

export function fetchAdminProperty(id) {
  return fetch(`${API_BASE_URL}/api/admin/properties/${encodeURIComponent(id)}`, {
    headers: getApiHeaders(),
  }).then((res) => {
    if (!res.ok) {
      if (res.status === 404) return null;
      throw new Error("Liegenschaft konnte nicht geladen werden.");
    }
    return res.json();
  });
}

export function createAdminProperty(body) {
  return fetch(`${API_BASE_URL}/api/admin/properties`, {
    method: "POST",
    headers: getApiHeaders(),
    body: JSON.stringify(body),
  }).then((res) => {
    if (!res.ok) throw new Error("Liegenschaft konnte nicht erstellt werden.");
    return res.json();
  });
}

export function updateAdminProperty(id, body) {
  return fetch(`${API_BASE_URL}/api/admin/properties/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: getApiHeaders(),
    body: JSON.stringify(body),
  }).then((res) => {
    if (!res.ok) throw new Error("Liegenschaft konnte nicht gespeichert werden.");
    return res.json();
  });
}
