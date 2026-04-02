import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  fetchAdminUnits,
  fetchAdminRooms,
  fetchAdminTenanciesAll,
  fetchAdminProfit,
  normalizeUnit,
  normalizeRoom,
} from "../../api/adminData";
import {
  getUnitOccupancyStatus,
  formatOccupancyStatusDe,
  getTodayIsoForOccupancy,
} from "../../utils/unitOccupancyStatus";
import { getDisplayUnitId } from "../../utils/unitDisplayId";

function formatCurrency(value) {
  const n = Number(value);
  const amount = Number.isFinite(n) ? n : 0;
  return `CHF ${amount.toLocaleString("de-CH")}`;
}

function compareBest(a, b) {
  if (b.profit !== a.profit) return b.profit - a.profit;
  return b.revenue - a.revenue;
}

function compareWorst(a, b) {
  if (a.profit !== b.profit) return a.profit - b.profit;
  return a.revenue - b.revenue;
}

/** listIndex aligns labels with AdminApartmentsPage (APT-xxx / CL-xxx). */
function getUnitLabel(unit, listIndex) {
  if (!unit) return "—";

  const city = unit.city ?? unit.place ?? "";

  if (typeof listIndex === "number" && listIndex >= 0 && city) {
    const rid = getDisplayUnitId(unit, listIndex);
    if (rid && rid !== "—") {
      return `${rid} · ${city}`;
    }
  }

  if (unit.unitId && city) {
    return `${unit.unitId} · ${city}`;
  }

  if (unit.address && city) {
    return `${unit.address} · ${city}`;
  }

  if (unit.label) {
    return unit.label;
  }

  if (unit.name) {
    return unit.name;
  }

  return unit.id;
}

