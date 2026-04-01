import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import RoomMap from "../../components/RoomMap";
import RoomCalendar from "../../components/RoomCalendar";
import OccupancyMap from "../../components/OccupancyMap";
import {
  fetchAdminUnit,
  fetchAdminRooms,
  deleteAdminRoom,
  fetchAdminOccupancyRooms,
  fetchAdminTenancies,
  fetchAdminTenant,
  fetchAdminLandlord,
  fetchAdminLandlords,
  fetchAdminOwners,
  fetchAdminProperties,
  fetchAdminPropertyManagers,
  fetchAdminAuditLogs,
  fetchAdminUnitDocuments,
  uploadAdminUnitDocument,
  fetchAdminUnitDocumentDownloadUrl,
  deleteAdminUnitDocument,
  deleteAdminUnit,
  fetchAdminUnitCosts,
  createAdminUnitCost,
  updateAdminUnitCost,
  deleteAdminUnitCost,
  updateAdminUnit,
  fetchAdminProfit,
  fetchAdminOccupancy,
  fetchAdminTenancyRevenue,
  normalizeUnit,
  normalizeRoom,
} from "../../api/adminData";
import {
  getUnitOccupancyStatus,
  getRoomOccupancyStatus,
  getActiveTenancyForRoom,
  getFutureTenancyForRoom,
  formatOccupancyStatusDe,
  occupancyStatusBadgeTone,
  isLandlordContractLeaseStarted,
  getUnitContractState,
  getTodayIsoForOccupancy,
  parseIsoDate,
  isTenancyActiveByDates,
  isTenancyFuture,
} from "../../utils/unitOccupancyStatus";
import { getCoLivingMetrics } from "../../utils/adminUnitCoLivingMetrics";
import { getPhase4OperationalWarnings } from "../../utils/unitOperationalIntelligence";
import {
  getUnitCostsTotal,
  landlordDepositInsuranceMonthly,
  getUnitMonthlyRunningCosts,
  recurringUnitCostBreakdownWithInsurance,
  oneTimeUnitCostBreakdownEntries,
  totalOneTimeUnitCosts,
} from "../../utils/adminUnitRunningCosts";
import {
  aggregateRecurringMonthlyBreakdownRows,
  aggregateOneTimeBreakdownRows,
  aggregateOneTimeTotalFromRowArrays,
} from "../../utils/tenancyRevenueBreakdown";

const UNIT_AUDIT_FIELD_LABELS = {
  landlord_id: "Verwaltung",
  property_manager_id: "Bewirtschafter",
  owner_id: "Eigentümer",
  property_id: "Liegenschaft",
  title: "Titel",
  address: "Adresse",
  city: "Ort",
  postal_code: "PLZ",
  rooms: "Zimmeranzahl",
  type: "Typ",
  tenant_price_monthly_chf: "Mieterpreis",
  landlord_rent_monthly_chf: "Mietkosten Vermieter",
  utilities_monthly_chf: "Nebenkosten",
  cleaning_cost_monthly_chf: "Reinigung",
  occupancy_status: "Belegungsstatus",
  occupied_rooms: "belegte Zimmer",
  landlord_lease_start_date: "Mietstart Vermieter",
  available_from: "Verfügbar ab",
  landlord_deposit_type: "Kautionsart Vermieter",
  landlord_deposit_amount: "Kaution Vermieter",
  landlord_deposit_annual_premium: "Kautionsprämie",
};

/** Order for audit update lines (remaining keys sorted alphabetically after these). */
const AUDIT_UPDATE_FIELD_ORDER = [
  "landlord_id",
  "property_manager_id",
  "owner_id",
  "tenant_price_monthly_chf",
  "landlord_rent_monthly_chf",
  "occupancy_status",
];

function auditValuesEqual(a, b) {
  if (a === b) return true;
  if (a == null && b == null) return true;
  return JSON.stringify(a) === JSON.stringify(b);
}

function formatAuditTimestamp(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString("de-CH", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function auditActionLabel(action) {
  const a = String(action || "").toLowerCase();
  if (a === "create") return "Erstellt";
  if (a === "delete") return "Gelöscht";
  if (a === "update") return "Bearbeitet";
  return action || "—";
}

function roundCurrency(value) {
  return Math.round(Number(value || 0));
}

function formatCurrency(value) {
  return `CHF ${roundCurrency(value).toLocaleString("de-CH")}`;
}

function formatChfOrDash(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "-";
  }
  return formatCurrency(value);
}

function formatChfNetChange(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "-";
  }
  const n = roundCurrency(value);
  const sign = n >= 0 ? "+" : "−";
  return `${sign} CHF ${Math.abs(n).toLocaleString("de-CH")}`;
}

function formatPercent(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function getTodayDateString() {
  return new Date().toISOString().split("T")[0];
}


const LANDLORD_DEPOSIT_TYPE_LABELS = {
  bank: "Bankdepot",
  insurance: "Versicherung",
  cash: "Bareinzahlung",
  none: "Keine",
};

const LEASE_TYPE_LABELS = {
  open_ended: "Unbefristet",
  fixed_term: "Befristet",
};

const LEASE_STATUS_LABELS = {
  active: "Aktiv",
  notice_given: "Gekündigt",
  ended: "Beendet",
};

/** When unit.lease_status is empty: same rules as getUnitContractState, for read-only UI only. */
const DERIVED_LANDLORD_CONTRACT_STATE_LABELS = {
  active: "Laufend",
  expiring_soon: "Endet bald",
  expired: "Abgelaufen",
  ended: "Beendet",
  unknown: "Mietbeginn offen",
};

function landlordContractStateDerivedTone(state) {
  if (state === "expiring_soon") return "orange";
  if (state === "expired" || state === "ended") return "rose";
  if (state === "active") return "green";
  return "slate";
}

function dashEmpties(value) {
  if (value == null || value === "") return "—";
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return s;
}

function landlordLeaseTypeLabel(unit) {
  const k = String(unit.leaseType ?? unit.lease_type ?? "").trim();
  if (!k) return "—";
  return LEASE_TYPE_LABELS[k] || k;
}

function landlordLeaseContractStatus(unit) {
  return String(unit.leaseStatus ?? unit.lease_status ?? "").trim();
}

function landlordLeaseStatusBadgeTone(status) {
  if (status === "active") return "green";
  if (status === "notice_given") return "orange";
  if (status === "ended") return "rose";
  return "slate";
}

function landlordLeaseNotesDisplay(unit) {
  const n = unit.leaseNotes ?? unit.lease_notes;
  if (n == null || String(n).trim() === "") return "—";
  return String(n);
}

function calendarDaysUntil(dateStr) {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}/.test(String(dateStr))) return null;
  const y = Number(String(dateStr).slice(0, 4));
  const m = Number(String(dateStr).slice(5, 7)) - 1;
  const day = Number(String(dateStr).slice(8, 10));
  const end = Date.UTC(y, m, day);
  const now = new Date();
  const t0 = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((end - t0) / 86400000);
}

const AUDIT_CHF_KEYS = new Set([
  "tenant_price_monthly_chf",
  "landlord_rent_monthly_chf",
  "utilities_monthly_chf",
  "cleaning_cost_monthly_chf",
  "landlord_deposit_amount",
  "landlord_deposit_annual_premium",
]);

const AUDIT_DATE_KEYS = new Set(["landlord_lease_start_date", "available_from"]);

function auditFallbackIdDisplay(value) {
  if (value === null || value === undefined || value === "") return "—";
  const s = String(value);
  if (s.length > 24) return `${s.slice(0, 8)}…${s.slice(-4)}`;
  return s;
}

function sortAuditChangedFieldKeys(keys) {
  const priority = new Map(AUDIT_UPDATE_FIELD_ORDER.map((k, i) => [k, i]));
  return [...keys].sort((a, b) => {
    const pa = priority.has(a) ? priority.get(a) : 1000;
    const pb = priority.has(b) ? priority.get(b) : 1000;
    if (pa !== pb) return pa - pb;
    return a.localeCompare(b);
  });
}

function formatAuditFieldValue(key, value, resolvers) {
  const r = resolvers || {};
  if (value === null || value === undefined || value === "") return "—";
  if (key === "landlord_id") {
    const s = String(value);
    if (r.landlordById && r.landlordById[s]) return r.landlordById[s];
    return auditFallbackIdDisplay(s);
  }
  if (key === "property_manager_id") {
    const s = String(value);
    if (r.pmById && r.pmById[s]) return r.pmById[s];
    return auditFallbackIdDisplay(s);
  }
  if (key === "owner_id") {
    const s = String(value);
    if (r.ownerById && r.ownerById[s]) return r.ownerById[s];
    return auditFallbackIdDisplay(s);
  }
  if (key === "property_id") {
    const s = String(value);
    if (r.propertyById && r.propertyById[s]) return r.propertyById[s];
    return auditFallbackIdDisplay(s);
  }
  if (AUDIT_CHF_KEYS.has(key)) {
    const n = Number(value);
    if (Number.isNaN(n)) return String(value);
    return `CHF ${Math.round(n).toLocaleString("de-CH")}`;
  }
  if (AUDIT_DATE_KEYS.has(key)) {
    const s = String(value);
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return d.toLocaleDateString("de-CH");
    return s;
  }
  if (key === "landlord_deposit_type") {
    const k = String(value).toLowerCase();
    return LANDLORD_DEPOSIT_TYPE_LABELS[k] || String(value);
  }
  if (key === "city_id") {
    return auditFallbackIdDisplay(String(value));
  }
  if (key === "rooms" || key === "occupied_rooms") {
    const n = Number(value);
    if (Number.isNaN(n)) return String(value);
    return String(Math.round(n));
  }
  return String(value);
}

function buildAuditUpdateLines(entry, resolvers) {
  const rawOld = entry.old_values;
  const rawNew = entry.new_values;
  const oldV =
    rawOld != null && typeof rawOld === "object" && !Array.isArray(rawOld) ? rawOld : {};
  const newV =
    rawNew != null && typeof rawNew === "object" && !Array.isArray(rawNew) ? rawNew : {};

  const docExtraLines = [];
  if (newV.document_uploaded != null && String(newV.document_uploaded).trim() !== "") {
    docExtraLines.push(`Dokument hochgeladen: ${String(newV.document_uploaded)}`);
  }
  if (oldV.document_deleted != null && String(oldV.document_deleted).trim() !== "") {
    docExtraLines.push(`Dokument gelöscht: ${String(oldV.document_deleted)}`);
  }

  const hasOld = rawOld != null && typeof rawOld === "object" && !Array.isArray(rawOld);
  const hasNew = rawNew != null && typeof rawNew === "object" && !Array.isArray(rawNew);
  if (!hasOld || !hasNew) {
    return docExtraLines.length ? ["Unit bearbeitet", ...docExtraLines] : ["Unit bearbeitet"];
  }

  const keys = new Set([...Object.keys(oldV), ...Object.keys(newV)]);
  const changedKeys = [];
  for (const k of keys) {
    if (k === "document_uploaded" || k === "document_deleted") continue;
    if (auditValuesEqual(oldV[k], newV[k])) continue;
    if (!UNIT_AUDIT_FIELD_LABELS[k]) continue;
    changedKeys.push(k);
  }
  if (changedKeys.length === 0) {
    return docExtraLines.length ? ["Unit bearbeitet", ...docExtraLines] : ["Unit bearbeitet"];
  }
  const sorted = sortAuditChangedFieldKeys(changedKeys);
  const detailLines = sorted.map((k) => {
    const lbl = UNIT_AUDIT_FIELD_LABELS[k];
    const oldStr = formatAuditFieldValue(k, oldV[k], resolvers);
    const newStr = formatAuditFieldValue(k, newV[k], resolvers);
    return `${lbl} geändert: ${oldStr} → ${newStr}`;
  });
  const limited =
    detailLines.length <= 3
      ? detailLines
      : [...detailLines.slice(0, 3), "Weitere Änderungen"];
  return ["Unit bearbeitet", ...docExtraLines, ...limited];
}

function getAuditEntryDisplayLines(entry, resolvers) {
  const action = String(entry.action || "").toLowerCase();
  if (action === "create") return ["Unit erstellt"];
  if (action === "delete") return ["Unit gelöscht"];
  if (action === "update") return buildAuditUpdateLines(entry, resolvers);
  return ["Unit bearbeitet"];
}

function formatTenancyMoveIn(iso) {
  if (!iso) return "—";
  const s = String(iso);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : s;
}

const TENANT_DEPOSIT_TYPE_LABELS = {
  bank: "Bank",
  insurance: "Versicherung",
  cash: "Bar",
  none: "Keine",
};

const TENANT_DEPOSIT_PROVIDER_LABELS = {
  swisscaution: "SwissCaution",
  smartcaution: "SmartCaution",
  firstcaution: "FirstCaution",
  gocaution: "GoCaution",
  other: "Sonstige",
};

function tenantDepositTypeLabel(raw) {
  if (!raw || typeof raw !== "string") return "—";
  const k = String(raw).toLowerCase();
  return TENANT_DEPOSIT_TYPE_LABELS[k] || raw;
}

function tenantDepositProviderLabel(raw) {
  if (!raw || typeof raw !== "string") return "—";
  const k = String(raw).toLowerCase();
  return TENANT_DEPOSIT_PROVIDER_LABELS[k] || raw;
}

function isUuidLike(s) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    String(s || "").trim()
  );
}

function landlordDisplayName(l) {
  if (!l) return "—";
  const c = String(l.company_name || "").trim();
  const n = String(l.contact_name || "").trim();
  if (c && n) return `${c} — ${n}`;
  return c || n || String(l.email || "").trim() || l.id || "—";
}

function propertyManagerDisplayName(p) {
  if (!p) return "—";
  const n = String(p.name || "").trim();
  if (n) return n;
  const e = String(p.email || "").trim();
  if (e) return e;
  return p.id || "—";
}

function formatUnitHeaderLocationLine(unit) {
  const street = String(unit.address || "").trim();
  const zip = String(unit.zip || "").trim();
  const city = String(unit.place || unit.city || "").trim();
  const tail = [zip, city].filter(Boolean).join(" ");
  if (street && tail) return `${street}, ${tail}`;
  if (street) return street;
  if (tail) return tail;
  return "—";
}

