import React, { useEffect, useState } from "react";
import { fetchTenantTenancies } from "../../api/tenantApi";

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

function TenantTenanciesPage() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    fetchTenantTenancies()
      .then((data) => setList(Array.isArray(data) ? data : []))
      .catch((e) => setError(e.message || "Mietverhältnisse konnten nicht geladen werden."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p style={{ color: "#64748B" }}>Lade …</p>;
  if (error) return <p style={{ color: "#B91C1C" }}>{error}</p>;

  return (
    <div>
      <h2 style={{ fontSize: "24px", fontWeight: 800, margin: "0 0 16px 0", color: "#0F172A" }}>
        Meine Mietverhältnisse
      </h2>
      {list.length === 0 ? (
        <p style={{ color: "#64748B" }}>Keine Mietverhältnisse vorhanden.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #E5E7EB", textAlign: "left" }}>
                <th style={{ padding: "12px 8px", color: "#64748B" }}>Objekt / Zimmer</th>
                <th style={{ padding: "12px 8px", color: "#64748B" }}>Einzug</th>
                <th style={{ padding: "12px 8px", color: "#64748B" }}>Auszug</th>
                <th style={{ padding: "12px 8px", color: "#64748B" }}>Miete</th>
                <th style={{ padding: "12px 8px", color: "#64748B" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {list.map((t) => (
                <tr key={t.id} style={{ borderBottom: "1px solid #F1F5F9" }}>
                  <td style={{ padding: "12px 8px" }}>
                    {t.unit_title || t.unit_id || "—"} {t.room_name ? ` / ${t.room_name}` : ""}
                  </td>
                  <td style={{ padding: "12px 8px" }}>{formatDate(t.move_in_date)}</td>
                  <td style={{ padding: "12px 8px" }}>{formatDate(t.move_out_date)}</td>
                  <td style={{ padding: "12px 8px" }}>
                    {formatCurrency(t.monthly_revenue_equivalent)}
                  </td>
                  <td style={{ padding: "12px 8px" }}>{t.status || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default TenantTenanciesPage;
