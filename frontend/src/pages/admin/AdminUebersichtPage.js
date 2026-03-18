import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import {
  fetchAdminUnits,
  fetchAdminRooms,
  normalizeUnit,
  normalizeRoom,
  fetchAdminProfit,
  fetchAdminOccupancy,
  fetchAdminDashboardKpis,
  fetchAdminInvoices,
  normalizeFetchError,
} from "../../api/adminData";

function roundCurrency(value) {
  return Math.round(Number(value || 0));
}

function formatCurrency(value) {
  return `CHF ${roundCurrency(value).toLocaleString("de-CH")}`;
}

function formatPercent(value) {
  return `${Number(value || 0).toFixed(1)}%`;
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

function loadSavedArray(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch (error) {
    console.error(`Fehler beim Laden von ${key}:`, error);
    return [];
  }
}

function KpiKarte({
  titel,
  wert,
  hinweis,
  farbe = "#0F172A",
  akzent = "#E2E8F0",
  badge = "Live",
}) {
  return (
    <div
      style={{
        background: "#FFFFFF",
        border: "1px solid #E5E7EB",
        borderRadius: "22px",
        padding: "22px",
        boxShadow: "0 8px 24px rgba(15, 23, 42, 0.04)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "4px",
          background: akzent,
        }}
      />
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "12px",
          marginBottom: "12px",
        }}
      >
        <div style={{ fontSize: "13px", color: "#64748B", fontWeight: 600 }}>
          {titel}
        </div>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "6px 10px",
            borderRadius: "999px",
            background: "#F8FAFC",
            border: "1px solid #E2E8F0",
            color: "#475569",
            fontSize: "11px",
            fontWeight: 700,
            whiteSpace: "nowrap",
          }}
        >
          {badge}
        </span>
      </div>
      <div
        style={{
          fontSize: "38px",
          fontWeight: 800,
          color: farbe,
          letterSpacing: "-0.03em",
          lineHeight: 1.05,
        }}
      >
        {wert}
      </div>
      {hinweis ? (
        <div
          style={{
            marginTop: "12px",
            color: "#64748B",
            fontSize: "14px",
            lineHeight: 1.5,
          }}
        >
          {hinweis}
        </div>
      ) : null}
    </div>
  );
}

function SchnellzugriffKarte({
  titel,
  text,
  linkText,
  to,
  icon = "→",
  iconBg = "#EFF6FF",
  iconColor = "#2563EB",
}) {
  return (
    <div
      style={{
        background: "#FFFFFF",
        border: "1px solid #E5E7EB",
        borderRadius: "22px",
        padding: "22px",
        boxShadow: "0 8px 24px rgba(15, 23, 42, 0.04)",
        display: "flex",
        flexDirection: "column",
        gap: "14px",
        minHeight: "210px",
      }}
    >
      <div
        style={{
          width: "48px",
          height: "48px",
          borderRadius: "16px",
          background: iconBg,
          color: iconColor,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "22px",
          fontWeight: 800,
        }}
      >
        {icon}
      </div>
      <div>
        <h3
          style={{
            fontSize: "21px",
            fontWeight: 800,
            margin: "0 0 8px 0",
            color: "#0F172A",
            letterSpacing: "-0.02em",
          }}
        >
          {titel}
        </h3>
        <p
          style={{
            color: "#64748B",
            margin: 0,
            lineHeight: 1.6,
            fontSize: "14px",
          }}
        >
          {text}
        </p>
      </div>
      <div style={{ marginTop: "auto" }}>
        <Link
          to={to}
          style={{
            display: "inline-block",
            background: "#0F172A",
            color: "#FFFFFF",
            padding: "11px 16px",
            borderRadius: "12px",
            textDecoration: "none",
            fontWeight: 700,
            fontSize: "14px",
          }}
        >
          {linkText}
        </Link>
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const normalized = (status || "").toLowerCase();
  let bg = "#FEF3C7";
  let color = "#92400E";
  let label = "Offen";
  let border = "#FCD34D";
  if (normalized === "paid") {
    bg = "#DCFCE7";
    color = "#166534";
    label = "Bezahlt";
    border = "#86EFAC";
  }
  if (normalized === "overdue") {
    bg = "#FEE2E2";
    color = "#991B1B";
    label = "Überfällig";
    border = "#FCA5A5";
  }
  if (normalized === "cancelled") {
    bg = "#E5E7EB";
    color = "#374151";
    label = "Storniert";
    border = "#CBD5E1";
  }
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "6px 10px",
        borderRadius: "999px",
        background: bg,
        color,
        fontSize: "12px",
        fontWeight: 700,
        border: `1px solid ${border}`,
      }}
    >
      {label}
    </span>
  );
}