function getUnitPageMainTitle(unit) {
  if (!unit) return "—";
  const uid = String(unit.unitId || "").trim();
  const address = String(unit.address || "").trim();
  if (uid && !isUuidLike(uid) && address) {
    return `${uid} · ${address}`;
  }
  return formatUnitHeaderLocationLine(unit);
}

function formatUnitDocumentDate(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString("de-CH", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function formatUnitDocumentType(doc) {
  const mime = String(doc.mime_type || "").toLowerCase();
  const name = String(doc.file_name || "");
  const ext = name.includes(".")
    ? (name.split(".").pop() || "").toLowerCase()
    : "";

  if (mime.includes("pdf") || ext === "pdf") return "PDF";
  if (mime.includes("jpeg") || mime.includes("jpg") || ext === "jpg" || ext === "jpeg") return "JPG";
  if (mime.includes("png") || ext === "png") return "PNG";
  if (
    mime.includes("wordprocessingml") ||
    mime.includes("msword") ||
    ext === "docx" ||
    ext === "doc"
  ) {
    return "DOCX";
  }
  if (ext && /^[a-z0-9]+$/i.test(ext)) return ext.toUpperCase();
  return "Datei";
}

const UNIT_DOCUMENT_CATEGORY_LABELS = {
  rent_contract: "Mietvertrag",
  insurance: "Versicherung",
  internet: "Internet",
  handover: "Übergabe",
  other: "Sonstiges",
};

function formatUnitDocumentCategoryLabel(category) {
  if (category == null || String(category).trim() === "") return "—";
  const k = String(category).trim();
  return UNIT_DOCUMENT_CATEGORY_LABELS[k] || k;
}

function SectionCard({ title, subtitle, children, rightSlot = null }) {
  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          {subtitle ? (
            <p className="text-sm text-slate-500 mt-1">{subtitle}</p>
          ) : null}
        </div>
        {rightSlot}
      </div>
      {children}
    </div>
  );
}

function SmallStatCard({ label, value, hint, accent = "slate", valueTone = "strong" }) {
  const accentStyles = {
    slate: "bg-slate-50 border-slate-200 text-slate-900",
    green: "bg-emerald-50 border-emerald-200 text-emerald-700",
    orange: "bg-orange-50 border-orange-200 text-orange-700",
    rose: "bg-rose-50 border-rose-200 text-rose-700",
    amber: "bg-amber-50 border-amber-200 text-amber-700",
    blue: "bg-sky-50 border-sky-200 text-sky-700",
  };

  const labelClass =
    valueTone === "muted" ? "text-sm text-slate-500" : "text-sm opacity-70";
  const valueClass =
    valueTone === "muted"
      ? "text-xl font-semibold text-slate-500 mt-2"
      : "text-2xl font-bold mt-2";
  const hintClass =
    valueTone === "muted"
      ? "text-[11px] text-slate-500 mt-2 leading-relaxed"
      : "text-xs opacity-70 mt-2";

  return (
    <div
      className={`rounded-2xl border p-4 ${
        accentStyles[accent] || accentStyles.slate
      }`}
    >
      <p className={labelClass}>{label}</p>
      <p className={valueClass}>{value}</p>
      {hint ? <p className={hintClass}>{hint}</p> : null}
    </div>
  );
}

function Badge({ children, tone = "slate" }) {
  const tones = {
    slate: "bg-slate-100 text-slate-700",
    green: "bg-emerald-100 text-emerald-700",
    orange: "bg-orange-100 text-orange-700",
    rose: "bg-rose-100 text-rose-700",
    amber: "bg-amber-100 text-amber-700",
    blue: "bg-sky-100 text-sky-700",
  };

  return (
    <span
      className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
        tones[tone] || tones.slate
      }`}
    >
      {children}
    </span>
  );
}

function getStatusTone(status) {
  if (status === "Belegt") return "green";
  if (status === "Reserviert") return "amber";
  if (status === "Frei") return "rose";
  if (status === "In Reinigung") return "blue";
  if (status === "Blockiert") return "slate";
  if (status === "In Einrichtung") return "orange";
  return "slate";
}

/** Badge tone for getRoomOccupancyStatus keys (frei | reserviert | belegt). */
function getRoomOccBadgeTone(occ) {
  if (occ === "belegt") return "green";
  if (occ === "reserviert") return "amber";
  if (occ === "frei") return "rose";
  return "slate";
}

function roomDisplayMoveIn(room, unitTenancies) {
  if (!unitTenancies) {
    const m = room.moveInDate;
    return m && m !== "-" ? String(m) : null;
  }
  const today = getTodayIsoForOccupancy();
  const active = getActiveTenancyForRoom(room, unitTenancies, today);
  const future = getFutureTenancyForRoom(room, unitTenancies, today);
  const fromT = active?.move_in_date ?? future?.move_in_date;
  const d = parseIsoDate(fromT);
  if (d) return d;
  const m = room.moveInDate;
  return m && m !== "-" ? String(m) : null;
}

function roomDisplayMoveOut(room, unitTenancies) {
  if (!unitTenancies) {
    const m = room.freeFromDate;
    return m && m !== "-" ? String(m) : null;
  }
  const today = getTodayIsoForOccupancy();
  const active = getActiveTenancyForRoom(room, unitTenancies, today);
  const fromT = active?.move_out_date;
  const d = parseIsoDate(fromT);
  if (d) return d;
  const m = room.freeFromDate;
  return m && m !== "-" ? String(m) : null;
}

function roomDisplayTenantName(room, unitTenancies, tenantNameMap) {
  if (!unitTenancies) {
    const r = room.tenant;
    return r && r !== "-" ? String(r) : "—";
  }
  const today = getTodayIsoForOccupancy();
  const active = getActiveTenancyForRoom(room, unitTenancies, today);
  const future = getFutureTenancyForRoom(room, unitTenancies, today);
  const tn = active || future;
  if (!tn) {
    const r = room.tenant;
    return r && r !== "-" ? String(r) : "—";
  }
  const name = tenantNameMap[String(tn.tenant_id)];
  if (name && String(name).trim() !== "" && name !== "—") return name;
  const r = room.tenant;
  return r && r !== "-" ? String(r) : "—";
}

function formatDeShort(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
}

/** Compact Co-Living room future line (tenancy dates only). */
function roomCompactFutureSignal(room, unitTenancies) {
  if (!unitTenancies) return null;
  const today = getTodayIsoForOccupancy();
  const active = getActiveTenancyForRoom(room, unitTenancies, today);
  const future = getFutureTenancyForRoom(room, unitTenancies, today);
  const mo = active ? parseIsoDate(active.move_out_date) : null;
  const fi = future ? parseIsoDate(future.move_in_date) : null;
  const parts = [];
  if (mo) parts.push(`frei ab ${formatDeShort(mo)}`);
  if (fi) parts.push(`reserviert ab ${formatDeShort(fi)}`);
  if (parts.length === 0) return null;
  return parts.join(" · ");
}

function mergeUnitWarningsByText(...lists) {
  const seen = new Set();
  const out = [];
  for (const list of lists) {
    for (const w of list) {
      if (seen.has(w.text)) continue;
      seen.add(w.text);
      out.push(w);
    }
  }
  return out;
}

function buildUnitWarnings(unit, rooms, metrics, unitTenancies) {
  const warnings = [];
  const isApartment = unit.type === "Apartment";

  const contractState = getUnitContractState(unit);
  const occ =
    unitTenancies != null
      ? getUnitOccupancyStatus(unit, rooms, unitTenancies)
      : null;
  const led = unit.leaseEndDate ?? unit.lease_end_date;

  if (
    contractState === "expiring_soon" &&
    occ != null &&
    (occ === "belegt" || occ === "teilbelegt")
  ) {
    const x = calendarDaysUntil(led);
    const days = x != null && x >= 0 ? x : 0;
    warnings.push({
      tone: "amber",
      text: `Einheit ist belegt, aber Vertrag endet in ${days} Tagen`,
    });
  }

  if (contractState === "ended" && occ != null && occ !== "frei") {
    warnings.push({
      tone: "rose",
      text: "Vertrag beendet, aber Einheit ist noch belegt",
    });
  }

  if (contractState === "expired") {
    warnings.push({
      tone: "amber",
      text: "Vertrag ist abgelaufen, aber noch nicht beendet",
    });
  }

  if (contractState === "unknown") {
    warnings.push({
      tone: "slate",
      text: "Kein Mietbeginn für Vermieter gesetzt",
    });
  }

  const ls = String(unit.leaseStatus ?? unit.lease_status ?? "").trim();
  const ted = unit.terminationEffectiveDate ?? unit.termination_effective_date;
  const rtd = unit.returnedToLandlordDate ?? unit.returned_to_landlord_date;

  if (ls === "notice_given") {
    warnings.push({ tone: "amber", text: "Unit ist gekündigt" });
  }
  if (ted) {
    const d = calendarDaysUntil(ted);
    if (d != null && d >= 0 && d <= 30) {
      warnings.push({
        tone: "amber",
        text: `Rückgabe an Vermieter in ${d} Tagen`,
      });
    }
  }
  if (ls === "ended" && (rtd == null || rtd === "")) {
    warnings.push({
      tone: "amber",
      text: "Vertrag beendet, aber keine Rückgabe erfasst",
    });
  }

  const leaseStartIso = parseIsoDate(
    unit?.leaseStartDate ?? unit?.lease_start_date
  );
  const todayIso = getTodayIsoForOccupancy();
  if (
    contractState !== "unknown" &&
    !metrics.leaseStarted &&
    metrics.currentRevenue <= 0 &&
    leaseStartIso != null &&
    leaseStartIso > todayIso
  ) {
    warnings.push({
      tone: "rose",
      text: "Mietbeginn (Vertrag Vermieter) liegt in der Zukunft und aktuell ist noch kein Umsatz gesichert.",
    });
  }

  if (
    contractState !== "unknown" &&
    metrics.currentRevenue != null &&
    metrics.currentRevenue <= 0
  ) {
    warnings.push({
      tone: "rose",
      text: "Keine aktuellen Einnahmen vorhanden.",
    });
  }

  if (isApartment) {
    if (
      metrics.apartmentTenanciesLoaded &&
      metrics.apartmentHasActiveTenancy === false
    ) {
      warnings.push({
        tone: "amber",
        text: "Wohnung leer",
      });
    }
  } else if (metrics.freeCount > 0) {
    warnings.push({
      tone: "amber",
      text: `${metrics.freeCount} freie Rooms ohne aktuelle Belegung.`,
    });
  }

  if (
    metrics.currentProfit != null &&
    metrics.currentProfit < 0
  ) {
    warnings.push({
      tone: "rose",
      text: `Aktuell unter Break-Even um ${formatCurrency(
        Math.abs(metrics.currentProfit)
      )}.`,
    });
  }

  if (isApartment) {
    return mergeUnitWarningsByText(
      warnings,
      getPhase4OperationalWarnings(unit, rooms, unitTenancies, 30)
    ).slice(0, 12);
  }

  rooms.forEach((room) => {
    if (unitTenancies == null) return;
    const roomLabel = room.roomName || room.name || room.roomId || "Room";
    const rocc = getRoomOccupancyStatus(room, unitTenancies);
    const activeT = getActiveTenancyForRoom(room, unitTenancies, todayIso);
    const futureT = getFutureTenancyForRoom(room, unitTenancies, todayIso);
    const activeMoveIn = activeT ? parseIsoDate(activeT.move_in_date) : null;
    const futureMoveIn = futureT ? parseIsoDate(futureT.move_in_date) : null;

    if (
      rocc === "reserviert" &&
      (!room.reservedUntil || room.reservedUntil === "-") &&
      !futureMoveIn
    ) {
      warnings.push({
        tone: "amber",
        text: `${roomLabel}: Reserviert, aber ohne "Reserviert bis" Datum.`,
      });
    }

    if (
      rocc === "belegt" &&
      (!room.moveInDate || room.moveInDate === "-") &&
      !activeMoveIn
    ) {
      warnings.push({
        tone: "amber",
        text: `${roomLabel}: Belegt, aber ohne Einzugsdatum.`,
      });
    }

    if (
      rocc === "frei" &&
      (!room.freeFromDate || room.freeFromDate === "-")
    ) {
      warnings.push({
        tone: "amber",
        text: `${roomLabel}: Frei, aber ohne Frei-ab-Datum.`,
      });
    }
  });

  return mergeUnitWarningsByText(
    warnings,
    getPhase4OperationalWarnings(unit, rooms, unitTenancies, 30)
  ).slice(0, 12);
}

const UNIT_COST_TYPE_OPTIONS = [
  "Miete",
  "Nebenkosten",
  "Reinigung",
  "Internet",
  "Sonstiges",
];
const UNIT_COST_FIXED_SET = new Set([
  "Miete",
  "Nebenkosten",
  "Reinigung",
  "Internet",
]);

function AdminUnitDetailPage() {
  const { unitId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [unit, setUnit] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditLogLoading, setAuditLogLoading] = useState(true);
  const [auditLogError, setAuditLogError] = useState("");
  const [unitDocuments, setUnitDocuments] = useState([]);
  const [unitDocumentsLoading, setUnitDocumentsLoading] = useState(true);
  const [unitDocumentsError, setUnitDocumentsError] = useState("");
  const [unitDocUploading, setUnitDocUploading] = useState(false);
  const [unitDocUploadError, setUnitDocUploadError] = useState("");
  const [unitDocCategory, setUnitDocCategory] = useState("");
  const unitDocFileInputRef = useRef(null);
  const [unitCosts, setUnitCosts] = useState([]);
  const [costForm, setCostForm] = useState({
    cost_type: "",
    custom_type: "",
    amount_chf: "",
    frequency: "monthly",
  });
  const [costLoading, setCostLoading] = useState(false);
  const [costError, setCostError] = useState("");
  const [editingCostId, setEditingCostId] = useState(null);
  const [verwaltungLabel, setVerwaltungLabel] = useState("");
  const [bewirtschafterLabel, setBewirtschafterLabel] = useState("");
  const [linksResolving, setLinksResolving] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignSaving, setAssignSaving] = useState(false);
  const [assignErr, setAssignErr] = useState(null);
  const [assignForm, setAssignForm] = useState({
    property_id: "",
    landlord_id: "",
    property_manager_id: "",
    owner_id: "",
  });
  const [assignLists, setAssignLists] = useState({
    properties: [],
    landlords: [],
    pms: [],
    owners: [],
  });
  const [assignListsLoading, setAssignListsLoading] = useState(false);

  const [kpiYear] = useState(() => new Date().getFullYear());
  const [kpiMonth] = useState(() => new Date().getMonth() + 1);
  const [unitKpiProfit, setUnitKpiProfit] = useState(null);
  const [unitKpiOcc, setUnitKpiOcc] = useState(null);
  const [unitKpiLoading, setUnitKpiLoading] = useState(false);
  const [unitKpiErr, setUnitKpiErr] = useState(null);
  const [unitTenancyRevenueByTenancyId, setUnitTenancyRevenueByTenancyId] =
    useState({});
  const [unitTenancyRevenueLoading, setUnitTenancyRevenueLoading] =
    useState(false);

  const reloadUnitKpi = useCallback(async () => {
    if (!unitId) return;
    setUnitKpiLoading(true);
    setUnitKpiErr(null);
    try {
      const [profitRes, occRes] = await Promise.all([
        fetchAdminProfit({ unit_id: unitId, year: kpiYear, month: kpiMonth }),
        fetchAdminOccupancy({ unit_id: unitId }),
      ]);
      const row = Array.isArray(profitRes?.units)
        ? profitRes.units.find((x) => String(x.unit_id) === String(unitId))
        : null;
      setUnitKpiProfit(
        row
          ? {
              revenue: Number(row.revenue),
              costs: Number(row.costs),
              profit: Number(row.profit),
            }
          : null
      );
      const occ =
        occRes?.units && Array.isArray(occRes.units)
          ? occRes.units.find((x) => String(x.unit_id) === String(unitId))
          : null;
      setUnitKpiOcc(occ || null);
    } catch (e) {
      setUnitKpiErr(e?.message || "KPI konnten nicht geladen werden.");
      setUnitKpiProfit(null);
      setUnitKpiOcc(null);
    } finally {
      setUnitKpiLoading(false);
    }
  }, [unitId, kpiYear, kpiMonth]);

  useEffect(() => {
    reloadUnitKpi();
  }, [reloadUnitKpi]);

  useEffect(() => {
    if (!unitId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchAdminUnit(unitId)
      .then((u) => setUnit(u ? normalizeUnit(u) : null))
      .catch(() => setUnit(null))
      .finally(() => setLoading(false));
  }, [unitId, location.key]);

  useEffect(() => {
    if (!unitId) return;
    setCostError("");
    setCostLoading(true);
    fetchAdminUnitCosts(unitId)
      .then((rows) => setUnitCosts(Array.isArray(rows) ? rows : []))
      .catch((e) => {
        setUnitCosts([]);
        setCostError(
          e.message || "Zusätzliche Kosten konnten nicht geladen werden."
        );
      })
      .finally(() => setCostLoading(false));
  }, [unitId]);

  useEffect(() => {
    if (!unit) {
      setVerwaltungLabel("");
      setBewirtschafterLabel("");
      setLinksResolving(false);
      return;
    }
    const lid = unit.landlord_id;
    const pmid = unit.property_manager_id;
    if (!lid && !pmid) {
      setVerwaltungLabel("");
      setBewirtschafterLabel("");
      setLinksResolving(false);
      return;
    }
    setLinksResolving(true);
    let cancelled = false;
    Promise.all([
      lid ? fetchAdminLandlord(lid) : Promise.resolve(null),
      pmid ? fetchAdminPropertyManagers() : Promise.resolve(null),
    ])
      .then(([ll, pmList]) => {
        if (cancelled) return;
        if (lid) {
          setVerwaltungLabel(ll ? landlordDisplayName(ll) : "—");
        } else {
          setVerwaltungLabel("");
        }
        if (pmid) {
          const p = Array.isArray(pmList) ? pmList.find((x) => String(x.id) === String(pmid)) : null;
          setBewirtschafterLabel(p ? propertyManagerDisplayName(p) : "—");
        } else {
          setBewirtschafterLabel("");
        }
      })
      .catch(() => {
        if (!cancelled) {
          if (lid) setVerwaltungLabel("—");
          if (pmid) setBewirtschafterLabel("—");
        }
      })
      .finally(() => {
        if (!cancelled) setLinksResolving(false);
      });
    return () => {
      cancelled = true;
    };
  }, [unit]);

  useEffect(() => {
    if (!unitId) return;
    fetchAdminRooms(unitId)
      .then((data) => setRooms(Array.isArray(data) ? data.map(normalizeRoom) : []))
      .catch(() => setRooms([]));
  }, [unitId]);

  const reloadAuditLogs = useCallback(() => {
    if (!unitId) return Promise.resolve();
    setAuditLogLoading(true);
    setAuditLogError("");
    return fetchAdminAuditLogs({ entity_type: "unit", entity_id: unitId })
      .then((data) => setAuditLogs(Array.isArray(data.items) ? data.items : []))
      .catch((e) => {
        setAuditLogError(e.message || "Fehler beim Laden des Verlaufs.");
        setAuditLogs([]);
      })
      .finally(() => setAuditLogLoading(false));
  }, [unitId]);

  useEffect(() => {
    reloadAuditLogs();
  }, [unitId, reloadAuditLogs, location.key]);

  useEffect(() => {
    if (!unitId) {
      setUnitDocumentsLoading(false);
      return;
    }
    setUnitDocumentsLoading(true);
    setUnitDocumentsError("");
    fetchAdminUnitDocuments(unitId)
      .then(setUnitDocuments)
      .catch((e) => {
        setUnitDocumentsError(e.message || "Fehler beim Laden der Dokumente.");
        setUnitDocuments([]);
      })
      .finally(() => setUnitDocumentsLoading(false));
  }, [unitId]);

  const auditResolvers = useMemo(() => {
    const landlordById = {};
    if (unit?.landlord_id && verwaltungLabel && verwaltungLabel !== "—") {
      landlordById[String(unit.landlord_id)] = verwaltungLabel;
    }
    const pmById = {};
    if (unit?.property_manager_id && bewirtschafterLabel && bewirtschafterLabel !== "—") {
      pmById[String(unit.property_manager_id)] = bewirtschafterLabel;
    }
    const propertyById = {};
    if (unit?.property_id) {
      const title = String(unit.property_title || "").trim();
      if (title) propertyById[String(unit.property_id)] = title;
    }
    const ownerById = {};
    if (unit?.owner_id) {
      const title = String(unit.ownerName ?? unit.owner_name ?? "").trim();
      if (title) ownerById[String(unit.owner_id)] = title;
    }
    return { landlordById, pmById, propertyById, ownerById };
  }, [unit, verwaltungLabel, bewirtschafterLabel]);

  const openAssignModal = () => {
    if (!unit) return;
    setAssignErr(null);
    setAssignForm({
      property_id: unit.property_id != null ? String(unit.property_id) : "",
      landlord_id: unit.landlord_id != null ? String(unit.landlord_id) : "",
      property_manager_id:
        unit.property_manager_id != null ? String(unit.property_manager_id) : "",
      owner_id: unit.owner_id != null ? String(unit.owner_id) : "",
    });
    setAssignOpen(true);
    setAssignListsLoading(true);
    Promise.all([
      fetchAdminProperties().catch(() => []),
      fetchAdminLandlords("active").catch(() => []),
      fetchAdminPropertyManagers().catch(() => []),
      fetchAdminOwners()
        .then((r) => (Array.isArray(r.items) ? r.items : []))
        .catch(() => []),
    ])
      .then(([props, landlords, pms, owners]) => {
        const propList = Array.isArray(props) ? props : [];
        const filteredProps = propList.filter((p) => !p.deleted_at);
        filteredProps.sort((a, b) =>
          String(a.title || "").localeCompare(String(b.title || ""), "de")
        );
        const ll = Array.isArray(landlords) ? landlords : [];
        ll.sort((a, b) => {
          const la = `${a.company_name || ""} ${a.contact_name || ""}`.trim();
          const lb = `${b.company_name || ""} ${b.contact_name || ""}`.trim();
          return la.localeCompare(lb, "de");
        });
        const pm = Array.isArray(pms) ? pms : [];
        pm.sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "de"));
        const ow = Array.isArray(owners) ? owners : [];
        ow.sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "de"));
        setAssignLists({ properties: filteredProps, landlords: ll, pms: pm, owners: ow });
      })
      .finally(() => setAssignListsLoading(false));
  };

  const saveAssignModal = () => {
    if (!unitId) return;
    setAssignSaving(true);
    setAssignErr(null);
    updateAdminUnit(unitId, {
      property_id: assignForm.property_id.trim() || null,
      landlord_id: assignForm.landlord_id.trim() || null,
      property_manager_id: assignForm.property_manager_id.trim() || null,
      owner_id: assignForm.owner_id.trim() || null,
    })
      .then(() => fetchAdminUnit(unitId))
      .then((u) => setUnit(u ? normalizeUnit(u) : null))
      .then(() => reloadAuditLogs())
      .then(() => {
        setAssignOpen(false);
      })
      .catch((e) => {
        setAssignErr(e?.message || "Speichern fehlgeschlagen.");
      })
      .finally(() => setAssignSaving(false));
  };

  const [occupancyRoomsData, setOccupancyRoomsData] = useState(null);
  useEffect(() => {
    if (!unitId) return;
    const onDate = getTodayIsoForOccupancy();
    fetchAdminOccupancyRooms({ unit_id: unitId, on_date: onDate })
      .then((data) => setOccupancyRoomsData(data))
      .catch(() => setOccupancyRoomsData(null));
  }, [unitId]);

  const [unitTenancies, setUnitTenancies] = useState(null);
  const [tenantNameMap, setTenantNameMap] = useState({});
  useEffect(() => {
    if (!unitId) return;
    setUnitTenancies(null);
    setTenantNameMap({});
    fetchAdminTenancies({ unit_id: unitId, limit: 200 })
      .then((items) => setUnitTenancies(Array.isArray(items) ? items : []))
      .catch(() => setUnitTenancies([]));
  }, [unitId]);

  useEffect(() => {
    if (!unitTenancies || !unitId) return;
    const today = getTodayIsoForOccupancy();
    const active = unitTenancies.filter((t) =>
      isTenancyActiveByDates(t, today)
    );
    const future = unitTenancies.filter((t) => isTenancyFuture(t, today));
    const ids = [
      ...new Set([
        ...active.map((t) => String(t.tenant_id)),
        ...future.map((t) => String(t.tenant_id)),
      ]),
    ].filter((id) => id && id !== "undefined");
    if (ids.length === 0) {
      setTenantNameMap({});
      return;
    }
    let cancelled = false;
    Promise.all(ids.map((id) => fetchAdminTenant(id))).then((rows) => {
      if (cancelled) return;
      const m = {};
      ids.forEach((id, i) => {
        const r = rows[i];
        if (r) {
          m[id] =
            String(r.display_name || r.full_name || "").trim() ||
            `${r.first_name || ""} ${r.last_name || ""}`.trim() ||
            "—";
        }
      });
      setTenantNameMap(m);
    });
    return () => {
      cancelled = true;
    };
  }, [unitTenancies, unitId]);

  const [isRoomModalOpen, setIsRoomModalOpen] = useState(false);
  const [editingRoomId, setEditingRoomId] = useState(null);
  const [roomForm, setRoomForm] = useState({
    roomName: "",
    status: "Frei",
    tenant: "",
    priceMonthly: "",
    moveInDate: "",
    freeFromDate: "",
    reservedUntil: "",
    blockedUntil: "",
    blockedReason: "",
    setupReadyDate: "",
    minimumStayMonths: "3",
    noticePeriodMonths: "3",
  });

  const safeUnit = useMemo(
    () =>
      unit || {
        unitId: "",
        id: "",
        type: "",
        place: "",
        zip: "",
        address: "",
        rooms: 0,
        status: "",
        availableFrom: "",
        occupiedRooms: 0,
      },
    [unit]
  );

  const unitRooms = useMemo(() => {
    return rooms.filter((room) => room.unitId === safeUnit.unitId);
  }, [rooms, safeUnit.unitId]);

  const activeUnitTenancies = useMemo(() => {
    if (!unitTenancies) return [];
    const today = getTodayIsoForOccupancy();
    const uid = String(safeUnit.unitId || safeUnit.id || "");
    return unitTenancies.filter(
      (t) =>
        String(t.unit_id || t.unitId) === uid &&
        isTenancyActiveByDates(t, today)
    );
  }, [unitTenancies, safeUnit.unitId, safeUnit.id]);

  const metrics = useMemo(() => {
    const base = getCoLivingMetrics(safeUnit, rooms, unitTenancies);
    const isApt = safeUnit.type === "Apartment";

    if (unitTenancies === null) {
      const fromOccEarly = unitKpiOcc != null;
      let tr = base.totalRooms;
      let oc = base.occupiedCount;
      let rc = base.reservedCount;
      let fc = base.freeCount;
      if (fromOccEarly && unitKpiOcc.total_rooms != null) {
        tr = unitKpiOcc.total_rooms;
        oc = unitKpiOcc.occupied_rooms ?? base.occupiedCount;
        rc = unitKpiOcc.reserved_rooms ?? base.reservedCount;
        fc = unitKpiOcc.free_rooms ?? base.freeCount;
      }
      const r0 = unitKpiProfit?.revenue ?? null;
      const c0 = unitKpiProfit?.costs ?? null;
      const p0 = unitKpiProfit?.profit ?? null;
      if (isApt) {
        return {
          ...base,
          totalRooms: tr,
          occupiedCount: oc,
          reservedCount: rc,
          freeCount: fc,
          apartmentTenanciesLoaded: false,
          apartmentHasActiveTenancy: null,
          currentRevenue: r0,
          runningCosts: c0,
          currentProfit: p0,
        };
      }
      return {
        ...base,
        totalRooms: tr,
        occupiedCount: oc,
        reservedCount: rc,
        freeCount: fc,
        currentRevenue: r0,
        runningCosts: c0,
        currentProfit: p0,
      };
    }

    const rev = unitKpiProfit?.revenue;
    const costs = unitKpiProfit?.costs;
    const prof = unitKpiProfit?.profit;

    const fromOcc = unitKpiOcc != null;
    let totalRooms = base.totalRooms;
    let occupiedCount = base.occupiedCount;
    let reservedCount = base.reservedCount;
    let freeCount = base.freeCount;
    if (fromOcc && unitKpiOcc.total_rooms != null) {
      totalRooms = unitKpiOcc.total_rooms;
      occupiedCount = unitKpiOcc.occupied_rooms ?? base.occupiedCount;
      reservedCount = unitKpiOcc.reserved_rooms ?? base.reservedCount;
      freeCount = unitKpiOcc.free_rooms ?? base.freeCount;
    }

    const vacancyLoss =
      base.fullRevenue != null && rev != null && Number.isFinite(Number(rev))
        ? Math.max(0, Number(base.fullRevenue) - Number(rev))
        : null;

    if (isApt) {
      const occupied = activeUnitTenancies.length > 0;
      const aptFull =
        base.fullRevenue != null
          ? base.fullRevenue
          : Number(safeUnit.tenantPriceMonthly ?? safeUnit.tenant_price_monthly_chf ?? 0) > 0
            ? Number(safeUnit.tenantPriceMonthly ?? safeUnit.tenant_price_monthly_chf ?? 0)
            : null;
      const aptVacancy =
        aptFull != null && rev != null && Number.isFinite(Number(rev))
          ? Math.max(0, Number(aptFull) - Number(rev))
          : null;
      return {
        ...base,
        totalRooms,
        occupiedCount,
        reservedCount,
        freeCount,
        currentRevenue: rev ?? null,
        runningCosts: costs ?? null,
        currentProfit: prof ?? null,
        fullRevenue: aptFull,
        vacancyLoss: aptVacancy,
        apartmentTenanciesLoaded: true,
        apartmentHasActiveTenancy: occupied,
      };
    }

    return {
      ...base,
      totalRooms,
      occupiedCount,
      reservedCount,
      freeCount,
      currentRevenue: rev ?? null,
      runningCosts: costs ?? null,
      currentProfit: prof ?? null,
      vacancyLoss,
      apartmentTenanciesLoaded: true,
    };
  }, [
    safeUnit,
    rooms,
    unitTenancies,
    activeUnitTenancies,
    unitKpiProfit,
    unitKpiOcc,
  ]);

  const occupancyRate = useMemo(() => {
    if (unitKpiOcc != null && unitKpiOcc.occupancy_rate != null) {
      return Number(unitKpiOcc.occupancy_rate);
    }
    return metrics.totalRooms > 0
      ? (metrics.occupiedCount / metrics.totalRooms) * 100
      : 0;
  }, [unitKpiOcc, metrics.totalRooms, metrics.occupiedCount]);

  const unitWarnings = useMemo(() => {
    return buildUnitWarnings(safeUnit, unitRooms, metrics, unitTenancies);
  }, [safeUnit, unitRooms, metrics, unitTenancies]);

  const unitContractState = useMemo(
    () => getUnitContractState(safeUnit),
    [safeUnit]
  );

  const derivedUnitOccupancy = useMemo(
    () => getUnitOccupancyStatus(unit, rooms, unitTenancies),
    [unit, rooms, unitTenancies]
  );

  const nextUnitForecast = useMemo(() => {
    const fullPot = metrics.fullRevenue != null ? metrics.fullRevenue : null;
    const openPot =
      fullPot != null && metrics.currentRevenue != null
        ? Math.max(fullPot - metrics.currentRevenue, 0)
        : null;
    return {
      revenue: metrics.currentRevenue,
      forecast30: null,
      expiringRevenue: null,
      futureBookedRevenue: null,
      netChange: null,
      openPotential: openPot,
      fullPotential: fullPot,
      profit: metrics.currentProfit,
    };
  }, [metrics]);

  const activeTenancyIdsKey = useMemo(
    () =>
      activeUnitTenancies
        .map((t) => String(t.id))
        .filter(Boolean)
        .sort()
        .join(","),
    [activeUnitTenancies]
  );

  useEffect(() => {
    if (!unitId) return;
    const ids = activeTenancyIdsKey
      ? activeTenancyIdsKey.split(",").filter(Boolean)
      : [];
    if (ids.length === 0) {
      setUnitTenancyRevenueByTenancyId({});
      setUnitTenancyRevenueLoading(false);
      return;
    }
    let cancelled = false;
    setUnitTenancyRevenueLoading(true);
    setUnitTenancyRevenueByTenancyId({});
    Promise.all(
      ids.map((id) =>
        fetchAdminTenancyRevenue(id)
          .then((rows) => [id, Array.isArray(rows) ? rows : []])
          .catch(() => [id, []])
      )
    )
      .then((pairs) => {
        if (cancelled) return;
        const next = {};
        for (const [id, rows] of pairs) next[id] = rows;
        setUnitTenancyRevenueByTenancyId(next);
      })
      .finally(() => {
        if (!cancelled) setUnitTenancyRevenueLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [unitId, activeTenancyIdsKey]);

  const unitTenancyRevenueRowArrays = useMemo(() => {
    const ids = activeTenancyIdsKey
      ? activeTenancyIdsKey.split(",").filter(Boolean)
      : [];
    return ids
      .map((id) => unitTenancyRevenueByTenancyId[id])
      .filter((x) => Array.isArray(x));
  }, [activeTenancyIdsKey, unitTenancyRevenueByTenancyId]);

  const unitAggregatedRecurringBreakdown = useMemo(
    () => aggregateRecurringMonthlyBreakdownRows(unitTenancyRevenueRowArrays),
    [unitTenancyRevenueRowArrays]
  );
  const unitAggregatedOneTimeTotal = useMemo(
    () => aggregateOneTimeTotalFromRowArrays(unitTenancyRevenueRowArrays),
    [unitTenancyRevenueRowArrays]
  );
  const unitAggregatedOneTimeBreakdown = useMemo(
    () => aggregateOneTimeBreakdownRows(unitTenancyRevenueRowArrays),
    [unitTenancyRevenueRowArrays]
  );

  const unitNumber =
    safeUnit.unitId && safeUnit.unitId.split("-")[2]
      ? safeUnit.unitId.split("-")[2]
      : "0000";

  const nextNumber = unitRooms.length + 1;
  const nextRoomId = `FAH-R-${unitNumber}-${String(nextNumber).padStart(
    2,
    "0"
  )}`;

  const recurringUnitCosts = useMemo(
    () =>
      Array.isArray(unitCosts)
        ? unitCosts.filter(
            (r) => String(r?.frequency || "monthly").trim().toLowerCase() !== "one_time"
          )
        : [],
    [unitCosts]
  );
  const oneTimeUnitCosts = useMemo(
    () =>
      Array.isArray(unitCosts)
        ? unitCosts.filter(
            (r) => String(r?.frequency || "monthly").trim().toLowerCase() === "one_time"
          )
        : [],
    [unitCosts]
  );
  const unitCostsTotalMonthly = useMemo(
    () => getUnitCostsTotal(recurringUnitCosts),
    [recurringUnitCosts]
  );

  const recurringCostBreakdownDisplay = useMemo(
    () => recurringUnitCostBreakdownWithInsurance(unit, unitCosts),
    [unit, unitCosts]
  );
  const oneTimeCostBreakdownDisplay = useMemo(
    () => oneTimeUnitCostBreakdownEntries(unitCosts),
    [unitCosts]
  );
  const oneTimeCostTotalDisplay = useMemo(
    () => totalOneTimeUnitCosts(unitCosts),
    [unitCosts]
  );
  const runningCostsStammdatenTotal = useMemo(
    () => getUnitMonthlyRunningCosts(unit, unitCosts),
    [unit, unitCosts]
  );

  if (loading) {
    return (
      <div>
        <p className="text-slate-500">Lade Unit…</p>
      </div>
    );
  }

  if (!unit) {
    return (
      <div>
        <h2 className="text-3xl font-bold text-slate-800 mb-2">
          Unit nicht gefunden
        </h2>
        <p className="text-slate-500 mb-6">
          Für diese Unit ID konnten keine Daten gefunden werden.
        </p>

        <Link
          to="/admin/apartments"
          className="inline-block bg-orange-500 hover:bg-orange-600 text-white px-5 py-3 rounded-lg font-medium transition"
        >
          Zurück zu Units
        </Link>
      </div>
    );
  }

  function handleOpenRoomModal() {
    setEditingRoomId(null);
    setRoomForm({
      roomName: `Zimmer ${unitRooms.length + 1}`,
      status: "Frei",
      tenant: "",
      priceMonthly: "",
      moveInDate: "",
      freeFromDate: unit.availableFrom || "",
      reservedUntil: "",
      blockedUntil: "",
      blockedReason: "",
      setupReadyDate: "",
      minimumStayMonths: "3",
      noticePeriodMonths: "3",
    });
    setIsRoomModalOpen(true);
  }

  function handleOpenEditRoomModal(room) {
    setEditingRoomId(room.id);
    setRoomForm({
      roomName: room.roomName || "",
      status: room.status || "Frei",
      tenant: room.tenant === "-" ? "" : room.tenant || "",
      priceMonthly: room.priceMonthly ?? "",
      moveInDate: room.moveInDate === "-" ? "" : room.moveInDate || "",
      freeFromDate: room.freeFromDate === "-" ? "" : room.freeFromDate || "",
      reservedUntil:
        room.reservedUntil === "-" ? "" : room.reservedUntil || "",
      blockedUntil: room.blockedUntil === "-" ? "" : room.blockedUntil || "",
      blockedReason:
        room.blockedReason === "-" ? "" : room.blockedReason || "",
      setupReadyDate:
        room.setupReadyDate === "-" ? "" : room.setupReadyDate || "",
      minimumStayMonths: String(room.minimumStayMonths || 3),
      noticePeriodMonths: String(room.noticePeriodMonths || 3),
    });
    setIsRoomModalOpen(true);
  }

  function handleCloseRoomModal() {
    setIsRoomModalOpen(false);
    setEditingRoomId(null);
    setRoomForm({
      roomName: "",
      status: "Frei",
      tenant: "",
      priceMonthly: "",
      moveInDate: "",
      freeFromDate: unit.availableFrom || "",
      reservedUntil: "",
      blockedUntil: "",
      blockedReason: "",
      setupReadyDate: "",
      minimumStayMonths: "3",
      noticePeriodMonths: "3",
    });
  }

  function handleRoomChange(event) {
    const { name, value } = event.target;

    setRoomForm((prev) => {
      const next = {
        ...prev,
        [name]: value,
      };

      if (name === "status") {
        if (value === "Blockiert" || value === "In Einrichtung") {
          next.priceMonthly = "";
        }

        if (value !== "Belegt") {
          next.tenant = "";
          next.moveInDate = "";
        }

        if (value !== "Reserviert") {
          next.reservedUntil = "";
        }

        if (value !== "Blockiert") {
          next.blockedUntil = "";
          next.blockedReason = "";
        }

        if (value !== "In Einrichtung") {
          next.setupReadyDate = "";
        }
      }

      return next;
    });
  }

  function handleRoomSubmit(event) {
    event.preventDefault();

    const isOccupied = roomForm.status === "Belegt";
    const isReserved = roomForm.status === "Reserviert";
    const isBlocked = roomForm.status === "Blockiert";
    const isSetup = roomForm.status === "In Einrichtung";

    const payload = {
      roomName: roomForm.roomName,
      status: roomForm.status,
      tenant: isOccupied || isReserved ? roomForm.tenant || "-" : "-",
      priceMonthly:
        isBlocked || isSetup ? 0 : Number(roomForm.priceMonthly || 0),
      moveInDate: isOccupied ? roomForm.moveInDate || "-" : "-",
      freeFromDate:
        roomForm.status === "Frei" ||
        roomForm.status === "Belegt" ||
        roomForm.status === "In Reinigung"
          ? roomForm.freeFromDate || "-"
          : "-",
      reservedUntil: isReserved ? roomForm.reservedUntil || "-" : "-",
      blockedUntil: isBlocked ? roomForm.blockedUntil || "-" : "-",
      blockedReason: isBlocked ? roomForm.blockedReason || "-" : "-",
      setupReadyDate: isSetup ? roomForm.setupReadyDate || "-" : "-",
      minimumStayMonths: Number(roomForm.minimumStayMonths || 3),
      noticePeriodMonths: Number(roomForm.noticePeriodMonths || 3),
    };

    if (editingRoomId !== null) {
      setRooms((prevRooms) =>
        prevRooms.map((room) =>
          String(room.id) === String(editingRoomId)
            ? {
                ...room,
                ...payload,
              }
            : room
        )
      );
    } else {
      const newRoom = {
        id: Date.now().toString(),
        unitId: unit.unitId,
        roomId: nextRoomId,
        ...payload,
      };

      setRooms((prevRooms) => [...prevRooms, newRoom]);
    }

    handleCloseRoomModal();
  }

  async function handleDeleteRoom(id) {
    const confirmed = window.confirm(
      "Möchtest du diesen Room wirklich löschen?"
    );
    if (!confirmed) return;

    try {
      await deleteAdminRoom(id);
      const data = await fetchAdminRooms(unitId);
      setRooms(Array.isArray(data) ? data.map(normalizeRoom) : []);
    } catch (err) {
      window.alert(
        String(err?.message ?? err) || "Room konnte nicht gelöscht werden."
      );
    }
  }

  function handleUnitDocumentPick() {
    unitDocFileInputRef.current?.click();
  }

  async function handleUnitDocumentSelected(e) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f || !unitId) return;
    setUnitDocUploading(true);
    setUnitDocUploadError("");
    try {
      const rec = await uploadAdminUnitDocument(unitId, f, {
        category: unitDocCategory.trim() || undefined,
      });
      setUnitDocuments((prev) => [rec, ...prev]);
      setUnitDocCategory("");
    } catch (err) {
      setUnitDocUploadError(err.message || "Upload fehlgeschlagen.");
    } finally {
      setUnitDocUploading(false);
    }
  }

  async function handleOpenUnitDocument(docId) {
    try {
      const data = await fetchAdminUnitDocumentDownloadUrl(docId);
      if (data && data.url) {
        window.open(data.url, "_blank", "noopener,noreferrer");
      }
    } catch (err) {
      window.alert(err.message || "Download konnte nicht gestartet werden.");
    }
  }

  async function handleDeleteUnitDocument(docId) {
    const ok = window.confirm("Dokument wirklich löschen?");
    if (!ok) return;
    try {
      await deleteAdminUnitDocument(docId);
      const items = await fetchAdminUnitDocuments(unitId);
      setUnitDocuments(items);
    } catch (err) {
      window.alert(err.message || "Löschen fehlgeschlagen.");
    }
  }

  const reloadUnitCosts = () => {
    if (!unitId) return Promise.resolve();
    return fetchAdminUnitCosts(unitId)
      .then((rows) => setUnitCosts(Array.isArray(rows) ? rows : []))
      .catch(() => {});
  };

  const reloadUnitSnapshot = () => {
    if (!unitId) return Promise.resolve();
    return fetchAdminUnit(unitId)
      .then((u) => setUnit(u ? normalizeUnit(u) : null))
      .catch(() => {});
  };

  function parseCostAmountInput(raw) {
    const n = Number(String(raw).replace(",", ".").trim());
    if (!Number.isFinite(n) || n <= 0) return null;
    return n;
  }

  function resolveBackendCostTypeFromForm(form) {
    if (form.cost_type === "Sonstiges") {
      return String(form.custom_type || "").trim();
    }
    return String(form.cost_type || "").trim();
  }

  async function handleUnitCostSubmit(e) {
    e.preventDefault();
    if (!unitId) return;
    setCostError("");
    if (!costForm.cost_type) {
      setCostError("Bitte Kostenart wählen.");
      return;
    }
    if (costForm.cost_type === "Sonstiges") {
      const t = String(costForm.custom_type || "").trim();
      if (!t) {
        setCostError("Bitte Bezeichnung für „Sonstiges“ eingeben.");
        return;
      }
    }
    const amt = parseCostAmountInput(costForm.amount_chf);
    if (amt == null) {
      setCostError("Bitte einen gültigen Betrag grösser als 0 eingeben.");
      return;
    }
    const freq = String(costForm.frequency || "monthly").trim().toLowerCase() || "monthly";
    if (!["monthly", "yearly", "one_time"].includes(freq)) {
      setCostError("Bitte eine gültige Frequenz wählen.");
      return;
    }
    const cost_type = resolveBackendCostTypeFromForm(costForm);
    if (!cost_type) {
      setCostError("Bitte Kostenart angeben.");
      return;
    }
    setCostLoading(true);
    try {
      if (editingCostId) {
        await updateAdminUnitCost(unitId, editingCostId, {
          cost_type,
          amount_chf: amt,
          frequency: freq,
        });
      } else {
        await createAdminUnitCost(unitId, { cost_type, amount_chf: amt, frequency: freq });
      }
      await reloadUnitCosts();
      await reloadUnitSnapshot();
      await reloadUnitKpi();
      setCostForm({ cost_type: "", custom_type: "", amount_chf: "", frequency: "monthly" });
      setEditingCostId(null);
    } catch (err) {
      setCostError(err.message || "Speichern fehlgeschlagen.");
    } finally {
      setCostLoading(false);
    }
  }

  function handleUnitCostEdit(row) {
    if (!row || !row.id) return;
    const ct = String(row.cost_type || "");
    const freq = String(row.frequency || "monthly").trim().toLowerCase() || "monthly";
    if (UNIT_COST_FIXED_SET.has(ct)) {
      setCostForm({
        cost_type: ct,
        custom_type: "",
        amount_chf: String(row.amount_chf ?? ""),
        frequency: freq,
      });
    } else {
      setCostForm({
        cost_type: "Sonstiges",
        custom_type: ct,
        amount_chf: String(row.amount_chf ?? ""),
        frequency: freq,
      });
    }
    setEditingCostId(String(row.id));
    setCostError("");
  }

  function handleUnitCostCancel() {
    setCostForm({ cost_type: "", custom_type: "", amount_chf: "", frequency: "monthly" });
    setEditingCostId(null);
    setCostError("");
  }

  async function handleUnitCostDelete(row) {
    if (!unitId || !row?.id) return;
    if (!window.confirm("Diesen Eintrag wirklich löschen?")) return;
    setCostLoading(true);
    setCostError("");
    try {
      await deleteAdminUnitCost(unitId, String(row.id));
      if (editingCostId === String(row.id)) {
        setCostForm({ cost_type: "", custom_type: "", amount_chf: "" });
        setEditingCostId(null);
      }
      await reloadUnitCosts();
      await reloadUnitSnapshot();
      await reloadUnitKpi();
    } catch (err) {
      setCostError(err.message || "Löschen fehlgeschlagen.");
    } finally {
      setCostLoading(false);
    }
  }

  const landlordDepositTypeKey = String(unit.landlordDepositType || "")
    .trim()
    .toLowerCase();
  const showLandlordDepositNone =
    !landlordDepositTypeKey || landlordDepositTypeKey === "none";
  const landlordDepositKindLabel =
    LANDLORD_DEPOSIT_TYPE_LABELS[landlordDepositTypeKey] ||
    unit.landlordDepositType ||
    "—";
  const landlordLeaseContractStatusStr = landlordLeaseContractStatus(unit);
  const landlordContractDerivedState = landlordLeaseContractStatusStr
    ? null
    : getUnitContractState(unit);
  const leaseContractEnded =
    String(unit.leaseStatus ?? unit.lease_status ?? "").trim() === "ended";

  return (
    <div className="min-h-screen bg-slate-50 -m-6 p-6 md:p-8">
      <div className="max-w-[1800px] mx-auto space-y-8">
        <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-6">
          <div className={leaseContractEnded ? "opacity-75" : undefined}>
            <p className="text-sm font-semibold text-orange-600">
              Unit Intelligence
            </p>
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-slate-900 mt-2">
              {getUnitPageMainTitle(unit)}
            </h2>
            <p className="text-xs text-slate-400 mt-2 font-mono break-all">
              {unit.id || unit.unitId}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {unitContractState === "expiring_soon" ? (
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-100 text-amber-800">
                Vertrag endet bald
              </span>
            ) : unitContractState === "expired" ? (
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-rose-100 text-rose-800">
                Vertrag abgelaufen
              </span>
            ) : unitContractState === "unknown" ? (
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">
                Mietbeginn offen
              </span>
            ) : null}
            {derivedUnitOccupancy == null ? (
              <span className="text-slate-400 text-sm">—</span>
            ) : (
              <Badge tone={occupancyStatusBadgeTone(derivedUnitOccupancy)}>
                {formatOccupancyStatusDe(derivedUnitOccupancy)}
              </Badge>
            )}
            <Link
              to="/admin/apartments"
              className="inline-block border border-slate-300 hover:bg-slate-50 text-slate-700 px-5 py-3 rounded-xl font-medium transition"
            >
              Zurück
            </Link>
            <button
              type="button"
              onClick={() => {
                if (!unitId) return;
                navigate("/admin/apartments", { state: { editUnitId: String(unitId) } });
              }}
              className="inline-block border border-slate-300 hover:bg-slate-50 text-slate-700 px-5 py-3 rounded-xl font-medium transition"
            >
              Bearbeiten
            </button>
            <button
              type="button"
              onClick={async () => {
                if (!unitId) return;
                const ok = window.confirm("Möchtest du diese Unit wirklich löschen?");
                if (!ok) return;
                try {
                  await deleteAdminUnit(String(unitId));
                  navigate("/admin/apartments");
                } catch (err) {
                  window.alert(err?.message || "Löschen fehlgeschlagen.");
                }
              }}
              className="inline-block border border-red-300 hover:bg-red-50 text-red-700 px-5 py-3 rounded-xl font-medium transition"
            >
              Löschen
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <SectionCard
            title="Stammdaten"
            subtitle="Grunddaten und aktuelle Struktur dieser Unit"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-slate-700">
              <div className="md:col-span-2 flex justify-end">
                <button
                  type="button"
                  onClick={openAssignModal}
                  className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                >
                  Zuordnungen bearbeiten
                </button>
              </div>
              <div>
                <p className="text-sm text-slate-500">Unit ID</p>
                <p className="font-medium">{unit.unitId}</p>
              </div>

              <div>
                <p className="text-sm text-slate-500">Typ</p>
                <p className="font-medium">{unit.type}</p>
              </div>

              <div>
                <p className="text-sm text-slate-500">Ort</p>
                <p className="font-medium">{unit.place}</p>
              </div>

              <div>
                <p className="text-sm text-slate-500">PLZ</p>
                <p className="font-medium">{unit.zip}</p>
              </div>

              <div>
                <p className="text-sm text-slate-500">Adresse</p>
                <p className="font-medium">{unit.address}</p>
              </div>

              <div>
                <p className="text-sm text-slate-500">Zimmer gesamt</p>
                <p className="font-medium">{unit.rooms}</p>
              </div>

              <div>
                <p className="text-sm text-slate-500">Liegenschaft</p>
                <p className="font-medium">{unit.property_title || "—"}</p>
              </div>

              <div>
                <p className="text-sm text-slate-500">Verwaltung</p>
                <p className="font-medium">
                  {unit.landlord_id ? (
                    linksResolving ? (
                      "…"
                    ) : (
                      <Link
                        to={`/admin/landlords/${encodeURIComponent(unit.landlord_id)}`}
                        className="text-orange-600 hover:underline"
                      >
                        {verwaltungLabel || "—"}
                      </Link>
                    )
                  ) : (
                    "—"
                  )}
                </p>
              </div>

              <div>
                <p className="text-sm text-slate-500">Bewirtschafter</p>
                <p className="font-medium">
                  {unit.property_manager_id ? (
                    linksResolving ? (
                      "…"
                    ) : (
                      <Link
                        to={`/admin/bewirtschafter/${encodeURIComponent(unit.property_manager_id)}`}
                        className="text-orange-600 hover:underline"
                      >
                        {bewirtschafterLabel || "—"}
                      </Link>
                    )
                  ) : (
                    "—"
                  )}
                </p>
              </div>

              <div>
                <p className="text-sm text-slate-500">Eigentümer</p>
                <p className="font-medium">
                  {unit.owner_id ? (
                    <Link
                      to={`/admin/owners/${encodeURIComponent(unit.owner_id)}`}
                      className="text-orange-600 hover:underline"
                    >
                      {String(unit.ownerName ?? unit.owner_name ?? "").trim() || "—"}
                    </Link>
                  ) : (
                    "Kein Eigentümer zugeordnet"
                  )}
                </p>
              </div>

              <div>
                <p className="text-sm text-slate-500">Verfügbar ab</p>
                <p className="font-medium">{unit.availableFrom || "-"}</p>
              </div>

              <div className="md:col-span-2 border-t border-slate-200 pt-4 mt-2">
                <p className="text-sm font-semibold text-slate-800 mb-3">
                  Vertrag Vermieter
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-slate-500">Vertragsart</p>
                    <p className="font-medium">{landlordLeaseTypeLabel(unit)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">Mietbeginn</p>
                    <p className="font-medium">
                      {dashEmpties(unit.leaseStartDate ?? unit.lease_start_date)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">Vertragsende</p>
                    <p className="font-medium">
                      {dashEmpties(unit.leaseEndDate ?? unit.lease_end_date)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">Kündigung eingereicht</p>
                    <p className="font-medium">
                      {dashEmpties(unit.noticeGivenDate ?? unit.notice_given_date)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">Kündigung wirksam</p>
                    <p className="font-medium">
                      {dashEmpties(
                        unit.terminationEffectiveDate ?? unit.termination_effective_date
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">Rückgabe erfolgt</p>
                    <p className="font-medium">
                      {dashEmpties(
                        unit.returnedToLandlordDate ?? unit.returned_to_landlord_date
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">Status</p>
                    <p className="font-medium">
                      {landlordLeaseContractStatusStr ? (
                        <Badge
                          tone={landlordLeaseStatusBadgeTone(
                            landlordLeaseContractStatusStr
                          )}
                        >
                          {LEASE_STATUS_LABELS[landlordLeaseContractStatusStr] ||
                            landlordLeaseContractStatusStr}
                        </Badge>
                      ) : (
                        <>
                          <Badge
                            tone={landlordContractStateDerivedTone(
                              landlordContractDerivedState
                            )}
                          >
                            {DERIVED_LANDLORD_CONTRACT_STATE_LABELS[
                              landlordContractDerivedState
                            ] || landlordContractDerivedState}
                          </Badge>
                          <span className="block text-xs text-slate-500 font-normal mt-1">
                            Abgeleitet aus Mietbeginn und Vertragsende (kein gespeicherter
                            Vertragsstatus).
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                  <div className="md:col-span-2">
                    <p className="text-sm text-slate-500">Notizen</p>
                    <p className="font-medium whitespace-pre-wrap">
                      {landlordLeaseNotesDisplay(unit)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title="Finanzübersicht"
            subtitle={`Monat ${String(kpiMonth).padStart(2, "0")}/${kpiYear} · Backend-KPI (revenue_forecast / profit_service)`}
          >
            {unitKpiErr ? (
              <p className="text-sm text-red-600 mb-3">{unitKpiErr}</p>
            ) : null}
            {unitKpiLoading ? (
              <p className="text-sm text-slate-500 mb-3">KPI werden geladen …</p>
            ) : null}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <SmallStatCard
                label="Potenzial bei Vollbelegung"
                value={
                  metrics.fullRevenue != null
                    ? formatChfOrDash(metrics.fullRevenue)
                    : "—"
                }
                hint={
                  metrics.fullRevenue != null
                    ? "Basierend auf Listenpreisen / Zimmerpreisen (kein Backend KPI)"
                    : "Kein Potenzial berechenbar: Zimmerpreise fehlen oder Apartment ohne Mieterpreis."
                }
                accent="orange"
                valueTone="muted"
              />
              <SmallStatCard
                label="Aktueller Umsatz"
                value={formatChfOrDash(metrics.currentRevenue)}
                hint={`Berechnet aus tatsächlichen Einnahmen (Backend KPI). Zeitraum: ${String(kpiMonth).padStart(2, "0")}/${kpiYear}.`}
                accent="green"
              />
              <SmallStatCard
                label="Laufende Kosten"
                value={formatChfOrDash(metrics.runningCosts)}
                hint="Monatliche Kosten inkl. Fixkosten und Versicherung"
                accent="slate"
              />
              <SmallStatCard
                label="Gewinn aktuell"
                value={formatChfOrDash(metrics.currentProfit)}
                hint="Umsatz minus Kosten (Backend berechnet)"
                accent="slate"
              />
            </div>
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              <p className="font-semibold text-slate-800 mb-1">
                Einnahmen Zusammensetzung
              </p>
              <p className="text-xs text-slate-500 mb-3">
                Wiederkehrende Einnahmen nach Typ (Monatsäquivalent), summiert über
                aktive Mietverhältnisse. «Aktueller Umsatz» oben ist der
                Backend-KPI-Monat und kann davon abweichen.
              </p>
              {unitTenancyRevenueLoading ? (
                <p className="text-slate-500">…</p>
              ) : activeUnitTenancies.length === 0 ? (
                <p className="text-slate-500">Keine aktiven Mietverhältnisse.</p>
              ) : unitAggregatedRecurringBreakdown.length === 0 ? (
                <p className="text-slate-500">Keine Einnahmen definiert</p>
              ) : (
                <ul className="space-y-1">
                  {unitAggregatedRecurringBreakdown.map((b) => (
                    <li
                      key={b.typeKey}
                      className="flex justify-between gap-4 text-slate-700"
                    >
                      <span>{b.label}</span>
                      <span className="font-medium tabular-nums">
                        {formatCurrency(b.total)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {!unitTenancyRevenueLoading &&
              activeUnitTenancies.length > 0 &&
              unitAggregatedOneTimeTotal > 0 ? (
                <div className="mt-3 pt-3 border-t border-slate-200">
                  <p className="text-xs font-semibold text-slate-600 mb-2">
                    Einmalige Einnahmen
                  </p>
                  <p className="text-sm text-slate-800 mb-2">
                    Gesamt:{" "}
                    <span className="font-semibold tabular-nums">
                      {formatCurrency(unitAggregatedOneTimeTotal)}
                    </span>
                  </p>
                  {unitAggregatedOneTimeBreakdown.length > 0 ? (
                    <ul className="space-y-1 text-sm">
                      {unitAggregatedOneTimeBreakdown.map((b) => (
                        <li
                          key={`ot-${b.typeKey}`}
                          className="flex justify-between gap-4 text-slate-600"
                        >
                          <span>{b.label}</span>
                          <span className="font-medium tabular-nums">
                            {formatCurrency(b.total)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
            </div>
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              <p className="font-semibold text-slate-800 mb-1">Kosten Zusammensetzung</p>
              <p className="text-xs text-slate-500 mb-3">
                Aus unit_costs und Kautionsversicherung (jährliche Prämie ÷ 12). «Laufende
                Kosten» oben ist der Backend-KPI-Monat und kann bei Abweichungen in den
                Stammdaten davon abweichen.
              </p>
              <div className="mb-3">
                <p className="text-sm text-slate-800">
                  <span className="text-slate-600 font-medium">
                    Laufende Kosten gesamt:
                  </span>{" "}
                  <span className="font-semibold tabular-nums">
                    {formatCurrency(runningCostsStammdatenTotal)}
                  </span>
                </p>
                {recurringCostBreakdownDisplay.length === 0 ? (
                  <p className="text-slate-500 mt-2">Keine laufenden Kosten definiert</p>
                ) : (
                  <ul className="space-y-1 mt-2">
                    {recurringCostBreakdownDisplay.map((b) => (
                      <li
                        key={b.typeKey}
                        className="flex justify-between gap-4 text-slate-700"
                      >
                        <span>{b.label}</span>
                        <span className="font-medium tabular-nums">
                          {formatCurrency(b.total)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="mt-3 pt-3 border-t border-slate-200">
                <p className="text-sm text-slate-800 mb-2">
                  <span className="text-slate-600 font-medium">
                    Einmalige Kosten gesamt:
                  </span>{" "}
                  <span className="font-semibold tabular-nums">
                    {formatCurrency(oneTimeCostTotalDisplay)}
                  </span>
                </p>
                {oneTimeCostTotalDisplay <= 0 ? (
                  <p className="text-slate-500">Keine einmaligen Kosten</p>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {oneTimeCostBreakdownDisplay.map((b) => (
                      <li
                        key={`otc-${b.typeKey}`}
                        className="flex justify-between gap-4 text-slate-600"
                      >
                        <span>{b.label}</span>
                        <span className="font-medium tabular-nums">
                          {formatCurrency(b.total)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </SectionCard>

          <div className="xl:col-span-2">
            <SectionCard
              title="Zusätzliche Kosten"
              subtitle="Kostenpositionen aus unit_costs (Monatlich/Jährlich; Einmalig separat)"
            >
              {costError ? (
                <p className="text-sm text-red-600 mb-3">{costError}</p>
              ) : null}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-700">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="py-2 pr-4 font-medium">Kostenart</th>
                      <th className="py-2 pr-4 font-medium">Betrag (CHF)</th>
                      <th className="py-2 pr-4 font-medium">Aktionen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recurringUnitCosts.length === 0 ? (
                      <tr>
                        <td
                          colSpan={3}
                          className="py-3 text-slate-500 text-sm"
                        >
                          {costLoading && !costError
                            ? "Lade …"
                            : "Keine laufenden Kosten erfasst."}
                        </td>
                      </tr>
                    ) : (
                      recurringUnitCosts.map((row) => (
                        <tr
                          key={String(row.id)}
                          className="border-b border-slate-100"
                        >
                          <td className="py-2 pr-4 font-medium">
                            {row.cost_type || "—"}
                          </td>
                          <td className="py-2 pr-4">
                            {Number.isFinite(Number(row.amount_chf))
                              ? `CHF ${Number(row.amount_chf).toLocaleString("de-CH", {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}`
                              : "—"}
                            <span className="ml-2 text-xs text-slate-500">
                              {String(row.frequency || "monthly").trim().toLowerCase() === "yearly"
                                ? "(jährlich)"
                                : "(monatlich)"}
                            </span>
                          </td>
                          <td className="py-2 pr-4">
                            <div className="flex flex-wrap items-center gap-3">
                              <button
                                type="button"
                                disabled={costLoading}
                                onClick={() => handleUnitCostEdit(row)}
                                className="text-orange-600 hover:underline text-sm font-medium disabled:opacity-50"
                              >
                                Bearbeiten
                              </button>
                              <button
                                type="button"
                                disabled={costLoading}
                                onClick={() => handleUnitCostDelete(row)}
                                className="text-red-600 hover:underline text-sm font-medium disabled:opacity-50"
                              >
                                Löschen
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <p className="text-sm text-slate-700 mt-3 font-medium">
                Total: CHF{" "}
                {unitCostsTotalMonthly.toLocaleString("de-CH", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{" "}
                / Monat
              </p>
              <form
                onSubmit={handleUnitCostSubmit}
                className="mt-6 pt-4 border-t border-slate-200 space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-end gap-3">
                  <label className="flex flex-col gap-1 text-sm text-slate-600">
                    <span>Kostenart</span>
                    <select
                      value={costForm.cost_type}
                      onChange={(e) =>
                        setCostForm((f) => ({
                          ...f,
                          cost_type: e.target.value,
                          custom_type:
                            e.target.value === "Sonstiges" ? f.custom_type : "",
                        }))
                      }
                      disabled={costLoading}
                      className="text-sm border border-slate-300 rounded-lg px-2 py-1.5 bg-white text-slate-800 disabled:opacity-50 min-w-[200px]"
                    >
                      <option value="">— wählen —</option>
                      {UNIT_COST_TYPE_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </label>
                  {costForm.cost_type === "Sonstiges" ? (
                    <label className="flex flex-col gap-1 text-sm text-slate-600">
                      <span>Bezeichnung</span>
                      <input
                        type="text"
                        value={costForm.custom_type}
                        onChange={(e) =>
                          setCostForm((f) => ({
                            ...f,
                            custom_type: e.target.value,
                          }))
                        }
                        disabled={costLoading}
                        className="text-sm border border-slate-300 rounded-lg px-2 py-1.5 bg-white text-slate-800 disabled:opacity-50 min-w-[200px]"
                        placeholder="z. B. Haftpflicht"
                      />
                    </label>
                  ) : null}
                  <label className="flex flex-col gap-1 text-sm text-slate-600">
                    <span>Betrag (CHF)</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={costForm.amount_chf}
                      onChange={(e) =>
                        setCostForm((f) => ({
                          ...f,
                          amount_chf: e.target.value,
                        }))
                      }
                      disabled={costLoading}
                      className="text-sm border border-slate-300 rounded-lg px-2 py-1.5 bg-white text-slate-800 disabled:opacity-50 w-40"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm text-slate-600">
                    <span>Frequenz</span>
                    <select
                      value={costForm.frequency || "monthly"}
                      onChange={(e) =>
                        setCostForm((f) => ({ ...f, frequency: e.target.value }))
                      }
                      disabled={costLoading}
                      className="text-sm border border-slate-300 rounded-lg px-2 py-1.5 bg-white text-slate-800 disabled:opacity-50 min-w-[160px]"
                    >
                      <option value="monthly">Monatlich</option>
                      <option value="yearly">Jährlich</option>
                      <option value="one_time">Einmalig</option>
                    </select>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="submit"
                      disabled={costLoading}
                      className="text-sm bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg font-medium disabled:opacity-50"
                    >
                      {costLoading ? "…" : "Speichern"}
                    </button>
                    <button
                      type="button"
                      disabled={costLoading}
                      onClick={handleUnitCostCancel}
                      className="text-sm border border-slate-300 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg font-medium disabled:opacity-50"
                    >
                      Abbrechen
                    </button>
                  </div>
                </div>
                {editingCostId ? (
                  <p className="text-xs text-slate-500">
                    Bearbeitung: Eintrag wird aktualisiert.
                  </p>
                ) : null}
              </form>
            </SectionCard>
          </div>

          <div className="xl:col-span-2">
            <SectionCard
              title="Einmalige Kosten"
              subtitle="unit_costs mit Frequenz „Einmalig“ (nicht in laufenden Kosten enthalten)"
            >
              {oneTimeUnitCosts.length === 0 ? (
                <p className="text-sm text-slate-500">Keine einmaligen Kosten erfasst.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm text-slate-700">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500">
                        <th className="py-2 pr-4 font-medium">Kostenart</th>
                        <th className="py-2 pr-4 font-medium">Betrag CHF</th>
                        <th className="py-2 pr-4 font-medium">Aktionen</th>
                      </tr>
                    </thead>
                    <tbody>
                      {oneTimeUnitCosts.map((row) => (
                        <tr
                          key={String(row.id)}
                          className="border-b border-slate-100"
                        >
                          <td className="py-2 pr-4 font-medium">
                            {row.cost_type || "—"}
                          </td>
                          <td className="py-2 pr-4">
                            {Number.isFinite(Number(row.amount_chf))
                              ? `CHF ${Number(row.amount_chf).toLocaleString("de-CH", {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}`
                              : "—"}
                          </td>
                          <td className="py-2 pr-4">
                            <div className="flex flex-wrap items-center gap-3">
                              <button
                                type="button"
                                disabled={costLoading}
                                onClick={() => handleUnitCostEdit(row)}
                                className="text-orange-600 hover:underline text-sm font-medium disabled:opacity-50"
                              >
                                Bearbeiten
                              </button>
                              <button
                                type="button"
                                disabled={costLoading}
                                onClick={() => handleUnitCostDelete(row)}
                                className="text-red-600 hover:underline text-sm font-medium disabled:opacity-50"
                              >
                                Löschen
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>
          </div>
        </div>

        <SectionCard
          title="Kaution Vermieter"
          subtitle="Hinterlegung gegenüber dem Vermieter (nicht Mieterkaution)"
        >
          {showLandlordDepositNone ? (
            <p className="text-sm text-slate-500">Keine Kaution erfasst</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-slate-700">
              <div>
                <p className="text-sm text-slate-500">Kautionsart</p>
                <p className="font-medium">{landlordDepositKindLabel}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500">Kautionsbetrag</p>
                <p className="font-medium">
                  {formatChfOrDash(unit.landlordDepositAmount)}
                </p>
              </div>
              {landlordDepositTypeKey === "insurance" ? (
                <div>
                  <p className="text-sm text-slate-500">Jahresprämie</p>
                  <p className="font-medium">
                    {formatChfOrDash(unit.landlordDepositAnnualPremium)}
                  </p>
                </div>
              ) : null}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Dokumente"
          subtitle="Dateien zu dieser Unit"
          rightSlot={
            <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center sm:flex-wrap sm:justify-end">
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <span className="whitespace-nowrap">Kategorie</span>
                <select
                  value={unitDocCategory}
                  onChange={(e) => setUnitDocCategory(e.target.value)}
                  disabled={unitDocUploading || !unitId}
                  className="text-sm border border-slate-300 rounded-lg px-2 py-1.5 bg-white text-slate-800 disabled:opacity-50"
                >
                  <option value="">—</option>
                  <option value="rent_contract">Mietvertrag</option>
                  <option value="insurance">Versicherung</option>
                  <option value="internet">Internet</option>
                  <option value="handover">Übergabe</option>
                  <option value="other">Sonstiges</option>
                </select>
              </label>
              <input
                ref={unitDocFileInputRef}
                type="file"
                className="hidden"
                onChange={handleUnitDocumentSelected}
              />
              <button
                type="button"
                onClick={handleUnitDocumentPick}
                disabled={unitDocUploading || !unitId}
                className="text-sm border border-slate-300 hover:bg-slate-50 text-slate-700 px-3 py-2 rounded-lg font-medium disabled:opacity-50"
              >
                {unitDocUploading ? "Wird hochgeladen …" : "Hochladen"}
              </button>
            </div>
          }
        >
          {unitDocUploadError ? (
            <p className="text-sm text-red-600 mb-2">{unitDocUploadError}</p>
          ) : null}
          {unitDocumentsLoading ? (
            <p className="text-sm text-slate-500">Lade Dokumente …</p>
          ) : unitDocumentsError ? (
            <p className="text-sm text-red-600">{unitDocumentsError}</p>
          ) : unitDocuments.length === 0 ? (
            <p className="text-sm text-slate-500">Keine Dokumente vorhanden</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-700">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2 pr-4 font-medium">Datei</th>
                    <th className="py-2 pr-4 font-medium">Typ</th>
                    <th className="py-2 pr-4 font-medium">Kategorie</th>
                    <th className="py-2 pr-4 font-medium">Datum</th>
                    <th className="py-2 pr-4 font-medium">Von</th>
                    <th className="py-2 pr-4 font-medium">Aktionen</th>
                  </tr>
                </thead>
                <tbody>
                  {unitDocuments.map((doc) => (
                    <tr key={String(doc.id)} className="border-b border-slate-100">
                      <td className="py-2 pr-4 font-medium">{doc.file_name || "—"}</td>
                      <td className="py-2 pr-4 text-slate-600">{formatUnitDocumentType(doc)}</td>
                      <td className="py-2 pr-4 text-slate-600">
                        {formatUnitDocumentCategoryLabel(doc.category)}
                      </td>
                      <td className="py-2 pr-4 text-slate-600">
                        {formatUnitDocumentDate(doc.created_at)}
                      </td>
                      <td className="py-2 pr-4 text-slate-600">
                        {doc.uploaded_by_name != null && doc.uploaded_by_name !== ""
                          ? doc.uploaded_by_name
                          : "—"}
                      </td>
                      <td className="py-2 pr-4">
                        <div className="flex flex-wrap items-center gap-3">
                          <button
                            type="button"
                            onClick={() => handleOpenUnitDocument(doc.id)}
                            className="text-orange-600 hover:underline font-medium"
                          >
                            Öffnen
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteUnitDocument(doc.id)}
                            className="text-slate-500 hover:text-rose-600 hover:underline text-sm"
                          >
                            Löschen
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Mieter"
          subtitle="Aktive Mietverhältnisse (Status: active). Einnahmen-Spalte: Monatsäquivalent aus TenancyRevenue (Backend), nicht klassische Monatsmiete."
        >
          {unitTenancies === null ? (
            <p className="text-sm text-slate-500">Lade Mietverhältnisse …</p>
          ) : activeUnitTenancies.length === 0 ? (
            <p className="text-sm text-slate-500">Keine aktiven Mieter.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-700">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2 pr-4 font-medium">Name</th>
                    <th className="py-2 pr-4 font-medium text-right">
                      Monatsäquivalent (Einnahmen)
                    </th>
                    <th className="py-2 pr-4 font-medium">Kautionsart</th>
                    <th className="py-2 pr-4 font-medium text-right">Kautionsbetrag</th>
                    <th className="py-2 pr-4 font-medium">Anbieter</th>
                    <th className="py-2 pr-4 font-medium">Mietbeginn</th>
                  </tr>
                </thead>
                <tbody>
                  {activeUnitTenancies.map((tn) => {
                    const tdt = String(tn.tenant_deposit_type || "").toLowerCase();
                    return (
                      <tr key={String(tn.id)} className="border-b border-slate-100">
                        <td className="py-2 pr-4 font-medium">
                          <Link
                            to={`/admin/tenants/${String(tn.tenant_id)}`}
                            className="text-orange-600 hover:text-orange-700 hover:underline"
                          >
                            {tenantNameMap[String(tn.tenant_id)] || "…"}
                          </Link>
                        </td>
                        <td className="py-2 pr-4 text-right">
                          {formatChfOrDash(tn.monthly_revenue_equivalent)}
                        </td>
                        <td className="py-2 pr-4 text-slate-600">
                          {tenantDepositTypeLabel(tn.tenant_deposit_type)}
                        </td>
                        <td className="py-2 pr-4 text-right text-slate-600">
                          {formatChfOrDash(tn.tenant_deposit_amount)}
                        </td>
                        <td className="py-2 pr-4 text-slate-600">
                          {tdt === "insurance"
                            ? tenantDepositProviderLabel(tn.tenant_deposit_provider)
                            : "—"}
                        </td>
                        <td className="py-2 pr-4 text-slate-600">
                          {formatTenancyMoveIn(tn.move_in_date)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-4">
          <SmallStatCard
            label="Rooms gesamt"
            value={metrics.totalRooms}
            hint="Gesamte Kapazität"
            accent="slate"
          />
          <SmallStatCard
            label="Belegt"
            value={metrics.occupiedCount}
            hint="Aktuell belegt"
            accent="green"
          />
          <SmallStatCard
            label="Reserviert"
            value={metrics.reservedCount}
            hint="Zukünftige Belegung"
            accent="amber"
          />
          <SmallStatCard
            label="Frei"
            value={metrics.freeCount}
            hint="Aktuell frei"
            accent="rose"
          />
          <SmallStatCard
            label="Belegt in %"
            value={formatPercent(occupancyRate)}
            hint={
              unitKpiOcc != null
                ? "Operativ: Backend-Belegung für heute (nicht KPI-Monat)."
                : "Operativ: Schätzung aus Zimmern und Mietverhältnissen (heute, nicht KPI-Monat)."
            }
            accent="blue"
          />
          <SmallStatCard
            label="Leerstand"
            value={
              metrics.vacancyLoss != null
                ? formatChfOrDash(metrics.vacancyLoss)
                : "—"
            }
            hint={
              metrics.vacancyLoss != null
                ? "Potenzial bei Vollbelegung minus Aktueller Umsatz (Backend-KPI); kein separater Forecast."
                : "Nur wenn Potenzial und KPI-Umsatz vorliegen; sonst nicht berechenbar."
            }
            accent="rose"
            valueTone="muted"
          />
        </div>

        <SectionCard
          title="Automatische Warnungen"
          subtitle="Wichtige Hinweise nur für diese Unit"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {unitWarnings.map((warning, index) => (
              <div
                key={`${warning.text}-${index}`}
                className={`rounded-2xl border p-4 ${
                  warning.tone === "rose"
                    ? "border-rose-200 bg-rose-50"
                    : warning.tone === "slate"
                      ? "border-slate-200 bg-slate-50"
                      : warning.tone === "emerald"
                        ? "border-emerald-200 bg-emerald-50"
                        : "border-amber-200 bg-amber-50"
                }`}
              >
                <p
                  className={`text-sm font-medium ${
                    warning.tone === "rose"
                      ? "text-rose-700"
                      : warning.tone === "slate"
                        ? "text-slate-700"
                        : warning.tone === "emerald"
                          ? "text-emerald-700"
                          : "text-amber-700"
                  }`}
                >
                  {warning.text}
                </p>
              </div>
            ))}

            {unitWarnings.length === 0 && (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-sm font-medium text-emerald-700">
                  Keine kritischen Warnungen für diese Unit
                </p>
              </div>
            )}
          </div>
        </SectionCard>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <SectionCard
            title="Forecast für diese Unit"
            subtitle="Echte KPIs wie in der Finanzübersicht; Kurzprognosen hier nicht angebunden"
          >
            <div className="grid grid-cols-1 gap-4">
              <SmallStatCard
                label="Aktueller Umsatz"
                value={formatChfOrDash(nextUnitForecast.revenue)}
                hint={`Berechnet aus tatsächlichen Einnahmen (Backend KPI). Zeitraum: ${String(kpiMonth).padStart(2, "0")}/${kpiYear}.`}
                accent="green"
              />
              <SmallStatCard
                label="Prognose (geschätzt) · 30 Tage"
                value={
                  nextUnitForecast.forecast30 != null
                    ? formatChfOrDash(nextUnitForecast.forecast30)
                    : "—"
                }
                hint={
                  nextUnitForecast.forecast30 != null
                    ? "Schätzung; kein Backend KPI"
                    : "Noch nicht aktiviert"
                }
                accent="slate"
                valueTone="muted"
              />
              <SmallStatCard
                label="Prognose (geschätzt) · Wegfall"
                value={
                  nextUnitForecast.expiringRevenue != null
                    ? formatChfOrDash(nextUnitForecast.expiringRevenue)
                    : "—"
                }
                hint={
                  nextUnitForecast.expiringRevenue != null
                    ? "Schätzung; kein Backend KPI"
                    : "Noch nicht aktiviert"
                }
                accent="slate"
                valueTone="muted"
              />
              <SmallStatCard
                label="Prognose (geschätzt) · Neu geplant"
                value={
                  nextUnitForecast.futureBookedRevenue != null
                    ? formatChfOrDash(nextUnitForecast.futureBookedRevenue)
                    : "—"
                }
                hint={
                  nextUnitForecast.futureBookedRevenue != null
                    ? "Schätzung; kein Backend KPI"
                    : "Noch nicht aktiviert"
                }
                accent="slate"
                valueTone="muted"
              />
              <SmallStatCard
                label="Prognose (geschätzt) · Veränderung"
                value={
                  nextUnitForecast.netChange != null
                    ? formatChfNetChange(nextUnitForecast.netChange)
                    : "—"
                }
                hint={
                  nextUnitForecast.netChange != null
                    ? "Schätzung; kein Backend KPI"
                    : "Noch nicht aktiviert"
                }
                accent="slate"
                valueTone="muted"
              />
              <SmallStatCard
                label="Gewinn aktuell"
                value={formatChfOrDash(nextUnitForecast.profit)}
                hint="Umsatz minus Kosten (Backend berechnet)"
                accent="slate"
              />
            </div>
          </SectionCard>

          <SectionCard
            title="Room Status Übersicht"
            subtitle="Operativ pro Zimmer (heute); nicht identisch mit dem Finanz-KPI-Monat oben."
          >
            <div className="space-y-3">
              {unitRooms.map((room) => {
                const roomOcc =
                  unitTenancies != null
                    ? getRoomOccupancyStatus(room, unitTenancies)
                    : null;
                const rn = roomDisplayTenantName(
                  room,
                  unitTenancies,
                  tenantNameMap
                );
                const rmi = roomDisplayMoveIn(room, unitTenancies);
                const futureSig = roomCompactFutureSignal(room, unitTenancies);
                return (
                <div
                  key={room.id}
                  className="rounded-2xl border border-slate-200 bg-slate-50 p-4 flex items-center justify-between gap-4"
                >
                  <div>
                    <p className="font-semibold text-slate-800">
                      {room.roomName}
                    </p>
                    <p className="text-sm text-slate-500 mt-1">
                      {formatChfOrDash(room.priceMonthly)}
                      {rn !== "—" ? ` · ${rn}` : ""}
                      {rmi
                        ? ` · Einzug ${rmi}`
                        : ` · Kein Einzug erfasst`}
                    </p>
                    {futureSig ? (
                      <p className="text-xs text-slate-600 mt-1">{futureSig}</p>
                    ) : null}
                  </div>

                  <Badge tone={getRoomOccBadgeTone(roomOcc)}>
                    {roomOcc != null ? formatOccupancyStatusDe(roomOcc) : "—"}
                  </Badge>
                </div>
                );
              })}

              {unitRooms.length === 0 && (
                <p className="text-sm text-slate-500">
                  Noch keine Rooms vorhanden.
                </p>
              )}
            </div>
          </SectionCard>

          <SectionCard
            title="Break-Even"
            subtitle="Deckt diese Unit ihre laufenden Kosten?"
          >
            <div className="grid grid-cols-1 gap-4">
              <SmallStatCard
                label="Aktueller Umsatz"
                value={formatChfOrDash(metrics.currentRevenue)}
                hint={`Berechnet aus tatsächlichen Einnahmen (Backend KPI). Zeitraum: ${String(kpiMonth).padStart(2, "0")}/${kpiYear}.`}
                accent="green"
              />
              <SmallStatCard
                label="Break-Even"
                value={formatChfOrDash(metrics.runningCosts)}
                hint="Laufende Kosten (Backend) als Referenz für Deckung"
                accent="slate"
              />
              <SmallStatCard
                label="Differenz"
                value={formatChfOrDash(metrics.currentProfit)}
                hint={
                  metrics.currentProfit != null
                    ? metrics.currentProfit >= 0
                      ? "Über Break-Even (Backend-Gewinn)"
                      : "Unter Break-Even (Backend-Gewinn)"
                    : "Keine Daten vorhanden"
                }
                accent={
                  metrics.currentProfit != null
                    ? metrics.currentProfit >= 0
                      ? "green"
                      : "rose"
                    : "slate"
                }
              />
            </div>
          </SectionCard>
        </div>

        {unit.type === "Co-Living" && (
          <SectionCard
            title="Rooms"
            subtitle="Echte Room-Verwaltung für diese Co-Living Unit"
            rightSlot={
              <button
                onClick={handleOpenRoomModal}
                className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-xl font-medium transition"
              >
                + Room hinzufügen
              </button>
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 text-sm">
                    <th className="py-3 pr-4">Room ID</th>
                    <th className="py-3 pr-4">Zimmer</th>
                    <th className="py-3 pr-4">Status</th>
                    <th className="py-3 pr-4">Mieter</th>
                    <th className="py-3 pr-4">Preis</th>
                    <th className="py-3 pr-4">Einzug</th>
                    <th className="py-3 pr-4">Frei ab</th>
                    <th className="py-3 pr-4">Min. Dauer</th>
                    <th className="py-3 pr-4">Kündigung</th>
                    <th className="py-3 pr-4">Aktionen</th>
                  </tr>
                </thead>

                <tbody>
                  {unitRooms.map((room) => {
                    const roomOcc =
                      unitTenancies != null
                        ? getRoomOccupancyStatus(room, unitTenancies)
                        : null;
                    const rTenant = roomDisplayTenantName(
                      room,
                      unitTenancies,
                      tenantNameMap
                    );
                    const rIn = roomDisplayMoveIn(room, unitTenancies);
                    const rOut = roomDisplayMoveOut(room, unitTenancies);
                    const futureSig = roomCompactFutureSignal(
                      room,
                      unitTenancies
                    );
                    return (
                    <tr
                      key={room.id}
                      className="border-b border-slate-100 text-slate-700"
                    >
                      <td className="py-4 pr-4 font-medium text-orange-600">
                        {room.roomId}
                      </td>
                      <td className="py-4 pr-4">
                        <div>{room.roomName}</div>
                        {futureSig ? (
                          <div className="text-xs text-slate-500 mt-0.5">
                            {futureSig}
                          </div>
                        ) : null}
                      </td>
                      <td className="py-4 pr-4">
                        <Badge tone={getRoomOccBadgeTone(roomOcc)}>
                          {roomOcc != null
                            ? formatOccupancyStatusDe(roomOcc)
                            : "—"}
                        </Badge>
                      </td>
                      <td className="py-4 pr-4">{rTenant}</td>
                      <td className="py-4 pr-4">
                        {formatChfOrDash(room.priceMonthly)}
                      </td>
                      <td className="py-4 pr-4">{rIn || "-"}</td>
                      <td className="py-4 pr-4">{rOut || "-"}</td>
                      <td className="py-4 pr-4">
                        {room.minimumStayMonths || 3} M
                      </td>
                      <td className="py-4 pr-4">
                        {room.noticePeriodMonths || 3} M
                      </td>
                      <td className="py-4 pr-4">
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleOpenEditRoomModal(room)}
                            className="px-3 py-2 rounded-lg border border-slate-300 text-sm hover:bg-slate-50"
                          >
                            Bearbeiten
                          </button>
                          <button
                            onClick={() => handleDeleteRoom(room.id)}
                            className="px-3 py-2 rounded-lg border border-red-300 text-red-600 text-sm hover:bg-red-50"
                          >
                            Löschen
                          </button>
                        </div>
                      </td>
                    </tr>
                    );
                  })}

                  {unitRooms.length === 0 && (
                    <tr>
                      <td
                        colSpan="10"
                        className="py-8 text-center text-slate-500"
                      >
                        Noch keine Rooms vorhanden.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </SectionCard>
        )}

        {unit.type === "Co-Living" && (
          <SectionCard
            title="Raumstatus (Belegung)"
            subtitle="Belegt (grün), Reserviert (gelb), Frei (rot) – aus Tenancies"
          >
            <OccupancyMap
              unit={unit}
              rooms={unitRooms}
              occupancyData={occupancyRoomsData}
            />
          </SectionCard>
        )}

        {unit.type === "Co-Living" && (
          <SectionCard
            title="Room Map"
            subtitle="Visuelle Übersicht aller Rooms dieser Unit"
          >
            <RoomMap unit={unit} rooms={unitRooms} tenancies={unitTenancies} />
          </SectionCard>
        )}

        {unit.type === "Co-Living" && (
          <SectionCard
            title="Belegungskalender"
            subtitle="Monatskalender nur für diese Unit"
          >
            <RoomCalendar unit={unit} rooms={unitRooms} tenancies={unitTenancies} />
          </SectionCard>
        )}

        <SectionCard
          title="Verlauf"
          subtitle="Änderungen an dieser Unit (Audit-Log, neueste zuerst)"
        >
          {auditLogLoading ? (
            <p className="text-sm text-slate-500">Lade Verlauf …</p>
          ) : auditLogError ? (
            <p className="text-sm text-red-600">{auditLogError}</p>
          ) : auditLogs.length === 0 ? (
            <p className="text-sm text-slate-500">Keine Aktivitäten vorhanden</p>
          ) : (
            <ul className="space-y-0 border-l border-slate-200 pl-4 ml-1">
              {auditLogs.map((entry) => (
                <li
                  key={entry.id}
                  className="relative pb-4 last:pb-0 pl-2 -ml-px border-l border-transparent"
                >
                  <span
                    className="absolute -left-[5px] top-1.5 h-2 w-2 rounded-full bg-orange-500"
                    aria-hidden
                  />
                  <p className="text-xs text-slate-500">
                    {formatAuditTimestamp(entry.created_at)}
                  </p>
                  <div className="font-medium text-slate-800 mt-0.5 space-y-1">
                    {getAuditEntryDisplayLines(entry, auditResolvers).map((line, idx) => (
                      <p key={idx}>{line}</p>
                    ))}
                  </div>
                  <p className="text-sm text-slate-600 mt-1">
                    {auditActionLabel(entry.action)}
                    {" · "}
                    {entry.actor_name ||
                      entry.actor_email ||
                      entry.actor_user_id ||
                      "—"}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        {isRoomModalOpen && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
            <div className="bg-white w-full max-w-3xl rounded-2xl shadow-xl border border-slate-200 p-6 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-2xl font-bold text-slate-800">
                    {editingRoomId
                      ? "Room bearbeiten"
                      : "Neuen Room hinzufügen"}
                  </h3>
                  <p className="text-slate-500 mt-1">
                    {editingRoomId
                      ? "Bearbeite hier den vorhandenen Room."
                      : "Room ID wird automatisch vergeben."}
                  </p>
                </div>

                <button
                  onClick={handleCloseRoomModal}
                  className="text-slate-500 hover:text-slate-700 text-2xl leading-none"
                >
                  ×
                </button>
              </div>

              <div className="mb-6 bg-slate-50 border border-slate-200 rounded-xl p-4">
                <p className="text-sm text-slate-500">
                  {editingRoomId ? "Room ID" : "Automatische Room ID"}
                </p>
                <p className="text-xl font-bold text-slate-800 mt-1">
                  {editingRoomId
                    ? unitRooms.find(
                        (room) => String(room.id) === String(editingRoomId)
                      )?.roomId
                    : nextRoomId}
                </p>
              </div>

              <form onSubmit={handleRoomSubmit}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-slate-600 mb-2">
                      Zimmername
                    </label>
                    <input
                      type="text"
                      name="roomName"
                      value={roomForm.roomName}
                      onChange={handleRoomChange}
                      required
                      className="w-full border border-slate-300 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-slate-600 mb-2">
                      Status
                    </label>
                    <select
                      name="status"
                      value={roomForm.status}
                      onChange={handleRoomChange}
                      className="w-full border border-slate-300 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500"
                    >
                      <option>Frei</option>
                      <option>Belegt</option>
                      <option>Reserviert</option>
                      <option>In Reinigung</option>
                      <option>Blockiert</option>
                      <option>In Einrichtung</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm text-slate-600 mb-2">
                      Mieter / reserviert für
                    </label>
                    <input
                      type="text"
                      name="tenant"
                      value={roomForm.tenant}
                      onChange={handleRoomChange}
                      placeholder="z. B. Max Muster"
                      disabled={
                        roomForm.status !== "Belegt" &&
                        roomForm.status !== "Reserviert"
                      }
                      className="w-full border border-slate-300 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500 disabled:bg-slate-100 disabled:text-slate-400"
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-slate-600 mb-2">
                      Preis pro Monat
                    </label>
                    <input
                      type="number"
                      name="priceMonthly"
                      value={roomForm.priceMonthly}
                      onChange={handleRoomChange}
                      required={
                        roomForm.status !== "Blockiert" &&
                        roomForm.status !== "In Einrichtung"
                      }
                      disabled={
                        roomForm.status === "Blockiert" ||
                        roomForm.status === "In Einrichtung"
                      }
                      placeholder="z. B. 950"
                      className="w-full border border-slate-300 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500 disabled:bg-slate-100 disabled:text-slate-400"
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-slate-600 mb-2">
                      Einzugsdatum
                    </label>
                    <input
                      type="date"
                      name="moveInDate"
                      value={roomForm.moveInDate}
                      onChange={handleRoomChange}
                      disabled={roomForm.status !== "Belegt"}
                      className="w-full border border-slate-300 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500 disabled:bg-slate-100 disabled:text-slate-400"
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-slate-600 mb-2">
                      Frei ab / Auszugsdatum
                    </label>
                    <input
                      type="date"
                      name="freeFromDate"
                      value={roomForm.freeFromDate}
                      onChange={handleRoomChange}
                      className="w-full border border-slate-300 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-slate-600 mb-2">
                      Mindestmietdauer in Monaten
                    </label>
                    <input
                      type="number"
                      name="minimumStayMonths"
                      value={roomForm.minimumStayMonths}
                      onChange={handleRoomChange}
                      min="1"
                      className="w-full border border-slate-300 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-slate-600 mb-2">
                      Kündigungsfrist in Monaten
                    </label>
                    <input
                      type="number"
                      name="noticePeriodMonths"
                      value={roomForm.noticePeriodMonths}
                      onChange={handleRoomChange}
                      min="1"
                      className="w-full border border-slate-300 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>

                  {roomForm.status === "Reserviert" && (
                    <div className="md:col-span-2">
                      <label className="block text-sm text-slate-600 mb-2">
                        Reserviert bis
                      </label>
                      <input
                        type="date"
                        name="reservedUntil"
                        value={roomForm.reservedUntil}
                        onChange={handleRoomChange}
                        className="w-full border border-slate-300 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500"
                      />
                    </div>
                  )}

                  {roomForm.status === "Blockiert" && (
                    <>
                      <div>
                        <label className="block text-sm text-slate-600 mb-2">
                          Blockiert bis
                        </label>
                        <input
                          type="date"
                          name="blockedUntil"
                          value={roomForm.blockedUntil}
                          onChange={handleRoomChange}
                          className="w-full border border-slate-300 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500"
                        />
                      </div>

                      <div>
                        <label className="block text-sm text-slate-600 mb-2">
                          Grund
                        </label>
                        <input
                          type="text"
                          name="blockedReason"
                          value={roomForm.blockedReason}
                          onChange={handleRoomChange}
                          placeholder="z. B. Renovation"
                          className="w-full border border-slate-300 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500"
                        />
                      </div>
                    </>
                  )}

                  {roomForm.status === "In Einrichtung" && (
                    <div className="md:col-span-2">
                      <label className="block text-sm text-slate-600 mb-2">
                        Bereit ab
                      </label>
                      <input
                        type="date"
                        name="setupReadyDate"
                        value={roomForm.setupReadyDate}
                        onChange={handleRoomChange}
                        className="w-full border border-slate-300 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500"
                      />
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-3 mt-6">
                  <button
                    type="button"
                    onClick={handleCloseRoomModal}
                    className="px-5 py-3 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
                  >
                    Abbrechen
                  </button>

                  <button
                    type="submit"
                    className="bg-orange-500 hover:bg-orange-600 text-white px-5 py-3 rounded-lg font-medium transition"
                  >
                    {editingRoomId
                      ? "Änderungen speichern"
                      : "Room speichern"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
        {assignOpen && (
          <div
            className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/35 p-4"
            onClick={() => !assignSaving && setAssignOpen(false)}
            role="presentation"
          >
            <div
              className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-lg max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="unit-assign-title"
            >
              <h2 id="unit-assign-title" className="text-lg font-semibold text-slate-900 mb-1">
                Zuordnungen
              </h2>
              <p className="text-sm text-slate-500 mb-4">
                Eigentümer, Verwaltung, Bewirtschafter und Liegenschaft für diese Unit.
              </p>
              {assignListsLoading ? (
                <p className="text-sm text-slate-500 py-4">Lade Auswahl …</p>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label htmlFor="unit-assign-property" className="block text-xs font-medium text-slate-500 mb-1">
                      Liegenschaft
                    </label>
                    <select
                      id="unit-assign-property"
                      value={assignForm.property_id}
                      onChange={(e) =>
                        setAssignForm((f) => ({ ...f, property_id: e.target.value }))
                      }
                      disabled={assignSaving}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 bg-white"
                    >
                      <option value="">—</option>
                      {assignLists.properties.map((p) => (
                        <option key={p.id} value={p.id}>
                          {String(p.title || "").trim() || p.id}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="unit-assign-landlord" className="block text-xs font-medium text-slate-500 mb-1">
                      Verwaltung
                    </label>
                    <select
                      id="unit-assign-landlord"
                      value={assignForm.landlord_id}
                      onChange={(e) =>
                        setAssignForm((f) => ({ ...f, landlord_id: e.target.value }))
                      }
                      disabled={assignSaving}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 bg-white"
                    >
                      <option value="">—</option>
                      {assignLists.landlords.map((ll) => (
                        <option key={ll.id} value={ll.id}>
                          {landlordDisplayName(ll)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="unit-assign-pm" className="block text-xs font-medium text-slate-500 mb-1">
                      Bewirtschafter
                    </label>
                    <select
                      id="unit-assign-pm"
                      value={assignForm.property_manager_id}
                      onChange={(e) =>
                        setAssignForm((f) => ({ ...f, property_manager_id: e.target.value }))
                      }
                      disabled={assignSaving}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 bg-white"
                    >
                      <option value="">—</option>
                      {assignLists.pms.map((pm) => (
                        <option key={pm.id} value={pm.id}>
                          {propertyManagerDisplayName(pm)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="unit-assign-owner" className="block text-xs font-medium text-slate-500 mb-1">
                      Eigentümer
                    </label>
                    <select
                      id="unit-assign-owner"
                      value={assignForm.owner_id}
                      onChange={(e) =>
                        setAssignForm((f) => ({ ...f, owner_id: e.target.value }))
                      }
                      disabled={assignSaving}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 bg-white"
                    >
                      <option value="">—</option>
                      {assignLists.owners.map((o) => (
                        <option key={o.id} value={o.id}>
                          {String(o.name || "").trim() ||
                            String(o.email || "").trim() ||
                            o.id}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
              {assignErr ? <p className="mt-3 text-sm text-red-700">{assignErr}</p> : null}
              <div className="flex gap-2 justify-end mt-6">
                <button
                  type="button"
                  disabled={assignSaving}
                  onClick={() => setAssignOpen(false)}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                >
                  Abbrechen
                </button>
                <button
                  type="button"
                  disabled={assignSaving || assignListsLoading}
                  onClick={saveAssignModal}
                  className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
                >
                  {assignSaving ? "Speichern …" : "Speichern"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminUnitDetailPage;