import React, { useEffect, useMemo, useState } from "react";
import {
  fetchAdminUnits,
  fetchAdminRooms,
  fetchAdminTenanciesAll,
  normalizeUnit,
  normalizeRoom,
} from "../../api/adminData";
import { getRunningMonthlyCosts } from "../../utils/adminUnitRunningCosts";
import {
  sumActiveTenancyMonthlyRentForUnit,
  getUnitOccupancyStatus,
  formatOccupancyStatusDe,
  getTodayIsoForOccupancy,
} from "../../utils/unitOccupancyStatus";

function formatCurrency(value) {
  const amount = Number(value || 0);
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

function AdminPerformancePage() {
  const [units, setUnits] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [tenancies, setTenancies] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetchAdminUnits()
        .then((data) => (Array.isArray(data) ? data.map(normalizeUnit) : []))
        .catch(() => []),
      fetchAdminRooms()
        .then((data) => (Array.isArray(data) ? data.map(normalizeRoom) : []))
        .catch(() => []),
      fetchAdminTenanciesAll().catch(() => []),
    ])
      .then(([u, r, t]) => {
        if (cancelled) return;
        setUnits(u);
        setRooms(r);
        setTenancies(Array.isArray(t) ? t : []);
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
    const results = units.map((unit) => {
      const revenue = sumActiveTenancyMonthlyRentForUnit(
        unit,
        tenancies,
        todayIso
      );
      const costs = getRunningMonthlyCosts(unit);
      const profit = revenue - costs;
      const occ = getUnitOccupancyStatus(unit, rooms, tenancies);
      return {
        id: unit.unitId,
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
  }, [units, rooms, tenancies]);

  if (loading) {
    return (
      <div style={{ display: "grid", gap: "24px" }}>
        <p style={{ color: "#64748B" }}>Lade Performance…</p>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: "24px" }}>
      <div>
        <div
          style={{
            fontSize: "12px",
            color: "#f97316",
            fontWeight: 700,
            marginBottom: "8px",
          }}
        >
          FeelAtHomeNow Admin
        </div>

        <h2
          style={{
            fontSize: "36px",
            fontWeight: 800,
            margin: 0,
          }}
        >
          Performance
        </h2>

        <p
          style={{
            color: "#64748B",
            marginTop: "10px",
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
        <div className="card">
          <h4>Gesamt Umsatz</h4>
          <h2>{formatCurrency(stats.totalRevenue)}</h2>
        </div>

        <div className="card">
          <h4>Gesamt Gewinn</h4>
          <h2>{formatCurrency(stats.totalProfit)}</h2>
        </div>

        <div className="card">
          <h4>Beste Unit</h4>
          <h3>{stats.best?.id ?? "—"}</h3>
          <p>{formatCurrency(stats.best?.profit)}</p>
        </div>

        <div className="card">
          <h4>Schwächste Unit</h4>
          <h3>{stats.worst?.id ?? "—"}</h3>
          <p>{formatCurrency(stats.worst?.profit)}</p>
        </div>
      </div>

      <div
        style={{
          background: "#fff",
          borderRadius: "16px",
          padding: "20px",
          border: "1px solid #E5E7EB",
        }}
      >
        <h3>Performance pro Unit</h3>

        <table
          style={{
            width: "100%",
            marginTop: "16px",
            borderCollapse: "collapse",
          }}
        >
          <thead>
            <tr style={{ borderBottom: "1px solid #E5E7EB" }}>
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
              <tr key={row.id} style={{ borderBottom: "1px solid #F1F5F9" }}>
                <td style={{ padding: "10px", fontWeight: 700 }}>{row.id}</td>

                <td style={{ padding: "10px" }}>{row.city}</td>

                <td style={{ padding: "10px" }}>{row.occupancyLabel}</td>

                <td style={{ padding: "10px" }}>
                  {formatCurrency(row.revenue)}
                </td>

                <td style={{ padding: "10px" }}>
                  {formatCurrency(row.costs)}
                </td>

                <td
                  style={{
                    padding: "10px",
                    fontWeight: 700,
                    color: row.profit >= 0 ? "#16A34A" : "#DC2626",
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
