import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  fetchAdminInventory,
  fetchAdminInventorySummary,
  createInventoryItem,
} from "../../api/adminData";

function formatChf(value) {
  if (value == null || value === "") return "—";
  return `CHF ${Number(value).toLocaleString("de-CH", { maximumFractionDigits: 2 })}`;
}

/** Optional http(s) URL; empty → null. Returns { value } or { error }. */
function parseOptionalProductUrl(raw) {
  if (raw == null || String(raw).trim() === "") return { value: null };
  const s = String(raw).trim();
  try {
    const u = new URL(s);
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      return { error: "Produkt-URL muss mit http:// oder https:// beginnen." };
    }
    return { value: s };
  } catch {
    return { error: "Ungültige Produkt-URL." };
  }
}

function ProductUrlLink({ url, className = "" }) {
  if (!url || !String(url).trim()) {
    return <span className="text-[#93a4bf]">—</span>;
  }
  const href = String(url).trim();
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex rounded-md border border-[#5b8cff]/40 bg-[#5b8cff]/10 px-2 py-0.5 text-[11px] font-semibold text-[#5b8cff] hover:bg-[#5b8cff]/20 ${className}`}
    >
      Produkt öffnen
    </a>
  );
}

const emptyItemForm = () => ({
  name: "",
  category: "",
  brand: "",
  total_quantity: "1",
  condition: "",
  status: "active",
  purchase_price_chf: "",
  purchase_date: "",
  supplier_article_number: "",
  purchased_from: "",
  product_url: "",
  notes: "",
});

