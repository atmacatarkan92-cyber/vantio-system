import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  fetchAdminUnits,
  fetchAdminRevenueForecast,
  fetchAdminProfit,
  normalizeUnit,
} from "../../api/adminData";

function formatCurrencyMaybe(value) {
  if (value === null || value === undefined) return "-";
  return `CHF ${Number(value).toLocaleString("de-CH")}`;
}

function AdminForecastPage() {
  const [units, setUnits] = useState([]);
  const [revenueForecast, setRevenueForecast] = useState(null);
  const [profitMonth, setProfitMonth] = useState(null);

  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  useEffect(() => {
    fetchAdminUnits()
      .then((data) => setUnits(Array.isArray(data) ? data.map(normalizeUnit) : []))
      .catch(() => setUnits([]));
    fetchAdminRevenueForecast({ year: currentYear, month: currentMonth })
      .then((data) => setRevenueForecast(data))
      .catch(() => setRevenueForecast(null));
    fetchAdminProfit({ year: currentYear, month: currentMonth })
      .then((data) => setProfitMonth(data))
      .catch(() => setProfitMonth(null));
  }, [currentYear, currentMonth]);

  const forecast = useMemo(() => {
    const api = revenueForecast;
    if (!api || !api.summary) {
      return { rows: [], totalRevenue: null, totalProfit: null };
    }
    const totalRevenue =
      api.summary.expected_revenue != null
        ? api.summary.expected_revenue
        : null;
    const totalProfit =
      profitMonth?.summary?.total_profit != null
        ? profitMonth.summary.total_profit
        : null;
    const profitByUnit = new Map(
      (profitMonth?.units || []).map((p) => [String(p.unit_id), p])
    );
    const unitRows = Array.isArray(api.units) ? api.units : [];
    const rows = unitRows.map((rec) => {
      const u = units.find((x) => String(x.id) === String(rec.unit_id));
      const p = profitByUnit.get(String(rec.unit_id));
      const unitDetailId = u?.id ?? u?.unitId ?? rec.unit_id ?? null;
      const addressPrimary =
        String(u?.address ?? "")
          .trim() ||
        String(u?.street ?? "")
          .trim() ||
        String(u?.place ?? "")
          .trim() ||
        "";
      const displayId = u?.unitId || rec.unit_id;
      return {
        id: displayId,
        unitDetailId,
        addressPrimary,
        city: u?.place ?? "-",
        revenue: rec.expected_revenue != null ? rec.expected_revenue : null,
        costs: p != null && p.costs != null ? p.costs : null,
        profit: p != null && p.profit != null ? p.profit : null,
        risk: null,
      };
    });
    return {
      rows,
      totalRevenue,
      totalProfit,
    };
  }, [units, revenueForecast, profitMonth]);

  const kpiShellClassName =
    "relative overflow-hidden rounded-[14px] border border-black/10 bg-white p-5 dark:border-white/[0.07] dark:bg-[#141824]";

  return (
    <div
      className="min-h-full bg-[#f8fafc] text-[#0f172a] [color-scheme:light] dark:bg-[#07090f] dark:text-[#eef2ff] dark:[color-scheme:dark]"
      style={{ display: "grid", gap: "10px" }}
    >

      <div>
        <div
          style={{
            fontSize: "12px",
            color: "#fb923c",
            fontWeight: 700,
            marginBottom: "4px",
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
          Prognose
        </h2>

        <p
          className="mt-1 text-[12px] text-[#64748b] dark:text-[#6b7a9a]"
        >
          Erwarteter Umsatz und Gewinn für den nächsten Monat.
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
          gap: "16px",
        }}
      >

        <div
          className={`${kpiShellClassName} border-t border-slate-200 dark:border-white/10`}
        >
          <h4 className="mb-1 mt-0 text-[11px] font-bold uppercase tracking-[1px] text-slate-500 dark:text-[#94a3b8]">
            Erwarteter Umsatz
          </h4>
          <h2 className="m-0 text-[24px] font-semibold text-slate-900 dark:text-[#eef2ff]">
            {formatCurrencyMaybe(forecast.totalRevenue)}
          </h2>
        </div>

        <div
          className={`${kpiShellClassName} border-t-[3px] border-t-[#059669]`}
        >
          <h4 className="mb-1 mt-0 text-[11px] font-bold uppercase tracking-[1px] text-slate-500 dark:text-[#94a3b8]">
            Erwarteter Gewinn
          </h4>
          <h2 className="m-0 text-[24px] font-extrabold text-emerald-700 dark:text-emerald-400">
            {formatCurrencyMaybe(forecast.totalProfit)}
          </h2>
        </div>

      </div>

      <div
        className="rounded-[14px] border border-black/10 bg-white p-5 dark:border-white/[0.07] dark:bg-[#141824]"
      >

        <h3
          className="m-0 text-[9px] font-bold uppercase tracking-[1px] text-[#64748b] dark:text-[#6b7a9a]"
        >
          Forecast pro Unit
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
              <th style={{ textAlign: "left", padding: "10px" }}>Gewinn</th>
              <th style={{ textAlign: "left", padding: "10px" }}>Risiko</th>
            </tr>
          </thead>

          <tbody>

            {forecast.rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-black/10 dark:border-white/[0.05]"
                >
                  <td className="p-[10px] text-[13px]">
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
                  <td className="p-[10px] text-[13px] text-[#0f172a] dark:text-[#eef2ff]">{row.city}</td>
                  <td className="p-[10px] text-[13px] font-medium text-slate-900 dark:text-[#eef2ff]">
                    {formatCurrencyMaybe(row.revenue)}
                  </td>
                  <td className="p-[10px] text-[13px] text-[#0f172a] dark:text-[#eef2ff]">
                    {formatCurrencyMaybe(row.costs)}
                  </td>
                  <td className="p-[10px] text-[13px] font-bold text-emerald-700 dark:text-emerald-400">
                    {formatCurrencyMaybe(row.profit)}
                  </td>
                  <td className="p-[10px] text-[13px] font-bold text-[#64748b] dark:text-[#6b7a9a]">
                    {row.risk ?? "-"}
                  </td>
                </tr>
              ))}

          </tbody>

        </table>

      </div>

    </div>
  );
}

export default AdminForecastPage;
