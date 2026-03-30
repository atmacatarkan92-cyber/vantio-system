import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  fetchAdminLandlords,
  fetchAdminLandlord,
  createAdminLandlord,
  updateAdminLandlord,
  verifyAdminAddress,
} from "../../api/adminData";
import { SWISS_CANTON_CODES } from "../../constants/swissCantons";
import { lookupSwissPlz } from "../../data/swissPlzLookup";

const tableStyle = { width: "100%", borderCollapse: "collapse" };
const thStyle = { textAlign: "left", padding: "12px 8px", borderBottom: "2px solid #E5E7EB" };
const tdStyle = { padding: "12px 8px", borderBottom: "1px solid #E5E7EB" };
const inputStyle = { width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid #E5E7EB" };
const labelStyle = { display: "block", marginBottom: "4px", fontSize: "13px", fontWeight: 600 };

/** Build Google Maps search URL (new tab) from address parts — no backend call. */
function buildGoogleMapsSearchUrl(addressLine1, postalCode, city) {
  const a1 = (addressLine1 || "").trim();
  const plz = (postalCode || "").trim();
  const c = (city || "").trim();
  const line2 = [plz, c].filter(Boolean).join(" ");
  const parts = [a1, line2].filter(Boolean);
  const q = parts.join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

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
    address_line1: "",
    postal_code: "",
    city: "",
    canton: "",
    website: "",
    notes: "",
    status: "active",
  });
  const [saving, setSaving] = useState(false);
  const [listFilter, setListFilter] = useState("active");
  const [addressCheckBusy, setAddressCheckBusy] = useState(false);
  const [cantonHint, setCantonHint] = useState("");
  const [cantonLockedByPlz, setCantonLockedByPlz] = useState(false);
  const [plzNotFound, setPlzNotFound] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    fetchAdminLandlords(listFilter)
      .then(setLandlords)
      .catch((e) => setError(e.message || "Fehler beim Laden."))
      .finally(() => setLoading(false));
  }, [listFilter]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setCantonHint("");
  }, [form.address_line1, form.postal_code, form.city]);

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
      setCantonLockedByPlz(false);
      setPlzNotFound(false);
      setEditingId(row.id);
      setForm({
        company_name: row.company_name || "",
        contact_name: row.contact_name || "",
        email: row.email || "",
        phone: row.phone || "",
        address_line1: row.address_line1 || "",
        postal_code: row.postal_code || "",
        city: row.city || "",
        canton: row.canton || "",
        website: row.website || "",
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
    setCantonLockedByPlz(false);
    setPlzNotFound(false);
    setForm({
      company_name: "",
      contact_name: "",
      email: "",
      phone: "",
      address_line1: "",
      postal_code: "",
      city: "",
      canton: "",
      website: "",
      notes: "",
      status: "active",
    });
    setFormOpen(true);
  };

  const openEdit = (row) => {
    setEditingId(row.id);
    setCantonLockedByPlz(false);
    setPlzNotFound(false);
    setForm({
      company_name: row.company_name || "",
      contact_name: row.contact_name || "",
      email: row.email || "",
      phone: row.phone || "",
      address_line1: row.address_line1 || "",
      postal_code: row.postal_code || "",
      city: row.city || "",
      canton: row.canton || "",
      website: row.website || "",
      notes: row.notes || "",
      status: row.status || "active",
    });
    setFormOpen(true);
  };

  const handlePostalCodeChange = (e) => {
    const next = e.target.value;
    const plz = next.trim();
    if (!/^\d{4}$/.test(plz)) {
      setCantonLockedByPlz(false);
      setPlzNotFound(false);
      setForm((f) => ({ ...f, postal_code: next }));
      return;
    }
    const hit = lookupSwissPlz(plz);
    if (hit) {
      setForm((f) => ({
        ...f,
        postal_code: next,
        city: hit.city,
        canton: hit.canton,
      }));
      setCantonLockedByPlz(true);
      setPlzNotFound(false);
    } else {
      setForm((f) => ({ ...f, postal_code: next }));
      setCantonLockedByPlz(false);
      setPlzNotFound(true);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setError("");
    const addr1 = form.address_line1.trim();
    const plz = form.postal_code.trim();
    const ort = form.city.trim();
    if (!addr1 || !plz || !ort) {
      setError("Bitte Adresse, PLZ und Ort ausfüllen.");
      return;
    }
    setSaving(true);
    const body = {
      company_name: form.company_name.trim() || null,
      contact_name: form.contact_name.trim() || "—",
      email: form.email.trim() || "",
      phone: form.phone.trim() || null,
      address_line1: addr1,
      postal_code: plz,
      city: ort,
      canton: form.canton.trim() || null,
      website: form.website.trim() || null,
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
      <div
        style={{
          marginBottom: "16px",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: "12px",
        }}
      >
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
        <label style={{ ...labelStyle, marginBottom: 0, display: "flex", alignItems: "center", gap: "8px" }}>
          <span>Anzeige</span>
          <select
            value={listFilter}
            onChange={(e) => setListFilter(e.target.value)}
            style={{ ...inputStyle, width: "auto", minWidth: "140px" }}
          >
            <option value="active">Aktiv</option>
            <option value="archived">Archiviert</option>
            <option value="all">Alle</option>
          </select>
        </label>
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
                <td style={tdStyle}>
                  <Link
                    to={`/admin/landlords/${row.id}`}
                    style={{ color: "#0F172A", fontWeight: 600, textDecoration: "none" }}
                  >
                    {row.company_name?.trim() || row.contact_name?.trim() || "—"}
                  </Link>
                </td>
                <td style={tdStyle}>{row.contact_name || "—"}</td>
                <td style={tdStyle}>{row.email || "—"}</td>
                <td style={tdStyle}>
                  {row.deleted_at ? "Archiviert" : row.status === "inactive" ? "Inaktiv" : "Aktiv"}
                </td>
                <td style={tdStyle}>
                  <button
                    type="button"
                    onClick={() => openEdit(row)}
                    disabled={!!row.deleted_at}
                    style={{
                      padding: "6px 12px",
                      background: row.deleted_at ? "#F8FAFC" : "#F1F5F9",
                      border: "1px solid #E2E8F0",
                      borderRadius: "6px",
                      cursor: row.deleted_at ? "not-allowed" : "pointer",
                      fontSize: "13px",
                      color: row.deleted_at ? "#94A3B8" : undefined,
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
              maxWidth: "480px",
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
                <label style={labelStyle}>Adresse *</label>
                <input
                  type="text"
                  value={form.address_line1}
                  onChange={(e) => setForm((f) => ({ ...f, address_line1: e.target.value }))}
                  style={inputStyle}
                  placeholder="Strasse Nr."
                  required
                />
              </div>
              <div>
                <label style={labelStyle}>PLZ *</label>
                <input
                  type="text"
                  value={form.postal_code}
                  onChange={handlePostalCodeChange}
                  style={inputStyle}
                  required
                />
                {plzNotFound ? (
                  <p style={{ margin: "6px 0 0 0", fontSize: "12px", color: "#94A3B8" }}>
                    PLZ nicht gefunden
                  </p>
                ) : null}
              </div>
              <div>
                <label style={labelStyle}>Ort *</label>
                <input
                  type="text"
                  value={form.city}
                  onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                  style={inputStyle}
                  required
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px" }}>
                  <button
                    type="button"
                    onClick={() => {
                      window.open(
                        buildGoogleMapsSearchUrl(form.address_line1, form.postal_code, form.city),
                        "_blank",
                        "noopener,noreferrer"
                      );
                      setAddressCheckBusy(true);
                      setCantonHint("Kanton wird ermittelt …");
                      verifyAdminAddress({
                        address_line1: form.address_line1,
                        postal_code: form.postal_code,
                        city: form.city,
                      })
                        .then((res) => {
                          const c = res?.normalized?.canton;
                          if (res?.valid && c != null && String(c).trim() !== "") {
                            const code = String(c).trim().toUpperCase();
                            setForm((f) => ({ ...f, canton: code }));
                            setCantonHint("Kanton automatisch erkannt.");
                          } else {
                            setCantonHint(
                              "Kein Kanton automatisch ermittelbar. Bitte bei Bedarf manuell wählen."
                            );
                          }
                        })
                        .catch(() =>
                          setCantonHint("Kanton konnte nicht automatisch ermittelt werden.")
                        )
                        .finally(() => setAddressCheckBusy(false));
                    }}
                    disabled={
                      saving ||
                      addressCheckBusy ||
                      !(form.address_line1 || "").trim() ||
                      !(form.postal_code || "").trim() ||
                      !(form.city || "").trim()
                    }
                    style={{
                      padding: "8px 12px",
                      background: "#FFF",
                      border: "1px solid #CBD5E1",
                      borderRadius: "8px",
                      fontWeight: 600,
                      fontSize: "13px",
                      cursor: saving || addressCheckBusy ? "not-allowed" : "pointer",
                    }}
                  >
                    {addressCheckBusy ? "…" : "Adresse prüfen"}
                  </button>
                </div>
                <p style={{ margin: 0, fontSize: "12px", color: "#64748B" }}>
                  Öffnet Google Maps in einem neuen Tab. Der Kanton wird im Hintergrund ergänzt, wenn die
                  Abfrage einen Wert liefert.
                </p>
                {cantonHint ? (
                  <p style={{ margin: 0, fontSize: "12px", color: "#64748B" }}>{cantonHint}</p>
                ) : null}
              </div>
              <div>
                <label style={labelStyle}>Kanton</label>
                <p style={{ margin: "0 0 6px 0", fontSize: "12px", color: "#64748B", fontWeight: 400 }}>
                  Optional — oft nach «Adresse prüfen» gesetzt; manuelle Auswahl möglich.
                </p>
                <select
                  value={form.canton || ""}
                  onChange={(e) => setForm((f) => ({ ...f, canton: e.target.value }))}
                  disabled={cantonLockedByPlz}
                  style={{
                    ...inputStyle,
                    ...(cantonLockedByPlz ? { background: "#F8FAFC", color: "#64748B" } : {}),
                  }}
                >
                  <option value="">—</option>
                  {form.canton && !SWISS_CANTON_CODES.includes(form.canton) ? (
                    <option value={form.canton}>{form.canton}</option>
                  ) : null}
                  {SWISS_CANTON_CODES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Website (optional)</label>
                <input
                  type="text"
                  value={form.website}
                  onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
                  style={inputStyle}
                  placeholder="https://"
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
