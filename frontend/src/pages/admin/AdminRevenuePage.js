import React, { useEffect, useMemo, useState } from "react";
import { fetchAdminInvoices } from "../../api/adminData";

function formatCurrency(value, currency = "CHF") {
  const amount = Number(value || 0);

  return `${currency} ${amount.toLocaleString("de-CH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function formatDate(dateString) {
  if (!dateString) return "-";

  const date = new Date(dateString);

  if (Number.isNaN(date.getTime())) return dateString;

  return date.toLocaleDateString("de-CH", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function SummaryCard({ title, value, accent }) {
  return (
    <div
      style={{
        background: "#141824",
        border: "1px solid rgba(255, 255, 255, 0.07)",
        borderTop: `4px solid ${accent}`,
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
        }}
      >
        {value}
      </div>
    </div>
  );
}

function AdminRevenuePage() {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchAdminInvoices()
      .then(setInvoices)
      .catch((err) => {
        console.error(err);
        setError(err?.message ?? "Einnahmen konnten nicht geladen werden");
      })
      .finally(() => setLoading(false));
  }, []);

  const stats = useMemo(() => {
    const paid = invoices.filter((i) => i.status === "paid");

    const totalRevenue = paid.reduce(
      (sum, inv) => sum + Number(inv.amount || 0),
      0
    );

    const openInvoices = invoices.filter((i) => i.status === "open");

    const expectedRevenue = openInvoices.reduce(
      (sum, inv) => sum + Number(inv.amount || 0),
      0
    );

    const overdue = invoices.filter((i) => i.status === "overdue");

    const overdueAmount = overdue.reduce(
      (sum, inv) => sum + Number(inv.amount || 0),
      0
    );

    return {
      totalRevenue,
      expectedRevenue,
      overdueAmount,
      paidCount: paid.length,
    };
  }, [invoices]);

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
          Einnahmen
        </h2>

        <p style={{ color: "#6b7a9a", marginTop: "10px", fontSize: "12px" }}>
          Übersicht über bezahlte Rechnungen und erwartete Einnahmen.
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
          gap: "16px",
        }}
      >
        <SummaryCard
          title="Gesamte Einnahmen"
          value={formatCurrency(stats.totalRevenue)}
          accent="#4ade80"
        />

        <SummaryCard
          title="Erwartete Einnahmen"
          value={formatCurrency(stats.expectedRevenue)}
          accent="#fb923c"
        />

        <SummaryCard
          title="Überfällige Beträge"
          value={formatCurrency(stats.overdueAmount)}
          accent="#f87171"
        />

        <SummaryCard
          title="Bezahlte Rechnungen"
          value={stats.paidCount}
          accent="#7aaeff"
        />
      </div>

      <div
        style={{
          background: "#141824",
          border: "1px solid rgba(255, 255, 255, 0.07)",
          borderRadius: "14px",
          padding: "24px",
        }}
      >
        <h3
          style={{
            fontSize: "9px",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "1px",
            color: "#6b7a9a",
            marginTop: 0,
            marginBottom: "16px",
          }}
        >
          Letzte Einnahmen
        </h3>

        {loading && <p style={{ color: "#6b7a9a" }}>Daten werden geladen...</p>}

        {error && <p style={{ color: "#f87171" }}>{error}</p>}

        {!loading && !error && (
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
                <th style={{ padding: "12px" }}>Rechnung</th>
                <th style={{ padding: "12px" }}>Datum</th>
                <th style={{ padding: "12px" }}>Betrag</th>
                <th style={{ padding: "12px" }}>Status</th>
              </tr>
            </thead>

            <tbody>
              {invoices.slice(0, 10).map((inv) => (
                <tr
                  key={inv.id}
                  style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.05)" }}
                >
                  <td
                    style={{
                      padding: "12px",
                      fontWeight: 600,
                      color: "#eef2ff",
                      fontSize: "13px",
                    }}
                  >
                    {inv.invoice_number}
                  </td>

                  <td style={{ padding: "12px", color: "#eef2ff", fontSize: "13px" }}>
                    {formatDate(inv.issue_date)}
                  </td>

                  <td
                    style={{
                      padding: "12px",
                      color: "#4ade80",
                      fontSize: "13px",
                      fontWeight: 500,
                    }}
                  >
                    {formatCurrency(inv.amount, inv.currency)}
                  </td>

                  <td style={{ padding: "12px", color: "#eef2ff", fontSize: "13px" }}>
                    {inv.status}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default AdminRevenuePage;