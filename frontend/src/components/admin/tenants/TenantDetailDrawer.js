import React, { useEffect, useState } from "react";
import { fetchAdminTenant, updateAdminTenant } from "../../../api/adminData";
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

function Row({ label, value }) {
  return (
    <div style={{ marginBottom: "12px" }}>
      <span style={labelStyle}>{label}</span>
      <div style={{ fontSize: "15px", color: "#0F172A" }}>{value || "—"}</div>
    </div>
  );
}

const emptyForm = {
  firstName: "",
  lastName: "",
  birthDate: "",
  nationality: "",
  isSwiss: false,
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
  return {
    firstName: (t.first_name || "").trim(),
    lastName: (t.last_name || "").trim(),
    birthDate,
    nationality: t.nationality || "",
    isSwiss: t.is_swiss === true,
    residencePermit: t.residence_permit || "",
    email: t.email || "",
    phone: t.phone || "",
    company: t.company || "",
    street: t.street || "",
    postalCode: t.postal_code || "",
    city: t.city || "",
    country: t.country || "",
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

  useEffect(() => {
    if (!open || !tenantId) {
      setTenant(null);
      setLoadError(null);
      setEditing(false);
      setSaveError(null);
      return;
    }
    setLoading(true);
    setLoadError(null);
    fetchAdminTenant(tenantId)
      .then((t) => {
        if (!t) {
          setLoadError("Mieter nicht gefunden.");
          setTenant(null);
          return;
        }
        setTenant(t);
        setForm(tenantToForm(t));
      })
      .catch((e) => setLoadError(e?.message || "Laden fehlgeschlagen."))
      .finally(() => setLoading(false));
  }, [open, tenantId]);

  if (!open) return null;

  const applyUpdate = (updated) => {
    setTenant(updated);
    setForm(tenantToForm(updated));
    onTenantUpdated?.(updated);
  };

  const setField = (key) => (e) => {
    const v = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    setForm((f) => {
      const next = { ...f, [key]: v };
      if (key === "isSwiss" && v === true) next.residencePermit = "";
      return next;
    });
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
      residence_permit: form.isSwiss ? null : form.residencePermit.trim() || null,
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
      })
      .catch((err) => setSaveError(err?.message || "Speichern fehlgeschlagen."))
      .finally(() => setSaving(false));
  };

  const displayName = tenant ? tenantDisplayName(tenant) : "—";

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
                      value={tenant.is_swiss === true ? "Ja" : tenant.is_swiss === false ? "Nein" : "—"}
                    />
                    {tenant.is_swiss !== true ? (
                      <Row label="Aufenthaltsbewilligung" value={tenant.residence_permit} />
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
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        fontSize: "14px",
                        fontWeight: 600,
                        color: "#334155",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={form.isSwiss}
                        onChange={setField("isSwiss")}
                        disabled={saving}
                      />
                      Schweizer/in
                    </label>
                    {!form.isSwiss ? (
                      <div style={{ marginTop: "10px" }}>
                        <label htmlFor="td-permit" style={labelStyle}>
                          Aufenthaltsbewilligung
                        </label>
                        <input
                          id="td-permit"
                          style={inputStyle}
                          value={form.residencePermit}
                          onChange={setField("residencePermit")}
                          disabled={saving}
                        />
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
              <PlaceholderSection title="Mietverhältnisse" />
              <PlaceholderSection title="Rechnungen" />
              <PlaceholderSection title="Notizen" />
              <PlaceholderSection title="Verlauf / Audit" />
              <PlaceholderSection title="Dokumente" />
            </>
          ) : null}
        </div>
      </aside>
    </>
  );
}
