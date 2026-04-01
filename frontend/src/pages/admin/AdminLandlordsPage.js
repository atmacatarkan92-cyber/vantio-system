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
const thStyle = {
  textAlign: "left",
  padding: "12px 8px",
  borderBottom: "1px solid rgba(255,255,255,0.05)",
  background: "#111520",
  color: "#6b7a9a",
  fontSize: "9px",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.8px",
};
const tdStyle = {
  padding: "12px 8px",
  borderBottom: "1px solid rgba(255,255,255,0.05)",
  color: "#eef2ff",
};
const inputStyle = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: "8px",
  border: "1px solid rgba(255,255,255,0.08)",
  background: "#111520",
  color: "#eef2ff",
};
const labelStyle = { display: "block", marginBottom: "4px", fontSize: "10px", fontWeight: 500, color: "#6b7a9a" };

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
  background: "#141824",
  border: "1px solid rgba(255,255,255,0.07)",
  borderRadius: "14px",
  padding: "20px",
};

const toolbarFieldLabelStyle = {
  display: "block",
  fontSize: "10px",
  color: "#6b7a9a",
  marginBottom: "8px",
  fontWeight: 500,
};

const toolbarInputStyle = {
  width: "100%",
  height: "44px",
  borderRadius: "8px",
  border: "1px solid rgba(255,255,255,0.08)",
  padding: "0 14px",
  fontSize: "14px",
  boxSizing: "border-box",
  background: "#111520",
  color: "#eef2ff",
};

const toolbarSelectStyle = {
  width: "100%",
  minWidth: "160px",
  height: "44px",
  borderRadius: "8px",
  border: "1px solid rgba(255,255,255,0.08)",
  padding: "0 12px",
  fontSize: "14px",
  boxSizing: "border-box",
  background: "#111520",
  color: "#eef2ff",
};