function AdminPerformancePage() {
  const [units, setUnits] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [tenancies, setTenancies] = useState([]);
  const [profitMonth, setProfitMonth] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    Promise.all([
      fetchAdminUnits()
        .then((data) => (Array.isArray(data) ? data.map(normalizeUnit) : []))
        .catch(() => []),
      fetchAdminRooms()
        .then((data) => (Array.isArray(data) ? data.map(normalizeRoom) : []))
        .catch(() => []),
      fetchAdminTenanciesAll().catch(() => []),
      fetchAdminProfit({ year, month }).catch(() => null),
    ])
      .then(([u, r, t, profit]) => {
        if (cancelled) return;
        setUnits(u);
        setRooms(r);
        setTenancies(Array.isArray(t) ? t : []);
        setProfitMonth(profit);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const stats = useMemo(() => {
    const todayIso = getTodayIsoForOccupancy();
    const byUnitId = new Map(
      (profitMonth?.units || []).map((row) => [String(row.unit_id), row])
    );
    const results = units.map((unit, listIndex) => {
      const uid = String(unit.id ?? unit.unitId);
      const prow = byUnitId.get(uid);
      const revenue = prow != null ? Number(prow.revenue) : 0;
      const costs = prow != null ? Number(prow.costs) : 0;
      const profit = prow != null ? Number(prow.profit) : 0;
      const occ = getUnitOccupancyStatus(unit, rooms, tenancies);
      return {
        id: unit.id ?? unit.unitId,
        listIndex,
        unit,
        city: unit.place ?? "—",
        revenue,
        costs,
        profit,
        occupancyLabel: occ != null ? formatOccupancyStatusDe(occ) : "—",
      };
    });

    const sortedBest = [...results].sort(compareBest);
    const sortedWorst = [...results].sort(compareWorst);
    const best = sortedBest[0];
    const worst = sortedWorst[0];

    const totalRevenue = results.reduce((a, b) => a + b.revenue, 0);
    const totalProfit = results.reduce((a, b) => a + b.profit, 0);

    return {
      results,
      best,
      worst,
      totalRevenue,
      totalProfit,
    };
  }, [units, rooms, tenancies, profitMonth]);

  const kpiCardClassName =
    "relative overflow-hidden rounded-[14px] border border-black/10 bg-white p-5 dark:border-white/[0.07] dark:bg-[#141824]";

  if (loading) {
    return (
      <div
        className="min-h-full bg-[#f8fafc] text-[#0f172a] [color-scheme:light] dark:bg-[#07090f] dark:text-[#eef2ff] dark:[color-scheme:dark]"
        style={{ display: "grid", gap: "24px" }}
      >
        <p className="text-[#64748b] dark:text-[#6b7a9a]">Lade Performance…</p>
      </div>
    );
  }

  return (
    <div
      className="min-h-full bg-[#f8fafc] text-[#0f172a] [color-scheme:light] dark:bg-[#07090f] dark:text-[#eef2ff] dark:[color-scheme:dark]"
      style={{ display: "grid", gap: "24px" }}
    >
      <div>
        <div
          style={{
            fontSize: "12px",
            color: "#fb923c",
            fontWeight: 700,
            marginBottom: "8px",
          }}
        >
          Vantio
        </div>

        <h2
          style={{
            fontSize: "22px",
            fontWeight: 700,
            margin: 0,
          }}
        >
          Performance
        </h2>

        <p className="mt-[10px] text-[12px] text-[#64748b] dark:text-[#6b7a9a]">
          Analyse der profitabelsten und schwächsten Units (aktive Mietverhältnisse).
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
          gap: "16px",
        }}
      >
        <div className={kpiCardClassName} style={{ borderTop: "4px solid #4ade80" }}>
          <h4 className="mb-2 mt-0 text-[11px] font-bold uppercase tracking-[1px] text-[#64748b] dark:text-[#6b7a9a]">
            Gesamt Umsatz
          </h4>
          <h2 className="m-0 text-[24px] font-bold text-slate-900 dark:text-[#eef2ff]">
            {formatCurrency(stats.totalRevenue)}
          </h2>
        </div>

        <div className={kpiCardClassName} style={{ borderTop: "4px solid #7aaeff" }}>
          <h4 className="mb-2 mt-0 text-[11px] font-bold uppercase tracking-[1px] text-[#64748b] dark:text-[#6b7a9a]">
            Gesamt Gewinn
          </h4>
          <h2 className="m-0 text-[24px] font-bold text-emerald-700 dark:text-emerald-400">
            {formatCurrency(stats.totalProfit)}
          </h2>
        </div>

        <div className={kpiCardClassName} style={{ borderTop: "4px solid #a78bfa" }}>
          <h4 className="mb-2 mt-0 text-[11px] font-bold uppercase tracking-[1px] text-[#64748b] dark:text-[#6b7a9a]">
            Beste Unit
          </h4>
          <h3 className="mb-2 mt-0 text-[15px] font-semibold text-[#0f172a] dark:text-[#eef2ff]">
            {getUnitLabel(stats.best?.unit, stats.best?.listIndex)}
          </h3>
          <p className="m-0 text-[11px] text-[#64748b] dark:text-[#6b7a9a]">
            {formatCurrency(stats.best?.profit)}
          </p>
        </div>

        <div className={kpiCardClassName} style={{ borderTop: "4px solid #f87171" }}>
          <h4 className="mb-2 mt-0 text-[11px] font-bold uppercase tracking-[1px] text-[#64748b] dark:text-[#6b7a9a]">
            Schwächste Unit
          </h4>
          <h3 className="mb-2 mt-0 text-[15px] font-semibold text-[#0f172a] dark:text-[#eef2ff]">
            {getUnitLabel(stats.worst?.unit, stats.worst?.listIndex)}
          </h3>
          <p className="m-0 text-[11px] text-[#64748b] dark:text-[#6b7a9a]">
            {formatCurrency(stats.worst?.profit)}
          </p>
        </div>
      </div>

      <div
        className="rounded-[14px] border border-black/10 bg-white p-5 dark:border-white/[0.07] dark:bg-[#141824]"
      >
        <h3
          className="m-0 text-[9px] font-bold uppercase tracking-[1px] text-[#64748b] dark:text-[#6b7a9a]"
        >
          Performance pro Unit
        </h3>

        <table
          style={{
            width: "100%",
            marginTop: "16px",
            borderCollapse: "collapse",
          }}
          className="text-[#0f172a] dark:text-[#eef2ff]"
        >
          <thead>
            <tr
              className="bg-slate-100 text-[9px] font-bold uppercase tracking-[0.8px] text-[#64748b] dark:bg-[#111520] dark:text-[#6b7a9a]"
            >
              <th style={{ textAlign: "left", padding: "10px" }}>Unit</th>
              <th style={{ textAlign: "left", padding: "10px" }}>Ort</th>
              <th style={{ textAlign: "left", padding: "10px" }}>
                Belegung
              </th>
              <th style={{ textAlign: "left", padding: "10px" }}>Umsatz</th>
              <th style={{ textAlign: "left", padding: "10px" }}>Kosten</th>
              <th style={{ textAlign: "left", padding: "10px" }}>Gewinn</th>
            </tr>
          </thead>

          <tbody>
            {stats.results.map((row) => (
              <tr
                key={row.unit?.id ?? row.id}
                className="border-b border-black/10 dark:border-white/[0.05]"
              >
                <td
                  className="p-[10px] text-[13px] font-bold text-[#0f172a] dark:text-[#eef2ff]"
                >
                  <Link
                    to={`/admin/units/${encodeURIComponent(row.unit?.unitId ?? row.unit?.id ?? row.id)}`}
                    className="font-medium text-sky-700 hover:text-sky-800 hover:underline dark:text-sky-400 dark:hover:text-sky-300"
                  >
                    {getUnitLabel(row.unit, row.listIndex)}
                  </Link>
                </td>

                <td className="p-[10px] text-[13px] text-[#0f172a] dark:text-[#eef2ff]">{row.city}</td>

                <td className="p-[10px] text-[13px] text-[#0f172a] dark:text-[#eef2ff]">
                  {row.occupancyLabel}
                </td>

                <td
                  className="text-[13px] font-medium text-slate-900 dark:text-[#eef2ff]"
                  style={{ padding: "10px" }}
                >
                  {formatCurrency(row.revenue)}
                </td>

                <td className="p-[10px] text-[13px] text-[#0f172a] dark:text-[#eef2ff]">
                  {formatCurrency(row.costs)}
                </td>

                <td
                  className={`text-[13px] font-semibold ${
                    row.profit >= 0
                      ? "text-emerald-700 dark:text-emerald-400"
                      : "text-rose-600 dark:text-rose-400"
                  }`}
                  style={{ padding: "10px" }}
                >
                  {formatCurrency(row.profit)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default AdminPerformancePage;
