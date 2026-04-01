import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  fetchAdminTenant,
  updateAdminTenant,
  fetchAdminTenantNotes,
  createAdminTenantNote,
  fetchAdminTenantEvents,
  fetchAdminInvoices,
  fetchAdminTenancies,
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
import { API_BASE_URL, getApiHeaders } from "../../config";
import { tenantDisplayName } from "../../utils/tenantDisplayName";
import { getDisplayUnitId } from "../../utils/unitDisplayId";
import {
  UNIT_LANDLORD_LEASE_ENDED_TENANCY_MESSAGE,
  deriveTenantOperationalStatus,
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

function auditLogToTenantHistoryEvent(log) {
  const nv = log.new_values && typeof log.new_values === "object" ? log.new_values : {};
  const ov = log.old_values && typeof log.old_values === "object" ? log.old_values : {};
  if (nv.document_uploaded != null && String(nv.document_uploaded).trim() !== "") {
    return {
      id: `audit-${log.id}`,
      summary: `Dokument hochgeladen: ${String(nv.document_uploaded)}`,
      created_at: log.created_at,
      author_name: log.actor_name || log.actor_email || "—",
      action_type: "audit_document",
    };
  }
  if (ov.document_deleted != null && String(ov.document_deleted).trim() !== "") {
    return {
      id: `audit-${log.id}`,
      summary: `Dokument gelöscht: ${String(ov.document_deleted)}`,
      created_at: log.created_at,
      author_name: log.actor_name || log.actor_email || "—",
      action_type: "audit_document",
    };
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

const INVOICE_STATUS_BADGE = {
  paid: { bg: "#DCFCE7", color: "#166534", border: "#BBF7D0" },
  open: { bg: "#DBEAFE", color: "#1D4ED8", border: "#BFDBFE" },
  overdue: { bg: "#FEE2E2", color: "#991B1B", border: "#FECACA" },
  unpaid: { bg: "#F1F5F9", color: "#64748B", border: "#E2E8F0" },
  cancelled: { bg: "#F1F5F9", color: "#64748B", border: "#E2E8F0" },
};

const TENANCY_STATUS_BADGE = {
  active: { bg: "#DCFCE7", color: "#166534", border: "#BBF7D0" },
  upcoming: { bg: "#DBEAFE", color: "#1D4ED8", border: "#BFDBFE" },
  ended: { bg: "#F1F5F9", color: "#64748B", border: "#E2E8F0" },
};

const TENANCY_DISPLAY_STATUS_BADGE = {
  active: TENANCY_STATUS_BADGE.active,
  notice_given: { bg: "#FEF3C7", color: "#92400E", border: "#FCD34D" },
  reserved: TENANCY_STATUS_BADGE.upcoming,
  ended: TENANCY_STATUS_BADGE.ended,
};

function tenancyDisplayEndIso(tn) {
  if (!tn) return null;
  return dateOnlyOrNull(tn.display_end_date) || dateOnlyOrNull(tn.move_out_date);
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

function RevenueTypeSelect({ value, onChange, disabled, id, selectStyle }) {
  const v = String(value || "").trim();
  const legacy = v && !REVENUE_TYPE_VALUE_SET.has(v);
  const selectValue = legacy ? v : v || "rent";
  return (
    <select
      id={id}
      style={{ ...selectStyle, cursor: disabled ? "default" : "pointer" }}
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

const pageWrap = {
  maxWidth: "min(1400px, 100%)",
  margin: "0 auto",
  padding: "24px",
};

const tableStyle = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: "14px",
};

const thCell = {
  textAlign: "left",
  padding: "10px 12px",
  borderBottom: "1px solid #E5E7EB",
  color: "#64748B",
  fontWeight: 600,
};

const tdCell = {
  padding: "10px 12px",
  borderBottom: "1px solid #F1F5F9",
  verticalAlign: "top",
};

const sectionCard = {
  background: "#FFFFFF",
  border: "1px solid #E5E7EB",
  borderRadius: "14px",
  padding: "16px",
  marginBottom: "12px",
};

const labelStyle = {
  display: "block",
  fontSize: "12px",
  fontWeight: 600,
  color: "#64748B",
  marginBottom: "4px",
};

const inputStyle = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: "8px",
  border: "1px solid #E2E8F0",
  fontSize: "14px",
  boxSizing: "border-box",
};

const textareaStyle = {
  ...inputStyle,
  minHeight: "88px",
  resize: "vertical",
  fontFamily: "inherit",
};

const sectionTitle = {
  fontSize: "11px",
  fontWeight: 700,
  color: "#f97316",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  margin: "0 0 10px 0",
};

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
    <div style={sectionCard}>
      <div style={sectionTitle}>Notizen</div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <label htmlFor="td-note" style={{ ...labelStyle, marginBottom: "6px" }}>
          Neue Notiz
        </label>
        <textarea
          id="td-note"
          style={textareaStyle}
          value={noteDraft}
          onChange={(e) => setNoteDraft(e.target.value)}
          disabled={noteSaving}
          placeholder="Interne Notiz …"
        />
        {noteErr ? (
          <div style={{ marginTop: "8px", fontSize: "13px", color: "#B91C1C" }}>{noteErr}</div>
        ) : null}
        {noteSubmitError ? (
          <div style={{ marginTop: "8px", fontSize: "13px", color: "#B91C1C" }}>{noteSubmitError}</div>
        ) : null}
        <div style={{ marginTop: "10px" }}>
          <button
            type="submit"
            disabled={noteSaving}
            style={{
              padding: "8px 14px",
              borderRadius: "10px",
              border: "none",
              background: noteSaving ? "#94A3B8" : "#f97316",
              color: "#FFF",
              fontWeight: 700,
              cursor: noteSaving ? "default" : "pointer",
            }}
          >
            {noteSaving ? "Speichern …" : "Notiz speichern"}
          </button>
        </div>
      </form>
      <div style={{ marginTop: "16px", paddingTop: "14px", borderTop: "1px solid #F1F5F9" }}>
        <div style={{ ...labelStyle, marginBottom: "8px" }}>Alle Notizen</div>
        {!notes.length ? (
          <p style={{ margin: 0, fontSize: "0.875rem", color: "#64748B" }}>Noch keine Notizen</p>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {notes.map((n) => (
              <li
                key={n.id}
                style={{
                  marginBottom: "12px",
                  paddingBottom: "12px",
                  borderBottom: "1px solid #F1F5F9",
                }}
              >
                <div style={{ fontSize: "14px", color: "#0F172A", whiteSpace: "pre-wrap" }}>{n.content}</div>
                <div style={{ fontSize: "12px", color: "#94A3B8", marginTop: "6px" }}>
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
    <div style={sectionCard}>
      <div style={sectionTitle}>Verlauf / Aktivität</div>
      {!events.length ? (
        <p style={{ margin: 0, fontSize: "0.875rem", color: "#64748B" }}>Noch kein Verlauf</p>
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
          {events.map((ev) => {
            const showDiff =
              ev.action_type === "tenant_updated" &&
              ev.field_name &&
              (ev.old_value != null || ev.new_value != null);
            return (
              <li
                key={ev.id}
                style={{
                  marginBottom: "12px",
                  paddingLeft: "12px",
                  borderLeft: "3px solid #E2E8F0",
                }}
              >
                <div style={{ fontWeight: 600, fontSize: "14px", color: "#0F172A" }}>{ev.summary}</div>
                {showDiff ? (
                  <div style={{ fontSize: "12px", color: "#64748B", marginTop: "4px" }}>
                    {ev.old_value ?? "—"} → {ev.new_value ?? "—"}
                  </div>
                ) : null}
                <div style={{ fontSize: "12px", color: "#94A3B8", marginTop: "6px" }}>
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
      <span style={labelStyle}>{label}</span>
      <div style={{ fontSize: "15px", color: "#0F172A" }}>{value || "—"}</div>
    </div>
  );
}

const PERMIT_OPTIONS = new Set(["B", "C", "L", "G", "Other"]);

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
  const [tenant, setTenant] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [editing, setEditing] = useState(false);
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
      .then(() => Promise.all([reloadTenanciesForTenant(), fetchAdminTenantEvents(tenantId)]))
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
      const [items, auditData] = await Promise.all([
        fetchAdminTenantDocuments(tenantId),
        fetchAdminAuditLogs({ entity_type: "tenant", entity_id: tenantId }),
      ]);
      setTenantDocuments(Array.isArray(items) ? items : []);
      setAuditLogs(Array.isArray(auditData?.items) ? auditData.items : []);
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
      const [items, auditData] = await Promise.all([
        fetchAdminTenantDocuments(tenantId),
        fetchAdminAuditLogs({ entity_type: "tenant", entity_id: tenantId }),
      ]);
      setTenantDocuments(Array.isArray(items) ? items : []);
      setAuditLogs(Array.isArray(auditData?.items) ? auditData.items : []);
    } catch (err) {
      window.alert(err.message || "Löschen fehlgeschlagen.");
    }
  }

  useEffect(() => {
    if (!tenantId) {
      setTenant(null);
      setLoadError("Kein Mieter angegeben.");
      setEditing(false);
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
      return;
    }
    setAssignRoomsLoading(true);
    fetchAdminRooms(assignUnitId)
      .then((raw) => {
        const arr = Array.isArray(raw) ? raw : [];
        setAssignRooms(arr.map(normalizeRoom));
      })
      .catch(() => setAssignRooms([]))
      .finally(() => setAssignRoomsLoading(false));
  }, [assignUnitId]);

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
    const preview = deriveTenancyLifecyclePreviewForAssign(
      assignMoveIn.trim(),
      assignTerminationEffective,
      assignActualMoveOut
    );
    const derivedStatus = storedTenancyStatusForApi(preview);
    setAssignSaving(true);
    const tdt = String(assignTenantDepositType || "").trim().toLowerCase();
    const body = {
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
    if (tdt) body.tenant_deposit_type = tdt;
    const tda = parseOptionalTenantDepositFloat(assignTenantDepositAmount);
    if (tda !== null) body.tenant_deposit_amount = tda;
    const tprov = String(assignTenantDepositProvider || "").trim().toLowerCase();
    if (tdt === "insurance" && tprov) body.tenant_deposit_provider = tprov;
    fetch(`${API_BASE_URL}/api/admin/tenancies`, {
      method: "POST",
      headers: getApiHeaders(),
      body: JSON.stringify(body),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(await parseAdminErrorFromResponse(res));
        return res.json();
      })
      .then(async (createdTenancy) => {
        const tid = createdTenancy?.id != null ? String(createdTenancy.id) : "";
        if (!tid) return createdTenancy;
        const rows = Array.isArray(assignRevenueRows) ? assignRevenueRows : [];
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
        return createdTenancy;
      })
      .then(() =>
        Promise.all([reloadTenanciesForTenant(), fetchAdminTenantEvents(tenantId)])
      )
      .then(([, eData]) => {
        if (eData?.items) setEvents(eData.items);
        setAssignOpen(false);
        resetAssignForm();
      })
      .catch((err) => setAssignErr(err?.message || "Speichern fehlgeschlagen."))
      .finally(() => setAssignSaving(false));
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
        setEditing(false);
        setShouldRefreshTenantList(true);
        return fetchAdminTenantEvents(tenantId).catch(() => null);
      })
      .then((eData) => {
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

  return (
    <div style={{ minHeight: "100vh", background: "#F8FAFC" }}>
      <div style={pageWrap}>
        <header
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: "16px",
            marginBottom: "24px",
            paddingBottom: "20px",
            borderBottom: "1px solid #E2E8F0",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", flexWrap: "wrap", minWidth: 0 }}>
            <button
              type="button"
              onClick={goToTenantList}
              style={{
                padding: "8px 12px",
                borderRadius: "10px",
                border: "1px solid #E2E8F0",
                background: "#FFFFFF",
                fontWeight: 600,
                fontSize: "13px",
                cursor: "pointer",
              }}
            >
              ← Zurück
            </button>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: "12px", color: "#f97316", fontWeight: 700 }}>Mieter</div>
              <h1
                style={{
                  fontSize: "28px",
                  fontWeight: 800,
                  margin: "4px 0 0 0",
                  wordBreak: "break-word",
                }}
              >
                {loading ? "…" : displayName}
              </h1>
              {!loading && tenant && (
                <div style={{ marginTop: "10px" }}>
                  <span
                    style={{
                      display: "inline-flex",
                      padding: "6px 10px",
                      borderRadius: "999px",
                      fontSize: "12px",
                      fontWeight: 700,
                      background: statusMeta?.bg || "#F1F5F9",
                      color: statusMeta?.color || "#475569",
                      border: `1px solid ${statusMeta?.border || "#CBD5E1"}`,
                    }}
                  >
                    {statusMeta?.label || "Status"}
                  </span>
                </div>
              )}
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
            {!editing && tenant && !loadError && !loading ? (
              <button
                type="button"
                onClick={() => {
                  setEditing(true);
                  setSaveError(null);
                }}
                style={{
                  padding: "8px 12px",
                  borderRadius: "10px",
                  border: "1px solid #E2E8F0",
                  background: "#FFFFFF",
                  fontWeight: 600,
                  fontSize: "13px",
                  cursor: "pointer",
                }}
              >
                Bearbeiten
              </button>
            ) : null}
          </div>
        </header>

        <main>
          {loading ? (
            <p style={{ color: "#64748B" }}>Lade Daten …</p>
          ) : loadError ? (
            <div
              style={{
                padding: "16px",
                borderRadius: "12px",
                background: "#FEF2F2",
                border: "1px solid #FECACA",
                color: "#B91C1C",
              }}
            >
              <p style={{ margin: "0 0 12px 0" }}>{loadError}</p>
              <button
                type="button"
                onClick={goToTenantList}
                style={{
                  padding: "8px 14px",
                  borderRadius: "10px",
                  border: "1px solid #E2E8F0",
                  background: "#FFFFFF",
                  fontWeight: 600,
                  fontSize: "13px",
                  cursor: "pointer",
                }}
              >
                Zurück zur Übersicht
              </button>
            </div>
          ) : tenant ? (
            <>
              {!editing ? (
                <>
                  <div style={sectionCard}>
                    <div style={sectionTitle}>Stammdaten</div>
                    <div style={gridTwoCol}>
                      <Row label="Vorname" value={tenant.first_name} />
                      <Row label="Nachname" value={tenant.last_name} />
                      <Row label="Geburtsdatum" value={formatDateOnly(tenant.birth_date)} />
                      <Row label="Nationalität" value={tenant.nationality} />
                    </div>
                    <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px solid #F1F5F9" }}>
                      <span style={labelStyle}>Erfasst am</span>
                      <div style={{ fontSize: "15px", color: "#0F172A" }}>
                        {formatDateTime(tenant.created_at)}
                      </div>
                    </div>
                  </div>
                  <div style={sectionCard}>
                    <div style={sectionTitle}>Aufenthalt</div>
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
                  <div style={sectionCard}>
                    <div style={sectionTitle}>Kontakt</div>
                    <div style={gridTwoCol}>
                      <Row label="E-Mail" value={tenant.email} />
                      <Row label="Telefon" value={tenant.phone} />
                      <Row label="Firma" value={tenant.company} />
                    </div>
                  </div>
                  <section className="rounded-xl border border-slate-200 shadow-sm bg-white p-5 md:p-6 mb-3">
                    <h2 className="text-sm font-semibold text-slate-900 mb-4">Adresse</h2>
                    <div className="flex items-start gap-2">
                      <div className="text-sm font-medium text-slate-900 space-y-1 flex-1 min-w-0">
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
                          className="shrink-0 p-1 rounded-md text-slate-500 hover:text-slate-800 hover:bg-slate-100 inline-flex items-center justify-center"
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
                  <div style={sectionCard}>
                    <div style={sectionTitle}>Stammdaten</div>
                    <div style={gridTwoCol}>
                      <div>
                        <label htmlFor="td-fn" style={labelStyle}>
                          Vorname *
                        </label>
                        <input
                          id="td-fn"
                          style={inputStyle}
                          value={form.firstName}
                          onChange={setField("firstName")}
                          disabled={saving}
                        />
                      </div>
                      <div>
                        <label htmlFor="td-ln" style={labelStyle}>
                          Nachname *
                        </label>
                        <input
                          id="td-ln"
                          style={inputStyle}
                          value={form.lastName}
                          onChange={setField("lastName")}
                          disabled={saving}
                        />
                      </div>
                    </div>
                    <div style={{ marginTop: "10px" }}>
                      <label htmlFor="td-bd" style={labelStyle}>
                        Geburtsdatum
                      </label>
                      <input
                        id="td-bd"
                        type="date"
                        style={inputStyle}
                        value={form.birthDate}
                        onChange={setField("birthDate")}
                        disabled={saving}
                      />
                    </div>
                    <div style={{ marginTop: "10px" }}>
                      <label htmlFor="td-nat" style={labelStyle}>
                        Nationalität
                      </label>
                      <input
                        id="td-nat"
                        style={inputStyle}
                        value={form.nationality}
                        onChange={setField("nationality")}
                        disabled={saving}
                      />
                    </div>
                  </div>
                  <div style={sectionCard}>
                    <div style={sectionTitle}>Aufenthalt</div>
                    <div style={{ marginBottom: "10px" }}>
                      <label htmlFor="td-swiss" style={labelStyle}>
                        Schweizer/in
                      </label>
                      <select
                        id="td-swiss"
                        style={{ ...inputStyle, cursor: saving ? "default" : "pointer" }}
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
                        <label htmlFor="td-permit" style={labelStyle}>
                          Aufenthaltsbewilligung
                        </label>
                        <select
                          id="td-permit"
                          style={{ ...inputStyle, cursor: saving ? "default" : "pointer" }}
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
                  <div style={sectionCard}>
                    <div style={sectionTitle}>Kontakt</div>
                    <div style={{ marginBottom: "10px" }}>
                      <label htmlFor="td-email" style={labelStyle}>
                        E-Mail
                      </label>
                      <input
                        id="td-email"
                        type="email"
                        style={inputStyle}
                        value={form.email}
                        onChange={setField("email")}
                        disabled={saving}
                      />
                    </div>
                    <div style={{ marginBottom: "10px" }}>
                      <label htmlFor="td-phone" style={labelStyle}>
                        Telefon
                      </label>
                      <input
                        id="td-phone"
                        style={inputStyle}
                        value={form.phone}
                        onChange={setField("phone")}
                        disabled={saving}
                      />
                    </div>
                    <div style={{ marginBottom: "10px" }}>
                      <label htmlFor="td-company" style={labelStyle}>
                        Firma
                      </label>
                      <input
                        id="td-company"
                        style={inputStyle}
                        value={form.company}
                        onChange={setField("company")}
                        disabled={saving}
                      />
                    </div>
                  </div>
                  <div style={sectionCard}>
                    <div style={sectionTitle}>Adresse</div>
                    <div style={{ marginBottom: "10px" }}>
                      <label htmlFor="td-street" style={labelStyle}>
                        Strasse
                      </label>
                      <input
                        id="td-street"
                        style={inputStyle}
                        value={form.street}
                        onChange={setField("street")}
                        disabled={saving}
                      />
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "10px" }}>
                      <div>
                        <label htmlFor="td-plz" style={labelStyle}>
                          PLZ
                        </label>
                        <input
                          id="td-plz"
                          style={inputStyle}
                          value={form.postalCode}
                          onChange={setField("postalCode")}
                          disabled={saving}
                        />
                      </div>
                      <div>
                        <label htmlFor="td-city" style={labelStyle}>
                          Ort
                        </label>
                        <input
                          id="td-city"
                          style={inputStyle}
                          value={form.city}
                          onChange={setField("city")}
                          disabled={saving}
                        />
                      </div>
                    </div>
                    <div style={{ marginTop: "10px", marginBottom: "12px" }}>
                      <label htmlFor="td-country" style={labelStyle}>
                        Land
                      </label>
                      <input
                        id="td-country"
                        style={inputStyle}
                        value={form.country}
                        onChange={setField("country")}
                        disabled={saving}
                      />
                    </div>

                    {saveError ? (
                      <div style={{ marginBottom: "12px", fontSize: "13px", color: "#B91C1C" }}>
                        {saveError}
                      </div>
                    ) : null}
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      <button
                        type="submit"
                        disabled={saving}
                        style={{
                          padding: "8px 14px",
                          borderRadius: "10px",
                          border: "none",
                          background: saving ? "#94A3B8" : "#f97316",
                          color: "#FFF",
                          fontWeight: 700,
                          cursor: saving ? "default" : "pointer",
                        }}
                      >
                        {saving ? "Speichern …" : "Speichern"}
                      </button>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => {
                          setEditing(false);
                          setSaveError(null);
                          setForm(tenantToForm(tenant));
                        }}
                        style={{
                          padding: "8px 14px",
                          borderRadius: "10px",
                          border: "1px solid #E2E8F0",
                          background: "#FFF",
                          fontWeight: 600,
                          cursor: saving ? "default" : "pointer",
                        }}
                      >
                        Abbrechen
                      </button>
                    </div>
                  </div>
                  </form>
                )}

              <div style={{ marginTop: "8px", marginBottom: "8px", fontWeight: 700, color: "#334155", fontSize: "13px" }}>
                Verknüpfungen &amp; CRM
              </div>
              <div style={sectionCard}>
                <div style={sectionTitle}>Mietverhältnisse</div>
                {!tenancies.length ? (
                  <p style={{ margin: 0, fontSize: "0.875rem", color: "#64748B" }}>
                    Keine Mietverhältnisse vorhanden
                  </p>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    {tenancyEditErr ? (
                      <p style={{ margin: "0 0 10px 0", fontSize: "13px", color: "#B91C1C" }}>
                        {tenancyEditErr}
                      </p>
                    ) : null}
                    <table style={tableStyle}>
                      <thead>
                        <tr>
                          <th style={thCell}>Zeitraum</th>
                          <th style={thCell}>Status</th>
                          <th style={{ ...thCell, textAlign: "right" }}>Monat (Einnahmen)</th>
                          <th style={thCell}>Kautionsart</th>
                          <th style={{ ...thCell, textAlign: "right" }}>Kautionsbetrag</th>
                          <th style={thCell}>Anbieter</th>
                          <th style={{ ...thCell, textAlign: "right", whiteSpace: "nowrap" }}>Aktion</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tenancies.map((tn) => {
                          const st = (tn.status || "").toLowerCase();
                          const tenantDepType = String(tn.tenant_deposit_type || "").toLowerCase();
                          const dStat = String(tn.display_status || "").toLowerCase();
                          const badge =
                            TENANCY_DISPLAY_STATUS_BADGE[dStat] ||
                            TENANCY_STATUS_BADGE[st] ||
                            (st === "reserved" ? TENANCY_STATUS_BADGE.upcoming : TENANCY_STATUS_BADGE.ended);
                          const rowKey = tn.id != null ? String(tn.id) : `${tn.move_in_date}-${tn.room_id}`;
                          const urgencyNote = tenancyEndUrgencyNote(tn);
                          return (
                            <React.Fragment key={rowKey}>
                              <tr>
                                <td style={{ ...tdCell, verticalAlign: "top" }}>
                                  <span
                                    style={{
                                      fontSize: "13px",
                                      color: "#0F172A",
                                      display: "block",
                                      marginBottom: "6px",
                                    }}
                                  >
                                    {tenancyDateRangeLabel(tn)}
                                  </span>
                                  <div
                                    style={{
                                      marginTop: "4px",
                                      padding: "8px 10px",
                                      borderRadius: "8px",
                                      background: "#F8FAFC",
                                      border: "1px solid #E2E8F0",
                                      fontSize: "11px",
                                      lineHeight: 1.45,
                                      maxWidth: "340px",
                                    }}
                                  >
                                    <div
                                      style={{
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "space-between",
                                        gap: "8px",
                                        flexWrap: "wrap",
                                        marginBottom: "6px",
                                      }}
                                    >
                                      <span style={{ fontWeight: 800, color: "#334155" }}>
                                        Kündigung &amp; Mietende
                                      </span>
                                      <span
                                        style={{
                                          display: "inline-flex",
                                          padding: "4px 8px",
                                          borderRadius: "999px",
                                          fontSize: "11px",
                                          fontWeight: 700,
                                          background: badge.bg,
                                          color: badge.color,
                                          border: `1px solid ${badge.border}`,
                                        }}
                                      >
                                        {dStat
                                          ? tenancyDisplayStatusLabelDe(tn.display_status)
                                          : tn.status || "—"}
                                      </span>
                                    </div>
                                    <div style={{ color: "#475569" }}>
                                      <div>
                                        <span style={{ color: "#64748B", fontWeight: 600 }}>
                                          Kündigung eingegangen am{" "}
                                        </span>
                                        {formatDateOnly(dateOnlyOrNull(tn.notice_given_at) || "")}
                                      </div>
                                      <div>
                                        <span style={{ color: "#64748B", fontWeight: 600 }}>
                                          Kündigung wirksam per{" "}
                                        </span>
                                        {formatDateOnly(dateOnlyOrNull(tn.termination_effective_date) || "")}
                                      </div>
                                      <div>
                                        <span style={{ color: "#64748B", fontWeight: 600 }}>
                                          Rückgabe erfolgt am{" "}
                                        </span>
                                        {formatDateOnly(dateOnlyOrNull(tn.actual_move_out_date) || "")}
                                      </div>
                                      <div>
                                        <span style={{ color: "#64748B", fontWeight: 600 }}>
                                          Mietende / Vertragsende{" "}
                                        </span>
                                        {formatDateOnly(tenancyDisplayEndIso(tn) || "")}
                                      </div>
                                    </div>
                                    {urgencyNote ? (
                                      <div
                                        style={{
                                          marginTop: "6px",
                                          fontSize: "10px",
                                          color: "#94A3B8",
                                          fontWeight: 600,
                                        }}
                                      >
                                        {urgencyNote}
                                      </div>
                                    ) : null}
                                  </div>
                                </td>
                                <td style={tdCell}>
                                  <span
                                    style={{
                                      display: "inline-flex",
                                      padding: "4px 8px",
                                      borderRadius: "999px",
                                      fontSize: "11px",
                                      fontWeight: 700,
                                      background: badge.bg,
                                      color: badge.color,
                                      border: `1px solid ${badge.border}`,
                                    }}
                                  >
                                    {dStat
                                      ? tenancyDisplayStatusLabelDe(tn.display_status)
                                      : tn.status || "—"}
                                  </span>
                                </td>
                                <td style={{ ...tdCell, textAlign: "right", fontWeight: 600, color: "#0F172A", verticalAlign: "top" }}>
                                  {(() => {
                                    const tidStr = String(tn.id);
                                    const revRowsForCell = tenancyRevenueByTenancyId[tidStr];
                                    const loadingRow = tenancyRevenueLoadingId === tidStr;
                                    if (revRowsForCell === undefined || loadingRow) {
                                      return <span style={{ color: "#94A3B8", fontWeight: 500 }}>…</span>;
                                    }
                                    if (!revRowsForCell.length) {
                                      return (
                                        <span style={{ fontSize: "12px", fontWeight: 600, color: "#64748B" }}>
                                          Keine Einnahmen definiert
                                        </span>
                                      );
                                    }
                                    const monthlyFromSaved = monthlyEquivalentFromRevenueRows(revRowsForCell);
                                    const oneTimeTotal = totalOneTimeRevenueFromRows(revRowsForCell);
                                    const recBrCell = recurringMonthlyBreakdownEntries(revRowsForCell);
                                    const otBrCell = oneTimeBreakdownEntries(revRowsForCell);
                                    return (
                                      <div
                                        style={{
                                          display: "flex",
                                          flexDirection: "column",
                                          alignItems: "flex-end",
                                          gap: "4px",
                                        }}
                                      >
                                        <div style={{ fontSize: "11px", fontWeight: 600, color: "#64748B" }}>
                                          Gesamteinnahmen / Monat
                                        </div>
                                        <span>{formatChfRent(monthlyFromSaved)}</span>
                                        <div style={{ marginTop: "2px", textAlign: "right" }}>
                                          <div style={{ fontSize: "11px", fontWeight: 600, color: "#64748B" }}>
                                            Einmalige Einnahmen
                                          </div>
                                          <span style={{ fontSize: "13px", color: "#0F172A" }}>
                                            {formatChfRent(oneTimeTotal)}
                                          </span>
                                        </div>
                                        {recBrCell.length || otBrCell.length ? (
                                          <div
                                            style={{
                                              marginTop: "6px",
                                              paddingTop: "6px",
                                              borderTop: "1px solid #E2E8F0",
                                              width: "100%",
                                              maxWidth: "220px",
                                            }}
                                          >
                                            {recBrCell.length ? (
                                              <div style={{ marginBottom: otBrCell.length ? "6px" : 0 }}>
                                                <div
                                                  style={{
                                                    fontSize: "10px",
                                                    fontWeight: 700,
                                                    color: "#64748B",
                                                    marginBottom: "4px",
                                                    textAlign: "right",
                                                  }}
                                                >
                                                  Einnahmen Zusammensetzung
                                                </div>
                                                {recBrCell.map((b) => (
                                                  <div
                                                    key={b.typeKey}
                                                    style={{
                                                      display: "flex",
                                                      justifyContent: "space-between",
                                                      gap: "8px",
                                                      fontSize: "11px",
                                                      lineHeight: 1.4,
                                                      textAlign: "right",
                                                    }}
                                                  >
                                                    <span style={{ color: "#475569" }}>{b.label}</span>
                                                    <span style={{ fontWeight: 600, whiteSpace: "nowrap" }}>
                                                      {formatChfRent(b.total)}
                                                    </span>
                                                  </div>
                                                ))}
                                              </div>
                                            ) : null}
                                            {otBrCell.length ? (
                                              <div>
                                                <div
                                                  style={{
                                                    fontSize: "10px",
                                                    fontWeight: 700,
                                                    color: "#64748B",
                                                    marginBottom: "4px",
                                                    textAlign: "right",
                                                  }}
                                                >
                                                  Einmalige Einnahmen
                                                </div>
                                                {otBrCell.map((b) => (
                                                  <div
                                                    key={b.typeKey}
                                                    style={{
                                                      display: "flex",
                                                      justifyContent: "space-between",
                                                      gap: "8px",
                                                      fontSize: "11px",
                                                      lineHeight: 1.4,
                                                      textAlign: "right",
                                                    }}
                                                  >
                                                    <span style={{ color: "#475569" }}>{b.label}</span>
                                                    <span style={{ fontWeight: 600, whiteSpace: "nowrap" }}>
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
                                </td>
                                <td style={tdCell}>{tenantDepositTypeLabel(tn.tenant_deposit_type)}</td>
                                <td style={{ ...tdCell, textAlign: "right" }}>
                                  {formatChfRent(tn.tenant_deposit_amount)}
                                </td>
                                <td style={tdCell}>
                                  {tenantDepType === "insurance"
                                    ? tenantDepositProviderLabel(tn.tenant_deposit_provider)
                                    : "—"}
                                </td>
                                <td style={{ ...tdCell, textAlign: "right", whiteSpace: "nowrap" }}>
                                  <div style={{ display: "inline-flex", gap: "8px", flexWrap: "wrap", justifyContent: "flex-end" }}>
                                    <button
                                      type="button"
                                      onClick={() => startTenancyEdit(tn)}
                                      disabled={tenancyEditSaving}
                                      style={{
                                        padding: "4px 10px",
                                        borderRadius: "8px",
                                        border: "1px solid #E2E8F0",
                                        background: "#FFF",
                                        fontSize: "12px",
                                        fontWeight: 600,
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
                                        style={{
                                          padding: "4px 10px",
                                          borderRadius: "8px",
                                          border: "1px solid #E2E8F0",
                                          background: "#FFF",
                                          fontSize: "12px",
                                          fontWeight: 600,
                                          cursor: tenancyEditSaving ? "default" : "pointer",
                                        }}
                                      >
                                        Zur Einheit
                                      </button>
                                    ) : null}
                                  </div>
                                </td>
                              </tr>
                              {String(tenancyEditingId) === String(tn.id) ? (
                                <tr>
                                  <td colSpan={7} style={{ ...tdCell, background: "#F8FAFC", verticalAlign: "top" }}>
                                    <div style={{ fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "8px" }}>
                                      Mietverhältnis bearbeiten
                                    </div>
                                    <div
                                      style={{
                                        fontSize: "11px",
                                        color: "#64748B",
                                        marginBottom: "8px",
                                        width: "100%",
                                      }}
                                    >
                                      <strong style={{ color: "#334155" }}>Kündigung / Mietende</strong>
                                      {" · "}
                                      Mietende / Vertragsende (angezeigt):{" "}
                                      <strong style={{ color: "#0F172A" }}>
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
                                        <label htmlFor={`ten-ng-${rowKey}`} style={labelStyle}>
                                          Kündigung eingegangen am
                                        </label>
                                        <input
                                          id={`ten-ng-${rowKey}`}
                                          type="date"
                                          style={inputStyle}
                                          value={tenancyEditNoticeGivenAt}
                                          onChange={(e) => setTenancyEditNoticeGivenAt(e.target.value)}
                                          disabled={tenancyEditSaving}
                                        />
                                      </div>
                                      <div>
                                        <label htmlFor={`ten-te-${rowKey}`} style={labelStyle}>
                                          Kündigung wirksam per
                                        </label>
                                        <input
                                          id={`ten-te-${rowKey}`}
                                          type="date"
                                          style={inputStyle}
                                          value={tenancyEditTerminationEffective}
                                          onChange={(e) => setTenancyEditTerminationEffective(e.target.value)}
                                          disabled={tenancyEditSaving}
                                        />
                                      </div>
                                      <div>
                                        <label htmlFor={`ten-am-${rowKey}`} style={labelStyle}>
                                          Rückgabe erfolgt am
                                        </label>
                                        <input
                                          id={`ten-am-${rowKey}`}
                                          type="date"
                                          style={inputStyle}
                                          value={tenancyEditActualMoveOut}
                                          onChange={(e) => setTenancyEditActualMoveOut(e.target.value)}
                                          disabled={tenancyEditSaving}
                                        />
                                      </div>
                                      <div>
                                        <label htmlFor={`ten-tb-${rowKey}`} style={labelStyle}>
                                          Gekündigt durch
                                        </label>
                                        <select
                                          id={`ten-tb-${rowKey}`}
                                          style={{ ...inputStyle, cursor: tenancyEditSaving ? "default" : "pointer" }}
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
                                        <label htmlFor={`ten-st-${rowKey}`} style={labelStyle}>
                                          Status (abgeleitet)
                                        </label>
                                        <div
                                          style={{
                                            ...inputStyle,
                                            background: "#F8FAFC",
                                            border: "1px solid #E2E8F0",
                                            display: "flex",
                                            alignItems: "center",
                                          }}
                                        >
                                          {(() => {
                                            const key = deriveTenancyLifecyclePreviewForAssign(
                                              tn.move_in_date,
                                              tenancyEditTerminationEffective,
                                              tenancyEditActualMoveOut
                                            );
                                            const badge =
                                              TENANCY_DISPLAY_STATUS_BADGE[key] ||
                                              TENANCY_STATUS_BADGE[key === "reserved" ? "upcoming" : key] ||
                                              TENANCY_STATUS_BADGE.ended;
                                            return (
                                              <span
                                                style={{
                                                  display: "inline-flex",
                                                  padding: "4px 8px",
                                                  borderRadius: "999px",
                                                  fontSize: "11px",
                                                  fontWeight: 700,
                                                  background: badge.bg,
                                                  color: badge.color,
                                                  border: `1px solid ${badge.border}`,
                                                }}
                                              >
                                                {tenancyDisplayStatusLabelDe(key)}
                                              </span>
                                            );
                                          })()}
                                        </div>
                                      </div>
                                      <div>
                                        <label htmlFor={`ten-tdt-${rowKey}`} style={labelStyle}>
                                          Kautionsart Mieter
                                        </label>
                                        <select
                                          id={`ten-tdt-${rowKey}`}
                                          style={{ ...inputStyle, cursor: tenancyEditSaving ? "default" : "pointer" }}
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
                                        <label htmlFor={`ten-tda-${rowKey}`} style={labelStyle}>
                                          Kautionsbetrag Mieter (CHF)
                                        </label>
                                        <input
                                          id={`ten-tda-${rowKey}`}
                                          type="number"
                                          min="0"
                                          step="0.01"
                                          style={inputStyle}
                                          value={tenancyEditTenantDepositAmount}
                                          onChange={(e) => setTenancyEditTenantDepositAmount(e.target.value)}
                                          disabled={tenancyEditSaving}
                                        />
                                      </div>
                                      {tenancyEditTenantDepositType === "insurance" ? (
                                        <div>
                                          <label htmlFor={`ten-tdp-${rowKey}`} style={labelStyle}>
                                            Anbieter
                                          </label>
                                          <select
                                            id={`ten-tdp-${rowKey}`}
                                            style={{ ...inputStyle, cursor: tenancyEditSaving ? "default" : "pointer" }}
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
                                          style={{
                                            padding: "6px 12px",
                                            borderRadius: "8px",
                                            border: "none",
                                            background: tenancyEditSaving ? "#94A3B8" : "#f97316",
                                            color: "#FFF",
                                            fontWeight: 700,
                                            fontSize: "12px",
                                            cursor: tenancyEditSaving ? "default" : "pointer",
                                          }}
                                        >
                                          {tenancyEditSaving ? "Speichern …" : "Speichern"}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={cancelTenancyEdit}
                                          disabled={tenancyEditSaving}
                                          style={{
                                            padding: "6px 12px",
                                            borderRadius: "8px",
                                            border: "1px solid #E2E8F0",
                                            background: "#FFF",
                                            fontWeight: 600,
                                            fontSize: "12px",
                                            cursor: tenancyEditSaving ? "default" : "pointer",
                                          }}
                                        >
                                          Abbrechen
                                        </button>
                                      </div>
                                    </div>

                                    <div style={{ marginTop: "14px", paddingTop: "12px", borderTop: "1px solid #E2E8F0" }}>
                                      <div style={{ fontSize: "12px", fontWeight: 800, color: "#334155", marginBottom: "8px" }}>
                                        Einnahmen
                                      </div>

                                      {(() => {
                                        const tidKpi = String(tn.id);
                                        const rowsKpi = tenancyRevenueByTenancyId[tidKpi];
                                        const kpiLoading = tenancyRevenueLoadingId === tidKpi;
                                        if (rowsKpi === undefined || kpiLoading) {
                                          return (
                                            <div
                                              style={{
                                                marginBottom: "10px",
                                                padding: "10px 12px",
                                                background: "#F8FAFC",
                                                borderRadius: "8px",
                                                fontSize: "12px",
                                                color: "#94A3B8",
                                              }}
                                            >
                                              …
                                            </div>
                                          );
                                        }
                                        const monthlyKpi = monthlyEquivalentFromRevenueRows(rowsKpi);
                                        const oneTimeKpi = totalOneTimeRevenueFromRows(rowsKpi);
                                        const recBr = recurringMonthlyBreakdownEntries(rowsKpi);
                                        const otBr = oneTimeBreakdownEntries(rowsKpi);
                                        return (
                                          <div
                                            style={{
                                              marginBottom: "10px",
                                              padding: "10px 12px",
                                              background: "#F1F5F9",
                                              borderRadius: "8px",
                                              fontSize: "12px",
                                              color: "#334155",
                                            }}
                                          >
                                            <div style={{ fontWeight: 800, color: "#0F172A", marginBottom: "8px" }}>
                                              Einnahmen-Übersicht
                                            </div>
                                            <div style={{ marginBottom: "4px" }}>
                                              <span style={{ color: "#64748B", fontWeight: 600 }}>Gesamteinnahmen / Monat:</span>{" "}
                                              <span style={{ fontWeight: 700 }}>{formatChfRent(monthlyKpi)}</span>
                                            </div>
                                            <div style={{ marginBottom: recBr.length || otBr.length ? "8px" : 0 }}>
                                              <span style={{ color: "#64748B", fontWeight: 600 }}>Einmalige Einnahmen:</span>{" "}
                                              <span style={{ fontWeight: 700 }}>{formatChfRent(oneTimeKpi)}</span>
                                            </div>
                                            {recBr.length || otBr.length ? (
                                              <div
                                                style={{
                                                  marginTop: "8px",
                                                  paddingTop: "8px",
                                                  borderTop: "1px solid #E2E8F0",
                                                }}
                                              >
                                                {recBr.length ? (
                                                  <div style={{ marginBottom: otBr.length ? "8px" : 0 }}>
                                                    <div
                                                      style={{
                                                        fontSize: "11px",
                                                        fontWeight: 700,
                                                        color: "#64748B",
                                                        marginBottom: "4px",
                                                      }}
                                                    >
                                                      Einnahmen Zusammensetzung
                                                    </div>
                                                    {recBr.map((b) => (
                                                      <div
                                                        key={b.typeKey}
                                                        style={{
                                                          display: "flex",
                                                          justifyContent: "space-between",
                                                          gap: "12px",
                                                          fontSize: "12px",
                                                          lineHeight: 1.45,
                                                        }}
                                                      >
                                                        <span>{b.label}</span>
                                                        <span style={{ fontWeight: 600, whiteSpace: "nowrap" }}>
                                                          {formatChfRent(b.total)}
                                                        </span>
                                                      </div>
                                                    ))}
                                                  </div>
                                                ) : null}
                                                {otBr.length ? (
                                                  <div>
                                                    <div
                                                      style={{
                                                        fontSize: "11px",
                                                        fontWeight: 700,
                                                        color: "#64748B",
                                                        marginBottom: "4px",
                                                      }}
                                                    >
                                                      Einmalige Einnahmen
                                                    </div>
                                                    {otBr.map((b) => (
                                                      <div
                                                        key={b.typeKey}
                                                        style={{
                                                          display: "flex",
                                                          justifyContent: "space-between",
                                                          gap: "12px",
                                                          fontSize: "12px",
                                                          lineHeight: 1.45,
                                                        }}
                                                      >
                                                        <span>{b.label}</span>
                                                        <span style={{ fontWeight: 600, whiteSpace: "nowrap" }}>
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
                                        <p style={{ margin: "0 0 10px 0", fontSize: "13px", color: "#B91C1C" }}>
                                          {tenancyRevenueErr}
                                        </p>
                                      ) : null}

                                      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "flex-end" }}>
                                        <div>
                                          <label htmlFor={`rev-type-${String(tn.id)}`} style={labelStyle}>
                                            Typ
                                          </label>
                                          <RevenueTypeSelect
                                            id={`rev-type-${String(tn.id)}`}
                                            selectStyle={inputStyle}
                                            value={revenueForm.type}
                                            onChange={(e) => setRevenueForm((f) => ({ ...f, type: e.target.value }))}
                                            disabled={tenancyRevenueLoadingId === String(tn.id)}
                                          />
                                        </div>
                                        <div>
                                          <label style={labelStyle}>Betrag (CHF)</label>
                                          <input
                                            type="text"
                                            inputMode="decimal"
                                            style={inputStyle}
                                            value={revenueForm.amount_chf}
                                            onChange={(e) => setRevenueForm((f) => ({ ...f, amount_chf: e.target.value }))}
                                            disabled={tenancyRevenueLoadingId === String(tn.id)}
                                            placeholder="z. B. 1200"
                                          />
                                        </div>
                                        <div>
                                          <label style={labelStyle}>Frequenz</label>
                                          <select
                                            style={{ ...inputStyle, cursor: tenancyRevenueLoadingId === String(tn.id) ? "default" : "pointer" }}
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
                                                    tn.move_out_date
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
                                          <label style={labelStyle}>Start (optional)</label>
                                          <input
                                            type="date"
                                            style={inputStyle}
                                            value={revenueForm.start_date}
                                            onChange={(e) => setRevenueForm((f) => ({ ...f, start_date: e.target.value }))}
                                            disabled={tenancyRevenueLoadingId === String(tn.id)}
                                          />
                                        </div>
                                        {normalizeRevenueFrequency(revenueForm.frequency) === "one_time" ? (
                                          <div>
                                            <label style={labelStyle}>Ende (optional)</label>
                                            <input
                                              type="date"
                                              style={inputStyle}
                                              value={revenueForm.end_date}
                                              onChange={(e) => setRevenueForm((f) => ({ ...f, end_date: e.target.value }))}
                                              disabled={tenancyRevenueLoadingId === String(tn.id)}
                                            />
                                          </div>
                                        ) : (
                                          <div>
                                            <label style={labelStyle}>Ende (Mietende)</label>
                                            <div
                                              style={{
                                                ...inputStyle,
                                                background: "#F8FAFC",
                                                border: "1px solid #E2E8F0",
                                                color: "#334155",
                                                fontWeight: 600,
                                              }}
                                            >
                                              {formatDateOnly(
                                                tenancyDraftDisplayEndIso(
                                                  tenancyEditActualMoveOut,
                                                  tenancyEditTerminationEffective
                                                ) || tenancyDisplayEndIso(tn) ||
                                                  ""
                                              )}
                                            </div>
                                            <div
                                              style={{
                                                fontSize: "10px",
                                                color: "#94A3B8",
                                                marginTop: "4px",
                                                maxWidth: "220px",
                                              }}
                                            >
                                              Ende wird automatisch aus Mietende übernommen (gespeichert ohne festes
                                              Enddatum).
                                            </div>
                                          </div>
                                        )}
                                        <div style={{ minWidth: "240px", flex: "1 1 240px" }}>
                                          <label style={labelStyle}>Notizen (optional)</label>
                                          <input
                                            type="text"
                                            style={inputStyle}
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
                                            style={{
                                              padding: "7px 12px",
                                              borderRadius: "10px",
                                              border: "1px solid #FB923C",
                                              background: "#FB923C",
                                              color: "#FFF",
                                              fontWeight: 800,
                                              cursor: tenancyRevenueLoadingId === String(tn.id) ? "default" : "pointer",
                                            }}
                                          >
                                            {revenueEditingId ? "Aktualisieren" : "Hinzufügen"}
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => cancelRevenueEdit(tn)}
                                            disabled={tenancyRevenueLoadingId === String(tn.id)}
                                            style={{
                                              padding: "7px 12px",
                                              borderRadius: "10px",
                                              border: "1px solid #E2E8F0",
                                              background: "#FFF",
                                              fontWeight: 700,
                                              cursor: tenancyRevenueLoadingId === String(tn.id) ? "default" : "pointer",
                                            }}
                                          >
                                            Abbrechen
                                          </button>
                                        </div>
                                      </div>

                                      <div style={{ marginTop: "10px", overflowX: "auto" }}>
                                        <table style={tableStyle}>
                                          <thead>
                                            <tr>
                                              <th style={thCell}>Typ</th>
                                              <th style={{ ...thCell, textAlign: "right" }}>Betrag</th>
                                              <th style={thCell}>Frequenz</th>
                                              <th style={thCell}>Zeitraum (optional)</th>
                                              <th style={thCell}>Notizen</th>
                                              <th style={{ ...thCell, textAlign: "right", whiteSpace: "nowrap" }}>Aktion</th>
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
                                                    <td style={tdCell}>{revenueTypeLabelForDisplay(rr.type)}</td>
                                                    <td style={{ ...tdCell, textAlign: "right", fontWeight: 700, color: "#0F172A" }}>
                                                      {formatChfRent(rr.amount_chf)}
                                                    </td>
                                                    <td style={tdCell}>{revenueFrequencyLabel(rr.frequency)}</td>
                                                    <td style={tdCell}>{range}</td>
                                                    <td style={tdCell}>{rr.notes || "—"}</td>
                                                    <td style={{ ...tdCell, textAlign: "right", whiteSpace: "nowrap" }}>
                                                      <div style={{ display: "inline-flex", gap: "8px", justifyContent: "flex-end", flexWrap: "wrap" }}>
                                                        <button
                                                          type="button"
                                                          onClick={() => startRevenueEdit(rr)}
                                                          disabled={tenancyRevenueLoadingId === String(tn.id)}
                                                          style={{
                                                            padding: "4px 10px",
                                                            borderRadius: "8px",
                                                            border: "1px solid #E2E8F0",
                                                            background: "#FFF",
                                                            fontSize: "12px",
                                                            fontWeight: 700,
                                                            cursor: tenancyRevenueLoadingId === String(tn.id) ? "default" : "pointer",
                                                          }}
                                                        >
                                                          Bearbeiten
                                                        </button>
                                                        <button
                                                          type="button"
                                                          onClick={() => deleteRevenueRow(tn.id, rr, tn)}
                                                          disabled={tenancyRevenueLoadingId === String(tn.id)}
                                                          style={{
                                                            padding: "4px 10px",
                                                            borderRadius: "8px",
                                                            border: "1px solid #E2E8F0",
                                                            background: "#FFF",
                                                            fontSize: "12px",
                                                            fontWeight: 700,
                                                            color: "#B91C1C",
                                                            cursor: tenancyRevenueLoadingId === String(tn.id) ? "default" : "pointer",
                                                          }}
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
                                                <td colSpan={6} style={{ ...tdCell, color: "#64748B" }}>
                                                  {tenancyRevenueLoadingId === String(tn.id) ? "Lade …" : "Keine Einnahmen erfasst."}
                                                </td>
                                              </tr>
                                            )}
                                          </tbody>
                                        </table>
                                      </div>

                                      <p style={{ margin: "10px 0 0 0", fontSize: "11px", color: "#64748B" }}>
                                        Berechnung Gesamteinnahmen / Monat: monatlich voll, jährlich ÷12; einmalige Beträge unter „Einmalige Einnahmen“.
                                      </p>
                                    </div>
                                  </td>
                                </tr>
                              ) : null}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                <button
                  type="button"
                  onClick={openAssignForm}
                  style={{
                    marginTop: "14px",
                    padding: "8px 14px",
                    borderRadius: "10px",
                    border: "1px solid #E2E8F0",
                    background: "#FFFFFF",
                    fontWeight: 600,
                    fontSize: "13px",
                    cursor: "pointer",
                  }}
                >
                  Mietverhältnis zuweisen
                </button>
                {assignOpen ? (
                  <form
                    onSubmit={handleAssignSubmit}
                    style={{
                      marginTop: "14px",
                      paddingTop: "14px",
                      borderTop: "1px solid #F1F5F9",
                    }}
                  >
                    {assignUnitsErr ? (
                      <p style={{ margin: "0 0 10px 0", fontSize: "13px", color: "#B91C1C" }}>
                        {assignUnitsErr}
                      </p>
                    ) : null}
                    {assignErr ? (
                      <p style={{ margin: "0 0 10px 0", fontSize: "13px", color: "#B91C1C" }}>
                        {assignErr}
                      </p>
                    ) : null}
                    <div style={gridTwoCol}>
                      <div>
                        <label htmlFor="assign-unit" style={labelStyle}>
                          Einheit *
                        </label>
                        <select
                          id="assign-unit"
                          style={{ ...inputStyle, cursor: assignSaving ? "default" : "pointer" }}
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
                        <label htmlFor="assign-room" style={labelStyle}>
                          Zimmer *
                        </label>
                        <select
                          id="assign-room"
                          style={{ ...inputStyle, cursor: assignSaving ? "default" : "pointer" }}
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
                          {assignRooms.map((r) => (
                            <option key={String(r.id)} value={String(r.id)}>
                              {r.roomName || r.name || r.room_number || r.id}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label htmlFor="assign-move-in" style={labelStyle}>
                          Einzugsdatum *
                        </label>
                        <input
                          id="assign-move-in"
                          type="date"
                          style={inputStyle}
                          value={assignMoveIn}
                          onChange={(e) => setAssignMoveIn(e.target.value)}
                          disabled={assignSaving}
                          required
                        />
                      </div>
                      <div>
                        <label htmlFor="assign-notice" style={labelStyle}>
                          Kündigung eingegangen am
                        </label>
                        <input
                          id="assign-notice"
                          type="date"
                          style={inputStyle}
                          value={assignNoticeGivenAt}
                          onChange={(e) => setAssignNoticeGivenAt(e.target.value)}
                          disabled={assignSaving}
                        />
                      </div>
                      <div>
                        <label htmlFor="assign-te" style={labelStyle}>
                          Kündigung wirksam per
                        </label>
                        <input
                          id="assign-te"
                          type="date"
                          style={inputStyle}
                          value={assignTerminationEffective}
                          onChange={(e) => setAssignTerminationEffective(e.target.value)}
                          disabled={assignSaving}
                        />
                      </div>
                      <div>
                        <label htmlFor="assign-am" style={labelStyle}>
                          Rückgabe erfolgt am
                        </label>
                        <input
                          id="assign-am"
                          type="date"
                          style={inputStyle}
                          value={assignActualMoveOut}
                          onChange={(e) => setAssignActualMoveOut(e.target.value)}
                          disabled={assignSaving}
                        />
                      </div>
                      <div>
                        <label htmlFor="assign-tb" style={labelStyle}>
                          Gekündigt durch
                        </label>
                        <select
                          id="assign-tb"
                          style={{ ...inputStyle, cursor: assignSaving ? "default" : "pointer" }}
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
                      <div>
                        <label style={labelStyle}>Einnahmen / Monat</label>
                        <div style={{ ...inputStyle, background: "#F8FAFC", border: "1px solid #E2E8F0" }}>
                          {formatChfRent(monthlyEquivalentFromRevenueRows(assignRevenueRows))}
                        </div>
                      </div>
                      <div>
                        <label style={labelStyle}>Status (abgeleitet)</label>
                        <div style={{ ...inputStyle, background: "#F8FAFC", border: "1px solid #E2E8F0" }}>
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
                        <div style={{ fontSize: "12px", fontWeight: 800, color: "#334155", marginBottom: "8px" }}>
                          Einnahmen
                        </div>
                        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "flex-end" }}>
                          <div>
                            <label htmlFor="assign-rev-type" style={labelStyle}>
                              Typ
                            </label>
                            <RevenueTypeSelect
                              id="assign-rev-type"
                              selectStyle={inputStyle}
                              value={assignRevenueForm.type}
                              onChange={(e) => setAssignRevenueForm((f) => ({ ...f, type: e.target.value }))}
                              disabled={assignSaving}
                            />
                          </div>
                          <div>
                            <label style={labelStyle}>Betrag (CHF)</label>
                            <input
                              type="text"
                              inputMode="decimal"
                              style={inputStyle}
                              value={assignRevenueForm.amount_chf}
                              onChange={(e) => {
                                setAssignRevenueForm((f) => ({ ...f, amount_chf: e.target.value }));
                              }}
                              disabled={assignSaving}
                            />
                          </div>
                          <div>
                            <label style={labelStyle}>Frequenz</label>
                            <select
                              style={{ ...inputStyle, cursor: assignSaving ? "default" : "pointer" }}
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
                            <label style={labelStyle}>Start (optional)</label>
                            <input
                              type="date"
                              style={inputStyle}
                              value={assignRevenueForm.start_date}
                              onChange={(e) => setAssignRevenueForm((f) => ({ ...f, start_date: e.target.value }))}
                              disabled={assignSaving}
                            />
                          </div>
                          {normalizeRevenueFrequency(assignRevenueForm.frequency) === "one_time" ? (
                            <div>
                              <label style={labelStyle}>Ende (optional)</label>
                              <input
                                type="date"
                                style={inputStyle}
                                value={assignRevenueForm.end_date}
                                onChange={(e) => setAssignRevenueForm((f) => ({ ...f, end_date: e.target.value }))}
                                disabled={assignSaving}
                              />
                            </div>
                          ) : (
                            <div>
                              <label style={labelStyle}>Ende (Mietende)</label>
                              <div
                                style={{
                                  ...inputStyle,
                                  background: "#F8FAFC",
                                  border: "1px solid #E2E8F0",
                                  color: "#334155",
                                  fontWeight: 600,
                                }}
                              >
                                {formatDateOnly(
                                  tenancyDraftDisplayEndIso(assignActualMoveOut, assignTerminationEffective) || ""
                                )}
                              </div>
                              <div style={{ fontSize: "10px", color: "#94A3B8", marginTop: "4px", maxWidth: "220px" }}>
                                Ende wird automatisch aus Mietende übernommen.
                              </div>
                            </div>
                          )}
                          <div style={{ minWidth: "240px", flex: "1 1 240px" }}>
                            <label style={labelStyle}>Notizen (optional)</label>
                            <input
                              type="text"
                              style={inputStyle}
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
                            style={{
                              padding: "8px 12px",
                              borderRadius: "10px",
                              border: "1px solid #E2E8F0",
                              background: "#FFF",
                              fontWeight: 700,
                              cursor: assignSaving ? "default" : "pointer",
                            }}
                          >
                            + Einnahme hinzufügen
                          </button>
                        </div>

                        <div style={{ marginTop: "10px", overflowX: "auto" }}>
                          <table style={tableStyle}>
                            <thead>
                              <tr>
                                <th style={thCell}>Typ</th>
                                <th style={{ ...thCell, textAlign: "right" }}>Betrag</th>
                                <th style={thCell}>Frequenz</th>
                                <th style={thCell}>Aktion</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(Array.isArray(assignRevenueRows) ? assignRevenueRows : []).map((rr) => (
                                <tr key={rr.id}>
                                  <td style={tdCell}>{revenueTypeLabelForDisplay(rr.type)}</td>
                                  <td style={{ ...tdCell, textAlign: "right", fontWeight: 700, color: "#0F172A" }}>
                                    {formatChfRent(parseRevenueAmount(rr.amount_chf) ?? rr.amount_chf)}
                                  </td>
                                  <td style={tdCell}>{revenueFrequencyLabel(rr.frequency)}</td>
                                  <td style={tdCell}>
                                    <button
                                      type="button"
                                      disabled={assignSaving}
                                      onClick={() =>
                                        setAssignRevenueRows((prev) => (prev || []).filter((x) => x.id !== rr.id))
                                      }
                                      style={{
                                        padding: "4px 10px",
                                        borderRadius: "8px",
                                        border: "1px solid #E2E8F0",
                                        background: "#FFF",
                                        fontSize: "12px",
                                        fontWeight: 700,
                                        color: "#B91C1C",
                                        cursor: assignSaving ? "default" : "pointer",
                                      }}
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
                        <label htmlFor="assign-tenant-deposit-type" style={labelStyle}>
                          Kautionsart Mieter
                        </label>
                        <select
                          id="assign-tenant-deposit-type"
                          style={{ ...inputStyle, cursor: assignSaving ? "default" : "pointer" }}
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
                        <label htmlFor="assign-tenant-deposit-amount" style={labelStyle}>
                          Kautionsbetrag Mieter (CHF)
                        </label>
                        <input
                          id="assign-tenant-deposit-amount"
                          type="number"
                          min="0"
                          step="0.01"
                          style={inputStyle}
                          value={assignTenantDepositAmount}
                          onChange={(e) => setAssignTenantDepositAmount(e.target.value)}
                          disabled={assignSaving}
                        />
                      </div>
                      {assignTenantDepositType === "insurance" ? (
                        <div>
                          <label htmlFor="assign-tenant-deposit-provider" style={labelStyle}>
                            Anbieter
                          </label>
                          <select
                            id="assign-tenant-deposit-provider"
                            style={{ ...inputStyle, cursor: assignSaving ? "default" : "pointer" }}
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
                        style={{
                          padding: "8px 14px",
                          borderRadius: "10px",
                          border: "none",
                          background: assignSaving ? "#94A3B8" : "#f97316",
                          color: "#FFF",
                          fontWeight: 700,
                          cursor: assignSaving ? "default" : "pointer",
                        }}
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
                        style={{
                          padding: "8px 14px",
                          borderRadius: "10px",
                          border: "1px solid #E2E8F0",
                          background: "#FFF",
                          fontWeight: 600,
                          cursor: assignSaving ? "default" : "pointer",
                        }}
                      >
                        Abbrechen
                      </button>
                    </div>
                  </form>
                ) : null}
              </div>
              <div style={sectionCard}>
                <div style={sectionTitle}>Rechnungen</div>
                {!invoices.length ? (
                  <p style={{ margin: 0, fontSize: "0.875rem", color: "#64748B" }}>
                    Keine Rechnungen vorhanden
                  </p>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table style={tableStyle}>
                      <thead>
                        <tr>
                          <th style={thCell}>Rechnung</th>
                          <th style={{ ...thCell, textAlign: "right" }}>Betrag</th>
                          <th style={thCell}>Fällig</th>
                          <th style={thCell}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {invoices.map((inv) => {
                          const st = (inv.status || "").toLowerCase();
                          const badge =
                            INVOICE_STATUS_BADGE[st] || INVOICE_STATUS_BADGE.unpaid;
                          return (
                            <tr key={inv.id != null ? String(inv.id) : `${inv.invoice_number}-${inv.due_date}`}>
                              <td style={{ ...tdCell, fontWeight: 700, color: "#0F172A" }}>
                                {inv.invoice_number || "—"}
                              </td>
                              <td style={{ ...tdCell, textAlign: "right", color: "#0F172A" }}>
                                {formatInvoiceAmount(inv.amount, inv.currency)}
                              </td>
                              <td style={{ ...tdCell, fontSize: "13px", color: "#64748B" }}>
                                {formatDateOnly(inv.due_date)}
                              </td>
                              <td style={tdCell}>
                                <span
                                  style={{
                                    display: "inline-flex",
                                    padding: "4px 8px",
                                    borderRadius: "999px",
                                    fontSize: "11px",
                                    fontWeight: 700,
                                    background: badge.bg,
                                    color: badge.color,
                                    border: `1px solid ${badge.border}`,
                                  }}
                                >
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
              <div style={sectionCard}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: "12px",
                    marginBottom: "10px",
                  }}
                >
                  <div style={sectionTitle}>Dokumente</div>
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      alignItems: "center",
                      gap: "10px",
                      justifyContent: "flex-end",
                    }}
                  >
                    <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "#64748B" }}>
                      <span>Kategorie</span>
                      <select
                        value={tenantDocCategory}
                        onChange={(e) => setTenantDocCategory(e.target.value)}
                        disabled={tenantDocUploading || !tenantId}
                        style={{
                          fontSize: "13px",
                          border: "1px solid #CBD5E1",
                          borderRadius: "8px",
                          padding: "6px 8px",
                          color: "#0F172A",
                          background: tenantDocUploading || !tenantId ? "#F1F5F9" : "#FFFFFF",
                        }}
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
                      style={{
                        fontSize: "13px",
                        border: "1px solid #CBD5E1",
                        background: tenantDocUploading || !tenantId ? "#F1F5F9" : "#FFFFFF",
                        color: "#334155",
                        padding: "8px 12px",
                        borderRadius: "8px",
                        fontWeight: 600,
                        cursor: tenantDocUploading || !tenantId ? "not-allowed" : "pointer",
                      }}
                    >
                      {tenantDocUploading ? "Wird hochgeladen …" : "Hochladen"}
                    </button>
                  </div>
                </div>
                {tenantDocUploadError ? (
                  <p style={{ margin: "0 0 8px 0", fontSize: "13px", color: "#DC2626" }}>
                    {tenantDocUploadError}
                  </p>
                ) : null}
                {loading ? (
                  <p style={{ margin: 0, fontSize: "0.875rem", color: "#64748B" }}>Lade Dokumente …</p>
                ) : tenantDocuments.length === 0 ? (
                  <p style={{ margin: 0, fontSize: "0.875rem", color: "#64748B" }}>Keine Dokumente vorhanden</p>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px", color: "#0F172A" }}>
                      <thead>
                        <tr>
                          <th style={thCell}>Datei</th>
                          <th style={thCell}>Typ</th>
                          <th style={thCell}>Kategorie</th>
                          <th style={thCell}>Datum</th>
                          <th style={thCell}>Von</th>
                          <th style={thCell}>Aktionen</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tenantDocuments.map((doc) => (
                          <tr key={String(doc.id)}>
                            <td style={{ ...tdCell, fontWeight: 600 }}>{doc.file_name || "—"}</td>
                            <td style={{ ...tdCell, color: "#64748B" }}>{formatTenantDocumentType(doc)}</td>
                            <td style={{ ...tdCell, color: "#64748B" }}>
                              {formatTenantDocumentCategoryLabel(doc.category)}
                            </td>
                            <td style={{ ...tdCell, color: "#64748B" }}>{formatTenantDocumentDate(doc.created_at)}</td>
                            <td style={{ ...tdCell, color: "#64748B" }}>
                              {doc.uploaded_by_name != null && doc.uploaded_by_name !== ""
                                ? doc.uploaded_by_name
                                : "—"}
                            </td>
                            <td style={tdCell}>
                              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px" }}>
                                <button
                                  type="button"
                                  onClick={() => handleOpenTenantDocument(doc.id)}
                                  style={{
                                    background: "none",
                                    border: "none",
                                    padding: 0,
                                    color: "#EA580C",
                                    fontWeight: 600,
                                    cursor: "pointer",
                                    textDecoration: "underline",
                                  }}
                                >
                                  Öffnen
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteTenantDocument(doc.id)}
                                  style={{
                                    background: "none",
                                    border: "none",
                                    padding: 0,
                                    color: "#64748B",
                                    fontSize: "13px",
                                    cursor: "pointer",
                                    textDecoration: "underline",
                                  }}
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
            <p style={{ color: "#64748B" }}>Keine Daten.</p>
          )}
        </main>
      </div>
    </div>
  );
}
