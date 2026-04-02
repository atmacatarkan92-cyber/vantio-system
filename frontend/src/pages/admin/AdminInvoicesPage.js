import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { API_BASE_URL, getApiHeaders } from "../../config";
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

function isOpenStatus(status) {
  const n = normalizeStatus(status);
  return n === "open" || n === "unpaid";
}

function SummaryCard({ title, count, amount, accentColor }) {
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
        {count}
      </div>
      <div className="mt-2 text-[11px] text-[#64748b] dark:text-[#6b7a9a]">
        {formatCurrency(amount)}
      </div>
    </div>
  );
}

function AdminInvoicesPage() {
  const location = useLocation();

  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [markingPaidId, setMarkingPaidId] = useState(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("due_date_desc");

  const now = new Date();
  const [generateYear, setGenerateYear] = useState(now.getFullYear());
  const [generateMonth, setGenerateMonth] = useState(now.getMonth() + 1);
  const [generating, setGenerating] = useState(false);
  const [generateMessage, setGenerateMessage] = useState(null);

  const loadInvoices = () => {
    setError("");
    return fetchAdminInvoices()
      .then(setInvoices)
      .catch((err) => {
        console.error(err);
        setError(err?.message ?? "Rechnungen konnten nicht geladen werden.");
      });
  };

  const handleGenerateInvoices = async () => {
    setGenerateMessage(null);
    setGenerating(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/invoices/generate`, {
        method: "POST",
        headers: { ...getApiHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ year: generateYear, month: generateMonth }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.detail || "Generierung fehlgeschlagen.");
      }
      const created = data.created_count ?? 0;
      const skipped = data.skipped_count ?? 0;
      setGenerateMessage(
        `${created} Rechnung(en) erstellt, ${skipped} übersprungen (bereits vorhanden).`
      );
      await loadInvoices();
    } catch (err) {
      setGenerateMessage(err.message || "Fehler beim Generieren.");
    } finally {
      setGenerating(false);
    }
  };

  const markAsPaid = async (invoiceId) => {
    setMarkingPaidId(invoiceId);
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/admin/invoices/${invoiceId}/mark-paid`,
        {
          method: "PATCH",
          headers: { ...getApiHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }
      );
      if (!res.ok) throw new Error("Konnte nicht als bezahlt markiert werden.");
      const updated = await res.json();
      setInvoices((prev) =>
        prev.map((inv) => (String(inv.id) === String(invoiceId) ? updated : inv))
      );
    } catch (err) {
      console.error(err);
      alert(err.message || "Fehler beim Markieren.");
    } finally {
      setMarkingPaidId(null);
    }
  };

  useEffect(() => {
    if (location.pathname.endsWith("/open")) {
      setStatusFilter("open");
      return;
    }

    if (location.pathname.endsWith("/paid")) {
      setStatusFilter("paid");
      return;
    }

    if (location.pathname.endsWith("/overdue")) {
      setStatusFilter("overdue");
      return;
    }

    setStatusFilter("all");
  }, [location.pathname]);

  useEffect(() => {
    loadInvoices().finally(() => setLoading(false));
  }, []);

  const summary = useMemo(() => {
    const openInvoices = invoices.filter((inv) => isOpenStatus(inv.status));
    const paidInvoices = invoices.filter(
      (inv) => normalizeStatus(inv.status) === "paid"
    );
    const overdueInvoices = invoices.filter(
      (inv) => normalizeStatus(inv.status) === "overdue"
    );
    const cancelledInvoices = invoices.filter(
      (inv) => normalizeStatus(inv.status) === "cancelled"
    );

    const openAmount = openInvoices.reduce(
      (sum, inv) => sum + Number(inv.amount || 0),
      0
    );
    const paidAmount = paidInvoices.reduce(
      (sum, inv) => sum + Number(inv.amount || 0),
      0
    );
    const overdueAmount = overdueInvoices.reduce(
      (sum, inv) => sum + Number(inv.amount || 0),
      0
    );
    const cancelledAmount = cancelledInvoices.reduce(
      (sum, inv) => sum + Number(inv.amount || 0),
      0
    );
    const totalAmount = invoices.reduce(
      (sum, inv) => sum + Number(inv.amount || 0),
      0
    );

    return {
      totalCount: invoices.length,
      totalAmount,
      openCount: openInvoices.length,
      openAmount,
      paidCount: paidInvoices.length,
      paidAmount,
      overdueCount: overdueInvoices.length,
      overdueAmount,
      cancelledCount: cancelledInvoices.length,
      cancelledAmount,
    };
  }, [invoices]);

  const filteredInvoices = useMemo(() => {
    let result = [...invoices];

    if (statusFilter !== "all") {
      result = result.filter((inv) => {
        const s = normalizeStatus(inv.status);
        if (statusFilter === "open") return isOpenStatus(inv.status);
        return s === statusFilter;
      });
    }

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();

      result = result.filter((inv) => {
        return (
          String(inv.id || "").toLowerCase().includes(term) ||
          String(inv.invoice_number || "").toLowerCase().includes(term) ||
          String(inv.status || "").toLowerCase().includes(term) ||
          String(inv.currency || "").toLowerCase().includes(term)
        );
      });
    }

    result.sort((a, b) => {
      if (sortBy === "amount_desc") {
        return Number(b.amount || 0) - Number(a.amount || 0);
      }

      if (sortBy === "amount_asc") {
        return Number(a.amount || 0) - Number(b.amount || 0);
      }

      if (sortBy === "invoice_number_asc") {
        return String(a.invoice_number || "").localeCompare(
          String(b.invoice_number || "")
        );
      }

      if (sortBy === "invoice_number_desc") {
        return String(b.invoice_number || "").localeCompare(
          String(a.invoice_number || "")
        );
      }

      if (sortBy === "issue_date_asc") {
        return new Date(a.issue_date || 0) - new Date(b.issue_date || 0);
      }

      if (sortBy === "issue_date_desc") {
        return new Date(b.issue_date || 0) - new Date(a.issue_date || 0);
      }

      if (sortBy === "due_date_asc") {
        return new Date(a.due_date || 0) - new Date(b.due_date || 0);
      }

      return new Date(b.due_date || 0) - new Date(a.due_date || 0);
    });

    return result;
  }, [invoices, searchTerm, statusFilter, sortBy]);

  const pageTitle = useMemo(() => {
    if (statusFilter === "open") return "Offene Rechnungen";
    if (statusFilter === "paid") return "Bezahlte Rechnungen";
    if (statusFilter === "overdue") return "Überfällige Rechnungen";
    return "Rechnungen";
  }, [statusFilter]);

  const inputSelectClassName =
    "h-[44px] rounded-lg border border-black/10 dark:border-white/[0.08] bg-slate-100 dark:bg-[#111520] px-3 text-[14px] text-[#0f172a] dark:text-[#eef2ff]";

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
          {pageTitle}
        </h2>

        <p className="mt-[10px] text-[12px] text-[#64748b] dark:text-[#6b7a9a]">
          Übersicht über offene, bezahlte, überfällige und stornierte Rechnungen.
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
          title="Total Rechnungen"
          count={summary.totalCount}
          amount={summary.totalAmount}
          accentColor="#7aaeff"
        />

        <SummaryCard
          title="Offen"
          count={summary.openCount}
          amount={summary.openAmount}
          accentColor="#fb923c"
        />

        <SummaryCard
          title="Bezahlt"
          count={summary.paidCount}
          amount={summary.paidAmount}
          accentColor="#4ade80"
        />

        <SummaryCard
          title="Überfällig"
          count={summary.overdueCount}
          amount={summary.overdueAmount}
          accentColor="#f87171"
        />
      </div>

      <div
        className="rounded-[14px] border border-black/10 bg-white p-5 dark:border-white/[0.07] dark:bg-[#141824]"
      >
        <h3
          className="mb-4 mt-0 text-[9px] font-bold uppercase tracking-[1px] text-[#64748b] dark:text-[#6b7a9a]"
        >
          Rechnungen aus Tenancies generieren
        </h3>
        <p className="mb-4 text-[12px] text-[#64748b] dark:text-[#6b7a9a]">
          Erzeugt für den gewählten Monat je eine Rechnung pro aktiver Tenancy (Miete anteilig bei Ein-/Auszug).
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "center" }}>
          <label className="text-[10px] font-semibold text-[#64748b] dark:text-[#6b7a9a]">
            Jahr
          </label>
          <select
            value={generateYear}
            onChange={(e) => setGenerateYear(Number(e.target.value))}
            className={inputSelectClassName}
          >
            {[now.getFullYear(), now.getFullYear() - 1, now.getFullYear() + 1].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <label className="ml-2 text-[10px] font-semibold text-[#64748b] dark:text-[#6b7a9a]">
            Monat
          </label>
          <select
            value={generateMonth}
            onChange={(e) => setGenerateMonth(Number(e.target.value))}
            className={`${inputSelectClassName} min-w-[120px]`}
          >
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
              <option key={m} value={m}>
                {new Date(2000, m - 1, 1).toLocaleDateString("de-CH", { month: "long" })}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleGenerateInvoices}
            disabled={generating}
            className="bg-gradient-to-r from-[#5b8cff] to-[#7c5cfc] text-white font-semibold rounded-[8px] border-none"
            style={{
              padding: "10px 16px",
              fontSize: "14px",
              cursor: generating ? "wait" : "pointer",
              opacity: generating ? 0.7 : 1,
            }}
          >
            {generating ? "Wird generiert…" : "Rechnungen generieren"}
          </button>
        </div>
        {generateMessage && (
          <p
            style={{
              marginTop: "12px",
              fontSize: "14px",
              padding: "10px 12px",
              borderRadius: "10px",
              fontWeight: 500,
              ...(generateMessage.startsWith("Fehler")
                ? {
                    background: "rgba(248, 113, 113, 0.08)",
                    border: "1px solid rgba(248, 113, 113, 0.2)",
                    color: "#f87171",
                  }
                : {
                    background: "rgba(59, 130, 246, 0.06)",
                    border: "1px solid rgba(59, 130, 246, 0.12)",
                    color: "#7aaeff",
                  }),
            }}
          >
            {generateMessage}
          </p>
        )}
      </div>

      <div
        className="rounded-[14px] border border-black/10 bg-white p-5 dark:border-white/[0.07] dark:bg-[#141824]"
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "2fr 1fr 1fr",
            gap: "16px",
          }}
        >
          <div>
            <label
              className="mb-2 block text-[10px] font-semibold text-[#64748b] dark:text-[#6b7a9a]"
            >
              Suche
            </label>

            <input
              type="text"
              placeholder="Nach Rechnungsnummer, Status oder ID suchen"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-[44px] w-full box-border rounded-lg border border-black/10 dark:border-white/[0.08] bg-slate-100 dark:bg-[#111520] px-[14px] text-[14px] text-[#0f172a] dark:text-[#eef2ff]"
            />
          </div>

          <div>
            <label
              className="mb-2 block text-[10px] font-semibold text-[#64748b] dark:text-[#6b7a9a]"
            >
              Status
            </label>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={`${inputSelectClassName} w-full px-[14px]`}
            >
              <option value="all">Alle Status</option>
              <option value="open">Offen</option>
              <option value="paid">Bezahlt</option>
              <option value="overdue">Überfällig</option>
              <option value="cancelled">Storniert</option>
            </select>
          </div>

          <div>
            <label
              className="mb-2 block text-[10px] font-semibold text-[#64748b] dark:text-[#6b7a9a]"
            >
              Sortierung
            </label>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className={`${inputSelectClassName} w-full px-[14px]`}
            >
              <option value="due_date_desc">Fälligkeitsdatum absteigend</option>
              <option value="due_date_asc">Fälligkeitsdatum aufsteigend</option>
              <option value="issue_date_desc">Rechnungsdatum absteigend</option>
              <option value="issue_date_asc">Rechnungsdatum aufsteigend</option>
              <option value="amount_desc">Betrag absteigend</option>
              <option value="amount_asc">Betrag aufsteigend</option>
              <option value="invoice_number_asc">Rechnungsnummer A–Z</option>
              <option value="invoice_number_desc">Rechnungsnummer Z–A</option>
            </select>
          </div>
        </div>
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
            Rechnungsliste
          </h3>

          <div className="text-[12px] text-[#64748b] dark:text-[#6b7a9a]">
            {filteredInvoices.length} Einträge
          </div>
        </div>

        {loading && <p className="text-[#64748b] dark:text-[#6b7a9a]">Rechnungen werden geladen...</p>}

        {!loading && error && <p style={{ color: "#f87171" }}>{error}</p>}

        {!loading && !error && filteredInvoices.length === 0 && (
          <p className="text-[#64748b] dark:text-[#6b7a9a]">Keine Rechnungen gefunden.</p>
        )}

        {!loading && !error && filteredInvoices.length > 0 && (
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
                <th style={{ padding: "12px" }}>ID</th>
                <th style={{ padding: "12px" }}>Rechnungsnummer</th>
                <th style={{ padding: "12px" }}>Betrag</th>
                <th style={{ padding: "12px" }}>Währung</th>
                <th style={{ padding: "12px" }}>Status</th>
                <th style={{ padding: "12px" }}>Rechnungsdatum</th>
                <th style={{ padding: "12px" }}>Fälligkeitsdatum</th>
                <th style={{ padding: "12px" }}>Bezahlt am</th>
                <th style={{ padding: "12px" }}>Aktion</th>
              </tr>
            </thead>

            <tbody>
              {filteredInvoices.map((invoice) => {
                const statusMeta = getStatusMeta(invoice.status);
                const isPaid = normalizeStatus(invoice.status) === "paid";
                const marking = markingPaidId === invoice.id;

                return (
                  <tr
                    key={invoice.id}
                    className="border-b border-black/10 dark:border-white/[0.05]"
                  >
                    <td
                      className="p-3 text-[13px] font-semibold text-[#0f172a] dark:text-[#eef2ff]"
                    >
                      {invoice.id}
                    </td>

                    <td
                      className="p-3 text-[13px] font-semibold text-[#0f172a] dark:text-[#eef2ff]"
                    >
                      <Link
                        to={`/admin/invoices/${invoice.id}`}
                        style={{
                          color: "#7aaeff",
                          textDecoration: "none",
                          fontWeight: 700,
                        }}
                      >
                        {invoice.invoice_number}
                      </Link>
                    </td>

                    <td
                      className="p-3 text-[13px] font-medium text-[#0f172a] dark:text-[#eef2ff]"
                    >
                      {formatCurrency(invoice.amount, invoice.currency)}
                    </td>

                    <td className="p-3 text-[13px] text-[#0f172a] dark:text-[#eef2ff]">
                      {invoice.currency}
                    </td>

                    <td style={{ padding: "12px" }}>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          padding: "6px 10px",
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
                    </td>

                    <td className="p-3 text-[13px] text-[#0f172a] dark:text-[#eef2ff]">
                      {formatDate(invoice.issue_date)}
                    </td>

                    <td className="p-3 text-[13px] text-[#0f172a] dark:text-[#eef2ff]">
                      {formatDate(invoice.due_date)}
                    </td>

                    <td className="p-3 text-[13px] text-[#0f172a] dark:text-[#eef2ff]">
                      {invoice.paid_at
                        ? formatDate(invoice.paid_at)
                        : "–"}
                    </td>

                    <td style={{ padding: "12px" }}>
                      {!isPaid && (
                        <button
                          type="button"
                          onClick={() => markAsPaid(invoice.id)}
                          disabled={marking}
                          className="rounded-lg border border-black/10 bg-transparent px-3 py-2 text-[12px] font-semibold text-[#64748b] dark:border-white/[0.1] dark:text-[#8090b0]"
                          style={{
                            cursor: marking ? "wait" : "pointer",
                            opacity: marking ? 0.7 : 1,
                          }}
                        >
                          {marking ? "…" : "Als bezahlt markieren"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default AdminInvoicesPage;