import React, { useEffect, useMemo, useState } from "react";
import { fetchAdminUnits, fetchAdminUnitCosts, normalizeUnit } from "../../api/adminData";
import { isLandlordContractLeaseStarted, parseIsoDate } from "../../utils/unitOccupancyStatus";
import {
  getUnitCostsTotal,
  sumUnitCostsByType,
} from "../../utils/adminUnitRunningCosts";

function formatCurrency(value, currency = "CHF") {
  const amount = Number(value || 0);
  return `${currency} ${amount.toLocaleString("de-CH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function SummaryCard({ title, value, hint, accentColor }) {
  return (
    <div
      style={{
        background: "#141824",
        border: "1px solid rgba(255, 255, 255, 0.07)",
        borderTop: `4px solid ${accentColor}`,
        borderRadius: "14px",
        padding: "20px",
      }}
    >
      <div
        style={{
          fontSize: "11px",
          color: "#6b7a9a",
          marginBottom: "8px",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "1px",
        }}
      >
        {title}
      </div>
      <div
        style={{
          fontSize: "24px",
          fontWeight: 700,
          color: "#eef2ff",
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>
      {hint ? (
        <div style={{ marginTop: "8px", color: "#6b7a9a", fontSize: "11px" }}>
          {hint}
        </div>
      ) : null}
    </div>
  );
}

function AdminExpensesPage() {
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

  const expenseRows = useMemo(() => {
    return units.map((unit) => {
      const rows = unitCostsByUnitId[String(unit.id)] ?? unitCostsByUnitId[unit.id] ?? [];
      const leaseStarted = isLandlordContractLeaseStarted(unit);
      const rent = leaseStarted ? sumUnitCostsByType(rows, "Miete") : 0;
      const utilities = leaseStarted ? sumUnitCostsByType(rows, "Nebenkosten") : 0;
      const cleaning = leaseStarted ? sumUnitCostsByType(rows, "Reinigung") : 0;
      const total = leaseStarted ? getUnitCostsTotal(rows) : 0;

      return {
        id: unit.id,
        unitId: unit.unitId,
        place: unit.place,
        type: unit.type,
        rent,
        utilities,
        cleaning,
        total,
        leaseStarted,
        leaseStartDate:
          parseIsoDate(unit?.leaseStartDate ?? unit?.lease_start_date) || "—",
      };
    });
  }, [units, unitCostsByUnitId]);

  const summary = useMemo(() => {
    const totalExpenses = expenseRows.reduce((sum, row) => sum + row.total, 0);
    const totalRent = expenseRows.reduce((sum, row) => sum + row.rent, 0);
    const totalUtilities = expenseRows.reduce((sum, row) => sum + row.utilities, 0);
    const totalCleaning = expenseRows.reduce((sum, row) => sum + row.cleaning, 0);
    const futureLeaseUnits = expenseRows.filter((row) => !row.leaseStarted).length;

    return {
      totalExpenses,
      totalRent,
      totalUtilities,
      totalCleaning,
      futureLeaseUnits,
    };
  }, [expenseRows]);

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

        <h2 style={{ fontSize: "22px", fontWeight: 700, margin: 0 }}>
          Ausgaben
        </h2>

        <p style={{ color: "#6b7a9a", marginTop: "10px", fontSize: "12px" }}>
          Übersicht über laufende Mietkosten, Nebenkosten und Reinigung pro Unit.
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "16px",
        }}
      >
        <SummaryCard
          title="Laufende Ausgaben total"
          value={formatCurrency(summary.totalExpenses)}
          hint="Aktive monatliche Kosten"
          accentColor="#7aaeff"
        />

        <SummaryCard
          title="Mietkosten Vermieter"
          value={formatCurrency(summary.totalRent)}
          hint="Monatliche Hauptmieten"
          accentColor="#5b8cff"
        />

        <SummaryCard
          title="Nebenkosten"
          value={formatCurrency(summary.totalUtilities)}
          hint="Laufende Zusatzkosten"
          accentColor="#fb923c"
        />

        <SummaryCard
          title="Reinigung"
          value={formatCurrency(summary.totalCleaning)}
          hint="Monatliche Reinigungskosten"
          accentColor="#4ade80"
        />
      </div>

      <div
        style={{
          background: "#141824",
          border: "1px solid rgba(255, 255, 255, 0.07)",
          borderRadius: "14px",
          padding: "20px",
          overflowX: "auto",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "16px",
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
            Ausgaben pro Unit
          </h3>

          <div style={{ fontSize: "12px", color: "#6b7a9a" }}>
            {expenseRows.length} Einträge
          </div>
        </div>

        {expenseRows.length === 0 ? (
          <p style={{ color: "#6b7a9a" }}>Keine Units gefunden.</p>
        ) : (
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "14px",
            }}
          >
            <thead>
              <tr
                style={{
                  textAlign: "left",
                  background: "#111520",
                  color: "#6b7a9a",
                  fontSize: "9px",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.8px",
                }}
              >
                <th style={{ padding: "12px" }}>Unit</th>
                <th style={{ padding: "12px" }}>Ort</th>
                <th style={{ padding: "12px" }}>Typ</th>
                <th style={{ padding: "12px" }}>Mietkosten</th>
                <th style={{ padding: "12px" }}>Nebenkosten</th>
                <th style={{ padding: "12px" }}>Reinigung</th>
                <th style={{ padding: "12px" }}>Total</th>
                <th style={{ padding: "12px" }}>Mietstart Vermieter</th>
                <th style={{ padding: "12px" }}>Status</th>
              </tr>
            </thead>

            <tbody>
              {expenseRows.map((row) => (
                <tr
                  key={row.id}
                  style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.05)" }}
                >
                  <td
                    style={{
                      padding: "12px",
                      fontWeight: 700,
                      color: "#eef2ff",
                      fontSize: "13px",
                    }}
                  >
                    {row.unitId}
                  </td>
                  <td style={{ padding: "12px", color: "#eef2ff", fontSize: "13px" }}>
                    {row.place}
                  </td>
                  <td style={{ padding: "12px", color: "#eef2ff", fontSize: "13px" }}>
                    {row.type}
                  </td>
                  <td style={{ padding: "12px", color: "#eef2ff", fontSize: "13px" }}>
                    {formatCurrency(row.rent)}
                  </td>
                  <td style={{ padding: "12px", color: "#eef2ff", fontSize: "13px" }}>
                    {formatCurrency(row.utilities)}
                  </td>
                  <td style={{ padding: "12px", color: "#eef2ff", fontSize: "13px" }}>
                    {formatCurrency(row.cleaning)}
                  </td>
                  <td
                    style={{
                      padding: "12px",
                      fontWeight: 700,
                      color: "#eef2ff",
                      fontSize: "13px",
                    }}
                  >
                    {formatCurrency(row.total)}
                  </td>
                  <td style={{ padding: "12px", color: "#eef2ff", fontSize: "13px" }}>
                    {row.leaseStartDate}
                  </td>
                  <td style={{ padding: "12px" }}>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        padding: "6px 10px",
                        borderRadius: "999px",
                        fontSize: "10px",
                        fontWeight: 700,
                        background: row.leaseStarted
                          ? "rgba(34, 197, 94, 0.1)"
                          : "rgba(245, 158, 11, 0.1)",
                        color: row.leaseStarted ? "#4ade80" : "#fbbf24",
                        border: row.leaseStarted
                          ? "1px solid rgba(34, 197, 94, 0.2)"
                          : "1px solid rgba(245, 158, 11, 0.2)",
                      }}
                    >
                      {row.leaseStarted ? "Aktiv" : "Start in Zukunft"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {summary.futureLeaseUnits > 0 && (
        <div
          style={{
            background: "rgba(245, 158, 11, 0.06)",
            border: "1px solid rgba(245, 158, 11, 0.15)",
            borderRadius: "10px",
            padding: "18px 20px",
            color: "#fbbf24",
            fontSize: "14px",
            fontWeight: 500,
          }}
        >
          Hinweis: {summary.futureLeaseUnits} Unit(s) haben einen zukünftigen Mietstart
          beim Vermieter. Diese Kosten werden aktuell noch nicht als laufende Ausgaben gerechnet.
        </div>
      )}
    </div>
  );
}

export default AdminExpensesPage;
