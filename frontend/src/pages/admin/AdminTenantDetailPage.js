import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  fetchAdminTenant,
  createAdminTenant,
  updateAdminTenant,
  fetchAdminTenantNotes,
  createAdminTenantNote,
  fetchAdminTenantEvents,
  fetchAdminInvoices,
  fetchAdminTenancies,
  createAdminTenancy,
  patchAdminTenancy,
  fetchAdminTenancyRevenue,
  createAdminTenancyRevenue,
  patchAdminTenancyRevenue,
  deleteAdminTenancyRevenue,
  fetchAdminUnits,
  fetchAdminRooms,
  fetchAdminTenantDocuments,
  uploadAdminTenantDocument,
  fetchAdminTenantDocumentDownloadUrl,
  deleteAdminTenantDocument,
  fetchAdminAuditLogs,
  normalizeUnit,
  normalizeRoom,
} from "../../api/adminData";
import { tenantDisplayName } from "../../utils/tenantDisplayName";
import { getDisplayUnitId } from "../../utils/unitDisplayId";
import {
  UNIT_LANDLORD_LEASE_ENDED_TENANCY_MESSAGE,
  deriveTenantOperationalStatus,
  getRoomOccupancyStatus,
  getTodayIsoForOccupancy,
  parseIsoDate,
} from "../../utils/unitOccupancyStatus";
import { buildGoogleMapsSearchUrl } from "../../utils/googleMapsUrl";
import {
  REVENUE_TYPE_OPTIONS,
  REVENUE_TYPE_VALUE_SET,
  normalizeRevenueFrequency,
  revenueFrequencyLabel,
  revenueTypeLabelForDisplay,
  monthlyEquivalentFromRevenueRows,
  totalOneTimeRevenueFromRows,
  recurringMonthlyBreakdownEntries,
  oneTimeBreakdownEntries,
} from "../../utils/tenancyRevenueBreakdown";

async function parseAdminErrorFromResponse(res) {
  const text = await res.text();
  try {
    const j = JSON.parse(text);
    if (Array.isArray(j.detail)) {
      return j.detail
        .map((d) => (typeof d === "string" ? d : d.msg || d.message || ""))
        .filter(Boolean)
        .join(" ");
    }
    if (typeof j.detail === "string") return j.detail;
  } catch (_) {
    /* ignore */
  }
  return text || "Die Anfrage ist fehlgeschlagen.";
}

