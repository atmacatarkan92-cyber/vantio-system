/**
 * Admin API: units, rooms, tenants from PostgreSQL.
 * Use getApiHeaders() so requests are authenticated.
 *
 * Paginated endpoints return { items, total, skip, limit }. This layer normalizes
 * to a plain array of items so consumers never guess response shape. Invalid
 * shapes throw instead of returning [] to avoid fake-stability masking.
 */
import { API_BASE_URL, getApiHeaders, getApiHeadersMultipart } from "../config";

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
    throw new Error(String(e?.message ?? e));
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

export function fetchAdminUnitCosts(unitId) {
  return fetch(
    `${API_BASE_URL}/api/admin/units/${encodeURIComponent(unitId)}/costs`,
    { headers: getApiHeaders() }
  ).then((res) => {
    if (!res.ok) throw new Error("Zusätzliche Kosten konnten nicht geladen werden.");
    return res.json();
  });
}

export async function createAdminUnitCost(unitId, body) {
  const res = await fetch(
    `${API_BASE_URL}/api/admin/units/${encodeURIComponent(unitId)}/costs`,
    {
      method: "POST",
      headers: getApiHeaders(),
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) {
    throw new Error(await parseAdminErrorResponse(res));
  }
  return res.json();
}

export async function updateAdminUnitCost(unitId, costId, body) {
  const res = await fetch(
    `${API_BASE_URL}/api/admin/units/${encodeURIComponent(unitId)}/costs/${encodeURIComponent(costId)}`,
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

export async function deleteAdminUnitCost(unitId, costId) {
  const res = await fetch(
    `${API_BASE_URL}/api/admin/units/${encodeURIComponent(unitId)}/costs/${encodeURIComponent(costId)}`,
    { method: "DELETE", headers: getApiHeaders() }
  );
  if (!res.ok) {
    throw new Error(await parseAdminErrorResponse(res));
  }
  try {
    return await res.json();
  } catch {
    return { status: "ok" };
  }
}

/**
 * Audit log entries for an entity (e.g. unit). GET /api/admin/audit-logs
 */
export function fetchAdminAuditLogs(params) {
  const sp = new URLSearchParams();
  sp.set("entity_type", params.entity_type);
  sp.set("entity_id", params.entity_id);
  const url = `${API_BASE_URL}/api/admin/audit-logs?${sp.toString()}`;
  return fetch(url, { headers: getApiHeaders() }).then((res) => {
    if (!res.ok) throw new Error("Verlauf konnte nicht geladen werden.");
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
        "Unit kann nicht gelöscht werden, da noch verknüpfte Daten vorhanden sind.";
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

export async function deleteAdminRoom(roomId) {
  const res = await fetch(
    `${API_BASE_URL}/api/admin/rooms/${encodeURIComponent(roomId)}`,
    { method: "DELETE", headers: getApiHeaders() }
  );
  if (!res.ok) {
    throw new Error(await parseAdminErrorResponse(res));
  }
  try {
    return await res.json();
  } catch {
    return { status: "ok" };
  }
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

/**
 * Fetch all tenancies for the org (pages through limit=200 until exhausted).
 */
export async function fetchAdminTenanciesAll(params = {}) {
  const limit = 200;
  let skip = 0;
  const all = [];
  for (;;) {
    const batch = await fetchAdminTenancies({ ...params, limit, skip });
    if (!Array.isArray(batch) || batch.length === 0) break;
    all.push(...batch);
    if (batch.length < limit) break;
    skip += limit;
  }
  return all;
}

/**
 * Create a tenancy (POST /api/admin/tenancies). Optional `participants` for multi-person contracts.
 */
export async function createAdminTenancy(body) {
  const res = await fetch(`${API_BASE_URL}/api/admin/tenancies`, {
    method: "POST",
    headers: getApiHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(await parseAdminErrorResponse(res));
  }
  return res.json();
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

export function fetchAdminTenancyRevenue(tenancyId) {
  return fetch(
    `${API_BASE_URL}/api/admin/tenancies/${encodeURIComponent(tenancyId)}/revenue`,
    { headers: getApiHeaders() }
  ).then((res) => {
    if (!res.ok) throw new Error("Einnahmen konnten nicht geladen werden.");
    return res.json();
  });
}

export async function createAdminTenancyRevenue(tenancyId, body) {
  const res = await fetch(
    `${API_BASE_URL}/api/admin/tenancies/${encodeURIComponent(tenancyId)}/revenue`,
    {
      method: "POST",
      headers: getApiHeaders(),
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) {
    throw new Error(await parseAdminErrorResponse(res));
  }
  return res.json();
}

export async function patchAdminTenancyRevenue(revenueId, body) {
  const res = await fetch(
    `${API_BASE_URL}/api/admin/tenancy-revenue/${encodeURIComponent(revenueId)}`,
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

export async function deleteAdminTenancyRevenue(revenueId) {
  const res = await fetch(
    `${API_BASE_URL}/api/admin/tenancy-revenue/${encodeURIComponent(revenueId)}`,
    { method: "DELETE", headers: getApiHeaders() }
  );
  if (!res.ok) {
    throw new Error(await parseAdminErrorResponse(res));
  }
  try {
    return await res.json();
  } catch {
    return { status: "ok" };
  }
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
    tenantPriceMonthly: u.tenantPriceMonthly ?? u.tenant_price_monthly_chf ?? "",
    landlordRentMonthly: u.landlordRentMonthly ?? u.landlord_rent_monthly_chf ?? "",
    utilitiesMonthly: u.utilitiesMonthly ?? u.utilities_monthly_chf ?? "",
    cleaningCostMonthly: u.cleaningCostMonthly ?? u.cleaning_cost_monthly_chf ?? "",
    landlordLeaseStartDate: u.landlordLeaseStartDate ?? u.landlord_lease_start_date ?? "",
    availableFrom: u.availableFrom ?? u.available_from ?? "",
    status: u.status ?? u.occupancy_status ?? "Frei",
    occupiedRooms: u.occupiedRooms ?? u.occupied_rooms ?? 0,
    zip: u.zip ?? u.postal_code ?? "",
    landlordDepositType: u.landlordDepositType ?? u.landlord_deposit_type ?? "",
    landlordDepositAmount:
      u.landlordDepositAmount ?? u.landlord_deposit_amount ?? "",
    landlordDepositAnnualPremium:
      u.landlordDepositAnnualPremium ?? u.landlord_deposit_annual_premium ?? "",
    landlord_id: u.landlord_id ?? null,
    property_manager_id: u.property_manager_id ?? null,
    owner_id: u.owner_id ?? null,
    ownerName: u.ownerName ?? u.owner_name ?? null,
    leaseType: u.leaseType ?? u.lease_type ?? "",
    leaseStartDate: u.leaseStartDate ?? u.lease_start_date ?? "",
    leaseEndDate: u.leaseEndDate ?? u.lease_end_date ?? "",
    noticeGivenDate: u.noticeGivenDate ?? u.notice_given_date ?? "",
    terminationEffectiveDate:
      u.terminationEffectiveDate ?? u.termination_effective_date ?? "",
    returnedToLandlordDate:
      u.returnedToLandlordDate ?? u.returned_to_landlord_date ?? "",
    leaseStatus: u.leaseStatus ?? u.lease_status ?? "",
    leaseNotes: u.leaseNotes ?? u.lease_notes ?? "",
  };
}

/**
 * Normalize room from API for pages that expect unitId, status, priceMonthly.
 * room.price / priceMonthly = planned target rent (Soll); actual rent is on tenancy.
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
 * Revenue/costs match backend `revenue_forecast` + `profit_service` for the period.
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
 * Landlords (Phase D). List, get, create, update, soft-delete (archive).
 */
export function fetchAdminLandlords(status = "active") {
  const q = status ? `?status=${encodeURIComponent(status)}` : "";
  return fetch(`${API_BASE_URL}/api/admin/landlords${q}`, { headers: getApiHeaders() }).then((res) => {
    if (!res.ok) throw new Error("Verwaltungen konnten nicht geladen werden.");
    return res.json();
  });
}

export function fetchAdminLandlord(id) {
  const base = `${API_BASE_URL}/api/admin/landlords/${encodeURIComponent(id)}`;
  const sep = base.includes("?") ? "&" : "?";
  return fetch(`${base}${sep}_=${Date.now()}`, {
    headers: getApiHeaders(),
  }).then((res) => {
    if (!res.ok) {
      if (res.status === 404) return null;
      throw new Error("Verwaltung konnte nicht geladen werden.");
    }
    return res.json();
  });
}

export function fetchAdminLandlordProperties(landlordId) {
  return fetch(
    `${API_BASE_URL}/api/admin/landlords/${encodeURIComponent(landlordId)}/properties`,
    { headers: getApiHeaders() }
  ).then((res) => {
    if (!res.ok) {
      if (res.status === 404) return [];
      throw new Error("Liegenschaften konnten nicht geladen werden.");
    }
    return res.json();
  });
}

export function fetchAdminLandlordUnits(landlordId) {
  return fetch(
    `${API_BASE_URL}/api/admin/landlords/${encodeURIComponent(landlordId)}/units`,
    { headers: getApiHeaders() }
  ).then((res) => {
    if (!res.ok) {
      if (res.status === 404) return [];
      throw new Error("Units konnten nicht geladen werden.");
    }
    return res.json();
  });
}

export function fetchAdminLandlordPropertyManagers(landlordId) {
  return fetch(
    `${API_BASE_URL}/api/admin/landlords/${encodeURIComponent(landlordId)}/property-managers`,
    { headers: getApiHeaders() }
  ).then((res) => {
    if (!res.ok) {
      if (res.status === 404) return [];
      throw new Error("Bewirtschafter konnten nicht geladen werden.");
    }
    return res.json();
  });
}

export function fetchAdminLandlordNotes(landlordId) {
  return fetch(
    `${API_BASE_URL}/api/admin/landlords/${encodeURIComponent(landlordId)}/notes`,
    { headers: getApiHeaders() }
  ).then((res) => {
    if (!res.ok) {
      if (res.status === 404) return { items: [] };
      throw new Error("Notizen konnten nicht geladen werden.");
    }
    return res.json();
  });
}

export async function createAdminLandlordNote(landlordId, content) {
  const res = await fetch(
    `${API_BASE_URL}/api/admin/landlords/${encodeURIComponent(landlordId)}/notes`,
    {
      method: "POST",
      headers: getApiHeaders(),
      body: JSON.stringify({ content }),
    }
  );
  const text = await res.text();
  if (!res.ok) {
    throw new Error(parseAdminErrorBodyText(text));
  }
  try {
    return text ? JSON.parse(text) : {};
  } catch (e) {
    console.warn("createAdminLandlordNote: unexpected response body", e);
    throw new Error("Notiz konnte nicht gespeichert werden.");
  }
}

export async function updateAdminLandlordNote(landlordId, noteId, content) {
  const res = await fetch(
    `${API_BASE_URL}/api/admin/landlords/${encodeURIComponent(landlordId)}/notes/${encodeURIComponent(noteId)}`,
    {
      method: "PUT",
      headers: getApiHeaders(),
      body: JSON.stringify({ content }),
    }
  );
  const text = await res.text();
  if (!res.ok) {
    throw new Error(parseAdminErrorBodyText(text));
  }
  try {
    return text ? JSON.parse(text) : {};
  } catch (e) {
    console.warn("updateAdminLandlordNote: unexpected response body", e);
    throw new Error("Notiz konnte nicht gespeichert werden.");
  }
}

export function verifyAdminAddress(body) {
  return fetch(`${API_BASE_URL}/api/admin/address/verify`, {
    method: "POST",
    headers: getApiHeaders(),
    body: JSON.stringify({
      address_line1: body.address_line1 ?? "",
      postal_code: body.postal_code ?? "",
      city: body.city ?? "",
    }),
  }).then(async (res) => {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(
        typeof data.detail === "string" ? data.detail : "Adressprüfung fehlgeschlagen."
      );
    }
    return data;
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

export function deleteAdminLandlord(id) {
  return fetch(`${API_BASE_URL}/api/admin/landlords/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: getApiHeaders(),
  }).then((res) => {
    if (!res.ok) {
      if (res.status === 404) throw new Error("Verwaltung nicht gefunden.");
      throw new Error("Archivieren fehlgeschlagen.");
    }
    return res.json();
  });
}

export function restoreAdminLandlord(id) {
  return fetch(`${API_BASE_URL}/api/admin/landlords/${encodeURIComponent(id)}/restore`, {
    method: "POST",
    headers: getApiHeaders(),
  }).then((res) => {
    if (!res.ok) {
      if (res.status === 404) throw new Error("Verwaltung nicht gefunden.");
      throw new Error("Reaktivieren fehlgeschlagen.");
    }
    return res.json();
  });
}

/**
 * Property managers (Bewirtschafter). List; create/update for admin page.
 */
export function fetchAdminPropertyManagers() {
  return fetch(`${API_BASE_URL}/api/admin/property-managers`, {
    headers: getApiHeaders(),
  }).then((res) => {
    if (!res.ok) throw new Error("Bewirtschafter konnten nicht geladen werden.");
    return res.json();
  });
}

export function fetchAdminPropertyManager(id) {
  const base = `${API_BASE_URL}/api/admin/property-managers/${encodeURIComponent(id)}`;
  const sep = base.includes("?") ? "&" : "?";
  return fetch(`${base}${sep}_=${Date.now()}`, {
    headers: getApiHeaders(),
  }).then((res) => {
    if (!res.ok) {
      if (res.status === 404) return null;
      throw new Error("Bewirtschafter konnte nicht geladen werden.");
    }
    return res.json();
  });
}

export function fetchAdminPropertyManagerUnits(propertyManagerId) {
  return fetch(
    `${API_BASE_URL}/api/admin/property-managers/${encodeURIComponent(propertyManagerId)}/units`,
    { headers: getApiHeaders() }
  ).then((res) => {
    if (!res.ok) {
      if (res.status === 404) return [];
      throw new Error("Units konnten nicht geladen werden.");
    }
    return res.json();
  });
}

export function fetchAdminPropertyManagerNotes(propertyManagerId) {
  return fetch(
    `${API_BASE_URL}/api/admin/property-managers/${encodeURIComponent(propertyManagerId)}/notes`,
    { headers: getApiHeaders() }
  ).then((res) => {
    if (!res.ok) {
      if (res.status === 404) return { items: [] };
      throw new Error("Notizen konnten nicht geladen werden.");
    }
    return res.json();
  });
}

export async function createAdminPropertyManagerNote(propertyManagerId, content) {
  const res = await fetch(
    `${API_BASE_URL}/api/admin/property-managers/${encodeURIComponent(propertyManagerId)}/notes`,
    {
      method: "POST",
      headers: getApiHeaders(),
      body: JSON.stringify({ content }),
    }
  );
  const text = await res.text();
  if (!res.ok) {
    throw new Error(parseAdminErrorBodyText(text));
  }
  try {
    return text ? JSON.parse(text) : {};
  } catch (e) {
    console.warn("createAdminPropertyManagerNote: unexpected response body", e);
    throw new Error("Notiz konnte nicht gespeichert werden.");
  }
}

export async function createAdminPropertyManager(body) {
  const res = await fetch(`${API_BASE_URL}/api/admin/property-managers`, {
    method: "POST",
    headers: getApiHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(await parseAdminErrorResponse(res));
  }
  return res.json();
}

export async function patchAdminPropertyManager(id, body) {
  const res = await fetch(`${API_BASE_URL}/api/admin/property-managers/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: getApiHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(await parseAdminErrorResponse(res));
  }
  return res.json();
}

/**
 * Owners (Eigentümer). List, get, create, update — minimal API for CRM integration.
 */
export function fetchAdminOwners() {
  return fetch(`${API_BASE_URL}/api/admin/owners`, { headers: getApiHeaders() })
    .then((res) => {
      if (!res.ok) throw new Error("Eigentümer konnten nicht geladen werden.");
      return res.json();
    })
    .then((data) => {
      if (Array.isArray(data)) {
        return { items: data, owners_with_units_count: 0 };
      }
      return {
        items: Array.isArray(data.items) ? data.items : [],
        owners_with_units_count:
          typeof data.owners_with_units_count === "number" ? data.owners_with_units_count : 0,
      };
    });
}

export function fetchAdminOwnerUnits(ownerId) {
  return fetch(
    `${API_BASE_URL}/api/admin/owners/${encodeURIComponent(ownerId)}/units`,
    { headers: getApiHeaders() }
  ).then((res) => {
    if (!res.ok) {
      if (res.status === 404) return [];
      throw new Error("Units konnten nicht geladen werden.");
    }
    return res.json();
  });
}

export function fetchAdminOwner(id) {
  const base = `${API_BASE_URL}/api/admin/owners/${encodeURIComponent(id)}`;
  const sep = base.includes("?") ? "&" : "?";
  return fetch(`${base}${sep}_=${Date.now()}`, {
    headers: getApiHeaders(),
  }).then((res) => {
    if (!res.ok) {
      if (res.status === 404) return null;
      throw new Error("Eigentümer konnte nicht geladen werden.");
    }
    return res.json();
  });
}

export async function createAdminOwner(body) {
  const res = await fetch(`${API_BASE_URL}/api/admin/owners`, {
    method: "POST",
    headers: getApiHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(await parseAdminErrorResponse(res));
  }
  return res.json();
}

export async function patchAdminOwner(id, body) {
  const res = await fetch(`${API_BASE_URL}/api/admin/owners/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: getApiHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(await parseAdminErrorResponse(res));
  }
  return res.json();
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

export function fetchAdminUnitDocuments(unitId) {
  return fetch(
    `${API_BASE_URL}/api/admin/unit-documents?unit_id=${encodeURIComponent(unitId)}`,
    { headers: getApiHeaders() }
  )
    .then((res) => {
      if (!res.ok) throw new Error("Dokumente konnten nicht geladen werden.");
      return res.json();
    })
    .then((data) => {
      if (data != null && typeof data === "object" && Array.isArray(data.items)) {
        return data.items;
      }
      throw new Error('Ungültige Antwort: erwartet { items: [] }.');
    });
}

export async function uploadAdminUnitDocument(unitId, file, options = {}) {
  const fd = new FormData();
  fd.append("unit_id", unitId);
  fd.append("file", file);
  const cat = options.category != null ? String(options.category).trim() : "";
  if (cat) fd.append("category", cat);
  const res = await fetch(`${API_BASE_URL}/api/admin/unit-documents`, {
    method: "POST",
    headers: getApiHeadersMultipart(),
    body: fd,
  });
  if (!res.ok) {
    throw new Error(await parseAdminErrorResponse(res));
  }
  return res.json();
}

export function fetchAdminUnitDocumentDownloadUrl(documentId) {
  return fetch(
    `${API_BASE_URL}/api/admin/unit-documents/${encodeURIComponent(documentId)}/download`,
    { headers: getApiHeaders() }
  ).then(async (res) => {
    if (!res.ok) throw new Error(await parseAdminErrorResponse(res));
    return res.json();
  });
}

export async function deleteAdminUnitDocument(documentId) {
  const res = await fetch(`${API_BASE_URL}/api/admin/unit-documents/${encodeURIComponent(documentId)}`, {
    method: "DELETE",
    headers: getApiHeaders(),
  });
  if (!res.ok) {
    throw new Error(await parseAdminErrorResponse(res));
  }
  return res.json();
}

export function fetchAdminTenantDocuments(tenantId) {
  return fetch(
    `${API_BASE_URL}/api/admin/tenant-documents?tenant_id=${encodeURIComponent(tenantId)}`,
    { headers: getApiHeaders() }
  )
    .then((res) => {
      if (!res.ok) throw new Error("Dokumente konnten nicht geladen werden.");
      return res.json();
    })
    .then((data) => {
      if (data != null && typeof data === "object" && Array.isArray(data.items)) {
        return data.items;
      }
      throw new Error('Ungültige Antwort: erwartet { items: [] }.');
    });
}

export async function uploadAdminTenantDocument(tenantId, file, options = {}) {
  const fd = new FormData();
  fd.append("tenant_id", tenantId);
  fd.append("file", file);
  const cat = options.category != null ? String(options.category).trim() : "";
  if (cat) fd.append("category", cat);
  const res = await fetch(`${API_BASE_URL}/api/admin/tenant-documents`, {
    method: "POST",
    headers: getApiHeadersMultipart(),
    body: fd,
  });
  if (!res.ok) {
    throw new Error(await parseAdminErrorResponse(res));
  }
  return res.json();
}

export function fetchAdminTenantDocumentDownloadUrl(documentId) {
  return fetch(
    `${API_BASE_URL}/api/admin/tenant-documents/${encodeURIComponent(documentId)}/download`,
    { headers: getApiHeaders() }
  ).then(async (res) => {
    if (!res.ok) throw new Error(await parseAdminErrorResponse(res));
    return res.json();
  });
}

export async function deleteAdminTenantDocument(documentId) {
  const res = await fetch(`${API_BASE_URL}/api/admin/tenant-documents/${encodeURIComponent(documentId)}`, {
    method: "DELETE",
    headers: getApiHeaders(),
  });
  if (!res.ok) {
    throw new Error(await parseAdminErrorResponse(res));
  }
  return res.json();
}

export function fetchAdminLandlordDocuments(landlordId) {
  return fetch(
    `${API_BASE_URL}/api/admin/landlord-documents?landlord_id=${encodeURIComponent(landlordId)}`,
    { headers: getApiHeaders() }
  )
    .then((res) => {
      if (!res.ok) throw new Error("Dokumente konnten nicht geladen werden.");
      return res.json();
    })
    .then((data) => {
      if (data != null && typeof data === "object" && Array.isArray(data.items)) {
        return data.items;
      }
      throw new Error('Ungültige Antwort: erwartet { items: [] }.');
    });
}

export async function uploadAdminLandlordDocument(landlordId, file, options = {}) {
  const fd = new FormData();
  fd.append("landlord_id", landlordId);
  fd.append("file", file);
  const cat = options.category != null ? String(options.category).trim() : "";
  if (cat) fd.append("category", cat);
  const res = await fetch(`${API_BASE_URL}/api/admin/landlord-documents`, {
    method: "POST",
    headers: getApiHeadersMultipart(),
    body: fd,
  });
  if (!res.ok) {
    throw new Error(await parseAdminErrorResponse(res));
  }
  return res.json();
}

export function fetchAdminLandlordDocumentDownloadUrl(documentId) {
  return fetch(
    `${API_BASE_URL}/api/admin/landlord-documents/${encodeURIComponent(documentId)}/download`,
    { headers: getApiHeaders() }
  ).then(async (res) => {
    if (!res.ok) throw new Error(await parseAdminErrorResponse(res));
    return res.json();
  });
}

export async function deleteAdminLandlordDocument(documentId) {
  const res = await fetch(`${API_BASE_URL}/api/admin/landlord-documents/${encodeURIComponent(documentId)}`, {
    method: "DELETE",
    headers: getApiHeaders(),
  });
  if (!res.ok) {
    throw new Error(await parseAdminErrorResponse(res));
  }
  return res.json();
}

export function fetchAdminOwnerDocuments(ownerId) {
  return fetch(
    `${API_BASE_URL}/api/admin/owner-documents?owner_id=${encodeURIComponent(ownerId)}`,
    { headers: getApiHeaders() }
  )
    .then((res) => {
      if (!res.ok) throw new Error("Dokumente konnten nicht geladen werden.");
      return res.json();
    })
    .then((data) => {
      if (data != null && typeof data === "object" && Array.isArray(data.items)) {
        return data.items;
      }
      throw new Error('Ungültige Antwort: erwartet { items: [] }.');
    });
}

export async function uploadAdminOwnerDocument(ownerId, file, options = {}) {
  const fd = new FormData();
  fd.append("owner_id", ownerId);
  fd.append("file", file);
  const cat = options.category != null ? String(options.category).trim() : "";
  if (cat) fd.append("category", cat);
  const res = await fetch(`${API_BASE_URL}/api/admin/owner-documents`, {
    method: "POST",
    headers: getApiHeadersMultipart(),
    body: fd,
  });
  if (!res.ok) {
    throw new Error(await parseAdminErrorResponse(res));
  }
  return res.json();
}

export function fetchAdminOwnerDocumentDownloadUrl(documentId) {
  return fetch(
    `${API_BASE_URL}/api/admin/owner-documents/${encodeURIComponent(documentId)}/download`,
    { headers: getApiHeaders() }
  ).then(async (res) => {
    if (!res.ok) throw new Error(await parseAdminErrorResponse(res));
    return res.json();
  });
}

export async function deleteAdminOwnerDocument(documentId) {
  const res = await fetch(`${API_BASE_URL}/api/admin/owner-documents/${encodeURIComponent(documentId)}`, {
    method: "DELETE",
    headers: getApiHeaders(),
  });
  if (!res.ok) {
    throw new Error(await parseAdminErrorResponse(res));
  }
  return res.json();
}
