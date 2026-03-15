import React, { useEffect, useState } from "react";
import { fetchTenantMe, fetchTenantTenancies, fetchTenantInvoices } from "../../api/tenantApi";

function TenantOverviewPage() {
  const [profile, setProfile] = useState(null);
  const [tenanciesCount, setTenanciesCount] = useState(0);
  const [invoicesCount, setInvoicesCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    Promise.all([fetchTenantMe(), fetchTenantTenancies(), fetchTenantInvoices()])
      .then(([me, tenancies, invoices]) => {
        setProfile(me);
        setTenanciesCount(Array.isArray(tenancies) ? tenancies.length : 0);
        setInvoicesCount(Array.isArray(invoices) ? invoices.length : 0);
      })
      .catch((e) => setError(e.message || "Daten konnten nicht geladen werden."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p style={{ color: "#64748B" }}>Lade …</p>;
  if (error) return <p style={{ color: "#B91C1C" }}>{error}</p>;
  if (!profile) return null;

  return (
    <div>
      <h2 style={{ fontSize: "24px", fontWeight: 800, margin: "0 0 16px 0", color: "#0F172A" }}>
        Mein Bereich
      </h2>
      <div
        style={{
          background: "#F8FAFC",
          border: "1px solid #E2E8F0",
          borderRadius: "12px",
          padding: "20px",
          marginBottom: "24px",
        }}
      >
        <h3 style={{ fontSize: "16px", fontWeight: 700, margin: "0 0 12px 0", color: "#475569" }}>
          Profil
        </h3>
        <p style={{ margin: "4px 0", color: "#0F172A" }}><strong>Name:</strong> {profile.full_name || "—"}</p>
        <p style={{ margin: "4px 0", color: "#0F172A" }}><strong>E-Mail:</strong> {profile.email || "—"}</p>
        <p style={{ margin: "4px 0", color: "#0F172A" }}><strong>Telefon:</strong> {profile.phone || "—"}</p>
      </div>
      <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
        <div
          style={{
            padding: "16px 20px",
            background: "#FFF",
            border: "1px solid #E5E7EB",
            borderRadius: "12px",
            minWidth: "140px",
          }}
        >
          <p style={{ margin: 0, fontSize: "14px", color: "#64748B" }}>Mietverhältnisse</p>
          <p style={{ margin: "4px 0 0 0", fontSize: "24px", fontWeight: 800, color: "#0F172A" }}>{tenanciesCount}</p>
        </div>
        <div
          style={{
            padding: "16px 20px",
            background: "#FFF",
            border: "1px solid #E5E7EB",
            borderRadius: "12px",
            minWidth: "140px",
          }}
        >
          <p style={{ margin: 0, fontSize: "14px", color: "#64748B" }}>Rechnungen</p>
          <p style={{ margin: "4px 0 0 0", fontSize: "24px", fontWeight: 800, color: "#0F172A" }}>{invoicesCount}</p>
        </div>
      </div>
    </div>
  );
}

export default TenantOverviewPage;