const toolbarPrimaryButtonStyle = {
  height: "44px",
  padding: "0 18px",
  borderRadius: "8px",
  border: "none",
  background: "linear-gradient(to right, #5b8cff, #7c5cfc)",
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
    return (
      <div className="min-h-[40vh] bg-[#07090f] px-4 py-8 text-[#6b7a9a]">
        Lade Verwaltungen …
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#07090f] px-4 py-6 text-[#eef2ff]">
      <h2 className="mb-6 text-[22px] font-bold">Verwaltungen / Vermieter (Landlords)</h2>

      <div className="mb-5 grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
        <div className="relative overflow-hidden rounded-[14px] border border-white/[0.07] border-t-4 border-t-[#7aaeff] bg-[#141824] p-5">
          <p className="text-[9px] font-bold uppercase tracking-[1px] text-[#6b7a9a]">Verwaltungen gesamt</p>
          <p className="mt-2 text-[24px] font-bold text-[#eef2ff]">{kpiSummary.total}</p>
          <p className="mt-2 text-[11px] text-[#6b7a9a]">Alle erfassten Verwaltungen</p>
        </div>

        <div className="relative overflow-hidden rounded-[14px] border border-white/[0.07] border-t-4 border-t-[#4ade80] bg-[#141824] p-5">
          <p className="text-[9px] font-bold uppercase tracking-[1px] text-[#6b7a9a]">Aktiv</p>
          <p className="mt-2 text-[24px] font-bold text-[#4ade80]">{kpiSummary.active}</p>
          <p className="mt-2 text-[11px] text-[#6b7a9a]">Status aktiv, nicht archiviert</p>
        </div>

        <div className="relative overflow-hidden rounded-[14px] border border-white/[0.07] border-t-4 border-t-[#fb923c] bg-[#141824] p-5">
          <p className="text-[9px] font-bold uppercase tracking-[1px] text-[#6b7a9a]">Archiviert</p>
          <p className="mt-2 text-[24px] font-bold text-[#fb923c]">{kpiSummary.archived}</p>
          <p className="mt-2 text-[11px] text-[#6b7a9a]">Soft-deleted / archiviert</p>
        </div>

        <div className="relative overflow-hidden rounded-[14px] border border-white/[0.07] border-t-4 border-t-[#a78bfa] bg-[#141824] p-5">
          <p className="text-[9px] font-bold uppercase tracking-[1px] text-[#6b7a9a]">Mit Objekten</p>
          <p className="mt-2 text-[24px] font-bold text-[#7aaeff]">{kpiSummary.withProperties}</p>
          <p className="mt-2 text-[11px] text-[#6b7a9a]">Mit Liegenschaft verknüpft</p>
        </div>
      </div>

      {error && (
        <p className="mb-3 text-[14px] text-[#f87171]">{error}</p>
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

      <div className="overflow-hidden rounded-[14px] border border-white/[0.07] bg-[#141824]">
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
              <td colSpan={5} style={{ ...tdStyle, color: "#6b7a9a" }}>
                Noch keine Einträge. Erstellen Sie eine neue Verwaltung.
              </td>
            </tr>
          ) : displayLandlords.length === 0 ? (
            <tr>
              <td colSpan={5} style={{ ...tdStyle, color: "#6b7a9a" }}>
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
                      className="font-semibold text-[#7aaeff] no-underline hover:underline"
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
                            border: "1px solid rgba(255,255,255,0.1)",
                            background: "transparent",
                            borderRadius: "8px",
                            cursor: "pointer",
                            color: "#8090b0",
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
                      className="inline-block rounded-[8px] border border-white/[0.1] bg-transparent px-3 py-2 text-[13px] font-semibold text-[#8090b0] no-underline hover:bg-white/[0.04]"
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
      </div>

      {formOpen && (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60"
          onClick={() => !saving && setFormOpen(false)}
        >
          <div
            className="w-full max-w-[480px] rounded-[14px] border border-white/[0.07] bg-[#141824] p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-1 text-[18px] font-bold text-[#eef2ff]">
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
                  <p className="mt-1.5 text-xs text-[#6b7a9a]">PLZ nicht gefunden</p>
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
                    className="self-start rounded-[8px] border border-white/[0.1] bg-transparent px-3 py-2 text-xs font-semibold text-[#8090b0] hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-50"
                    style={{
                      cursor: saving || addressCheckBusy ? "not-allowed" : "pointer",
                    }}
                  >
                    {addressCheckBusy ? "…" : "Adresse prüfen"}
                  </button>
                </div>
                <p className="m-0 text-xs text-[#6b7a9a]">
                  Öffnet Google Maps in einem neuen Tab. Der Kanton wird im Hintergrund ergänzt, wenn die
                  Abfrage einen Wert liefert.
                </p>
                {cantonHint ? (
                  <p className="m-0 text-xs text-[#6b7a9a]">{cantonHint}</p>
                ) : null}
              </div>
              <div>
                <label style={labelStyle}>Kanton</label>
                <p className="mb-1.5 text-xs font-normal text-[#6b7a9a]">
                  Optional — oft nach «Adresse prüfen» gesetzt; manuelle Auswahl möglich.
                </p>
                <select
                  value={form.canton || ""}
                  onChange={(e) => setForm((f) => ({ ...f, canton: e.target.value }))}
                  disabled={cantonLockedByPlz}
                  style={{
                    ...inputStyle,
                    ...(cantonLockedByPlz ? { opacity: 0.85 } : {}),
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
              <div className="mt-2 flex gap-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-[8px] border-none bg-gradient-to-r from-[#5b8cff] to-[#7c5cfc] px-4 py-2.5 font-semibold text-white hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {saving ? "Speichern …" : "Speichern"}
                </button>
                <button
                  type="button"
                  onClick={() => !saving && setFormOpen(false)}
                  className="rounded-[8px] border border-white/[0.1] bg-transparent px-4 py-2.5 font-semibold text-[#8090b0] hover:bg-white/[0.04]"
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
