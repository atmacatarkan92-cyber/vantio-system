import React, { useEffect, useMemo, useState } from "react";
import { fetchAdminUnits, fetchAdminUnitCosts, normalizeUnit } from "../../api/adminData";
import { getUnitCostsTotal } from "../../utils/adminUnitRunningCosts";

function formatCurrency(value) {
  const amount = Number(value || 0);
  return `CHF ${amount.toLocaleString("de-CH")}`;
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
      const revenue = Number(unit.tenantPriceMonthly || 0);
      const rowsCosts =
        unitCostsByUnitId[String(unit.id)] ?? unitCostsByUnitId[unit.id] ?? [];
      const costs = getUnitCostsTotal(rowsCosts);

      const breakEvenOccupancy = revenue === 0 ? null : costs / revenue;

      return {
        id: unit.unitId,
        city: unit.place,
        revenue,
        costs,
        breakEvenOccupancy,
      };
    });
  }, [units, unitCostsByUnitId]);

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
          Break-Even Analyse
        </h2>

        <p
          style={{
            color: "#6b7a9a",
            marginTop: "10px",
            fontSize: "12px",
          }}
        >
          Zeigt ab welcher Belegung eine Unit profitabel wird.
        </p>
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
          Break-Even pro Unit
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
              <th style={{ textAlign: "left", padding: "10px" }}>Break-Even</th>
            </tr>
          </thead>

          <tbody>

            {rows.map((row) => {

              const occ = row.breakEvenOccupancy;
              const pctNum =
                occ != null && Number.isFinite(occ) ? occ * 100 : null;
              const percentStr =
                pctNum != null ? `${pctNum.toFixed(1)} %` : "—";

              return (
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

                  <td style={{ padding: "10px", color: "#eef2ff", fontSize: "13px" }}>
                    {row.city}
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
                      color:
                        pctNum == null
                          ? "#6b7a9a"
                          : pctNum > 90
                            ? "#f87171"
                            : "#4ade80",
                    }}
                  >
                    {percentStr}
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
