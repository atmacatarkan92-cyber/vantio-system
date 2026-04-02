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
      className="relative overflow-hidden rounded-[14px] border border-black/10 bg-white p-5 dark:border-white/[0.07] dark:bg-[#141824]"
      style={{ borderTop: `4px solid ${accentColor}` }}
    >
      <div
        className="mb-2 text-[11px] font-bold uppercase tracking-[1px] text-[#64748b] dark:text-[#6b7a9a]"
      >
        {title}
      </div>
      <div
        className="text-[24px] font-bold leading-[1.1] text-[#0f172a] dark:text-[#eef2ff]"
      >
        {value}
      </div>
      {hint ? (
        <div className="mt-2 text-[11px] text-[#64748b] dark:text-[#6b7a9a]">
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

        <h2 style={{ fontSize: "22px", fontWeight: 700, margin: 0 }}>
          Ausgaben
        </h2>

        <p className="mt-[10px] text-[12px] text-[#64748b] dark:text-[#6b7a9a]">
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
        className="overflow-x-auto rounded-[14px] border border-black/10 bg-white p-5 dark:border-white/[0.07] dark:bg-[#141824]"
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
            className="m-0 text-[9px] font-bold uppercase tracking-[1px] text-[#64748b] dark:text-[#6b7a9a]"
          >
            Ausgaben pro Unit
          </h3>

          <div className="text-[12px] text-[#64748b] dark:text-[#6b7a9a]">
            {expenseRows.length} Einträge
          </div>
        </div>

        {expenseRows.length === 0 ? (
          <p className="text-[#64748b] dark:text-[#6b7a9a]">Keine Units gefunden.</p>
        ) : (
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "14px",
            }}
            className="text-[#0f172a] dark:text-[#eef2ff]"
          >
            <thead>
              <tr
                className="text-left text-[9px] font-bold uppercase tracking-[0.8px] text-[#64748b] dark:text-[#6b7a9a] bg-slate-100 dark:bg-[#111520]"
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
                  className="border-b border-black/10 dark:border-white/[0.05]"
                >
                  <td
                    className="p-3 text-[13px] font-bold text-[#0f172a] dark:text-[#eef2ff]"
                  >
                    {row.unitId}
                  </td>
                  <td className="p-3 text-[13px] text-[#0f172a] dark:text-[#eef2ff]">
                    {row.place}
                  </td>
                  <td className="p-3 text-[13px] text-[#0f172a] dark:text-[#eef2ff]">
                    {row.type}
                  </td>
                  <td className="p-3 text-[13px] text-[#0f172a] dark:text-[#eef2ff]">
                    {formatCurrency(row.rent)}
                  </td>
                  <td className="p-3 text-[13px] text-[#0f172a] dark:text-[#eef2ff]">
                    {formatCurrency(row.utilities)}
                  </td>
                  <td className="p-3 text-[13px] text-[#0f172a] dark:text-[#eef2ff]">
                    {formatCurrency(row.cleaning)}
                  </td>
                  <td
                    className="p-3 text-[13px] font-bold text-[#0f172a] dark:text-[#eef2ff]"
                  >
                    {formatCurrency(row.total)}
                  </td>
                  <td className="p-3 text-[13px] text-[#0f172a] dark:text-[#eef2ff]">
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
