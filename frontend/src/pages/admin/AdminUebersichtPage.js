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
  fetchAdminTenanciesAll,
  fetchAdminUnitCosts,
  normalizeFetchError,
  sanitizeClientErrorMessage,
} from "../../api/adminData";
import {
  getPortfolioMetrics,
  getPortfolioUnitLabel,
} from "../../utils/adminPortfolioMetrics";

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

/** Last `n` calendar months from today (oldest first). */
function lastNMonths(n) {
  const out = [];
  const d = new Date();
  for (let i = n - 1; i >= 0; i -= 1) {
    const dt = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push({ year: dt.getFullYear(), month: dt.getMonth() + 1 });
  }
  return out;
}

function monthEndDateString(year, month) {
  const lastDay = new Date(year, month, 0);
  const y = lastDay.getFullYear();
  const m = String(lastDay.getMonth() + 1).padStart(2, "0");
  const day = String(lastDay.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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
  farbe = "#eef2ff",
  akzent = "#64748b",
  badge = "Live",
}) {
  return (
    <div className="relative overflow-hidden rounded-[14px] border border-white/[0.07] bg-[#141824] p-5">
      <div className="absolute left-0 right-0 top-0 h-1" style={{ background: akzent }} />
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="text-[9px] font-bold uppercase tracking-[1px] text-[#6b7a9a]">{titel}</div>
        <span className="inline-flex items-center whitespace-nowrap rounded-full border border-white/[0.1] bg-white/[0.06] px-2.5 py-0.5 text-[10px] font-bold text-[#6b7a9a]">
          {badge}
        </span>
      </div>
      <div className="text-[24px] font-bold leading-tight tracking-tight" style={{ color: farbe }}>
        {wert}
      </div>
      {hinweis ? (
        <div className="mt-3 text-[11px] leading-relaxed text-[#6b7a9a]">{hinweis}</div>
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
  iconBg = "#111520",
  iconColor = "#7aaeff",
}) {
  return (
    <div className="flex min-h-[210px] flex-col gap-3.5 rounded-[14px] border border-white/[0.07] bg-[#141824] p-5">
      <div
        className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/[0.08] text-[22px] font-extrabold"
        style={{ background: iconBg, color: iconColor }}
      >
        {icon}
      </div>
      <div>
        <h3 className="mb-2 text-[18px] font-bold tracking-tight text-[#eef2ff]">{titel}</h3>
        <p className="m-0 text-[13px] leading-relaxed text-[#6b7a9a]">{text}</p>
      </div>
      <div className="mt-auto">
        <Link
          to={to}
          className="inline-block rounded-[8px] border-none bg-gradient-to-r from-[#5b8cff] to-[#7c5cfc] px-4 py-2.5 text-[14px] font-semibold text-white no-underline"
        >
          {linkText}
        </Link>
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const normalized = (status || "").toLowerCase();
  let label = "Offen";
  const base =
    "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-bold ";
  let cls = base;
  if (normalized === "paid") {
    label = "Bezahlt";
    cls += "border-green-500/20 bg-green-500/10 text-green-400";
  } else if (normalized === "overdue") {
    label = "Überfällig";
    cls += "border-red-500/20 bg-red-500/10 text-red-400";
  } else if (normalized === "cancelled") {
    label = "Storniert";
    cls += "border-white/[0.1] bg-white/[0.06] text-[#6b7a9a]";
  } else {
    cls += "border-amber-500/20 bg-amber-500/10 text-amber-400";
  }
  return <span className={cls}>{label}</span>;
}

export default function AdminUebersichtPage() {
  const [invoices, setInvoices] = useState([]);
  const [invoiceLoading, setInvoiceLoading] = useState(true);
  const [invoiceError, setInvoiceError] = useState("");
  const [units, setUnits] = useState([]);
  const [unitCostsByUnitId, setUnitCostsByUnitId] = useState({});
  const [rooms, setRooms] = useState([]);
  const [tenancies, setTenancies] = useState(null);
  const [profitApi, setProfitApi] = useState({ summary: null, units: [], year: null, month: null });
  const [occupancyApi, setOccupancyApi] = useState(null);
  const [kpis, setKpis] = useState(null);
  const [kpisLoading, setKpisLoading] = useState(true);
  const [kpisError, setKpisError] = useState("");
  const [operationsLoadError, setOperationsLoadError] = useState("");
  const [monthlyChartsLoading, setMonthlyChartsLoading] = useState(true);
  const [monthlyChartsError, setMonthlyChartsError] = useState("");
  const [financeChartData, setFinanceChartData] = useState([]);
  const [belegungChartData, setBelegungChartData] = useState([]);
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
      fetchAdminTenanciesAll().catch(() => []),
    ])
      .then(([unitsData, roomsData, occupancyData, profitData, tenanciesData]) => {
        setUnits(unitsData.map(normalizeUnit));
        setRooms(Array.isArray(roomsData) ? roomsData.map(normalizeRoom) : []);
        setOccupancyApi(occupancyData);
        setProfitApi({
          summary: profitData.summary ?? null,
          units: profitData.units ?? [],
          year: profitData.year,
          month: profitData.month,
        });
        setTenancies(Array.isArray(tenanciesData) ? tenanciesData : []);
      })
      .catch((e) => {
        setTenancies([]);
        setOperationsLoadError(
          sanitizeClientErrorMessage(
            normalizeFetchError(e, "Betriebsdaten konnten nicht geladen werden.").message,
            "Betriebsdaten konnten nicht geladen werden."
          )
        );
      });
  }, []);

  useEffect(() => {
    if (!Array.isArray(units) || units.length === 0) {
      setUnitCostsByUnitId({});
      return undefined;
    }
    let cancelled = false;
    Promise.all(
      units.map((u) =>
        fetchAdminUnitCosts(u.id)
          .then((rows) => [String(u.id), Array.isArray(rows) ? rows : []])
          .catch(() => [String(u.id), []])
      )
    ).then((entries) => {
      if (cancelled) return;
      setUnitCostsByUnitId(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [units]);

  useEffect(() => {
    let cancelled = false;
    const months = lastNMonths(6);
    setMonthlyChartsLoading(true);
    setMonthlyChartsError("");
    Promise.all([
      Promise.all(months.map(({ year, month }) => fetchAdminProfit({ year, month }))),
      Promise.all(
        months.map(({ year, month }) =>
          fetchAdminOccupancy({ on_date: monthEndDateString(year, month) })
        )
      ),
    ])
      .then(([profits, occupancies]) => {
        if (cancelled) return;
        const finance = months.map((m, idx) => {
          const p = profits[idx];
          const label = new Date(m.year, m.month - 1, 1).toLocaleDateString("de-CH", {
            month: "short",
          });
          return {
            month: label,
            revenue: Number(p?.summary?.total_revenue ?? 0),
            costs: Number(p?.summary?.total_costs ?? 0),
            profit: Number(p?.summary?.total_profit ?? 0),
          };
        });
        const belegung = months.map((m, idx) => {
          const o = occupancies[idx];
          const label = new Date(m.year, m.month - 1, 1).toLocaleDateString("de-CH", {
            month: "short",
          });
          return {
            month: label,
            occupied: Number(o?.summary?.occupied_rooms ?? 0),
            free: Number(o?.summary?.free_rooms ?? 0),
          };
        });
        setFinanceChartData(finance);
        setBelegungChartData(belegung);
        setMonthlyChartsLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        console.error(e);
        setMonthlyChartsError(
          sanitizeClientErrorMessage(e.message, "Monatsdaten konnten nicht geladen werden.")
        );
        setFinanceChartData([]);
        setBelegungChartData([]);
        setMonthlyChartsLoading(false);
      });
    return () => {
      cancelled = true;
    };
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
        setKpisError(
          sanitizeClientErrorMessage(e.message, "KPI-Daten konnten nicht geladen werden.")
        );
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
        setInvoiceError(
          sanitizeClientErrorMessage(
            e?.message ?? "",
            "Rechnungen konnten nicht geladen werden."
          )
        );
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

  const portfolio = useMemo(
    () => getPortfolioMetrics(units, rooms, tenancies, unitCostsByUnitId),
    [units, rooms, tenancies, unitCostsByUnitId]
  );

  const weakestUnitDisplayLabel = useMemo(() => {
    const wu = operationsStats.weakestUnit;
    if (!wu) return "";
    const idx = units.findIndex(
      (u) =>
        String(u.id) === String(wu.unitId) ||
        String(u.unitId) === String(wu.unitId)
    );
    if (idx >= 0) return getPortfolioUnitLabel(units[idx], idx);
    return getPortfolioUnitLabel(
      { unitId: wu.unitId, place: wu.place, city: wu.place },
      -1
    );
  }, [operationsStats.weakestUnit, units]);

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
        text: `${weakestUnitDisplayLabel || operationsStats.weakestUnit.unitId} macht aktuell Verlust.`,
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
  }, [operationsStats, invoiceStats, weakestUnitDisplayLabel]);

  return (
    <div data-testid="admin-dashboard-page" className="min-h-screen bg-[#07090f] text-[#eef2ff]">
      <div className="mx-auto grid max-w-[min(1400px,100%)] gap-6 p-6">
      <div className="flex items-center justify-end gap-3">
        <span className="text-[13px] text-[#6b7a9a]">KPI-Zeitraum:</span>
        <select
          value={`${kpisPeriod.year}-${kpisPeriod.month}`}
          onChange={(e) => {
            const [y, m] = e.target.value.split("-").map(Number);
            setKpisPeriod({ year: y, month: m });
          }}
          className="rounded-[8px] border border-white/[0.08] bg-[#111520] px-3 py-2 text-[13px] text-[#eef2ff]"
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
      <div className="rounded-[14px] border border-white/[0.07] bg-[#141824] p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-2 text-[9px] font-bold uppercase tracking-[1px] text-[#6b7a9a]">
              Vantio
            </div>
            <h2 className="m-0 text-[22px] font-bold text-[#eef2ff]">
              Unternehmensübersicht
            </h2>
            <p className="mt-3 max-w-[950px] text-[12px] leading-relaxed text-[#6b7a9a]">
              Zentrale Live-Übersicht über Umsatz, Ausgaben, Gewinn, Belegung,
              Rechnungen und kritische Bereiche des Unternehmens.
            </p>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <span className="inline-flex items-center rounded-full border border-white/[0.1] bg-white/[0.06] px-3 py-1.5 text-[11px] font-bold text-[#6b7a9a]">
              Live KPI
            </span>
            <span className="inline-flex items-center rounded-full border border-white/[0.1] bg-white/[0.06] px-3 py-1.5 text-[11px] font-bold text-[#6b7a9a]">
              Management Ansicht
            </span>
          </div>
        </div>
      </div>

      {portfolio && (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
          <KpiKarte
            titel="Gesamt Umsatz"
            wert={formatCurrency(portfolio.totalRevenue)}
            hinweis="Summe aktiver Mietverhältnisse (alle Units)"
            farbe="#eef2ff"
            akzent="#64748b"
            badge="Tenancy"
          />
          <KpiKarte
            titel="Vollbelegung Potenzial"
            wert={formatCurrency(portfolio.totalFullPotential)}
            hinweis="Co-Living: Zimmerpreise · Apartment: Mieterpreis"
            farbe="#fb923c"
            akzent="#ea580c"
            badge="Tenancy"
          />
          <KpiKarte
            titel="Leerstand"
            wert={formatCurrency(portfolio.totalVacancy)}
            hinweis="Potenzial minus aktueller Umsatz"
            farbe="#f87171"
            akzent="#e11d48"
            badge="Tenancy"
          />
          <KpiKarte
            titel="Auslastung %"
            wert={
              portfolio.occupancyRate != null
                ? formatPercent(portfolio.occupancyRate * 100)
                : "—"
            }
            hinweis="Belegte Slots / Kapazität (Co-Living: Zimmer, Apartment: 1)"
            farbe="#7aaeff"
            akzent="#2563eb"
            badge="Tenancy"
          />
          <KpiKarte
            titel="Beste Unit"
            wert={
              portfolio.bestUnit
                ? getPortfolioUnitLabel(
                    portfolio.bestUnit.unit,
                    portfolio.bestUnit.listIndex
                  )
                : "—"
            }
            hinweis={
              portfolio.bestUnit
                ? `${formatCurrency(portfolio.bestUnit.profit)} Gewinn`
                : ""
            }
            farbe="#4ade80"
            akzent="#16a34a"
            badge="Tenancy"
          />
          <KpiKarte
            titel="Schwächste Unit"
            wert={
              portfolio.worstUnit
                ? getPortfolioUnitLabel(
                    portfolio.worstUnit.unit,
                    portfolio.worstUnit.listIndex
                  )
                : "—"
            }
            hinweis={
              portfolio.worstUnit
                ? `${formatCurrency(portfolio.worstUnit.profit)} Gewinn`
                : ""
            }
            farbe="#a78bfa"
            akzent="#7c3aed"
            badge="Tenancy"
          />
        </div>
      )}
      {tenancies === null && !operationsLoadError && (
        <p className="py-2 text-[13px] text-[#6b7a9a]">
          Portfolio-KPIs (Tenancies) werden geladen…
        </p>
      )}

      {kpisLoading && (
        <p className="py-4 text-[13px] text-[#6b7a9a]">Lade KPI-Daten…</p>
      )}
      {kpisError && (
        <div className="rounded-[10px] border border-red-500/20 bg-red-500/10 px-4 py-3 text-[14px] text-[#f87171]">
          {kpisError}
        </div>
      )}
      {kpis && !kpisLoading && (
        <>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
            <KpiKarte
              titel="Durchschn. Umsatz pro Room"
              wert={kpis.summary_cards.average_revenue_per_room?.value != null ? formatCurrency(kpis.summary_cards.average_revenue_per_room.value) : "—"}
              hinweis={kpis.summary_cards.average_revenue_per_room?.note === "exact" ? `Periode ${kpis.period?.label || ""}` : kpis.summary_cards.average_revenue_per_room?.note}
              farbe="#fb923c"
              akzent="#ea580c"
              badge={kpis.availability?.revenue === "exact" ? "Exakt" : "Geschätzt"}
            />
            <KpiKarte
              titel="Durchschn. Gewinn pro Unit"
              wert={kpis.summary_cards.average_profit_per_unit?.value != null ? formatCurrency(kpis.summary_cards.average_profit_per_unit.value) : "—"}
              hinweis={kpis.summary_cards.average_profit_per_unit?.note || ""}
              farbe="#4ade80"
              akzent="#16a34a"
              badge={kpis.availability?.profit === "exact" ? "Exakt" : "Geschätzt"}
            />
            <KpiKarte
              titel="Leerstand (Room-Tage)"
              wert={kpis.summary_cards.vacant_days_this_month?.value ?? "—"}
              hinweis={kpis.summary_cards.vacant_days_this_month?.note === "estimated" ? "Geschätzt (free_rooms × Tage)" : kpis.summary_cards.vacant_days_this_month?.note}
              farbe="#f87171"
              akzent="#e11d48"
              badge="Geschätzt"
            />
            <KpiKarte
              titel="Prognose nächster Monat"
              wert={kpis.summary_cards.forecast_next_month?.revenue != null ? formatCurrency(kpis.summary_cards.forecast_next_month.revenue) : "—"}
              hinweis={kpis.summary_cards.forecast_next_month?.methodology || ""}
              farbe="#2dd4bf"
              akzent="#0d9488"
              badge="Geschätzt"
            />
            <KpiKarte
              titel="Trend vs. Vormonat"
              wert={kpis.summary_cards.trend_vs_previous_month?.revenue_diff_pct != null ? `${kpis.summary_cards.trend_vs_previous_month.revenue_diff_pct >= 0 ? "+" : ""}${kpis.summary_cards.trend_vs_previous_month.revenue_diff_pct}%` : "—"}
              hinweis={kpis.summary_cards.trend_vs_previous_month ? `Umsatz: ${formatCurrency(kpis.summary_cards.trend_vs_previous_month.revenue_diff)} vs. Vormonat` : ""}
              farbe="#a78bfa"
              akzent="#6366f1"
              badge="Live"
            />
          </div>

          {Array.isArray(kpis.warnings) && kpis.warnings.length > 0 && (
            <div className="rounded-[14px] border border-amber-500/[0.15] bg-amber-500/[0.06] p-6">
              <h3 className="m-0 text-[16px] font-bold text-[#fbbf24]">Warnungen (Units / Liegenschaften)</h3>
              <p className="mb-4 mt-2 text-[13px] text-[#6b7a9a]">Units mit Leerstand, Kosten ohne Umsatz oder negativem Gewinn.</p>
              <ul className="m-0 list-disc space-y-2 pl-5 text-[13px] text-[#eef2ff]">
                {kpis.warnings.map((w, i) => (
                  <li key={`${w.unit_id}-${i}`}>
                    <strong className="font-semibold text-[#eef2ff]">{w.unit_title || w.unit_id}</strong>: {w.message}
                    {w.severity === "high" && <span className="ml-2 font-bold text-[#f87171]">• Hoch</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {Array.isArray(kpis.assumptions) && kpis.assumptions.length > 0 && (
            <div className="rounded-[14px] border border-white/[0.07] bg-[#141824] p-6">
              <h3 className="m-0 text-[9px] font-bold uppercase tracking-[1px] text-[#6b7a9a]">Annahmen & Limitationen</h3>
              <p className="mb-3 mt-2 text-[13px] text-[#6b7a9a]">So wurden die KPIs berechnet. Geschätzte oder nicht verfügbare Werte sind gekennzeichnet.</p>
              <ul className="m-0 list-disc space-y-1.5 pl-5 text-[13px] text-[#6b7a9a]">
                {kpis.assumptions.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
              {kpis.availability && (
                <p className="mt-3 text-[12px] text-[#6b7a9a]">
                  Verfügbarkeit: Umsatz/Gewinn = {kpis.availability.revenue}; Leerstandstage = {kpis.availability.vacant_days}; Prognose = {kpis.availability.forecast}; Break-even = {kpis.availability.break_even}.
                </p>
              )}
            </div>
          )}
        </>
      )}

      {operationsLoadError && (
        <div className="rounded-[10px] border border-red-500/20 bg-red-500/10 px-4 py-3 text-[14px] text-[#f87171]">
          <strong className="font-semibold">Fehler beim Laden der Betriebsdaten:</strong> {operationsLoadError}
        </div>
      )}

      <div className="rounded-[14px] border border-white/[0.07] bg-[#141824] p-6">
        <h3 className="mb-4 text-[16px] font-bold text-[#eef2ff]">Finanzentwicklung letzte 6 Monate</h3>
        {monthlyChartsLoading ? (
          <p className="text-[13px] text-[#6b7a9a]">Lade Monatsdaten…</p>
        ) : monthlyChartsError ? (
          <p className="text-[13px] text-[#f87171]">{monthlyChartsError}</p>
        ) : financeChartData.length === 0 ? (
          <p className="text-[13px] text-[#6b7a9a]">Keine Daten vorhanden</p>
        ) : (
          <div className="h-[320px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={financeChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: "#6b7a9a", fontSize: 11 }} />
                <YAxis tick={{ fill: "#6b7a9a", fontSize: 11 }} />
                <Tooltip formatter={(value) => `CHF ${value.toLocaleString()}`} />
                <Bar dataKey="revenue" fill="#f97316" radius={[8, 8, 0, 0]} />
                <Bar dataKey="costs" fill="#334155" radius={[8, 8, 0, 0]} />
                <Bar dataKey="profit" fill="#16a34a" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="rounded-[14px] border border-white/[0.07] bg-[#141824] p-6">
        <h3 className="mb-4 text-[16px] font-bold text-[#eef2ff]">Belegung Rooms letzte 6 Monate</h3>
        {monthlyChartsLoading ? (
          <p className="text-[13px] text-[#6b7a9a]">Lade Monatsdaten…</p>
        ) : monthlyChartsError ? (
          <p className="text-[13px] text-[#f87171]">{monthlyChartsError}</p>
        ) : belegungChartData.length === 0 ? (
          <p className="text-[13px] text-[#6b7a9a]">Keine Daten vorhanden</p>
        ) : (
          <div className="h-[320px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={belegungChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: "#6b7a9a", fontSize: 11 }} />
                <YAxis tick={{ fill: "#6b7a9a", fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Bar name="Belegt" dataKey="occupied" fill="#16a34a" radius={[8, 8, 0, 0]} />
                <Bar name="Frei" dataKey="free" fill="#ef4444" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
        <KpiKarte
          titel="Offene Rechnungen"
          wert={invoiceStats.openCount}
          hinweis={formatCurrency(invoiceStats.openAmount)}
          farbe="#fb923c"
          akzent="#d97706"
        />
        <KpiKarte
          titel="Bezahlte Rechnungen"
          wert={invoiceStats.paidCount}
          hinweis={formatCurrency(invoiceStats.paidAmount)}
          farbe="#4ade80"
          akzent="#15803d"
        />
        <KpiKarte
          titel="Überfällige Rechnungen"
          wert={invoiceStats.overdueCount}
          hinweis={formatCurrency(invoiceStats.overdueAmount)}
          farbe="#f87171"
          akzent="#b91c1c"
        />
        <KpiKarte
          titel="Kritische Units"
          wert={operationsStats.criticalUnits}
          hinweis={
            operationsStats.weakestUnit
              ? `Schwächste Unit: ${weakestUnitDisplayLabel || operationsStats.weakestUnit.unitId}`
              : "Keine kritischen Units erkannt"
          }
          farbe="#a78bfa"
          akzent="#7c3aed"
        />
      </div>

      <div className="rounded-[14px] border border-white/[0.07] bg-[#141824] p-6">
        <div className="mb-4">
          <h3 className="m-0 text-[16px] font-bold text-[#eef2ff]">
            Kritische Hinweise
          </h3>
          <p className="mt-2 text-[12px] text-[#6b7a9a]">
            Die wichtigsten Auffälligkeiten auf einen Blick.
          </p>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-3.5">
          {systemWarnings.map((warning, index) => {
            const styles = {
              success: {
                box: "border border-green-500/20 bg-green-500/10",
                title: "text-green-400",
                text: "text-[#6b7a9a]",
              },
              warning: {
                box: "border border-amber-500/[0.15] bg-amber-500/[0.06]",
                title: "text-[#fbbf24]",
                text: "text-[#6b7a9a]",
              },
              danger: {
                box: "border border-red-500/20 bg-red-500/10",
                title: "text-red-400",
                text: "text-[#6b7a9a]",
              },
            };
            const style = styles[warning.level];
            return (
              <div
                key={`${warning.title}-${index}`}
                className={`rounded-[10px] p-4 ${style.box}`}
              >
                <div className={`mb-2 text-[13px] font-bold ${style.title}`}>
                  {warning.title}
                </div>
                <div className={`text-[13px] leading-relaxed ${style.text}`}>
                  {warning.text}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-[14px] border border-white/[0.07] bg-[#141824] p-6">
        <h3 className="m-0 text-[16px] font-bold text-[#eef2ff]">
          Schnellzugriff
        </h3>
        <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-4">
          <SchnellzugriffKarte
            titel="Co-Living-Dashboard"
            text="Operative Steuerung für Belegung, Forecast, Leerstand, Gewinn pro Unit und Room-Status."
            linkText="Zum Co-Living-Dashboard"
            to="/admin/operations"
            icon="🏠"
            iconBg="#111520"
            iconColor="#fb923c"
          />
          <SchnellzugriffKarte
            titel="Objekte-Dashboard"
            text="Übersicht und Verwaltung deiner Objekte, Units, Rooms und Belegungsstruktur."
            linkText="Zu den Objekten"
            to="/admin/apartments"
            icon="🏢"
            iconBg="#111520"
            iconColor="#7aaeff"
          />
          <SchnellzugriffKarte
            titel="Rechnungs-Dashboard"
            text="Rechnungen, offene Posten, Statuswechsel, PDF-Download und später Zahlungshistorie."
            linkText="Zu den Rechnungen"
            to="/admin/invoices"
            icon="💳"
            iconBg="#111520"
            iconColor="#4ade80"
          />
        </div>
      </div>

      <div className="rounded-[14px] border border-white/[0.07] bg-[#141824] p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="m-0 text-[16px] font-bold text-[#eef2ff]">
              Letzte Rechnungen
            </h3>
            <p className="mt-2 text-[12px] text-[#6b7a9a]">
              Die zuletzt erfassten Rechnungen aus deinem Billing-Modul.
            </p>
          </div>
          <Link
            to="/admin/invoices"
            className="inline-block whitespace-nowrap rounded-[8px] border-none bg-gradient-to-r from-[#5b8cff] to-[#7c5cfc] px-3.5 py-2.5 text-[14px] font-semibold text-white no-underline"
          >
            Alle Rechnungen
          </Link>
        </div>
        {invoiceLoading ? (
          <p className="text-[13px] text-[#6b7a9a]">Rechnungen werden geladen...</p>
        ) : invoiceError ? (
          <p className="text-[13px] text-[#f87171]">{invoiceError}</p>
        ) : latestInvoices.length === 0 ? (
          <p className="text-[13px] text-[#6b7a9a]">Noch keine Rechnungen vorhanden.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px] text-[#eef2ff]">
              <thead className="bg-[#111520]">
                <tr className="text-left">
                  <th className="px-3 py-3 text-[9px] font-bold uppercase tracking-[0.8px] text-[#6b7a9a]">
                    Rechnungsnummer
                  </th>
                  <th className="px-3 py-3 text-[9px] font-bold uppercase tracking-[0.8px] text-[#6b7a9a]">
                    Betrag
                  </th>
                  <th className="px-3 py-3 text-[9px] font-bold uppercase tracking-[0.8px] text-[#6b7a9a]">
                    Status
                  </th>
                  <th className="px-3 py-3 text-[9px] font-bold uppercase tracking-[0.8px] text-[#6b7a9a]">
                    Rechnungsdatum
                  </th>
                  <th className="px-3 py-3 text-[9px] font-bold uppercase tracking-[0.8px] text-[#6b7a9a]">
                    Fälligkeitsdatum
                  </th>
                </tr>
              </thead>
              <tbody>
                {latestInvoices.map((invoice) => (
                  <tr key={invoice.id} className="border-b border-white/[0.05]">
                    <td className="px-3 py-3 font-semibold">
                      <Link
                        to={`/admin/invoices/${invoice.id}`}
                        className="text-[#7aaeff] no-underline hover:underline"
                      >
                        {invoice.invoice_number}
                      </Link>
                    </td>
                    <td className="px-3 py-3 font-medium text-[#eef2ff]">
                      {formatCurrency(invoice.amount)}
                    </td>
                    <td className="px-3 py-3">
                      <StatusBadge status={invoice.status} />
                    </td>
                    <td className="px-3 py-3 font-medium">{formatDate(invoice.issue_date)}</td>
                    <td className="px-3 py-3 font-medium">{formatDate(invoice.due_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
