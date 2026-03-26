/**
 * Admin API: units, rooms, tenants from PostgreSQL.
 * Use getApiHeaders() so requests are authenticated.
 *
 * Paginated endpoints return { items, total, skip, limit }. This layer normalizes
 * to a plain array of items so consumers never guess response shape. Invalid
 * shapes throw instead of returning [] to avoid fake-stability masking.
 */
import { API_BASE_URL, getApiHeaders } from "../config";

/**
 * Normalize paginated API response to items array. Throws if shape is invalid.
 * @param {unknown} data - Raw JSON response
 * @param {string} endpointLabel - For error message
 * @returns {unknown[]} items array
 */
function expectPaginatedItems(data, endpointLabel) {
  if (data != null && typeof data === "object" && Array.isArray(data.items)) {
    return data.items;
  }
  throw new Error(
    `Ungültige Antwort von ${endpointLabel}: erwartet paginierte Antwort mit "items".`
  );
}

/**
 * Parse FastAPI-style error JSON from a response body string (already read once).
 */
function detailItemToMessage(d) {
  if (typeof d === "string") return d;
  if (d && typeof d === "object") {
    if (typeof d.msg === "string" && d.msg) return d.msg;
    if (typeof d.message === "string" && d.message) return d.message;
    const ctx = d.ctx;
    if (ctx && typeof ctx === "object") {
      if (typeof ctx.reason === "string" && ctx.reason) return ctx.reason;
      if (typeof ctx.error === "string" && ctx.error) return ctx.error;
    }
  }
  return "";
}

function parseAdminErrorBodyText(text) {
  try {
    const j = JSON.parse(text);
    if (Array.isArray(j.detail)) {
      const joined = j.detail
        .map(detailItemToMessage)
        .filter(Boolean)
        .join(" ");
      if (joined) return joined;
    }
    if (typeof j.detail === "string") return j.detail;
    if (j.detail && typeof j.detail === "object" && !Array.isArray(j.detail)) {
      const m = detailItemToMessage(j.detail);
      if (m) return m;
    }
  } catch (_) {
    /* ignore */
  }
  return text || "Die Anfrage ist fehlgeschlagen.";
}

async function parseAdminErrorResponse(res) {
  let text;
  try {
    text = await res.text();
  } catch (e) {
    const m = e && e.message;
    if (typeof m === "string" && m.includes("body stream already read")) {
      return `HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ""}`;
    }
    throw e;
  }
  let msg = parseAdminErrorBodyText(text).trim();
  if (!msg || msg === "Die Anfrage ist fehlgeschlagen.") {
    msg = `HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ""}`;
  }
  return msg;
}

