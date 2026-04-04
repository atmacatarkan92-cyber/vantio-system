import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  fetchUnitInventoryAssignments,
  fetchAdminInventory,
  createInventoryAssignment,
  updateInventoryAssignment,
  deleteInventoryAssignment,
} from "../../api/adminData";

export default function InventorySection({ unitId, rooms = [] }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [catalog, setCatalog] = useState([]);
  const [assignOpen, setAssignOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingRow, setEditingRow] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState("");
  const [assignForm, setAssignForm] = useState({
    inventory_item_id: "",
    quantity: "1",
    room_id: "",
    notes: "",
  });
  const [editForm, setEditForm] = useState({
    quantity: "1",
    room_id: "",
    notes: "",
  });

  const load = useCallback(() => {
    if (!unitId) return;
    setError("");
    setLoading(true);
    Promise.all([
      fetchUnitInventoryAssignments(unitId).catch(() => []),
      fetchAdminInventory({ limit: 500 }).catch(() => ({ items: [] })),
    ])
      .then(([assignments, inv]) => {
        setRows(Array.isArray(assignments) ? assignments : []);
        const items = inv && Array.isArray(inv.items) ? inv.items : [];
        setCatalog(items);
      })
      .catch((e) => {
        setError(e?.message || "Inventar-Zuordnungen konnten nicht geladen werden.");
        setRows([]);
      })
      .finally(() => setLoading(false));
  }, [unitId]);

  useEffect(() => {
    load();
  }, [load]);

  const itemsWithStock = catalog.filter((it) => (it.available ?? 0) > 0);

  function openAssign() {
    setAssignForm({
      inventory_item_id: itemsWithStock[0]?.id || "",
      quantity: "1",
      room_id: "",
      notes: "",
    });
    setFormErr("");
    setAssignOpen(true);
  }

  function openEdit(row) {
    setEditingRow(row);
    setEditForm({
      quantity: String(row.quantity ?? 1),
      room_id: row.room_id || "",
      notes: row.notes || "",
    });
    setFormErr("");
    setEditOpen(true);
  }

  async function submitAssign(e) {
    e.preventDefault();
    if (!unitId || !assignForm.inventory_item_id) {
      setFormErr("Artikel wählen.");
      return;
    }
    const qty = Math.max(1, parseInt(assignForm.quantity, 10) || 1);
    const item = catalog.find((x) => String(x.id) === String(assignForm.inventory_item_id));
    if (item && qty > (item.available ?? 0)) {
      setFormErr(`Max. verfügbar: ${item.available ?? 0}`);
      return;
    }
    setSaving(true);
    setFormErr("");
    try {
      await createInventoryAssignment(assignForm.inventory_item_id, {
        unit_id: unitId,
        room_id: assignForm.room_id || null,
        quantity: qty,
        notes: assignForm.notes.trim() || null,
      });
      setAssignOpen(false);
      load();
    } catch (err) {
      setFormErr(err?.message || "Zuordnung fehlgeschlagen.");
    } finally {
      setSaving(false);
    }
  }

  async function submitEdit(e) {
    e.preventDefault();
    if (!editingRow) return;
    const qty = Math.max(1, parseInt(editForm.quantity, 10) || 1);
    const item = catalog.find((x) => String(x.id) === String(editingRow.inventory_item_id));
    const avail = item?.available ?? editingRow.item_available ?? 0;
    const maxQty = avail + (editingRow.quantity ?? 0);
    if (qty > maxQty) {
      setFormErr(`Max. für diese Position: ${maxQty}`);
      return;
    }
    setSaving(true);
    setFormErr("");
    try {
      await updateInventoryAssignment(editingRow.id, {
        quantity: qty,
        room_id: editForm.room_id || null,
        notes: editForm.notes.trim() || null,
      });
      setEditOpen(false);
      setEditingRow(null);
      load();
    } catch (err) {
      setFormErr(err?.message || "Speichern fehlgeschlagen.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(row) {
    if (!window.confirm("Diese Zuordnung wirklich entfernen?")) return;
    try {
      await deleteInventoryAssignment(row.id);
      load();
    } catch (err) {
      setError(err?.message || "Löschen fehlgeschlagen.");
    }
  }

  const roomOptions = Array.isArray(rooms) ? rooms : [];

  return (
    <div className="rounded-[14px] border border-black/10 bg-white p-6 dark:border-white/[0.07] dark:bg-[#141824]">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-[9px] font-bold uppercase tracking-[1px] text-[#64748b] dark:text-[#6b7a9a]">
            Inventar-Zuordnungen
          </h3>
          <p className="mt-1 text-[12px] text-[#64748b] dark:text-[#6b7a9a]">
            Verteilung von Artikeln auf diese Unit (Summe je Artikel ≤ Gesamtbestand). Kein UnitCost.
          </p>
        </div>
        <button
          type="button"
          onClick={openAssign}
          disabled={!unitId || itemsWithStock.length === 0}
          className="rounded-lg border border-black/10 bg-slate-100 px-3 py-2 text-sm font-semibold text-[#0f172a] hover:bg-slate-200 disabled:opacity-50 dark:border-white/[0.1] dark:bg-[#111520] dark:text-[#f8fafc] dark:hover:bg-[#1a2332]"
        >
          Zuordnen
        </button>
      </div>

      {error ? <p className="mb-3 text-sm text-[#f87171]">{error}</p> : null}

      {loading ? (
        <p className="text-[10px] text-[#64748b] dark:text-[#6b7a9a]">Lade …</p>
      ) : rows.length === 0 ? (
        <p className="text-[10px] text-[#64748b] dark:text-[#6b7a9a]">
          Keine Zuordnungen für diese Unit.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-[#0f172a] dark:text-[#eef2ff]">
            <thead>
              <tr className="bg-slate-100 text-[9px] font-bold uppercase tracking-[0.8px] text-[#64748b] dark:bg-[#111520] dark:text-[#6b7a9a]">
                <th className="py-2 pr-3">Artikel</th>
                <th className="py-2 pr-3">Kategorie</th>
                <th className="py-2 pr-3">Room</th>
                <th className="py-2 pr-3 text-right">Menge</th>
                <th className="py-2 pr-3">Zustand</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3 text-right">Rest (Artikel)</th>
                <th className="py-2 pr-2 text-right">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-black/5 dark:border-white/[0.06]"
                >
                  <td className="py-2 pr-3 font-medium">
                    <span className="text-[#93a4bf]">{row.inventory_number}</span>{" "}
                    {row.item_name}
                  </td>
                  <td className="py-2 pr-3 text-[#64748b] dark:text-[#93a4bf]">
                    {row.item_category || "—"}
                  </td>
                  <td className="py-2 pr-3">{row.room_name || "—"}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{row.quantity}</td>
                  <td className="py-2 pr-3">{row.item_condition || "—"}</td>
                  <td className="py-2 pr-3">{row.item_status || "—"}</td>
                  <td className="py-2 pr-3 text-right text-[11px] text-[#93a4bf]">
                    {row.item_available ?? "—"}
                  </td>
                  <td className="py-2 pr-0 text-right">
                    <button
                      type="button"
                      onClick={() => openEdit(row)}
                      className="mr-2 text-[#5b8cff] hover:underline text-sm"
                    >
                      Bearbeiten
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(row)}
                      className="text-[#64748b] hover:text-[#f87171] hover:underline text-sm dark:text-[#6b7a9a]"
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

      <p className="mt-4 text-[10px] text-[#64748b] dark:text-[#6b7a9a]">
        <Link to="/admin/inventory" className="text-[#5b8cff] hover:underline">
          Gesamt-Inventar verwalten
        </Link>
      </p>

      {assignOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-[14px] border border-white/[0.08] bg-[#0b1220] p-6 text-[#f8fafc]">
            <h4 className="m-0 text-lg font-semibold">Artikel zuordnen</h4>
            {formErr ? <p className="mt-2 text-sm text-[#f87171]">{formErr}</p> : null}
            <form onSubmit={submitAssign} className="mt-4 grid gap-3">
              <label className="block text-[11px] text-[#93a4bf]">
                Artikel (mit freiem Bestand)
                <select
                  required
                  value={assignForm.inventory_item_id}
                  onChange={(e) =>
                    setAssignForm((f) => ({ ...f, inventory_item_id: e.target.value }))
                  }
                  className="mt-1 w-full rounded-lg border border-white/[0.1] bg-[#060b14] px-3 py-2 text-sm"
                >
                  <option value="">— wählen —</option>
                  {itemsWithStock.map((it) => (
                    <option key={it.id} value={it.id}>
                      {it.inventory_number} — {it.name} (frei: {it.available ?? 0})
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-[11px] text-[#93a4bf]">
                Menge
                <input
                  type="number"
                  min={1}
                  value={assignForm.quantity}
                  onChange={(e) => setAssignForm((f) => ({ ...f, quantity: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-white/[0.1] bg-[#060b14] px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-[11px] text-[#93a4bf]">
                Room (optional)
                <select
                  value={assignForm.room_id}
                  onChange={(e) => setAssignForm((f) => ({ ...f, room_id: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-white/[0.1] bg-[#060b14] px-3 py-2 text-sm"
                >
                  <option value="">— ganze Unit —</option>
                  {roomOptions.map((r) => (
                    <option key={r.id || r.roomId} value={r.id || r.roomId}>
                      {r.roomName || r.name || r.id}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-[11px] text-[#93a4bf]">
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
                  onClick={() => setAssignOpen(false)}
                  className="rounded-lg border border-white/[0.12] px-4 py-2 text-sm"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-[#5b8cff] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {saving ? "…" : "Zuordnen"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {editOpen && editingRow ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-[14px] border border-white/[0.08] bg-[#0b1220] p-6 text-[#f8fafc]">
            <h4 className="m-0 text-lg font-semibold">Zuordnung bearbeiten</h4>
            <p className="mt-1 text-[12px] text-[#93a4bf]">
              {editingRow.inventory_number} {editingRow.item_name}
            </p>
            {formErr ? <p className="mt-2 text-sm text-[#f87171]">{formErr}</p> : null}
            <form onSubmit={submitEdit} className="mt-4 grid gap-3">
              <label className="block text-[11px] text-[#93a4bf]">
                Menge
                <input
                  type="number"
                  min={1}
                  value={editForm.quantity}
                  onChange={(e) => setEditForm((f) => ({ ...f, quantity: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-white/[0.1] bg-[#060b14] px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-[11px] text-[#93a4bf]">
                Room
                <select
                  value={editForm.room_id}
                  onChange={(e) => setEditForm((f) => ({ ...f, room_id: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-white/[0.1] bg-[#060b14] px-3 py-2 text-sm"
                >
                  <option value="">— ganze Unit —</option>
                  {roomOptions.map((r) => (
                    <option key={r.id || r.roomId} value={r.id || r.roomId}>
                      {r.roomName || r.name || r.id}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-[11px] text-[#93a4bf]">
                Notiz
                <input
                  value={editForm.notes}
                  onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-white/[0.1] bg-[#060b14] px-3 py-2 text-sm"
                />
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditOpen(false);
                    setEditingRow(null);
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
      ) : null}
    </div>
  );
}
