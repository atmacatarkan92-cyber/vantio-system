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
      <div className="min-h-[40vh] bg-[#07090f] px-4 py-8 text-[#6b7a9a]">
        Lade Eigentümer …
      </div>
    );
  }

  return (
    <div className="grid min-h-screen gap-6 bg-[#07090f] px-4 py-6 text-[#eef2ff]">
      <div>
        <div className="mb-2 text-[12px] font-bold uppercase tracking-wide text-[#fb923c]">Vantio</div>

        <h2 className="text-[22px] font-bold">Eigentümer</h2>

        <p className="mt-2 text-[12px] text-[#6b7a9a]">
          Verwaltung von Eigentümer-Kontakten (CRM).
        </p>
      </div>

      {error && (
        <div className="rounded-[10px] border border-red-500/20 bg-red-500/10 px-4 py-3 text-[14px] text-[#f87171]">
          {error}
        </div>
      )}

      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
        <div className="relative overflow-hidden rounded-[14px] border border-white/[0.07] border-t-4 border-t-[#7aaeff] bg-[#141824] p-5">
          <p className="text-[9px] font-bold uppercase tracking-[1px] text-[#6b7a9a]">
            Eigentümer gesamt
          </p>
          <p className="mt-2 text-[24px] font-bold text-[#eef2ff]">{summary.totalCount}</p>
          <p className="mt-2 text-[11px] text-[#6b7a9a]">Alle erfassten Kontakte</p>
        </div>

        <div className="relative overflow-hidden rounded-[14px] border border-white/[0.07] border-t-4 border-t-[#4ade80] bg-[#141824] p-5">
          <p className="text-[9px] font-bold uppercase tracking-[1px] text-[#6b7a9a]">Aktiv</p>
          <p className="mt-2 text-[24px] font-bold text-[#4ade80]">{summary.activeCount}</p>
          <p className="mt-2 text-[11px] text-[#6b7a9a]">Status aktiv</p>
        </div>

        <div className="relative overflow-hidden rounded-[14px] border border-white/[0.07] border-t-4 border-t-[#6b7a9a] bg-[#141824] p-5">
          <p className="text-[9px] font-bold uppercase tracking-[1px] text-[#6b7a9a]">Inaktiv</p>
          <p className="mt-2 text-[24px] font-bold text-[#8090b0]">{summary.inactiveCount}</p>
          <p className="mt-2 text-[11px] text-[#6b7a9a]">Status inaktiv</p>
        </div>

        <div className="relative overflow-hidden rounded-[14px] border border-white/[0.07] border-t-4 border-t-[#a78bfa] bg-[#141824] p-5">
          <p className="text-[9px] font-bold uppercase tracking-[1px] text-[#6b7a9a]">Mit Units</p>
          <p className="mt-2 text-[24px] font-bold text-[#7aaeff]">{ownersWithUnitsCount}</p>
          <p className="mt-2 text-[11px] text-[#6b7a9a]">Mindestens eine Unit zugeordnet</p>
        </div>
      </div>

      <div className="rounded-[14px] border border-white/[0.07] bg-[#141824] p-5">
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
              <label className="mb-2 block text-[10px] font-medium text-[#6b7a9a]">Suche</label>
              <input
                type="text"
                placeholder="Nach Name, E-Mail, Telefon oder Adresse suchen"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="box-border h-[44px] w-full rounded-[8px] border border-white/[0.08] bg-[#111520] px-3.5 text-[14px] text-[#eef2ff] placeholder:text-[#6b7a9a]/70"
              />
            </div>
            <div style={{ flex: "0 1 180px", minWidth: "min(100%, 160px)" }}>
              <label
                htmlFor="owners-list-filter"
                className="mb-2 block text-[10px] font-medium text-[#6b7a9a]"
              >
                Anzeige
              </label>
              <select
                id="owners-list-filter"
                value={listFilter}
                onChange={(e) => setListFilter(e.target.value)}
                aria-label="Anzeige"
                className="box-border h-[44px] w-full rounded-[8px] border border-white/[0.08] bg-[#111520] px-3 text-[14px] text-[#eef2ff]"
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
            className="h-[44px] cursor-pointer rounded-[8px] border-none bg-gradient-to-r from-[#5b8cff] to-[#7c5cfc] px-[18px] text-[14px] font-semibold text-white hover:opacity-95"
          >
            + Neuer Eigentümer
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-[14px] border border-white/[0.07] bg-[#141824] p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-[16px] font-bold text-[#eef2ff]">Eigentümerübersicht</h3>
          <div className="text-[13px] text-[#6b7a9a]">{filteredRows.length} Einträge</div>
        </div>

        {filteredRows.length === 0 ? (
          <p className="text-[#6b7a9a]">Keine Eigentümer gefunden.</p>
        ) : (
          <table className="w-full border-collapse text-[14px]">
            <thead>
              <tr className="border-b border-white/[0.05] bg-[#111520] text-left text-[9px] font-bold uppercase tracking-[0.8px] text-[#6b7a9a]">
                <th className="px-3 py-3">Name</th>
                <th className="px-3 py-3">Adresse</th>
                <th className="px-3 py-3">Telefon</th>
                <th className="px-3 py-3">E-Mail</th>
                <th className="px-3 py-3">Status</th>
                <th className="whitespace-nowrap px-3 py-3">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((item) => {
                const isActive = String(item.status || "active").toLowerCase() !== "inactive";
                const addrDisplay = formatLandlordAddressLine(item);
                const canOpenMap = addrDisplay !== "—";
                return (
                  <tr key={item.id} className="border-b border-white/[0.05]">
                    <td className="px-3 py-3">
                      <Link
                        to={`/admin/owners/${encodeURIComponent(item.id)}`}
                        className="font-semibold text-[#7aaeff] no-underline hover:underline"
                      >
                        {item.name || "—"}
                      </Link>
                    </td>
                    <td className="px-3 py-3 text-[#eef2ff]">
                      <div className="inline-flex max-w-full flex-wrap items-center gap-1">
                        <span className="min-w-0">{addrDisplay}</span>
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
                            className="inline-flex shrink-0 cursor-pointer items-center justify-center rounded-[8px] border border-white/[0.1] bg-transparent p-0.5 text-[#8090b0] hover:bg-white/[0.04]"
                            style={{ margin: 0 }}
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
                    <td className="px-3 py-3 text-[#eef2ff]">{item.phone || "—"}</td>
                    <td className="px-3 py-3 text-[#eef2ff]">{item.email || "—"}</td>
                    <td className="px-3 py-3">
                      <span
                        className={
                          isActive
                            ? "inline-flex items-center rounded-full border border-green-500/20 bg-green-500/10 px-2.5 py-0.5 text-[10px] font-bold text-green-400"
                            : "inline-flex items-center rounded-full border border-white/[0.08] bg-white/[0.05] px-2.5 py-0.5 text-[10px] font-bold text-[#6b7a9a]"
                        }
                      >
                        {isActive ? "Aktiv" : "Inaktiv"}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <Link
                        to={`/admin/owners/${encodeURIComponent(item.id)}`}
                        className="inline-block rounded-[8px] border border-white/[0.1] bg-transparent px-3 py-2 text-[13px] font-semibold text-[#8090b0] no-underline hover:bg-white/[0.04]"
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
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 p-4"
          onClick={() => !saving && setFormOpen(false)}
        >
          <div
            className="w-full max-w-[440px] rounded-[14px] border border-white/[0.07] bg-[#141824] p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-4 text-[18px] font-bold text-[#eef2ff]">Neuer Eigentümer</h3>
            <form onSubmit={handleSubmit} className="grid gap-3.5">
              <div>
                <label className="mb-1.5 block text-[10px] text-[#6b7a9a]">Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  required
                  className="w-full rounded-[8px] border border-white/[0.08] bg-[#111520] px-3 py-2.5 text-[14px] text-[#eef2ff]"
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
                  <p className="mt-1.5 text-xs text-[#6b7a9a]">PLZ nicht gefunden</p>
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
                <label style={modalLabelStyle}>Kanton</label>
                <p className="mb-1.5 text-xs font-normal text-[#6b7a9a]">
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
                <label className="mb-1.5 block text-[10px] text-[#6b7a9a]">Status</label>
                <select
                  value={form.status}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                  className="w-full rounded-[8px] border border-white/[0.08] bg-[#111520] px-3 py-2.5 text-[14px] text-[#eef2ff]"
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
                  className="rounded-[8px] border border-white/[0.1] bg-transparent px-4 py-3 font-semibold text-[#8090b0] hover:bg-white/[0.04]"
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
