import React, { useEffect, useState } from "react";
import { fetchLandlordTenancies } from "../../api/landlordApi";

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

function LandlordTenanciesPage() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    fetchLandlordTenancies()
      .then((data) => setList(Array.isArray(data) ? data : []))
      .catch((e) => setError(e.message || "Mietverhältnisse konnten nicht geladen werden."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p style={{ color: "#64748B" }}>Lade …</p>;
  if (error) return <p style={{ color: "#B91C1C" }}>{error}</p>;

  const rent = (t) => t.monthly_revenue_equivalent;
  const tenantDisplay = (t) => (t.tenant_name && t.tenant_name.trim()) ? t.tenant_name : (t.tenant_email || "—");
  const unitDisplay = (t) => (t.unit_title || t.unit_name || t.unit_id || "—");
  const propertyDisplay = (t) => (t.property_title || t.property_id || "—");

  return (
    <div>
      <h2 style={{ fontSize: "24px", fontWeight: 800, margin: "0 0 16px 0", color: "#0F172A" }}>
        Mietverhältnisse
      </h2>
      {list.length === 0 ? (
        <p style={{ color: "#64748B" }}>Keine Mietverhältnisse vorhanden.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #E5E7EB", textAlign: "left" }}>
                <th style={{ padding: "12px 8px", color: "#64748B" }}>Mieter</th>
                <th style={{ padding: "12px 8px", color: "#64748B" }}>Objekt</th>
                <th style={{ padding: "12px 8px", color: "#64748B" }}>Einheit</th>
                <th style={{ padding: "12px 8px", color: "#64748B" }}>Einzug</th>
                <th style={{ padding: "12px 8px", color: "#64748B" }}>Auszug</th>
                <th style={{ padding: "12px 8px", color: "#64748B" }}>Miete</th>
                <th style={{ padding: "12px 8px", color: "#64748B" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {list.map((t) => (
                <tr key={t.id} style={{ borderBottom: "1px solid #F1F5F9" }}>
                  <td style={{ padding: "12px 8px" }}>{tenantDisplay(t)}</td>
                  <td style={{ padding: "12px 8px" }}>{propertyDisplay(t)}</td>
                  <td style={{ padding: "12px 8px" }}>{unitDisplay(t)}</td>
                  <td style={{ padding: "12px 8px" }}>{formatDate(t.move_in_date)}</td>
                  <td style={{ padding: "12px 8px" }}>{formatDate(t.move_out_date)}</td>
                  <td style={{ padding: "12px 8px" }}>{formatCurrency(rent(t))}</td>
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

export default LandlordTenanciesPage;
