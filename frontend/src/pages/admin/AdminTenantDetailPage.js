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
  fetchAdminUnits,
  fetchAdminRooms,
  normalizeUnit,
  normalizeRoom,
} from "../../api/adminData";
import { API_BASE_URL, getApiHeaders } from "../../config";
import { tenantDisplayName } from "../../utils/tenantDisplayName";
import { getDisplayUnitId, normalizeUnitTypeLabel } from "../../utils/unitDisplayId";

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

function formatChfRent(amount) {
  const n = Number(amount);
  if (Number.isNaN(n)) return "CHF —";
  return `CHF ${n.toLocaleString("de-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function tenancyDateRangeLabel(tn) {
  const mi = tn.move_in_date;
  const mo = tn.move_out_date;
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

const placeholderStyle = {
  ...sectionCard,
  color: "#64748B",
  fontSize: "13px",
  textAlign: "center",
  padding: "20px",
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

function PlaceholderSection({ title }) {
  return (
    <div style={placeholderStyle}>
      <div style={{ fontWeight: 700, color: "#334155", marginBottom: "6px" }}>{title}</div>
      <div>Wird in einer späteren Phase ergänzt.</div>
    </div>
  );
}

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
  const [assignMoveOut, setAssignMoveOut] = useState("");
  const [assignMonthlyRent, setAssignMonthlyRent] = useState("");
  const [assignStatus, setAssignStatus] = useState("active");
  const [assignErr, setAssignErr] = useState(null);
  const [assignSaving, setAssignSaving] = useState(false);
  const assignRentUserEditedRef = useRef(false);

  const [tenancyEditingId, setTenancyEditingId] = useState(null);
  const [tenancyEditMoveOut, setTenancyEditMoveOut] = useState("");
  const [tenancyEditStatus, setTenancyEditStatus] = useState("active");
  const [tenancyEditSaving, setTenancyEditSaving] = useState(false);
  const [tenancyEditErr, setTenancyEditErr] = useState(null);

  const assignUnitForRent = useMemo(
    () => assignUnits.find((x) => String(x.id) === String(assignUnitId)),
    [assignUnits, assignUnitId]
  );
  const assignRentIsReadOnly =
    assignUnitForRent != null && normalizeUnitTypeLabel(assignUnitForRent.type) === "Apartment";

  useEffect(() => {
    if (!assignUnitId || !assignUnits.length) return;
    const u = assignUnits.find((x) => String(x.id) === String(assignUnitId));
    if (!u) return;
    const ut = normalizeUnitTypeLabel(u.type);
    if (ut === "Apartment") {
      const raw = u.tenantPriceMonthly ?? u.tenant_price_monthly_chf;
      const p = Number(raw);
      setAssignMonthlyRent(Number.isFinite(p) && p >= 0 ? String(p) : "");
      return;
    }
    if (!assignRoomId || !assignRooms.length) return;
    const room = assignRooms.find((r) => String(r.id) === String(assignRoomId));
    if (!room) return;
    if (assignRentUserEditedRef.current) return;
    const raw = room.priceMonthly ?? room.price ?? room.base_rent_chf;
    const p = Number(raw);
    setAssignMonthlyRent(Number.isFinite(p) && p >= 0 ? String(p) : "");
  }, [assignUnitId, assignUnits, assignRoomId, assignRooms]);

  const reloadTenanciesForTenant = useCallback(async () => {
    try {
      const items = await fetchAdminTenancies({ tenant_id: tenantId, limit: 200 });
      setTenancies(Array.isArray(items) ? items : []);
    } catch {
      setTenancies([]);
    }
  }, [tenantId]);

  const cancelTenancyEdit = () => {
    setTenancyEditingId(null);
    setTenancyEditErr(null);
    setTenancyEditMoveOut("");
    setTenancyEditStatus("active");
  };

  const startTenancyEdit = (tn) => {
    setTenancyEditingId(String(tn.id));
    setTenancyEditErr(null);
    const raw = tn.move_out_date;
    const s = raw != null && raw !== "" ? String(raw) : "";
    setTenancyEditMoveOut(/^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : "");
    const st = String(tn.status || "").toLowerCase();
    if (st === "reserved" || st === "reserviert") setTenancyEditStatus("reserved");
    else if (st === "ended" || st === "beendet") setTenancyEditStatus("ended");
    else setTenancyEditStatus("active");
  };

  const submitTenancyEdit = () => {
    if (!tenancyEditingId || !tenantId) return;
    setTenancyEditErr(null);
    setTenancyEditSaving(true);
    const body = {
      move_out_date: tenancyEditMoveOut.trim() ? tenancyEditMoveOut.trim() : null,
      status: tenancyEditStatus,
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

  useEffect(() => {
    if (!tenantId) {
      setTenant(null);
      setLoadError("Kein Mieter angegeben.");
      setEditing(false);
      setSaveError(null);
      setNotes([]);
      setEvents([]);
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
          setInvoices([]);
          setTenancies([]);
          return;
        }
        setTenant(t);
        setForm(tenantToForm(t));
        const tenanciesFetch = fetchAdminTenancies({ tenant_id: tenantId, limit: 200 })
          .then((items) => (Array.isArray(items) ? items : []))
          .catch(() => []);
        const [nData, eData, invData, tenancyItems] = await Promise.all([
          fetchAdminTenantNotes(tenantId),
          fetchAdminTenantEvents(tenantId),
          fetchAdminInvoices({ tenantId, limit: 20 }).catch(() => ({ items: [] })),
          tenanciesFetch,
        ]);
        if (cancelled) return;
        setNotes(nData?.items || []);
        setEvents(eData?.items || []);
        setInvoices(invData?.items || []);
        setTenancies(Array.isArray(tenancyItems) ? tenancyItems : []);
      } catch (e) {
        if (!cancelled) setLoadError(e?.message || "Laden fehlgeschlagen.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

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
    const t = tenancies.find((x) => String(x.tenant_id) === String(tenantId));
    return getStatusMeta(t?.status || tenant?.status || "");
  }, [tenancies, tenant, tenantId]);

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
    assignRentUserEditedRef.current = false;
    setAssignUnitId("");
    setAssignRoomId("");
    setAssignMoveIn(today);
    setAssignMoveOut("");
    setAssignMonthlyRent("");
    setAssignStatus("active");
    setAssignErr(null);
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
    if (assignMonthlyRent === "" || assignMonthlyRent == null) {
      setAssignErr("Bitte eine gültige Monatsmiete angeben.");
      return;
    }
    const rent = Number(String(assignMonthlyRent).replace(",", "."));
    if (Number.isNaN(rent) || rent < 0) {
      setAssignErr("Bitte eine gültige Monatsmiete angeben.");
      return;
    }
    const apiStatus = assignStatus === "upcoming" ? "reserved" : assignStatus;
    setAssignSaving(true);
    const body = {
      tenant_id: String(tenantId),
      unit_id: String(assignUnitId),
      room_id: String(assignRoomId),
      move_in_date: assignMoveIn.trim(),
      move_out_date: assignMoveOut.trim() ? assignMoveOut.trim() : null,
      monthly_rent: rent,
      status: apiStatus,
    };
    fetch(`${API_BASE_URL}/api/admin/tenancies`, {
      method: "POST",
      headers: getApiHeaders(),
      body: JSON.stringify(body),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(await parseAdminErrorFromResponse(res));
        return res.json();
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
                  <div style={sectionCard}>
                    <div style={sectionTitle}>Adresse</div>
                    <div style={gridTwoCol}>
                      <Row label="Strasse" value={tenant.street} />
                      <Row label="PLZ" value={tenant.postal_code} />
                      <Row label="Ort" value={tenant.city} />
                      <Row label="Land" value={tenant.country} />
                    </div>
                  </div>
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
                          <th style={{ ...thCell, textAlign: "right" }}>Monatsmiete</th>
                          <th style={{ ...thCell, textAlign: "right", whiteSpace: "nowrap" }}>Aktion</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tenancies.map((tn) => {
                          const st = (tn.status || "").toLowerCase();
                          const badge =
                            TENANCY_STATUS_BADGE[st] ||
                            (st === "reserved" ? TENANCY_STATUS_BADGE.upcoming : TENANCY_STATUS_BADGE.ended);
                          const rowKey = tn.id != null ? String(tn.id) : `${tn.move_in_date}-${tn.room_id}`;
                          return (
                            <React.Fragment key={rowKey}>
                              <tr>
                                <td style={tdCell}>
                                  <span style={{ fontSize: "13px", color: "#0F172A" }}>
                                    {tenancyDateRangeLabel(tn)}
                                  </span>
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
                                    {tn.status || "—"}
                                  </span>
                                </td>
                                <td style={{ ...tdCell, textAlign: "right", fontWeight: 600, color: "#0F172A" }}>
                                  {formatChfRent(tn.monthly_rent)}
                                </td>
                                <td style={{ ...tdCell, textAlign: "right" }}>
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
                                </td>
                              </tr>
                              {String(tenancyEditingId) === String(tn.id) ? (
                                <tr>
                                  <td colSpan={4} style={{ ...tdCell, background: "#F8FAFC", verticalAlign: "top" }}>
                                    <div style={{ fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "8px" }}>
                                      Mietverhältnis bearbeiten
                                    </div>
                                    <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "flex-end" }}>
                                      <div>
                                        <label htmlFor={`ten-out-${rowKey}`} style={labelStyle}>
                                          Auszug / Kündigung (Datum)
                                        </label>
                                        <input
                                          id={`ten-out-${rowKey}`}
                                          type="date"
                                          style={inputStyle}
                                          value={tenancyEditMoveOut}
                                          onChange={(e) => setTenancyEditMoveOut(e.target.value)}
                                          disabled={tenancyEditSaving}
                                        />
                                      </div>
                                      <div>
                                        <label htmlFor={`ten-st-${rowKey}`} style={labelStyle}>
                                          Status
                                        </label>
                                        <select
                                          id={`ten-st-${rowKey}`}
                                          style={{ ...inputStyle, cursor: tenancyEditSaving ? "default" : "pointer" }}
                                          value={tenancyEditStatus}
                                          onChange={(e) => setTenancyEditStatus(e.target.value)}
                                          disabled={tenancyEditSaving}
                                        >
                                          <option value="active">Aktiv</option>
                                          <option value="reserved">Reserviert</option>
                                          <option value="ended">Beendet</option>
                                        </select>
                                      </div>
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
                            assignRentUserEditedRef.current = false;
                            setAssignUnitId(e.target.value);
                            setAssignRoomId("");
                            setAssignMonthlyRent("");
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
                            assignRentUserEditedRef.current = false;
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
                        <label htmlFor="assign-move-out" style={labelStyle}>
                          Auszugsdatum
                        </label>
                        <input
                          id="assign-move-out"
                          type="date"
                          style={inputStyle}
                          value={assignMoveOut}
                          onChange={(e) => setAssignMoveOut(e.target.value)}
                          disabled={assignSaving}
                        />
                      </div>
                      <div>
                        <label htmlFor="assign-rent" style={labelStyle}>
                          Monatsmiete (CHF)
                        </label>
                        <input
                          id="assign-rent"
                          type="number"
                          min="0"
                          step="0.01"
                          style={inputStyle}
                          value={assignMonthlyRent}
                          onChange={(e) => {
                            assignRentUserEditedRef.current = true;
                            setAssignMonthlyRent(e.target.value);
                          }}
                          disabled={assignSaving || assignRentIsReadOnly}
                        />
                      </div>
                      <div>
                        <label htmlFor="assign-status" style={labelStyle}>
                          Status
                        </label>
                        <select
                          id="assign-status"
                          style={{ ...inputStyle, cursor: assignSaving ? "default" : "pointer" }}
                          value={assignStatus}
                          onChange={(e) => setAssignStatus(e.target.value)}
                          disabled={assignSaving}
                        >
                          <option value="active">Aktiv</option>
                          <option value="upcoming">Bevorstehend</option>
                          <option value="ended">Beendet</option>
                        </select>
                      </div>
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
              <TenantHistoryBlock events={events} />
              <PlaceholderSection title="Dokumente" />
            </>
          ) : (
            <p style={{ color: "#64748B" }}>Keine Daten.</p>
          )}
        </main>
      </div>
    </div>
  );
}
