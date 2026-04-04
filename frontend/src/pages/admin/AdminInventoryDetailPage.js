import React, { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  fetchAdminInventoryItem,
  fetchInventoryItemAssignments,
  fetchAdminUnits,
  fetchAdminRooms,
  updateInventoryItem,
  deleteInventoryItem,
  createInventoryAssignment,
  updateInventoryAssignment,
  deleteInventoryAssignment,
  normalizeUnit,
} from "../../api/adminData";

function formatChf(value) {
  if (value == null || value === "") return "—";
  return `CHF ${Number(value).toLocaleString("de-CH", { maximumFractionDigits: 2 })}`;
}

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

function statusBadgeClass(status) {
  const s = String(status || "active").toLowerCase();
  if (s === "active") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  if (s === "stored" || s === "eingelagert") return "border-sky-500/30 bg-sky-500/10 text-sky-300";
  if (s === "repair" || s === "reparatur") return "border-amber-500/30 bg-amber-500/10 text-amber-200";
  if (s === "disposed" || s === "entsorgt") return "border-white/[0.12] bg-white/[0.05] text-[#93a4bf]";
  return "border-white/[0.12] bg-white/[0.05] text-[#93a4bf]";
}

function unitLabel(u) {
  if (!u) return "—";
  const nu = normalizeUnit(u);
  const t = nu.title || nu.address || "";
  const place = nu.place || [nu.postal_code, nu.city].filter(Boolean).join(" ");
  const line = [t, place].filter(Boolean).join(" · ");
  return line || nu.id || "—";
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

function itemToForm(row) {
  if (!row) return emptyItemForm();
  return {
    name: row.name || "",
    category: row.category || "",
    brand: row.brand || "",
    total_quantity: String(row.total_quantity ?? 1),
    condition: row.condition || "",
    status: row.status || "active",
    purchase_price_chf: row.purchase_price_chf != null ? String(row.purchase_price_chf) : "",
    purchase_date: row.purchase_date ? String(row.purchase_date).slice(0, 10) : "",
    supplier_article_number: row.supplier_article_number || "",
    purchased_from: row.purchased_from || "",
    product_url: row.product_url || "",
    notes: row.notes || "",
  };
}

export default function AdminInventoryDetailPage() {
  const { itemId } = useParams();
  const navigate = useNavigate();
  const [item, setItem] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState(emptyItemForm());
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState("");

  const [notesDraft, setNotesDraft] = useState("");
  const [notesSaving, setNotesSaving] = useState(false);
  const [notesErr, setNotesErr] = useState("");

  const [assignOpen, setAssignOpen] = useState(false);
  const [assignForm, setAssignForm] = useState({
    unit_id: "",
    room_id: "",
    quantity: "1",
    notes: "",
  });
  const [assignRooms, setAssignRooms] = useState([]);
  const [assignErr, setAssignErr] = useState("");
  const [assignSaving, setAssignSaving] = useState(false);

  const [editAssignOpen, setEditAssignOpen] = useState(false);
  const [editingAsg, setEditingAsg] = useState(null);
  const [editAssignForm, setEditAssignForm] = useState({
    unit_id: "",
    room_id: "",
    quantity: "1",
    notes: "",
  });
  const [editAssignRooms, setEditAssignRooms] = useState([]);

  const load = useCallback(() => {
    if (!itemId) return;
    setLoading(true);
    setError("");
    Promise.all([
      fetchAdminInventoryItem(itemId),
      fetchInventoryItemAssignments(itemId).catch(() => []),
      fetchAdminUnits().catch(() => []),
    ])
      .then(([inv, asg, ulist]) => {
        setError("");
        if (!inv) {
          setItem(null);
          setError("Artikel nicht gefunden.");
          return;
        }
        setItem(inv);
        setNotesDraft(inv.notes || "");
        setAssignments(Array.isArray(asg) ? asg : []);
        setUnits(Array.isArray(ulist) ? ulist : []);
      })
      .catch((e) => {
        setError(e?.message || "Laden fehlgeschlagen.");
        setItem(null);
      })
      .finally(() => setLoading(false));
  }, [itemId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!assignOpen) {
      setAssignRooms([]);
      return;
    }
    const uid = assignForm.unit_id;
    if (!uid) {
      setAssignRooms([]);
      return;
    }
    fetchAdminRooms(uid)
      .then((r) => setAssignRooms(Array.isArray(r) ? r : []))
      .catch(() => setAssignRooms([]));
  }, [assignOpen, assignForm.unit_id]);

  useEffect(() => {
    if (!editAssignOpen) {
      setEditAssignRooms([]);
      return;
    }
    const uid = editAssignForm.unit_id;
    if (!uid) {
      setEditAssignRooms([]);
      return;
    }
    fetchAdminRooms(uid)
      .then((r) => setEditAssignRooms(Array.isArray(r) ? r : []))
      .catch(() => setEditAssignRooms([]));
  }, [editAssignOpen, editAssignForm.unit_id]);

  function openEdit() {
    if (!item) return;
    setForm(itemToForm(item));
    setFormErr("");
    setEditOpen(true);
  }

  function bodyFromForm() {
    const tq = Math.max(1, parseInt(form.total_quantity, 10) || 1);
    const pu = parseOptionalProductUrl(form.product_url);
    if (pu.error) return { _error: pu.error };
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

  async function submitEdit(e) {
    e.preventDefault();
    if (!itemId) return;
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
      const updated = await updateInventoryItem(itemId, b);
      setItem(updated);
      setNotesDraft(updated.notes || "");
      setEditOpen(false);
    } catch (err) {
      setFormErr(err?.message || "Fehler.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!item) return;
    if (!window.confirm(`Artikel «${item.name}» inkl. Zuordnungen löschen?`)) return;
    try {
      await deleteInventoryItem(itemId);
      navigate("/admin/inventory");
    } catch (err) {
      window.alert(err?.message || "Löschen fehlgeschlagen.");
    }
  }

  async function saveNotes() {
    if (!itemId) return;
    setNotesSaving(true);
    setNotesErr("");
    try {
      const updated = await updateInventoryItem(itemId, {
        notes: notesDraft.trim() || null,
      });
      setItem(updated);
      setNotesDraft(updated.notes || "");
    } catch (err) {
      setNotesErr(err?.message || "Speichern fehlgeschlagen.");
    } finally {
      setNotesSaving(false);
    }
  }

  function openAssign() {
    const u0 = units[0];
    const nu = u0 ? normalizeUnit(u0) : null;
    const firstUnit = nu ? String(nu.id || nu.unitId || "") : "";
    setAssignForm({
      unit_id: firstUnit,
      room_id: "",
      quantity: "1",
      notes: "",
    });
    setAssignErr("");
    setAssignOpen(true);
  }

  async function submitAssign(e) {
    e.preventDefault();
    if (!itemId || !assignForm.unit_id) {
      setAssignErr("Unit wählen.");
      return;
    }
    const qty = Math.max(1, parseInt(assignForm.quantity, 10) || 1);
    const avail = item?.available ?? 0;
    if (qty > avail) {
      setAssignErr(`Max. verfügbar: ${avail}`);
      return;
    }
    setAssignSaving(true);
    setAssignErr("");
    try {
      await createInventoryAssignment(itemId, {
        unit_id: assignForm.unit_id,
        room_id: assignForm.room_id || null,
        quantity: qty,
        notes: assignForm.notes.trim() || null,
      });
      setAssignOpen(false);
      load();
    } catch (err) {
      setAssignErr(err?.message || "Zuordnung fehlgeschlagen.");
    } finally {
      setAssignSaving(false);
    }
  }

  function openEditAssignment(row) {
    setAssignErr("");
    setEditingAsg(row);
    setEditAssignForm({
      unit_id: row.unit_id || "",
      room_id: row.room_id || "",
      quantity: String(row.quantity ?? 1),
      notes: row.notes || "",
    });
    setAssignErr("");
    setEditAssignOpen(true);
  }

  async function submitEditAssignment(e) {
    e.preventDefault();
    if (!editingAsg) return;
    const qty = Math.max(1, parseInt(editAssignForm.quantity, 10) || 1);
    const avail = item?.available ?? 0;
    const maxQty = avail + (editingAsg.quantity ?? 0);
    if (qty > maxQty) {
      setAssignErr(`Max. für diese Position: ${maxQty}`);
      return;
    }
    setAssignSaving(true);
    setAssignErr("");
    try {
      await updateInventoryAssignment(editingAsg.id, {
        unit_id: editAssignForm.unit_id,
        room_id: editAssignForm.room_id || null,
        quantity: qty,
        notes: editAssignForm.notes.trim() || null,
      });
      setEditAssignOpen(false);
      setEditingAsg(null);
      load();
    } catch (err) {
      setAssignErr(err?.message || "Speichern fehlgeschlagen.");
    } finally {
      setAssignSaving(false);
    }
  }

  async function handleDeleteAssignment(row) {
    if (!window.confirm("Diese Zuordnung entfernen?")) return;
    try {
      await deleteInventoryAssignment(row.id);
      load();
    } catch (err) {
      window.alert(err?.message || "Löschen fehlgeschlagen.");
    }
  }

  const unitById = React.useMemo(() => {
    const m = new Map();
    for (const u of units) {
      const nu = normalizeUnit(u);
      m.set(String(nu.id || nu.unitId), nu);
    }
    return m;
  }, [units]);

  if (loading) {
    return (
      <div className="min-h-[40vh] bg-[#060b14] px-4 py-8 text-[#93a4bf] [color-scheme:dark]">
        Lade …
      </div>
    );
  }

  if (error && !item) {
    return (
      <div className="min-h-[40vh] bg-[#060b14] px-4 py-8 text-[#f8fafc] [color-scheme:dark]">
        <p className="text-[#f87171]">{error}</p>
        <Link
          to="/admin/inventory"
          className="mt-4 inline-block rounded-lg border border-white/[0.12] px-4 py-2 text-sm text-[#93a4bf] hover:bg-white/[0.04]"
        >
          Zurück zum Inventar
        </Link>
      </div>
    );
  }

  if (!item) return null;

  const total = item.total_quantity ?? 1;
  const assigned = item.assigned_total ?? 0;
  const available = item.available ?? 0;

  return (
    <div className="min-h-screen bg-[#060b14] text-[#f8fafc] [color-scheme:dark]">
      <div className="mx-auto max-w-[min(1100px,100%)] gap-4 p-6">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <Link
              to="/admin/inventory"
              className="text-[13px] font-medium text-[#5b8cff] hover:underline"
            >
              ← Zurück zum Inventar
            </Link>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <h1 className="m-0 text-[22px] font-bold tracking-tight">{item.name}</h1>
              <span className="rounded-md border border-white/[0.1] bg-[#0b1220] px-2 py-0.5 font-mono text-[12px] text-[#93a4bf]">
                {item.inventory_number}
              </span>
              <span
                className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${statusBadgeClass(item.status)}`}
              >
                {item.status || "active"}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={openEdit}
              className="rounded-lg border border-white/[0.12] bg-[#0b1220] px-4 py-2 text-sm font-semibold text-[#f8fafc] hover:bg-white/[0.04]"
            >
              Bearbeiten
            </button>
            <button
              type="button"
              onClick={handleDelete}
              className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-semibold text-[#f87171] hover:bg-red-500/15"
            >
              Löschen
            </button>
          </div>
        </div>

        {error ? <p className="mb-4 text-sm text-[#f87171]">{error}</p> : null}

        <div className="grid gap-4">
          <section className="rounded-[14px] border border-white/[0.08] bg-[#0b1220] p-5">
            <h2 className="m-0 text-[10px] font-bold uppercase tracking-[1px] text-[#93a4bf]">
              Basis
            </h2>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-[11px] text-[#93a4bf]">Name</dt>
                <dd className="mt-0.5 font-medium">{item.name}</dd>
              </div>
              <div>
                <dt className="text-[11px] text-[#93a4bf]">Kategorie</dt>
                <dd className="mt-0.5">{item.category || "—"}</dd>
              </div>
              <div>
                <dt className="text-[11px] text-[#93a4bf]">Marke</dt>
                <dd className="mt-0.5">{item.brand || "—"}</dd>
              </div>
              <div>
                <dt className="text-[11px] text-[#93a4bf]">Zustand</dt>
                <dd className="mt-0.5">{item.condition || "—"}</dd>
              </div>
              <div>
                <dt className="text-[11px] text-[#93a4bf]">Status</dt>
                <dd className="mt-0.5">{item.status || "—"}</dd>
              </div>
              <div>
                <dt className="text-[11px] text-[#93a4bf]">Anschaffung</dt>
                <dd className="mt-0.5 tabular-nums">{formatChf(item.purchase_price_chf)}</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-[14px] border border-white/[0.08] bg-[#0b1220] p-5">
            <h2 className="m-0 text-[10px] font-bold uppercase tracking-[1px] text-[#93a4bf]">
              Purchase / Supplier Info
            </h2>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-[11px] text-[#93a4bf]">Lieferanten-Artikelnr.</dt>
                <dd className="mt-0.5">{item.supplier_article_number || "—"}</dd>
              </div>
              <div>
                <dt className="text-[11px] text-[#93a4bf]">Gekauft bei</dt>
                <dd className="mt-0.5">{item.purchased_from || "—"}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-[11px] text-[#93a4bf]">Produkt-URL</dt>
                <dd className="mt-0.5">
                  {item.product_url ? (
                    <a
                      href={String(item.product_url).trim()}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex rounded-md border border-[#5b8cff]/40 bg-[#5b8cff]/10 px-2 py-0.5 text-[12px] font-semibold text-[#5b8cff] hover:bg-[#5b8cff]/20"
                    >
                      Produkt öffnen
                    </a>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
            </dl>
          </section>

          <section className="rounded-[14px] border border-white/[0.08] bg-[#0b1220] p-5">
            <h2 className="m-0 text-[10px] font-bold uppercase tracking-[1px] text-[#93a4bf]">
              Bestand
            </h2>
            <p className="mt-3 text-[15px] font-semibold tabular-nums text-[#f8fafc]">
              {total} gesamt · {assigned} zugeordnet · {available} frei
            </p>
          </section>

          <section className="rounded-[14px] border border-white/[0.08] bg-[#0b1220] p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="m-0 text-[10px] font-bold uppercase tracking-[1px] text-[#93a4bf]">
                Zuordnungen
              </h2>
              <button
                type="button"
                onClick={openAssign}
                disabled={available <= 0}
                className="rounded-lg bg-[#5b8cff] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#4a7ae8] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Zuordnung hinzufügen
              </button>
            </div>
            {assignErr && (assignOpen || editAssignOpen) ? (
              <p className="mt-2 text-sm text-[#f87171]">{assignErr}</p>
            ) : null}
            {assignments.length === 0 ? (
              <p className="mt-3 text-sm text-[#93a4bf]">Keine Zuordnungen.</p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.08] text-[9px] font-bold uppercase tracking-[0.8px] text-[#93a4bf]">
                      <th className="py-2 pr-3">Unit</th>
                      <th className="py-2 pr-3">Room</th>
                      <th className="py-2 pr-3 text-right">Menge</th>
                      <th className="py-2 pr-0 text-right">Aktionen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assignments.map((row) => (
                      <tr key={row.id} className="border-b border-white/[0.05]">
                        <td className="py-2 pr-3">
                          <Link
                            to={`/admin/units/${encodeURIComponent(row.unit_id)}`}
                            className="font-medium text-[#5b8cff] hover:underline"
                          >
                            {unitLabel(unitById.get(String(row.unit_id)))}
                          </Link>
                          <div className="font-mono text-[10px] text-[#93a4bf]">{row.unit_id}</div>
                        </td>
                        <td className="py-2 pr-3 text-[#93a4bf]">{row.room_name || "—"}</td>
                        <td className="py-2 pr-3 text-right tabular-nums">{row.quantity}</td>
                        <td className="py-2 pr-0 text-right">
                          <button
                            type="button"
                            onClick={() => openEditAssignment(row)}
                            className="mr-2 text-[#5b8cff] hover:underline text-sm"
                          >
                            Bearbeiten
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteAssignment(row)}
                            className="text-[#93a4bf] hover:text-[#f87171] hover:underline text-sm"
                          >
                            Entfernen
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="rounded-[14px] border border-white/[0.08] bg-[#0b1220] p-5">
            <h2 className="m-0 text-[10px] font-bold uppercase tracking-[1px] text-[#93a4bf]">
              Notizen
            </h2>
            {notesErr ? <p className="mt-2 text-sm text-[#f87171]">{notesErr}</p> : null}
            <textarea
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              rows={4}
              className="mt-3 w-full rounded-lg border border-white/[0.1] bg-[#060b14] px-3 py-2 text-sm"
            />
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                disabled={notesSaving}
                onClick={saveNotes}
                className="rounded-lg bg-[#5b8cff] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {notesSaving ? "…" : "Notizen speichern"}
              </button>
            </div>
          </section>
        </div>
      </div>

      {editOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[14px] border border-white/[0.08] bg-[#0b1220] p-6">
            <h4 className="m-0 text-lg font-semibold">Artikel bearbeiten</h4>
            {formErr ? <p className="mt-2 text-sm text-[#f87171]">{formErr}</p> : null}
            <form onSubmit={submitEdit} className="mt-4 grid grid-cols-1 gap-3 text-[#f8fafc]">
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
                      className="mt-1 w-full rounded-lg border border-white/[0.1] bg-[#060b14] px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="text-[11px] text-[#93a4bf]">
                    Gekauft bei
                    <input
                      value={form.purchased_from}
                      onChange={(e) => setForm((f) => ({ ...f, purchased_from: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-white/[0.1] bg-[#060b14] px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="text-[11px] text-[#93a4bf]">
                    Produkt-URL
                    <input
                      type="url"
                      value={form.product_url}
                      onChange={(e) => setForm((f) => ({ ...f, product_url: e.target.value }))}
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
                    setEditOpen(false);
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

      {assignOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-[14px] border border-white/[0.08] bg-[#0b1220] p-6">
            <h4 className="m-0 text-lg font-semibold">Zuordnung hinzufügen</h4>
            {assignErr && assignOpen ? (
              <p className="mt-2 text-sm text-[#f87171]">{assignErr}</p>
            ) : null}
            <form onSubmit={submitAssign} className="mt-4 grid gap-3">
              <label className="text-[11px] text-[#93a4bf]">
                Unit *
                <select
                  required
                  value={assignForm.unit_id}
                  onChange={(e) =>
                    setAssignForm((f) => ({ ...f, unit_id: e.target.value, room_id: "" }))
                  }
                  className="mt-1 w-full rounded-lg border border-white/[0.1] bg-[#060b14] px-3 py-2 text-sm"
                >
                  <option value="">— wählen —</option>
                  {units.map((u) => {
                    const nu = normalizeUnit(u);
                    const id = nu.id || nu.unitId;
                    return (
                      <option key={id} value={id}>
                        {unitLabel(nu)}
                      </option>
                    );
                  })}
                </select>
              </label>
              <label className="text-[11px] text-[#93a4bf]">
                Room (optional)
                <select
                  value={assignForm.room_id}
                  onChange={(e) => setAssignForm((f) => ({ ...f, room_id: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-white/[0.1] bg-[#060b14] px-3 py-2 text-sm"
                >
                  <option value="">— ganze Unit —</option>
                  {assignRooms.map((r) => {
                    const rid = r.id || r.room_id;
                    return (
                      <option key={rid} value={rid}>
                        {r.name || r.roomName || rid}
                      </option>
                    );
                  })}
                </select>
              </label>
              <label className="text-[11px] text-[#93a4bf]">
                Menge (frei: {available})
                <input
                  type="number"
                  min={1}
                  max={available}
                  value={assignForm.quantity}
                  onChange={(e) => setAssignForm((f) => ({ ...f, quantity: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-white/[0.1] bg-[#060b14] px-3 py-2 text-sm"
                />
              </label>
              <label className="text-[11px] text-[#93a4bf]">
                Notiz
                <input
                  value={assignForm.notes}
                  onChange={(e) => setAssignForm((f) => ({ ...f, notes: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-white/[0.1] bg-[#060b14] px-3 py-2 text-sm"
                />
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setAssignOpen(false);
                    setAssignErr("");
                  }}
                  className="rounded-lg border border-white/[0.12] px-4 py-2 text-sm"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  disabled={assignSaving}
                  className="rounded-lg bg-[#5b8cff] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {assignSaving ? "…" : "Zuordnen"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editAssignOpen && editingAsg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-[14px] border border-white/[0.08] bg-[#0b1220] p-6">
            <h4 className="m-0 text-lg font-semibold">Zuordnung bearbeiten</h4>
            {assignErr && editAssignOpen ? (
              <p className="mt-2 text-sm text-[#f87171]">{assignErr}</p>
            ) : null}
            <form onSubmit={submitEditAssignment} className="mt-4 grid gap-3">
              <label className="text-[11px] text-[#93a4bf]">
                Unit *
                <select
                  required
                  value={editAssignForm.unit_id}
                  onChange={(e) =>
                    setEditAssignForm((f) => ({ ...f, unit_id: e.target.value, room_id: "" }))
                  }
                  className="mt-1 w-full rounded-lg border border-white/[0.1] bg-[#060b14] px-3 py-2 text-sm"
                >
                  {units.map((u) => {
                    const nu = normalizeUnit(u);
                    const id = nu.id || nu.unitId;
                    return (
                      <option key={id} value={id}>
                        {unitLabel(nu)}
                      </option>
                    );
                  })}
                </select>
              </label>
              <label className="text-[11px] text-[#93a4bf]">
                Room
                <select
                  value={editAssignForm.room_id}
                  onChange={(e) => setEditAssignForm((f) => ({ ...f, room_id: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-white/[0.1] bg-[#060b14] px-3 py-2 text-sm"
                >
                  <option value="">— ganze Unit —</option>
                  {editAssignRooms.map((r) => {
                    const rid = r.id || r.room_id;
                    return (
                      <option key={rid} value={rid}>
                        {r.name || r.roomName || rid}
                      </option>
                    );
                  })}
                </select>
              </label>
              <label className="text-[11px] text-[#93a4bf]">
                Menge
                <input
                  type="number"
                  min={1}
                  value={editAssignForm.quantity}
                  onChange={(e) => setEditAssignForm((f) => ({ ...f, quantity: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-white/[0.1] bg-[#060b14] px-3 py-2 text-sm"
                />
              </label>
              <label className="text-[11px] text-[#93a4bf]">
                Notiz
                <input
                  value={editAssignForm.notes}
                  onChange={(e) => setEditAssignForm((f) => ({ ...f, notes: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-white/[0.1] bg-[#060b14] px-3 py-2 text-sm"
                />
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditAssignOpen(false);
                    setEditingAsg(null);
                    setAssignErr("");
                  }}
                  className="rounded-lg border border-white/[0.12] px-4 py-2 text-sm"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  disabled={assignSaving}
                  className="rounded-lg bg-[#5b8cff] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {assignSaving ? "…" : "Speichern"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
