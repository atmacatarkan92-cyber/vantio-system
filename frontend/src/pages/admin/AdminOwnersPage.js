import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { createAdminOwner, fetchAdminOwners, verifyAdminAddress } from "../../api/adminData";
import { SWISS_CANTON_CODES } from "../../constants/swissCantons";
import { lookupSwissPlz } from "../../data/swissPlzLookup";
import { buildGoogleMapsSearchUrl, formatLandlordAddressLine } from "../../utils/googleMapsUrl";

const modalInputStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: "8px",
  border: "1px solid rgba(255,255,255,0.08)",
  background: "#111520",
  color: "#eef2ff",
  fontSize: "14px",
};
const modalLabelStyle = {
  display: "block",
  marginBottom: "6px",
  fontSize: "10px",
  fontWeight: 500,
  color: "#6b7a9a",
};

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
      <div className="min-h-[40vh] bg-[#080a0f] px-6 py-8 text-[#4a5070]">Lade Eigentümer …</div>
    );
  }

  return (
    <div className="-m-6 min-h-screen bg-[#080a0f]">
      <div className="sticky top-0 z-30 flex h-[50px] items-center justify-between border-b border-[#1c2035] bg-[#0c0e15] px-6 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-[#edf0f7]">
            Van<span className="text-[#5b9cf6]">tio</span>
          </span>
          <span className="text-[#4a5070]">·</span>
          <span className="text-[14px] font-medium text-[#edf0f7]">Eigentümer</span>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="cursor-pointer rounded-[6px] border border-[rgba(91,156,246,0.28)] bg-[rgba(91,156,246,0.1)] px-[14px] py-[5px] text-[11px] font-medium text-[#5b9cf6]"
        >
          + Neuer Eigentümer
        </button>
      </div>

      <div className="flex flex-col gap-4 px-6 py-5">
        {error && <p className="text-[14px] text-[#ff5f6d]">{error}</p>}

        <div>
          <div className="mb-[10px] flex items-center gap-2">
            <span className="text-[10px] font-medium uppercase tracking-[0.8px] text-[#4a5070]">Übersicht</span>
            <div className="h-px flex-1 bg-[#1c2035]" />
          </div>
          <div className="grid grid-cols-4 gap-2">
            <div className="relative overflow-hidden rounded-[10px] border border-[#1c2035] bg-[#10121a] px-[15px] py-[13px] transition-colors hover:border-[#242840]">
              <div className="absolute left-0 right-0 top-0 h-[2px] rounded-t-[10px] bg-[#5b9cf6]" />
              <p className="mb-[4px] text-[9px] font-medium uppercase tracking-[0.5px] text-[#4a5070]">
                Eigentümer gesamt
              </p>
              <p className="mb-[4px] font-mono text-[22px] font-medium leading-none text-[#5b9cf6]">
                {summary.totalCount}
              </p>
              <p className="text-[10px] text-[#4a5070]">Alle erfassten Kontakte</p>
            </div>
            <div className="relative overflow-hidden rounded-[10px] border border-[#1c2035] bg-[#10121a] px-[15px] py-[13px] transition-colors hover:border-[#242840]">
              <div className="absolute left-0 right-0 top-0 h-[2px] rounded-t-[10px] bg-[#3ddc84]" />
              <p className="mb-[4px] text-[9px] font-medium uppercase tracking-[0.5px] text-[#4a5070]">Aktiv</p>
              <p className="mb-[4px] font-mono text-[22px] font-medium leading-none text-[#3ddc84]">
                {summary.activeCount}
              </p>
              <p className="text-[10px] text-[#4a5070]">Status aktiv</p>
            </div>
            <div className="relative overflow-hidden rounded-[10px] border border-[#1c2035] bg-[#10121a] px-[15px] py-[13px] transition-colors hover:border-[#242840]">
              <div className="absolute left-0 right-0 top-0 h-[2px] rounded-t-[10px] bg-[#f5a623]" />
              <p className="mb-[4px] text-[9px] font-medium uppercase tracking-[0.5px] text-[#4a5070]">Inaktiv</p>
              <p className="mb-[4px] font-mono text-[22px] font-medium leading-none text-[#f5a623]">
                {summary.inactiveCount}
              </p>
              <p className="text-[10px] text-[#4a5070]">Status inaktiv</p>
            </div>
            <div className="relative overflow-hidden rounded-[10px] border border-[#1c2035] bg-[#10121a] px-[15px] py-[13px] transition-colors hover:border-[#242840]">
              <div className="absolute left-0 right-0 top-0 h-[2px] rounded-t-[10px] bg-[#9d7cf4]" />
              <p className="mb-[4px] text-[9px] font-medium uppercase tracking-[0.5px] text-[#4a5070]">Mit Units</p>
              <p className="mb-[4px] font-mono text-[22px] font-medium leading-none text-[#9d7cf4]">
                {ownersWithUnitsCount}
              </p>
              <p className="text-[10px] text-[#4a5070]">Mindestens eine Unit zugeordnet</p>
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-[12px] border border-[#1c2035] bg-[#10121a]">
          <div className="flex flex-wrap items-center gap-x-[10px] gap-y-2 border-b border-[#1c2035] px-[18px] py-[13px]">
            <h3 className="text-[13px] font-medium text-[#edf0f7]">Eigentümerübersicht</h3>
            <div className="ml-auto flex flex-wrap items-center gap-[8px]">
              <input
                type="text"
                placeholder="Nach Name, E-Mail, Telefon oder Adresse suchen…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="box-border w-[260px] max-w-full rounded-[6px] border border-[#1c2035] bg-[#141720] px-[10px] py-[5px] font-['DM_Sans'] text-[12px] text-[#edf0f7] outline-none placeholder:text-[#4a5070]"
              />
              <select
                id="owners-list-filter"
                value={listFilter}
                onChange={(e) => setListFilter(e.target.value)}
                aria-label="Anzeige"
                className="box-border cursor-pointer appearance-none rounded-[6px] border border-[#1c2035] bg-[#141720] px-[10px] py-[5px] font-['DM_Sans'] text-[12px] text-[#8892b0]"
              >
                <option value="active">Aktiv</option>
                <option value="inactive">Inaktiv</option>
                <option value="all">Alle</option>
              </select>
              <span className="rounded-[6px] border border-[#1c2035] bg-[#141720] px-[10px] py-[3px] text-[10px] text-[#4a5070]">
                {filteredRows.length} Einträge
              </span>
            </div>
          </div>

          {filteredRows.length === 0 ? (
            <p className="px-[18px] py-8 text-[12px] text-[#4a5070]">Keine Eigentümer gefunden.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className="whitespace-nowrap border-b border-[#1c2035] px-[18px] py-[8px] text-left text-[9px] font-medium uppercase tracking-[0.6px] text-[#4a5070]">
                      Name
                    </th>
                    <th className="whitespace-nowrap border-b border-[#1c2035] px-[18px] py-[8px] text-left text-[9px] font-medium uppercase tracking-[0.6px] text-[#4a5070]">
                      Adresse
                    </th>
                    <th className="whitespace-nowrap border-b border-[#1c2035] px-[18px] py-[8px] text-left text-[9px] font-medium uppercase tracking-[0.6px] text-[#4a5070]">
                      Telefon
                    </th>
                    <th className="whitespace-nowrap border-b border-[#1c2035] px-[18px] py-[8px] text-left text-[9px] font-medium uppercase tracking-[0.6px] text-[#4a5070]">
                      E-Mail
                    </th>
                    <th className="whitespace-nowrap border-b border-[#1c2035] px-[18px] py-[8px] text-left text-[9px] font-medium uppercase tracking-[0.6px] text-[#4a5070]">
                      Status
                    </th>
                    <th className="whitespace-nowrap border-b border-[#1c2035] px-[18px] py-[8px] text-left text-[9px] font-medium uppercase tracking-[0.6px] text-[#4a5070]">
                      Aktionen
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((item, rowIdx) => {
                    const isActive = String(item.status || "active").toLowerCase() !== "inactive";
                    const addrDisplay = formatLandlordAddressLine(item);
                    const canOpenMap = addrDisplay !== "—";
                    const isLast = rowIdx === filteredRows.length - 1;
                    const nameRaw = String(item.name || "").trim();
                    const nameParts = nameRaw.split(/\s+/).filter(Boolean);
                    let initials = "?";
                    if (nameParts.length >= 2) {
                      const a = nameParts[0][0] || "";
                      const b = nameParts[nameParts.length - 1][0] || "";
                      initials = `${a}${b}`.toUpperCase() || "?";
                    } else if (nameRaw) {
                      initials = nameRaw.slice(0, 2).toUpperCase();
                    }
                    const tdBase =
                      "px-[18px] py-[13px] align-middle text-[11px] text-[#8892b0] border-b border-[#1c2035]";
                    const tdLast = isLast ? " border-b-0" : "";
                    return (
                      <tr
                        key={item.id}
                        className="cursor-pointer transition-colors hover:bg-[#141720]"
                      >
                        <td className={`${tdBase}${tdLast}`}>
                          <div className="flex items-center gap-[9px]">
                            <div className="flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-[8px] border border-[rgba(61,220,132,0.2)] bg-[rgba(61,220,132,0.1)] text-[10px] font-semibold text-[#3ddc84]">
                              {initials}
                            </div>
                            <Link
                              to={`/admin/owners/${encodeURIComponent(item.id)}`}
                              className="text-[12px] font-medium text-[#5b9cf6] no-underline hover:underline"
                            >
                              {item.name || "—"}
                            </Link>
                          </div>
                        </td>
                        <td className={`${tdBase}${tdLast}`}>
                          <div className="inline-flex max-w-full flex-wrap items-center gap-[6px]">
                            <span className="min-w-0 text-[11px] text-[#8892b0]">
                              📍 {addrDisplay}
                            </span>
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
                                className="inline-flex shrink-0 cursor-pointer items-center justify-center rounded-[6px] border border-[#252a3a] bg-[#141720] p-0.5 text-[#8892b0] transition-colors hover:border-[#3b5fcf] hover:text-[#edf0f7]"
                                style={{ margin: 0 }}
                              >
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  width="16"
                                  height="16"
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
                        <td className={`${tdBase}${tdLast} font-mono text-[10px] text-[#4a5070]`}>
                          {item.phone || "—"}
                        </td>
                        <td className={`${tdBase}${tdLast} text-[11px] text-[#8892b0]`}>
                          {item.email || "—"}
                        </td>
                        <td className={`${tdBase}${tdLast}`}>
                          <span
                            className={
                              isActive
                                ? "inline-flex items-center rounded-full border border-[rgba(61,220,132,0.2)] bg-[rgba(61,220,132,0.1)] px-[6px] py-[1px] text-[9px] font-semibold text-[#3ddc84]"
                                : "inline-flex items-center rounded-full border border-[rgba(245,166,35,0.2)] bg-[rgba(245,166,35,0.1)] px-[6px] py-[1px] text-[9px] font-semibold text-[#f5a623]"
                            }
                          >
                            {isActive ? "Aktiv" : "Inaktiv"}
                          </span>
                        </td>
                        <td className={`${tdBase}${tdLast}`}>
                          <Link
                            to={`/admin/owners/${encodeURIComponent(item.id)}`}
                            className="inline-block cursor-pointer rounded-[6px] border border-[#252a3a] bg-[#141720] px-[12px] py-[4px] text-[11px] text-[#8892b0] no-underline transition-all duration-150 hover:border-[#3b5fcf] hover:bg-[#1a1e2c] hover:text-[#edf0f7]"
                          >
                            Öffnen →
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {formOpen && (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 p-4"
          onClick={() => !saving && setFormOpen(false)}
        >
          <div
            className="w-full max-w-[440px] rounded-[14px] border border-black/10 bg-white p-6 [color-scheme:light] dark:border-white/[0.07] dark:bg-[#141824] dark:[color-scheme:dark]"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-4 text-[18px] font-bold text-[#0f172a] dark:text-[#eef2ff]">Neuer Eigentümer</h3>
            <form onSubmit={handleSubmit} className="grid gap-3.5">
              <div>
                <label className="mb-1.5 block text-[10px] text-[#64748b] dark:text-[#6b7a9a]">Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  required
                  className="w-full rounded-[8px] border border-black/10 bg-slate-100 px-3 py-2.5 text-[14px] text-[#0f172a] dark:border-white/[0.08] dark:bg-[#111520] dark:text-[#eef2ff]"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[10px] text-[#6b7a9a]">
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
                  <p className="mt-1.5 text-xs text-[#64748b] dark:text-[#6b7a9a]">PLZ nicht gefunden</p>
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
                    className="self-start rounded-[8px] border border-black/10 bg-transparent px-3 py-2 text-xs font-semibold text-[#64748b] hover:bg-black/[0.03] disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/[0.1] dark:text-[#8090b0] dark:hover:bg-white/[0.04]"
                    style={{
                      cursor: saving || addressCheckBusy ? "not-allowed" : "pointer",
                    }}
                  >
                    {addressCheckBusy ? "…" : "Adresse prüfen"}
                  </button>
                </div>
                <p className="m-0 text-xs text-[#64748b] dark:text-[#6b7a9a]">
                  Öffnet Google Maps in einem neuen Tab. Der Kanton wird im Hintergrund ergänzt, wenn die
                  Abfrage einen Wert liefert.
                </p>
                {cantonHint ? (
                  <p className="m-0 text-xs text-[#64748b] dark:text-[#6b7a9a]">{cantonHint}</p>
                ) : null}
              </div>
              <div>
                <label style={modalLabelStyle}>Kanton</label>
                <p className="mb-1.5 text-xs font-normal text-[#64748b] dark:text-[#6b7a9a]">
                  Optional — oft nach «Adresse prüfen» gesetzt; manuelle Auswahl möglich.
                </p>
                <select
                  value={form.canton || ""}
                  onChange={(e) => setForm((f) => ({ ...f, canton: e.target.value }))}
                  disabled={cantonLockedByPlz}
                  style={{
                    ...modalInputStyle,
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
                <label className="mb-1.5 block text-[10px] text-[#64748b] dark:text-[#6b7a9a]">Status</label>
                <select
                  value={form.status}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                  className="w-full rounded-[8px] border border-black/10 bg-slate-100 px-3 py-2.5 text-[14px] text-[#0f172a] dark:border-white/[0.08] dark:bg-[#111520] dark:text-[#eef2ff]"
                >
                  <option value="active">Aktiv</option>
                  <option value="inactive">Inaktiv</option>
                </select>
              </div>
              <div className="mt-2 flex gap-2.5">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 cursor-pointer rounded-[8px] border-none bg-gradient-to-r from-[#5b8cff] to-[#7c5cfc] py-3 font-semibold text-white hover:opacity-95 disabled:cursor-wait disabled:opacity-70"
                >
                  {saving ? "Speichern…" : "Speichern"}
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setFormOpen(false)}
                  className="rounded-[8px] border border-black/10 dark:border-white/[0.1] bg-transparent px-4 py-3 font-semibold text-[#64748b] dark:text-[#8090b0] hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
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
