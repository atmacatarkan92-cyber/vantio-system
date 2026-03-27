import React, { useEffect, useMemo, useState } from "react";
import { fetchAdminUnits, normalizeUnit } from "../../api/adminData";
import { isLandlordContractLeaseStarted, parseIsoDate } from "../../utils/unitOccupancyStatus";

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
        background: "#FFFFFF",
        border: "1px solid #E5E7EB",
        borderTop: `4px solid ${accentColor}`,
        borderRadius: "18px",
        padding: "20px",
        boxShadow: "0 4px 14px rgba(15, 23, 42, 0.04)",
      }}
    >
      <div style={{ fontSize: "13px", color: "#64748B", marginBottom: "8px" }}>
        {title}
      </div>
      <div
        style={{
          fontSize: "32px",
          fontWeight: 800,
          color: "#0F172A",
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>
      {hint ? (
        <div style={{ marginTop: "8px", color: "#64748B", fontSize: "14px" }}>
          {hint}
        </div>
      ) : null}
    </div>
  );
}

function getRunningMonthlyCosts(unit) {
  if (!isLandlordContractLeaseStarted(unit)) return 0;

  return (
    Number(unit.landlordRentMonthly || 0) +
    Number(unit.utilitiesMonthly || 0) +
    Number(unit.cleaningCostMonthly || 0)
  );
}

function AdminExpensesPage() {
  const [units, setUnits] = useState([]);

  useEffect(() => {
    fetchAdminUnits()
      .then((data) => setUnits(Array.isArray(data) ? data.map(normalizeUnit) : []))
      .catch(() => setUnits([]));
  }, []);

  const expenseRows = useMemo(() => {
    return units.map((unit) => {
      const rent = Number(unit.landlordRentMonthly || 0);
      const utilities = Number(unit.utilitiesMonthly || 0);
      const cleaning = Number(unit.cleaningCostMonthly || 0);
      const total = getRunningMonthlyCosts(unit);

      return {
        id: unit.id,
        unitId: unit.unitId,
        place: unit.place,
        type: unit.type,
        rent,
        utilities,
        cleaning,
        total,
        leaseStarted: isLandlordContractLeaseStarted(unit),
        leaseStartDate:
          parseIsoDate(unit?.leaseStartDate ?? unit?.lease_start_date) || "—",
      };
    });
  }, [units]);

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

        <h2 style={{ fontSize: "36px", fontWeight: 800, margin: 0 }}>
          Ausgaben
        </h2>

        <p style={{ color: "#64748B", marginTop: "10px" }}>
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
          accentColor="#334155"
        />

        <SummaryCard
          title="Mietkosten Vermieter"
          value={formatCurrency(summary.totalRent)}
          hint="Monatliche Hauptmieten"
          accentColor="#2563EB"
        />

        <SummaryCard
          title="Nebenkosten"
          value={formatCurrency(summary.totalUtilities)}
          hint="Laufende Zusatzkosten"
          accentColor="#F59E0B"
        />

        <SummaryCard
          title="Reinigung"
          value={formatCurrency(summary.totalCleaning)}
          hint="Monatliche Reinigungskosten"
          accentColor="#16A34A"
        />
      </div>

      <div
        style={{
          background: "#FFFFFF",
          border: "1px solid #E5E7EB",
          borderRadius: "18px",
          padding: "20px",
          overflowX: "auto",
          boxShadow: "0 4px 14px rgba(15, 23, 42, 0.04)",
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
          <h3 style={{ fontSize: "20px", fontWeight: 700, margin: 0 }}>
            Ausgaben pro Unit
          </h3>

          <div style={{ fontSize: "14px", color: "#64748B" }}>
            {expenseRows.length} Einträge
          </div>
        </div>

        {expenseRows.length === 0 ? (
          <p>Keine Units gefunden.</p>
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
                  borderBottom: "1px solid #E5E7EB",
                  color: "#64748B",
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
                  key={row.unitId}
                  style={{ borderBottom: "1px solid #F1F5F9" }}
                >
                  <td style={{ padding: "12px", fontWeight: 700, color: "#0F172A" }}>
                    {row.unitId}
                  </td>
                  <td style={{ padding: "12px" }}>{row.place}</td>
                  <td style={{ padding: "12px" }}>{row.type}</td>
                  <td style={{ padding: "12px" }}>{formatCurrency(row.rent)}</td>
                  <td style={{ padding: "12px" }}>{formatCurrency(row.utilities)}</td>
                  <td style={{ padding: "12px" }}>{formatCurrency(row.cleaning)}</td>
                  <td style={{ padding: "12px", fontWeight: 700 }}>
                    {formatCurrency(row.total)}
                  </td>
                  <td style={{ padding: "12px" }}>{row.leaseStartDate}</td>
                  <td style={{ padding: "12px" }}>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        padding: "6px 10px",
                        borderRadius: "999px",
                        fontSize: "12px",
                        fontWeight: 700,
                        background: row.leaseStarted ? "#DCFCE7" : "#FEF3C7",
                        color: row.leaseStarted ? "#166534" : "#92400E",
                        border: row.leaseStarted
                          ? "1px solid #86EFAC"
                          : "1px solid #FCD34D",
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
            background: "#FFFBEB",
            border: "1px solid #FDE68A",
            borderRadius: "18px",
            padding: "18px 20px",
            color: "#92400E",
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