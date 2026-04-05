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
    return <span className="text-[#4a5070]">—</span>;
  }
  const href = String(url).trim();
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex rounded-[6px] border border-[rgba(91,156,246,0.2)] bg-[rgba(91,156,246,0.1)] px-[10px] py-[3px] text-[10px] text-[#5b9cf6] transition-colors hover:bg-[rgba(91,156,246,0.2)] ${className}`}
    >
      Produkt öffnen ↗
    </a>
  );
}

function categoryBadgeClass(cat) {
  const c = String(cat || "").trim();
  if (c === "Wohnzimmer") {
    return "border border-[rgba(157,124,244,0.2)] bg-[rgba(157,124,244,0.1)] text-[#9d7cf4]";
  }
  if (c === "Schlafzimmer") {
    return "border border-[rgba(91,156,246,0.2)] bg-[rgba(91,156,246,0.1)] text-[#5b9cf6]";
  }
  if (c === "Küche") {
    return "border border-[rgba(245,166,35,0.2)] bg-[rgba(245,166,35,0.1)] text-[#f5a623]";
  }
  return "border border-[#1c2035] bg-[#191c28] text-[#8892b0]";
}

const INVENTORY_CATEGORIES = [
  "Wohnzimmer",
  "Schlafzimmer",
  "Küche",
  "Esszimmer",
  "Badezimmer",
  "Balkon / Terrasse",
  "Büro",
  "Flur / Eingangsbereich",
  "Sonstiges",
];

function buildCategorySelectOptions(currentValue) {
  const v = String(currentValue || "").trim();
  if (v && !INVENTORY_CATEGORIES.includes(v)) {
    return [v, ...INVENTORY_CATEGORIES];
  }
  return [...INVENTORY_CATEGORIES];
}

function normalizeInventoryCategory(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  if (INVENTORY_CATEGORIES.includes(s)) return s;
  const lower = s.toLowerCase();
  const hit = INVENTORY_CATEGORIES.find((c) => c.toLowerCase() === lower);
  return hit || s;
}

