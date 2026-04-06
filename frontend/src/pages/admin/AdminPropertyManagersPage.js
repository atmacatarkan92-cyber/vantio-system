import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
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

/** Omits placeholder "—" parts so the UI does not show trailing "— —". */
function landlordDisplayLabel(l) {
  if (!l) return "";
  const norm = (v) => {
    const t = String(v ?? "").trim();
    if (!t || t === "—") return "";
    return t;
  };
  const c = norm(l.company_name);
  const n = norm(l.contact_name);
  if (c && n) return `${c} — ${n}`;
  if (c || n) return c || n;
  const em = norm(l.email);
  if (em) return em;
  return l.id != null ? String(l.id) : "";
}

function AdminPropertyManagersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinkHandled = useRef(false);
  const [items, setItems] = useState([]);
  const [landlords, setLandlords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [listFilter, setListFilter] = useState("active");
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    landlord_id: "",
    status: "active",
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
        status: (row.status || "active").toLowerCase() === "inactive" ? "inactive" : "active",
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
      status: "active",
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
      status: form.status === "inactive" ? "inactive" : "active",
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
      const ll = item.landlord_id ? landlordById.get(item.landlord_id) : null;
      const landlordStr = ll ? landlordDisplayLabel(ll) : "";
      const blob = `${item.name || ""} ${item.email || ""} ${item.phone || ""} ${landlordStr}`.toLowerCase();
      return blob.includes(term);
    });
  }, [statusFilteredItems, searchTerm, landlordById]);

  const summary = useMemo(() => {
    const totalCount = items.length;
    const withLandlord = items.filter((i) => i.landlord_id).length;
    const activeCount = items.filter((i) => String(i.status || "active").toLowerCase() !== "inactive").length;
    const inactiveCount = items.filter((i) => String(i.status || "").toLowerCase() === "inactive").length;
    return { totalCount, withLandlord, activeCount, inactiveCount };
  }, [items]);

  if (loading) {
    return (
      <div className="min-h-[40vh] bg-[#080a0f] px-6 py-8 text-[#4a5070]">Lade Bewirtschafter …</div>
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
          <span className="text-[14px] font-medium text-[#edf0f7]">Bewirtschafter</span>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="cursor-pointer rounded-[6px] border border-[rgba(91,156,246,0.28)] bg-[rgba(91,156,246,0.1)] px-[14px] py-[5px] text-[11px] font-medium text-[#5b9cf6]"
        >
          + Neuer Bewirtschafter
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
                Bewirtschafter gesamt
              </p>
              <p className="mb-[4px] font-mono text-[22px] font-medium leading-none text-[#5b9cf6]">
                {summary.totalCount}
              </p>
              <p className="text-[10px] text-[#4a5070]">Alle erfassten Kontakte</p>
            </div>
            <div className="relative overflow-hidden rounded-[10px] border border-[#1c2035] bg-[#10121a] px-[15px] py-[13px] transition-colors hover:border-[#242840]">
              <div className="absolute left-0 right-0 top-0 h-[2px] rounded-t-[10px] bg-[#9d7cf4]" />
              <p className="mb-[4px] text-[9px] font-medium uppercase tracking-[0.5px] text-[#4a5070]">
                Mit Verwaltung
              </p>
              <p className="mb-[4px] font-mono text-[22px] font-medium leading-none text-[#9d7cf4]">
                {summary.withLandlord}
              </p>
              <p className="text-[10px] text-[#4a5070]">Verwaltung verknüpft</p>
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
          </div>
        </div>

        <div className="overflow-hidden rounded-[12px] border border-[#1c2035] bg-[#10121a]">
          <div className="flex flex-wrap items-center gap-x-[10px] gap-y-2 border-b border-[#1c2035] px-[18px] py-[13px]">
            <h3 className="text-[13px] font-medium text-[#edf0f7]">Bewirtschafterübersicht</h3>
            <div className="ml-auto flex flex-wrap items-center gap-[8px]">
              <input
                type="text"
                placeholder="Nach Name, E-Mail, Telefon oder Verwaltung suchen…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="box-border w-[260px] max-w-full rounded-[6px] border border-[#1c2035] bg-[#141720] px-[10px] py-[5px] font-['DM_Sans'] text-[12px] text-[#edf0f7] outline-none placeholder:text-[#4a5070]"
              />
              <select
                id="pm-list-filter"
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
            <p className="px-[18px] py-8 text-[12px] text-[#4a5070]">Keine Bewirtschafter gefunden.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className="whitespace-nowrap border-b border-[#1c2035] px-[18px] py-[8px] text-left text-[9px] font-medium uppercase tracking-[0.6px] text-[#4a5070]">
                      Name
                    </th>
                    <th className="whitespace-nowrap border-b border-[#1c2035] px-[18px] py-[8px] text-left text-[9px] font-medium uppercase tracking-[0.6px] text-[#4a5070]">
                      E-Mail
                    </th>
                    <th className="whitespace-nowrap border-b border-[#1c2035] px-[18px] py-[8px] text-left text-[9px] font-medium uppercase tracking-[0.6px] text-[#4a5070]">
                      Telefon
                    </th>
                    <th className="whitespace-nowrap border-b border-[#1c2035] px-[18px] py-[8px] text-left text-[9px] font-medium uppercase tracking-[0.6px] text-[#4a5070]">
                      Verwaltung
                    </th>
                    <th className="whitespace-nowrap border-b border-[#1c2035] px-[18px] py-[8px] text-left text-[9px] font-medium uppercase tracking-[0.6px] text-[#4a5070]">
                      Erstellt
                    </th>
                    <th className="whitespace-nowrap border-b border-[#1c2035] px-[18px] py-[8px] text-left text-[9px] font-medium uppercase tracking-[0.6px] text-[#4a5070]">
                      Aktionen
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((item, rowIdx) => {
                    const ll = item.landlord_id ? landlordById.get(item.landlord_id) : null;
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
                    const avMod = rowIdx % 5;
                    const avBox =
                      avMod === 0
                        ? "bg-[rgba(91,156,246,0.1)] border-[rgba(91,156,246,0.2)] text-[#5b9cf6]"
                        : avMod === 1
                          ? "bg-[rgba(157,124,244,0.1)] border-[rgba(157,124,244,0.2)] text-[#9d7cf4]"
                          : avMod === 2
                            ? "bg-[rgba(61,220,132,0.1)] border-[rgba(61,220,132,0.2)] text-[#3ddc84]"
                            : avMod === 3
                              ? "bg-[rgba(245,166,35,0.1)] border-[rgba(245,166,35,0.2)] text-[#f5a623]"
                              : "bg-[rgba(255,95,109,0.1)] border-[rgba(255,95,109,0.2)] text-[#ff5f6d]";
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
                            <div
                              className={`flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-[8px] border text-[10px] font-semibold ${avBox}`}
                            >
                              {initials}
                            </div>
                            <span className="text-[12px] font-medium text-[#edf0f7]">
                              {item.name || "—"}
                            </span>
                          </div>
                        </td>
                        <td className={`${tdBase}${tdLast} text-[11px] text-[#8892b0]`}>
                          {item.email || "—"}
                        </td>
                        <td className={`${tdBase}${tdLast} font-mono text-[10px] text-[#4a5070]`}>
                          {item.phone || "—"}
                        </td>
                        <td className={`${tdBase}${tdLast} text-[11px]`}>
                          {ll && landlordDisplayLabel(ll) ? (
                            <Link
                              to={`/admin/landlords/${encodeURIComponent(ll.id)}`}
                              className="text-[11px] font-medium text-[#5b9cf6] no-underline hover:underline"
                            >
                              {landlordDisplayLabel(ll)}
                            </Link>
                          ) : (
                            <span className="text-[#8892b0]">—</span>
                          )}
                        </td>
                        <td className={`${tdBase}${tdLast} font-mono text-[10px] text-[#4a5070]`}>
                          {formatDate(item.created_at)}
                        </td>
                        <td className={`${tdBase}${tdLast}`}>
                          <Link
                            to={`/admin/bewirtschafter/${encodeURIComponent(item.id)}`}
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
            <h3 className="mb-4 text-[18px] font-bold text-[#0f172a] dark:text-[#eef2ff]">
              {editingId ? "Bewirtschafter bearbeiten" : "Neuer Bewirtschafter"}
            </h3>
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
                <label className="mb-1.5 block text-[10px] text-[#64748b] dark:text-[#6b7a9a]">E-Mail (optional)</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  className="w-full rounded-[8px] border border-black/10 bg-slate-100 px-3 py-2.5 text-[14px] text-[#0f172a] dark:border-white/[0.08] dark:bg-[#111520] dark:text-[#eef2ff]"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[10px] text-[#64748b] dark:text-[#6b7a9a]">Telefon (optional)</label>
                <input
                  type="text"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  className="w-full rounded-[8px] border border-black/10 bg-slate-100 px-3 py-2.5 text-[14px] text-[#0f172a] dark:border-white/[0.08] dark:bg-[#111520] dark:text-[#eef2ff]"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[10px] text-[#64748b] dark:text-[#6b7a9a]">Verwaltung (optional)</label>
                <select
                  value={form.landlord_id}
                  onChange={(e) => setForm((f) => ({ ...f, landlord_id: e.target.value }))}
                  className="w-full rounded-[8px] border border-black/10 bg-slate-100 px-3 py-2.5 text-[14px] text-[#0f172a] dark:border-white/[0.08] dark:bg-[#111520] dark:text-[#eef2ff]"
                >
                  <option value="">— Keine Auswahl</option>
                  {landlords.map((l) => (
                    <option key={l.id} value={l.id}>
                      {landlordLabel(l)}
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

export default AdminPropertyManagersPage;
