import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { fetchAdminUnits, fetchAdminUnitCosts, normalizeUnit } from "../../api/adminData";
import { getUnitCostsTotal } from "../../utils/adminUnitRunningCosts";

function formatCurrency(value) {
  const amount = Number(value || 0);
  return `CHF ${amount.toLocaleString("de-CH")}`;
}

function toFiniteNumberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function clampNonNegativeInt(value) {
  const n = Math.floor(Number(value || 0));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function formatPercentRounded(value01, { decimals = 0 } = {}) {
  if (value01 == null || !Number.isFinite(value01)) return null;
  const pct = value01 * 100;
  if (!Number.isFinite(pct)) return null;
  return `${pct.toFixed(Math.max(0, Math.min(1, decimals)))} %`;
}

/** Normalize unit.type for comparisons (trim + lowercase). */
function normalizeUnitTypeLabel(type) {
  return String(type ?? "").trim().toLowerCase();
}

function isCoverageBreakEven(coverage) {
  if (coverage == null || !Number.isFinite(coverage)) return false;
  return Math.abs(coverage - 1) < 1e-9;
}

function truncateChartLabel(s, maxLen) {
  const t = String(s || "").trim();
  if (t.length <= maxLen) return t || "—";
  return `${t.slice(0, maxLen - 1)}…`;
}

function AdminBreakEvenPage() {
  const [units, setUnits] = useState([]);
  const [unitCostsByUnitId, setUnitCostsByUnitId] = useState({});

  useEffect(() => {
    fetchAdminUnits()
      .then((data) => setUnits(Array.isArray(data) ? data.map(normalizeUnit) : []))
      .catch(() => setUnits([]));
  }, []);

  useEffect(() => {
    if (!Array.isArray(units) || units.length === 0) {
      setUnitCostsByUnitId({});
      return undefined;
    }
    let cancelled = false;
    Promise.all(
      units.map((u) =>
        fetchAdminUnitCosts(u.id)
          .then((rows) => [String(u.id), Array.isArray(rows) ? rows : []])
          .catch(() => [String(u.id), []])
      )
    ).then((entries) => {
      if (cancelled) return;
      setUnitCostsByUnitId(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [units]);

  const rows = useMemo(() => {
    return units.map((unit) => {
      const revenue =
        unit.current_revenue_chf == null ? null : Number(unit.current_revenue_chf);
      const rowsCosts =
        unitCostsByUnitId[String(unit.id)] ?? unitCostsByUnitId[unit.id] ?? [];
      const costsRaw = getUnitCostsTotal(rowsCosts);
      const costs =
        costsRaw == null || !Number.isFinite(Number(costsRaw)) ? null : Number(costsRaw);

      const unitType = normalizeUnitTypeLabel(unit?.type);
      const isApartmentType = unitType === "apartment";
      const isCoLivingType = unitType === "co-living";
      const knownType = isApartmentType || isCoLivingType ? unitType : null;

      // Apartment: Deckungsgrad = revenue / costs (coverage); >1 profitable, <1 loss, 1 break-even.
      const deckungsgrad01 =
        isApartmentType && revenue != null && costs != null && costs > 0
          ? revenue / costs
          : null;

      // Co-Living: aligned snapshots from GET /api/admin/units (same source as KPI occupancy).
      const totalRooms =
        isCoLivingType ? clampNonNegativeInt(unit?.total_rooms_snapshot) : null;
      const occupiedRooms =
        isCoLivingType ? clampNonNegativeInt(unit?.occupied_rooms_snapshot) : null;
      const roomPrice =
        isCoLivingType && revenue != null && occupiedRooms != null && occupiedRooms > 0
          ? toFiniteNumberOrNull(revenue / occupiedRooms)
          : null;

      const breakEvenRooms =
        isCoLivingType &&
        roomPrice != null &&
        roomPrice > 0 &&
        costs != null &&
        costs > 0
          ? costs / roomPrice
          : null;
      const occupancyNeeded01 =
        isCoLivingType && breakEvenRooms != null && totalRooms != null && totalRooms > 0
          ? breakEvenRooms / totalRooms
          : null;

      const unitDetailId = unit?.id ?? unit?.unitId ?? null;
      const addressPrimary =
        String(unit?.address ?? "").trim() ||
        String(unit?.street ?? "").trim() ||
        String(unit?.place ?? "").trim() ||
        "";

      return {
        id: unit.unitId,
        unitDetailId,
        addressPrimary,
        city: unit.place,
        revenue,
        costs,
        unitType: knownType,
        deckungsgrad01,
        totalRooms,
        occupiedRooms,
        breakEvenRooms,
        occupancyNeeded01,
      };
    });
  }, [units, unitCostsByUnitId]);

  const barChartData = useMemo(() => {
    return rows.map((row) => {
      const rev =
        row.revenue == null || !Number.isFinite(Number(row.revenue)) ? null : Number(row.revenue);
      const cst =
        row.costs == null || !Number.isFinite(Number(row.costs)) ? null : Number(row.costs);
      return {
        label: truncateChartLabel(row.addressPrimary || row.id, 15),
        revenue: rev,
        costs: cst,
        revenueMissing: row.revenue == null,
        costsMissing: row.costs == null,
      };
    });
  }, [rows]);

  return (
    <div
      className="min-h-full bg-[#f8fafc] text-[#0f172a] [color-scheme:light] dark:bg-[#07090f] dark:text-[#eef2ff] dark:[color-scheme:dark]"
      style={{ display: "grid", gap: "14px" }}
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
          Break-Even Analyse
        </h2>

        <p
          className="mt-2 text-[12px] text-[#64748b] dark:text-[#6b7a9a]"
        >
          Zeigt ab welcher Belegung eine Unit profitabel wird.
        </p>
      </div>

      <div
        className="rounded-[14px] border border-black/10 bg-white p-5 dark:border-white/[0.07] dark:bg-[#141824]"
      >

        <h3
          className="m-0 text-[9px] font-bold uppercase tracking-[1px] text-[#64748b] dark:text-[#6b7a9a]"
        >
          Break-Even pro Unit
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
              <th style={{ textAlign: "left", padding: "10px" }}>Umsatz</th>
              <th style={{ textAlign: "left", padding: "10px" }}>Kosten</th>
              <th style={{ textAlign: "left", padding: "10px" }}>
                Deckungsgrad / Auslastung
              </th>
            </tr>
          </thead>

          <tbody>

            {rows.map((row) => {
              const isApartment = row.unitType === "apartment";
              const isCoLiving = row.unitType === "co-living";

              const apartmentInvalid =
                isApartment &&
                (row.revenue == null ||
                  row.costs == null ||
                  row.costs <= 0);

              const deckungsgradStr =
                isApartment && !apartmentInvalid && row.deckungsgrad01 != null
                  ? formatPercentRounded(row.deckungsgrad01, { decimals: 0 })
                  : null;

              const coLivingInvalid =
                isCoLiving &&
                (row.revenue === null ||
                  row.costs === null ||
                  row.costs === 0 ||
                  row.occupiedRooms === 0 ||
                  row.totalRooms === 0);

              const roomsNeededStr =
                isCoLiving &&
                !coLivingInvalid &&
                row.breakEvenRooms != null &&
                Number.isFinite(row.breakEvenRooms) &&
                row.totalRooms != null &&
                row.totalRooms > 0
                  ? `${row.breakEvenRooms.toFixed(1)} / ${row.totalRooms} Rooms`
                  : null;
              const occupancyNeededStr =
                isCoLiving &&
                !coLivingInvalid &&
                row.occupancyNeeded01 != null &&
                Number.isFinite(row.occupancyNeeded01)
                  ? formatPercentRounded(row.occupancyNeeded01, { decimals: 0 })
                  : null;

              const coLivingHasStatus = isCoLiving && !coLivingInvalid;

              const coLivingIsProfitable =
                coLivingHasStatus ? row.occupiedRooms >= row.breakEvenRooms : null;

              const missingRooms =
                coLivingHasStatus && coLivingIsProfitable === false
                  ? Math.ceil(row.breakEvenRooms - row.occupiedRooms)
                  : 0;

              const metricUnavailable =
                apartmentInvalid ||
                coLivingInvalid ||
                (!isApartment && !isCoLiving);

              const apartmentCoverageClass =
                isApartment &&
                !apartmentInvalid &&
                row.deckungsgrad01 != null &&
                Number.isFinite(row.deckungsgrad01)
                  ? isCoverageBreakEven(row.deckungsgrad01)
                    ? "text-amber-600 dark:text-amber-400"
                    : row.deckungsgrad01 > 1
                      ? "text-emerald-700 dark:text-emerald-400"
                      : row.deckungsgrad01 < 1
                        ? "text-rose-600 dark:text-rose-400"
                        : ""
                  : "";

              return (
                <tr
                  key={row.id}
                  className="border-b border-black/10 dark:border-white/[0.05]"
                >

                  <td
                    className="p-[10px] text-[13px] font-bold text-[#0f172a] dark:text-[#eef2ff]"
                  >
                    {row.unitDetailId ? (
                      <Link
                        to={`/admin/units/${encodeURIComponent(row.unitDetailId)}`}
                        className="block font-medium text-sky-700 hover:text-sky-800 hover:underline dark:text-sky-400 dark:hover:text-sky-300"
                      >
                        {row.addressPrimary || row.id}
                      </Link>
                    ) : (
                      <span className="block font-medium text-[#0f172a] dark:text-[#eef2ff]">
                        {row.addressPrimary || row.id}
                      </span>
                    )}
                    {row.unitType === "co-living" ? (
                      <span className="mt-1 inline-block rounded-full border border-indigo-200 bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold text-indigo-700 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-400">
                        Co-Living
                      </span>
                    ) : row.unitType === "apartment" ? (
                      <span className="mt-1 inline-block rounded-full border border-black/10 bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700 dark:border-white/10 dark:bg-white/10 dark:text-[#cbd5f5]">
                        Apartment
                      </span>
                    ) : null}
                    {row.addressPrimary && row.id ? (
                      <span className="mt-0.5 block break-all font-mono text-[10px] font-normal text-slate-600 dark:text-[#6b7a9a]">
                        {row.id}
                      </span>
                    ) : null}
                  </td>

                  <td className="p-[10px] text-[13px] text-[#0f172a] dark:text-[#eef2ff]">
                    {row.city}
                  </td>

                  <td
                    className="p-[10px] text-[13px] font-medium text-slate-900 dark:text-[#eef2ff]"
                  >
                    {row.revenue == null ? "—" : formatCurrency(row.revenue)}
                  </td>

                  <td className="p-[10px] text-[13px] text-[#0f172a] dark:text-[#eef2ff]">
                    {row.costs == null ? "—" : formatCurrency(row.costs)}
                  </td>

                  <td
                    style={{
                      padding: "10px",
                      fontWeight: 700,
                      fontSize: "13px",
                    }}
                    className={
                      metricUnavailable
                        ? "text-[#64748b] dark:text-[#6b7a9a]"
                        : "text-slate-900 dark:text-[#eef2ff]"
                    }
                  >
                    {metricUnavailable ? (
                      <span className="font-medium text-slate-500 dark:text-[#6b7a9a]">
                        Nicht berechenbar
                      </span>
                    ) : isApartment ? (
                      <div className="leading-tight">
                        <div className={apartmentCoverageClass || undefined}>{deckungsgradStr}</div>
                        <div className="mt-0.5 text-[11px] font-medium text-slate-600 dark:text-[#6b7a9a]">
                          Deckungsgrad (Umsatz / Kosten)
                        </div>
                      </div>
                    ) : (
                      <div className="leading-tight">
                        <div>{roomsNeededStr}</div>
                        <div className="mt-0.5 text-[11px] font-medium text-slate-600 dark:text-[#6b7a9a]">
                          {occupancyNeededStr} Auslastung nötig
                        </div>
                        {coLivingHasStatus ? (
                          <div
                            className={
                              coLivingIsProfitable
                                ? "mt-1 text-[12px] font-semibold text-emerald-700 dark:text-emerald-400"
                                : "mt-1 text-[12px] font-semibold text-amber-700 dark:text-amber-400"
                            }
                          >
                            {coLivingIsProfitable
                              ? "✅ Profitabel"
                              : `⚠️ ${missingRooms} Zimmer fehlen`}
                          </div>
                        ) : null}
                      </div>
                    )}
                  </td>

                </tr>
              );

            })}

          </tbody>

        </table>

      </div>

      <div className="rounded-[14px] border border-black/10 bg-white p-5 dark:border-white/[0.07] dark:bg-[#141824]">
        <h3 className="m-0 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#64748b] dark:text-[#6b7a9a]">
          Portfolio-Überblick
        </h3>
        <p className="mt-1 text-[12px] text-[#64748b] dark:text-[#6b7a9a]">
          Umsatz und Kosten pro Unit — direkter Vergleich je Adresse.
        </p>
        <div className="mt-4 w-full min-w-0">
          <div className="min-h-[200px] w-full">
            {rows.length === 0 ? (
              <p className="py-12 text-center text-[13px] text-[#64748b] dark:text-[#6b7a9a]">
                Keine Units geladen.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart
                  data={barChartData}
                  margin={{ top: 4, right: 12, left: 4, bottom: 8 }}
                  barCategoryGap="35%"
                  barGap={0}
                  barSize={28}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148,163,184,0.35)" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: "currentColor" }}
                    className="text-slate-500 dark:text-[#6b7a9a]"
                    interval={0}
                    tickMargin={6}
                    height={36}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "currentColor" }}
                    className="text-slate-500 dark:text-[#6b7a9a]"
                    tickFormatter={(v) =>
                      v >= 1000 ? `${(v / 1000).toLocaleString("de-CH", { maximumFractionDigits: 1 })}k` : String(v)
                    }
                    width={44}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 10,
                      border: "1px solid rgba(148,163,184,0.35)",
                      fontSize: 12,
                    }}
                    labelStyle={{ fontWeight: 600 }}
                    formatter={(value, name, item) => {
                      const payload = item?.payload;
                      const missing =
                        name === "Umsatz" ? payload?.revenueMissing : payload?.costsMissing;
                      if (missing) return ["—", name];
                      return [`CHF ${Number(value).toLocaleString("de-CH")}`, name];
                    }}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                    wrapperClassName="text-slate-600 dark:text-[#94a3b8]"
                  />
                  <Bar
                    dataKey="revenue"
                    name="Umsatz"
                    fill="#059669"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="costs"
                    name="Kosten"
                    fill="#f87171"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}

export default AdminBreakEvenPage;
