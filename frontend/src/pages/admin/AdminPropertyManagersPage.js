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
      const landlordStr = ll ? landlordLabel(ll) : "";
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
      <div className="min-h-[40vh] bg-[#07090f] px-4 py-8 text-[#6b7a9a]">
        Lade Bewirtschafter …
      </div>
    );
  }

  return (
    <div className="grid min-h-screen gap-6 bg-[#07090f] px-4 py-6 text-[#eef2ff]">
      <div>
        <div className="mb-2 text-[12px] font-bold uppercase tracking-wide text-[#fb923c]">Vantio</div>

        <h2 className="text-[22px] font-bold">Bewirtschafter</h2>

        <p className="mt-2 text-[12px] text-[#6b7a9a]">
          Verwaltung von Bewirtschafter-Kontakten (PostgreSQL).
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
            Bewirtschafter gesamt
          </p>
          <p className="mt-2 text-[24px] font-bold text-[#eef2ff]">{summary.totalCount}</p>
          <p className="mt-2 text-[11px] text-[#6b7a9a]">Alle erfassten Kontakte</p>
        </div>

        <div className="relative overflow-hidden rounded-[14px] border border-white/[0.07] border-t-4 border-t-[#7aaeff] bg-[#141824] p-5">
          <p className="text-[9px] font-bold uppercase tracking-[1px] text-[#6b7a9a]">
            Mit Verwaltung
          </p>
          <p className="mt-2 text-[24px] font-bold text-[#7aaeff]">{summary.withLandlord}</p>
          <p className="mt-2 text-[11px] text-[#6b7a9a]">Verwaltung verknüpft</p>
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
                placeholder="Nach Name, E-Mail, Telefon oder Verwaltung suchen"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="box-border h-[44px] w-full rounded-[8px] border border-white/[0.08] bg-[#111520] px-3.5 text-[14px] text-[#eef2ff] placeholder:text-[#6b7a9a]/70"
              />
            </div>
            <div style={{ flex: "0 1 180px", minWidth: "min(100%, 160px)" }}>
              <label
                htmlFor="pm-list-filter"
                className="mb-2 block text-[10px] font-medium text-[#6b7a9a]"
              >
                Anzeige
              </label>
              <select
                id="pm-list-filter"
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
            + Neuer Bewirtschafter
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-[14px] border border-white/[0.07] bg-[#141824] p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-[16px] font-bold text-[#eef2ff]">Bewirtschafterübersicht</h3>

          <div className="text-[13px] text-[#6b7a9a]">{filteredRows.length} Einträge</div>
        </div>

        {filteredRows.length === 0 ? (
          <p className="text-[#6b7a9a]">Keine Bewirtschafter gefunden.</p>
        ) : (
          <table className="w-full border-collapse text-[14px]">
            <thead>
              <tr className="border-b border-white/[0.05] bg-[#111520] text-left text-[9px] font-bold uppercase tracking-[0.8px] text-[#6b7a9a]">
                <th className="px-3 py-3">Name</th>
                <th className="px-3 py-3">E-Mail</th>
                <th className="px-3 py-3">Telefon</th>
                <th className="px-3 py-3">Verwaltung</th>
                <th className="px-3 py-3">Erstellt</th>
                <th className="whitespace-nowrap px-3 py-3">Aktionen</th>
              </tr>
            </thead>

            <tbody>
              {filteredRows.map((item) => {
                const ll = item.landlord_id ? landlordById.get(item.landlord_id) : null;
                return (
                  <tr key={item.id} className="border-b border-white/[0.05]">
                    <td className="px-3 py-3 font-semibold text-[#eef2ff]">{item.name || "—"}</td>
                    <td className="px-3 py-3 text-[#eef2ff]">{item.email || "—"}</td>
                    <td className="px-3 py-3 text-[#eef2ff]">{item.phone || "—"}</td>
                    <td className="px-3 py-3 font-medium text-[#eef2ff]">
                      {ll ? landlordLabel(ll) : "—"}
                    </td>
                    <td className="px-3 py-3 text-[#eef2ff]">{formatDate(item.created_at)}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          to={`/admin/bewirtschafter/${encodeURIComponent(item.id)}`}
                          className="inline-block rounded-[8px] border border-white/[0.1] bg-transparent px-3 py-2 text-[13px] font-semibold text-[#8090b0] no-underline hover:bg-white/[0.04]"
                        >
                          Öffnen
                        </Link>
                      </div>
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
            <h3 className="mb-4 text-[18px] font-bold text-[#eef2ff]">
              {editingId ? "Bewirtschafter bearbeiten" : "Neuer Bewirtschafter"}
            </h3>
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
                <label className="mb-1.5 block text-[10px] text-[#6b7a9a]">E-Mail (optional)</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  className="w-full rounded-[8px] border border-white/[0.08] bg-[#111520] px-3 py-2.5 text-[14px] text-[#eef2ff]"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[10px] text-[#6b7a9a]">Telefon (optional)</label>
                <input
                  type="text"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  className="w-full rounded-[8px] border border-white/[0.08] bg-[#111520] px-3 py-2.5 text-[14px] text-[#eef2ff]"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[10px] text-[#6b7a9a]">Verwaltung (optional)</label>
                <select
                  value={form.landlord_id}
                  onChange={(e) => setForm((f) => ({ ...f, landlord_id: e.target.value }))}
                  className="w-full rounded-[8px] border border-white/[0.08] bg-[#111520] px-3 py-2.5 text-[14px] text-[#eef2ff]"
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

export default AdminPropertyManagersPage;