function formatDateTime(iso) {
  if (!iso) return "—";

  const normalized = /Z|[+-]\d{2}:\d{2}$/.test(iso) ? iso : iso + "Z";
  const d = new Date(normalized);

  if (Number.isNaN(d.getTime())) return iso;

  return d.toLocaleString("de-CH", {
    timeZone: "Europe/Zurich",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateOnly(iso) {
  if (!iso) return "—";
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split("-");
    return `${d}.${m}.${y}`;
  }
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return iso;
  return dt.toLocaleDateString("de-CH");
}

function formatTenantDocumentDate(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString("de-CH", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function formatTenantDocumentType(doc) {
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

const TENANT_DOCUMENT_CATEGORY_LABELS = {
  rent_contract: "Mietvertrag",
  id_document: "Ausweis",
  debt_register: "Betreibungsregister",
  insurance: "Versicherung",
  other: "Sonstiges",
};

function formatTenantDocumentCategoryLabel(category) {
  if (category == null || String(category).trim() === "") return "—";
  const k = String(category).trim();
  return TENANT_DOCUMENT_CATEGORY_LABELS[k] || k;
}

function formatTenantAuditDateDe(iso) {
  if (!iso) return "—";
  const s = String(iso).slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split("-");
    return `${d}.${m}.${y}`;
  }
  return String(iso);
}

function formatTenantAuditChf(n) {
  if (n == null || n === "") return "—";
  const x = Number(n);
  if (Number.isNaN(x)) return String(n);
  return `${x.toLocaleString("de-CH")} CHF`;
}

function auditLogToTenantHistoryEvent(log) {
  const action = String(log.action || "").toLowerCase();
  const nv = log.new_values && typeof log.new_values === "object" ? log.new_values : {};
  const ov = log.old_values && typeof log.old_values === "object" ? log.old_values : {};
  const author = log.actor_name || log.actor_email || "—";

  if (nv.document_uploaded != null && String(nv.document_uploaded).trim() !== "") {
    return {
      id: `audit-${log.id}`,
      summary: `Dokument hochgeladen: ${String(nv.document_uploaded)}`,
      created_at: log.created_at,
      author_name: author,
      action_type: "audit_document",
    };
  }
  if (ov.document_deleted != null && String(ov.document_deleted).trim() !== "") {
    return {
      id: `audit-${log.id}`,
      summary: `Dokument gelöscht: ${String(ov.document_deleted)}`,
      created_at: log.created_at,
      author_name: author,
      action_type: "audit_document",
    };
  }

  if (nv.tenancy || ov.tenancy) {
    if (action === "create" && nv.tenancy && typeof nv.tenancy === "object") {
      const t = nv.tenancy;
      const end = t.display_end_date || t.move_out_date;
      return {
        id: `audit-${log.id}`,
        summary: `Mietverhältnis erstellt · Einzug ${formatTenantAuditDateDe(t.move_in_date)} · Ende ${formatTenantAuditDateDe(end)} · ${formatTenantAuditChf(t.monthly_rent)}/Monat`,
        created_at: log.created_at,
        author_name: author,
        action_type: "audit_tenancy",
      };
    }
    if (action === "delete" && ov.tenancy && typeof ov.tenancy === "object") {
      const t = ov.tenancy;
      return {
        id: `audit-${log.id}`,
        summary: `Mietverhältnis gelöscht · Einzug ${formatTenantAuditDateDe(t.move_in_date)}`,
        created_at: log.created_at,
        author_name: author,
        action_type: "audit_tenancy",
      };
    }
    if (action === "update" && ov.tenancy && nv.tenancy) {
      const o = ov.tenancy;
      const n = nv.tenancy;
      const parts = [];
      if (String(o.termination_effective_date || "") !== String(n.termination_effective_date || "")) {
        if (n.termination_effective_date) {
          parts.push(`Kündigung wirksam per ${formatTenantAuditDateDe(n.termination_effective_date)}`);
        }
      }
      if (String(o.notice_given_at || "") !== String(n.notice_given_at || "") && n.notice_given_at) {
        parts.push(`Kündigung erfasst · eingegangen am ${formatTenantAuditDateDe(n.notice_given_at)}`);
      }
      if (String(o.actual_move_out_date || "") !== String(n.actual_move_out_date || "") && n.actual_move_out_date) {
        parts.push(`Rückgabe erfolgt am ${formatTenantAuditDateDe(n.actual_move_out_date)}`);
      }
      if (String(o.display_end_date || "") !== String(n.display_end_date || "")) {
        parts.push(
          `Mietende geändert: ${formatTenantAuditDateDe(o.display_end_date) || "—"} → ${formatTenantAuditDateDe(n.display_end_date) || "—"}`
        );
      }
      if (String(o.display_status || "") !== String(n.display_status || "")) {
        parts.push(
          `Status: ${tenancyDisplayStatusLabelDe(o.display_status)} → ${tenancyDisplayStatusLabelDe(n.display_status)}`
        );
      }
      return {
        id: `audit-${log.id}`,
        summary:
          parts.length > 0
            ? `Mietverhältnis bearbeitet: ${parts.join(", ")}`
            : "Mietverhältnis bearbeitet",
        created_at: log.created_at,
        author_name: author,
        action_type: "audit_tenancy",
      };
    }
  }

  const rN = nv.tenancy_revenue;
  const rO = ov.tenancy_revenue;
  if (rN || rO) {
    if (action === "create" && rN) {
      return {
        id: `audit-${log.id}`,
        summary: `Einnahme hinzugefügt: ${revenueTypeLabelForDisplay(rN.type)}, ${formatTenantAuditChf(rN.amount_chf)}, ${revenueFrequencyLabel(rN.frequency).toLowerCase()}`,
        created_at: log.created_at,
        author_name: author,
        action_type: "audit_revenue",
      };
    }
    if (action === "delete" && rO) {
      return {
        id: `audit-${log.id}`,
        summary: `Einnahme gelöscht: ${revenueTypeLabelForDisplay(rO.type)}, ${formatTenantAuditChf(rO.amount_chf)}, ${revenueFrequencyLabel(rO.frequency).toLowerCase()}`,
        created_at: log.created_at,
        author_name: author,
        action_type: "audit_revenue",
      };
    }
    if (action === "update" && rO && rN) {
      return {
        id: `audit-${log.id}`,
        summary: `Einnahme bearbeitet: ${revenueTypeLabelForDisplay(rN.type)}, ${formatTenantAuditChf(rN.amount_chf)}, ${revenueFrequencyLabel(rN.frequency).toLowerCase()}`,
        created_at: log.created_at,
        author_name: author,
        action_type: "audit_revenue",
      };
    }
  }

  return null;
}

function formatInvoiceAmount(amount, currency) {
  const cur = currency || "CHF";
  const n = Number(amount);
  if (Number.isNaN(n)) return `${cur} —`;
  const num = n.toLocaleString("de-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${cur} ${num}`;
}

/** Dark pills for lifecycle preview in tenancy assign/edit UI (keys from deriveTenancyLifecyclePreviewForAssign). */
const TENANCY_LIFECYCLE_PREVIEW_BADGE_CLASS = {
  active:
    "inline-flex items-center rounded-full border border-emerald-300 bg-emerald-100 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:border-emerald-500/20 dark:text-emerald-400",
  notice_given:
    "inline-flex items-center rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-bold text-amber-400",
  reserved:
    "inline-flex items-center rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-bold text-amber-400",
  ended:
    "inline-flex items-center rounded-full border border-red-500/20 bg-red-500/10 px-2.5 py-0.5 text-[10px] font-bold text-red-400",
};

/** Canonical Mietende for UI: API display_end_date (matches tenancy_lifecycle.tenancy_display_end_date), then synced move_out. */
function tenancyDisplayEndIso(tn) {
  if (!tn) return null;
  const de = dateOnlyOrNull(tn.display_end_date);
  if (de) return de;
  return dateOnlyOrNull(tn.move_out_date);
}

function tenancyDisplayStatusLabelDe(ds) {
  const k = String(ds || "").toLowerCase();
  if (k === "active") return "Aktiv";
  if (k === "reserved") return "Reserviert";
  if (k === "notice_given") return "Gekündigt";
  if (k === "ended") return "Beendet";
  return "—";
}

function tenancyDraftDisplayEndIso(actualRaw, terminationRaw) {
  return dateOnlyOrNull(actualRaw) || dateOnlyOrNull(terminationRaw) || "";
}

function deriveTenancyLifecyclePreviewForAssign(
  moveInRaw,
  terminationEffectiveRaw,
  actualMoveOutRaw,
  todayIso = getTodayIsoForOccupancy()
) {
  const today = String(todayIso || "").slice(0, 10);
  const mi = moveInRaw != null ? String(moveInRaw).slice(0, 10) : "";
  const act = dateOnlyOrNull(actualMoveOutRaw);
  const te = dateOnlyOrNull(terminationEffectiveRaw);
  if (act && act < today) return "ended";
  if (te && te >= today) return "notice_given";
  if (te && te < today && (!act || act >= today)) return "notice_given";
  if (mi && mi > today) return "reserved";
  if (mi) return "active";
  return "active";
}

function storedTenancyStatusForApi(displayKey) {
  const k = String(displayKey || "").toLowerCase();
  if (k === "ended") return "ended";
  if (k === "reserved") return "reserved";
  return "active";
}

/** Subtle note from API display end + display_status only (no extra lifecycle rules). */
function tenancyEndUrgencyNote(tn, todayIso = getTodayIsoForOccupancy()) {
  const endIso = parseIsoDate(tn?.display_end_date) || parseIsoDate(tn?.move_out_date);
  if (!endIso) return null;
  const ds = String(tn?.display_status || "").toLowerCase();
  if (ds === "ended" || endIso < todayIso) return "bereits beendet";
  if (endIso >= todayIso) {
    const d0 = new Date(`${todayIso}T12:00:00`);
    const d1 = new Date(`${endIso}T12:00:00`);
    const days = Math.round((d1.getTime() - d0.getTime()) / 86400000);
    if (days === 0) return "endet heute";
    if (days > 0) return `endet in ${days} Tag${days === 1 ? "" : "en"}`;
  }
  return null;
}

function formatChfRent(amount) {
  const n = Number(amount);
  if (Number.isNaN(n)) return "CHF —";
  return `CHF ${n.toLocaleString("de-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const TENANT_DEPOSIT_TYPE_LABELS = {
  bank: "Bank",
  insurance: "Versicherung",
  cash: "Bar",
  none: "Keine",
};

function tenantDepositTypeLabel(raw) {
  if (!raw || typeof raw !== "string") return "—";
  const k = String(raw).toLowerCase();
  return TENANT_DEPOSIT_TYPE_LABELS[k] || raw;
}

const TENANT_DEPOSIT_PROVIDER_LABELS = {
  swisscaution: "SwissCaution",
  smartcaution: "SmartCaution",
  firstcaution: "FirstCaution",
  gocaution: "GoCaution",
  other: "Sonstige",
};

function tenantDepositProviderLabel(raw) {
  if (!raw || typeof raw !== "string") return "—";
  const k = String(raw).toLowerCase();
  return TENANT_DEPOSIT_PROVIDER_LABELS[k] || raw;
}

function parseOptionalTenantDepositFloat(value) {
  if (value === "" || value == null) return null;
  const n = Number(String(value).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function parseRevenueAmount(value) {
  if (value === "" || value == null) return null;
  const n = Number(String(value).replace(",", "."));
  if (!Number.isFinite(n) || n === 0) return null;
  return n;
}

function dateOnlyOrNull(value) {
  const s = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}/.test(s)) return null;
  return s.slice(0, 10);
}

/** Mirrors backend scheduling_end_date_from_parts (tenancy_lifecycle). */
function maxIsoDate(a, b) {
  if (!a) return b || null;
  if (!b) return a || null;
  return a >= b ? a : b;
}

function schedulingEndDateFromPartsJs(moveOutRaw, termRaw, actualRaw) {
  const mo = dateOnlyOrNull(moveOutRaw);
  const te = dateOnlyOrNull(termRaw);
  const act = dateOnlyOrNull(actualRaw);
  const contract = maxIsoDate(te, mo);
  if (act) {
    return maxIsoDate(contract, act);
  }
  return contract;
}

function tenancySchedulingEndIso(t) {
  return schedulingEndDateFromPartsJs(
    t?.move_out_date,
    t?.termination_effective_date,
    t?.actual_move_out_date
  );
}

/** Same interval rule as backend _overlaps (routes_admin_tenancies). */
function roomOverlapsAssignProposal(room, unitTenancies, newMoveInRaw, termRaw, actualRaw) {
  const rid = String(room?.id ?? room?.room_id ?? "").trim();
  const ourStart = dateOnlyOrNull(newMoveInRaw);
  if (!rid || !ourStart) return false;
  const newEffOut = schedulingEndDateFromPartsJs(null, termRaw, actualRaw);
  const ourEnd = newEffOut || "9999-12-31";
  const list = Array.isArray(unitTenancies) ? unitTenancies : [];
  for (const t of list) {
    if (String(t.room_id || t.roomId || "").trim() !== rid) continue;
    const st = String(t.status || "").trim().toLowerCase();
    if (st !== "active" && st !== "reserved") continue;
    const tIn = dateOnlyOrNull(t.move_in_date);
    if (!tIn) continue;
    const tEnd = tenancySchedulingEndIso(t) || "9999-12-31";
    if (ourStart < tEnd && ourEnd > tIn) return true;
  }
  return false;
}

function assignRoomStatusSuffixDe(status) {
  if (status === "belegt") return "belegt";
  if (status === "reserviert") return "reserviert";
  return "frei";
}

function assignRoomOptionTitleDe(status, disabled, overlaps) {
  if (disabled && overlaps && status === "frei") {
    return "Nicht verfügbar für gewählten Zeitraum (Überschneidung)";
  }
  if (status === "belegt") return "Bereits vermietet / belegt";
  if (status === "reserviert") return "Bereits reserviert";
  return "Verfügbar";
}

function applyRecurringRevenueDatesFromTenancy(form, freqRaw, moveInRaw, _moveOutRaw) {
  const nf = normalizeRevenueFrequency(freqRaw);
  const mi = dateOnlyOrNull(moveInRaw) || "";
  if (nf === "one_time") {
    return { ...form, frequency: freqRaw, start_date: "", end_date: "" };
  }
  return {
    ...form,
    frequency: freqRaw,
    start_date: form.start_date || mi,
    end_date: "",
  };
}

/** Zeitraum column: recurring ends follow tenancy display end; one_time uses stored dates. */
function revenueRowZeitraumDisplay(rr, tn) {
  const f = normalizeRevenueFrequency(rr?.frequency);
  const startIso =
    dateOnlyOrNull(rr?.start_date) || dateOnlyOrNull(tn?.move_in_date) || "";
  const startLabel = startIso ? String(startIso).slice(0, 10) : "—";
  if (f === "one_time") {
    const s = rr?.start_date ? String(rr.start_date).slice(0, 10) : "—";
    const e = rr?.end_date ? String(rr.end_date).slice(0, 10) : "—";
    return `${s} – ${e}`;
  }
  const endLabel = tenancyDisplayEndIso(tn) || "—";
  return `${startLabel} – ${endLabel}`;
}

function RevenueTypeSelect({ value, onChange, disabled, id, selectClassName }) {
  const v = String(value || "").trim();
  const legacy = v && !REVENUE_TYPE_VALUE_SET.has(v);
  const selectValue = legacy ? v : v || "rent";
  return (
    <select
      id={id}
      className={`${selectClassName} ${disabled ? "cursor-default" : "cursor-pointer"}`}
      value={selectValue}
      onChange={onChange}
      disabled={disabled}
    >
      {legacy ? (
        <option value={v}>
          {v}
        </option>
      ) : null}
      {REVENUE_TYPE_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function deriveTenancyStatusFromDates(moveInRaw, moveOutRaw, todayIso = getTodayIsoForOccupancy()) {
  const today = String(todayIso || "").slice(0, 10);
  const mi = moveInRaw != null ? String(moveInRaw).slice(0, 10) : "";
  const mo = moveOutRaw != null ? String(moveOutRaw).slice(0, 10) : "";
  if (mo && mo < today) return "ended";
  if (mi && mi > today) return "reserved";
  if (mi) return "active";
  return "";
}

function tenancyStatusLabelFromDerived(key) {
  if (key === "ended") return "Beendet";
  if (key === "reserved") return "Reserviert";
  if (key === "active") return "Aktiv";
  return "—";
}

function tenancyDateRangeLabel(tn) {
  const mi = tn.move_in_date;
  const mo = tenancyDisplayEndIso(tn);
  if (mo == null || mo === "") {
    return `seit ${formatDateOnly(mi)}`;
  }
  return `${formatDateOnly(mi)} – ${formatDateOnly(mo)}`;
}

/** Short German line when API returns participants with co_tenant / solidarhafter. */
function secondParticipantZweitmieterLine(participants) {
  if (!Array.isArray(participants) || participants.length === 0) return null;
  const sec = participants.find(
    (p) => p && (p.role === "co_tenant" || p.role === "solidarhafter")
  );
  if (!sec) return null;
  const name = tenantDisplayName(sec.tenant) || String(sec.tenant_id || "").trim();
  if (!name) return null;
  const roleDe = sec.role === "co_tenant" ? "Co-Mieter" : "Solidarhafter";
  return `Zweitmieter: ${name} (${roleDe})`;
}

function getStatusMeta(status) {
  const normalized = String(status || "").toLowerCase();
  if (
    normalized === "active" ||
    normalized === "aktiv" ||
    normalized === "belegt"
  ) {
    return {
      label: "Aktiv",
      bg: "#DCFCE7",
      color: "#166534",
      border: "#86EFAC",
    };
  }
  if (normalized === "reserved" || normalized === "reserviert") {
    return {
      label: "Reserviert",
      bg: "#FEF3C7",
      color: "#92400E",
      border: "#FCD34D",
    };
  }
  if (
    normalized === "ended" ||
    normalized === "beendet" ||
    normalized === "move_out" ||
    normalized === "ausgezogen"
  ) {
    return {
      label: "Ausgezogen",
      bg: "#E5E7EB",
      color: "#374151",
      border: "#D1D5DB",
    };
  }
  if (normalized === "inactive" || normalized === "inaktiv") {
    return {
      label: "Inaktiv",
      bg: "#F1F5F9",
      color: "#475569",
      border: "#CBD5E1",
    };
  }
  return {
    label: status || "Offen",
    bg: "#F1F5F9",
    color: "#475569",
    border: "#CBD5E1",
  };
}

const gridTwoCol = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
  gap: "12px 20px",
};

const pageWrapClass = "mx-auto max-w-[min(1400px,100%)] p-6";

const tableClass =
  "w-full border-collapse text-sm text-[#0f172a] dark:text-[#eef2ff]";

const thCellClass =
  "border-b border-black/10 px-3 py-2.5 text-left text-[11px] font-semibold text-[#64748b] dark:border-white/[0.05] dark:text-[#6b7a9a]";

const tdCellClass =
  "border-b border-black/10 px-3 py-2.5 align-top text-[#0f172a] dark:border-white/[0.05] dark:text-[#eef2ff]";

const sectionCardClass =
  "mb-3 rounded-[14px] border border-black/10 bg-white p-4 dark:border-white/[0.07] dark:bg-[#141824]";

const labelClass =
  "mb-1 block text-[10px] font-normal text-[#64748b] dark:text-[#6b7a9a]";

const inputClass =
  "box-border w-full rounded-[9px] border border-black/10 bg-slate-100 px-2.5 py-2 text-sm text-[#0f172a] outline-none dark:border-white/[0.08] dark:bg-[#111520] dark:text-[#eef2ff]";

const textareaClass =
  "box-border min-h-[88px] w-full resize-y rounded-[9px] border border-black/10 bg-slate-100 px-2.5 py-2 font-[inherit] text-sm text-[#0f172a] outline-none dark:border-white/[0.08] dark:bg-[#111520] dark:text-[#eef2ff]";

const sectionTitleClass =
  "mb-2.5 mt-0 text-[9px] font-bold uppercase tracking-[1px] text-[#64748b] dark:text-[#6b7a9a]";

function TenantNotesBlock({
  notes,
  noteDraft,
  setNoteDraft,
  noteSaving,
  noteErr,
  noteSubmitError,
  onSubmit,
}) {
  return (
    <div className={sectionCardClass}>
      <div className={sectionTitleClass}>Notizen</div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <label htmlFor="td-note" className={`${labelClass} mb-1.5`}>
          Neue Notiz
        </label>
        <textarea
          id="td-note"
          className={textareaClass}
          value={noteDraft}
          onChange={(e) => setNoteDraft(e.target.value)}
          disabled={noteSaving}
          placeholder="Interne Notiz …"
        />
        {noteErr ? (
          <div style={{ marginTop: "8px", fontSize: "13px", color: "#f87171" }}>{noteErr}</div>
        ) : null}
        {noteSubmitError ? (
          <div style={{ marginTop: "8px", fontSize: "13px", color: "#f87171" }}>{noteSubmitError}</div>
        ) : null}
        <div style={{ marginTop: "10px" }}>
          <button
            type="submit"
            disabled={noteSaving}
            className={`rounded-[8px] bg-gradient-to-r from-[#5b8cff] to-[#7c5cfc] px-3.5 py-2 text-sm font-semibold text-white ${
              noteSaving ? "cursor-default opacity-50" : "cursor-pointer"
            }`}
            style={{ border: "none" }}
          >
            {noteSaving ? "Speichern …" : "Notiz speichern"}
          </button>
        </div>
      </form>
      <div className="mt-4 border-t border-black/10 pt-3.5 dark:border-white/[0.05]">
        <div className="mb-2 text-[10px] font-bold uppercase tracking-[1px] text-[#64748b] dark:text-[#6b7a9a]">
          Alle Notizen
        </div>
        {!notes.length ? (
          <p className="m-0 text-sm text-[#64748b] dark:text-[#6b7a9a]">Noch keine Notizen</p>
        ) : (
          <ul className="m-0 list-none p-0">
            {notes.map((n) => (
              <li
                key={n.id}
                className="mb-3 rounded-[10px] border border-black/10 bg-slate-100 p-3 last:mb-0 dark:border-white/[0.05] dark:bg-[#111520]"
              >
                <div className="whitespace-pre-wrap text-[13px] font-medium text-[#0f172a] dark:text-[#eef2ff]">
                  {n.content}
                </div>
                <div className="mt-1.5 text-xs text-[#64748b] dark:text-[#6b7a9a]">
                  {formatDateTime(n.created_at)} · {n.author_name || "—"}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function TenantHistoryBlock({ events }) {
  return (
    <div className={sectionCardClass}>
      <div className={sectionTitleClass}>Verlauf / Aktivität</div>
      {!events.length ? (
        <p className="m-0 text-sm text-[#64748b] dark:text-[#6b7a9a]">Noch kein Verlauf</p>
      ) : (
        <ul className="m-0 list-none p-0">
          {events.map((ev) => {
            const showDiff =
              ev.action_type === "tenant_updated" &&
              ev.field_name &&
              (ev.old_value != null || ev.new_value != null);
            return (
              <li
                key={ev.id}
                className="border-b border-black/10 py-3 last:border-b-0 dark:border-white/[0.05]"
              >
                <div className="text-[13px] font-semibold text-[#0f172a] dark:text-[#eef2ff]">{ev.summary}</div>
                {showDiff ? (
                  <div className="mt-1 text-xs text-[#64748b] dark:text-[#6b7a9a]">
                    {ev.old_value ?? "—"} → {ev.new_value ?? "—"}
                  </div>
                ) : null}
                <div className="mt-1.5 text-xs text-[#64748b] dark:text-[#6b7a9a]">
                  {formatDateTime(ev.created_at)} · {ev.author_name || "—"}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div style={{ marginBottom: "12px" }}>
      <span className={labelClass}>{label}</span>
      <div className="text-[13px] font-medium text-[#0f172a] dark:text-[#eef2ff]">{value || "—"}</div>
    </div>
  );
}

const PERMIT_OPTIONS = new Set(["B", "C", "L", "G", "Other"]);

function initialAssignSecondForm() {
  return {
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    street: "",
    postalCode: "",
    city: "",
    country: "CH",
    nationality: "",
    isSwiss: null,
    residencePermit: "",
  };
}

const emptyForm = {
  firstName: "",
  lastName: "",
  birthDate: "",
  nationality: "",
  isSwiss: null,
  residencePermit: "",
  email: "",
  phone: "",
  company: "",
  street: "",
  postalCode: "",
  city: "",
  country: "",
};

function tenantToForm(t) {
  if (!t) return { ...emptyForm };
  const bd = t.birth_date;
  const birthDate =
    bd && typeof bd === "string" && /^\d{4}-\d{2}-\d{2}/.test(bd)
      ? bd.slice(0, 10)
      : "";
  const rp = t.residence_permit || "";
  return {
    firstName: (t.first_name || "").trim(),
    lastName: (t.last_name || "").trim(),
    birthDate,
    nationality: (t.nationality || "").trim(),
    isSwiss:
      t.is_swiss === true ? true : t.is_swiss === false ? false : null,
    residencePermit: PERMIT_OPTIONS.has(rp) ? rp : "",
    email: (t.email || "").trim(),
    phone: (t.phone || "").trim(),
    company: (t.company || "").trim(),
    street: (t.street || "").trim(),
    postalCode: (t.postal_code || "").trim(),
    city: (t.city || "").trim(),
    country: (t.country || "").trim(),
  };
}

export default function AdminTenantDetailPage() {
  const { tenantId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const editing = Boolean(
    location.state &&
      typeof location.state === "object" &&
      location.state.tenantStammdatenEdit === true
  );
  const [tenant, setTenant] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [notes, setNotes] = useState([]);
  const [events, setEvents] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [tenantDocuments, setTenantDocuments] = useState([]);
  const [tenantDocUploading, setTenantDocUploading] = useState(false);
  const [tenantDocUploadError, setTenantDocUploadError] = useState("");
  const [tenantDocCategory, setTenantDocCategory] = useState("");
  const tenantDocFileInputRef = useRef(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteValidationErr, setNoteValidationErr] = useState(null);
  const [noteSubmitError, setNoteSubmitError] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [tenancies, setTenancies] = useState([]);
  const [shouldRefreshTenantList, setShouldRefreshTenantList] = useState(false);

  const [assignOpen, setAssignOpen] = useState(false);
  const [assignUnits, setAssignUnits] = useState([]);
  const [assignUnitsLoading, setAssignUnitsLoading] = useState(false);
  const [assignUnitsErr, setAssignUnitsErr] = useState(null);
  const [assignRooms, setAssignRooms] = useState([]);
  const [assignRoomsLoading, setAssignRoomsLoading] = useState(false);
  const [assignUnitTenancies, setAssignUnitTenancies] = useState([]);
  const [assignUnitId, setAssignUnitId] = useState("");
  const [assignRoomId, setAssignRoomId] = useState("");
  const [assignMoveIn, setAssignMoveIn] = useState("");
  const [assignNoticeGivenAt, setAssignNoticeGivenAt] = useState("");
  const [assignTerminationEffective, setAssignTerminationEffective] = useState("");
  const [assignActualMoveOut, setAssignActualMoveOut] = useState("");
  const [assignTerminatedBy, setAssignTerminatedBy] = useState("");
  const [assignTenantDepositType, setAssignTenantDepositType] = useState("");
  const [assignTenantDepositAmount, setAssignTenantDepositAmount] = useState("");
  const [assignTenantDepositProvider, setAssignTenantDepositProvider] = useState("");
  const [assignErr, setAssignErr] = useState(null);
  const [assignSecondInlineOpen, setAssignSecondInlineOpen] = useState(false);
  const [assignSecondForm, setAssignSecondForm] = useState(initialAssignSecondForm);
  const [assignSecondRole, setAssignSecondRole] = useState("");
  const [assignSaving, setAssignSaving] = useState(false);
  const [assignRevenueRows, setAssignRevenueRows] = useState([]);
  const [assignRevenueForm, setAssignRevenueForm] = useState({
    type: "rent",
    amount_chf: "",
    frequency: "monthly",
    start_date: "",
    end_date: "",
    notes: "",
  });

  const [tenancyEditingId, setTenancyEditingId] = useState(null);
  const [tenancyEditNoticeGivenAt, setTenancyEditNoticeGivenAt] = useState("");
  const [tenancyEditTerminationEffective, setTenancyEditTerminationEffective] = useState("");
  const [tenancyEditActualMoveOut, setTenancyEditActualMoveOut] = useState("");
  const [tenancyEditTerminatedBy, setTenancyEditTerminatedBy] = useState("");
  const [tenancyEditTenantDepositType, setTenancyEditTenantDepositType] = useState("");
  const [tenancyEditTenantDepositAmount, setTenancyEditTenantDepositAmount] = useState("");
  const [tenancyEditTenantDepositProvider, setTenancyEditTenantDepositProvider] = useState("");
  const [tenancyEditSaving, setTenancyEditSaving] = useState(false);
  const [tenancyEditErr, setTenancyEditErr] = useState(null);

  const tenancyEditSectionRef = useRef(null);

  const [tenancyRevenueByTenancyId, setTenancyRevenueByTenancyId] = useState({});
  const [tenancyRevenueLoadingId, setTenancyRevenueLoadingId] = useState(null);
  const [tenancyRevenueErr, setTenancyRevenueErr] = useState(null);
  const [revenueEditingId, setRevenueEditingId] = useState(null);
  const [revenueForm, setRevenueForm] = useState({
    type: "rent",
    amount_chf: "",
    frequency: "monthly",
    start_date: "",
    end_date: "",
    notes: "",
  });

  const prefetchTenancyRevenueForTenancyList = useCallback(async (tenancyList) => {
    const ids = (tenancyList || [])
      .map((t) => t?.id)
      .filter((id) => id != null && String(id).trim() !== "")
      .map(String);
    if (!ids.length) {
      setTenancyRevenueByTenancyId({});
      return;
    }
    const results = await Promise.all(
      ids.map(async (tid) => {
        try {
          const rows = await fetchAdminTenancyRevenue(tid);
          return [tid, Array.isArray(rows) ? rows : []];
        } catch {
          return [tid, []];
        }
      })
    );
    const next = {};
    for (const [tid, rows] of results) next[tid] = rows;
    setTenancyRevenueByTenancyId(next);
  }, []);

  const mergedHistoryEvents = useMemo(() => {
    const fromAudit = (auditLogs || []).map(auditLogToTenantHistoryEvent).filter(Boolean);
    const combined = [...(events || []), ...fromAudit];
    return combined.sort((a, b) => {
      const ta = new Date(a.created_at || 0).getTime();
      const tb = new Date(b.created_at || 0).getTime();
      return tb - ta;
    });
  }, [events, auditLogs]);

  const reloadTenanciesForTenant = useCallback(async () => {
    try {
      const items = await fetchAdminTenancies({ tenant_id: tenantId, limit: 200 });
      const list = Array.isArray(items) ? items : [];
      setTenancies(list);
      await prefetchTenancyRevenueForTenancyList(list);
      return list;
    } catch {
      setTenancies([]);
      setTenancyRevenueByTenancyId({});
      return [];
    }
  }, [tenantId, prefetchTenancyRevenueForTenancyList]);

  const reloadTenantAuditLogs = useCallback(async () => {
    if (!tenantId) return;
    try {
      const auditData = await fetchAdminAuditLogs({
        entity_type: "tenant",
        entity_id: tenantId,
      });
      setAuditLogs(Array.isArray(auditData?.items) ? auditData.items : []);
    } catch {
      setAuditLogs([]);
    }
  }, [tenantId]);

  const cancelTenancyEdit = () => {
    setTenancyEditingId(null);
    setTenancyEditErr(null);
    setTenancyEditNoticeGivenAt("");
    setTenancyEditTerminationEffective("");
    setTenancyEditActualMoveOut("");
    setTenancyEditTerminatedBy("");
    setTenancyEditTenantDepositType("");
    setTenancyEditTenantDepositAmount("");
    setTenancyEditTenantDepositProvider("");
    setTenancyRevenueErr(null);
    setRevenueEditingId(null);
    setRevenueForm({
      type: "rent",
      amount_chf: "",
      frequency: "monthly",
      start_date: "",
      end_date: "",
      notes: "",
    });
  };

  const startTenancyEdit = (tn) => {
    setTenancyEditingId(String(tn.id));
    setTenancyEditErr(null);
    const ng = dateOnlyOrNull(tn.notice_given_at) || "";
    setTenancyEditNoticeGivenAt(ng);
    const teInit =
      dateOnlyOrNull(tn.termination_effective_date) || dateOnlyOrNull(tn.move_out_date) || "";
    setTenancyEditTerminationEffective(teInit);
    setTenancyEditActualMoveOut(dateOnlyOrNull(tn.actual_move_out_date) || "");
    setTenancyEditTerminatedBy(String(tn.terminated_by || "").toLowerCase() || "");
    const tdt = String(tn.tenant_deposit_type || "").toLowerCase();
    setTenancyEditTenantDepositType(tdt || "");
    const tda = tn.tenant_deposit_amount;
    setTenancyEditTenantDepositAmount(
      tda != null && tda !== "" ? String(tda) : ""
    );
    setTenancyEditTenantDepositProvider(
      String(tn.tenant_deposit_provider || "").toLowerCase() || ""
    );

    const tid = tn?.id != null ? String(tn.id) : "";
    setTenancyRevenueErr(null);
    setRevenueEditingId(null);
    const mi = dateOnlyOrNull(tn.move_in_date) || "";
    const mo = tenancyDisplayEndIso(tn) || "";
    setRevenueForm({
      type: "rent",
      amount_chf: "",
      frequency: "monthly",
      start_date: mi,
      end_date: mo || "",
      notes: "",
    });
    if (tid && tenancyRevenueByTenancyId?.[tid] == null) {
      setTenancyRevenueLoadingId(tid);
      fetchAdminTenancyRevenue(tid)
        .then((rows) => {
          setTenancyRevenueByTenancyId((prev) => ({
            ...(prev || {}),
            [tid]: Array.isArray(rows) ? rows : [],
          }));
        })
        .catch((err) => setTenancyRevenueErr(err?.message || "Einnahmen konnten nicht geladen werden."))
        .finally(() => setTenancyRevenueLoadingId(null));
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        tenancyEditSectionRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
    });
  };

  const submitTenancyEdit = () => {
    if (!tenancyEditingId || !tenantId) return;
    setTenancyEditErr(null);
    setTenancyEditSaving(true);
    const tdt = String(tenancyEditTenantDepositType || "").trim().toLowerCase();
    const tprov = String(tenancyEditTenantDepositProvider || "").trim().toLowerCase();
    const body = {
      notice_given_at: dateOnlyOrNull(tenancyEditNoticeGivenAt),
      termination_effective_date: dateOnlyOrNull(tenancyEditTerminationEffective),
      actual_move_out_date: dateOnlyOrNull(tenancyEditActualMoveOut),
      terminated_by: String(tenancyEditTerminatedBy || "").trim().toLowerCase() || null,
      tenant_deposit_type: tdt || null,
      tenant_deposit_amount: parseOptionalTenantDepositFloat(tenancyEditTenantDepositAmount),
      tenant_deposit_provider:
        tdt === "insurance" && tprov ? tprov : null,
    };
    patchAdminTenancy(tenancyEditingId, body)
      .then(() =>
        Promise.all([
          reloadTenanciesForTenant(),
          fetchAdminTenantEvents(tenantId),
          reloadTenantAuditLogs(),
        ])
      )
      .then(([, eData]) => {
        if (eData?.items) setEvents(eData.items);
        cancelTenancyEdit();
      })
      .catch((err) => {
        setTenancyEditErr(err?.message || "Speichern fehlgeschlagen.");
      })
      .finally(() => setTenancyEditSaving(false));
  };

  const goToTenantList = () =>
    navigate(
      "/admin/tenants",
      shouldRefreshTenantList ? { state: { refreshTenants: true } } : undefined
    );

  const cancelTenantStammdatenEdit = () => navigate(-1);

  useEffect(() => {
    if (
      !(
        location.state &&
        typeof location.state === "object" &&
        location.state.tenantStammdatenEdit === true
      ) &&
      tenant
    ) {
      setForm(tenantToForm(tenant));
      setSaveError(null);
    }
  }, [location.state, tenant]);

  const startRevenueEdit = (row) => {
    if (!row?.id) return;
    setRevenueEditingId(String(row.id));
    const rf = normalizeRevenueFrequency(row.frequency);
    const isOneTime = rf === "one_time";
    setRevenueForm({
      type: String(row.type || "").trim() || "rent",
      amount_chf: row.amount_chf != null ? String(row.amount_chf) : "",
      frequency: rf,
      start_date: row.start_date != null ? String(row.start_date).slice(0, 10) : "",
      end_date: isOneTime && row.end_date != null ? String(row.end_date).slice(0, 10) : "",
      notes: row.notes != null ? String(row.notes) : "",
    });
    setTenancyRevenueErr(null);
  };

  const cancelRevenueEdit = (tn) => {
    const parentTenancyId = tenancyEditingId;
    setRevenueEditingId(null);
    if (!tn) {
      setRevenueForm({
        type: "rent",
        amount_chf: "",
        frequency: "monthly",
        start_date: "",
        end_date: "",
        notes: "",
      });
      setTenancyRevenueErr(null);
      return;
    }
    const mi = dateOnlyOrNull(tn.move_in_date) || "";
    const moDb = tenancyDisplayEndIso(tn) || "";
    const tid = String(tn.id);
    const moForm =
      parentTenancyId && String(parentTenancyId) === tid
        ? tenancyDraftDisplayEndIso(tenancyEditActualMoveOut, tenancyEditTerminationEffective)
        : "";
    const moEff = moForm || moDb;
    setRevenueForm({
      type: "rent",
      amount_chf: "",
      frequency: "monthly",
      start_date: mi,
      end_date: moEff || "",
      notes: "",
    });
    setTenancyRevenueErr(null);
  };

  const submitRevenueForm = async (tenancyId, tnForDefaults) => {
    const tid = tenancyId != null ? String(tenancyId) : "";
    if (!tid) return;
    const type = String(revenueForm.type || "").trim();
    if (!type) {
      setTenancyRevenueErr("Bitte Typ angeben.");
      return;
    }
    const amt = parseRevenueAmount(revenueForm.amount_chf);
    if (amt == null) {
      setTenancyRevenueErr("Bitte einen gültigen Betrag (≠ 0) eingeben.");
      return;
    }
    const freq = normalizeRevenueFrequency(revenueForm.frequency);
    let start_date = dateOnlyOrNull(revenueForm.start_date);
    if (freq !== "one_time" && !start_date) {
      start_date = dateOnlyOrNull(tnForDefaults?.move_in_date) || null;
    }
    const end_date = freq === "one_time" ? dateOnlyOrNull(revenueForm.end_date) : null;
    if (freq === "one_time" && start_date && end_date && end_date < start_date) {
      setTenancyRevenueErr("Enddatum muss nach dem Startdatum liegen.");
      return;
    }
    const body = {
      type,
      amount_chf: amt,
      frequency: freq,
      start_date,
      end_date,
      notes: String(revenueForm.notes || "").trim() || null,
    };
    setTenancyRevenueErr(null);
    setTenancyRevenueLoadingId(tid);
    try {
      if (revenueEditingId) {
        await patchAdminTenancyRevenue(revenueEditingId, body);
      } else {
        await createAdminTenancyRevenue(tid, body);
      }
      const list = await reloadTenanciesForTenant();
      await reloadTenantAuditLogs();
      const fresh = Array.isArray(list) ? list.find((x) => String(x.id) === tid) : null;
      cancelRevenueEdit(fresh || tnForDefaults || null);
    } catch (err) {
      setTenancyRevenueErr(err?.message || "Speichern fehlgeschlagen.");
    } finally {
      setTenancyRevenueLoadingId(null);
    }
  };

  const deleteRevenueRow = async (tenancyId, row, tnForDefaults) => {
    const tid = tenancyId != null ? String(tenancyId) : "";
    const rid = row?.id != null ? String(row.id) : "";
    if (!tid || !rid) return;
    if (!window.confirm("Diesen Einnahmen-Eintrag wirklich löschen?")) return;
    setTenancyRevenueErr(null);
    setTenancyRevenueLoadingId(tid);
    try {
      await deleteAdminTenancyRevenue(rid);
      const list = await reloadTenanciesForTenant();
      await reloadTenantAuditLogs();
      if (revenueEditingId === rid) {
        const fresh = Array.isArray(list) ? list.find((x) => String(x.id) === tid) : null;
        cancelRevenueEdit(fresh || tnForDefaults || null);
      }
    } catch (err) {
      setTenancyRevenueErr(err?.message || "Löschen fehlgeschlagen.");
    } finally {
      setTenancyRevenueLoadingId(null);
    }
  };

  function handleTenantDocPick() {
    tenantDocFileInputRef.current?.click();
  }

  async function handleTenantDocSelected(e) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f || !tenantId) return;
    setTenantDocUploading(true);
    setTenantDocUploadError("");
    try {
      await uploadAdminTenantDocument(tenantId, f, {
        category: tenantDocCategory.trim() || undefined,
      });
      setTenantDocCategory("");
      const items = await fetchAdminTenantDocuments(tenantId);
      setTenantDocuments(Array.isArray(items) ? items : []);
      await reloadTenantAuditLogs();
    } catch (err) {
      setTenantDocUploadError(err.message || "Upload fehlgeschlagen.");
    } finally {
      setTenantDocUploading(false);
    }
  }

  async function handleOpenTenantDocument(docId) {
    try {
      const data = await fetchAdminTenantDocumentDownloadUrl(docId);
      if (data?.url) window.open(data.url, "_blank", "noopener,noreferrer");
    } catch (err) {
      window.alert(err.message || "Download konnte nicht gestartet werden.");
    }
  }

  async function handleDeleteTenantDocument(docId) {
    if (!window.confirm("Dokument wirklich löschen?")) return;
    try {
      await deleteAdminTenantDocument(docId);
      const items = await fetchAdminTenantDocuments(tenantId);
      setTenantDocuments(Array.isArray(items) ? items : []);
      await reloadTenantAuditLogs();
    } catch (err) {
      window.alert(err.message || "Löschen fehlgeschlagen.");
    }
  }

  useEffect(() => {
    if (!tenantId) {
      setTenant(null);
      setLoadError("Kein Mieter angegeben.");
      setSaveError(null);
      setNotes([]);
      setEvents([]);
      setAuditLogs([]);
      setTenantDocuments([]);
      setInvoices([]);
      setTenancies([]);
      setNoteDraft("");
      setNoteValidationErr(null);
      setNoteSubmitError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setShouldRefreshTenantList(false);
    (async () => {
      try {
        const t = await fetchAdminTenant(tenantId);
        if (cancelled) return;
        if (!t) {
          setLoadError("Mieter nicht gefunden.");
          setTenant(null);
          setNotes([]);
          setEvents([]);
          setAuditLogs([]);
          setTenantDocuments([]);
          setInvoices([]);
          setTenancies([]);
          return;
        }
        setTenant(t);
        setForm(tenantToForm(t));
        const tenanciesFetch = fetchAdminTenancies({ tenant_id: tenantId, limit: 200 })
          .then((items) => (Array.isArray(items) ? items : []))
          .catch(() => []);
        const [nData, eData, invData, tenancyItems, auditData, tdDocs] = await Promise.all([
          fetchAdminTenantNotes(tenantId),
          fetchAdminTenantEvents(tenantId),
          fetchAdminInvoices({ tenantId, limit: 20 }).catch(() => ({ items: [] })),
          tenanciesFetch,
          fetchAdminAuditLogs({ entity_type: "tenant", entity_id: tenantId }).catch(() => ({
            items: [],
          })),
          fetchAdminTenantDocuments(tenantId).catch(() => []),
        ]);
        if (cancelled) return;
        setNotes(nData?.items || []);
        setEvents(eData?.items || []);
        setInvoices(invData?.items || []);
        const tList = Array.isArray(tenancyItems) ? tenancyItems : [];
        setTenancies(tList);
        await prefetchTenancyRevenueForTenancyList(tList);
        setAuditLogs(Array.isArray(auditData?.items) ? auditData.items : []);
        setTenantDocuments(Array.isArray(tdDocs) ? tdDocs : []);
      } catch (e) {
        if (!cancelled) setLoadError(e?.message || "Laden fehlgeschlagen.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantId, prefetchTenancyRevenueForTenancyList]);

  useEffect(() => {
    if (!assignOpen || !tenantId) return;
    setAssignUnitsErr(null);
    setAssignUnitsLoading(true);
    fetchAdminUnits()
      .then((data) => setAssignUnits((data || []).map(normalizeUnit)))
      .catch((e) => setAssignUnitsErr(e?.message ?? "Einheiten konnten nicht geladen werden."))
      .finally(() => setAssignUnitsLoading(false));
  }, [assignOpen, tenantId]);

  useEffect(() => {
    if (!assignUnitId) {
      setAssignRooms([]);
      setAssignRoomId("");
      setAssignUnitTenancies([]);
      return;
    }
    setAssignRoomsLoading(true);
    Promise.all([
      fetchAdminRooms(assignUnitId)
        .then((raw) => (Array.isArray(raw) ? raw : []))
        .catch(() => []),
      fetchAdminTenancies({ unit_id: assignUnitId, limit: 200 })
        .then((items) => (Array.isArray(items) ? items : []))
        .catch(() => []),
    ])
      .then(([roomRaw, tenRows]) => {
        setAssignRooms(roomRaw.map(normalizeRoom));
        setAssignUnitTenancies(tenRows);
      })
      .finally(() => setAssignRoomsLoading(false));
  }, [assignUnitId]);

  useEffect(() => {
    if (!assignRoomId || assignRoomsLoading) return;
    const r = assignRooms.find((x) => String(x.id) === String(assignRoomId));
    if (!r) return;
    const status = getRoomOccupancyStatus(r, assignUnitTenancies) || "frei";
    const overlaps = roomOverlapsAssignProposal(
      r,
      assignUnitTenancies,
      assignMoveIn,
      assignTerminationEffective,
      assignActualMoveOut
    );
    const disabled = overlaps || status !== "frei";
    if (disabled) setAssignRoomId("");
  }, [
    assignRoomId,
    assignRooms,
    assignRoomsLoading,
    assignUnitTenancies,
    assignMoveIn,
    assignTerminationEffective,
    assignActualMoveOut,
  ]);

  useEffect(() => {
    if (tenancyEditingId == null) return undefined;
    const id = requestAnimationFrame(() => {
      tenancyEditSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
    return () => cancelAnimationFrame(id);
  }, [tenancyEditingId]);

  const saveNote = () => {
    const text = noteDraft.trim();
    if (!text) {
      setNoteValidationErr("Bitte eine Notiz eingeben.");
      return;
    }
    setNoteValidationErr(null);
    setNoteSubmitError(null);
    setNoteSaving(true);
    createAdminTenantNote(tenantId, text)
      .then(() => {
        setNoteDraft("");
        return Promise.all([fetchAdminTenantNotes(tenantId), fetchAdminTenantEvents(tenantId)]);
      })
      .then(([nData, eData]) => {
        setNotes(nData?.items || []);
        setEvents(eData?.items || []);
      })
      .catch((err) => {
        console.warn("tenant note save failed", err);
        const m = String(err?.message || "");
        const technical =
          /body stream already read|Failed to execute ['"]text['"]/i.test(m);
        setNoteSubmitError(
          technical ? "Notiz konnte nicht gespeichert werden." : m || "Notiz konnte nicht gespeichert werden."
        );
      })
      .finally(() => setNoteSaving(false));
  };

  const statusMeta = useMemo(() => {
    const todayIso = getTodayIsoForOccupancy();
    const mine = Array.isArray(tenancies)
      ? tenancies.filter((x) => String(x.tenant_id) === String(tenantId))
      : [];
    return getStatusMeta(deriveTenantOperationalStatus(mine, todayIso));
  }, [tenancies, tenantId]);

  const applyUpdate = (updated) => {
    setTenant(updated);
    setForm(tenantToForm(updated));
  };

  const setField = (key) => (e) => {
    if (key === "isSwiss") {
      const raw = e.target.value;
      const v = raw === "" ? null : raw === "true";
      setForm((f) => {
        const next = { ...f, isSwiss: v };
        if (v === true) next.residencePermit = "";
        return next;
      });
      return;
    }
    const v = e.target.value;
    setForm((f) => ({ ...f, [key]: v }));
  };

  const resetAssignForm = () => {
    const today = new Date().toISOString().slice(0, 10);
    setAssignUnitId("");
    setAssignRoomId("");
    setAssignMoveIn(today);
    setAssignNoticeGivenAt("");
    setAssignTerminationEffective("");
    setAssignActualMoveOut("");
    setAssignTerminatedBy("");
    setAssignTenantDepositType("");
    setAssignTenantDepositAmount("");
    setAssignTenantDepositProvider("");
    setAssignSecondInlineOpen(false);
    setAssignSecondForm(initialAssignSecondForm());
    setAssignSecondRole("");
    setAssignErr(null);
    setAssignRevenueRows([]);
    setAssignRevenueForm({
      type: "rent",
      amount_chf: "",
      frequency: "monthly",
      start_date: today,
      end_date: "",
      notes: "",
    });
  };

  const openAssignForm = () => {
    resetAssignForm();
    setAssignOpen(true);
  };

  const handleAssignSubmit = (e) => {
    e.preventDefault();
    setAssignErr(null);
    if (!assignUnitId || !assignRoomId || !assignMoveIn.trim()) {
      setAssignErr("Einheit, Zimmer und Einzugsdatum sind erforderlich.");
      return;
    }
    const rows = Array.isArray(assignRevenueRows) ? assignRevenueRows : [];
    for (const r of rows) {
      const type = String(r?.type || "").trim();
      if (!type) {
        setAssignErr("Bitte Typ für alle Einnahmen-Zeilen angeben.");
        return;
      }
      const amt = parseRevenueAmount(r?.amount_chf);
      if (amt == null) {
        setAssignErr("Bitte für alle Einnahmen-Zeilen einen gültigen Betrag (≠ 0) angeben.");
        return;
      }
      const freq = normalizeRevenueFrequency(r?.frequency);
      if (!["monthly", "yearly", "one_time"].includes(freq)) {
        setAssignErr("Bitte eine gültige Frequenz wählen.");
        return;
      }
      const sd = dateOnlyOrNull(r?.start_date);
      const ed = dateOnlyOrNull(r?.end_date);
      if (freq === "one_time" && sd && ed && ed < sd) {
        setAssignErr("Enddatum muss nach dem Startdatum liegen.");
        return;
      }
    }
    const assignUnit = assignUnits.find((x) => String(x.id) === String(assignUnitId));
    if (
      assignUnit &&
      String(assignUnit.leaseStatus ?? assignUnit.lease_status ?? "").trim() === "ended"
    ) {
      setAssignErr(UNIT_LANDLORD_LEASE_ENDED_TENANCY_MESSAGE);
      return;
    }
    if (assignSecondInlineOpen) {
      const fn2 = String(assignSecondForm.firstName || "").trim();
      const ln2 = String(assignSecondForm.lastName || "").trim();
      const role2 = String(assignSecondRole || "").trim();
      if (!fn2 || !ln2) {
        setAssignErr("Bitte Vor- und Nachnamen für den Zweitmieter angeben.");
        return;
      }
      if (role2 !== "co_tenant" && role2 !== "solidarhafter") {
        setAssignErr("Bitte Rolle wählen (Zweitmieter oder Solidarhafter).");
        return;
      }
    }
    const preview = deriveTenancyLifecyclePreviewForAssign(
      assignMoveIn.trim(),
      assignTerminationEffective,
      assignActualMoveOut
    );
    const derivedStatus = storedTenancyStatusForApi(preview);
    const tdt = String(assignTenantDepositType || "").trim().toLowerCase();
    const bodyBase = {
      tenant_id: String(tenantId),
      unit_id: String(assignUnitId),
      room_id: String(assignRoomId),
      move_in_date: assignMoveIn.trim(),
      notice_given_at: dateOnlyOrNull(assignNoticeGivenAt),
      termination_effective_date: dateOnlyOrNull(assignTerminationEffective),
      actual_move_out_date: dateOnlyOrNull(assignActualMoveOut),
      terminated_by: String(assignTerminatedBy || "").trim().toLowerCase() || null,
      status: derivedStatus || "active",
    };
    if (tdt) bodyBase.tenant_deposit_type = tdt;
    const tda = parseOptionalTenantDepositFloat(assignTenantDepositAmount);
    if (tda !== null) bodyBase.tenant_deposit_amount = tda;
    const tprov = String(assignTenantDepositProvider || "").trim().toLowerCase();
    if (tdt === "insurance" && tprov) bodyBase.tenant_deposit_provider = tprov;

    setAssignSaving(true);
    void (async () => {
      try {
        let secondTenantId = null;
        let roleForParticipants = "";
        if (assignSecondInlineOpen) {
          const fn2 = String(assignSecondForm.firstName || "").trim();
          const ln2 = String(assignSecondForm.lastName || "").trim();
          roleForParticipants = String(assignSecondRole || "").trim();
          const permit2 =
            assignSecondForm.isSwiss === true
              ? undefined
              : assignSecondForm.residencePermit
                ? assignSecondForm.residencePermit
                : undefined;
          const createdSecond = await createAdminTenant({
            first_name: fn2,
            last_name: ln2,
            email: String(assignSecondForm.email || "").trim() || undefined,
            phone: String(assignSecondForm.phone || "").trim() || undefined,
            street: String(assignSecondForm.street || "").trim() || undefined,
            postal_code: String(assignSecondForm.postalCode || "").trim() || undefined,
            city: String(assignSecondForm.city || "").trim() || undefined,
            country: String(assignSecondForm.country || "").trim() || undefined,
            nationality: String(assignSecondForm.nationality || "").trim() || undefined,
            ...(assignSecondForm.isSwiss === null ? {} : { is_swiss: assignSecondForm.isSwiss }),
            residence_permit: permit2,
            room_id: assignRoomId ? String(assignRoomId) : undefined,
          });
          secondTenantId =
            createdSecond?.id != null ? String(createdSecond.id) : "";
          if (!secondTenantId) {
            setAssignErr("Zweitmieter konnte nicht angelegt werden.");
            return;
          }
        }
        const body = { ...bodyBase };
        if (secondTenantId && roleForParticipants) {
          body.participants = [
            { tenant_id: String(tenantId), role: "primary_tenant" },
            { tenant_id: secondTenantId, role: roleForParticipants },
          ];
        }
        const createdTenancy = await createAdminTenancy(body);
        const tid = createdTenancy?.id != null ? String(createdTenancy.id) : "";
        if (tid) {
          for (const r of rows) {
            const fr = normalizeRevenueFrequency(r.frequency);
            await createAdminTenancyRevenue(tid, {
              type: String(r.type || "").trim(),
              amount_chf: Number(String(r.amount_chf).replace(",", ".")),
              frequency: fr,
              start_date: dateOnlyOrNull(r.start_date),
              end_date: fr === "one_time" ? dateOnlyOrNull(r.end_date) : null,
              notes: String(r.notes || "").trim() || null,
            });
          }
        }
        const [, eData] = await Promise.all([
          reloadTenanciesForTenant(),
          fetchAdminTenantEvents(tenantId),
          reloadTenantAuditLogs(),
        ]);
        if (eData?.items) setEvents(eData.items);
        setAssignOpen(false);
        resetAssignForm();
      } catch (err) {
        setAssignErr(err?.message || "Speichern fehlgeschlagen.");
      } finally {
        setAssignSaving(false);
      }
    })();
  };

  const handleSave = (e) => {
    e.preventDefault();
    setSaveError(null);
    const fn = form.firstName.trim();
    const ln = form.lastName.trim();
    if (!fn || !ln) {
      setSaveError("Vor- und Nachname sind erforderlich.");
      return;
    }
    setSaving(true);
    updateAdminTenant(tenantId, {
      first_name: fn,
      last_name: ln,
      birth_date: form.birthDate.trim() || null,
      nationality: form.nationality.trim() || null,
      is_swiss: form.isSwiss,
      residence_permit:
        form.isSwiss === true
          ? null
          : form.residencePermit
            ? form.residencePermit
            : null,
      email: form.email.trim(),
      phone: form.phone.trim() || null,
      company: form.company.trim() || null,
      street: form.street.trim() || null,
      postal_code: form.postalCode.trim() || null,
      city: form.city.trim() || null,
      country: form.country.trim() || null,
    })
      .then((updated) => {
        applyUpdate(updated);
        navigate(-1);
        setShouldRefreshTenantList(true);
        return Promise.all([
          fetchAdminTenantEvents(tenantId).catch(() => null),
          reloadTenantAuditLogs(),
        ]);
      })
      .then(([eData]) => {
        if (eData?.items) setEvents(eData.items);
      })
      .catch((err) => setSaveError(err?.message || "Speichern fehlgeschlagen."))
      .finally(() => setSaving(false));
  };

  const displayName = tenant ? tenantDisplayName(tenant) : "—";
  const tenantAddrLine1 = tenant?.street?.trim() || "";
  const tenantPlz = tenant?.postal_code?.trim() || "";
  const tenantCity = tenant?.city?.trim() || "";
  const tenantAddrLine2 = [tenantPlz, tenantCity].filter(Boolean).join(" ");
  const tenantAddrLine3 = tenant?.country?.trim() || "";
  const permitReadLabel = (t) => {
    const p = t?.residence_permit;
    if (!p) return "—";
    return PERMIT_OPTIONS.has(p) ? p : `${p} (legacy)`;
  };

  const tenantOpBadgeClass =
    statusMeta?.label === "Aktiv"
      ? "inline-flex rounded-full border border-green-500/20 bg-green-500/10 px-2.5 py-0.5 text-[10px] font-bold text-green-400"
      : statusMeta?.label === "Reserviert"
        ? "inline-flex rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-bold text-amber-400"
        : statusMeta?.label === "Ausgezogen"
          ? "inline-flex rounded-full border border-red-500/20 bg-red-500/10 px-2.5 py-0.5 text-[10px] font-bold text-red-400"
          : "inline-flex rounded-full border border-black/10 bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold text-[#0f172a] dark:border-white/[0.1] dark:bg-white/[0.06] dark:text-[#eef2ff]";

  return (
    <div className="min-h-screen bg-[#f8fafc] text-[#0f172a] [color-scheme:light] dark:bg-[#07090f] dark:text-[#eef2ff] dark:[color-scheme:dark]">
      <div className={pageWrapClass}>
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4 border-b border-black/10 bg-[#f8fafc] pb-5 dark:border-white/[0.07] dark:bg-[#07090f]">
          <div className="flex min-w-0 flex-wrap items-start gap-3">
            <button
              type="button"
              onClick={() => {
                if (editing) {
                  cancelTenantStammdatenEdit();
                  return;
                }
                goToTenantList();
              }}
              className="rounded-[8px] border border-black/10 bg-transparent px-3 py-2 text-[13px] font-semibold text-[#64748b] hover:bg-slate-100 dark:border-white/[0.1] dark:text-[#8090b0] dark:hover:bg-white/[0.04]"
              style={{ cursor: "pointer" }}
            >
              {editing ? "Abbrechen" : "← Zurück"}
            </button>
            <div style={{ minWidth: 0 }}>
              <div className="text-[10px] font-bold uppercase tracking-[1px] text-[#64748b] dark:text-[#6b7a9a]">Mieter</div>
              <h1 className="mt-1 break-words text-[22px] font-bold text-[#0f172a] dark:text-[#eef2ff]">
                {loading ? "…" : displayName}
              </h1>
              {!loading && tenant && (
                <div className="mt-2.5">
                  <span className={tenantOpBadgeClass}>{statusMeta?.label || "Status"}</span>
                </div>
              )}
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            {!editing && tenant && !loadError && !loading ? (
              <button
                type="button"
                onClick={() => {
                  setSaveError(null);
                  navigate(
                    {
                      pathname: location.pathname,
                      search: location.search,
                      hash: location.hash,
                    },
                    {
                      state: {
                        ...(typeof location.state === "object" && location.state !== null
                          ? location.state
                          : {}),
                        tenantStammdatenEdit: true,
                      },
                    }
                  );
                }}
                className="rounded-[8px] border border-black/10 bg-transparent px-3 py-2 text-[13px] font-semibold text-[#64748b] hover:bg-slate-100 dark:border-white/[0.1] dark:text-[#8090b0] dark:hover:bg-white/[0.04]"
                style={{ cursor: "pointer" }}
              >
                Bearbeiten
              </button>
            ) : null}
          </div>
        </header>

        <main>
          {loading ? (
            <p className="text-[#64748b] dark:text-[#6b7a9a]">Lade Daten …</p>
          ) : loadError ? (
            <div className="rounded-[14px] border border-red-500/20 bg-red-500/10 p-4 text-[#f87171]">
              <p style={{ margin: "0 0 12px 0" }}>{loadError}</p>
              <button
                type="button"
                onClick={goToTenantList}
                className="rounded-[8px] border border-black/10 bg-transparent px-3.5 py-2 text-[13px] font-semibold text-[#64748b] dark:border-white/[0.1] dark:text-[#8090b0]"
                style={{ cursor: "pointer" }}
              >
                Zurück zur Übersicht
              </button>
            </div>
          ) : tenant ? (
            <>
              {!editing ? (
                <>
                  <div className={sectionCardClass}>
                    <div className={sectionTitleClass}>Stammdaten</div>
                    <div style={gridTwoCol}>
                      <Row label="Vorname" value={tenant.first_name} />
                      <Row label="Nachname" value={tenant.last_name} />
                      <Row label="Geburtsdatum" value={formatDateOnly(tenant.birth_date)} />
                      <Row label="Nationalität" value={tenant.nationality} />
                    </div>
                    <div className="mt-3 border-t border-black/10 pt-3 dark:border-white/[0.05]">
                      <span className={labelClass}>Erfasst am</span>
                      <div className="text-[13px] font-medium text-[#0f172a] dark:text-[#eef2ff]">
                        {formatDateTime(tenant.created_at)}
                      </div>
                    </div>
                  </div>
                  <div className={sectionCardClass}>
                    <div className={sectionTitleClass}>Aufenthalt</div>
                    <div style={gridTwoCol}>
                      <Row
                        label="Schweizer/in"
                        value={
                          tenant.is_swiss === true
                            ? "Ja"
                            : tenant.is_swiss === false
                              ? "Nein"
                              : "Unbekannt"
                        }
                      />
                      {tenant.is_swiss !== true ? (
                        <Row
                          label="Aufenthaltsbewilligung"
                          value={permitReadLabel(tenant)}
                        />
                      ) : null}
                    </div>
                  </div>
                  <div className={sectionCardClass}>
                    <div className={sectionTitleClass}>Kontakt</div>
                    <div style={gridTwoCol}>
                      <Row label="E-Mail" value={tenant.email} />
                      <Row label="Telefon" value={tenant.phone} />
                      <Row label="Firma" value={tenant.company} />
                    </div>
                  </div>
                  <section className="mb-3 rounded-[14px] border border-black/10 bg-white p-5 md:p-6 dark:border-white/[0.07] dark:bg-[#141824]">
                    <h2 className="mb-4 text-[9px] font-bold uppercase tracking-[1px] text-[#64748b] dark:text-[#6b7a9a]">Adresse</h2>
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1 space-y-1 text-[13px] font-medium text-[#0f172a] dark:text-[#eef2ff]">
                        <p>{tenantAddrLine1 ? tenantAddrLine1 : "—"}</p>
                        <p>{tenantAddrLine2 ? tenantAddrLine2 : "—"}</p>
                        <p>{tenantAddrLine3 ? tenantAddrLine3 : "—"}</p>
                      </div>
                      {tenantAddrLine1 || tenantPlz || tenantCity ? (
                        <button
                          type="button"
                          title="In Google Maps öffnen"
                          aria-label="In Google Maps öffnen"
                          onClick={() =>
                            window.open(
                              buildGoogleMapsSearchUrl(
                                tenant.street,
                                tenant.postal_code,
                                tenant.city
                              ),
                              "_blank",
                              "noopener,noreferrer"
                            )
                          }
                          className="inline-flex shrink-0 items-center justify-center rounded-[8px] border border-black/10 bg-transparent p-1.5 text-[#64748b] hover:bg-slate-100 hover:text-[#0f172a] dark:border-white/[0.1] dark:text-[#8090b0] dark:hover:bg-white/[0.05] dark:hover:text-[#eef2ff]"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden
                          >
                            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                            <circle cx="12" cy="10" r="3" />
                          </svg>
                        </button>
                      ) : null}
                    </div>
                  </section>
                </>
              ) : (
                <form onSubmit={handleSave}>
                  <div className={sectionCardClass}>
                    <div className={sectionTitleClass}>Stammdaten</div>
                    <div style={gridTwoCol}>
                      <div>
                        <label htmlFor="td-fn" className={labelClass}>
                          Vorname *
                        </label>
                        <input
                          id="td-fn"
                          className={inputClass}
                          value={form.firstName}
                          onChange={setField("firstName")}
                          disabled={saving}
                        />
                      </div>
                      <div>
                        <label htmlFor="td-ln" className={labelClass}>
                          Nachname *
                        </label>
                        <input
                          id="td-ln"
                          className={inputClass}
                          value={form.lastName}
                          onChange={setField("lastName")}
                          disabled={saving}
                        />
                      </div>
                    </div>
                    <div style={{ marginTop: "10px" }}>
                      <label htmlFor="td-bd" className={labelClass}>
                        Geburtsdatum
                      </label>
                      <input
                        id="td-bd"
                        type="date"
                        className={inputClass}
                        value={form.birthDate}
                        onChange={setField("birthDate")}
                        disabled={saving}
                      />
                    </div>
                    <div style={{ marginTop: "10px" }}>
                      <label htmlFor="td-nat" className={labelClass}>
                        Nationalität
                      </label>
                      <input
                        id="td-nat"
                        className={inputClass}
                        value={form.nationality}
                        onChange={setField("nationality")}
                        disabled={saving}
                      />
                    </div>
                  </div>
                  <div className={sectionCardClass}>
                    <div className={sectionTitleClass}>Aufenthalt</div>
                    <div style={{ marginBottom: "10px" }}>
                      <label htmlFor="td-swiss" className={labelClass}>
                        Schweizer/in
                      </label>
                      <select
                        id="td-swiss"
                        className={inputClass}
                        style={{ cursor: saving ? "default" : "pointer" }}
                        value={
                          form.isSwiss === null
                            ? ""
                            : form.isSwiss === true
                              ? "true"
                              : "false"
                        }
                        onChange={setField("isSwiss")}
                        disabled={saving}
                      >
                        <option value="">Unbekannt</option>
                        <option value="true">Ja</option>
                        <option value="false">Nein</option>
                      </select>
                    </div>
                    {form.isSwiss !== true ? (
                      <div style={{ marginTop: "10px" }}>
                        <label htmlFor="td-permit" className={labelClass}>
                          Aufenthaltsbewilligung
                        </label>
                        <select
                          id="td-permit"
                          className={inputClass}
                          style={{ cursor: saving ? "default" : "pointer" }}
                          value={form.residencePermit}
                          onChange={setField("residencePermit")}
                          disabled={saving}
                        >
                          <option value="">—</option>
                          <option value="B">B</option>
                          <option value="C">C</option>
                          <option value="L">L</option>
                          <option value="G">G</option>
                          <option value="Other">Other</option>
                        </select>
                      </div>
                    ) : null}
                  </div>
                  <div className={sectionCardClass}>
                    <div className={sectionTitleClass}>Kontakt</div>
                    <div style={{ marginBottom: "10px" }}>
                      <label htmlFor="td-email" className={labelClass}>
                        E-Mail
                      </label>
                      <input
                        id="td-email"
                        type="email"
                        className={inputClass}
                        value={form.email}
                        onChange={setField("email")}
                        disabled={saving}
                      />
                    </div>
                    <div style={{ marginBottom: "10px" }}>
                      <label htmlFor="td-phone" className={labelClass}>
                        Telefon
                      </label>
                      <input
                        id="td-phone"
                        className={inputClass}
                        value={form.phone}
                        onChange={setField("phone")}
                        disabled={saving}
                      />
                    </div>
                    <div style={{ marginBottom: "10px" }}>
                      <label htmlFor="td-company" className={labelClass}>
                        Firma
                      </label>
                      <input
                        id="td-company"
                        className={inputClass}
                        value={form.company}
                        onChange={setField("company")}
                        disabled={saving}
                      />
                    </div>
                  </div>
                  <div className={sectionCardClass}>
                    <div className={sectionTitleClass}>Adresse</div>
                    <div style={{ marginBottom: "10px" }}>
                      <label htmlFor="td-street" className={labelClass}>
                        Strasse
                      </label>
                      <input
                        id="td-street"
                        className={inputClass}
                        value={form.street}
                        onChange={setField("street")}
                        disabled={saving}
                      />
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "10px" }}>
                      <div>
                        <label htmlFor="td-plz" className={labelClass}>
                          PLZ
                        </label>
                        <input
                          id="td-plz"
                          className={inputClass}
                          value={form.postalCode}
                          onChange={setField("postalCode")}
                          disabled={saving}
                        />
                      </div>
                      <div>
                        <label htmlFor="td-city" className={labelClass}>
                          Ort
                        </label>
                        <input
                          id="td-city"
                          className={inputClass}
                          value={form.city}
                          onChange={setField("city")}
                          disabled={saving}
                        />
                      </div>
                    </div>
                    <div style={{ marginTop: "10px", marginBottom: "12px" }}>
                      <label htmlFor="td-country" className={labelClass}>
                        Land
                      </label>
                      <input
                        id="td-country"
                        className={inputClass}
                        value={form.country}
                        onChange={setField("country")}
                        disabled={saving}
                      />
                    </div>

                    {saveError ? (
                      <div style={{ marginBottom: "12px", fontSize: "13px", color: "#f87171" }}>
                        {saveError}
                      </div>
                    ) : null}
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      <button
                        type="submit"
                        disabled={saving}
                        className={`rounded-[8px] bg-gradient-to-r from-[#5b8cff] to-[#7c5cfc] px-3.5 py-2 text-sm font-semibold text-white ${
                          saving ? "cursor-default opacity-50" : "cursor-pointer"
                        }`}
                        style={{ border: "none" }}
                      >
                        {saving ? "Speichern …" : "Speichern"}
                      </button>
                    </div>
                  </div>
                  </form>
                )}

              <div className="my-2 text-[10px] font-bold uppercase tracking-[1px] text-[#64748b] dark:text-[#6b7a9a]">
                Verknüpfungen &amp; CRM
              </div>
              <div className={sectionCardClass}>
                <div className={sectionTitleClass}>Mietverhältnisse</div>
                {!tenancies.length ? (
                  <p className="m-0 text-sm text-[#64748b] dark:text-[#6b7a9a]">
                    Keine Mietverhältnisse vorhanden
                  </p>
                ) : (
                  <div className="space-y-6">
                    {tenancyEditErr ? (
                      <p style={{ margin: "0 0 10px 0", fontSize: "13px", color: "#f87171" }}>
                        {tenancyEditErr}
                      </p>
                    ) : null}
                        {tenancies.map((tn) => {
                          const tenantDepType = String(tn.tenant_deposit_type || "").toLowerCase();
                          const derivedStatusKey =
                            String(tn.display_status || "").trim() ||
                            deriveTenancyLifecyclePreviewForAssign(
                              tn.move_in_date,
                              tn.termination_effective_date,
                              tn.actual_move_out_date
                            );
                          const dStat = String(derivedStatusKey || "").toLowerCase();
                          const rowKey = tn.id != null ? String(tn.id) : `${tn.move_in_date}-${tn.room_id}`;
                          const urgencyNote = tenancyEndUrgencyNote(tn);
                          return (
                            <React.Fragment key={rowKey}>
                              <div className="rounded-[14px] border border-black/10 bg-white p-5 dark:border-white/[0.07] dark:bg-[#141824]">
                                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                                  <div className="min-w-0 flex-1 space-y-2">
                                    <span
                                      className={
                                        dStat === "active"
                                          ? "inline-flex items-center rounded-full border border-emerald-300 bg-emerald-100 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:border-emerald-500/20 dark:text-emerald-400"
                                          : `inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                                              dStat === "reserved"
                                                ? "border border-amber-500/20 bg-amber-500/10 text-amber-400"
                                                : dStat === "notice_given"
                                                  ? "border border-amber-500/25 bg-amber-500/10 text-amber-300"
                                                  : dStat === "ended"
                                                    ? "border border-black/10 bg-slate-100 text-slate-600 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-[#cbd5e1]"
                                                    : "border border-black/10 bg-slate-100 text-[#0f172a] dark:border-white/[0.1] dark:bg-white/[0.06] dark:text-[#eef2ff]"
                                            }`
                                      }
                                    >
                                      {tenancyDisplayStatusLabelDe(derivedStatusKey)}
                                    </span>
                                    <p className="text-[12px] text-[#7f8daa]">
                                      seit {formatDateOnly(dateOnlyOrNull(tn.move_in_date) || "") || "—"}
                                    </p>
                                    <p className="text-[11px] leading-snug text-[#64748b]/90 dark:text-[#7f8daa]/90">
                                      {tenancyDateRangeLabel(tn)}
                                    </p>
                                    {(() => {
                                      const zmLine = secondParticipantZweitmieterLine(tn.participants);
                                      return zmLine ? (
                                        <p className="m-0 text-[11px] leading-snug text-[#64748b] dark:text-[#7f8daa]">
                                          {zmLine}
                                        </p>
                                      ) : null;
                                    })()}
                                  </div>
                                  <div className="flex shrink-0 flex-wrap justify-end gap-2">
                                    <button
                                      type="button"
                                      onClick={() => startTenancyEdit(tn)}
                                      disabled={tenancyEditSaving}
                                      className="rounded-lg border border-black/10 bg-slate-100 px-3 py-1.5 text-[12px] font-semibold text-[#0f172a] hover:bg-slate-200/80 dark:border-white/[0.1] dark:bg-white/[0.05] dark:text-[#eef2ff] dark:hover:bg-white/[0.08] disabled:cursor-default disabled:opacity-50"
                                      style={{
                                        cursor: tenancyEditSaving ? "default" : "pointer",
                                      }}
                                    >
                                      Bearbeiten
                                    </button>
                                    {tn.unit_id ? (
                                      <button
                                        type="button"
                                        onClick={() => navigate(`/admin/units/${tn.unit_id}`)}
                                        disabled={tenancyEditSaving}
                                        className="rounded-lg border border-black/10 bg-slate-100 px-3 py-1.5 text-[12px] font-semibold text-[#0f172a] hover:bg-slate-200/80 dark:border-white/[0.1] dark:bg-white/[0.05] dark:text-[#eef2ff] dark:hover:bg-white/[0.08] disabled:cursor-default disabled:opacity-50"
                                        style={{
                                          cursor: tenancyEditSaving ? "default" : "pointer",
                                        }}
                                      >
                                        Zur Einheit
                                      </button>
                                    ) : null}
                                  </div>
                                </div>

                                {(() => {
                                  const tidStr = String(tn.id);
                                  const revRowsForCell = tenancyRevenueByTenancyId[tidStr];
                                  const loadingRow = tenancyRevenueLoadingId === tidStr;
                                  if (revRowsForCell === undefined || loadingRow) {
                                    return (
                                      <div className="mt-5 flex flex-col divide-y divide-black/10 overflow-hidden rounded-[10px] border border-black/10 bg-slate-100 sm:flex-row sm:divide-x sm:divide-y-0 dark:divide-white/[0.05] dark:border-white/[0.05] dark:bg-[#111520]">
                                        <div className="flex-1 px-4 py-4">
                                          <p className="text-[10px] font-bold uppercase tracking-[0.8px] text-[#64748b] dark:text-[#6b7a9a]">
                                            Monatliche Einnahmen
                                          </p>
                                          <p className="text-[18px] font-bold text-[#0f172a] dark:text-[#eef2ff] md:text-[20px]">…</p>
                                        </div>
                                        <div className="flex-1 px-4 py-4">
                                          <p className="text-[10px] font-bold uppercase tracking-[0.8px] text-[#64748b] dark:text-[#6b7a9a]">
                                            Einmalige Einnahmen
                                          </p>
                                          <p className="text-[18px] font-bold text-[#0f172a] dark:text-[#eef2ff] md:text-[20px]">…</p>
                                        </div>
                                        <div className="flex-1 px-4 py-4">
                                          <p className="text-[10px] font-bold uppercase tracking-[0.8px] text-[#64748b] dark:text-[#6b7a9a]">
                                            Kaution
                                          </p>
                                          <p className="text-[18px] font-bold text-[#0f172a] dark:text-[#eef2ff] md:text-[20px]">
                                            {formatChfRent(tn.tenant_deposit_amount)}
                                          </p>
                                          <p className="mt-1 text-[11px] text-[#7f8daa]">
                                            {tenantDepositTypeLabel(tn.tenant_deposit_type)}
                                            {tenantDepType === "insurance"
                                              ? ` · ${tenantDepositProviderLabel(tn.tenant_deposit_provider)}`
                                              : ""}
                                          </p>
                                        </div>
                                      </div>
                                    );
                                  }
                                  if (!revRowsForCell.length) {
                                    return (
                                      <div className="mt-5 flex flex-col divide-y divide-black/10 overflow-hidden rounded-[10px] border border-black/10 bg-slate-100 sm:flex-row sm:divide-x sm:divide-y-0 dark:divide-white/[0.05] dark:border-white/[0.05] dark:bg-[#111520]">
                                        <div className="flex-1 px-4 py-4">
                                          <p className="text-[10px] font-bold uppercase tracking-[0.8px] text-[#64748b] dark:text-[#6b7a9a]">
                                            Monatliche Einnahmen
                                          </p>
                                          <p className="text-[18px] font-bold text-[#0f172a] dark:text-[#eef2ff] md:text-[20px]">
                                            Keine Einnahmen definiert
                                          </p>
                                        </div>
                                        <div className="flex-1 px-4 py-4">
                                          <p className="text-[10px] font-bold uppercase tracking-[0.8px] text-[#64748b] dark:text-[#6b7a9a]">
                                            Einmalige Einnahmen
                                          </p>
                                          <p className="text-[18px] font-bold text-[#0f172a] dark:text-[#eef2ff] md:text-[20px]">
                                            Keine Einnahmen definiert
                                          </p>
                                        </div>
                                        <div className="flex-1 px-4 py-4">
                                          <p className="text-[10px] font-bold uppercase tracking-[0.8px] text-[#64748b] dark:text-[#6b7a9a]">
                                            Kaution
                                          </p>
                                          <p className="text-[18px] font-bold text-[#0f172a] dark:text-[#eef2ff] md:text-[20px]">
                                            {formatChfRent(tn.tenant_deposit_amount)}
                                          </p>
                                          <p className="mt-1 text-[11px] text-[#7f8daa]">
                                            {tenantDepositTypeLabel(tn.tenant_deposit_type)}
                                            {tenantDepType === "insurance"
                                              ? ` · ${tenantDepositProviderLabel(tn.tenant_deposit_provider)}`
                                              : ""}
                                          </p>
                                        </div>
                                      </div>
                                    );
                                  }
                                  const monthlyFromSaved = monthlyEquivalentFromRevenueRows(revRowsForCell);
                                  const oneTimeTotal = totalOneTimeRevenueFromRows(revRowsForCell);
                                  return (
                                    <div className="mt-5 flex flex-col divide-y divide-black/10 overflow-hidden rounded-[10px] border border-black/10 bg-slate-100 sm:flex-row sm:divide-x sm:divide-y-0 dark:divide-white/[0.05] dark:border-white/[0.05] dark:bg-[#111520]">
                                      <div className="flex-1 px-4 py-4">
                                        <p className="text-[10px] font-bold uppercase tracking-[0.8px] text-[#64748b] dark:text-[#6b7a9a]">
                                          Monatliche Einnahmen
                                        </p>
                                        <p className="text-[18px] font-bold text-[#0f172a] dark:text-[#eef2ff] md:text-[20px]">
                                          {formatChfRent(monthlyFromSaved)}
                                        </p>
                                      </div>
                                      <div className="flex-1 px-4 py-4">
                                        <p className="text-[10px] font-bold uppercase tracking-[0.8px] text-[#64748b] dark:text-[#6b7a9a]">
                                          Einmalige Einnahmen
                                        </p>
                                        <p className="text-[18px] font-bold text-[#0f172a] dark:text-[#eef2ff] md:text-[20px]">
                                          {formatChfRent(oneTimeTotal)}
                                        </p>
                                      </div>
                                      <div className="flex-1 px-4 py-4">
                                        <p className="text-[10px] font-bold uppercase tracking-[0.8px] text-[#64748b] dark:text-[#6b7a9a]">
                                          Kaution
                                        </p>
                                        <p className="text-[18px] font-bold text-[#0f172a] dark:text-[#eef2ff] md:text-[20px]">
                                          {formatChfRent(tn.tenant_deposit_amount)}
                                        </p>
                                        <p className="mt-1 text-[11px] text-[#7f8daa]">
                                          {tenantDepositTypeLabel(tn.tenant_deposit_type)}
                                          {tenantDepType === "insurance"
                                            ? ` · ${tenantDepositProviderLabel(tn.tenant_deposit_provider)}`
                                            : ""}
                                        </p>
                                      </div>
                                    </div>
                                  );
                                })()}

                                <div className="mt-6 border-t border-black/10 pt-6 dark:border-white/[0.05]">
                                  <div className="rounded-[10px] border border-black/10 bg-slate-100 p-4 dark:border-white/[0.05] dark:bg-[#111520]">
                                    <p className="mb-4 text-[10px] font-bold uppercase tracking-[0.8px] text-[#64748b] dark:text-[#6b7a9a]">
                                      Vertragsdaten
                                    </p>
                                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                                      <div>
                                        <p className="text-[10px] font-bold uppercase tracking-[0.8px] text-[#64748b] dark:text-[#6b7a9a]">
                                          Einzug
                                        </p>
                                        <p className="text-[13px] font-medium text-[#0f172a] dark:text-[#eef2ff] md:text-[14px]">
                                          {formatDateOnly(dateOnlyOrNull(tn.move_in_date) || "") || "—"}
                                        </p>
                                      </div>
                                      <div>
                                        <p className="text-[10px] font-bold uppercase tracking-[0.8px] text-[#64748b] dark:text-[#6b7a9a]">
                                          Auszug
                                        </p>
                                        <p className="text-[13px] font-medium text-[#0f172a] dark:text-[#eef2ff] md:text-[14px]">
                                          {formatDateOnly(tenancyDisplayEndIso(tn) || "") || "—"}
                                        </p>
                                      </div>
                                      <div>
                                        <p className="text-[10px] font-bold uppercase tracking-[0.8px] text-[#64748b] dark:text-[#6b7a9a]">
                                          Kautionsart
                                        </p>
                                        <p className="text-[13px] font-medium text-[#0f172a] dark:text-[#eef2ff] md:text-[14px]">
                                          {tenantDepositTypeLabel(tn.tenant_deposit_type)}
                                        </p>
                                      </div>
                                      <div>
                                        <p className="text-[10px] font-bold uppercase tracking-[0.8px] text-[#64748b] dark:text-[#6b7a9a]">
                                          Kautionsbetrag
                                        </p>
                                        <p className="text-[13px] font-medium text-[#0f172a] dark:text-[#eef2ff] md:text-[14px]">
                                          {formatChfRent(tn.tenant_deposit_amount)}
                                        </p>
                                      </div>
                                    </div>
                                    <div className="my-5 border-t border-black/10 dark:border-white/[0.05]" />
                                    <p className="mb-4 text-[10px] font-bold uppercase tracking-[0.8px] text-[#64748b] dark:text-[#6b7a9a]">
                                      Kündigung
                                    </p>
                                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                                      <div>
                                        <p className="text-[10px] font-bold uppercase tracking-[0.8px] text-[#64748b] dark:text-[#6b7a9a]">
                                          Kündigungsfrist
                                        </p>
                                        <p className="text-[13px] font-medium text-[#0f172a] dark:text-[#eef2ff] md:text-[14px]">—</p>
                                      </div>
                                      <div>
                                        <p className="text-[10px] font-bold uppercase tracking-[0.8px] text-[#64748b] dark:text-[#6b7a9a]">
                                          Eingegangen am
                                        </p>
                                        <p className="text-[13px] font-medium text-[#0f172a] dark:text-[#eef2ff] md:text-[14px]">
                                          {formatDateOnly(dateOnlyOrNull(tn.notice_given_at) || "") || "—"}
                                        </p>
                                      </div>
                                      <div>
                                        <p className="text-[10px] font-bold uppercase tracking-[0.8px] text-[#64748b] dark:text-[#6b7a9a]">
                                          Wirksam am
                                        </p>
                                        <p className="text-[13px] font-medium text-[#0f172a] dark:text-[#eef2ff] md:text-[14px]">
                                          {formatDateOnly(dateOnlyOrNull(tn.termination_effective_date) || "") || "—"}
                                        </p>
                                      </div>
                                      <div>
                                        <p className="text-[10px] font-bold uppercase tracking-[0.8px] text-[#64748b] dark:text-[#6b7a9a]">
                                          Rückgabe am
                                        </p>
                                        <p className="text-[13px] font-medium text-[#0f172a] dark:text-[#eef2ff] md:text-[14px]">
                                          {formatDateOnly(dateOnlyOrNull(tn.actual_move_out_date) || "") || "—"}
                                        </p>
                                      </div>
                                      <div className="md:col-span-2 xl:col-span-4">
                                        <p className="text-[10px] font-bold uppercase tracking-[0.8px] text-[#64748b] dark:text-[#6b7a9a]">
                                          Gekündigt durch
                                        </p>
                                        <p className="text-[13px] font-medium text-[#0f172a] dark:text-[#eef2ff] md:text-[14px]">
                                          {(() => {
                                            const v = String(tn.terminated_by || "").toLowerCase();
                                            if (v === "tenant") return "Mieter";
                                            if (v === "landlord") return "Vermieter / Verwaltung";
                                            if (v === "other") return "Sonstiges";
                                            return "—";
                                          })()}
                                        </p>
                                      </div>
                                    </div>
                                  </div>
                                </div>

                                {urgencyNote ? (
                                  <p className="mt-3 text-[11px] font-semibold text-[#7f8daa]">{urgencyNote}</p>
                                ) : null}

                                <div className="mt-6 border-t border-black/10 pt-5 dark:border-white/[0.05]">
                                  <p className="mb-4 text-[10px] font-bold uppercase tracking-[0.8px] text-[#64748b] dark:text-[#6b7a9a]">
                                    Einnahmen-Übersicht
                                  </p>
                                  {(() => {
                                    const tidStr = String(tn.id);
                                    const revRowsForCell = tenancyRevenueByTenancyId[tidStr];
                                    const loadingRow = tenancyRevenueLoadingId === tidStr;
                                    if (revRowsForCell === undefined || loadingRow) {
                                      return (
                                        <span className="text-[13px] text-[#7f8daa] md:text-[14px]">…</span>
                                      );
                                    }
                                    if (!revRowsForCell.length) {
                                      return (
                                        <span className="text-[13px] font-medium text-[#0f172a] dark:text-[#eef2ff] md:text-[14px]">
                                          Keine Einnahmen definiert
                                        </span>
                                      );
                                    }
                                    const monthlyFromSaved = monthlyEquivalentFromRevenueRows(revRowsForCell);
                                    const oneTimeTotal = totalOneTimeRevenueFromRows(revRowsForCell);
                                    const recBrCell = recurringMonthlyBreakdownEntries(revRowsForCell);
                                    const otBrCell = oneTimeBreakdownEntries(revRowsForCell);
                                    return (
                                      <div className="rounded-[10px] border border-black/10 bg-slate-100 p-4 dark:border-white/[0.05] dark:bg-[#111520]">
                                        <div className="flex items-center justify-between gap-4 border-b border-black/10 py-3 dark:border-white/[0.05]">
                                          <span className="text-[13px] font-medium text-[#0f172a] dark:text-[#eef2ff] md:text-[14px]">
                                            Gesamteinnahmen / Monat
                                          </span>
                                          <span className="text-[13px] font-semibold whitespace-nowrap text-[#0f172a] dark:text-[#eef2ff] md:text-[14px]">
                                            {formatChfRent(monthlyFromSaved)}
                                          </span>
                                        </div>
                                        <div className="flex items-center justify-between gap-4 border-b border-black/10 py-3 dark:border-white/[0.05]">
                                          <span className="text-[13px] font-medium text-[#0f172a] dark:text-[#eef2ff] md:text-[14px]">
                                            Einmalige Einnahmen
                                          </span>
                                          <span className="text-[13px] font-semibold whitespace-nowrap text-[#0f172a] dark:text-[#eef2ff] md:text-[14px]">
                                            {formatChfRent(oneTimeTotal)}
                                          </span>
                                        </div>
                                        {recBrCell.length ? (
                                          <div className="divide-y divide-white/[0.05]">
                                            {recBrCell.map((b) => (
                                              <div
                                                key={b.typeKey}
                                                className="flex items-center justify-between gap-4 py-3"
                                              >
                                                <span className="text-[13px] font-medium text-[#7f8daa] md:text-[14px]">
                                                  {b.label}
                                                </span>
                                                <span className="text-[13px] font-semibold whitespace-nowrap text-[#0f172a] dark:text-[#eef2ff] md:text-[14px]">
                                                  {formatChfRent(b.total)}
                                                </span>
                                              </div>
                                            ))}
                                          </div>
                                        ) : null}
                                        {otBrCell.length ? (
                                          <div className="border-t border-black/10 pt-4 dark:border-white/[0.05]">
                                            <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.8px] text-[#7f8daa]">
                                              Einmalige Einnahmen
                                            </p>
                                            <div className="divide-y divide-white/[0.05]">
                                              {otBrCell.map((b) => (
                                                <div
                                                  key={b.typeKey}
                                                  className="flex items-center justify-between gap-4 py-3"
                                                >
                                                  <span className="text-[13px] font-medium text-[#7f8daa] md:text-[14px]">
                                                    {b.label}
                                                  </span>
                                                  <span className="text-[13px] font-semibold whitespace-nowrap text-[#0f172a] dark:text-[#eef2ff] md:text-[14px]">
                                                    {formatChfRent(b.total)}
                                                  </span>
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        ) : null}
                                      </div>
                                    );
                                  })()}
                                </div>
                              </div>
                              {String(tenancyEditingId) === String(tn.id) ? (
                                <div
                                  ref={tenancyEditSectionRef}
                                  className="mt-4 scroll-mt-6 rounded-[14px] border border-black/10 bg-slate-100 p-5 dark:border-white/[0.07] dark:bg-[#111520]"
                                >
                                    <div className="mb-2 text-[12px] font-bold text-[#0f172a] dark:text-[#eef2ff]">
                                      Mietverhältnis bearbeiten
                                    </div>
                                    <div
                                      className="mb-2.5 w-full text-[11px] leading-snug text-[#7f8daa]"
                                      style={{ lineHeight: 1.45 }}
                                    >
                                      <div className="font-bold text-[#0f172a] dark:text-[#eef2ff]">
                                        Mietende (automatisch berechnet)
                                      </div>
                                      <div className="mt-0.5 mb-1 text-[10px] text-[#7f8daa]">
                                        ergibt sich aus Kündigung &amp; Rückgabe
                                      </div>
                                      <strong className="text-[13px] font-extrabold text-[#0f172a] dark:text-[#eef2ff]">
                                        {formatDateOnly(
                                          tenancyDraftDisplayEndIso(
                                            tenancyEditActualMoveOut,
                                            tenancyEditTerminationEffective
                                          ) || tenancyDisplayEndIso(tn)
                                        )}
                                      </strong>
                                    </div>
                                    <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "flex-end" }}>
                                      <div>
                                        <label htmlFor={`ten-ng-${rowKey}`} className={labelClass}>
                                          Kündigung eingegangen am
                                        </label>
                                        <input
                                          id={`ten-ng-${rowKey}`}
                                          type="date"
                                          className={inputClass}
                                          value={tenancyEditNoticeGivenAt}
                                          onChange={(e) => setTenancyEditNoticeGivenAt(e.target.value)}
                                          disabled={tenancyEditSaving}
                                        />
                                      </div>
                                      <div>
                                        <label htmlFor={`ten-te-${rowKey}`} className={labelClass}>
                                          Kündigung wirksam per
                                        </label>
                                        <input
                                          id={`ten-te-${rowKey}`}
                                          type="date"
                                          className={inputClass}
                                          value={tenancyEditTerminationEffective}
                                          onChange={(e) => setTenancyEditTerminationEffective(e.target.value)}
                                          disabled={tenancyEditSaving}
                                        />
                                      </div>
                                      <div>
                                        <label htmlFor={`ten-am-${rowKey}`} className={labelClass}>
                                          Rückgabe erfolgt am
                                        </label>
                                        <input
                                          id={`ten-am-${rowKey}`}
                                          type="date"
                                          className={inputClass}
                                          value={tenancyEditActualMoveOut}
                                          onChange={(e) => setTenancyEditActualMoveOut(e.target.value)}
                                          disabled={tenancyEditSaving}
                                        />
                                      </div>
                                      <div>
                                        <label htmlFor={`ten-tb-${rowKey}`} className={labelClass}>
                                          Gekündigt durch
                                        </label>
                                        <select
                                          id={`ten-tb-${rowKey}`}
                                          className={inputClass}
                                          style={{ cursor: tenancyEditSaving ? "default" : "pointer" }}
                                          value={tenancyEditTerminatedBy}
                                          onChange={(e) => setTenancyEditTerminatedBy(e.target.value)}
                                          disabled={tenancyEditSaving}
                                        >
                                          <option value="">—</option>
                                          <option value="tenant">Mieter</option>
                                          <option value="landlord">Vermieter / Verwaltung</option>
                                          <option value="other">Sonstiges</option>
                                        </select>
                                      </div>
                                      <div>
                                        <label htmlFor={`ten-st-${rowKey}`} className={labelClass}>
                                          Status (abgeleitet)
                                        </label>
                                        <div className={`${inputClass} flex items-center`}>
                                          {(() => {
                                            const key = deriveTenancyLifecyclePreviewForAssign(
                                              tn.move_in_date,
                                              tenancyEditTerminationEffective,
                                              tenancyEditActualMoveOut
                                            );
                                            const badgeClass =
                                              TENANCY_LIFECYCLE_PREVIEW_BADGE_CLASS[key] ||
                                              TENANCY_LIFECYCLE_PREVIEW_BADGE_CLASS.active;
                                            return (
                                              <span className={badgeClass}>
                                                {tenancyDisplayStatusLabelDe(key)}
                                              </span>
                                            );
                                          })()}
                                        </div>
                                      </div>
                                      <div>
                                        <label htmlFor={`ten-tdt-${rowKey}`} className={labelClass}>
                                          Kautionsart Mieter
                                        </label>
                                        <select
                                          id={`ten-tdt-${rowKey}`}
                                          className={inputClass}
                                          style={{ cursor: tenancyEditSaving ? "default" : "pointer" }}
                                          value={tenancyEditTenantDepositType}
                                          onChange={(e) => {
                                            const v = e.target.value;
                                            setTenancyEditTenantDepositType(v);
                                            if (v !== "insurance") setTenancyEditTenantDepositProvider("");
                                          }}
                                          disabled={tenancyEditSaving}
                                        >
                                          <option value="">—</option>
                                          <option value="bank">Bank</option>
                                          <option value="insurance">Versicherung</option>
                                          <option value="cash">Bar</option>
                                          <option value="none">Keine</option>
                                        </select>
                                      </div>
                                      <div>
                                        <label htmlFor={`ten-tda-${rowKey}`} className={labelClass}>
                                          Kautionsbetrag Mieter (CHF)
                                        </label>
                                        <input
                                          id={`ten-tda-${rowKey}`}
                                          type="number"
                                          min="0"
                                          step="0.01"
                                          className={inputClass}
                                          value={tenancyEditTenantDepositAmount}
                                          onChange={(e) => setTenancyEditTenantDepositAmount(e.target.value)}
                                          disabled={tenancyEditSaving}
                                        />
                                      </div>
                                      {tenancyEditTenantDepositType === "insurance" ? (
                                        <div>
                                          <label htmlFor={`ten-tdp-${rowKey}`} className={labelClass}>
                                            Anbieter
                                          </label>
                                          <select
                                            id={`ten-tdp-${rowKey}`}
                                            className={inputClass}
                                            style={{ cursor: tenancyEditSaving ? "default" : "pointer" }}
                                            value={tenancyEditTenantDepositProvider}
                                            onChange={(e) =>
                                              setTenancyEditTenantDepositProvider(e.target.value)
                                            }
                                            disabled={tenancyEditSaving}
                                          >
                                            <option value="">—</option>
                                            <option value="swisscaution">SwissCaution</option>
                                            <option value="smartcaution">SmartCaution</option>
                                            <option value="firstcaution">FirstCaution</option>
                                            <option value="gocaution">GoCaution</option>
                                            <option value="other">Sonstige</option>
                                          </select>
                                        </div>
                                      ) : null}
                                      <div style={{ display: "flex", gap: "8px" }}>
                                        <button
                                          type="button"
                                          onClick={submitTenancyEdit}
                                          disabled={tenancyEditSaving}
                                          className={`rounded-[8px] bg-gradient-to-r from-[#5b8cff] to-[#7c5cfc] px-3 py-1.5 text-xs font-semibold text-white ${
                                            tenancyEditSaving ? "cursor-default opacity-50" : "cursor-pointer"
                                          }`}
                                          style={{ border: "none" }}
                                        >
                                          {tenancyEditSaving ? "Speichern …" : "Speichern"}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={cancelTenancyEdit}
                                          disabled={tenancyEditSaving}
                                          className="rounded-[8px] border border-black/10 bg-transparent px-3 py-1.5 text-xs font-semibold text-[#64748b] hover:bg-slate-100 dark:border-white/[0.1] dark:text-[#8090b0] dark:hover:bg-white/[0.04] disabled:cursor-default"
                                          style={{ cursor: tenancyEditSaving ? "default" : "pointer" }}
                                        >
                                          Abbrechen
                                        </button>
                                      </div>
                                    </div>

                                    <div className="mb-2 border-t border-black/10 pt-3 dark:border-white/[0.05]">
                                      <div className="mb-2 text-[9px] font-bold uppercase tracking-[1px] text-[#64748b] dark:text-[#6b7a9a]">
                                        Einnahmen
                                      </div>

                                      {(() => {
                                        const tidKpi = String(tn.id);
                                        const rowsKpi = tenancyRevenueByTenancyId[tidKpi];
                                        const kpiLoading = tenancyRevenueLoadingId === tidKpi;
                                        if (rowsKpi === undefined || kpiLoading) {
                                          return (
                                            <div className="mb-2.5 rounded-lg border border-black/10 bg-slate-100 px-3 py-2.5 text-xs text-[#64748b] dark:border-white/[0.05] dark:bg-[#111520] dark:text-[#6b7a9a]">
                                              …
                                            </div>
                                          );
                                        }
                                        const monthlyKpi = monthlyEquivalentFromRevenueRows(rowsKpi);
                                        const oneTimeKpi = totalOneTimeRevenueFromRows(rowsKpi);
                                        const recBr = recurringMonthlyBreakdownEntries(rowsKpi);
                                        const otBr = oneTimeBreakdownEntries(rowsKpi);
                                        return (
                                          <div className="mb-2.5 rounded-lg border border-black/10 bg-slate-100 px-3 py-2.5 text-xs text-[#0f172a] dark:border-white/[0.05] dark:bg-[#111520] dark:text-[#eef2ff]">
                                            <div className="mb-2 text-[9px] font-extrabold uppercase tracking-[1px] text-[#64748b] dark:text-[#6b7a9a]">
                                              Einnahmen-Übersicht
                                            </div>
                                            <div className="mb-1">
                                              <span className="font-semibold text-[#64748b] dark:text-[#6b7a9a]">Gesamteinnahmen / Monat:</span>{" "}
                                              <span className="font-bold text-[#0f172a] dark:text-[#eef2ff]">{formatChfRent(monthlyKpi)}</span>
                                            </div>
                                            <div className={recBr.length || otBr.length ? "mb-2" : ""}>
                                              <span className="font-semibold text-[#64748b] dark:text-[#6b7a9a]">Einmalige Einnahmen:</span>{" "}
                                              <span className="font-bold text-[#0f172a] dark:text-[#eef2ff]">{formatChfRent(oneTimeKpi)}</span>
                                            </div>
                                            {recBr.length || otBr.length ? (
                                              <div className="mt-2 border-t border-black/10 pt-2 dark:border-white/[0.05]">
                                                {recBr.length ? (
                                                  <div className={otBr.length ? "mb-2" : ""}>
                                                    <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.5px] text-[#64748b] dark:text-[#6b7a9a]">
                                                      Einnahmen Zusammensetzung
                                                    </div>
                                                    {recBr.map((b) => (
                                                      <div
                                                        key={b.typeKey}
                                                        className="flex justify-between gap-3 text-xs leading-snug text-[#0f172a] dark:text-[#eef2ff]"
                                                      >
                                                        <span className="text-[#64748b] dark:text-[#7f8daa]">{b.label}</span>
                                                        <span className="whitespace-nowrap font-semibold text-[#0f172a] dark:text-[#eef2ff]">
                                                          {formatChfRent(b.total)}
                                                        </span>
                                                      </div>
                                                    ))}
                                                  </div>
                                                ) : null}
                                                {otBr.length ? (
                                                  <div>
                                                    <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.5px] text-[#64748b] dark:text-[#6b7a9a]">
                                                      Einmalige Einnahmen
                                                    </div>
                                                    {otBr.map((b) => (
                                                      <div
                                                        key={b.typeKey}
                                                        className="flex justify-between gap-3 text-xs leading-snug text-[#0f172a] dark:text-[#eef2ff]"
                                                      >
                                                        <span className="text-[#64748b] dark:text-[#7f8daa]">{b.label}</span>
                                                        <span className="whitespace-nowrap font-semibold text-[#0f172a] dark:text-[#eef2ff]">
                                                          {formatChfRent(b.total)}
                                                        </span>
                                                      </div>
                                                    ))}
                                                  </div>
                                                ) : null}
                                              </div>
                                            ) : null}
                                          </div>
                                        );
                                      })()}

                                      {tenancyRevenueErr ? (
                                        <p style={{ margin: "0 0 10px 0", fontSize: "13px", color: "#f87171" }}>
                                          {tenancyRevenueErr}
                                        </p>
                                      ) : null}

                                      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "flex-end" }}>
                                        <div>
                                          <label htmlFor={`rev-type-${String(tn.id)}`} className={labelClass}>
                                            Typ
                                          </label>
                                          <RevenueTypeSelect
                                            id={`rev-type-${String(tn.id)}`}
                                            selectClassName={inputClass}
                                            value={revenueForm.type}
                                            onChange={(e) => setRevenueForm((f) => ({ ...f, type: e.target.value }))}
                                            disabled={tenancyRevenueLoadingId === String(tn.id)}
                                          />
                                        </div>
                                        <div>
                                          <label className={labelClass}>Betrag (CHF)</label>
                                          <input
                                            type="text"
                                            inputMode="decimal"
                                            className={inputClass}
                                            value={revenueForm.amount_chf}
                                            onChange={(e) => setRevenueForm((f) => ({ ...f, amount_chf: e.target.value }))}
                                            disabled={tenancyRevenueLoadingId === String(tn.id)}
                                            placeholder="z. B. 1200"
                                          />
                                        </div>
                                        <div>
                                          <label className={labelClass}>Frequenz</label>
                                          <select
                                            className={inputClass}
                                            style={{ cursor: tenancyRevenueLoadingId === String(tn.id) ? "default" : "pointer" }}
                                            value={revenueForm.frequency}
                                            onChange={(e) =>
                                              setRevenueForm((f) =>
                                                applyRecurringRevenueDatesFromTenancy(
                                                  f,
                                                  e.target.value,
                                                  tn.move_in_date,
                                                  tenancyDraftDisplayEndIso(
                                                    tenancyEditActualMoveOut,
                                                    tenancyEditTerminationEffective
                                                  ) || tenancyDisplayEndIso(tn) ||
                                                    ""
                                                )
                                              )
                                            }
                                            disabled={tenancyRevenueLoadingId === String(tn.id)}
                                          >
                                            <option value="monthly">Monatlich</option>
                                            <option value="yearly">Jährlich</option>
                                            <option value="one_time">Einmalig</option>
                                          </select>
                                        </div>
                                        <div>
                                          <label className={labelClass}>Start (optional)</label>
                                          <input
                                            type="date"
                                            className={inputClass}
                                            value={revenueForm.start_date}
                                            onChange={(e) => setRevenueForm((f) => ({ ...f, start_date: e.target.value }))}
                                            disabled={tenancyRevenueLoadingId === String(tn.id)}
                                          />
                                        </div>
                                        {normalizeRevenueFrequency(revenueForm.frequency) === "one_time" ? (
                                          <div>
                                            <label className={labelClass}>Ende (optional)</label>
                                            <input
                                              type="date"
                                              className={inputClass}
                                              value={revenueForm.end_date}
                                              onChange={(e) => setRevenueForm((f) => ({ ...f, end_date: e.target.value }))}
                                              disabled={tenancyRevenueLoadingId === String(tn.id)}
                                            />
                                          </div>
                                        ) : (
                                          <div>
                                            <label className={labelClass}>Ende (Mietende)</label>
                                            <div className={`${inputClass} font-semibold`}>
                                              {formatDateOnly(
                                                tenancyDraftDisplayEndIso(
                                                  tenancyEditActualMoveOut,
                                                  tenancyEditTerminationEffective
                                                ) || tenancyDisplayEndIso(tn) ||
                                                  ""
                                              )}
                                            </div>
                                            <div className="mt-1 max-w-[220px] text-[10px] text-[#64748b] dark:text-[#6b7a9a]">
                                              Ende wird automatisch aus Mietende übernommen.
                                            </div>
                                          </div>
                                        )}
                                        <div style={{ minWidth: "240px", flex: "1 1 240px" }}>
                                          <label className={labelClass}>Notizen (optional)</label>
                                          <input
                                            type="text"
                                            className={inputClass}
                                            value={revenueForm.notes}
                                            onChange={(e) => setRevenueForm((f) => ({ ...f, notes: e.target.value }))}
                                            disabled={tenancyRevenueLoadingId === String(tn.id)}
                                            placeholder="z. B. Möbelpauschale"
                                          />
                                        </div>
                                        <div style={{ display: "inline-flex", gap: "8px" }}>
                                          <button
                                            type="button"
                                            onClick={() => submitRevenueForm(tn.id, tn)}
                                            disabled={tenancyRevenueLoadingId === String(tn.id)}
                                            className={`rounded-[8px] bg-gradient-to-r from-[#5b8cff] to-[#7c5cfc] px-3 py-1.5 text-xs font-semibold text-white ${
                                              tenancyRevenueLoadingId === String(tn.id) ? "cursor-default opacity-50" : "cursor-pointer"
                                            }`}
                                            style={{ border: "none", fontWeight: 800 }}
                                          >
                                            {revenueEditingId ? "Aktualisieren" : "Hinzufügen"}
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => cancelRevenueEdit(tn)}
                                            disabled={tenancyRevenueLoadingId === String(tn.id)}
                                            className="rounded-[8px] border border-black/10 bg-transparent px-3 py-1.5 text-xs font-semibold text-[#64748b] hover:bg-slate-100 dark:border-white/[0.1] dark:text-[#8090b0] dark:hover:bg-white/[0.04] disabled:cursor-default"
                                            style={{ cursor: tenancyRevenueLoadingId === String(tn.id) ? "default" : "pointer", fontWeight: 700 }}
                                          >
                                            Abbrechen
                                          </button>
                                        </div>
                                      </div>

                                      <div style={{ marginTop: "10px", overflowX: "auto" }}>
                                        <table className={tableClass}>
                                          <thead>
                                            <tr>
                                              <th className={thCellClass}>Typ</th>
                                              <th className={`${thCellClass} text-right`}>Betrag</th>
                                              <th className={thCellClass}>Frequenz</th>
                                              <th className={thCellClass}>Zeitraum (optional)</th>
                                              <th className={thCellClass}>Notizen</th>
                                              <th className={`${thCellClass} whitespace-nowrap text-right`}>Aktion</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {Array.isArray(tenancyRevenueByTenancyId?.[String(tn.id)]) &&
                                            tenancyRevenueByTenancyId[String(tn.id)].length > 0 ? (
                                              tenancyRevenueByTenancyId[String(tn.id)].map((rr) => {
                                                const rid = String(rr.id);
                                                const range = revenueRowZeitraumDisplay(rr, tn);
                                                return (
                                                  <tr key={rid}>
                                                    <td className={tdCellClass}>{revenueTypeLabelForDisplay(rr.type)}</td>
                                                    <td className={`${tdCellClass} text-right font-bold text-[#0f172a] dark:text-[#eef2ff]`}>
                                                      {formatChfRent(rr.amount_chf)}
                                                    </td>
                                                    <td className={tdCellClass}>{revenueFrequencyLabel(rr.frequency)}</td>
                                                    <td className={tdCellClass}>{range}</td>
                                                    <td className={tdCellClass}>{rr.notes || "—"}</td>
                                                    <td className={`${tdCellClass} whitespace-nowrap text-right`}>
                                                      <div style={{ display: "inline-flex", gap: "8px", justifyContent: "flex-end", flexWrap: "wrap" }}>
                                                        <button
                                                          type="button"
                                                          onClick={() => startRevenueEdit(rr)}
                                                          disabled={tenancyRevenueLoadingId === String(tn.id)}
                                                          className="rounded-[8px] border border-black/10 bg-transparent px-2.5 py-1 text-xs font-bold text-[#64748b] hover:bg-slate-100 dark:border-white/[0.1] dark:text-[#8090b0] dark:hover:bg-white/[0.05] disabled:cursor-default"
                                                          style={{ cursor: tenancyRevenueLoadingId === String(tn.id) ? "default" : "pointer" }}
                                                        >
                                                          Bearbeiten
                                                        </button>
                                                        <button
                                                          type="button"
                                                          onClick={() => deleteRevenueRow(tn.id, rr, tn)}
                                                          disabled={tenancyRevenueLoadingId === String(tn.id)}
                                                          className="rounded-[8px] border border-red-500/20 bg-red-500/10 px-2.5 py-1 text-xs font-bold text-[#f87171] hover:bg-red-500/15 disabled:cursor-default"
                                                          style={{ cursor: tenancyRevenueLoadingId === String(tn.id) ? "default" : "pointer" }}
                                                        >
                                                          Löschen
                                                        </button>
                                                      </div>
                                                    </td>
                                                  </tr>
                                                );
                                              })
                                            ) : (
                                              <tr>
                                                <td colSpan={6} className={`${tdCellClass} text-[#64748b] dark:text-[#6b7a9a]`}>
                                                  {tenancyRevenueLoadingId === String(tn.id) ? "Lade …" : "Keine Einnahmen erfasst."}
                                                </td>
                                              </tr>
                                            )}
                                          </tbody>
                                        </table>
                                      </div>

                                      <p className="mt-2.5 text-[11px] text-[#64748b] dark:text-[#6b7a9a]">
                                        Berechnung Gesamteinnahmen / Monat: monatlich voll, jährlich ÷12; einmalige Beträge unter „Einmalige Einnahmen“.
                                      </p>
                                    </div>
                                </div>
                              ) : null}
                            </React.Fragment>
                          );
                        })}
                  </div>
                )}
                <button
                  type="button"
                  onClick={openAssignForm}
                  className="mt-3.5 rounded-[8px] border border-black/10 bg-transparent px-3.5 py-2 text-[13px] font-semibold text-[#64748b] hover:bg-slate-100 dark:border-white/[0.1] dark:text-[#8090b0] dark:hover:bg-white/[0.04]"
                  style={{ cursor: "pointer" }}
                >
                  Mietverhältnis zuweisen
                </button>
                {assignOpen ? (
                  <form
                    onSubmit={handleAssignSubmit}
                    className="mt-3.5 border-t border-black/10 pt-3.5 dark:border-white/[0.05]"
                  >
                    {assignUnitsErr ? (
                      <p style={{ margin: "0 0 10px 0", fontSize: "13px", color: "#f87171" }}>
                        {assignUnitsErr}
                      </p>
                    ) : null}
                    {assignErr ? (
                      <p style={{ margin: "0 0 10px 0", fontSize: "13px", color: "#f87171" }}>
                        {assignErr}
                      </p>
                    ) : null}
                    <div style={gridTwoCol}>
                      <div>
                        <label htmlFor="assign-unit" className={labelClass}>
                          Einheit *
                        </label>
                        <select
                          id="assign-unit"
                          className={inputClass}
                          style={{ cursor: assignSaving ? "default" : "pointer" }}
                          value={assignUnitId}
                          onChange={(e) => {
                            setAssignUnitId(e.target.value);
                            setAssignRoomId("");
                          }}
                          disabled={assignSaving || assignUnitsLoading}
                        >
                          <option value="">
                            {assignUnitsLoading ? "Lade Einheiten …" : "— Einheit wählen"}
                          </option>
                          {assignUnits.map((u, idx) => {
                            const loc = String(u.address || u.place || "").trim();
                            const label = loc
                              ? `${getDisplayUnitId(u, idx)} — ${loc}`
                              : getDisplayUnitId(u, idx);
                            return (
                              <option key={String(u.id)} value={String(u.id)}>
                                {label}
                              </option>
                            );
                          })}
                        </select>
                      </div>
                      <div>
                        <label htmlFor="assign-room" className={labelClass}>
                          Zimmer *
                        </label>
                        <select
                          id="assign-room"
                          className={inputClass}
                          style={{ cursor: assignSaving ? "default" : "pointer" }}
                          value={assignRoomId}
                          onChange={(e) => {
                            setAssignRoomId(e.target.value);
                          }}
                          disabled={assignSaving || !assignUnitId || assignRoomsLoading}
                        >
                          <option value="">
                            {!assignUnitId
                              ? "— Zuerst Einheit wählen"
                              : assignRoomsLoading
                                ? "Lade Zimmer …"
                                : "— Zimmer wählen"}
                          </option>
                          {assignRooms.map((r) => {
                            const base = r.roomName || r.name || r.room_number || r.id;
                            const occ = getRoomOccupancyStatus(r, assignUnitTenancies) || "frei";
                            const overlaps = roomOverlapsAssignProposal(
                              r,
                              assignUnitTenancies,
                              assignMoveIn,
                              assignTerminationEffective,
                              assignActualMoveOut
                            );
                            const disabled = overlaps || occ !== "frei";
                            let suffix = assignRoomStatusSuffixDe(occ);
                            if (disabled && overlaps && occ === "frei") suffix = "nicht verfügbar";
                            const label = `${base} — ${suffix}`;
                            const title = assignRoomOptionTitleDe(occ, disabled, overlaps);
                            return (
                              <option
                                key={String(r.id)}
                                value={String(r.id)}
                                disabled={disabled}
                                title={title}
                              >
                                {label}
                              </option>
                            );
                          })}
                        </select>
                      </div>
                      <div>
                        <label htmlFor="assign-move-in" className={labelClass}>
                          Einzugsdatum *
                        </label>
                        <input
                          id="assign-move-in"
                          type="date"
                          className={inputClass}
                          value={assignMoveIn}
                          onChange={(e) => setAssignMoveIn(e.target.value)}
                          disabled={assignSaving}
                          required
                        />
                      </div>
                      <div>
                        <label htmlFor="assign-notice" className={labelClass}>
                          Kündigung eingegangen am
                        </label>
                        <input
                          id="assign-notice"
                          type="date"
                          className={inputClass}
                          value={assignNoticeGivenAt}
                          onChange={(e) => setAssignNoticeGivenAt(e.target.value)}
                          disabled={assignSaving}
                        />
                      </div>
                      <div>
                        <label htmlFor="assign-te" className={labelClass}>
                          Kündigung wirksam per
                        </label>
                        <input
                          id="assign-te"
                          type="date"
                          className={inputClass}
                          value={assignTerminationEffective}
                          onChange={(e) => setAssignTerminationEffective(e.target.value)}
                          disabled={assignSaving}
                        />
                      </div>
                      <div>
                        <label htmlFor="assign-am" className={labelClass}>
                          Rückgabe erfolgt am
                        </label>
                        <input
                          id="assign-am"
                          type="date"
                          className={inputClass}
                          value={assignActualMoveOut}
                          onChange={(e) => setAssignActualMoveOut(e.target.value)}
                          disabled={assignSaving}
                        />
                      </div>
                      <div>
                        <label htmlFor="assign-tb" className={labelClass}>
                          Gekündigt durch
                        </label>
                        <select
                          id="assign-tb"
                          className={inputClass}
                          style={{ cursor: assignSaving ? "default" : "pointer" }}
                          value={assignTerminatedBy}
                          onChange={(e) => setAssignTerminatedBy(e.target.value)}
                          disabled={assignSaving}
                        >
                          <option value="">—</option>
                          <option value="tenant">Mieter</option>
                          <option value="landlord">Vermieter / Verwaltung</option>
                          <option value="other">Sonstiges</option>
                        </select>
                      </div>
                      <div style={{ gridColumn: "1 / -1" }}>
                        {!assignSecondInlineOpen ? (
                          <button
                            type="button"
                            onClick={() => {
                              setAssignSecondInlineOpen(true);
                              setAssignSecondRole("");
                            }}
                            disabled={assignSaving}
                            className="rounded-[8px] border border-black/10 bg-transparent px-3 py-2 text-[13px] font-semibold text-[#64748b] hover:bg-slate-100 dark:border-white/[0.1] dark:text-[#8090b0] dark:hover:bg-white/[0.04]"
                            style={{ cursor: assignSaving ? "default" : "pointer" }}
                          >
                            Zweitmieter hinzufügen
                          </button>
                        ) : (
                          <div className="rounded-[10px] border border-black/10 bg-slate-50 p-3 dark:border-white/[0.07] dark:bg-[#111520]">
                            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                              <span className="text-[10px] font-bold uppercase tracking-[0.8px] text-[#64748b] dark:text-[#6b7a9a]">
                                Zweitperson (optional)
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  setAssignSecondInlineOpen(false);
                                  setAssignSecondForm(initialAssignSecondForm());
                                  setAssignSecondRole("");
                                }}
                                disabled={assignSaving}
                                className="text-[12px] font-semibold text-[#64748b] underline dark:text-[#8090b0]"
                                style={{ cursor: assignSaving ? "default" : "pointer" }}
                              >
                                Entfernen
                              </button>
                            </div>
                            <div style={gridTwoCol}>
                              <div>
                                <label htmlFor="assign-second-role-inline" className={labelClass}>
                                  Rolle *
                                </label>
                                <select
                                  id="assign-second-role-inline"
                                  className={inputClass}
                                  style={{ cursor: assignSaving ? "default" : "pointer" }}
                                  value={assignSecondRole}
                                  onChange={(e) => setAssignSecondRole(e.target.value)}
                                  disabled={assignSaving}
                                >
                                  <option value="">— wählen</option>
                                  <option value="co_tenant">Zweitmieter (Co-Mieter)</option>
                                  <option value="solidarhafter">Solidarhafter</option>
                                </select>
                              </div>
                              <div>
                                <label htmlFor="assign-s2-fn" className={labelClass}>
                                  Vorname *
                                </label>
                                <input
                                  id="assign-s2-fn"
                                  type="text"
                                  className={inputClass}
                                  value={assignSecondForm.firstName}
                                  onChange={(e) =>
                                    setAssignSecondForm((f) => ({ ...f, firstName: e.target.value }))
                                  }
                                  disabled={assignSaving}
                                  autoComplete="given-name"
                                />
                              </div>
                              <div>
                                <label htmlFor="assign-s2-ln" className={labelClass}>
                                  Nachname *
                                </label>
                                <input
                                  id="assign-s2-ln"
                                  type="text"
                                  className={inputClass}
                                  value={assignSecondForm.lastName}
                                  onChange={(e) =>
                                    setAssignSecondForm((f) => ({ ...f, lastName: e.target.value }))
                                  }
                                  disabled={assignSaving}
                                  autoComplete="family-name"
                                />
                              </div>
                              <div>
                                <label htmlFor="assign-s2-email" className={labelClass}>
                                  E-Mail
                                </label>
                                <input
                                  id="assign-s2-email"
                                  type="email"
                                  className={inputClass}
                                  value={assignSecondForm.email}
                                  onChange={(e) =>
                                    setAssignSecondForm((f) => ({ ...f, email: e.target.value }))
                                  }
                                  disabled={assignSaving}
                                  autoComplete="email"
                                />
                              </div>
                              <div>
                                <label htmlFor="assign-s2-phone" className={labelClass}>
                                  Telefon
                                </label>
                                <input
                                  id="assign-s2-phone"
                                  type="text"
                                  className={inputClass}
                                  value={assignSecondForm.phone}
                                  onChange={(e) =>
                                    setAssignSecondForm((f) => ({ ...f, phone: e.target.value }))
                                  }
                                  disabled={assignSaving}
                                  autoComplete="tel"
                                />
                              </div>
                              <div style={{ gridColumn: "1 / -1" }}>
                                <label htmlFor="assign-s2-street" className={labelClass}>
                                  Strasse
                                </label>
                                <input
                                  id="assign-s2-street"
                                  type="text"
                                  className={inputClass}
                                  value={assignSecondForm.street}
                                  onChange={(e) =>
                                    setAssignSecondForm((f) => ({ ...f, street: e.target.value }))
                                  }
                                  disabled={assignSaving}
                                />
                              </div>
                              <div>
                                <label htmlFor="assign-s2-plz" className={labelClass}>
                                  PLZ
                                </label>
                                <input
                                  id="assign-s2-plz"
                                  type="text"
                                  className={inputClass}
                                  value={assignSecondForm.postalCode}
                                  onChange={(e) =>
                                    setAssignSecondForm((f) => ({ ...f, postalCode: e.target.value }))
                                  }
                                  disabled={assignSaving}
                                />
                              </div>
                              <div>
                                <label htmlFor="assign-s2-city" className={labelClass}>
                                  Ort
                                </label>
                                <input
                                  id="assign-s2-city"
                                  type="text"
                                  className={inputClass}
                                  value={assignSecondForm.city}
                                  onChange={(e) =>
                                    setAssignSecondForm((f) => ({ ...f, city: e.target.value }))
                                  }
                                  disabled={assignSaving}
                                />
                              </div>
                              <div>
                                <label htmlFor="assign-s2-country" className={labelClass}>
                                  Land
                                </label>
                                <input
                                  id="assign-s2-country"
                                  type="text"
                                  className={inputClass}
                                  value={assignSecondForm.country}
                                  onChange={(e) =>
                                    setAssignSecondForm((f) => ({ ...f, country: e.target.value }))
                                  }
                                  disabled={assignSaving}
                                />
                              </div>
                              <div>
                                <label htmlFor="assign-s2-nat" className={labelClass}>
                                  Nationalität
                                </label>
                                <input
                                  id="assign-s2-nat"
                                  type="text"
                                  className={inputClass}
                                  value={assignSecondForm.nationality}
                                  onChange={(e) =>
                                    setAssignSecondForm((f) => ({ ...f, nationality: e.target.value }))
                                  }
                                  disabled={assignSaving}
                                />
                              </div>
                              <div>
                                <label htmlFor="assign-s2-swiss" className={labelClass}>
                                  Schweizer/in
                                </label>
                                <select
                                  id="assign-s2-swiss"
                                  className={inputClass}
                                  style={{ cursor: assignSaving ? "default" : "pointer" }}
                                  value={
                                    assignSecondForm.isSwiss === null
                                      ? ""
                                      : assignSecondForm.isSwiss === true
                                        ? "true"
                                        : "false"
                                  }
                                  onChange={(e) => {
                                    const raw = e.target.value;
                                    const v = raw === "" ? null : raw === "true";
                                    setAssignSecondForm((f) => {
                                      const next = { ...f, isSwiss: v };
                                      if (v === true) next.residencePermit = "";
                                      return next;
                                    });
                                  }}
                                  disabled={assignSaving}
                                >
                                  <option value="">Unbekannt</option>
                                  <option value="true">Ja</option>
                                  <option value="false">Nein</option>
                                </select>
                              </div>
                              {assignSecondForm.isSwiss !== true ? (
                                <div>
                                  <label htmlFor="assign-s2-permit" className={labelClass}>
                                    Aufenthaltsbewilligung
                                  </label>
                                  <select
                                    id="assign-s2-permit"
                                    className={inputClass}
                                    style={{ cursor: assignSaving ? "default" : "pointer" }}
                                    value={assignSecondForm.residencePermit}
                                    onChange={(e) =>
                                      setAssignSecondForm((f) => ({
                                        ...f,
                                        residencePermit: e.target.value,
                                      }))
                                    }
                                    disabled={assignSaving}
                                  >
                                    <option value="">—</option>
                                    <option value="B">B</option>
                                    <option value="C">C</option>
                                    <option value="L">L</option>
                                    <option value="G">G</option>
                                    <option value="Other">Other</option>
                                  </select>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        )}
                      </div>
                      <div>
                        <label className={labelClass}>Einnahmen / Monat</label>
                        <div className={inputClass}>
                          {formatChfRent(monthlyEquivalentFromRevenueRows(assignRevenueRows))}
                        </div>
                      </div>
                      <div>
                        <label className={labelClass}>Status (abgeleitet)</label>
                        <div className={inputClass}>
                          {tenancyDisplayStatusLabelDe(
                            deriveTenancyLifecyclePreviewForAssign(
                              assignMoveIn,
                              assignTerminationEffective,
                              assignActualMoveOut
                            )
                          )}
                        </div>
                      </div>
                      <div style={{ gridColumn: "1 / -1" }}>
                        <div className="mb-2 text-[9px] font-bold uppercase tracking-[1px] text-[#64748b] dark:text-[#6b7a9a]">
                          Einnahmen
                        </div>
                        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "flex-end" }}>
                          <div>
                            <label htmlFor="assign-rev-type" className={labelClass}>
                              Typ
                            </label>
                            <RevenueTypeSelect
                              id="assign-rev-type"
                              selectClassName={inputClass}
                              value={assignRevenueForm.type}
                              onChange={(e) => setAssignRevenueForm((f) => ({ ...f, type: e.target.value }))}
                              disabled={assignSaving}
                            />
                          </div>
                          <div>
                            <label className={labelClass}>Betrag (CHF)</label>
                            <input
                              type="text"
                              inputMode="decimal"
                              className={inputClass}
                              value={assignRevenueForm.amount_chf}
                              onChange={(e) => {
                                setAssignRevenueForm((f) => ({ ...f, amount_chf: e.target.value }));
                              }}
                              disabled={assignSaving}
                            />
                          </div>
                          <div>
                            <label className={labelClass}>Frequenz</label>
                            <select
                              className={inputClass}
                              style={{ cursor: assignSaving ? "default" : "pointer" }}
                              value={assignRevenueForm.frequency}
                              onChange={(e) =>
                                setAssignRevenueForm((f) =>
                                  applyRecurringRevenueDatesFromTenancy(
                                    f,
                                    e.target.value,
                                    assignMoveIn,
                                    tenancyDraftDisplayEndIso(assignActualMoveOut, assignTerminationEffective)
                                  )
                                )
                              }
                              disabled={assignSaving}
                            >
                              <option value="monthly">Monatlich</option>
                              <option value="yearly">Jährlich</option>
                              <option value="one_time">Einmalig</option>
                            </select>
                          </div>
                          <div>
                            <label className={labelClass}>Start (optional)</label>
                            <input
                              type="date"
                              className={inputClass}
                              value={assignRevenueForm.start_date}
                              onChange={(e) => setAssignRevenueForm((f) => ({ ...f, start_date: e.target.value }))}
                              disabled={assignSaving}
                            />
                          </div>
                          {normalizeRevenueFrequency(assignRevenueForm.frequency) === "one_time" ? (
                            <div>
                              <label className={labelClass}>Ende (optional)</label>
                              <input
                                type="date"
                                className={inputClass}
                                value={assignRevenueForm.end_date}
                                onChange={(e) => setAssignRevenueForm((f) => ({ ...f, end_date: e.target.value }))}
                                disabled={assignSaving}
                              />
                            </div>
                          ) : (
                            <div>
                              <label className={labelClass}>Ende (Mietende)</label>
                              <div className={`${inputClass} font-semibold`}>
                                {formatDateOnly(
                                  tenancyDraftDisplayEndIso(assignActualMoveOut, assignTerminationEffective) || ""
                                )}
                              </div>
                              <div className="mt-1 max-w-[220px] text-[10px] text-[#64748b] dark:text-[#6b7a9a]">
                                Ende wird automatisch aus Mietende übernommen.
                              </div>
                            </div>
                          )}
                          <div style={{ minWidth: "240px", flex: "1 1 240px" }}>
                            <label className={labelClass}>Notizen (optional)</label>
                            <input
                              type="text"
                              className={inputClass}
                              value={assignRevenueForm.notes}
                              onChange={(e) => setAssignRevenueForm((f) => ({ ...f, notes: e.target.value }))}
                              disabled={assignSaving}
                            />
                          </div>
                          <button
                            type="button"
                            disabled={assignSaving}
                            onClick={() => {
                              const id = `ar-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                              const freq = normalizeRevenueFrequency(assignRevenueForm.frequency);
                              const mi = dateOnlyOrNull(assignMoveIn) || "";
                              let sd = assignRevenueForm.start_date;
                              let ed = assignRevenueForm.end_date;
                              if (freq === "monthly" || freq === "yearly") {
                                if (!dateOnlyOrNull(sd)) sd = mi;
                                ed = "";
                              }
                              const row = {
                                id,
                                type: String(assignRevenueForm.type || "").trim(),
                                amount_chf: assignRevenueForm.amount_chf,
                                frequency: freq,
                                start_date: sd,
                                end_date: ed,
                                notes: assignRevenueForm.notes,
                              };
                              setAssignRevenueRows((prev) => [...(Array.isArray(prev) ? prev : []), row]);
                              setAssignRevenueForm((f) => ({ ...f, amount_chf: "", notes: "" }));
                            }}
                            className={`rounded-[8px] border border-black/10 bg-transparent px-3 py-2 text-xs font-bold text-[#64748b] hover:bg-slate-100 dark:border-white/[0.1] dark:text-[#8090b0] dark:hover:bg-white/[0.05] ${
                              assignSaving ? "cursor-default opacity-50" : "cursor-pointer"
                            }`}
                          >
                            + Einnahme hinzufügen
                          </button>
                        </div>

                        <div style={{ marginTop: "10px", overflowX: "auto" }}>
                          <table className={tableClass}>
                            <thead>
                              <tr>
                                <th className={thCellClass}>Typ</th>
                                <th className={`${thCellClass} text-right`}>Betrag</th>
                                <th className={thCellClass}>Frequenz</th>
                                <th className={thCellClass}>Aktion</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(Array.isArray(assignRevenueRows) ? assignRevenueRows : []).map((rr) => (
                                <tr key={rr.id}>
                                  <td className={tdCellClass}>{revenueTypeLabelForDisplay(rr.type)}</td>
                                  <td className={`${tdCellClass} text-right font-bold text-[#0f172a] dark:text-[#eef2ff]`}>
                                    {formatChfRent(parseRevenueAmount(rr.amount_chf) ?? rr.amount_chf)}
                                  </td>
                                  <td className={tdCellClass}>{revenueFrequencyLabel(rr.frequency)}</td>
                                  <td className={tdCellClass}>
                                    <button
                                      type="button"
                                      disabled={assignSaving}
                                      onClick={() =>
                                        setAssignRevenueRows((prev) => (prev || []).filter((x) => x.id !== rr.id))
                                      }
                                      className="rounded-[8px] border border-red-500/20 bg-red-500/10 px-2.5 py-1 text-xs font-bold text-[#f87171] hover:bg-red-500/15 disabled:cursor-default"
                                      style={{ cursor: assignSaving ? "default" : "pointer" }}
                                    >
                                      Löschen
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                      <div>
                        <label htmlFor="assign-tenant-deposit-type" className={labelClass}>
                          Kautionsart Mieter
                        </label>
                        <select
                          id="assign-tenant-deposit-type"
                          className={inputClass}
                          style={{ cursor: assignSaving ? "default" : "pointer" }}
                          value={assignTenantDepositType}
                          onChange={(e) => {
                            const v = e.target.value;
                            setAssignTenantDepositType(v);
                            if (v !== "insurance") setAssignTenantDepositProvider("");
                          }}
                          disabled={assignSaving}
                        >
                          <option value="">—</option>
                          <option value="bank">Bank</option>
                          <option value="insurance">Versicherung</option>
                          <option value="cash">Bar</option>
                          <option value="none">Keine</option>
                        </select>
                      </div>
                      <div>
                        <label htmlFor="assign-tenant-deposit-amount" className={labelClass}>
                          Kautionsbetrag Mieter (CHF)
                        </label>
                        <input
                          id="assign-tenant-deposit-amount"
                          type="number"
                          min="0"
                          step="0.01"
                          className={inputClass}
                          value={assignTenantDepositAmount}
                          onChange={(e) => setAssignTenantDepositAmount(e.target.value)}
                          disabled={assignSaving}
                        />
                      </div>
                      {assignTenantDepositType === "insurance" ? (
                        <div>
                          <label htmlFor="assign-tenant-deposit-provider" className={labelClass}>
                            Anbieter
                          </label>
                          <select
                            id="assign-tenant-deposit-provider"
                            className={inputClass}
                            style={{ cursor: assignSaving ? "default" : "pointer" }}
                            value={assignTenantDepositProvider}
                            onChange={(e) => setAssignTenantDepositProvider(e.target.value)}
                            disabled={assignSaving}
                          >
                            <option value="">—</option>
                            <option value="swisscaution">SwissCaution</option>
                            <option value="smartcaution">SmartCaution</option>
                            <option value="firstcaution">FirstCaution</option>
                            <option value="gocaution">GoCaution</option>
                            <option value="other">Sonstige</option>
                          </select>
                        </div>
                      ) : null}
                    </div>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "12px" }}>
                      <button
                        type="submit"
                        disabled={assignSaving}
                        className={`rounded-[8px] bg-gradient-to-r from-[#5b8cff] to-[#7c5cfc] px-3.5 py-2 text-sm font-semibold text-white ${
                          assignSaving ? "cursor-default opacity-50" : "cursor-pointer"
                        }`}
                        style={{ border: "none", fontWeight: 700 }}
                      >
                        {assignSaving ? "Speichern …" : "Speichern"}
                      </button>
                      <button
                        type="button"
                        disabled={assignSaving}
                        onClick={() => {
                          setAssignOpen(false);
                          resetAssignForm();
                        }}
                        className="rounded-[8px] border border-black/10 bg-transparent px-3.5 py-2 text-sm font-semibold text-[#64748b] hover:bg-slate-100 dark:border-white/[0.1] dark:text-[#8090b0] dark:hover:bg-white/[0.04] disabled:cursor-default"
                        style={{ cursor: assignSaving ? "default" : "pointer" }}
                      >
                        Abbrechen
                      </button>
                    </div>
                  </form>
                ) : null}
              </div>
              <div className={sectionCardClass}>
                <div className={sectionTitleClass}>Rechnungen</div>
                {!invoices.length ? (
                  <p className="m-0 text-sm text-[#64748b] dark:text-[#6b7a9a]">
                    Keine Rechnungen vorhanden
                  </p>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table className={tableClass}>
                      <thead>
                        <tr>
                          <th className={thCellClass}>Rechnung</th>
                          <th className={`${thCellClass} text-right`}>Betrag</th>
                          <th className={thCellClass}>Fällig</th>
                          <th className={thCellClass}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {invoices.map((inv) => {
                          return (
                            <tr key={inv.id != null ? String(inv.id) : `${inv.invoice_number}-${inv.due_date}`}>
                              <td className={`${tdCellClass} font-bold text-[#0f172a] dark:text-[#eef2ff]`}>
                                {inv.invoice_number || "—"}
                              </td>
                              <td className={`${tdCellClass} text-right text-[#0f172a] dark:text-[#eef2ff]`}>
                                {formatInvoiceAmount(inv.amount, inv.currency)}
                              </td>
                              <td className={`${tdCellClass} text-sm text-[#64748b] dark:text-[#6b7a9a]`}>
                                {formatDateOnly(inv.due_date)}
                              </td>
                              <td className={tdCellClass}>
                                <span className="inline-flex rounded-full border border-black/10 bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-[#7aaeff] dark:border-white/[0.1] dark:bg-white/[0.06]">
                                  {inv.status || "—"}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              <TenantNotesBlock
                notes={notes}
                noteDraft={noteDraft}
                setNoteDraft={(v) => {
                  setNoteDraft(v);
                  setNoteValidationErr(null);
                }}
                noteSaving={noteSaving}
                noteErr={noteValidationErr}
                noteSubmitError={noteSubmitError}
                onSubmit={saveNote}
              />
              <div className={sectionCardClass}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: "12px",
                    marginBottom: "10px",
                  }}
                >
                  <div className={sectionTitleClass}>Dokumente</div>
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      alignItems: "center",
                      gap: "10px",
                      justifyContent: "flex-end",
                    }}
                  >
                    <label className="flex items-center gap-2 text-[13px] text-[#64748b] dark:text-[#6b7a9a]">
                      <span>Kategorie</span>
                      <select
                        value={tenantDocCategory}
                        onChange={(e) => setTenantDocCategory(e.target.value)}
                        disabled={tenantDocUploading || !tenantId}
                        className={`rounded-[9px] border border-black/10 bg-slate-100 px-2 py-1.5 text-[13px] text-[#0f172a] dark:border-white/[0.08] dark:bg-[#111520] dark:text-[#eef2ff] ${
                          tenantDocUploading || !tenantId
                            ? "cursor-not-allowed opacity-60 dark:bg-white/[0.04]"
                            : "cursor-pointer"
                        }`}
                      >
                        <option value="">—</option>
                        <option value="rent_contract">Mietvertrag</option>
                        <option value="id_document">Ausweis</option>
                        <option value="debt_register">Betreibungsregister</option>
                        <option value="insurance">Versicherung</option>
                        <option value="other">Sonstiges</option>
                      </select>
                    </label>
                    <input
                      ref={tenantDocFileInputRef}
                      type="file"
                      style={{ display: "none" }}
                      onChange={handleTenantDocSelected}
                    />
                    <button
                      type="button"
                      onClick={handleTenantDocPick}
                      disabled={tenantDocUploading || !tenantId}
                      className="rounded-[8px] border border-black/10 bg-transparent px-3 py-2 text-[13px] font-semibold text-[#64748b] hover:bg-slate-100 dark:border-white/[0.1] dark:text-[#8090b0] dark:hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-50"
                      style={{ cursor: tenantDocUploading || !tenantId ? "not-allowed" : "pointer" }}
                    >
                      {tenantDocUploading ? "Wird hochgeladen …" : "Hochladen"}
                    </button>
                  </div>
                </div>
                {tenantDocUploadError ? (
                  <p style={{ margin: "0 0 8px 0", fontSize: "13px", color: "#f87171" }}>
                    {tenantDocUploadError}
                  </p>
                ) : null}
                {loading ? (
                  <p className="m-0 text-sm text-[#64748b] dark:text-[#6b7a9a]">Lade Dokumente …</p>
                ) : tenantDocuments.length === 0 ? (
                  <p className="m-0 text-sm text-[#64748b] dark:text-[#6b7a9a]">Keine Dokumente vorhanden</p>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table className={tableClass}>
                      <thead>
                        <tr>
                          <th className={thCellClass}>Datei</th>
                          <th className={thCellClass}>Typ</th>
                          <th className={thCellClass}>Kategorie</th>
                          <th className={thCellClass}>Datum</th>
                          <th className={thCellClass}>Von</th>
                          <th className={thCellClass}>Aktionen</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tenantDocuments.map((doc) => (
                          <tr key={String(doc.id)}>
                            <td className={`${tdCellClass} font-semibold text-[#0f172a] dark:text-[#eef2ff]`}>{doc.file_name || "—"}</td>
                            <td className={`${tdCellClass} text-[#64748b] dark:text-[#6b7a9a]`}>{formatTenantDocumentType(doc)}</td>
                            <td className={`${tdCellClass} text-[#64748b] dark:text-[#6b7a9a]`}>
                              {formatTenantDocumentCategoryLabel(doc.category)}
                            </td>
                            <td className={`${tdCellClass} text-[#64748b] dark:text-[#6b7a9a]`}>{formatTenantDocumentDate(doc.created_at)}</td>
                            <td className={`${tdCellClass} text-[#64748b] dark:text-[#6b7a9a]`}>
                              {doc.uploaded_by_name != null && doc.uploaded_by_name !== ""
                                ? doc.uploaded_by_name
                                : "—"}
                            </td>
                            <td className={tdCellClass}>
                              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px" }}>
                                <button
                                  type="button"
                                  onClick={() => handleOpenTenantDocument(doc.id)}
                                  className="border-none bg-transparent p-0 text-[13px] font-semibold text-[#7aaeff] underline hover:text-[#a8c4ff]"
                                  style={{ cursor: "pointer" }}
                                >
                                  Öffnen
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteTenantDocument(doc.id)}
                                  className="border-none bg-transparent p-0 text-[13px] font-semibold text-[#64748b] dark:text-[#6b7a9a] underline hover:text-[#f87171]"
                                  style={{ cursor: "pointer" }}
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
              </div>
              <TenantHistoryBlock events={mergedHistoryEvents} />
            </>
          ) : (
            <p className="text-[#64748b] dark:text-[#6b7a9a]">Keine Daten.</p>
          )}
        </main>
      </div>
    </div>
  );
}
