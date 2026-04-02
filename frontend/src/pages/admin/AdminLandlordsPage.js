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
      <div className="min-h-[40vh] bg-[#f8fafc] px-4 py-8 text-[#64748b] [color-scheme:light] dark:bg-[#07090f] dark:text-[#6b7a9a] dark:[color-scheme:dark]">
        Lade Verwaltungen …
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] px-4 py-6 text-[#0f172a] [color-scheme:light] dark:bg-[#07090f] dark:text-[#eef2ff] dark:[color-scheme:dark]">
      <h2 className="mb-6 text-[22px] font-bold">Verwaltungen / Vermieter (Landlords)</h2>

      <div className="mb-5 grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
        <div className="relative overflow-hidden rounded-[14px] border border-black/10 border-t-4 border-t-[#7aaeff] bg-white p-5 dark:border-white/[0.07] dark:bg-[#141824]">
          <p className="text-[9px] font-bold uppercase tracking-[1px] text-[#64748b] dark:text-[#6b7a9a]">Verwaltungen gesamt</p>
          <p className="mt-2 text-[24px] font-bold text-[#0f172a] dark:text-[#eef2ff]">{kpiSummary.total}</p>
          <p className="mt-2 text-[11px] text-[#64748b] dark:text-[#6b7a9a]">Alle erfassten Verwaltungen</p>
        </div>

        <div className="relative overflow-hidden rounded-[14px] border border-black/10 border-t-4 border-t-[#4ade80] bg-white p-5 dark:border-white/[0.07] dark:bg-[#141824]">
          <p className="text-[9px] font-bold uppercase tracking-[1px] text-[#64748b] dark:text-[#6b7a9a]">Aktiv</p>
          <p className="mt-2 text-[24px] font-bold text-[#4ade80]">{kpiSummary.active}</p>
          <p className="mt-2 text-[11px] text-[#64748b] dark:text-[#6b7a9a]">Status aktiv, nicht archiviert</p>
        </div>

        <div className="relative overflow-hidden rounded-[14px] border border-black/10 border-t-4 border-t-[#fb923c] bg-white p-5 dark:border-white/[0.07] dark:bg-[#141824]">
          <p className="text-[9px] font-bold uppercase tracking-[1px] text-[#64748b] dark:text-[#6b7a9a]">Archiviert</p>
          <p className="mt-2 text-[24px] font-bold text-[#fb923c]">{kpiSummary.archived}</p>
          <p className="mt-2 text-[11px] text-[#64748b] dark:text-[#6b7a9a]">Soft-deleted / archiviert</p>
        </div>

        <div className="relative overflow-hidden rounded-[14px] border border-black/10 border-t-4 border-t-[#a78bfa] bg-white p-5 dark:border-white/[0.07] dark:bg-[#141824]">
          <p className="text-[9px] font-bold uppercase tracking-[1px] text-[#64748b] dark:text-[#6b7a9a]">Mit Objekten</p>
          <p className="mt-2 text-[24px] font-bold text-[#7aaeff]">{kpiSummary.withProperties}</p>
          <p className="mt-2 text-[11px] text-[#64748b] dark:text-[#6b7a9a]">Mit Liegenschaft verknüpft</p>
        </div>
      </div>

      {error && (
        <p className="mb-3 text-[14px] text-[#f87171]">{error}</p>
      )}

      <div className="mb-5 rounded-[14px] border border-black/10 bg-white p-5 dark:border-white/[0.07] dark:bg-[#141824]">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex min-w-0 flex-[1_1_280px] flex-wrap items-end gap-4">
            <div className="min-w-0 flex-[1_1_220px]">
              <label
                htmlFor="admin-landlords-search"
                className="mb-2 block text-[10px] font-medium text-[#64748b] dark:text-[#6b7a9a]"
              >
                Suche
              </label>
              <input
                id="admin-landlords-search"
                type="search"
                autoComplete="off"
                placeholder="Nach Name, E-Mail, Telefon oder Verwaltung suchen"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="box-border h-11 w-full rounded-[8px] border border-black/10 bg-slate-100 px-3.5 text-sm text-[#0f172a] placeholder:text-[#64748b] dark:border-white/[0.08] dark:bg-[#111520] dark:text-[#eef2ff] dark:placeholder:text-[#6b7a9a]"
              />
            </div>
            <div className="min-w-[min(100%,160px)] flex-[0_1_180px]">
              <label
                htmlFor="admin-landlords-anzeige"
                className="mb-2 block text-[10px] font-medium text-[#64748b] dark:text-[#6b7a9a]"
              >
                Anzeige
              </label>
              <select
                id="admin-landlords-anzeige"
                value={listFilter}
                onChange={(e) => setListFilter(e.target.value)}
                className="box-border h-11 w-full min-w-[160px] rounded-[8px] border border-black/10 bg-slate-100 px-3 text-sm text-[#0f172a] dark:border-white/[0.08] dark:bg-[#111520] dark:text-[#eef2ff]"
                aria-label="Anzeige"
              >
                <option value="active">Aktiv</option>
                <option value="archived">Archiviert</option>
                <option value="all">Alle</option>
              </select>
            </div>
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="h-11 cursor-pointer rounded-[8px] border-none bg-gradient-to-r from-[#5b8cff] to-[#7c5cfc] px-[18px] text-sm font-semibold text-white"
          >
            + Neue Verwaltung
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-[14px] border border-black/10 bg-white dark:border-white/[0.07] dark:bg-[#141824]">
        <table className="w-full border-collapse text-[13px] text-[#0f172a] dark:text-[#eef2ff]">
        <thead className="bg-slate-100 dark:bg-[#111520]">
          <tr>
            <th className="px-3 py-3 text-left text-[9px] font-bold uppercase tracking-[0.8px] text-[#64748b] dark:text-[#6b7a9a]">
              Firma / Name
            </th>
            <th className="px-3 py-3 text-left text-[9px] font-bold uppercase tracking-[0.8px] text-[#64748b] dark:text-[#6b7a9a]">
              Adresse
            </th>
            <th className="px-3 py-3 text-left text-[9px] font-bold uppercase tracking-[0.8px] text-[#64748b] dark:text-[#6b7a9a]">
              E-Mail
            </th>
            <th className="px-3 py-3 text-left text-[9px] font-bold uppercase tracking-[0.8px] text-[#64748b] dark:text-[#6b7a9a]">
              Status
            </th>
            <th className="px-3 py-3 text-left text-[9px] font-bold uppercase tracking-[0.8px] text-[#64748b] dark:text-[#6b7a9a]">
              Aktionen
            </th>
          </tr>
        </thead>
        <tbody>
          {filteredLandlords.length === 0 ? (
            <tr>
              <td
                colSpan={5}
                className="border-b border-black/10 px-3 py-3 text-[13px] text-[#64748b] dark:border-white/[0.05] dark:text-[#6b7a9a]"
              >
                Noch keine Einträge. Erstellen Sie eine neue Verwaltung.
              </td>
            </tr>
          ) : displayLandlords.length === 0 ? (
            <tr>
              <td
                colSpan={5}
                className="border-b border-black/10 px-3 py-3 text-[13px] text-[#64748b] dark:border-white/[0.05] dark:text-[#6b7a9a]"
              >
                Keine Verwaltungen für diese Suche gefunden.
              </td>
            </tr>
          ) : (
            displayLandlords.map((row) => {
              const addrDisplay = formatLandlordAddressLine(row);
              const canOpenMap = addrDisplay !== "—";
              return (
                <tr key={row.id} className="border-b border-black/10 dark:border-white/[0.05]">
                  <td className="px-3 py-3 align-top">
                    <Link
                      to={`/admin/landlords/${row.id}`}
                      className="text-[13px] font-medium text-blue-700 no-underline hover:underline dark:text-blue-400"
                    >
                      {row.company_name?.trim() || row.contact_name?.trim() || "—"}
                    </Link>
                  </td>
                  <td className="px-3 py-3 align-top text-[13px] font-medium text-[#0f172a] dark:text-[#eef2ff]">
                    <div className="inline-flex max-w-full flex-wrap items-center gap-1">
                      <span className="min-w-0">{addrDisplay}</span>
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
                          className="inline-flex shrink-0 cursor-pointer items-center justify-center rounded-[8px] border border-black/10 bg-transparent p-0.5 text-[#64748b] dark:border-white/[0.1] dark:text-[#8090b0]"
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
                  <td className="px-3 py-3 align-top text-[13px] font-medium text-[#0f172a] dark:text-[#eef2ff]">
                    {row.email || "—"}
                  </td>
                  <td className="px-3 py-3 align-top">
                    {row.deleted_at ? (
                      <span className="text-[13px] font-medium text-[#64748b] dark:text-[#6b7a9a]">
                        Archiviert
                      </span>
                    ) : row.status === "inactive" ? (
                      <span className="text-[13px] font-medium text-[#64748b] dark:text-[#6b7a9a]">
                        Inaktiv
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full border border-emerald-300 bg-emerald-100 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400">
                        Aktiv
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 align-top">
                    <Link
                      to={`/admin/landlords/${row.id}`}
                      className="inline-block rounded-[8px] border border-black/10 bg-transparent px-3 py-1.5 text-[13px] font-semibold text-[#64748b] no-underline hover:bg-slate-100 dark:border-white/[0.1] dark:text-[#8090b0] dark:hover:bg-white/[0.04]"
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
            className="w-full max-w-[480px] rounded-[14px] border border-black/10 bg-white p-6 [color-scheme:light] dark:border-white/[0.07] dark:bg-[#141824] dark:[color-scheme:dark]"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-1 text-[18px] font-bold text-[#0f172a] dark:text-[#eef2ff]">
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
                  <p className="mt-1.5 text-xs text-[#64748b] dark:text-[#6b7a9a]">PLZ nicht gefunden</p>
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
                    className="self-start rounded-[8px] border border-black/10 dark:border-white/[0.1] bg-transparent px-3 py-2 text-xs font-semibold text-[#64748b] dark:text-[#8090b0] hover:bg-black/[0.03] dark:hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-50"
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
                  className="rounded-[8px] border border-black/10 dark:border-white/[0.1] bg-transparent px-4 py-2.5 font-semibold text-[#64748b] dark:text-[#8090b0] hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
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
