import React, { useEffect, useState } from "react";
import { fetchTenantInvoices } from "../../api/tenantApi";

function formatDate(s) {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleDateString("de-CH", { year: "numeric", month: "2-digit", day: "2-digit" });
  } catch {
    return s;
  }
}

function formatCurrency(v) {
  const n = Number(v);
  if (Number.isNaN(n)) return "—";
  return `CHF ${n.toLocaleString("de-CH")}`;
}

function statusStyle(s) {
  const t = (s || "").toLowerCase();
  if (t === "paid") return { color: "#15803D", fontWeight: 600 };
  if (t === "overdue") return { color: "#B91C1C", fontWeight: 600 };
  return { color: "#475569" };
}

function TenantInvoicesPage() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    fetchTenantInvoices()
      .then((data) => setList(Array.isArray(data) ? data : []))
      .catch((e) => setError(e.message || "Rechnungen konnten nicht geladen werden."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p style={{ color: "#64748B" }}>Lade …</p>;
  if (error) return <p style={{ color: "#B91C1C" }}>{error}</p>;

  return (
    <div>
      <h2 style={{ fontSize: "24px", fontWeight: 800, margin: "0 0 16px 0", color: "#0F172A" }}>
        Meine Rechnungen
      </h2>
      {list.length === 0 ? (
        <p style={{ color: "#64748B" }}>Keine Rechnungen vorhanden.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #E5E7EB", textAlign: "left" }}>
                <th style={{ padding: "12px 8px", color: "#64748B" }}>Rechnungsnummer</th>
                <th style={{ padding: "12px 8px", color: "#64748B" }}>Betrag</th>
                <th style={{ padding: "12px 8px", color: "#64748B" }}>Fällig am</th>
                <th style={{ padding: "12px 8px", color: "#64748B" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {list.map((inv) => (
                <tr key={inv.id} style={{ borderBottom: "1px solid #F1F5F9" }}>
                  <td style={{ padding: "12px 8px", fontWeight: 600 }}>{inv.invoice_number || inv.id || "—"}</td>
                  <td style={{ padding: "12px 8px" }}>{formatCurrency(inv.amount)}</td>
                  <td style={{ padding: "12px 8px" }}>{formatDate(inv.due_date)}</td>
                  <td style={{ padding: "12px 8px", ...statusStyle(inv.status) }}>
                    {inv.status === "paid" ? "Bezahlt" : inv.status === "overdue" ? "Überfällig" : "Offen"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default TenantInvoicesPage;