export default function AdminUebersichtPage() {
  const [invoices, setInvoices] = useState([]);
  const [invoiceLoading, setInvoiceLoading] = useState(true);
  const [invoiceError, setInvoiceError] = useState("");
  const [units, setUnits] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [profitApi, setProfitApi] = useState({ summary: null, units: [], year: null, month: null });
  const [occupancyApi, setOccupancyApi] = useState(null);
  const [kpis, setKpis] = useState(null);
  const [kpisLoading, setKpisLoading] = useState(true);
  const [kpisError, setKpisError] = useState("");
  const [operationsLoadError, setOperationsLoadError] = useState("");
  const [kpisPeriod, setKpisPeriod] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
  });

  useEffect(() => {
    setOperationsLoadError("");
    const now = new Date();
    Promise.all([
      fetchAdminUnits(),
      fetchAdminRooms(),
      fetchAdminOccupancy(),
      fetchAdminProfit({ year: now.getFullYear(), month: now.getMonth() + 1 }),
    ])
      .then(([unitsData, roomsData, occupancyData, profitData]) => {
        setUnits(unitsData.map(normalizeUnit));
        setRooms(Array.isArray(roomsData) ? roomsData.map(normalizeRoom) : []);
        setOccupancyApi(occupancyData);
        setProfitApi({
          summary: profitData.summary ?? null,
          units: profitData.units ?? [],
          year: profitData.year,
          month: profitData.month,
        });
      })
      .catch((e) => {
        setOperationsLoadError(
          normalizeFetchError(e, "Betriebsdaten konnten nicht geladen werden.").message
        );
      });
  }, []);

  useEffect(() => {
    setKpisLoading(true);
    setKpisError("");
    fetchAdminDashboardKpis({ year: kpisPeriod.year, month: kpisPeriod.month })
      .then((data) => {
        setKpis(data);
        setKpisLoading(false);
      })
      .catch((e) => {
        setKpisError(e.message || "KPI-Daten konnten nicht geladen werden.");
        setKpis(null);
        setKpisLoading(false);
      });
  }, [kpisPeriod.year, kpisPeriod.month]);

  useEffect(() => {
    setInvoiceError("");
    fetchAdminInvoices()
      .then(setInvoices)
      .catch((e) => {
        console.error(e);
        setInvoiceError(e?.message ?? "Rechnungen konnten nicht geladen werden.");
      })
      .finally(() => setInvoiceLoading(false));
  }, []);

  const operationsStats = useMemo(() => {
    const summary = occupancyApi?.summary;
    const totalRooms = summary?.total_rooms ?? 0;
    const occupiedRooms = summary?.occupied_rooms ?? 0;
    const reservedRooms = summary?.reserved_rooms ?? 0;
    const freeRooms = summary?.free_rooms ?? 0;
    const occupancyRate = Number(summary?.occupancy_rate) ?? 0;

    const rev = profitApi?.summary?.total_revenue ?? 0;
    const cost = profitApi?.summary?.total_costs ?? 0;
    const profit = profitApi?.summary?.total_profit ?? 0;

    const coLivingUnits = units.filter((u) => String(u.type || "").toLowerCase() === "co-living");
    const profitByUnit = new Map((profitApi?.units || []).map((u) => [String(u.unit_id), u]));
    const occupancyByUnit = new Map((occupancyApi?.units || []).map((u) => [String(u.unit_id), u]));

    const rankedUnits = coLivingUnits
      .map((unit) => {
        const uid = String(unit.id || unit.unitId || "");
        const p = profitByUnit.get(uid);
        const occ = occupancyByUnit.get(uid);
        const unitProfit = p ? Number(p.profit) : 0;
        const unitFree = occ ? Number(occ.free_rooms) : 0;
        return {
          unitId: unit.unitId ?? unit.id,
          place: unit.place ?? unit.city ?? "",
          profit: unitProfit,
          freeCount: unitFree,
        };
      })
      .sort((a, b) => a.profit - b.profit);

    const criticalUnits = rankedUnits.filter(
      (u) => u.profit < 0 || u.freeCount > 0
    ).length;

    return {
      unitsCount: coLivingUnits.length,
      totalRooms,
      occupiedRooms,
      reservedRooms,
      freeRooms,
      currentRevenue: rev,
      runningCosts: cost,
      currentProfit: profit,
      occupancyRate,
      criticalUnits,
      weakestUnit: rankedUnits.length > 0 ? rankedUnits[0] : null,
    };
  }, [units, occupancyApi, profitApi]);

  const invoiceStats = useMemo(() => {
    const safeInvoices = Array.isArray(invoices) ? invoices : [];
    const openStatus = (s) => String(s || "").toLowerCase();
    const openInvoices = safeInvoices.filter((inv) =>
      ["open", "unpaid"].includes(openStatus(inv.status))
    );
    const paidInvoices = safeInvoices.filter((inv) => openStatus(inv.status) === "paid");
    const overdueInvoices = safeInvoices.filter((inv) => openStatus(inv.status) === "overdue");
    const cancelledInvoices = safeInvoices.filter((inv) => openStatus(inv.status) === "cancelled");
    return {
      totalCount: safeInvoices.length,
      totalAmount: safeInvoices.reduce((sum, inv) => sum + Number(inv.amount || 0), 0),
      openCount: openInvoices.length,
      openAmount: openInvoices.reduce((sum, inv) => sum + Number(inv.amount || 0), 0),
      paidCount: paidInvoices.length,
      paidAmount: paidInvoices.reduce((sum, inv) => sum + Number(inv.amount || 0), 0),
      overdueCount: overdueInvoices.length,
      overdueAmount: overdueInvoices.reduce((sum, inv) => sum + Number(inv.amount || 0), 0),
      cancelledCount: cancelledInvoices.length,
      cancelledAmount: cancelledInvoices.reduce((sum, inv) => sum + Number(inv.amount || 0), 0),
    };
  }, [invoices]);

  const latestInvoices = useMemo(() => [...invoices].slice(0, 5), [invoices]);

  const systemWarnings = useMemo(() => {
    const warnings = [];
    if (operationsStats.freeRooms > 0) {
      warnings.push({
        level: "warning",
        title: "Freie Rooms vorhanden",
        text: `${operationsStats.freeRooms} Rooms sind aktuell frei und verursachen Leerstand.`,
      });
    }
    if (invoiceStats.openCount > 0) {
      warnings.push({
        level: "warning",
        title: "Offene Rechnungen",
        text: `${invoiceStats.openCount} Rechnungen sind aktuell noch offen.`,
      });
    }
    if (invoiceStats.overdueCount > 0) {
      warnings.push({
        level: "danger",
        title: "Überfällige Rechnungen",
        text: `${invoiceStats.overdueCount} Rechnungen sind bereits überfällig.`,
      });
    }
    if (operationsStats.weakestUnit && operationsStats.weakestUnit.profit < 0) {
      warnings.push({
        level: "danger",
        title: "Schwächste Unit",
        text: `${operationsStats.weakestUnit.unitId} macht aktuell Verlust.`,
      });
    }
    if (warnings.length === 0) {
      warnings.push({
        level: "success",
        title: "Keine kritischen Warnungen",
        text: "Aktuell wurden keine dringenden Probleme erkannt.",
      });
    }
    return warnings.slice(0, 4);
  }, [operationsStats, invoiceStats]);

  const financeChartData = [
    { month: "Jan", revenue: 0, costs: 0, profit: 0 },
    { month: "Feb", revenue: 0, costs: 0, profit: 0 },
    { month: "Mär", revenue: 0, costs: 0, profit: 0 },
    { month: "Apr", revenue: 3200, costs: 1800, profit: 1400 },
    { month: "Mai", revenue: 6400, costs: 3900, profit: 2500 },
    { month: "Jun", revenue: 10850, costs: 7799, profit: 3051 },
  ];
  const belegungChartData = [
    { month: "Jan", occupied: 0, free: 21 },
    { month: "Feb", occupied: 4, free: 17 },
    { month: "Mär", occupied: 8, free: 13 },
    { month: "Apr", occupied: 10, free: 11 },
    { month: "Mai", occupied: 11, free: 10 },
    { month: "Jun", occupied: 12, free: 9 },
  ];

  return (
    <div style={{ display: "grid", gap: "24px" }}>
      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "12px" }}>
        <span style={{ fontSize: "14px", color: "#64748B" }}>KPI-Zeitraum:</span>
        <select
          value={`${kpisPeriod.year}-${kpisPeriod.month}`}
          onChange={(e) => {
            const [y, m] = e.target.value.split("-").map(Number);
            setKpisPeriod({ year: y, month: m });
          }}
          style={{
            padding: "8px 12px",
            borderRadius: "8px",
            border: "1px solid #d1d5db",
            background: "#ffffff",
            fontSize: "14px",
          }}
        >
          {(() => {
            const d = new Date();
            const options = [];
            for (let i = 0; i < 12; i++) {
              const date = new Date(d.getFullYear(), d.getMonth() - i, 1);
              const y = date.getFullYear();
              const m = date.getMonth() + 1;
              options.push(
                <option key={`${y}-${m}`} value={`${y}-${m}`}>
                  {m}/{y}
                </option>
              );
            }
            return options;
          })()}
        </select>
      </div>
      <div
        style={{
          background: "linear-gradient(135deg, #FFF7ED 0%, #FFFFFF 60%)",
          border: "1px solid #FED7AA",
          borderRadius: "24px",
          padding: "26px",
          boxShadow: "0 10px 30px rgba(15, 23, 42, 0.04)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: "16px",
            flexWrap: "wrap",
          }}
        >
          <div>
            <div
              style={{
                fontSize: "12px",
                color: "#f97316",
                fontWeight: 700,
                marginBottom: "8px",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              FeelAtHomeNow Admin
            </div>
            <h2
              style={{
                fontSize: "44px",
                fontWeight: 900,
                margin: 0,
                letterSpacing: "-0.04em",
                color: "#0F172A",
              }}
            >
              Unternehmensübersicht
            </h2>
            <p
              style={{
                color: "#64748B",
                marginTop: "12px",
                maxWidth: "950px",
                lineHeight: 1.6,
                fontSize: "15px",
              }}
            >
              Zentrale Live-Übersicht über Umsatz, Ausgaben, Gewinn, Belegung,
              Rechnungen und kritische Bereiche des Unternehmens.
            </p>
          </div>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "8px 12px",
                borderRadius: "999px",
                background: "#FFFFFF",
                border: "1px solid #E5E7EB",
                color: "#475569",
                fontSize: "12px",
                fontWeight: 700,
              }}
            >
              Live KPI
            </span>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "8px 12px",
                borderRadius: "999px",
                background: "#FFFFFF",
                border: "1px solid #E5E7EB",
                color: "#475569",
                fontSize: "12px",
                fontWeight: 700,
              }}
            >
              Management Ansicht
            </span>
          </div>
        </div>
      </div>

      {kpisLoading && (
        <p style={{ color: "#64748B", padding: "16px 0" }}>Lade KPI-Daten…</p>
      )}
      {kpisError && (
        <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: "12px", padding: "16px", color: "#B91C1C" }}>
          {kpisError}
        </div>
      )}
      {kpis && !kpisLoading && (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "16px",
            }}
          >
            <KpiKarte
              titel="Durchschn. Umsatz pro Room"
              wert={kpis.summary_cards.average_revenue_per_room?.value != null ? formatCurrency(kpis.summary_cards.average_revenue_per_room.value) : "—"}
              hinweis={kpis.summary_cards.average_revenue_per_room?.note === "exact" ? `Periode ${kpis.period?.label || ""}` : kpis.summary_cards.average_revenue_per_room?.note}
              farbe="#EA580C"
              akzent="#FDBA74"
              badge={kpis.availability?.revenue === "exact" ? "Exakt" : "Geschätzt"}
            />
            <KpiKarte
              titel="Durchschn. Gewinn pro Unit"
              wert={kpis.summary_cards.average_profit_per_unit?.value != null ? formatCurrency(kpis.summary_cards.average_profit_per_unit.value) : "—"}
              hinweis={kpis.summary_cards.average_profit_per_unit?.note || ""}
              farbe="#16A34A"
              akzent="#86EFAC"
              badge={kpis.availability?.profit === "exact" ? "Exakt" : "Geschätzt"}
            />
            <KpiKarte
              titel="Beste Unit"
              wert={kpis.summary_cards.best_unit ? `${kpis.summary_cards.best_unit.unit_title || kpis.summary_cards.best_unit.unit_id}` : "—"}
              hinweis={kpis.summary_cards.best_unit ? `${formatCurrency(kpis.summary_cards.best_unit.value)} Gewinn` : "Keine Daten"}
              farbe="#2563EB"
              akzent="#93C5FD"
              badge="Live"
            />
            <KpiKarte
              titel="Schwächste Unit"
              wert={kpis.summary_cards.weakest_unit ? `${kpis.summary_cards.weakest_unit.unit_title || kpis.summary_cards.weakest_unit.unit_id}` : "—"}
              hinweis={kpis.summary_cards.weakest_unit ? `${formatCurrency(kpis.summary_cards.weakest_unit.value)} Gewinn` : "Keine Daten"}
              farbe="#7C3AED"
              akzent="#C4B5FD"
              badge="Live"
            />
            <KpiKarte
              titel="Leerstand (Room-Tage)"
              wert={kpis.summary_cards.vacant_days_this_month?.value ?? "—"}
              hinweis={kpis.summary_cards.vacant_days_this_month?.note === "estimated" ? "Geschätzt (free_rooms × Tage)" : kpis.summary_cards.vacant_days_this_month?.note}
              farbe="#E11D48"
              akzent="#FDA4AF"
              badge="Geschätzt"
            />
            <KpiKarte
              titel="Prognose nächster Monat"
              wert={kpis.summary_cards.forecast_next_month?.revenue != null ? formatCurrency(kpis.summary_cards.forecast_next_month.revenue) : "—"}
              hinweis={kpis.summary_cards.forecast_next_month?.methodology || ""}
              farbe="#0D9488"
              akzent="#5EEAD4"
              badge="Geschätzt"
            />
            <KpiKarte
              titel="Trend vs. Vormonat"
              wert={kpis.summary_cards.trend_vs_previous_month?.revenue_diff_pct != null ? `${kpis.summary_cards.trend_vs_previous_month.revenue_diff_pct >= 0 ? "+" : ""}${kpis.summary_cards.trend_vs_previous_month.revenue_diff_pct}%` : "—"}
              hinweis={kpis.summary_cards.trend_vs_previous_month ? `Umsatz: ${formatCurrency(kpis.summary_cards.trend_vs_previous_month.revenue_diff)} vs. Vormonat` : ""}
              farbe="#4F46E5"
              akzent="#A5B4FC"
              badge="Live"
            />
          </div>

          {Array.isArray(kpis.warnings) && kpis.warnings.length > 0 && (
            <div style={{ background: "#FFFFFF", border: "1px solid #E5E7EB", borderRadius: "22px", padding: "24px", boxShadow: "0 8px 24px rgba(15, 23, 42, 0.04)" }}>
              <h3 style={{ fontSize: "22px", fontWeight: 800, margin: "0 0 12px 0", color: "#0F172A" }}>Warnungen (Units / Liegenschaften)</h3>
              <p style={{ color: "#64748B", margin: "0 0 16px 0", fontSize: "14px" }}>Units mit Leerstand, Kosten ohne Umsatz oder negativem Gewinn.</p>
              <ul style={{ margin: 0, paddingLeft: "20px", color: "#475569" }}>
                {kpis.warnings.map((w, i) => (
                  <li key={`${w.unit_id}-${i}`} style={{ marginBottom: "8px" }}>
                    <strong>{w.unit_title || w.unit_id}</strong>: {w.message}
                    {w.severity === "high" && <span style={{ marginLeft: "8px", color: "#B91C1C", fontWeight: 700 }}>• Hoch</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {Array.isArray(kpis.assumptions) && kpis.assumptions.length > 0 && (
            <div style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: "22px", padding: "24px" }}>
              <h3 style={{ fontSize: "18px", fontWeight: 700, margin: "0 0 12px 0", color: "#475569" }}>Annahmen & Limitationen</h3>
              <p style={{ color: "#64748B", margin: "0 0 12px 0", fontSize: "14px" }}>So wurden die KPIs berechnet. Geschätzte oder nicht verfügbare Werte sind gekennzeichnet.</p>
              <ul style={{ margin: 0, paddingLeft: "20px", color: "#64748B", fontSize: "14px" }}>
                {kpis.assumptions.map((a, i) => (
                  <li key={i} style={{ marginBottom: "6px" }}>{a}</li>
                ))}
              </ul>
              {kpis.availability && (
                <p style={{ marginTop: "12px", fontSize: "13px", color: "#94A3B8" }}>
                  Verfügbarkeit: Umsatz/Gewinn = {kpis.availability.revenue}; Leerstandstage = {kpis.availability.vacant_days}; Prognose = {kpis.availability.forecast}; Break-even = {kpis.availability.break_even}.
                </p>
              )}
            </div>
          )}
        </>
      )}

      {operationsLoadError && (
        <div
          style={{
            background: "#FEF2F2",
            border: "1px solid #FECACA",
            borderRadius: "12px",
            padding: "16px",
            color: "#B91C1C",
          }}
        >
          <strong>Fehler beim Laden der Betriebsdaten:</strong> {operationsLoadError}
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "16px",
        }}
      >
        <KpiKarte
          titel="Umsatz aktuell"
          wert={formatCurrency(operationsStats.currentRevenue)}
          hinweis="Aktueller Umsatz aus belegten Co-Living Rooms"
          farbe="#EA580C"
          akzent="#FDBA74"
        />
        <KpiKarte
          titel="Ausgaben aktuell"
          wert={formatCurrency(operationsStats.runningCosts)}
          hinweis="Laufende Kosten aus Miete, Nebenkosten und Reinigung"
          farbe="#334155"
          akzent="#CBD5E1"
        />
        <KpiKarte
          titel="Gewinn aktuell"
          wert={formatCurrency(operationsStats.currentProfit)}
          hinweis="Umsatz minus laufende Ausgaben"
          farbe="#16A34A"
          akzent="#86EFAC"
        />
        <KpiKarte
          titel="Belegung"
          wert={formatPercent(operationsStats.occupancyRate)}
          hinweis={`${operationsStats.occupiedRooms} von ${operationsStats.totalRooms} Rooms belegt`}
          farbe="#E11D48"
          akzent="#FDA4AF"
        />
      </div>

      {profitApi.summary && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "16px",
          }}
        >
          <KpiKarte
            titel="Umsatz (Tenancies)"
            wert={formatCurrency(profitApi.summary.total_revenue)}
            hinweis={`Monat ${profitApi.month}/${profitApi.year} aus Mieten`}
            farbe="#EA580C"
            akzent="#FDBA74"
            badge="API"
          />
          <KpiKarte
            titel="Kosten (unit_costs)"
            wert={formatCurrency(profitApi.summary.total_costs)}
            hinweis="Summe aller Unit-Kosten"
            farbe="#334155"
            akzent="#CBD5E1"
            badge="API"
          />
          <KpiKarte
            titel="Gewinn (Monat)"
            wert={formatCurrency(profitApi.summary.total_profit)}
            hinweis="Umsatz minus Kosten"
            farbe={profitApi.summary.total_profit >= 0 ? "#16A34A" : "#B91C1C"}
            akzent={profitApi.summary.total_profit >= 0 ? "#86EFAC" : "#FCA5A5"}
            badge="API"
          />
        </div>
      )}

      <div
        style={{
          background: "#ffffff",
          border: "1px solid #e5e7eb",
          borderRadius: "20px",
          padding: "24px",
        }}
      >
        <h3 style={{ marginBottom: "20px" }}>Finanzentwicklung letzte 6 Monate</h3>
        <div style={{ width: "100%", height: "320px" }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={financeChartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip formatter={(value) => `CHF ${value.toLocaleString()}`} />
              <Bar dataKey="revenue" fill="#f97316" radius={[8, 8, 0, 0]} />
              <Bar dataKey="costs" fill="#334155" radius={[8, 8, 0, 0]} />
              <Bar dataKey="profit" fill="#16a34a" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div
        style={{
          background: "#ffffff",
          border: "1px solid #e5e7eb",
          borderRadius: "20px",
          padding: "24px",
        }}
      >
        <h3 style={{ marginBottom: "20px" }}>Belegung Rooms letzte 6 Monate</h3>
        <div style={{ width: "100%", height: "320px" }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={belegungChartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar name="Belegt" dataKey="occupied" fill="#16a34a" radius={[8, 8, 0, 0]} />
              <Bar name="Frei" dataKey="free" fill="#ef4444" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "16px",
        }}
      >
        <KpiKarte
          titel="Offene Rechnungen"
          wert={invoiceStats.openCount}
          hinweis={formatCurrency(invoiceStats.openAmount)}
          farbe="#D97706"
          akzent="#FCD34D"
        />
        <KpiKarte
          titel="Bezahlte Rechnungen"
          wert={invoiceStats.paidCount}
          hinweis={formatCurrency(invoiceStats.paidAmount)}
          farbe="#15803D"
          akzent="#86EFAC"
        />
        <KpiKarte
          titel="Überfällige Rechnungen"
          wert={invoiceStats.overdueCount}
          hinweis={formatCurrency(invoiceStats.overdueAmount)}
          farbe="#B91C1C"
          akzent="#FCA5A5"
        />
        <KpiKarte
          titel="Kritische Units"
          wert={operationsStats.criticalUnits}
          hinweis={
            operationsStats.weakestUnit
              ? `Schwächste Unit: ${operationsStats.weakestUnit.unitId}`
              : "Keine kritischen Units erkannt"
          }
          farbe="#7C3AED"
          akzent="#C4B5FD"
        />
      </div>

      <div
        style={{
          background: "#FFFFFF",
          border: "1px solid #E5E7EB",
          borderRadius: "22px",
          padding: "24px",
          boxShadow: "0 8px 24px rgba(15, 23, 42, 0.04)",
        }}
      >
        <div style={{ marginBottom: "18px" }}>
          <h3
            style={{
              fontSize: "22px",
              fontWeight: 800,
              margin: 0,
              color: "#0F172A",
              letterSpacing: "-0.02em",
            }}
          >
            Kritische Hinweise
          </h3>
          <p style={{ color: "#64748B", margin: "8px 0 0 0" }}>
            Die wichtigsten Auffälligkeiten auf einen Blick.
          </p>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: "14px",
          }}
        >
          {systemWarnings.map((warning, index) => {
            const styles = {
              success: {
                bg: "#ECFDF5",
                border: "#A7F3D0",
                title: "#047857",
                text: "#065F46",
              },
              warning: {
                bg: "#FFF7ED",
                border: "#FED7AA",
                title: "#C2410C",
                text: "#9A3412",
              },
              danger: {
                bg: "#FEF2F2",
                border: "#FECACA",
                title: "#B91C1C",
                text: "#991B1B",
              },
            };
            const style = styles[warning.level];
            return (
              <div
                key={`${warning.title}-${index}`}
                style={{
                  background: style.bg,
                  border: `1px solid ${style.border}`,
                  borderRadius: "18px",
                  padding: "16px",
                }}
              >
                <div
                  style={{
                    fontSize: "14px",
                    fontWeight: 800,
                    color: style.title,
                    marginBottom: "8px",
                  }}
                >
                  {warning.title}
                </div>
                <div style={{ fontSize: "14px", color: style.text, lineHeight: 1.5 }}>
                  {warning.text}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div
        style={{
          background: "#FFFFFF",
          border: "1px solid #E5E7EB",
          borderRadius: "22px",
          padding: "24px",
          boxShadow: "0 8px 24px rgba(15, 23, 42, 0.04)",
        }}
      >
        <h3
          style={{
            fontSize: "22px",
            fontWeight: 800,
            margin: "0 0 10px 0",
            color: "#0F172A",
            letterSpacing: "-0.02em",
          }}
        >
          Schnellzugriff
        </h3>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: "16px",
            marginTop: "16px",
          }}
        >
          <SchnellzugriffKarte
            titel="Co-Living-Dashboard"
            text="Operative Steuerung für Belegung, Forecast, Leerstand, Gewinn pro Unit und Room-Status."
            linkText="Zum Co-Living-Dashboard"
            to="/admin/operations"
            icon="🏠"
            iconBg="#FFF7ED"
            iconColor="#EA580C"
          />
          <SchnellzugriffKarte
            titel="Objekte-Dashboard"
            text="Übersicht und Verwaltung deiner Objekte, Units, Rooms und Belegungsstruktur."
            linkText="Zu den Objekten"
            to="/admin/apartments"
            icon="🏢"
            iconBg="#EFF6FF"
            iconColor="#2563EB"
          />
          <SchnellzugriffKarte
            titel="Rechnungs-Dashboard"
            text="Rechnungen, offene Posten, Statuswechsel, PDF-Download und später Zahlungshistorie."
            linkText="Zu den Rechnungen"
            to="/admin/invoices"
            icon="💳"
            iconBg="#F0FDF4"
            iconColor="#16A34A"
          />
        </div>
      </div>

      <div
        style={{
          background: "#FFFFFF",
          border: "1px solid #E5E7EB",
          borderRadius: "22px",
          padding: "24px",
          boxShadow: "0 8px 24px rgba(15, 23, 42, 0.04)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "12px",
            marginBottom: "16px",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h3
              style={{
                fontSize: "22px",
                fontWeight: 800,
                margin: 0,
                color: "#0F172A",
                letterSpacing: "-0.02em",
              }}
            >
              Letzte Rechnungen
            </h3>
            <p style={{ color: "#64748B", margin: "8px 0 0 0" }}>
              Die zuletzt erfassten Rechnungen aus deinem Billing-Modul.
            </p>
          </div>
          <Link
            to="/admin/invoices"
            style={{
              display: "inline-block",
              background: "#0F172A",
              color: "#FFFFFF",
              padding: "10px 14px",
              borderRadius: "12px",
              textDecoration: "none",
              fontWeight: 700,
              fontSize: "14px",
              whiteSpace: "nowrap",
            }}
          >
            Alle Rechnungen
          </Link>
        </div>
        {invoiceLoading ? (
          <p style={{ color: "#64748B" }}>Rechnungen werden geladen...</p>
        ) : invoiceError ? (
          <p style={{ color: "#B91C1C" }}>{invoiceError}</p>
        ) : latestInvoices.length === 0 ? (
          <p style={{ color: "#64748B" }}>Noch keine Rechnungen vorhanden.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
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
                    borderBottom: "1px solid #E5E7EB",
                    background: "#F8FAFC",
                  }}
                >
                  <th style={{ padding: "14px 12px" }}>Rechnungsnummer</th>
                  <th style={{ padding: "14px 12px" }}>Betrag</th>
                  <th style={{ padding: "14px 12px" }}>Status</th>
                  <th style={{ padding: "14px 12px" }}>Rechnungsdatum</th>
                  <th style={{ padding: "14px 12px" }}>Fälligkeitsdatum</th>
                </tr>
              </thead>
              <tbody>
                {latestInvoices.map((invoice) => (
                  <tr key={invoice.id} style={{ borderBottom: "1px solid #F1F5F9" }}>
                    <td style={{ padding: "14px 12px", fontWeight: 700 }}>
                      <Link
                        to={`/admin/invoices/${invoice.id}`}
                        style={{ color: "#2563EB", textDecoration: "none" }}
                      >
                        {invoice.invoice_number}
                      </Link>
                    </td>
                    <td style={{ padding: "14px 12px", fontWeight: 600 }}>
                      {formatCurrency(invoice.amount)}
                    </td>
                    <td style={{ padding: "14px 12px" }}>
                      <StatusBadge status={invoice.status} />
                    </td>
                    <td style={{ padding: "14px 12px" }}>{formatDate(invoice.issue_date)}</td>
                    <td style={{ padding: "14px 12px" }}>{formatDate(invoice.due_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
