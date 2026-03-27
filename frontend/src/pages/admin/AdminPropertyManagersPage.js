import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  fetchAdminPropertyManagers,
  fetchAdminLandlords,
  createAdminPropertyManager,
  patchAdminPropertyManager,
} from "../../api/adminData";

function formatDate(dateString) {
  if (!dateString) return "—";

  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;

  return date.toLocaleDateString("de-CH", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function landlordLabel(l) {
  const c = String(l.company_name || "").trim();
  const n = String(l.contact_name || "").trim();
  if (c && n) return `${c} — ${n}`;
  return c || n || String(l.email || "").trim() || l.id;
}

function getCardStyle(accentColor) {
  return {
    background: "#FFFFFF",
    border: "1px solid #E5E7EB",
    borderTop: `4px solid ${accentColor}`,
    borderRadius: "18px",
    padding: "20px",
    boxShadow: "0 4px 14px rgba(15, 23, 42, 0.04)",
  };
}

function AdminPropertyManagersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinkHandled = useRef(false);
  const [items, setItems] = useState([]);
  const [landlords, setLandlords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    landlord_id: "",
  });
  const [saving, setSaving] = useState(false);

  const landlordById = useMemo(() => {
    const m = new Map();
    landlords.forEach((l) => m.set(l.id, l));
    return m;
  }, [landlords]);

  const load = (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    setError("");
    Promise.all([fetchAdminPropertyManagers(), fetchAdminLandlords()])
      .then(([pms, lls]) => {
        setItems(Array.isArray(pms) ? pms : []);
        setLandlords(Array.isArray(lls) ? lls : []);
      })
      .catch((e) => {
        setError(e.message || "Fehler beim Laden.");
        setItems([]);
        setLandlords([]);
      })
      .finally(() => {
        if (showSpinner) setLoading(false);
      });
  };

  useEffect(() => {
    load(true);
  }, []);

  const editParam = searchParams.get("edit");
  useEffect(() => {
    deepLinkHandled.current = false;
  }, [editParam]);

  useEffect(() => {
    if (loading) return;
    const editId = searchParams.get("edit");
    if (!editId || deepLinkHandled.current) return;

    const row = items.find((x) => String(x.id) === String(editId));
    deepLinkHandled.current = true;
    if (row) {
      setError("");
      setEditingId(row.id);
      setForm({
        name: row.name || "",
        email: row.email || "",
        phone: row.phone || "",
        landlord_id: row.landlord_id || "",
      });
      setFormOpen(true);
    }
    setSearchParams({}, { replace: true });
  }, [loading, items, searchParams, setSearchParams]);

  const openCreate = () => {
    setError("");
    setEditingId(null);
    setForm({
      name: "",
      email: "",
      phone: "",
      landlord_id: "",
    });
    setFormOpen(true);
  };

  const openEdit = (row) => {
    setError("");
    setEditingId(row.id);
    setForm({
      name: row.name || "",
      email: row.email || "",
      phone: row.phone || "",
      landlord_id: row.landlord_id || "",
    });
    setFormOpen(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    const body = {
      name: form.name.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      landlord_id: form.landlord_id.trim() || null,
    };
    const promise = editingId
      ? patchAdminPropertyManager(editingId, body)
      : createAdminPropertyManager(body);
    promise
      .then(() => {
        setFormOpen(false);
        load(false);
      })
      .catch((err) => setError(err.message || "Speichern fehlgeschlagen."))
      .finally(() => setSaving(false));
  };

  const filteredRows = useMemo(() => {
    let result = [...items];
    const term = searchTerm.toLowerCase().trim();
    if (!term) return result;
    return result.filter((item) => {
      const ll = item.landlord_id ? landlordById.get(item.landlord_id) : null;
      const landlordStr = ll ? landlordLabel(ll) : "";
      const blob = `${item.name || ""} ${item.email || ""} ${item.phone || ""} ${landlordStr}`.toLowerCase();
      return blob.includes(term);
    });
  }, [items, searchTerm, landlordById]);

  const summary = useMemo(() => {
    const totalCount = items.length;
    const withLandlord = items.filter((i) => i.landlord_id).length;
    const withEmail = items.filter((i) => String(i.email || "").trim()).length;
    const withoutLandlord = totalCount - withLandlord;
    return { totalCount, withLandlord, withEmail, withoutLandlord };
  }, [items]);

  if (loading) {
    return (
      <div style={{ padding: "24px" }}>
        <p style={{ color: "#64748B" }}>Lade Bewirtschafter …</p>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: "24px" }}>
      <div>
        <div
          style={{
            fontSize: "12px",
            color: "#f97316",
            fontWeight: 700,
            marginBottom: "8px",
          }}
        >
          FeelAtHomeNow Admin
        </div>

        <h2 style={{ fontSize: "36px", fontWeight: 800, margin: 0 }}>
          Bewirtschafter
        </h2>

        <p style={{ color: "#64748B", marginTop: "10px" }}>
          Verwaltung von Bewirtschafter-Kontakten (PostgreSQL).
        </p>
      </div>

      {error && (
        <div
          style={{
            background: "#FEF2F2",
            border: "1px solid #FECACA",
            borderRadius: "12px",
            padding: "12px 16px",
            color: "#B91C1C",
            fontSize: "14px",
          }}
        >
          {error}
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "16px",
        }}
      >
        <div style={getCardStyle("#334155")}>
          <div style={{ fontSize: "13px", color: "#64748B", marginBottom: "8px" }}>
            Bewirtschafter gesamt
          </div>
          <div style={{ fontSize: "34px", fontWeight: 800, color: "#0F172A" }}>
            {summary.totalCount}
          </div>
          <div style={{ marginTop: "8px", color: "#64748B", fontSize: "14px" }}>
            Alle erfassten Kontakte
          </div>
        </div>

        <div style={getCardStyle("#16A34A")}>
          <div style={{ fontSize: "13px", color: "#64748B", marginBottom: "8px" }}>
            Mit Verwaltung
          </div>
          <div style={{ fontSize: "34px", fontWeight: 800, color: "#166534" }}>
            {summary.withLandlord}
          </div>
          <div style={{ marginTop: "8px", color: "#64748B", fontSize: "14px" }}>
            Verwaltung verknüpft
          </div>
        </div>

        <div style={getCardStyle("#F59E0B")}>
          <div style={{ fontSize: "13px", color: "#64748B", marginBottom: "8px" }}>
            Ohne Verwaltung
          </div>
          <div style={{ fontSize: "34px", fontWeight: 800, color: "#92400E" }}>
            {summary.withoutLandlord}
          </div>
          <div style={{ marginTop: "8px", color: "#64748B", fontSize: "14px" }}>
            Noch keine Verwaltung
          </div>
        </div>

        <div style={getCardStyle("#2563EB")}>
          <div style={{ fontSize: "13px", color: "#64748B", marginBottom: "8px" }}>
            Mit E-Mail
          </div>
          <div style={{ fontSize: "34px", fontWeight: 800, color: "#1D4ED8" }}>
            {summary.withEmail}
          </div>
          <div style={{ marginTop: "8px", color: "#64748B", fontSize: "14px" }}>
            E-Mail hinterlegt
          </div>
        </div>
      </div>

      <div
        style={{
          background: "#FFFFFF",
          border: "1px solid #E5E7EB",
          borderRadius: "18px",
          padding: "20px",
          boxShadow: "0 4px 14px rgba(15, 23, 42, 0.04)",
        }}
      >
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "16px",
            alignItems: "flex-end",
            justifyContent: "space-between",
          }}
        >
          <div style={{ flex: "1 1 280px", minWidth: 0 }}>
            <label
              style={{
                display: "block",
                fontSize: "12px",
                color: "#64748B",
                marginBottom: "8px",
                fontWeight: 600,
              }}
            >
              Suche
            </label>
            <input
              type="text"
              placeholder="Nach Name, E-Mail, Telefon oder Verwaltung suchen"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: "100%",
                height: "44px",
                borderRadius: "12px",
                border: "1px solid #D1D5DB",
                padding: "0 14px",
                fontSize: "14px",
              }}
            />
          </div>
          <button
            type="button"
            onClick={openCreate}
            style={{
              height: "44px",
              padding: "0 18px",
              borderRadius: "12px",
              border: "none",
              background: "#0F172A",
              color: "#FFF",
              fontWeight: 600,
              fontSize: "14px",
              cursor: "pointer",
            }}
          >
            + Neuer Bewirtschafter
          </button>
        </div>
      </div>

      <div
        style={{
          background: "#FFFFFF",
          border: "1px solid #E5E7EB",
          borderRadius: "18px",
          padding: "20px",
          overflowX: "auto",
          boxShadow: "0 4px 14px rgba(15, 23, 42, 0.04)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "16px",
          }}
        >
          <h3 style={{ fontSize: "20px", fontWeight: 700, margin: 0 }}>
            Bewirtschafterübersicht
          </h3>

          <div style={{ fontSize: "14px", color: "#64748B" }}>
            {filteredRows.length} Einträge
          </div>
        </div>

        {filteredRows.length === 0 ? (
          <p style={{ color: "#64748B" }}>Keine Bewirtschafter gefunden.</p>
        ) : (
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "14px",
            }}
          >
            <thead>
              <tr
                style={{
                  textAlign: "left",
                  borderBottom: "1px solid #E5E7EB",
                  color: "#64748B",
                }}
              >
                <th style={{ padding: "12px" }}>Name</th>
                <th style={{ padding: "12px" }}>E-Mail</th>
                <th style={{ padding: "12px" }}>Telefon</th>
                <th style={{ padding: "12px" }}>Verwaltung</th>
                <th style={{ padding: "12px" }}>Erstellt</th>
                <th style={{ padding: "12px" }}></th>
              </tr>
            </thead>

            <tbody>
              {filteredRows.map((item) => {
                const ll = item.landlord_id ? landlordById.get(item.landlord_id) : null;
                return (
                  <tr key={item.id} style={{ borderBottom: "1px solid #F1F5F9" }}>
                    <td style={{ padding: "12px", fontWeight: 700, color: "#0F172A" }}>
                      {item.name || "—"}
                    </td>
                    <td style={{ padding: "12px" }}>{item.email || "—"}</td>
                    <td style={{ padding: "12px" }}>{item.phone || "—"}</td>
                    <td style={{ padding: "12px", fontWeight: 600 }}>
                      {ll ? landlordLabel(ll) : "—"}
                    </td>
                    <td style={{ padding: "12px" }}>{formatDate(item.created_at)}</td>
                    <td style={{ padding: "12px" }}>
                      <button
                        type="button"
                        onClick={() => openEdit(item)}
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
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {formOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "16px",
          }}
          onClick={() => !saving && setFormOpen(false)}
        >
          <div
            style={{
              background: "#FFF",
              padding: "24px",
              borderRadius: "18px",
              maxWidth: "440px",
              width: "100%",
              boxShadow: "0 10px 40px rgba(0,0,0,0.15)",
              border: "1px solid #E5E7EB",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginBottom: "16px", fontSize: "20px", fontWeight: 700 }}>
              {editingId ? "Bewirtschafter bearbeiten" : "Neuer Bewirtschafter"}
            </h3>
            <form onSubmit={handleSubmit} style={{ display: "grid", gap: "14px" }}>
              <div>
                <label
                  style={{
                    display: "block",
                    marginBottom: "6px",
                    fontSize: "13px",
                    fontWeight: 600,
                    color: "#475569",
                  }}
                >
                  Name *
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  required
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: "12px",
                    border: "1px solid #D1D5DB",
                    fontSize: "14px",
                  }}
                />
              </div>
              <div>
                <label
                  style={{
                    display: "block",
                    marginBottom: "6px",
                    fontSize: "13px",
                    fontWeight: 600,
                    color: "#475569",
                  }}
                >
                  E-Mail (optional)
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: "12px",
                    border: "1px solid #D1D5DB",
                    fontSize: "14px",
                  }}
                />
              </div>
              <div>
                <label
                  style={{
                    display: "block",
                    marginBottom: "6px",
                    fontSize: "13px",
                    fontWeight: 600,
                    color: "#475569",
                  }}
                >
                  Telefon (optional)
                </label>
                <input
                  type="text"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: "12px",
                    border: "1px solid #D1D5DB",
                    fontSize: "14px",
                  }}
                />
              </div>
              <div>
                <label
                  style={{
                    display: "block",
                    marginBottom: "6px",
                    fontSize: "13px",
                    fontWeight: 600,
                    color: "#475569",
                  }}
                >
                  Verwaltung (optional)
                </label>
                <select
                  value={form.landlord_id}
                  onChange={(e) => setForm((f) => ({ ...f, landlord_id: e.target.value }))}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: "12px",
                    border: "1px solid #D1D5DB",
                    fontSize: "14px",
                    background: "#fff",
                  }}
                >
                  <option value="">— Keine Auswahl</option>
                  {landlords.map((l) => (
                    <option key={l.id} value={l.id}>
                      {landlordLabel(l)}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ display: "flex", gap: "10px", marginTop: "8px" }}>
                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    flex: 1,
                    padding: "12px",
                    borderRadius: "12px",
                    border: "none",
                    background: "#EA580C",
                    color: "#FFF",
                    fontWeight: 600,
                    cursor: saving ? "wait" : "pointer",
                  }}
                >
                  {saving ? "Speichern…" : "Speichern"}
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setFormOpen(false)}
                  style={{
                    padding: "12px 16px",
                    borderRadius: "12px",
                    border: "1px solid #E2E8F0",
                    background: "#F8FAFC",
                    fontWeight: 600,
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

export default AdminPropertyManagersPage;
