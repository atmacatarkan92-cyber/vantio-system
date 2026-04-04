import React, { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { fetchUnitInventoryAssignments } from "../../api/adminData";

function ItemProductLink({ url }) {
  if (!url || !String(url).trim()) {
    return <span className="text-[#64748b] dark:text-[#93a4bf]">—</span>;
  }
  const href = String(url).trim();
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="inline-flex rounded-md border border-[#5b8cff]/40 bg-[#5b8cff]/10 px-2 py-0.5 text-[10px] font-semibold text-[#5b8cff] hover:bg-[#5b8cff]/20"
    >
      Produkt öffnen
    </a>
  );
}

export default function InventorySection({ unitId, rooms = [] }) {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    if (!unitId) return;
    setError("");
    setLoading(true);
    fetchUnitInventoryAssignments(unitId)
      .then((assignments) => {
        setRows(Array.isArray(assignments) ? assignments : []);
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

  return (
    <div className="rounded-[14px] border border-black/10 bg-white p-6 dark:border-white/[0.07] dark:bg-[#141824]">
      <div className="mb-5">
        <h3 className="text-[9px] font-bold uppercase tracking-[1px] text-[#64748b] dark:text-[#6b7a9a]">
          Inventar-Zuordnungen
        </h3>
        <p className="mt-1 text-[12px] text-[#64748b] dark:text-[#6b7a9a]">
          Zuordnungen verwalten Sie auf der Inventar-Detailseite. Hier die Übersicht für diese Unit
          (Summe je Artikel ≤ Gesamtbestand).
        </p>
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
                <th className="py-2 pr-3 max-w-[90px]">Lief.-Nr.</th>
                <th className="py-2 pr-3 max-w-[100px]">Bezug</th>
                <th className="py-2 pr-3">Produkt</th>
                <th className="py-2 pr-3">Room</th>
                <th className="py-2 pr-3 text-right">Menge</th>
                <th className="py-2 pr-3">Zustand</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3 text-right">Rest (Artikel)</th>
                <th className="py-2 pr-2 text-right">Aktion</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const detailUrl = `/admin/inventory/${encodeURIComponent(row.inventory_item_id)}`;
                return (
                  <tr
                    key={row.id}
                    className="cursor-pointer border-b border-black/5 hover:bg-black/[0.02] dark:border-white/[0.06] dark:hover:bg-white/[0.03]"
                    onClick={() => navigate(detailUrl)}
                  >
                    <td className="py-2 pr-3 font-medium">
                      <Link
                        to={detailUrl}
                        onClick={(e) => e.stopPropagation()}
                        className="text-[#5b8cff] hover:underline"
                      >
                        <span className="text-[#93a4bf]">{row.inventory_number}</span> {row.item_name}
                      </Link>
                    </td>
                    <td className="py-2 pr-3 text-[#64748b] dark:text-[#93a4bf]">
                      {row.item_category || "—"}
                    </td>
                    <td
                      className="py-2 pr-3 max-w-[90px] truncate text-[11px] text-[#64748b] dark:text-[#93a4bf]"
                      title={row.item_supplier_article_number || ""}
                    >
                      {row.item_supplier_article_number || "—"}
                    </td>
                    <td
                      className="py-2 pr-3 max-w-[100px] truncate text-[11px] text-[#64748b] dark:text-[#93a4bf]"
                      title={row.item_purchased_from || ""}
                    >
                      {row.item_purchased_from || "—"}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <ItemProductLink url={row.item_product_url} />
                    </td>
                    <td className="py-2 pr-3">
                      {(() => {
                        const rlist = Array.isArray(rooms) ? rooms : [];
                        const rid = row.room_id;
                        if (!rid) return "—";
                        const match = rlist.find((x) => String(x.id || x.roomId) === String(rid));
                        return match?.roomName || match?.name || row.room_name || "—";
                      })()}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{row.quantity}</td>
                    <td className="py-2 pr-3">{row.item_condition || "—"}</td>
                    <td className="py-2 pr-3">{row.item_status || "—"}</td>
                    <td className="py-2 pr-3 text-right text-[11px] text-[#93a4bf]">
                      {row.item_available ?? "—"}
                    </td>
                    <td className="py-2 pr-2 text-right">
                      <Link
                        to={detailUrl}
                        onClick={(e) => e.stopPropagation()}
                        className="inline-block rounded-[8px] border border-black/10 bg-transparent px-3 py-1.5 text-[13px] font-semibold text-[#64748b] no-underline hover:bg-slate-100 dark:border-white/[0.1] dark:text-[#8090b0] dark:hover:bg-white/[0.04]"
                      >
                        Öffnen
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 text-[10px] text-[#64748b] dark:text-[#6b7a9a]">
        <Link to="/admin/inventory" className="text-[#5b8cff] hover:underline">
          Gesamt-Inventar verwalten
        </Link>
      </p>
    </div>
  );
}
