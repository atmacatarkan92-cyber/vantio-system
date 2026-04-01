import React, { useEffect, useMemo, useState } from "react";
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
      return {
        id: u?.unitId || rec.unit_id,
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

  const kpiShell = (accent) => ({
    background: "#141824",
    border: "1px solid rgba(255, 255, 255, 0.07)",
    borderTop: `4px solid ${accent}`,
    borderRadius: "14px",
    padding: "20px",
  });

  return (
    <div
      className="bg-[#07090f] text-[#eef2ff] min-h-full"
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
          Prognose
        </h2>

        <p
          style={{
            color: "#6b7a9a",
            marginTop: "10px",
            fontSize: "12px",
          }}
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

        <div style={kpiShell("#4ade80")}>
          <h4
            style={{
              fontSize: "11px",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "1px",
              color: "#6b7a9a",
              margin: "0 0 8px 0",
            }}
          >
            Erwarteter Umsatz
          </h4>
          <h2 style={{ fontSize: "24px", fontWeight: 700, color: "#4ade80", margin: 0 }}>
            {formatCurrencyMaybe(forecast.totalRevenue)}
          </h2>
        </div>

        <div style={kpiShell("#7aaeff")}>
          <h4
            style={{
              fontSize: "11px",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "1px",
              color: "#6b7a9a",
              margin: "0 0 8px 0",
            }}
          >
            Erwarteter Gewinn
          </h4>
          <h2 style={{ fontSize: "24px", fontWeight: 700, color: "#eef2ff", margin: 0 }}>
            {formatCurrencyMaybe(forecast.totalProfit)}
          </h2>
        </div>

      </div>

      <div
        style={{
          background: "#141824",
          borderRadius: "14px",
          padding: "20px",
          border: "1px solid rgba(255, 255, 255, 0.07)",
        }}
      >

        <h3
          style={{
            fontSize: "9px",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "1px",
            color: "#6b7a9a",
            margin: 0,
          }}
        >
          Forecast pro Unit
        </h3>

        <table
          style={{
            width: "100%",
            marginTop: "16px",
            borderCollapse: "collapse",
          }}
        >

          <thead>
            <tr
              style={{
                background: "#111520",
                color: "#6b7a9a",
                fontSize: "9px",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.8px",
              }}
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
                  style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.05)" }}
                >
                  <td
                    style={{
                      padding: "10px",
                      fontWeight: 700,
                      color: "#eef2ff",
                      fontSize: "13px",
                    }}
                  >
                    {row.id}
                  </td>
                  <td style={{ padding: "10px", color: "#eef2ff", fontSize: "13px" }}>{row.city}</td>
                  <td
                    style={{
                      padding: "10px",
                      color: "#4ade80",
                      fontSize: "13px",
                      fontWeight: 500,
                    }}
                  >
                    {formatCurrencyMaybe(row.revenue)}
                  </td>
                  <td style={{ padding: "10px", color: "#eef2ff", fontSize: "13px" }}>
                    {formatCurrencyMaybe(row.costs)}
                  </td>
                  <td style={{ padding: "10px", fontWeight: 700, color: "#eef2ff", fontSize: "13px" }}>
                    {formatCurrencyMaybe(row.profit)}
                  </td>
                  <td style={{ padding: "10px", fontWeight: 700, color: "#6b7a9a", fontSize: "13px" }}>
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
