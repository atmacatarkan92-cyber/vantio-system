import React, { useEffect, useState } from "react";
import {
  fetchAdminProperties,
  fetchAdminLandlords,
  createAdminProperty,
  updateAdminProperty,
} from "../../api/adminData";

const tableStyle = { width: "100%", borderCollapse: "collapse" };
const thStyle = { textAlign: "left", padding: "12px 8px", borderBottom: "2px solid #E5E7EB" };
const tdStyle = { padding: "12px 8px", borderBottom: "1px solid #E5E7EB" };
const inputStyle = { width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid #E5E7EB" };
const labelStyle = { display: "block", marginBottom: "4px", fontSize: "13px", fontWeight: 600 };

function AdminPropertiesPage() {
  const [properties, setProperties] = useState([]);
  const [landlords, setLandlords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    landlord_id: "",
    title: "",
    street: "",
    house_number: "",
    zip_code: "",
    city: "",
    country: "CH",
    status: "active",
    notes: "",
  });
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    setError("");
    Promise.all([fetchAdminProperties(), fetchAdminLandlords()])
      .then(([props, lords]) => {
        setProperties(props);
        setLandlords(lords || []);
      })
      .catch((e) => setError(e.message || "Fehler beim Laden."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm({
      landlord_id: "",
      title: "",
      street: "",
      house_number: "",
      zip_code: "",
      city: "",
      country: "CH",
      status: "active",
      notes: "",
    });
    setFormOpen(true);
  };

  const openEdit = (row) => {
    setEditingId(row.id);
    setForm({
      landlord_id: row.landlord_id || "",
      title: row.title || "",
      street: row.street || "",
      house_number: row.house_number || "",
      zip_code: row.zip_code || "",
      city: row.city || "",
      country: row.country || "CH",
      status: row.status || "active",
      notes: row.notes || "",
    });
    setFormOpen(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    const body = {
      landlord_id: form.landlord_id.trim() || null,
      title: form.title.trim() || "—",
      street: form.street.trim() || null,
      house_number: form.house_number.trim() || null,
      zip_code: form.zip_code.trim() || null,
      city: form.city.trim() || null,
      country: form.country.trim() || "CH",
      status: form.status.trim() || "active",
      notes: form.notes.trim() || null,
    };
    const promise = editingId
      ? updateAdminProperty(editingId, body)
      : createAdminProperty(body);
    promise
      .then(() => {
        setFormOpen(false);
        load();
      })
      .catch((e) => setError(e.message || "Speichern fehlgeschlagen."))
      .finally(() => setSaving(false));
  };

  const getLandlordLabel = (id) => {
    if (!id) return "—";
    const l = landlords.find((x) => String(x.id) === String(id));
    return l ? (l.company_name || l.contact_name || l.email || id) : id;
  };

  if (loading) {
    return <p>Lade Liegenschaften …</p>;
  }

  return (
    <div style={{ padding: "0 8px" }}>
      <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "16px" }}>
        Liegenschaften (Properties)
      </h2>
      {error && (
        <p style={{ color: "#B91C1C", marginBottom: "12px", fontSize: "14px" }}>{error}</p>
      )}
      <div style={{ marginBottom: "16px" }}>
        <button
          type="button"
          onClick={openCreate}
          style={{
            padding: "10px 16px",
            background: "#0F172A",
            color: "#FFF",
            border: "none",
            borderRadius: "8px",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          + Neue Liegenschaft
        </button>
      </div>

      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>Titel</th>
            <th style={thStyle}>Adresse</th>
            <th style={thStyle}>Vermieter</th>
            <th style={thStyle}>Status</th>
            <th style={thStyle}></th>
          </tr>
        </thead>
        <tbody>
          {properties.length === 0 ? (
            <tr>
              <td colSpan={5} style={{ ...tdStyle, color: "#64748B" }}>
                Noch keine Einträge. Erstellen Sie eine neue Liegenschaft.
              </td>
            </tr>
          ) : (
            properties.map((row) => (
              <tr key={row.id}>
                <td style={tdStyle}>{row.title || "—"}</td>
                <td style={tdStyle}>
                  {[row.street, row.house_number, [row.zip_code, row.city].filter(Boolean).join(" ")]
                    .filter(Boolean)
                    .join(", ") || "—"}
                </td>
                <td style={tdStyle}>{getLandlordLabel(row.landlord_id)}</td>
                <td style={tdStyle}>{row.status || "—"}</td>
                <td style={tdStyle}>
                  <button
                    type="button"
                    onClick={() => openEdit(row)}
                    style={{
                      padding: "6px 12px",
                      background: "#F1F5F9",
                      border: "1px solid #E2E8F0",
                      borderRadius: "6px",
                      cursor: "pointer",
                      fontSize: "13px",
                    }}
                  >
                    Bearbeiten
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {formOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => !saving && setFormOpen(false)}
        >
          <div
            style={{
              background: "#FFF",
              padding: "24px",
              borderRadius: "12px",
              maxWidth: "420px",
              width: "100%",
              maxHeight: "90vh",
              overflow: "auto",
              boxShadow: "0 10px 40px rgba(0,0,0,0.15)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginBottom: "16px", fontSize: "18px" }}>
              {editingId ? "Liegenschaft bearbeiten" : "Neue Liegenschaft"}
            </h3>
            <form onSubmit={handleSubmit} style={{ display: "grid", gap: "12px" }}>
              <div>
                <label style={labelStyle}>Titel *</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  style={inputStyle}
                  required
                  placeholder="z.B. Haus Musterstrasse"
                />
              </div>
              <div>
                <label style={labelStyle}>Vermieter (optional)</label>
                <select
                  value={form.landlord_id}
                  onChange={(e) => setForm((f) => ({ ...f, landlord_id: e.target.value }))}
                  style={inputStyle}
                >
                  <option value="">— Keiner —</option>
                  {landlords.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.company_name || l.contact_name || l.email || l.id}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Strasse (optional)</label>
                <input
                  type="text"
                  value={form.street}
                  onChange={(e) => setForm((f) => ({ ...f, street: e.target.value }))}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Hausnummer (optional)</label>
                <input
                  type="text"
                  value={form.house_number}
                  onChange={(e) => setForm((f) => ({ ...f, house_number: e.target.value }))}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>PLZ / Ort (optional)</label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "8px" }}>
                  <input
                    type="text"
                    value={form.zip_code}
                    onChange={(e) => setForm((f) => ({ ...f, zip_code: e.target.value }))}
                    style={inputStyle}
                    placeholder="PLZ"
                  />
                  <input
                    type="text"
                    value={form.city}
                    onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                    style={inputStyle}
                    placeholder="Ort"
                  />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Land (optional)</label>
                <input
                  type="text"
                  value={form.country}
                  onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Status</label>
                <select
                  value={form.status}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                  style={inputStyle}
                >
                  <option value="active">Aktiv</option>
                  <option value="inactive">Inaktiv</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Notizen (optional)</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  style={{ ...inputStyle, minHeight: "60px" }}
                  rows={2}
                />
              </div>
              <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    padding: "10px 16px",
                    background: "#0F172A",
                    color: "#FFF",
                    border: "none",
                    borderRadius: "8px",
                    fontWeight: 600,
                    cursor: saving ? "not-allowed" : "pointer",
                  }}
                >
                  {saving ? "Speichern …" : "Speichern"}
                </button>
                <button
                  type="button"
                  onClick={() => !saving && setFormOpen(false)}
                  style={{
                    padding: "10px 16px",
                    background: "#F1F5F9",
                    border: "1px solid #E2E8F0",
                    borderRadius: "8px",
                    cursor: "pointer",
                  }}
                >
                  Abbrechen
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminPropertiesPage;