const emptyItemForm = () => ({
  name: "",
  category: "",
  brand: "",
  total_quantity: "1",
  condition: "",
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
    category: normalizeInventoryCategory(draft.category != null ? String(draft.category) : ""),
    brand: draft.brand != null ? String(draft.brand) : "",
    total_quantity: pq,
    condition: draft.condition != null ? String(draft.condition) : "",
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

function InventoryItemFormFields({
  form,
  setForm,
  fieldHints = {},
  showReviewStatusBadges,
  statusReadOnlyLabel,
}) {
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
        <div className="text-[11px] text-[#64748b] dark:text-[#93a4bf]">
          Status
          <p className="mt-1 rounded-lg border border-black/10 border-dashed bg-slate-50 px-3 py-2 text-sm text-[#0f172a] dark:border-white/[0.1] dark:bg-[#111520]/60 dark:text-[#eef2ff]">
            {statusReadOnlyLabel || "—"}
          </p>
        </div>
      </div>
      <label className="text-[11px] text-[#64748b] dark:text-[#93a4bf]">
        Kategorie
        <select
          value={form.category}
          onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
          className="mt-1 w-full rounded-lg border border-black/10 bg-slate-100 px-3 py-2 text-sm text-[#0f172a] dark:border-white/[0.08] dark:bg-[#111520] dark:text-[#eef2ff]"
        >
          <option value="">—</option>
          {buildCategorySelectOptions(form.category).map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
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

  const kpiSku = loading ? "—" : summary != null ? summary.total_skus : "—";
  const kpiPieces = loading ? "—" : summary != null ? summary.total_pieces : "—";
  const kpiAssigned = loading ? "—" : summary != null ? summary.assigned_total : "—";
  const kpiFree = loading ? "—" : summary != null ? summary.available_total : "—";
  const kpiTotalValue =
    loading || !summary
      ? "—"
      : summary.total_purchase_value_chf != null
        ? formatChf(summary.total_purchase_value_chf)
        : summary.total_anschaffung_chf != null
          ? formatChf(summary.total_anschaffung_chf)
          : "—";

  return (
    <div
      className="-m-6 min-h-screen bg-[#080a0f]"
      data-testid="admin-inventory-page"
    >
      <div className="sticky top-0 z-30 flex h-[50px] items-center justify-between border-b border-[#1c2035] bg-[#0c0e15] px-6 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-[#edf0f7]">
            Van<span className="text-[#5b9cf6]">tio</span>
          </span>
          <span className="text-[#4a5070]">·</span>
          <span className="text-[14px] font-medium text-[#edf0f7]">Inventar</span>
        </div>
        <div className="flex gap-[8px]">
          <button
            type="button"
            onClick={openSmartImport}
            className="rounded-[6px] border border-[#252a3a] bg-[#141720] px-[14px] py-[5px] text-[11px] text-[#8892b0] hover:border-[#242840] hover:text-[#edf0f7]"
          >
            Smart Import
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="rounded-[6px] border border-[rgba(91,156,246,0.28)] bg-[rgba(91,156,246,0.1)] px-[14px] py-[5px] text-[11px] font-medium text-[#5b9cf6]"
          >
            + Neuer Artikel
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-4 px-6 py-5">
        {error ? <p className="text-sm text-[#ff5f6d]">{error}</p> : null}

        <div>
          <div className="mb-[10px] flex items-center gap-2">
            <span className="text-[10px] font-medium uppercase tracking-[0.8px] text-[#4a5070]">
              Bestand · Übersicht
            </span>
            <div className="h-px flex-1 bg-[#1c2035]" />
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <div className="relative overflow-hidden rounded-[10px] border border-[#1c2035] bg-[#10121a] p-[13px_15px] transition-colors hover:border-[#242840]">
              <div className="absolute left-0 right-0 top-0 h-[2px] rounded-t-[10px] bg-[#5b9cf6]" />
              <p className="mb-[4px] text-[9px] font-medium uppercase tracking-[0.5px] text-[#4a5070]">
                Artikel gesamt
              </p>
              <p className="mb-[4px] font-mono text-[20px] font-medium leading-none text-[#5b9cf6]">{kpiSku}</p>
              <p className="text-[10px] leading-[1.4] text-[#4a5070]">Erfasste Artikel (SKUs)</p>
            </div>
            <div className="relative overflow-hidden rounded-[10px] border border-[#1c2035] bg-[#10121a] p-[13px_15px] transition-colors hover:border-[#242840]">
              <div className="absolute left-0 right-0 top-0 h-[2px] rounded-t-[10px] bg-[#edf0f7]" />
              <p className="mb-[4px] text-[9px] font-medium uppercase tracking-[0.5px] text-[#4a5070]">
                Stück gesamt
              </p>
              <p className="mb-[4px] font-mono text-[20px] font-medium leading-none text-[#edf0f7]">{kpiPieces}</p>
              <p className="text-[10px] leading-[1.4] text-[#4a5070]">Summe aller Stückzahlen</p>
            </div>
            <div className="relative overflow-hidden rounded-[10px] border border-[#1c2035] bg-[#10121a] p-[13px_15px] transition-colors hover:border-[#242840]">
              <div className="absolute left-0 right-0 top-0 h-[2px] rounded-t-[10px] bg-[#3ddc84]" />
              <p className="mb-[4px] text-[9px] font-medium uppercase tracking-[0.5px] text-[#4a5070]">Zugeordnet</p>
              <p className="mb-[4px] font-mono text-[20px] font-medium leading-none text-[#3ddc84]">{kpiAssigned}</p>
              <p className="text-[10px] leading-[1.4] text-[#4a5070]">Auf Units verteilt</p>
            </div>
            <div className="relative overflow-hidden rounded-[10px] border border-[#1c2035] bg-[#10121a] p-[13px_15px] transition-colors hover:border-[#242840]">
              <div className="absolute left-0 right-0 top-0 h-[2px] rounded-t-[10px] bg-[#f5a623]" />
              <p className="mb-[4px] text-[9px] font-medium uppercase tracking-[0.5px] text-[#4a5070]">Frei / Lager</p>
              <p className="mb-[4px] font-mono text-[20px] font-medium leading-none text-[#f5a623]">{kpiFree}</p>
              <p className="text-[10px] leading-[1.4] text-[#4a5070]">Noch nicht zugeordnet</p>
            </div>
            <div className="relative overflow-hidden rounded-[10px] border border-[#1c2035] bg-[#10121a] p-[13px_15px] transition-colors hover:border-[#242840]">
              <div className="absolute left-0 right-0 top-0 h-[2px] rounded-t-[10px] bg-[#9d7cf4]" />
              <p className="mb-[4px] text-[9px] font-medium uppercase tracking-[0.5px] text-[#4a5070]">Gesamtwert</p>
              <p className="mb-[4px] font-mono text-[17px] font-medium leading-none text-[#9d7cf4]">{kpiTotalValue}</p>
              <p className="text-[10px] leading-[1.4] text-[#4a5070]">Summe aller Anschaffungspreise</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-[10px] rounded-[10px] border border-[#1c2035] bg-[#10121a] px-[16px] py-[12px]">
          <div className="flex flex-col gap-[3px]">
            <span className="text-[9px] font-medium uppercase tracking-[0.5px] text-[#4a5070]">Suche</span>
            <input
              type="search"
              defaultValue=""
              placeholder="Artikelname, Nr., Lieferant…"
              className="w-[200px] rounded-[6px] border border-[#1c2035] bg-[#141720] px-[10px] py-[5px] font-['DM_Sans'] text-[12px] text-[#edf0f7] outline-none placeholder:text-[#4a5070]"
              onChange={() => {}}
            />
          </div>
          <div className="hidden h-[32px] w-px bg-[#1c2035] sm:block" />
          <div className="flex flex-col gap-[3px]">
            <span className="text-[9px] font-medium uppercase tracking-[0.5px] text-[#4a5070]">Status</span>
            <select
              defaultValue="all"
              className="cursor-pointer appearance-none rounded-[6px] border border-[#1c2035] bg-[#141720] px-[10px] py-[5px] font-['DM_Sans'] text-[12px] text-[#edf0f7]"
              onChange={() => {}}
            >
              <option value="all">Alle Status</option>
              <option value="assigned">Zugeordnet</option>
              <option value="free">Frei</option>
              <option value="storage">Lager</option>
            </select>
          </div>
          <div className="hidden h-[32px] w-px bg-[#1c2035] sm:block" />
          <div className="flex flex-col gap-[3px]">
            <span className="text-[9px] font-medium uppercase tracking-[0.5px] text-[#4a5070]">Unit / Apartment</span>
            <select
              defaultValue=""
              className="min-w-[160px] cursor-pointer appearance-none rounded-[6px] border border-[#1c2035] bg-[#141720] px-[10px] py-[5px] font-['DM_Sans'] text-[12px] text-[#edf0f7]"
              onChange={() => {}}
            >
              <option value="">Alle Units</option>
            </select>
          </div>
          <div className="hidden h-[32px] w-px bg-[#1c2035] sm:block" />
          <div className="flex flex-col gap-[3px]">
            <span className="text-[9px] font-medium uppercase tracking-[0.5px] text-[#4a5070]">Kategorie</span>
            <select
              defaultValue=""
              className="min-w-[160px] cursor-pointer appearance-none rounded-[6px] border border-[#1c2035] bg-[#141720] px-[10px] py-[5px] font-['DM_Sans'] text-[12px] text-[#edf0f7]"
              onChange={() => {}}
            >
              <option value="">Alle Kategorien</option>
              {INVENTORY_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <span className="ml-auto text-[11px] text-[#4a5070]">
            {data.total} Artikel · Filter folgen
          </span>
        </div>

        <div>
          <div className="mb-[10px] flex items-center gap-2">
            <span className="text-[10px] font-medium uppercase tracking-[0.8px] text-[#4a5070]">
              Inventar
            </span>
            <div className="h-px flex-1 bg-[#1c2035]" />
          </div>
          <div className="overflow-hidden rounded-[12px] border border-[#1c2035] bg-[#10121a]">
            <div className="flex flex-col gap-2 border-b border-[#1c2035] px-[18px] py-[13px] sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-[13px] font-medium text-[#edf0f7]">Alle Artikel</h3>
                <p className="mt-[2px] text-[10px] text-[#4a5070]">
                  Artikel mit Gesamtmenge und Zuordnung auf Units
                </p>
              </div>
              <span className="w-fit rounded-[6px] border border-[#1c2035] bg-[#141720] px-[10px] py-[3px] text-[10px] text-[#4a5070]">
                {data.total} Einträge
              </span>
            </div>
            {loading ? (
              <p className="px-[18px] py-[16px] text-[12px] text-[#4a5070]">Lade …</p>
            ) : data.items.length === 0 ? (
              <p className="px-[18px] py-[16px] text-[12px] text-[#4a5070]">Keine Artikel.</p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left">
                    <thead>
                      <tr>
                        <th className="whitespace-nowrap border-b border-[#1c2035] px-[14px] py-[8px] text-left text-[9px] font-medium uppercase tracking-[0.6px] text-[#4a5070]">
                          Nr.
                        </th>
                        <th className="whitespace-nowrap border-b border-[#1c2035] px-[14px] py-[8px] text-left text-[9px] font-medium uppercase tracking-[0.6px] text-[#4a5070]">
                          Name
                        </th>
                        <th className="whitespace-nowrap border-b border-[#1c2035] px-[14px] py-[8px] text-left text-[9px] font-medium uppercase tracking-[0.6px] text-[#4a5070]">
                          Kategorie
                        </th>
                        <th className="whitespace-nowrap border-b border-[#1c2035] px-[14px] py-[8px] text-left text-[9px] font-medium uppercase tracking-[0.6px] text-[#4a5070]">
                          Lief.-Nr.
                        </th>
                        <th className="whitespace-nowrap border-b border-[#1c2035] px-[14px] py-[8px] text-left text-[9px] font-medium uppercase tracking-[0.6px] text-[#4a5070]">
                          Bezug
                        </th>
                        <th className="whitespace-nowrap border-b border-[#1c2035] px-[14px] py-[8px] text-left text-[9px] font-medium uppercase tracking-[0.6px] text-[#4a5070]">
                          Produkt
                        </th>
                        <th className="whitespace-nowrap border-b border-[#1c2035] px-[14px] py-[8px] text-right text-[9px] font-medium uppercase tracking-[0.6px] text-[#4a5070]">
                          Gesamt
                        </th>
                        <th className="whitespace-nowrap border-b border-[#1c2035] px-[14px] py-[8px] text-right text-[9px] font-medium uppercase tracking-[0.6px] text-[#4a5070]">
                          Zugeordnet
                        </th>
                        <th className="whitespace-nowrap border-b border-[#1c2035] px-[14px] py-[8px] text-right text-[9px] font-medium uppercase tracking-[0.6px] text-[#4a5070]">
                          Frei
                        </th>
                        <th className="whitespace-nowrap border-b border-[#1c2035] px-[14px] py-[8px] text-right text-[9px] font-medium uppercase tracking-[0.6px] text-[#4a5070]">
                          Anschaffung
                        </th>
                        <th className="whitespace-nowrap border-b border-[#1c2035] px-[14px] py-[8px] text-right text-[9px] font-medium uppercase tracking-[0.6px] text-[#4a5070]">
                          Aktionen
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.items.map((row, idx, arr) => {
                        const tot = row.total_quantity ?? 1;
                        const asg = row.assigned_total ?? 0;
                        const free = row.available ?? 0;
                        return (
                          <tr
                            key={row.id}
                            className={`cursor-pointer border-b border-[#1c2035] text-[11px] text-[#8892b0] transition-colors hover:bg-[#141720] ${
                              idx === arr.length - 1 ? "border-b-0" : ""
                            }`}
                            onClick={() => navigate(`/admin/inventory/${row.id}`)}
                          >
                            <td className="align-middle px-[14px] py-[12px] font-mono text-[10px] text-[#4a5070]">
                              {row.inventory_number}
                            </td>
                            <td className="align-middle px-[14px] py-[12px]">
                              <Link
                                to={`/admin/inventory/${row.id}`}
                                onClick={(e) => e.stopPropagation()}
                                className="font-medium text-[12px] text-[#edf0f7] hover:text-[#5b9cf6] hover:underline"
                              >
                                {row.name}
                              </Link>
                            </td>
                            <td className="align-middle px-[14px] py-[12px]">
                              {row.category ? (
                                <span
                                  className={`inline-flex rounded-full px-2 py-[2px] text-[9px] font-semibold ${categoryBadgeClass(
                                    row.category
                                  )}`}
                                >
                                  {row.category}
                                </span>
                              ) : (
                                <span className="text-[#4a5070]">—</span>
                              )}
                            </td>
                            <td
                              className="align-middle px-[14px] py-[12px] font-mono text-[10px] text-[#4a5070]"
                              title={row.supplier_article_number || ""}
                            >
                              {row.supplier_article_number || "—"}
                            </td>
                            <td
                              className="align-middle px-[14px] py-[12px] text-[11px] text-[#4a5070]"
                              title={row.purchased_from || ""}
                            >
                              {row.purchased_from || "—"}
                            </td>
                            <td
                              className="align-middle px-[14px] py-[12px] whitespace-nowrap"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <ProductUrlLink url={row.product_url} />
                            </td>
                            <td className="align-middle px-[14px] py-[12px] text-right">
                              <span className="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full border border-[#1c2035] bg-[#191c28] px-1 font-mono text-[10px] font-semibold text-[#8892b0]">
                                {tot}
                              </span>
                            </td>
                            <td className="align-middle px-[14px] py-[12px] text-right">
                              <span
                                className={`inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full px-1 font-mono text-[10px] font-semibold ${
                                  asg > 0
                                    ? "border border-[rgba(61,220,132,0.2)] bg-[rgba(61,220,132,0.1)] text-[#3ddc84]"
                                    : "border border-[rgba(245,166,35,0.2)] bg-[rgba(245,166,35,0.1)] text-[#f5a623]"
                                }`}
                              >
                                {asg}
                              </span>
                            </td>
                            <td className="align-middle px-[14px] py-[12px] text-right">
                              <span
                                className={`inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full px-1 font-mono text-[10px] font-semibold ${
                                  free > 0
                                    ? "border border-[rgba(245,166,35,0.2)] bg-[rgba(245,166,35,0.1)] text-[#f5a623]"
                                    : "border border-[#1c2035] bg-[#191c28] text-[#4a5070]"
                                }`}
                              >
                                {free}
                              </span>
                            </td>
                            <td className="align-middle px-[14px] py-[12px] text-right font-mono text-[11px] font-medium text-[#edf0f7]">
                              {formatChf(row.purchase_price_chf)}
                            </td>
                            <td className="align-middle px-[14px] py-[12px] text-right">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate(`/admin/inventory/${row.id}`);
                                }}
                                className="rounded-[6px] border border-[#252a3a] bg-[#141720] px-[10px] py-[3px] text-[10px] text-[#8892b0] transition-all hover:border-[#3b5fcf] hover:text-[#edf0f7]"
                              >
                                Öffnen →
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#1c2035] px-[14px] py-[10px]">
                  <span className="text-[11px] text-[#4a5070]">
                    {data.total} Einträge · {skip + 1}–{Math.min(skip + data.items.length, data.total)}
                  </span>
                  <div className="flex gap-[6px]">
                    <button
                      type="button"
                      disabled={!canPrev}
                      onClick={() => setSkip((s) => Math.max(0, s - limit))}
                      className="rounded-[6px] border border-[#252a3a] bg-[#141720] px-[12px] py-[3px] text-[10px] text-[#4a5070] disabled:opacity-40"
                    >
                      Zurück
                    </button>
                    <button
                      type="button"
                      disabled={!canNext}
                      onClick={() => setSkip((s) => s + limit)}
                      className="rounded-[6px] border border-[#252a3a] bg-[#141720] px-[12px] py-[3px] text-[10px] text-[#8892b0] disabled:opacity-40"
                    >
                      Weiter
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
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
              <InventoryItemFormFields
                form={form}
                setForm={setForm}
                statusReadOnlyLabel="Status: Eingelagert (automatisch)"
              />
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
                  statusReadOnlyLabel="Status: Eingelagert (automatisch)"
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
