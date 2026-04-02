import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
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
      const costs = getUnitCostsTotal(rowsCosts);

      const unitType =
        unit?.type === "Apartment" || unit?.type === "Co-Living" ? unit.type : null;

      // Apartment: "Deckungsgrad" = costs / tenantPriceMonthly (lower is better; < 1 means profitable).
      const deckungsgrad01 =
        unitType === "Apartment" && revenue != null && revenue > 0 ? costs / revenue : null;

      // Co-Living: derive rooms + per-room price, then compute rooms needed + occupancy needed.
      const totalRooms =
        unitType === "Co-Living"
          ? clampNonNegativeInt(
              Array.isArray(unit?.rooms) ? unit.rooms.length : unit?.rooms
            )
          : null;
      const occupiedRooms =
        unitType === "Co-Living" ? clampNonNegativeInt(unit?.occupiedRooms) : null;
      const roomPrice =
        unitType === "Co-Living" && revenue != null && occupiedRooms != null && occupiedRooms > 0
          ? toFiniteNumberOrNull(revenue / occupiedRooms)
          : null;

      const breakEvenRooms =
        unitType === "Co-Living" && roomPrice != null && roomPrice > 0
          ? costs / roomPrice
          : null;
      const occupancyNeeded01 =
        unitType === "Co-Living" && breakEvenRooms != null && totalRooms != null && totalRooms > 0
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
        unitType,
        deckungsgrad01,
        totalRooms,
        occupiedRooms,
        breakEvenRooms,
        occupancyNeeded01,
      };
    });
  }, [units, unitCostsByUnitId]);

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
          Break-Even Analyse
        </h2>

        <p
          className="mt-[10px] text-[12px] text-[#64748b] dark:text-[#6b7a9a]"
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
              const isApartment = row.unitType === "Apartment";
              const isCoLiving = row.unitType === "Co-Living";

              const deckungsgradStr = isApartment
                ? formatPercentRounded(row.deckungsgrad01, { decimals: 0 })
                : null;

              const roomsNeededStr =
                isCoLiving && row.breakEvenRooms != null && Number.isFinite(row.breakEvenRooms) && row.totalRooms != null
                  ? `${row.breakEvenRooms.toFixed(1)} / ${row.totalRooms} Rooms needed`
                  : null;
              const occupancyNeededStr = isCoLiving
                ? formatPercentRounded(row.occupancyNeeded01, { decimals: 0 })
                : null;

              const coLivingHasStatus =
                isCoLiving &&
                row.occupiedRooms != null &&
                row.totalRooms != null &&
                row.totalRooms > 0 &&
                row.breakEvenRooms != null &&
                Number.isFinite(row.breakEvenRooms);

              const coLivingIsProfitable =
                coLivingHasStatus ? row.occupiedRooms >= row.breakEvenRooms : null;

              const missingRooms =
                coLivingHasStatus && coLivingIsProfitable === false
                  ? Math.max(0, Math.ceil(row.breakEvenRooms - row.occupiedRooms))
                  : 0;

              const metricUnavailable =
                (isApartment && deckungsgradStr == null) ||
                (isCoLiving && (roomsNeededStr == null || occupancyNeededStr == null)) ||
                (!isApartment && !isCoLiving);

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
                    {formatCurrency(row.costs)}
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
                        : isApartment
                          ? row.deckungsgrad01 < 1
                            ? "text-emerald-700 dark:text-emerald-400"
                            : "text-rose-600 dark:text-rose-400"
                          : "text-slate-900 dark:text-[#eef2ff]"
                    }
                  >
                    {metricUnavailable ? (
                      <span className="font-medium text-slate-500 dark:text-[#6b7a9a]">
                        Nicht berechenbar
                      </span>
                    ) : isApartment ? (
                      <div className="leading-tight">
                        <div>{deckungsgradStr}</div>
                        <div className="mt-0.5 text-[11px] font-medium text-slate-600 dark:text-[#6b7a9a]">
                          Deckungsgrad (Kosten / Umsatz)
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
                              : `⚠️ ${missingRooms} Room(s) fehlen`}
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

    </div>
  );
}

export default AdminBreakEvenPage;
