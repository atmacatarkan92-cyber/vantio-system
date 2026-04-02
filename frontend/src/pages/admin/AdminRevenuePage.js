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
      className="relative overflow-hidden rounded-[14px] border border-black/10 bg-white p-5 dark:border-white/[0.07] dark:bg-[#141824]"
      style={{ borderTop: `4px solid ${accent}` }}
    >
      <div
        className="mb-2 text-[11px] font-bold uppercase tracking-[1px] text-[#64748b] dark:text-[#6b7a9a]"
      >
        {title}
      </div>

      <div
        className="text-[24px] font-bold text-[#0f172a] dark:text-[#eef2ff]"
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
          Einnahmen
        </h2>

        <p className="mt-[10px] text-[12px] text-[#64748b] dark:text-[#6b7a9a]">
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
        className="rounded-[14px] border border-black/10 bg-white p-6 dark:border-white/[0.07] dark:bg-[#141824]"
      >
        <h3
          className="mb-4 mt-0 text-[9px] font-bold uppercase tracking-[1px] text-[#64748b] dark:text-[#6b7a9a]"
        >
          Letzte Einnahmen
        </h3>

        {loading && <p className="text-[#64748b] dark:text-[#6b7a9a]">Daten werden geladen...</p>}

        {error && <p style={{ color: "#f87171" }}>{error}</p>}

        {!loading && !error && (
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
                  className="border-b border-black/10 dark:border-white/[0.05]"
                >
                  <td
                    className="p-3 text-[13px] font-semibold text-[#0f172a] dark:text-[#eef2ff]"
                  >
                    {inv.invoice_number}
                  </td>

                  <td className="p-3 text-[13px] text-[#0f172a] dark:text-[#eef2ff]">
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

                  <td className="p-3 text-[13px] text-[#0f172a] dark:text-[#eef2ff]">
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