import React, { useEffect, useState } from "react";
import {
  fetchAdminTenant,
  updateAdminTenant,
  fetchAdminTenantNotes,
  createAdminTenantNote,
  fetchAdminTenantEvents,
  fetchAdminInvoices,
  fetchAdminTenancies,
} from "../../../api/adminData";
import { tenantDisplayName } from "../../../utils/tenantDisplayName";

function formatDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("de-CH", {
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

const backdropStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(15, 23, 42, 0.35)",
  zIndex: 1000,
};

const drawerStyle = {
  position: "fixed",
  top: 0,
  right: 0,
  bottom: 0,
  width: "min(520px, 100vw)",
  background: "#F8FAFC",
  zIndex: 1001,
  boxShadow: "-8px 0 32px rgba(15, 23, 42, 0.12)",
  display: "flex",
  flexDirection: "column",
  borderLeft: "1px solid #E2E8F0",
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

/**
 * Right-side drawer: tenant master data + future CRM placeholders.
 */
export default function TenantDetailDrawer({
  open,
  tenantId,
  statusMeta,
  onClose,
  onTenantUpdated,
}) {
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

  useEffect(() => {
    if (!open || !tenantId) {
      setTenant(null);
      setLoadError(null);
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
        const roomId = t.room_id != null && String(t.room_id).trim() !== "" ? t.room_id : null;
        const tenanciesFetch =
          roomId != null
            ? fetchAdminTenancies({ room_id: roomId }).catch(() => [])
            : Promise.resolve([]);
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
  }, [open, tenantId]);

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

  if (!open) return null;

  const applyUpdate = (updated) => {
    setTenant(updated);
    setForm(tenantToForm(updated));
    onTenantUpdated?.(updated);
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
    <>
      <div style={backdropStyle} aria-hidden onClick={onClose} />
      <aside style={drawerStyle} aria-label="Mieter-Details">
        <div
          style={{
            padding: "18px 20px",
            borderBottom: "1px solid #E2E8F0",
            background: "#FFFFFF",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: "12px",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: "12px", color: "#f97316", fontWeight: 700 }}>
              Mieter
            </div>
            <h2
              style={{
                fontSize: "20px",
                fontWeight: 800,
                margin: "4px 0 0 0",
                wordBreak: "break-word",
              }}
            >
              {loading ? "…" : displayName}
            </h2>
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
          <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
            {!editing && tenant && !loadError ? (
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
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "8px 12px",
                borderRadius: "10px",
                border: "1px solid #E2E8F0",
                background: "#F8FAFC",
                fontWeight: 600,
                fontSize: "13px",
                cursor: "pointer",
              }}
            >
              Schließen
            </button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "16px 18px 24px" }}>
          {loading ? (
            <p style={{ color: "#64748B" }}>Lade Daten …</p>
          ) : loadError ? (
            <div
              style={{
                padding: "12px",
                borderRadius: "12px",
                background: "#FEF2F2",
                border: "1px solid #FECACA",
                color: "#B91C1C",
              }}
            >
              {loadError}
            </div>
          ) : tenant ? (
            <>
              <div style={sectionCard}>
                {!editing ? (
                  <>
                    <div style={sectionTitle}>Person</div>
                    <Row label="Vorname" value={tenant.first_name} />
                    <Row label="Nachname" value={tenant.last_name} />
                    <Row label="Geburtsdatum" value={formatDateOnly(tenant.birth_date)} />
                    <Row label="Nationalität" value={tenant.nationality} />
                    <div style={sectionTitle}>Aufenthalt</div>
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
                    <div style={sectionTitle}>Kontakt</div>
                    <Row label="E-Mail" value={tenant.email} />
                    <Row label="Telefon" value={tenant.phone} />
                    <Row label="Firma" value={tenant.company} />
                    <div style={sectionTitle}>Adresse</div>
                    <Row label="Strasse" value={tenant.street} />
                    <Row label="PLZ" value={tenant.postal_code} />
                    <Row label="Ort" value={tenant.city} />
                    <Row label="Land" value={tenant.country} />
                    <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px solid #F1F5F9" }}>
                      <span style={labelStyle}>Erfasst am</span>
                      <div style={{ fontSize: "15px", color: "#0F172A" }}>
                        {formatDateTime(tenant.created_at)}
                      </div>
                    </div>
                  </>
                ) : (
                  <form onSubmit={handleSave}>
                    <div style={sectionTitle}>Person</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
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

                    <div style={{ ...sectionTitle, marginTop: "14px" }}>Aufenthalt</div>
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

                    <div style={{ ...sectionTitle, marginTop: "14px" }}>Kontakt</div>
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

                    <div style={{ ...sectionTitle, marginTop: "14px" }}>Adresse</div>
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
                  </form>
                )}
              </div>

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
                  <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                    {tenancies.map((tn) => {
                      const st = (tn.status || "").toLowerCase();
                      const badge =
                        TENANCY_STATUS_BADGE[st] ||
                        (st === "reserved" ? TENANCY_STATUS_BADGE.upcoming : TENANCY_STATUS_BADGE.ended);
                      return (
                        <li
                          key={tn.id != null ? String(tn.id) : `${tn.move_in_date}-${tn.room_id}`}
                          style={{
                            marginBottom: "12px",
                            paddingBottom: "12px",
                            borderBottom: "1px solid #F1F5F9",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "8px", flexWrap: "wrap" }}>
                            <span style={{ fontSize: "13px", color: "#0F172A" }}>
                              {tenancyDateRangeLabel(tn)}
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
                              {tn.status || "—"}
                            </span>
                          </div>
                          <div style={{ fontSize: "14px", color: "#0F172A", marginTop: "6px" }}>
                            {formatChfRent(tn.monthly_rent)}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              <div style={sectionCard}>
                <div style={sectionTitle}>Rechnungen</div>
                {!invoices.length ? (
                  <p style={{ margin: 0, fontSize: "0.875rem", color: "#64748B" }}>
                    Keine Rechnungen vorhanden
                  </p>
                ) : (
                  <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                    {invoices.map((inv) => {
                      const st = (inv.status || "").toLowerCase();
                      const badge =
                        INVOICE_STATUS_BADGE[st] || INVOICE_STATUS_BADGE.unpaid;
                      return (
                        <li
                          key={inv.id != null ? String(inv.id) : `${inv.invoice_number}-${inv.due_date}`}
                          style={{
                            marginBottom: "12px",
                            paddingBottom: "12px",
                            borderBottom: "1px solid #F1F5F9",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "8px", flexWrap: "wrap" }}>
                            <span style={{ fontWeight: 700, fontSize: "14px", color: "#0F172A" }}>
                              {inv.invoice_number || "—"}
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
                              {inv.status || "—"}
                            </span>
                          </div>
                          <div style={{ fontSize: "14px", color: "#0F172A", marginTop: "6px" }}>
                            {formatInvoiceAmount(inv.amount, inv.currency)}
                          </div>
                          <div style={{ fontSize: "12px", color: "#94A3B8", marginTop: "4px" }}>
                            Fällig: {formatDateOnly(inv.due_date)}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
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
          ) : null}
        </div>
      </aside>
    </>
  );
}