export function fetchAdminUnits() {
  return fetch(`${API_BASE_URL}/api/admin/units`, { headers: getApiHeaders() })
    .then((res) => {
      if (!res.ok) throw new Error("Units konnten nicht geladen werden.");
      return res.json();
    })
    .then((data) => expectPaginatedItems(data, "GET /api/admin/units"));
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

export async function createAdminUnit(body) {
  const res = await fetch(`${API_BASE_URL}/api/admin/units`, {
    method: "POST",
    headers: getApiHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(await parseAdminErrorResponse(res));
  }
  return res.json();
}

export async function updateAdminUnit(id, body) {
  const res = await fetch(`${API_BASE_URL}/api/admin/units/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: getApiHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(await parseAdminErrorResponse(res));
  }
  return res.json();
}

export async function deleteAdminUnit(id) {
  const res = await fetch(
    `${API_BASE_URL}/api/admin/units/${encodeURIComponent(id)}`,
    { method: "DELETE", headers: getApiHeaders() }
  );

  let responseData = null;
  try {
    responseData = await res.json();
  } catch (_) {}

  if (!res.ok) {
    let msg =
      responseData && typeof responseData.detail === "string"
        ? responseData.detail
        : "";

    if (!msg && res.status === 400) {
      msg =
        "Unit kann nicht gelöscht werden, da noch Zimmer oder Mietverhältnisse vorhanden sind.";
    }

    if (!msg) {
      msg = `HTTP ${res.status}`;
    }

    throw new Error(msg);
  }

  return responseData || { status: "ok" };
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

/**
 * @param {{ skip?: number, limit?: number, q?: string }} [params]
 */
export function fetchAdminTenants(params = {}) {
  const sp = new URLSearchParams();
  if (params.skip != null) sp.set("skip", String(params.skip));
  if (params.limit != null) sp.set("limit", String(params.limit));
  if (params.q != null && String(params.q).trim()) {
    sp.set("q", String(params.q).trim());
  }
  const qs = sp.toString();
  const url = `${API_BASE_URL}/api/admin/tenants${qs ? `?${qs}` : ""}`;
  return fetch(url, { headers: getApiHeaders() })
    .then((res) => {
      if (!res.ok) throw new Error("Tenants konnten nicht geladen werden.");
      return res.json();
    })
    .then((data) => expectPaginatedItems(data, "GET /api/admin/tenants"));
}

export function fetchAdminTenant(tenantId) {
  return fetch(
    `${API_BASE_URL}/api/admin/tenants/${encodeURIComponent(tenantId)}`,
    { headers: getApiHeaders() }
  ).then((res) => {
    if (!res.ok) {
      if (res.status === 404) return null;
      throw new Error("Mieter konnte nicht geladen werden.");
    }
    return res.json();
  });
}

export async function createAdminTenant(body) {
  const res = await fetch(`${API_BASE_URL}/api/admin/tenants`, {
    method: "POST",
    headers: getApiHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(await parseAdminErrorResponse(res));
  }
  return res.json();
}

export async function updateAdminTenant(tenantId, body) {
  const res = await fetch(
    `${API_BASE_URL}/api/admin/tenants/${encodeURIComponent(tenantId)}`,
    {
      method: "PATCH",
      headers: getApiHeaders(),
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) {
    throw new Error(await parseAdminErrorResponse(res));
  }
  return res.json();
}

export async function deleteAdminTenant(tenantId) {
  const res = await fetch(
    `${API_BASE_URL}/api/admin/tenants/${encodeURIComponent(tenantId)}`,
    { method: "DELETE", headers: getApiHeaders() }
  );
  const text = await res.text();
  if (!res.ok) {
    let msg = parseAdminErrorBodyText(text).trim();
    if (!msg || msg === "Die Anfrage ist fehlgeschlagen.") {
      msg = `HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ""}`;
    }
    throw new Error(msg);
  }
  if (!text || !text.trim()) return { status: "ok" };
  try {
    return JSON.parse(text);
  } catch {
    return { status: "ok" };
  }
}

export function fetchAdminTenantNotes(tenantId) {
  return fetch(
    `${API_BASE_URL}/api/admin/tenants/${encodeURIComponent(tenantId)}/notes`,
    { headers: getApiHeaders() }
  ).then((res) => {
    if (!res.ok) {
      if (res.status === 404) return { items: [] };
      throw new Error("Notizen konnten nicht geladen werden.");
    }
    return res.json();
  });
}

export async function createAdminTenantNote(tenantId, content) {
  const res = await fetch(
    `${API_BASE_URL}/api/admin/tenants/${encodeURIComponent(tenantId)}/notes`,
    {
      method: "POST",
      headers: getApiHeaders(),
      body: JSON.stringify({ content }),
    }
  );
  // Read body exactly once — avoids "body stream already read" if anything else touched the stream.
  const text = await res.text();
  if (!res.ok) {
    throw new Error(parseAdminErrorBodyText(text));
  }
  try {
    return text ? JSON.parse(text) : {};
  } catch (e) {
    console.warn("createAdminTenantNote: unexpected response body", e);
    throw new Error("Notiz konnte nicht gespeichert werden.");
  }
}

export function fetchAdminTenantEvents(tenantId) {
  return fetch(
    `${API_BASE_URL}/api/admin/tenants/${encodeURIComponent(tenantId)}/events`,
    { headers: getApiHeaders() }
  ).then((res) => {
    if (!res.ok) {
      if (res.status === 404) return { items: [] };
      throw new Error("Verlauf konnte nicht geladen werden.");
    }
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
  if (params.tenant_id) sp.set("tenant_id", params.tenant_id);
  if (params.status) sp.set("status", params.status);
  if (params.limit != null) sp.set("limit", String(params.limit));
  if (params.skip != null) sp.set("skip", String(params.skip));
  const qs = sp.toString();
  const url = `${API_BASE_URL}/api/admin/tenancies${qs ? `?${qs}` : ""}`;
  return fetch(url, { headers: getApiHeaders() })
    .then((res) => {
      if (!res.ok) throw new Error("Tenancies konnten nicht geladen werden.");
      return res.json();
    })
    .then((data) => expectPaginatedItems(data, "GET /api/admin/tenancies"));
}

export async function patchAdminTenancy(tenancyId, body) {
  const res = await fetch(
    `${API_BASE_URL}/api/admin/tenancies/${encodeURIComponent(tenancyId)}`,
    {
      method: "PATCH",
      headers: getApiHeaders(),
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) {
    throw new Error(await parseAdminErrorResponse(res));
  }
  return res.json();
}

/**
 * Fetch invoices (GET /api/invoices).
 * Without args: all org invoices; returns items array (paginated shape normalized).
 * With { tenantId, limit }: filtered by tenant; returns full JSON { items, total, skip, limit }.
 */
export async function fetchAdminInvoices(options) {
  if (
    options != null &&
    typeof options === "object" &&
    options.tenantId != null &&
    options.tenantId !== ""
  ) {
    const { tenantId, limit = 20 } = options;
    const url = `${API_BASE_URL}/api/invoices?tenant_id=${encodeURIComponent(tenantId)}&limit=${limit}`;
    const res = await fetch(url, { headers: getApiHeaders() });
    if (!res.ok) {
      throw new Error("Failed to fetch invoices");
    }
    return res.json();
  }
  const res = await fetch(`${API_BASE_URL}/api/invoices`, { headers: getApiHeaders() });
  if (!res.ok) {
    throw new Error("Rechnungen konnten nicht geladen werden.");
  }
  const data = await res.json();
  return expectPaginatedItems(data, "GET /api/invoices");
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
    status:
      r.status ??
      (r.is_active === false ? "Inaktiv" : "Frei"),
    roomName: r.roomName ?? r.name,
    size_m2: r.size_m2 ?? null,
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
 * Strip browser/extension noise (e.g. postMessage) from user-facing error text.
 * Logs the raw message to the console; callers should show the returned string only.
 */
export function sanitizeClientErrorMessage(message, fallback) {
  const raw = String(message || "");
  if (/postmessage/i.test(raw) || /target origin/i.test(raw)) {
    console.warn("Ignored non-actionable error:", raw);
    return fallback || "Ein unerwarteter Fehler ist aufgetreten.";
  }
  return raw || fallback || "";
}

function sanitizeNonActionableUiMessage(msg) {
  const raw = String(msg || "");
  if (/postmessage/i.test(raw) || /target origin/i.test(raw)) {
    console.warn("Ignored non-actionable error:", raw);
    return "";
  }
  return raw;
}

/**
 * Normalize fetch failure for dashboard: "Failed to fetch" means network/CORS/server unreachable.
 * Exported so overview page can use the same message for operations load errors.
 */
export function normalizeFetchError(e, fallbackMessage) {
  const msg = e?.message || "";
  if (msg === "Failed to fetch" || msg.includes("Load failed") || msg.includes("NetworkError")) {
    return new Error(
      "Verbindung zum Server fehlgeschlagen. Bitte Backend-URL (REACT_APP_API_URL) und CORS prüfen."
    );
  }
  const base = e instanceof Error ? e : new Error(fallbackMessage);
  const cleaned = sanitizeNonActionableUiMessage(base.message);
  if (!cleaned) {
    return new Error(fallbackMessage);
  }
  return new Error(cleaned);
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
  return fetch(url, { headers: getApiHeaders() })
    .then((res) => {
      if (!res.ok) throw new Error("KPI-Daten konnten nicht geladen werden.");
      return res.json();
    })
    .catch((e) => {
      throw normalizeFetchError(e, "KPI-Daten konnten nicht geladen werden.");
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