export default function AdminInventoryPage() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState(null);
  const [data, setData] = useState({ items: [], total: 0, skip: 0, limit: 50 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [skip, setSkip] = useState(0);
  const limit = 50;
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(emptyItemForm());
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState("");

  const load = () => {
    setLoading(true);
    setError("");
    Promise.all([
      fetchAdminInventorySummary().catch(() => null),
      fetchAdminInventory({ skip, limit }).catch(() => ({ items: [], total: 0 })),
    ])
      .then(([sum, inv]) => {
        setSummary(sum && typeof sum === "object" ? sum : null);
        setData(
          inv && typeof inv === "object" && Array.isArray(inv.items)
            ? inv
            : { items: [], total: 0, skip: 0, limit }
        );
      })
      .catch((e) => {
        setError(e?.message || "Laden fehlgeschlagen.");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skip]);

  function openCreate() {
    setForm(emptyItemForm());
    setFormErr("");
    setCreateOpen(true);
  }

  function bodyFromForm() {
    const tq = Math.max(1, parseInt(form.total_quantity, 10) || 1);
    const pu = parseOptionalProductUrl(form.product_url);
    if (pu.error) {
      return { _error: pu.error };
    }
    return {
      name: String(form.name || "").trim(),
      category: String(form.category || "").trim(),
      brand: String(form.brand || "").trim() || null,
      total_quantity: tq,
      condition: String(form.condition || "").trim(),
      status: String(form.status || "active").trim() || "active",
      purchase_price_chf:
        form.purchase_price_chf === "" || form.purchase_price_chf == null
          ? null
          : Number(form.purchase_price_chf),
      purchase_date: form.purchase_date ? form.purchase_date : null,
      supplier_article_number: String(form.supplier_article_number || "").trim() || null,
      purchased_from: String(form.purchased_from || "").trim() || null,
      product_url: pu.value,
      notes: String(form.notes || "").trim() || null,
    };
  }

  async function submitCreate(e) {
    e.preventDefault();
    const b = bodyFromForm();
    if (b._error) {
      setFormErr(b._error);
      return;
    }
    if (!b.name) {
      setFormErr("Name erforderlich.");
      return;
    }
    setSaving(true);
    setFormErr("");
    try {
      await createInventoryItem(b);
      setCreateOpen(false);
      load();
    } catch (err) {
      setFormErr(err?.message || "Fehler.");
    } finally {
      setSaving(false);
    }
  }

  const canNext = skip + limit < data.total;
  const canPrev = skip > 0;

  return (
    <div
      className="min-h-screen bg-[#060b14] text-[#f8fafc] [color-scheme:dark]"
      data-testid="admin-inventory-page"
    >
      <div className="mx-auto max-w-[min(1400px,100%)] gap-4 p-6">
        <div className="mb-6 rounded-[14px] border border-white/[0.08] bg-[#0b1220] p-6">
          <p className="text-[9px] font-bold uppercase tracking-[1px] text-[#93a4bf]">Betrieb</p>
          <h1 className="mt-1 text-[22px] font-bold tracking-tight">Inventar (Bestand)</h1>
          <p className="mt-2 max-w-[800px] text-[13px] leading-relaxed text-[#93a4bf]">
            Artikel mit Gesamtmenge und Zuordnung auf Units. Anschaffungspreise sind Investitionsdaten
            — keine Betriebskosten (UnitCost).
          </p>
          {summary && !loading ? (
            <p className="mt-3 text-[13px] text-[#93a4bf]">
              <span className="text-[#f8fafc] font-semibold">{summary.total_skus}</span> Artikel ·{" "}
              <span className="text-[#f8fafc] font-semibold">{summary.total_pieces}</span> Stück
              gesamt · <span className="text-[#f8fafc] font-semibold">{summary.assigned_total}</span>{" "}
              zugeordnet ·{" "}
              <span className="text-[#f8fafc] font-semibold">{summary.available_total}</span> frei
            </p>
          ) : null}
          <button
            type="button"
            onClick={openCreate}
            className="mt-4 rounded-lg bg-[#5b8cff] px-4 py-2 text-sm font-semibold text-white hover:bg-[#4a7ae8]"
          >
            Neuer Artikel
          </button>
        </div>

        {error ? <p className="mb-4 text-sm text-[#f87171]">{error}</p> : null}

        <div className="rounded-[14px] border border-white/[0.08] bg-[#0b1220] p-4">
          {loading ? (
            <p className="text-sm text-[#93a4bf]">Lade …</p>
          ) : data.items.length === 0 ? (
            <p className="text-sm text-[#93a4bf]">Keine Artikel.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.08] text-[9px] font-bold uppercase tracking-[0.8px] text-[#93a4bf]">
                      <th className="py-2 pr-3">Nr.</th>
                      <th className="py-2 pr-3">Name</th>
                      <th className="py-2 pr-3">Kategorie</th>
                      <th className="py-2 pr-3 max-w-[100px]">Lief.-Nr.</th>
                      <th className="py-2 pr-3 max-w-[120px]">Bezug</th>
                      <th className="py-2 pr-3">Produkt</th>
                      <th className="py-2 pr-3 text-right">Gesamt</th>
                      <th className="py-2 pr-3 text-right">Zugeordnet</th>
                      <th className="py-2 pr-3 text-right">Frei</th>
                      <th className="py-2 pr-2 text-right">Anschaffung</th>
                      <th className="py-2 pr-0 text-right">Aktionen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((row) => (
                      <tr
                        key={row.id}
                        className="cursor-pointer border-b border-white/[0.05] hover:bg-white/[0.02]"
                        onClick={() => navigate(`/admin/inventory/${row.id}`)}
                      >
                        <td className="py-2 pr-3 font-mono text-[12px] text-[#93a4bf]">
                          {row.inventory_number}
                        </td>
                        <td className="py-2 pr-3 font-medium">
                          <Link
                            to={`/admin/inventory/${row.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="text-[#f8fafc] hover:text-[#5b8cff] hover:underline"
                          >
                            {row.name}
                          </Link>
                        </td>
                        <td className="py-2 pr-3 text-[#93a4bf]">{row.category || "—"}</td>
                        <td
                          className="py-2 pr-3 max-w-[100px] truncate text-[11px] text-[#93a4bf]"
                          title={row.supplier_article_number || ""}
                        >
                          {row.supplier_article_number || "—"}
                        </td>
                        <td
                          className="py-2 pr-3 max-w-[120px] truncate text-[11px] text-[#93a4bf]"
                          title={row.purchased_from || ""}
                        >
                          {row.purchased_from || "—"}
                        </td>
                        <td
                          className="py-2 pr-3 whitespace-nowrap"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ProductUrlLink url={row.product_url} />
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">{row.total_quantity ?? 1}</td>
                        <td className="py-2 pr-3 text-right tabular-nums text-amber-200/90">
                          {row.assigned_total ?? 0}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums text-emerald-300/90">
                          {row.available ?? 0}
                        </td>
                        <td className="py-2 pr-2 text-right tabular-nums text-[#93a4bf]">
                          {formatChf(row.purchase_price_chf)}
                        </td>
                        <td className="py-2 pr-0 text-right">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/admin/inventory/${row.id}`);
                            }}
                            className="rounded-[8px] border border-white/[0.1] bg-transparent px-3 py-1.5 text-[13px] font-semibold text-[#93a4bf] hover:bg-white/[0.04]"
                          >
                            Öffnen
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-[13px] text-[#93a4bf]">
                <span>
                  {data.total} Einträge · {skip + 1}–
                  {Math.min(skip + data.items.length, data.total)}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={!canPrev}
                    onClick={() => setSkip((s) => Math.max(0, s - limit))}
                    className="rounded-lg border border-white/[0.12] px-3 py-1.5 disabled:opacity-40"
                  >
                    Zurück
                  </button>
                  <button
                    type="button"
                    disabled={!canNext}
                    onClick={() => setSkip((s) => s + limit)}
                    className="rounded-lg border border-white/[0.12] px-3 py-1.5 disabled:opacity-40"
                  >
                    Weiter
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[14px] border border-white/[0.08] bg-[#0b1220] p-6">
            <h4 className="m-0 text-lg font-semibold">Neuer Artikel</h4>
            {formErr ? <p className="mt-2 text-sm text-[#f87171]">{formErr}</p> : null}
            <form onSubmit={submitCreate} className="mt-4 grid grid-cols-1 gap-3 text-[#f8fafc]">
              <label className="text-[11px] text-[#93a4bf]">
                Name *
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-white/[0.1] bg-[#060b14] px-3 py-2 text-sm"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-[11px] text-[#93a4bf]">
                  Gesamtmenge *
                  <input
                    type="number"
                    min={1}
                    value={form.total_quantity}
                    onChange={(e) => setForm((f) => ({ ...f, total_quantity: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-white/[0.1] bg-[#060b14] px-3 py-2 text-sm"
                  />
                </label>
                <label className="text-[11px] text-[#93a4bf]">
                  Status
                  <select
                    value={form.status}
                    onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-white/[0.1] bg-[#060b14] px-3 py-2 text-sm"
                  >
                    <option value="active">Aktiv</option>
                    <option value="stored">Eingelagert</option>
                    <option value="repair">Reparatur</option>
                    <option value="disposed">Entsorgt</option>
                  </select>
                </label>
              </div>
              <label className="text-[11px] text-[#93a4bf]">
                Kategorie
                <input
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-white/[0.1] bg-[#060b14] px-3 py-2 text-sm"
                />
              </label>
              <label className="text-[11px] text-[#93a4bf]">
                Marke
                <input
                  value={form.brand}
                  onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-white/[0.1] bg-[#060b14] px-3 py-2 text-sm"
                />
              </label>
              <label className="text-[11px] text-[#93a4bf]">
                Zustand
                <input
                  value={form.condition}
                  onChange={(e) => setForm((f) => ({ ...f, condition: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-white/[0.1] bg-[#060b14] px-3 py-2 text-sm"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-[11px] text-[#93a4bf]">
                  Anschaffung CHF
                  <input
                    type="number"
                    step="0.01"
                    value={form.purchase_price_chf}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, purchase_price_chf: e.target.value }))
                    }
                    className="mt-1 w-full rounded-lg border border-white/[0.1] bg-[#060b14] px-3 py-2 text-sm"
                  />
                </label>
                <label className="text-[11px] text-[#93a4bf]">
                  Kaufdatum
                  <input
                    type="date"
                    value={form.purchase_date}
                    onChange={(e) => setForm((f) => ({ ...f, purchase_date: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-white/[0.1] bg-[#060b14] px-3 py-2 text-sm"
                  />
                </label>
              </div>
              <div className="rounded-lg border border-white/[0.06] bg-[#060b14]/50 p-3">
                <p className="m-0 text-[10px] font-bold uppercase tracking-[0.9px] text-[#93a4bf]">
                  Purchase / Supplier Info
                </p>
                <div className="mt-3 grid grid-cols-1 gap-3">
                  <label className="text-[11px] text-[#93a4bf]">
                    Lieferanten-Artikelnr.
                    <input
                      value={form.supplier_article_number}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, supplier_article_number: e.target.value }))
                      }
                      placeholder="z. B. Hersteller-SKU"
                      className="mt-1 w-full rounded-lg border border-white/[0.1] bg-[#060b14] px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="text-[11px] text-[#93a4bf]">
                    Gekauft bei
                    <input
                      value={form.purchased_from}
                      onChange={(e) => setForm((f) => ({ ...f, purchased_from: e.target.value }))}
                      placeholder="Händler / Lieferant"
                      className="mt-1 w-full rounded-lg border border-white/[0.1] bg-[#060b14] px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="text-[11px] text-[#93a4bf]">
                    Produkt-URL
                    <input
                      type="url"
                      inputMode="url"
                      value={form.product_url}
                      onChange={(e) => setForm((f) => ({ ...f, product_url: e.target.value }))}
                      placeholder="https://…"
                      className="mt-1 w-full rounded-lg border border-white/[0.1] bg-[#060b14] px-3 py-2 text-sm"
                    />
                  </label>
                </div>
              </div>
              <label className="text-[11px] text-[#93a4bf]">
                Notizen
                <textarea
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-white/[0.1] bg-[#060b14] px-3 py-2 text-sm"
                />
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setCreateOpen(false);
                    setFormErr("");
                  }}
                  className="rounded-lg border border-white/[0.12] px-4 py-2 text-sm"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-[#5b8cff] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {saving ? "…" : "Speichern"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
