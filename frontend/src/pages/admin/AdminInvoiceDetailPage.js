import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { API_BASE_URL, getApiHeaders } from "../../config";

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

function normalizeStatus(status) {
  return String(status || "").toLowerCase().trim();
}

function getStatusMeta(status) {
  const normalized = normalizeStatus(status);

  if (normalized === "paid") {
    return {
      label: "Bezahlt",
      bg: "rgba(34, 197, 94, 0.1)",
      color: "#4ade80",
      border: "rgba(34, 197, 94, 0.2)",
    };
  }

  if (normalized === "overdue") {
    return {
      label: "Überfällig",
      bg: "rgba(248, 113, 113, 0.1)",
      color: "#f87171",
      border: "rgba(248, 113, 113, 0.2)",
    };
  }

  if (normalized === "cancelled") {
    return {
      label: "Storniert",
      bg: "rgba(255, 255, 255, 0.05)",
      color: "#6b7a9a",
      border: "rgba(255, 255, 255, 0.08)",
    };
  }

  return {
    label: "Offen",
    bg: "rgba(245, 158, 11, 0.1)",
    color: "#fbbf24",
    border: "rgba(245, 158, 11, 0.2)",
  };
}

function getStatusButtonStyle(status, currentStatus, updatingStatus) {
  const n = normalizeStatus(currentStatus);
  const isActive =
    n === status || (status === "open" && n === "unpaid");

  const baseStyle = {
    color: "#fff",
    border: "none",
    borderRadius: "8px",
    padding: "12px 16px",
    fontWeight: 700,
    cursor: updatingStatus ? "not-allowed" : "pointer",
    opacity: updatingStatus ? 0.7 : 1,
    transition: "all 0.2s ease",
  };

  if (status === "open") {
    return {
      ...baseStyle,
      background: isActive ? "#c2410c" : "#9a3412",
      boxShadow: isActive ? "0 0 0 3px rgba(251, 146, 60, 0.25)" : "none",
    };
  }

  if (status === "paid") {
    return {
      ...baseStyle,
      background: isActive ? "#15803d" : "#166534",
      boxShadow: isActive ? "0 0 0 3px rgba(74, 222, 128, 0.2)" : "none",
    };
  }

  if (status === "overdue") {
    return {
      ...baseStyle,
      background: isActive ? "#b91c1c" : "#991b1b",
      boxShadow: isActive ? "0 0 0 3px rgba(248, 113, 113, 0.25)" : "none",
    };
  }

  return {
    ...baseStyle,
    background: isActive ? "#475569" : "#334155",
    boxShadow: isActive ? "0 0 0 3px rgba(148, 163, 184, 0.2)" : "none",
  };
}

