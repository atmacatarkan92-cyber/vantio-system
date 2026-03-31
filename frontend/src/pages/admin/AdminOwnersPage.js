import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { createAdminOwner, fetchAdminOwners, verifyAdminAddress } from "../../api/adminData";
import { SWISS_CANTON_CODES } from "../../constants/swissCantons";
import { lookupSwissPlz } from "../../data/swissPlzLookup";
import { buildGoogleMapsSearchUrl, formatLandlordAddressLine } from "../../utils/googleMapsUrl";

const modalInputStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: "12px",
  border: "1px solid #D1D5DB",
  fontSize: "14px",
};
const modalLabelStyle = {
  display: "block",
  marginBottom: "6px",
  fontSize: "13px",
  fontWeight: 600,
  color: "#475569",
};

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

function AdminOwnersPage() {
  const [items, setItems] = useState([]);
  const [ownersWithUnitsCount, setOwnersWithUnitsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [listFilter, setListFilter] = useState("active");
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    address_line1: "",
    postal_code: "",
    city: "",
    canton: "",
    status: "active",
  });
  const [saving, setSaving] = useState(false);
  const [addressCheckBusy, setAddressCheckBusy] = useState(false);
  const [cantonHint, setCantonHint] = useState("");
  const [cantonLockedByPlz, setCantonLockedByPlz] = useState(false);
  const [plzNotFound, setPlzNotFound] = useState(false);

  const load = (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    setError("");
    fetchAdminOwners()
      .then((data) => {
        setItems(Array.isArray(data.items) ? data.items : []);
        setOwnersWithUnitsCount(
          typeof data.owners_with_units_count === "number" ? data.owners_with_units_count : 0
        );
      })
      .catch((e) => {
        setError(e.message || "Fehler beim Laden.");
        setItems([]);
        setOwnersWithUnitsCount(0);
      })
      .finally(() => {
        if (showSpinner) setLoading(false);
      });
  };

  useEffect(() => {
    load(true);
  }, []);

  useEffect(() => {
    setCantonHint("");
  }, [form.address_line1, form.postal_code, form.city]);

  const openCreate = () => {
    setError("");
    setCantonLockedByPlz(false);
    setPlzNotFound(false);
    setForm({
      name: "",
      email: "",
      phone: "",
      address_line1: "",
      postal_code: "",
      city: "",
      canton: "",
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
    setSaving(true);
    setError("");
    const addr1 = form.address_line1.trim();
    const plz = form.postal_code.trim();
    const ort = form.city.trim();
    if (!addr1 || !plz || !ort) {
      setError("Bitte Adresse, PLZ und Ort ausfüllen.");
      setSaving(false);
      return;
    }
    const body = {
      name: form.name.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      address_line1: addr1,
      postal_code: plz,
      city: ort,
      canton: form.canton.trim() || null,
      status: form.status === "inactive" ? "inactive" : "active",
    };
    createAdminOwner(body)
      .then(() => {
        setFormOpen(false);
        load(false);
      })
      .catch((err) => setError(err.message || "Speichern fehlgeschlagen."))
      .finally(() => setSaving(false));
  };

  const statusFilteredItems = useMemo(() => {
    if (!Array.isArray(items)) return [];
    return items.filter((item) => {
      const s = String(item.status || "active").toLowerCase();
      if (listFilter === "active") return s !== "inactive";
      if (listFilter === "inactive") return s === "inactive";
      return true;
    });
  }, [items, listFilter]);

  const filteredRows = useMemo(() => {
    let result = [...statusFilteredItems];
    const term = searchTerm.toLowerCase().trim();
    if (!term) return result;
    return result.filter((item) => {
      const blob = `${item.name || ""} ${item.email || ""} ${item.phone || ""} ${item.address_line1 || ""} ${item.postal_code || ""} ${item.city || ""} ${item.canton || ""}`.toLowerCase();
      return blob.includes(term);
    });
  }, [statusFilteredItems, searchTerm]);

  const summary = useMemo(() => {
    const totalCount = items.length;
    const activeCount = items.filter(
      (i) => String(i.status || "active").toLowerCase() !== "inactive"
    ).length;
    const inactiveCount = items.filter((i) => String(i.status || "").toLowerCase() === "inactive").length;
    return { totalCount, activeCount, inactiveCount };
  }, [items]);

  if (loading) {
    return (
      <div style={{ padding: "24px" }}>
        <p style={{ color: "#64748B" }}>Lade Eigentümer …</p>
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
          Vantio
        </div>

        <h2 style={{ fontSize: "36px", fontWeight: 800, margin: 0 }}>Eigentümer</h2>

        <p style={{ color: "#64748B", marginTop: "10px" }}>
          Verwaltung von Eigentümer-Kontakten (CRM).
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
            Eigentümer gesamt
          </div>
          <div style={{ fontSize: "34px", fontWeight: 800, color: "#0F172A" }}>{summary.totalCount}</div>
          <div style={{ marginTop: "8px", color: "#64748B", fontSize: "14px" }}>
            Alle erfassten Kontakte
          </div>
        </div>

        <div style={getCardStyle("#16A34A")}>
          <div style={{ fontSize: "13px", color: "#64748B", marginBottom: "8px" }}>Aktiv</div>
          <div style={{ fontSize: "34px", fontWeight: 800, color: "#166534" }}>{summary.activeCount}</div>
          <div style={{ marginTop: "8px", color: "#64748B", fontSize: "14px" }}>Status aktiv</div>
        </div>

        <div style={getCardStyle("#64748B")}>
          <div style={{ fontSize: "13px", color: "#64748B", marginBottom: "8px" }}>Inaktiv</div>
          <div style={{ fontSize: "34px", fontWeight: 800, color: "#334155" }}>{summary.inactiveCount}</div>
          <div style={{ marginTop: "8px", color: "#64748B", fontSize: "14px" }}>Status inaktiv</div>
        </div>

        <div style={getCardStyle("#2563EB")}>
          <div style={{ fontSize: "13px", color: "#64748B", marginBottom: "8px" }}>Mit Units</div>
          <div style={{ fontSize: "34px", fontWeight: 800, color: "#1D4ED8" }}>{ownersWithUnitsCount}</div>
          <div style={{ marginTop: "8px", color: "#64748B", fontSize: "14px" }}>
            Mindestens eine Unit zugeordnet
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
                placeholder="Nach Name, E-Mail, Telefon oder Adresse suchen"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  width: "100%",
                  height: "44px",
                  borderRadius: "12px",
                  border: "1px solid #D1D5DB",
                  padding: "0 14px",
                  fontSize: "14px",
                  boxSizing: "border-box",
                }}
              />
            </div>
            <div style={{ flex: "0 1 180px", minWidth: "min(100%, 160px)" }}>
              <label
                htmlFor="owners-list-filter"
                style={{
                  display: "block",
                  fontSize: "12px",
                  color: "#64748B",
                  marginBottom: "8px",
                  fontWeight: 600,
                }}
              >
                Anzeige
              </label>
              <select
                id="owners-list-filter"
                value={listFilter}
                onChange={(e) => setListFilter(e.target.value)}
                aria-label="Anzeige"
                style={{
                  width: "100%",
                  height: "44px",
                  borderRadius: "12px",
                  border: "1px solid #D1D5DB",
                  padding: "0 12px",
                  fontSize: "14px",
                  boxSizing: "border-box",
                  background: "#FFFFFF",
                  color: "#0F172A",
                }}
              >
                <option value="active">Aktiv</option>
                <option value="inactive">Inaktiv</option>
                <option value="all">Alle</option>
              </select>
            </div>
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
            + Neuer Eigentümer
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
          <h3 style={{ fontSize: "20px", fontWeight: 700, margin: 0 }}>Eigentümerübersicht</h3>
          <div style={{ fontSize: "14px", color: "#64748B" }}>{filteredRows.length} Einträge</div>
        </div>

        {filteredRows.length === 0 ? (
          <p style={{ color: "#64748B" }}>Keine Eigentümer gefunden.</p>
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
                <th style={{ padding: "12px" }}>Adresse</th>
                <th style={{ padding: "12px" }}>Telefon</th>
                <th style={{ padding: "12px" }}>E-Mail</th>
                <th style={{ padding: "12px" }}>Status</th>
                <th style={{ padding: "12px", whiteSpace: "nowrap" }}>Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((item) => {
                const isActive = String(item.status || "active").toLowerCase() !== "inactive";
                const addrDisplay = formatLandlordAddressLine(item);
                const canOpenMap = addrDisplay !== "—";
                return (
                  <tr key={item.id} style={{ borderBottom: "1px solid #F1F5F9" }}>
                    <td style={{ padding: "12px" }}>
                      <Link
                        to={`/admin/owners/${encodeURIComponent(item.id)}`}
                        style={{ color: "#0F172A", fontWeight: 600, textDecoration: "none" }}
                      >
                        {item.name || "—"}
                      </Link>
                    </td>
                    <td style={{ padding: "12px" }}>
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
                                buildGoogleMapsSearchUrl(
                                  item.address_line1,
                                  item.postal_code,
                                  item.city
                                ),
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
                    <td style={{ padding: "12px" }}>{item.phone || "—"}</td>
                    <td style={{ padding: "12px" }}>{item.email || "—"}</td>
                    <td style={{ padding: "12px" }}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "4px 10px",
                          borderRadius: "999px",
                          fontSize: "12px",
                          fontWeight: 600,
                          background: isActive ? "#ECFDF5" : "#F1F5F9",
                          color: isActive ? "#166534" : "#64748B",
                          border: isActive ? "1px solid #A7F3D0" : "1px solid #E2E8F0",
                        }}
                      >
                        {isActive ? "Aktiv" : "Inaktiv"}
                      </span>
                    </td>
                    <td style={{ padding: "12px" }}>
                      <Link
                        to={`/admin/owners/${encodeURIComponent(item.id)}`}
                        style={{
                          display: "inline-block",
                          padding: "6px 12px",
                          background: "#0F172A",
                          color: "#FFF",
                          borderRadius: "6px",
                          fontSize: "13px",
                          fontWeight: 600,
                          textDecoration: "none",
                        }}
                      >
                        Öffnen
                      </Link>
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
            <h3 style={{ marginBottom: "16px", fontSize: "20px", fontWeight: 700 }}>Neuer Eigentümer</h3>
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
                  style={modalInputStyle}
                />
              </div>
              <div>
                <label style={modalLabelStyle}>Telefon (optional)</label>
                <input
                  type="text"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  style={modalInputStyle}
                />
              </div>
              <div>
                <label style={modalLabelStyle}>Adresse *</label>
                <input
                  type="text"
                  value={form.address_line1}
                  onChange={(e) => setForm((f) => ({ ...f, address_line1: e.target.value }))}
                  style={modalInputStyle}
                  placeholder="Strasse Nr."
                  required
                />
              </div>
              <div>
                <label style={modalLabelStyle}>PLZ *</label>
                <input
                  type="text"
                  value={form.postal_code}
                  onChange={handlePostalCodeChange}
                  style={modalInputStyle}
                  required
                />
                {plzNotFound ? (
                  <p style={{ margin: "6px 0 0 0", fontSize: "12px", color: "#94A3B8" }}>
                    PLZ nicht gefunden
                  </p>
                ) : null}
              </div>
              <div>
                <label style={modalLabelStyle}>Ort *</label>
                <input
                  type="text"
                  value={form.city}
                  onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                  style={modalInputStyle}
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
                <label style={modalLabelStyle}>Kanton</label>
                <p style={{ margin: "0 0 6px 0", fontSize: "12px", color: "#64748B", fontWeight: 400 }}>
                  Optional — oft nach «Adresse prüfen» gesetzt; manuelle Auswahl möglich.
                </p>
                <select
                  value={form.canton || ""}
                  onChange={(e) => setForm((f) => ({ ...f, canton: e.target.value }))}
                  disabled={cantonLockedByPlz}
                  style={{
                    ...modalInputStyle,
                    background: "#fff",
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
                <label
                  style={{
                    display: "block",
                    marginBottom: "6px",
                    fontSize: "13px",
                    fontWeight: 600,
                    color: "#475569",
                  }}
                >
                  Status
                </label>
                <select
                  value={form.status}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: "12px",
                    border: "1px solid #D1D5DB",
                    fontSize: "14px",
                    background: "#fff",
                  }}
                >
                  <option value="active">Aktiv</option>
                  <option value="inactive">Inaktiv</option>
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

export default AdminOwnersPage;
