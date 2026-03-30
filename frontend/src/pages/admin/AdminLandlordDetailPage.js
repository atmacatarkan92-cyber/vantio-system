import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { fetchAdminLandlord } from "../../api/adminData";

const labelStyle = { display: "block", marginBottom: "4px", fontSize: "12px", fontWeight: 600, color: "#64748B" };
const valueStyle = { fontSize: "15px", color: "#0F172A", marginBottom: "12px" };
const sectionStyle = {
  marginBottom: "24px",
  padding: "16px",
  border: "1px solid #E5E7EB",
  borderRadius: "10px",
  background: "#FAFAFA",
};

function formatDateTime(iso) {
  if (!iso) return "—";
  const normalized = /Z|[+-]\d{2}:\d{2}$/.test(iso) ? iso : `${iso}Z`;
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("de-CH", {
    timeZone: "Europe/Zurich",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function AdminLandlordDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [row, setRow] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError("");
    fetchAdminLandlord(id)
      .then((r) => {
        if (!r) {
          setError("Verwaltung nicht gefunden.");
          setRow(null);
        } else {
          setRow(r);
        }
      })
      .catch(() => setError("Verwaltung konnte nicht geladen werden."))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return <p style={{ padding: "0 8px" }}>Lade Verwaltung …</p>;
  }

  if (error || !row) {
    return (
      <div style={{ padding: "0 8px" }}>
        <p style={{ color: "#B91C1C", marginBottom: "12px" }}>{error || "Nicht gefunden."}</p>
        <button
          type="button"
          onClick={() => navigate("/admin/landlords")}
          style={{
            padding: "8px 14px",
            background: "#0F172A",
            color: "#FFF",
            border: "none",
            borderRadius: "8px",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          Zurück zur Liste
        </button>
      </div>
    );
  }

  const title = row.company_name?.trim() || row.contact_name?.trim() || "Verwaltung";
  const statusLabel = row.status === "inactive" ? "Inaktiv" : "Aktiv";

  return (
    <div style={{ padding: "0 8px", maxWidth: "720px" }}>
      <p style={{ marginBottom: "12px" }}>
        <Link to="/admin/landlords" style={{ color: "#0F172A", fontWeight: 600, textDecoration: "none" }}>
          ← Verwaltungen
        </Link>
      </p>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: "12px",
          marginBottom: "24px",
        }}
      >
        <h1 style={{ fontSize: "22px", fontWeight: 800, margin: 0, color: "#0F172A" }}>{title}</h1>
        <span
          style={{
            padding: "4px 10px",
            borderRadius: "999px",
            fontSize: "13px",
            fontWeight: 600,
            background: row.status === "inactive" ? "#F1F5F9" : "#DCFCE7",
            color: row.status === "inactive" ? "#475569" : "#166534",
          }}
        >
          {statusLabel}
        </span>
      </div>

      <div style={sectionStyle}>
        <h2 style={{ fontSize: "15px", fontWeight: 700, margin: "0 0 12px 0", color: "#0F172A" }}>Kontakt</h2>
        <div>
          <span style={labelStyle}>Kontaktperson</span>
          <div style={valueStyle}>{row.contact_name?.trim() || "—"}</div>
        </div>
        <div>
          <span style={labelStyle}>E-Mail</span>
          <div style={valueStyle}>{row.email?.trim() || "—"}</div>
        </div>
        <div>
          <span style={labelStyle}>Telefon</span>
          <div style={valueStyle}>{row.phone?.trim() || "—"}</div>
        </div>
      </div>

      <div style={sectionStyle}>
        <h2 style={{ fontSize: "15px", fontWeight: 700, margin: "0 0 12px 0", color: "#0F172A" }}>Adresse</h2>
        <div>
          <span style={labelStyle}>Adresse</span>
          <div style={valueStyle}>{row.address_line1?.trim() || "—"}</div>
        </div>
        <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
          <div style={{ minWidth: "100px" }}>
            <span style={labelStyle}>PLZ</span>
            <div style={valueStyle}>{row.postal_code?.trim() || "—"}</div>
          </div>
          <div style={{ flex: 1, minWidth: "120px" }}>
            <span style={labelStyle}>Ort</span>
            <div style={valueStyle}>{row.city?.trim() || "—"}</div>
          </div>
          <div style={{ minWidth: "80px" }}>
            <span style={labelStyle}>Kanton</span>
            <div style={valueStyle}>{row.canton?.trim() || "—"}</div>
          </div>
        </div>
      </div>

      <div style={sectionStyle}>
        <h2 style={{ fontSize: "15px", fontWeight: 700, margin: "0 0 12px 0", color: "#0F172A" }}>Weitere Angaben</h2>
        <div>
          <span style={labelStyle}>Website</span>
          <div style={valueStyle}>
            {row.website?.trim() ? (
              <a href={/^https?:\/\//i.test(row.website.trim()) ? row.website.trim() : `https://${row.website.trim()}`} target="_blank" rel="noopener noreferrer" style={{ color: "#2563EB" }}>
                {row.website.trim()}
              </a>
            ) : (
              "—"
            )}
          </div>
        </div>
        <div>
          <span style={labelStyle}>Notizen</span>
          <div style={{ ...valueStyle, whiteSpace: "pre-wrap" }}>{row.notes?.trim() || "—"}</div>
        </div>
        <div>
          <span style={labelStyle}>Erstellt</span>
          <div style={valueStyle}>{formatDateTime(row.created_at)}</div>
        </div>
        <div>
          <span style={labelStyle}>Zuletzt aktualisiert</span>
          <div style={valueStyle}>{formatDateTime(row.updated_at)}</div>
        </div>
      </div>
    </div>
  );
}

export default AdminLandlordDetailPage;