function InfoCard({ label, value, accent = "#7aaeff" }) {
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
        {label}
      </div>
      <div
        style={{
          fontSize: "24px",
          fontWeight: 700,
          color: "#eef2ff",
          lineHeight: 1.15,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function DetailRow({ label, value }) {
  return (
    <>
      <div style={{ color: "#6b7a9a", fontWeight: 600, fontSize: "10px" }}>{label}</div>
      <div style={{ color: "#eef2ff", fontWeight: 500, fontSize: "13px" }}>{value}</div>
    </>
  );
}

function AdminInvoiceDetailPage() {
  const { id } = useParams();

  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatingStatus, setUpdatingStatus] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/invoices`, { headers: getApiHeaders() })
      .then((res) => {
        if (!res.ok) {
          throw new Error("Fehler beim Laden der Rechnung");
        }
        return res.json();
      })
      .then((data) => {
        const foundInvoice = Array.isArray(data)
          ? data.find((item) => String(item.id) === String(id))
          : null;

        if (!foundInvoice) {
          setError("Rechnung nicht gefunden.");
        } else {
          setInvoice(foundInvoice);
        }

        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setError("Rechnung konnte nicht geladen werden.");
        setLoading(false);
      });
  }, [id]);

  const statusMeta = useMemo(() => {
    return getStatusMeta(invoice?.status);
  }, [invoice]);

  const updateStatus = async (newStatus) => {
    if (!invoice) return;

    try {
      setUpdatingStatus(true);

      if (newStatus === "paid") {
        const response = await fetch(
          `${API_BASE_URL}/api/admin/invoices/${invoice.id}/mark-paid`,
          {
            method: "PATCH",
            headers: { ...getApiHeaders(), "Content-Type": "application/json" },
            body: JSON.stringify({}),
          }
        );
        if (!response.ok) throw new Error("Konnte nicht als bezahlt markiert werden.");
        const updatedInvoice = await response.json();
        setInvoice(updatedInvoice);
        return;
      }

      if (newStatus === "open" || newStatus === "unpaid") {
        const response = await fetch(
          `${API_BASE_URL}/api/admin/invoices/${invoice.id}/mark-unpaid`,
          { method: "PATCH", headers: getApiHeaders() }
        );
        if (!response.ok) throw new Error("Konnte nicht als offen markiert werden.");
        const updatedInvoice = await response.json();
        setInvoice(updatedInvoice);
        return;
      }

      const response = await fetch(
        `${API_BASE_URL}/api/invoices/${invoice.id}/status?status=${newStatus}`,
        {
          method: "PUT",
          headers: getApiHeaders(),
        }
      );

      if (!response.ok) {
        throw new Error("Status konnte nicht aktualisiert werden.");
      }

      const updatedInvoice = await response.json();
      setInvoice(updatedInvoice);
    } catch (err) {
      console.error(err);
      alert(err.message || "Fehler beim Aktualisieren des Status.");
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleDownloadPdf = () => {
    if (!invoice) return;

    fetch(`${API_BASE_URL}/api/invoices/${invoice.id}/pdf`, {
      headers: getApiHeaders(),
    })
      .then((res) => {
        if (!res.ok) throw new Error("PDF nicht gefunden");
        return res.blob();
      })
      .then((blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = (invoice.invoice_number || "invoice") + ".pdf";
        a.click();
        window.URL.revokeObjectURL(url);
      })
      .catch((err) => {
        console.error(err);
        alert("PDF konnte nicht geladen werden.");
      });
  };

  if (loading) {
    return (
      <div className="bg-[#07090f] text-[#eef2ff] min-h-full" style={{ padding: "8px 0" }}>
        <p style={{ margin: 0, color: "#6b7a9a" }}>Rechnung wird geladen...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="bg-[#07090f] text-[#eef2ff] min-h-full"
        style={{ display: "grid", gap: "16px" }}
      >
        <p style={{ color: "#f87171", fontWeight: 600 }}>{error}</p>

        <Link
          to="/admin/invoices"
          style={{
            color: "#7aaeff",
            textDecoration: "none",
            fontWeight: 600,
          }}
        >
          ← Zurück zu Rechnungen
        </Link>
      </div>
    );
  }

  return (
    <div
      className="bg-[#07090f] text-[#eef2ff] min-h-full"
      style={{ display: "grid", gap: "24px" }}
    >
      <div>
        <Link
          to="/admin/invoices"
          style={{
            color: "#7aaeff",
            textDecoration: "none",
            fontSize: "14px",
            fontWeight: 600,
          }}
        >
          ← Zurück zu Rechnungen
        </Link>
      </div>

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
          {invoice.invoice_number}
        </h2>

        <p style={{ color: "#6b7a9a", marginTop: "10px", fontSize: "12px" }}>
          Detailansicht der Rechnung mit Statusverwaltung und PDF-Download.
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "16px",
        }}
      >
        <InfoCard
          label="Betrag"
          value={formatCurrency(invoice.amount, invoice.currency)}
          accent="#7aaeff"
        />

        <div
          style={{
            background: "#141824",
            border: "1px solid rgba(255, 255, 255, 0.07)",
            borderTop: `4px solid ${statusMeta.border}`,
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
            Status
          </div>

          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "8px 12px",
              borderRadius: "999px",
              background: statusMeta.bg,
              color: statusMeta.color,
              border: `1px solid ${statusMeta.border}`,
              fontSize: "10px",
              fontWeight: 700,
            }}
          >
            {statusMeta.label}
          </span>
        </div>

        <InfoCard
          label="Rechnungsdatum"
          value={formatDate(invoice.issue_date)}
          accent="#7aaeff"
        />

        <InfoCard
          label="Fälligkeitsdatum"
          value={formatDate(invoice.due_date)}
          accent="#7aaeff"
        />
      </div>

      <div
        style={{
          background: "#141824",
          border: "1px solid rgba(255, 255, 255, 0.07)",
          borderRadius: "14px",
          padding: "24px",
          display: "grid",
          gap: "18px",
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
          Rechnungsdetails
        </h3>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "220px 1fr",
            rowGap: "14px",
          }}
        >
          <DetailRow label="ID" value={invoice.id} />
          <DetailRow label="Rechnungsnummer" value={invoice.invoice_number} />
          <DetailRow
            label="Betrag"
            value={formatCurrency(invoice.amount, invoice.currency)}
          />
          <DetailRow label="Währung" value={invoice.currency} />
          <DetailRow label="Status" value={statusMeta.label} />
          <DetailRow label="Rechnungsdatum" value={formatDate(invoice.issue_date)} />
          <DetailRow label="Fälligkeitsdatum" value={formatDate(invoice.due_date)} />
          {invoice.paid_at && (
            <>
              <DetailRow label="Bezahlt am" value={formatDate(invoice.paid_at)} />
              {invoice.payment_method && (
                <DetailRow label="Zahlungsart" value={invoice.payment_method} />
              )}
              {invoice.payment_reference && (
                <DetailRow label="Zahlungsreferenz" value={invoice.payment_reference} />
              )}
            </>
          )}
        </div>
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
          }}
        >
          Aktionen
        </h3>

        <div
          style={{
            display: "flex",
            gap: "12px",
            flexWrap: "wrap",
            marginBottom: "20px",
          }}
        >
          <button
            onClick={handleDownloadPdf}
            className="bg-gradient-to-r from-[#5b8cff] to-[#7c5cfc] text-white font-semibold rounded-[8px] border-none"
            style={{
              padding: "12px 16px",
              cursor: "pointer",
            }}
          >
            PDF herunterladen
          </button>
        </div>

        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
          <button
            onClick={() => updateStatus("open")}
            disabled={updatingStatus}
            style={getStatusButtonStyle("open", invoice.status, updatingStatus)}
          >
            Als offen markieren
          </button>

          <button
            onClick={() => updateStatus("paid")}
            disabled={updatingStatus}
            style={getStatusButtonStyle("paid", invoice.status, updatingStatus)}
          >
            Als bezahlt markieren
          </button>

          <button
            onClick={() => updateStatus("overdue")}
            disabled={updatingStatus}
            style={getStatusButtonStyle("overdue", invoice.status, updatingStatus)}
          >
            Überfällig
          </button>

          <button
            onClick={() => updateStatus("cancelled")}
            disabled={updatingStatus}
            style={getStatusButtonStyle("cancelled", invoice.status, updatingStatus)}
          >
            Storniert
          </button>
        </div>
      </div>
    </div>
  );
}

export default AdminInvoiceDetailPage;