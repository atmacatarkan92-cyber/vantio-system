import React, { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  fetchAdminLandlords,
  fetchAdminLandlord,
  createAdminLandlord,
  updateAdminLandlord,
} from "../../api/adminData";

const tableStyle = { width: "100%", borderCollapse: "collapse" };
const thStyle = { textAlign: "left", padding: "12px 8px", borderBottom: "2px solid #E5E7EB" };
const tdStyle = { padding: "12px 8px", borderBottom: "1px solid #E5E7EB" };
const inputStyle = { width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid #E5E7EB" };
const labelStyle = { display: "block", marginBottom: "4px", fontSize: "13px", fontWeight: 600 };

function AdminLandlordsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinkHandled = useRef(false);
  const [landlords, setLandlords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    company_name: "",
    contact_name: "",
    email: "",
    phone: "",
    notes: "",
    status: "active",
  });
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    setError("");
    fetchAdminLandlords()
      .then(setLandlords)
      .catch((e) => setError(e.message || "Fehler beim Laden."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const editParam = searchParams.get("edit");
  useEffect(() => {
    deepLinkHandled.current = false;
  }, [editParam]);

  useEffect(() => {
    if (loading) return;
    const editId = searchParams.get("edit");
    if (!editId || deepLinkHandled.current) return;

    const applyRow = (row) => {
      deepLinkHandled.current = true;
      setEditingId(row.id);
      setForm({
        company_name: row.company_name || "",
        contact_name: row.contact_name || "",
        email: row.email || "",
        phone: row.phone || "",
        notes: row.notes || "",
        status: row.status || "active",
      });
      setFormOpen(true);
      setSearchParams({}, { replace: true });
    };

    const fromList = landlords.find((l) => String(l.id) === String(editId));
    if (fromList) {
      applyRow(fromList);
      return;
    }

    deepLinkHandled.current = true;
    let cancelled = false;
    fetchAdminLandlord(editId)
      .then((r) => {
        if (cancelled) return;
        if (r) applyRow(r);
        else setSearchParams({}, { replace: true });
      })
      .catch(() => {
        if (!cancelled) setSearchParams({}, { replace: true });
      });
    return () => {
      cancelled = true;
    };
  }, [loading, landlords, searchParams, setSearchParams]);

  const openCreate = () => {
    setEditingId(null);
    setForm({
      company_name: "",
      contact_name: "",
      email: "",
      phone: "",
      notes: "",
      status: "active",
    });
    setFormOpen(true);
  };

  const openEdit = (row) => {
    setEditingId(row.id);
    setForm({
      company_name: row.company_name || "",
      contact_name: row.contact_name || "",
      email: row.email || "",
      phone: row.phone || "",
      notes: row.notes || "",
      status: row.status || "active",
    });
    setFormOpen(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    const body = {
      company_name: form.company_name.trim() || null,
      contact_name: form.contact_name.trim() || "—",
      email: form.email.trim() || "",
      phone: form.phone.trim() || null,
      notes: form.notes.trim() || null,
      status: form.status.trim() || "active",
    };
    const promise = editingId
      ? updateAdminLandlord(editingId, body)
      : createAdminLandlord(body);
    promise
      .then(() => {
        setFormOpen(false);
        load();
      })
      .catch((e) => setError(e.message || "Speichern fehlgeschlagen."))
      .finally(() => setSaving(false));
  };

  if (loading) {
    return <p>Lade Verwaltungen …</p>;
  }

  return (
    <div style={{ padding: "0 8px" }}>
      <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "16px" }}>
        Verwaltungen / Vermieter (Landlords)
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
          + Neue Verwaltung
        </button>
      </div>

      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>Firma / Name</th>
            <th style={thStyle}>Kontakt</th>
            <th style={thStyle}>E-Mail</th>
            <th style={thStyle}>Status</th>
            <th style={thStyle}></th>
          </tr>
        </thead>
        <tbody>
          {landlords.length === 0 ? (
            <tr>
              <td colSpan={5} style={{ ...tdStyle, color: "#64748B" }}>
                Noch keine Einträge. Erstellen Sie eine neue Verwaltung.
              </td>
            </tr>
          ) : (
            landlords.map((row) => (
              <tr key={row.id}>
                <td style={tdStyle}>{row.company_name || "—"}</td>
                <td style={tdStyle}>{row.contact_name || "—"}</td>
                <td style={tdStyle}>{row.email || "—"}</td>
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
              boxShadow: "0 10px 40px rgba(0,0,0,0.15)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginBottom: "16px", fontSize: "18px" }}>
              {editingId ? "Verwaltung bearbeiten" : "Neue Verwaltung"}
            </h3>
            <form onSubmit={handleSubmit} style={{ display: "grid", gap: "12px" }}>
              <div>
                <label style={labelStyle}>Firma (optional)</label>
                <input
                  type="text"
                  value={form.company_name}
                  onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))}
                  style={inputStyle}
                  placeholder="z.B. ABC Immobilien AG"
                />
              </div>
              <div>
                <label style={labelStyle}>Kontaktperson (optional)</label>
                <input
                  type="text"
                  value={form.contact_name}
                  onChange={(e) => setForm((f) => ({ ...f, contact_name: e.target.value }))}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>E-Mail *</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  style={inputStyle}
                  required
                />
              </div>
              <div>
                <label style={labelStyle}>Telefon (optional)</label>
                <input
                  type="text"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
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

export default AdminLandlordsPage;
