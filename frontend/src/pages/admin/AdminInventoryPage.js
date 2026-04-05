import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  fetchAdminInventory,
  fetchAdminInventorySummary,
  createInventoryItem,
  postInventoryImportPreview,
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
    return <span className="text-[#64748b] dark:text-[#93a4bf]">—</span>;
  }
  const href = String(url).trim();
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex rounded-md border border-sky-300 bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-800 hover:bg-sky-100 dark:border-[#5b8cff]/40 dark:bg-[#5b8cff]/10 dark:text-[#5b8cff] dark:hover:bg-[#5b8cff]/20 ${className}`}
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

function draftToForm(draft) {
  if (!draft || typeof draft !== "object") return emptyItemForm();
  const pq = draft.total_quantity != null ? String(draft.total_quantity) : "1";
  const pp =
    draft.purchase_price_chf != null && draft.purchase_price_chf !== ""
      ? String(draft.purchase_price_chf)
      : "";
  const pd =
    draft.purchase_date != null && draft.purchase_date !== ""
      ? String(draft.purchase_date).slice(0, 10)
      : "";
  return {
    name: draft.name != null ? String(draft.name) : "",
    category: draft.category != null ? String(draft.category) : "",
    brand: draft.brand != null ? String(draft.brand) : "",
    total_quantity: pq,
    condition: draft.condition != null ? String(draft.condition) : "",
    status: draft.status != null ? String(draft.status) : "active",
    purchase_price_chf: pp,
    purchase_date: pd,
    supplier_article_number:
      draft.supplier_article_number != null ? String(draft.supplier_article_number) : "",
    purchased_from: draft.purchased_from != null ? String(draft.purchased_from) : "",
    product_url: draft.product_url != null ? String(draft.product_url) : "",
    notes: draft.notes != null ? String(draft.notes) : "",
  };
}

function inventoryBodyFromForm(f) {
  const tq = Math.max(1, parseInt(f.total_quantity, 10) || 1);
  const pu = parseOptionalProductUrl(f.product_url);
  if (pu.error) {
    return { _error: pu.error };
  }
  return {
    name: String(f.name || "").trim(),
    category: String(f.category || "").trim(),
    brand: String(f.brand || "").trim() || null,
    total_quantity: tq,
    condition: String(f.condition || "").trim(),
    status: String(f.status || "active").trim() || "active",
    purchase_price_chf:
      f.purchase_price_chf === "" || f.purchase_price_chf == null
        ? null
        : Number(f.purchase_price_chf),
    purchase_date: f.purchase_date ? f.purchase_date : null,
    supplier_article_number: String(f.supplier_article_number || "").trim() || null,
    purchased_from: String(f.purchased_from || "").trim() || null,
    product_url: pu.value,
    notes: String(f.notes || "").trim() || null,
  };
}

function FieldHint({ code }) {
  if (!code) return null;
  if (code === "review") {
    return (
      <p className="mt-0.5 text-[10px] text-amber-800 dark:text-amber-200/90">Bitte prüfen.</p>
    );
  }
  if (code === "missing") {
    return (
      <p className="mt-0.5 text-[10px] text-amber-800 dark:text-amber-200/90">
        Fehlt – bitte ergänzen.
      </p>
    );
  }
  return null;
}

/** Smart Import review only: derive Erkannt / Prüfen / Fehlt from hints + values. */
function importFieldReviewStatus(fieldKey, form, fieldHints) {
  const hint = fieldHints[fieldKey];
  const empty = (v) => v == null || String(v).trim() === "";

  if (fieldKey === "name") {
    if (empty(form.name)) return "fehlt";
    if (hint === "review") return "pruefen";
    return "erkannt";
  }
  if (fieldKey === "total_quantity") {
    const n = parseInt(form.total_quantity, 10);
    if (empty(form.total_quantity) || !Number.isFinite(n) || n < 1) return "fehlt";
    return "erkannt";
  }
  if (fieldKey === "status") {
    return "erkannt";
  }
  if (hint === "missing") return "fehlt";
  if (hint === "review") return "pruefen";
  if (!empty(form[fieldKey])) return "erkannt";
  return null;
}

function FieldReviewBadge({ status }) {
  if (!status) return null;
  const base =
    "mt-1 inline-flex rounded-md border px-1.5 py-0.5 text-[10px] font-semibold tracking-wide";
  if (status === "erkannt") {
    return (
      <span
        className={`${base} border-emerald-400/45 bg-emerald-50/90 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-950/45 dark:text-emerald-200/95`}
      >
        Erkannt
      </span>
    );
  }
  if (status === "pruefen") {
    return (
      <span
        className={`${base} border-amber-400/50 bg-amber-50/90 text-amber-950 dark:border-amber-500/35 dark:bg-amber-950/40 dark:text-amber-100`}
      >
        Prüfen
      </span>
    );
  }
  if (status === "fehlt") {
    return (
      <span
        className={`${base} border-rose-400/45 bg-rose-50/90 text-rose-950 dark:border-rose-500/35 dark:bg-rose-950/40 dark:text-rose-100`}
      >
        Fehlt
      </span>
    );
  }
  return null;
}

function InventoryItemFormFields({ form, setForm, fieldHints = {}, showReviewStatusBadges }) {
  const hintRow = (key) =>
    !showReviewStatusBadges && fieldHints[key] ? <FieldHint code={fieldHints[key]} /> : null;
  const badgeRow = (key) =>
    showReviewStatusBadges ? (
      <FieldReviewBadge status={importFieldReviewStatus(key, form, fieldHints)} />
    ) : null;

  return (
    <>
      <label className="text-[11px] text-[#64748b] dark:text-[#93a4bf]">
        Name *
        <input
          required
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          className="mt-1 w-full rounded-lg border border-black/10 bg-slate-100 px-3 py-2 text-sm text-[#0f172a] dark:border-white/[0.08] dark:bg-[#111520] dark:text-[#eef2ff]"
        />
        {badgeRow("name")}
        {hintRow("name")}
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-[11px] text-[#64748b] dark:text-[#93a4bf]">
          Gesamtmenge *
          <input
            type="number"
            min={1}
            value={form.total_quantity}
            onChange={(e) => setForm((f) => ({ ...f, total_quantity: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-black/10 bg-slate-100 px-3 py-2 text-sm text-[#0f172a] dark:border-white/[0.08] dark:bg-[#111520] dark:text-[#eef2ff]"
          />
          {badgeRow("total_quantity")}
        </label>
        <label className="text-[11px] text-[#64748b] dark:text-[#93a4bf]">
          Status
          <select
            value={form.status}
            onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-black/10 bg-slate-100 px-3 py-2 text-sm text-[#0f172a] dark:border-white/[0.08] dark:bg-[#111520] dark:text-[#eef2ff]"
          >
            <option value="active">Aktiv</option>
            <option value="stored">Eingelagert</option>
            <option value="repair">Reparatur</option>
            <option value="disposed">Entsorgt</option>
          </select>
          {badgeRow("status")}
        </label>
      </div>
      <label className="text-[11px] text-[#64748b] dark:text-[#93a4bf]">
        Kategorie
        <input
          value={form.category}
          onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
          className="mt-1 w-full rounded-lg border border-black/10 bg-slate-100 px-3 py-2 text-sm text-[#0f172a] dark:border-white/[0.08] dark:bg-[#111520] dark:text-[#eef2ff]"
        />
        {badgeRow("category")}
        {hintRow("category")}
      </label>
      <label className="text-[11px] text-[#64748b] dark:text-[#93a4bf]">
        Marke
        <input
          value={form.brand}
          onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))}
          className="mt-1 w-full rounded-lg border border-black/10 bg-slate-100 px-3 py-2 text-sm text-[#0f172a] dark:border-white/[0.08] dark:bg-[#111520] dark:text-[#eef2ff]"
        />
        {badgeRow("brand")}
        {hintRow("brand")}
      </label>
      <label className="text-[11px] text-[#64748b] dark:text-[#93a4bf]">
        Zustand
        <input
          value={form.condition}
          onChange={(e) => setForm((f) => ({ ...f, condition: e.target.value }))}
          className="mt-1 w-full rounded-lg border border-black/10 bg-slate-100 px-3 py-2 text-sm text-[#0f172a] dark:border-white/[0.08] dark:bg-[#111520] dark:text-[#eef2ff]"
        />
        {badgeRow("condition")}
        {hintRow("condition")}
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-[11px] text-[#64748b] dark:text-[#93a4bf]">
          Anschaffung CHF
          <input
            type="number"
            step="0.01"
            value={form.purchase_price_chf}
            onChange={(e) =>
              setForm((f) => ({ ...f, purchase_price_chf: e.target.value }))
            }
            className="mt-1 w-full rounded-lg border border-black/10 bg-slate-100 px-3 py-2 text-sm text-[#0f172a] dark:border-white/[0.08] dark:bg-[#111520] dark:text-[#eef2ff]"
          />
          {badgeRow("purchase_price_chf")}
          {hintRow("purchase_price_chf")}
        </label>
        <label className="text-[11px] text-[#64748b] dark:text-[#93a4bf]">
          Kaufdatum
          <input
            type="date"
            value={form.purchase_date}
            onChange={(e) => setForm((f) => ({ ...f, purchase_date: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-black/10 bg-slate-100 px-3 py-2 text-sm text-[#0f172a] dark:border-white/[0.08] dark:bg-[#111520] dark:text-[#eef2ff]"
          />
          {badgeRow("purchase_date")}
          {hintRow("purchase_date")}
        </label>
      </div>
      <div className="rounded-lg border border-black/10 bg-slate-50 p-3 dark:border-white/[0.06] dark:bg-[#111520]/80">
        <p className="m-0 text-[10px] font-bold uppercase tracking-[0.9px] text-[#64748b] dark:text-[#93a4bf]">
          Purchase / Supplier Info
        </p>
        <div className="mt-3 grid grid-cols-1 gap-3">
          <label className="text-[11px] text-[#64748b] dark:text-[#93a4bf]">
            Lieferanten-Artikelnr.
            <input
              value={form.supplier_article_number}
              onChange={(e) =>
                setForm((f) => ({ ...f, supplier_article_number: e.target.value }))
              }
              placeholder="z. B. Hersteller-SKU"
              className="mt-1 w-full rounded-lg border border-black/10 bg-slate-100 px-3 py-2 text-sm text-[#0f172a] dark:border-white/[0.08] dark:bg-[#111520] dark:text-[#eef2ff]"
            />
            {badgeRow("supplier_article_number")}
            {hintRow("supplier_article_number")}
          </label>
          <label className="text-[11px] text-[#64748b] dark:text-[#93a4bf]">
            Gekauft bei
            <input
              value={form.purchased_from}
              onChange={(e) => setForm((f) => ({ ...f, purchased_from: e.target.value }))}
              placeholder="Händler / Lieferant"
              className="mt-1 w-full rounded-lg border border-black/10 bg-slate-100 px-3 py-2 text-sm text-[#0f172a] dark:border-white/[0.08] dark:bg-[#111520] dark:text-[#eef2ff]"
            />
            {badgeRow("purchased_from")}
            {hintRow("purchased_from")}
          </label>
          <label className="text-[11px] text-[#64748b] dark:text-[#93a4bf]">
            Produkt-URL
            <input
              type="url"
              inputMode="url"
              value={form.product_url}
              onChange={(e) => setForm((f) => ({ ...f, product_url: e.target.value }))}
              placeholder="https://…"
              className="mt-1 w-full rounded-lg border border-black/10 bg-slate-100 px-3 py-2 text-sm text-[#0f172a] dark:border-white/[0.08] dark:bg-[#111520] dark:text-[#eef2ff]"
            />
            {badgeRow("product_url")}
            {hintRow("product_url")}
          </label>
        </div>
      </div>
      <label className="text-[11px] text-[#64748b] dark:text-[#93a4bf]">
        Notizen
        <textarea
          rows={2}
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          className="mt-1 w-full rounded-lg border border-black/10 bg-slate-100 px-3 py-2 text-sm text-[#0f172a] dark:border-white/[0.08] dark:bg-[#111520] dark:text-[#eef2ff]"
        />
        {badgeRow("notes")}
        {hintRow("notes")}
      </label>
    </>
  );
}

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

  const [smartImportOpen, setSmartImportOpen] = useState(false);
  const [importStep, setImportStep] = useState(1);
  const [importMode, setImportMode] = useState("url");
  const [importUrl, setImportUrl] = useState("");
  const [importText, setImportText] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [importForm, setImportForm] = useState(emptyItemForm());
  const [importFieldHints, setImportFieldHints] = useState({});
  const [importMeta, setImportMeta] = useState(null);
  const [importWarnings, setImportWarnings] = useState([]);
  const [importErr, setImportErr] = useState("");
  const [importSaving, setImportSaving] = useState(false);

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

  function openSmartImport() {
    setImportStep(1);
    setImportMode("url");
    setImportUrl("");
    setImportText("");
    setImportForm(emptyItemForm());
    setImportFieldHints({});
    setImportMeta(null);
    setImportWarnings([]);
    setImportErr("");
    setSmartImportOpen(true);
  }

  function closeSmartImport() {
    setSmartImportOpen(false);
    setImportErr("");
    setPreviewLoading(false);
  }

  async function runImportPreview() {
    setImportErr("");
    if (importMode === "url") {
      const u = String(importUrl || "").trim();
      if (!u) {
        setImportErr("Bitte eine URL eingeben.");
        return;
      }
      setPreviewLoading(true);
      try {
        const data = await postInventoryImportPreview({ source_type: "url", url: u });
        setImportForm(draftToForm(data.draft));
        setImportFieldHints(data.field_hints && typeof data.field_hints === "object" ? data.field_hints : {});
        setImportMeta(data.meta || null);
        setImportWarnings(Array.isArray(data.warnings) ? data.warnings : []);
        setImportStep(2);
      } catch (err) {
        setImportErr(err?.message || "Vorschau fehlgeschlagen.");
      } finally {
        setPreviewLoading(false);
      }
    } else {
      const t = String(importText || "").trim();
      if (!t) {
        setImportErr("Bitte Text eingeben.");
        return;
      }
      setPreviewLoading(true);
      try {
        const data = await postInventoryImportPreview({ source_type: "text", text: t });
        setImportForm(draftToForm(data.draft));
        setImportFieldHints(data.field_hints && typeof data.field_hints === "object" ? data.field_hints : {});
        setImportMeta(data.meta || null);
        setImportWarnings(Array.isArray(data.warnings) ? data.warnings : []);
        setImportStep(2);
      } catch (err) {
        setImportErr(err?.message || "Vorschau fehlgeschlagen.");
      } finally {
        setPreviewLoading(false);
      }
    }
  }

  async function submitImportSave(e) {
    e.preventDefault();
    const b = inventoryBodyFromForm(importForm);
    if (b._error) {
      setImportErr(b._error);
      return;
    }
    if (!b.name) {
      setImportErr("Name erforderlich.");
      return;
    }
    setImportSaving(true);
    setImportErr("");
    try {
      await createInventoryItem(b);
      closeSmartImport();
      load();
    } catch (err) {
      setImportErr(err?.message || "Fehler.");
    } finally {
      setImportSaving(false);
    }
  }

  function continueImportAsManualForm() {
    setForm({ ...importForm });
    setFormErr("");
    closeSmartImport();
    setCreateOpen(true);
  }

  async function submitCreate(e) {
    e.preventDefault();
    const b = inventoryBodyFromForm(form);
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
      className="min-h-screen bg-[#f8fafc] text-[#0f172a] [color-scheme:light] dark:bg-[#07090f] dark:text-[#eef2ff] dark:[color-scheme:dark]"
      data-testid="admin-inventory-page"
    >
      <div className="mx-auto max-w-[min(1400px,100%)] gap-4 p-6">
        <div className="mb-6 rounded-[14px] border border-black/10 bg-white p-6 dark:border-white/[0.07] dark:bg-[#141824]">
          <p className="text-[9px] font-bold uppercase tracking-[1px] text-[#64748b] dark:text-[#6b7a9a]">
            Betrieb
          </p>
          <h1 className="mt-1 text-[22px] font-bold tracking-tight text-[#0f172a] dark:text-[#f8fafc]">
            Inventar (Bestand)
          </h1>
          <p className="mt-2 max-w-[800px] text-[13px] leading-relaxed text-[#64748b] dark:text-[#93a4bf]">
            Artikel mit Gesamtmenge und Zuordnung auf Units. Anschaffungspreise sind Investitionsdaten
            — keine Betriebskosten (UnitCost).
          </p>
          {summary && !loading ? (
            <p className="mt-3 text-[13px] text-[#64748b] dark:text-[#93a4bf]">
              <span className="font-semibold text-[#0f172a] dark:text-[#f8fafc]">{summary.total_skus}</span>{" "}
              Artikel ·{" "}
              <span className="font-semibold text-[#0f172a] dark:text-[#f8fafc]">{summary.total_pieces}</span>{" "}
              Stück gesamt ·{" "}
              <span className="font-semibold text-[#0f172a] dark:text-[#f8fafc]">{summary.assigned_total}</span>{" "}
              zugeordnet ·{" "}
              <span className="font-semibold text-[#0f172a] dark:text-[#f8fafc]">{summary.available_total}</span>{" "}
              frei
            </p>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={openCreate}
              className="rounded-lg bg-[#5b8cff] px-4 py-2 text-sm font-semibold text-white hover:bg-[#4a7ae8]"
            >
              Neuer Artikel
            </button>
            <button
              type="button"
              onClick={openSmartImport}
              className="rounded-lg border border-black/15 bg-white px-4 py-2 text-sm font-semibold text-[#0f172a] hover:bg-slate-50 dark:border-white/[0.14] dark:bg-[#1a1f2e] dark:text-[#eef2ff] dark:hover:bg-white/[0.06]"
            >
              Smart Import
            </button>
          </div>
        </div>

        {error ? <p className="mb-4 text-sm text-[#f87171]">{error}</p> : null}

        <div className="rounded-[14px] border border-black/10 bg-white p-4 dark:border-white/[0.07] dark:bg-[#141824]">
          {loading ? (
            <p className="text-sm text-[#64748b] dark:text-[#93a4bf]">Lade …</p>
          ) : data.items.length === 0 ? (
            <p className="text-sm text-[#64748b] dark:text-[#93a4bf]">Keine Artikel.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-black/10 text-[9px] font-bold uppercase tracking-[0.8px] text-[#64748b] dark:border-white/[0.08] dark:text-[#6b7a9a]">
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
                        className="cursor-pointer border-b border-black/5 hover:bg-black/[0.02] dark:border-white/[0.05] dark:hover:bg-white/[0.02]"
                        onClick={() => navigate(`/admin/inventory/${row.id}`)}
                      >
                        <td className="py-2 pr-3 font-mono text-[12px] text-[#64748b] dark:text-[#93a4bf]">
                          {row.inventory_number}
                        </td>
                        <td className="py-2 pr-3 font-medium">
                          <Link
                            to={`/admin/inventory/${row.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="text-[#0f172a] hover:text-[#5b8cff] hover:underline dark:text-[#f8fafc]"
                          >
                            {row.name}
                          </Link>
                        </td>
                        <td className="py-2 pr-3 text-[#64748b] dark:text-[#93a4bf]">{row.category || "—"}</td>
                        <td
                          className="py-2 pr-3 max-w-[100px] truncate text-[11px] text-[#64748b] dark:text-[#93a4bf]"
                          title={row.supplier_article_number || ""}
                        >
                          {row.supplier_article_number || "—"}
                        </td>
                        <td
                          className="py-2 pr-3 max-w-[120px] truncate text-[11px] text-[#64748b] dark:text-[#93a4bf]"
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
                        <td className="py-2 pr-3 text-right tabular-nums text-amber-700 dark:text-amber-200/90">
                          {row.assigned_total ?? 0}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums text-emerald-700 dark:text-emerald-300/90">
                          {row.available ?? 0}
                        </td>
                        <td className="py-2 pr-2 text-right tabular-nums text-[#64748b] dark:text-[#93a4bf]">
                          {formatChf(row.purchase_price_chf)}
                        </td>
                        <td className="py-2 pr-0 text-right">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/admin/inventory/${row.id}`);
                            }}
                            className="rounded-[8px] border border-black/10 bg-transparent px-3 py-1.5 text-[13px] font-semibold text-[#64748b] hover:bg-slate-100 dark:border-white/[0.1] dark:text-[#93a4bf] dark:hover:bg-white/[0.04]"
                          >
                            Öffnen
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-[13px] text-[#64748b] dark:text-[#93a4bf]">
                <span>
                  {data.total} Einträge · {skip + 1}–
                  {Math.min(skip + data.items.length, data.total)}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={!canPrev}
                    onClick={() => setSkip((s) => Math.max(0, s - limit))}
                    className="rounded-lg border border-black/10 px-3 py-1.5 disabled:opacity-40 dark:border-white/[0.12]"
                  >
                    Zurück
                  </button>
                  <button
                    type="button"
                    disabled={!canNext}
                    onClick={() => setSkip((s) => s + limit)}
                    className="rounded-lg border border-black/10 px-3 py-1.5 disabled:opacity-40 dark:border-white/[0.12]"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 dark:bg-black/60">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[14px] border border-black/10 bg-white p-6 dark:border-white/[0.07] dark:bg-[#141824]">
            <h4 className="m-0 text-lg font-semibold text-[#0f172a] dark:text-[#eef2ff]">Neuer Artikel</h4>
            {formErr ? <p className="mt-2 text-sm text-[#f87171]">{formErr}</p> : null}
            <form
              onSubmit={submitCreate}
              className="mt-4 grid grid-cols-1 gap-3 text-[#0f172a] dark:text-[#eef2ff]"
            >
              <InventoryItemFormFields form={form} setForm={setForm} />
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setCreateOpen(false);
                    setFormErr("");
                  }}
                  className="rounded-lg border border-black/10 px-4 py-2 text-sm text-[#0f172a] hover:bg-slate-100 dark:border-white/[0.12] dark:text-[#eef2ff] dark:hover:bg-white/[0.04]"
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

      {smartImportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 dark:bg-black/60">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[14px] border border-black/10 bg-white p-6 dark:border-white/[0.07] dark:bg-[#141824]">
            <h4 className="m-0 text-lg font-semibold text-[#0f172a] dark:text-[#eef2ff]">Smart Import</h4>
            {importErr ? <p className="mt-2 text-sm text-[#f87171]">{importErr}</p> : null}

            {importStep === 1 ? (
              <div className="mt-4 space-y-4 text-[#0f172a] dark:text-[#eef2ff]">
                <p className="m-0 text-[13px] leading-relaxed text-[#64748b] dark:text-[#93a4bf]">
                  Fügen Sie eine Produkt-URL oder Freitext ein. Es wird eine deterministische Vorschau
                  erzeugt — ohne Live-Analyse.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setImportMode("url")}
                    className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
                      importMode === "url"
                        ? "bg-[#5b8cff] text-white"
                        : "border border-black/10 bg-slate-100 text-[#0f172a] dark:border-white/[0.12] dark:bg-[#111520] dark:text-[#eef2ff]"
                    }`}
                  >
                    URL
                  </button>
                  <button
                    type="button"
                    onClick={() => setImportMode("text")}
                    className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
                      importMode === "text"
                        ? "bg-[#5b8cff] text-white"
                        : "border border-black/10 bg-slate-100 text-[#0f172a] dark:border-white/[0.12] dark:bg-[#111520] dark:text-[#eef2ff]"
                    }`}
                  >
                    Text
                  </button>
                </div>
                {importMode === "url" ? (
                  <label className="block text-[11px] text-[#64748b] dark:text-[#93a4bf]">
                    Produkt-URL
                    <input
                      type="url"
                      inputMode="url"
                      value={importUrl}
                      onChange={(e) => setImportUrl(e.target.value)}
                      placeholder="https://…"
                      className="mt-1 w-full rounded-lg border border-black/10 bg-slate-100 px-3 py-2 text-sm text-[#0f172a] dark:border-white/[0.08] dark:bg-[#111520] dark:text-[#eef2ff]"
                    />
                  </label>
                ) : (
                  <label className="block text-[11px] text-[#64748b] dark:text-[#93a4bf]">
                    Text
                    <textarea
                      rows={6}
                      value={importText}
                      onChange={(e) => setImportText(e.target.value)}
                      placeholder="Produktbeschreibung, Notizen, Preis …"
                      className="mt-1 w-full rounded-lg border border-black/10 bg-slate-100 px-3 py-2 text-sm text-[#0f172a] dark:border-white/[0.08] dark:bg-[#111520] dark:text-[#eef2ff]"
                    />
                  </label>
                )}
                <div className="flex flex-wrap justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={closeSmartImport}
                    className="rounded-lg border border-black/10 px-4 py-2 text-sm text-[#0f172a] hover:bg-slate-100 dark:border-white/[0.12] dark:text-[#eef2ff] dark:hover:bg-white/[0.04]"
                  >
                    Abbrechen
                  </button>
                  <button
                    type="button"
                    disabled={previewLoading}
                    onClick={runImportPreview}
                    className="rounded-lg bg-[#5b8cff] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {previewLoading ? "…" : "Vorschläge anzeigen"}
                  </button>
                </div>
              </div>
            ) : (
              <form
                onSubmit={submitImportSave}
                className="mt-4 grid grid-cols-1 gap-3 text-[#0f172a] dark:text-[#eef2ff]"
              >
                <div
                  role="status"
                  className="space-y-2 rounded-lg border border-amber-400/45 bg-amber-50/95 px-3 py-3 text-[12px] text-amber-950 dark:border-amber-500/35 dark:bg-amber-950/40 dark:text-amber-100"
                >
                  <h3 className="m-0 text-[13px] font-semibold leading-snug text-amber-950 dark:text-amber-50">
                    Automatisch erkannte Daten (bitte prüfen)
                  </h3>
                  <p className="m-0 leading-relaxed text-amber-900/95 dark:text-amber-100/95">
                    Bitte prüfen Sie alle importierten Felder vor dem Speichern.
                  </p>
                </div>
                {importWarnings.length > 0 ? (
                  <ul className="m-0 list-inside list-disc space-y-1 text-[12px] text-[#64748b] dark:text-[#93a4bf]">
                    {importWarnings.map((w, i) => (
                      <li key={i}>
                        {typeof w === "object" && w != null && w.message
                          ? String(w.message)
                          : String(w)}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {importMeta && typeof importMeta === "object" ? (
                  <p className="m-0 text-[11px] text-[#64748b] dark:text-[#93a4bf]">
                    Quelle: {importMeta.source_type === "text" ? "Text" : "URL"}
                    {importMeta.source_excerpt
                      ? ` · ${String(importMeta.source_excerpt).slice(0, 120)}${
                          String(importMeta.source_excerpt).length > 120 ? "…" : ""
                        }`
                      : ""}
                  </p>
                ) : null}
                <InventoryItemFormFields
                  form={importForm}
                  setForm={setImportForm}
                  fieldHints={importFieldHints}
                  showReviewStatusBadges
                />
                <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:flex-wrap sm:justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setImportStep(1);
                      setImportErr("");
                    }}
                    className="rounded-lg border border-black/10 px-4 py-2 text-sm text-[#0f172a] hover:bg-slate-100 dark:border-white/[0.12] dark:text-[#eef2ff] dark:hover:bg-white/[0.04]"
                  >
                    Zurück
                  </button>
                  <button
                    type="button"
                    onClick={continueImportAsManualForm}
                    className="rounded-lg border border-black/10 px-4 py-2 text-sm text-[#0f172a] hover:bg-slate-100 dark:border-white/[0.12] dark:text-[#eef2ff] dark:hover:bg-white/[0.04]"
                  >
                    Als normales Formular weiterbearbeiten
                  </button>
                  <button
                    type="submit"
                    disabled={importSaving}
                    className="rounded-lg bg-[#5b8cff] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {importSaving ? "…" : "Artikel speichern"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
