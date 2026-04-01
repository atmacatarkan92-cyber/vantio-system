import React, { useEffect, useMemo, useState } from "react";
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

  const kpiCard = (accent) => ({
    background: "#141824",
    border: "1px solid rgba(255, 255, 255, 0.07)",
    borderTop: `4px solid ${accent}`,
    borderRadius: "14px",
    padding: "20px",
  });

  if (loading) {
    return (
      <div
        className="bg-[#07090f] text-[#eef2ff] min-h-full"
        style={{ display: "grid", gap: "24px" }}
      >
        <p style={{ color: "#6b7a9a" }}>Lade Performance…</p>
      </div>
    );
  }

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
          Performance
        </h2>

        <p
          style={{
            color: "#6b7a9a",
            marginTop: "10px",
            fontSize: "12px",
          }}
        >
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
        <div style={kpiCard("#4ade80")}>
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
            Gesamt Umsatz
          </h4>
          <h2 style={{ fontSize: "24px", fontWeight: 700, color: "#4ade80", margin: 0 }}>
            {formatCurrency(stats.totalRevenue)}
          </h2>
        </div>

        <div style={kpiCard("#7aaeff")}>
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
            Gesamt Gewinn
          </h4>
          <h2 style={{ fontSize: "24px", fontWeight: 700, color: "#eef2ff", margin: 0 }}>
            {formatCurrency(stats.totalProfit)}
          </h2>
        </div>

        <div style={kpiCard("#a78bfa")}>
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
            Beste Unit
          </h4>
          <h3 style={{ fontSize: "15px", fontWeight: 600, color: "#eef2ff", margin: "0 0 8px 0" }}>
            {getUnitLabel(stats.best?.unit, stats.best?.listIndex)}
          </h3>
          <p style={{ margin: 0, fontSize: "11px", color: "#6b7a9a" }}>
            {formatCurrency(stats.best?.profit)}
          </p>
        </div>

        <div style={kpiCard("#f87171")}>
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
            Schwächste Unit
          </h4>
          <h3 style={{ fontSize: "15px", fontWeight: 600, color: "#eef2ff", margin: "0 0 8px 0" }}>
            {getUnitLabel(stats.worst?.unit, stats.worst?.listIndex)}
          </h3>
          <p style={{ margin: 0, fontSize: "11px", color: "#6b7a9a" }}>
            {formatCurrency(stats.worst?.profit)}
          </p>
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
          Performance pro Unit
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
                  {getUnitLabel(row.unit, row.listIndex)}
                </td>

                <td style={{ padding: "10px", color: "#eef2ff", fontSize: "13px" }}>{row.city}</td>

                <td style={{ padding: "10px", color: "#eef2ff", fontSize: "13px" }}>
                  {row.occupancyLabel}
                </td>

                <td
                  style={{
                    padding: "10px",
                    color: "#4ade80",
                    fontSize: "13px",
                    fontWeight: 500,
                  }}
                >
                  {formatCurrency(row.revenue)}
                </td>

                <td style={{ padding: "10px", color: "#eef2ff", fontSize: "13px" }}>
                  {formatCurrency(row.costs)}
                </td>

                <td
                  style={{
                    padding: "10px",
                    fontWeight: 700,
                    fontSize: "13px",
                    color: row.profit >= 0 ? "#4ade80" : "#f87171",
                  }}
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
