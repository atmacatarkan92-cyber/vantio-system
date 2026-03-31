import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { buildGoogleMapsSearchUrl, formatLandlordAddressLine } from "../../utils/googleMapsUrl";

const tableStyle = { width: "100%", borderCollapse: "collapse" };
const thStyle = { textAlign: "left", padding: "12px 8px", borderBottom: "2px solid #E5E7EB" };
const tdStyle = { padding: "12px 8px", borderBottom: "1px solid #E5E7EB" };
const inputStyle = { width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid #E5E7EB" };
const labelStyle = { display: "block", marginBottom: "4px", fontSize: "13px", fontWeight: 600 };

function getKpiCardStyle(accentColor) {
  return {
    background: "#FFFFFF",
    border: "1px solid #E5E7EB",
    borderTop: `4px solid ${accentColor}`,
    borderRadius: "18px",
    padding: "20px",
    boxShadow: "0 4px 14px rgba(15, 23, 42, 0.04)",
  };
}

function landlordHasLinkedProperties(l) {
  if (!l || typeof l !== "object") return false;
  const plen = l.properties?.length;
  if (typeof plen === "number" && plen > 0) return true;
  const n =
    l.property_count ??
    l.properties_count ??
    l.linked_property_count ??
    l.linked_properties_count;
  if (typeof n === "number" && n > 0) return true;
  return false;
}

function landlordSearchBlob(l) {
  if (!l || typeof l !== "object") return "";
  const parts = [
    l.company_name,
    l.contact_name,
    l.email,
    l.phone,
    l.address_line1,
    l.postal_code,
    l.city,
    l.canton,
    l.website,
    l.notes,
  ];
  try {
    return parts
      .map((x) => (x != null ? String(x) : ""))
      .join(" ")
      .toLowerCase();
  } catch {
    return "";
  }
}

const toolbarCardStyle = {
  background: "#FFFFFF",
  border: "1px solid #E5E7EB",
  borderRadius: "18px",
  padding: "20px",
  boxShadow: "0 4px 14px rgba(15, 23, 42, 0.04)",
};

const toolbarFieldLabelStyle = {
  display: "block",
  fontSize: "12px",
  color: "#64748B",
  marginBottom: "8px",
  fontWeight: 600,
};

const toolbarInputStyle = {
  width: "100%",
  height: "44px",
  borderRadius: "12px",
  border: "1px solid #D1D5DB",
  padding: "0 14px",
  fontSize: "14px",
  boxSizing: "border-box",
};

const toolbarSelectStyle = {
  width: "100%",
  minWidth: "160px",
  height: "44px",
  borderRadius: "12px",
  border: "1px solid #D1D5DB",
  padding: "0 12px",
  fontSize: "14px",
  boxSizing: "border-box",
  background: "#FFFFFF",
  color: "#0F172A",
};

const toolbarPrimaryButtonStyle = {
  height: "44px",
  padding: "0 18px",
  borderRadius: "12px",
  border: "none",
  background: "#0F172A",
  color: "#FFF",
  fontWeight: 600,
  fontSize: "14px",
  cursor: "pointer",
};

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
  const [searchTerm, setSearchTerm] = useState("");
  const [addressCheckBusy, setAddressCheckBusy] = useState(false);
  const [cantonHint, setCantonHint] = useState("");
  const [cantonLockedByPlz, setCantonLockedByPlz] = useState(false);
  const [plzNotFound, setPlzNotFound] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    fetchAdminLandlords("all")
      .then(setLandlords)
      .catch((e) => setError(e.message || "Fehler beim Laden."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filteredLandlords = useMemo(() => {
    if (!Array.isArray(landlords)) return [];
    if (listFilter === "active") return landlords.filter((l) => !l.deleted_at);
    if (listFilter === "archived") return landlords.filter((l) => l.deleted_at);
    return landlords;
  }, [landlords, listFilter]);

  const displayLandlords = useMemo(() => {
    if (!Array.isArray(filteredLandlords)) return [];
    const term = searchTerm.trim().toLowerCase();
    if (!term) return filteredLandlords;
    return filteredLandlords.filter((l) => {
      try {
        return landlordSearchBlob(l).includes(term);
      } catch {
        return false;
      }
    });
  }, [filteredLandlords, searchTerm]);

  const kpiSummary = useMemo(() => {
    const arr = Array.isArray(landlords) ? landlords : [];
    const total = arr.length;
    const archived = arr.filter((l) => l.deleted_at).length;
    const active = arr.filter((l) => {
      if (l.deleted_at) return false;
      const st = String(l.status || "active").toLowerCase();
      return st === "active";
    }).length;
    const withProperties = arr.filter(landlordHasLinkedProperties).length;
    return { total, active, archived, withProperties };
  }, [landlords]);

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

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "16px",
          marginBottom: "20px",
        }}
      >
        <div style={getKpiCardStyle("#334155")}>
          <div style={{ fontSize: "13px", color: "#64748B", marginBottom: "8px" }}>
            Verwaltungen gesamt
          </div>
          <div style={{ fontSize: "34px", fontWeight: 800, color: "#0F172A" }}>{kpiSummary.total}</div>
          <div style={{ marginTop: "8px", color: "#64748B", fontSize: "14px" }}>
            Alle erfassten Verwaltungen
          </div>
        </div>

        <div style={getKpiCardStyle("#16A34A")}>
          <div style={{ fontSize: "13px", color: "#64748B", marginBottom: "8px" }}>Aktiv</div>
          <div style={{ fontSize: "34px", fontWeight: 800, color: "#166534" }}>{kpiSummary.active}</div>
          <div style={{ marginTop: "8px", color: "#64748B", fontSize: "14px" }}>
            Status aktiv, nicht archiviert
          </div>
        </div>

        <div style={getKpiCardStyle("#EA580C")}>
          <div style={{ fontSize: "13px", color: "#64748B", marginBottom: "8px" }}>Archiviert</div>
          <div style={{ fontSize: "34px", fontWeight: 800, color: "#C2410C" }}>{kpiSummary.archived}</div>
          <div style={{ marginTop: "8px", color: "#64748B", fontSize: "14px" }}>
            Soft-deleted / archiviert
          </div>
        </div>

        <div style={getKpiCardStyle("#2563EB")}>
          <div style={{ fontSize: "13px", color: "#64748B", marginBottom: "8px" }}>Mit Objekten</div>
          <div style={{ fontSize: "34px", fontWeight: 800, color: "#1D4ED8" }}>
            {kpiSummary.withProperties}
          </div>
          <div style={{ marginTop: "8px", color: "#64748B", fontSize: "14px" }}>
            Mit Liegenschaft verknüpft
          </div>
        </div>
      </div>

      {error && (
        <p style={{ color: "#B91C1C", marginBottom: "12px", fontSize: "14px" }}>{error}</p>
      )}

      <div style={{ ...toolbarCardStyle, marginBottom: "20px" }}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "16px",
            alignItems: "flex-end",
            justifyContent: "space-between",
          }}
        >
          <div
            style={{
              flex: "1 1 280px",
              minWidth: 0,
              display: "flex",
              flexWrap: "wrap",
              gap: "16px",
              alignItems: "flex-end",
            }}
          >
            <div style={{ flex: "1 1 220px", minWidth: 0 }}>
              <label htmlFor="admin-landlords-search" style={toolbarFieldLabelStyle}>
                Suche
              </label>
              <input
                id="admin-landlords-search"
                type="search"
                autoComplete="off"
                placeholder="Nach Name, E-Mail, Telefon oder Verwaltung suchen"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={toolbarInputStyle}
              />
            </div>
            <div style={{ flex: "0 1 180px", minWidth: "min(100%, 160px)" }}>
              <label htmlFor="admin-landlords-anzeige" style={toolbarFieldLabelStyle}>
                Anzeige
              </label>
              <select
                id="admin-landlords-anzeige"
                value={listFilter}
                onChange={(e) => setListFilter(e.target.value)}
                style={toolbarSelectStyle}
                aria-label="Anzeige"
              >
                <option value="active">Aktiv</option>
                <option value="archived">Archiviert</option>
                <option value="all">Alle</option>
              </select>
            </div>
          </div>
          <button type="button" onClick={openCreate} style={toolbarPrimaryButtonStyle}>
            + Neue Verwaltung
          </button>
        </div>
      </div>

      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>Firma / Name</th>
            <th style={thStyle}>Adresse</th>
            <th style={thStyle}>E-Mail</th>
            <th style={thStyle}>Status</th>
            <th style={thStyle}>Aktionen</th>
          </tr>
        </thead>
        <tbody>
          {filteredLandlords.length === 0 ? (
            <tr>
              <td colSpan={5} style={{ ...tdStyle, color: "#64748B" }}>
                Noch keine Einträge. Erstellen Sie eine neue Verwaltung.
              </td>
            </tr>
          ) : displayLandlords.length === 0 ? (
            <tr>
              <td colSpan={5} style={{ ...tdStyle, color: "#64748B" }}>
                Keine Verwaltungen für diese Suche gefunden.
              </td>
            </tr>
          ) : (
            displayLandlords.map((row) => {
              const addrDisplay = formatLandlordAddressLine(row);
              const canOpenMap = addrDisplay !== "—";
              return (
                <tr key={row.id}>
                  <td style={tdStyle}>
                    <Link
                      to={`/admin/landlords/${row.id}`}
                      style={{ color: "#0F172A", fontWeight: 600, textDecoration: "none" }}
                    >
                      {row.company_name?.trim() || row.contact_name?.trim() || "—"}
                    </Link>
                  </td>
                  <td style={tdStyle}>
                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                        flexWrap: "wrap",
                        maxWidth: "100%",
                      }}
                    >
                      <span style={{ minWidth: 0 }}>{addrDisplay}</span>
                      {canOpenMap ? (
                        <button
                          type="button"
                          title="In Google Maps öffnen"
                          aria-label="In Google Maps öffnen"
                          onClick={() =>
                            window.open(
                              buildGoogleMapsSearchUrl(row.address_line1, row.postal_code, row.city),
                              "_blank",
                              "noopener,noreferrer"
                            )
                          }
                          style={{
                            flexShrink: 0,
                            padding: "2px",
                            margin: 0,
                            border: "none",
                            background: "transparent",
                            borderRadius: "6px",
                            cursor: "pointer",
                            color: "#64748B",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            verticalAlign: "middle",
                          }}
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
                  </td>
                  <td style={tdStyle}>{row.email || "—"}</td>
                  <td style={tdStyle}>
                    {row.deleted_at ? "Archiviert" : row.status === "inactive" ? "Inaktiv" : "Aktiv"}
                  </td>
                  <td style={tdStyle}>
                    <Link
                      to={`/admin/landlords/${row.id}`}
                      style={{
                        display: "inline-block",
                        padding: "6px 12px",
                        background: "#F1F5F9",
                        border: "1px solid #E2E8F0",
                        borderRadius: "6px",
                        fontSize: "13px",
                        fontWeight: 600,
                        color: "#0F172A",
                        textDecoration: "none",
                      }}
                    >
                      Öffnen
                    </Link>
                  </td>
                </tr>
              );
            })
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
