import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
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
import PortfolioMapSection from "../../components/admin/PortfolioMapSection";

function roundCurrency(value) {
  return Math.round(Number(value || 0));
}

function formatCurrency(value) {
  return `CHF ${roundCurrency(value).toLocaleString("de-CH")}`;
}

function formatPercent(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

/** Clamped 0–100 for occupancy bar width (matches portfolio.occupancyRate). */
function clampOccupancyBarPercent(rate) {
  if (rate == null || Number.isNaN(Number(rate))) return 0;
  return Math.min(100, Math.max(0, Number(rate) * 100));
}

/** Fill / value / akzent for occupancy KPI (rate 0–1). */
function getOccupancyVisualColors(rate) {
  if (rate == null || Number.isNaN(Number(rate))) {
    return { fill: "#94a3b8", value: "#64748b", akzent: "#64748b" };
  }
  const r = Number(rate);
  if (r >= 0.85) {
    return { fill: "#22c55e", value: "#16a34a", akzent: "#15803d" };
  }
  if (r >= 0.6) {
    return { fill: "#3b82f6", value: "#2563eb", akzent: "#1d4ed8" };
  }
  return { fill: "#fb923c", value: "#ea580c", akzent: "#c2410c" };
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

function kpiBadgeClass(badge) {
  const b = String(badge || "");
  if (b === "Summary") {
    return "border border-[rgba(157,124,244,0.25)] bg-[rgba(157,124,244,0.12)] text-[#9d7cf4]";
  }
  if (b === "Live") {
    return "border border-[rgba(61,220,132,0.25)] bg-[rgba(61,220,132,0.12)] text-[#3ddc84]";
  }
  return "border border-[rgba(91,156,246,0.25)] bg-[rgba(91,156,246,0.12)] text-[#5b9cf6]";
}

function KpiKarte({
  titel,
  wert,
  hinweis,
  farbe,
  akzent = "#1c2035",
  badge = "Live",
  children,
  wertClassName = "",
  hinweisClassName,
}) {
  const badgeKind =
    badge === "Summary" ? "Summary" : badge === "Live" ? "Live" : "Tenancy";
  const hinweisWrap =
    hinweisClassName ?? "mt-[4px] text-[10px] leading-[1.4] text-[#4a5070]";
  return (
    <div className="relative overflow-hidden rounded-[10px] border border-[#1c2035] bg-[#10121a] p-[14px_15px] transition-colors hover:border-[#242840]">
      <div
        className="absolute left-0 right-0 top-0 h-[2px] rounded-t-[10px]"
        style={{ background: akzent }}
      />
      <div className="mb-[5px] flex items-start justify-between gap-2">
        <div className="text-[9px] font-medium uppercase tracking-[0.5px] text-[#4a5070]">{titel}</div>
        <span
          className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-[6px] py-[2px] text-[9px] font-semibold uppercase tracking-[0.4px] ${kpiBadgeClass(badgeKind)}`}
        >
          {badge}
        </span>
      </div>
      <div
        className={`mb-[4px] font-mono text-[20px] font-medium leading-none text-[#edf0f7] ${wertClassName}`.trim()}
        style={farbe ? { color: farbe } : undefined}
      >
        {wert}
      </div>
      {children}
      {hinweis ? <div className={hinweisWrap}>{hinweis}</div> : null}
    </div>
  );
}

function StatusBadge({ status }) {
  const normalized = (status || "").toLowerCase();
  let label = "Offen";
  const base = "inline-flex items-center rounded-full border px-2 py-[2px] text-[9px] font-semibold ";
  let cls = base;
  if (normalized === "paid") {
    label = "Bezahlt";
    cls += "border-[rgba(61,220,132,0.25)] bg-[rgba(61,220,132,0.12)] text-[#3ddc84]";
  } else if (normalized === "overdue") {
    label = "Überfällig";
    cls += "border-[rgba(255,95,109,0.25)] bg-[rgba(255,95,109,0.12)] text-[#ff5f6d]";
  } else if (normalized === "cancelled") {
    label = "Storniert";
    cls += "border-[#1c2035] bg-[#141720] text-[#8892b0]";
  } else {
    cls += "border-[rgba(245,166,35,0.25)] bg-[rgba(245,166,35,0.12)] text-[#f5a623]";
  }
  return <span className={cls}>{label}</span>;
}

function renderFinanceLineSvg(data) {
  if (!Array.isArray(data) || data.length === 0) return null;
  const W = 560;
  const H = 200;
  const padL = 44;
  const padR = 12;
  const padT = 14;
  const padB = 36;
  const n = data.length;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const maxV = Math.max(
    1,
    ...data.flatMap((d) => [Number(d.revenue) || 0, Number(d.costs) || 0, Number(d.profit) || 0])
  );
  const x = (i) => padL + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v) => padT + innerH - (Math.max(0, v) / maxV) * innerH;
  const linePath = (key) =>
    data
      .map((d, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(Number(d[key]) || 0)}`)
      .join(" ");
  const baseY = padT + innerH;
  const areaPath = (key) => {
    const pts = data.map((d, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(Number(d[key]) || 0)}`).join(" ");
    return `${pts} L ${x(n - 1)} ${baseY} L ${x(0)} ${baseY} Z`;
  };
  const gridYs = [0, 0.25, 0.5, 0.75, 1].map((t) => padT + innerH * (1 - t));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-[220px] w-full" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="ueFinRev" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(91,156,246,0.25)" />
          <stop offset="100%" stopColor="rgba(91,156,246,0)" />
        </linearGradient>
        <linearGradient id="ueFinProf" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(61,220,132,0.18)" />
          <stop offset="100%" stopColor="rgba(61,220,132,0)" />
        </linearGradient>
      </defs>
      {gridYs.map((gy, gi) => (
        <line
          key={gi}
          x1={padL}
          y1={gy}
          x2={W - padR}
          y2={gy}
          stroke="#1c2035"
          strokeWidth="0.5"
          strokeDasharray="3 4"
        />
      ))}
      <path d={areaPath("revenue")} fill="url(#ueFinRev)" />
      <path d={areaPath("profit")} fill="url(#ueFinProf)" />
      <path
        d={linePath("revenue")}
        fill="none"
        stroke="#5b9cf6"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d={linePath("profit")}
        fill="none"
        stroke="#3ddc84"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d={linePath("costs")}
        fill="none"
        stroke="#ff5f6d"
        strokeWidth="1.2"
        strokeDasharray="4 3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {data.map((d, i) => (
        <g key={d.month}>
          <circle cx={x(i)} cy={y(Number(d.revenue) || 0)} r="3" fill="#5b9cf6" />
          <circle cx={x(i)} cy={y(Number(d.profit) || 0)} r="3" fill="#3ddc84" />
          <circle cx={x(i)} cy={y(Number(d.costs) || 0)} r="3" fill="#ff5f6d" />
          <text
            x={x(i)}
            y={H - 10}
            textAnchor="middle"
            style={{ fontFamily: "ui-monospace, monospace", fontSize: 7 }}
            fill={i === n - 1 ? "#5b9cf6" : "#4a5070"}
          >
            {d.month}
          </text>
        </g>
      ))}
    </svg>
  );
}

function renderBelegungBarsSvg(data) {
  if (!Array.isArray(data) || data.length === 0) return null;
  const W = 560;
  const H = 200;
  const padL = 44;
  const padR = 12;
  const padT = 14;
  const padB = 36;
  const n = data.length;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const maxY = Math.max(
    1,
    ...data.map((d) => (Number(d.occupied) || 0) + (Number(d.free) || 0))
  );
  const bw = innerW / n;
  const barW = bw * 0.32;
  const xCenter = (i) => padL + i * bw + bw / 2;
  const y0 = padT + innerH;
  const yh = (v) => (Math.max(0, v) / maxY) * innerH;
  const gridYs = [0, 0.25, 0.5, 0.75, 1].map((t) => padT + innerH * (1 - t));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-[220px] w-full" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="ueBegOcc" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(61,220,132,0.9)" />
          <stop offset="100%" stopColor="rgba(61,220,132,0.5)" />
        </linearGradient>
        <linearGradient id="ueBegFree" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(255,95,109,0.9)" />
          <stop offset="100%" stopColor="rgba(255,95,109,0.4)" />
        </linearGradient>
      </defs>
      {gridYs.map((gy, gi) => (
        <line
          key={gi}
          x1={padL}
          y1={gy}
          x2={W - padR}
          y2={gy}
          stroke="#1c2035"
          strokeWidth="0.5"
          strokeDasharray="3 4"
        />
      ))}
      {data.map((d, i) => {
        const occ = Number(d.occupied) || 0;
        const free = Number(d.free) || 0;
        const cx = xCenter(i);
        const hOcc = yh(occ);
        const hFree = yh(free);
        return (
          <g key={d.month}>
            <rect
              x={cx - barW - 2}
              y={y0 - hOcc}
              width={barW}
              height={hOcc}
              fill="url(#ueBegOcc)"
              rx="2"
            />
            <rect
              x={cx + 2}
              y={y0 - hFree}
              width={barW}
              height={hFree}
              fill="url(#ueBegFree)"
              rx="2"
            />
            <text
              x={cx}
              y={H - 10}
              textAnchor="middle"
              style={{ fontFamily: "ui-monospace, monospace", fontSize: 7 }}
              fill={i === n - 1 ? "#5b9cf6" : "#4a5070"}
            >
              {d.month}
            </text>
          </g>
        );
      })}
    </svg>
  );
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

  const occupancyKpiUi = useMemo(() => {
    if (!portfolio) return null;
    const rate = portfolio.occupancyRate;
    return {
      colors: getOccupancyVisualColors(rate),
      barPct: clampOccupancyBarPercent(rate),
      showSlots:
        typeof portfolio.occupiedSlots === "number" &&
        typeof portfolio.capacitySlots === "number" &&
        portfolio.capacitySlots > 0,
    };
  }, [portfolio]);

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
    <div
      data-testid="admin-dashboard-page"
      className="min-h-screen bg-[#080a0f] text-[#edf0f7]"
    >
      <header className="sticky top-0 z-30 flex h-[50px] items-center justify-between border-b border-[#1c2035] bg-[#0c0e15] px-6 backdrop-blur-md">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="text-[14px] font-semibold text-[#edf0f7]">
            Van<span className="text-[#5b9cf6]">tio</span>
          </span>
          <span className="text-[#4a5070]">·</span>
          <span className="truncate text-[14px] font-medium text-[#edf0f7]">Unternehmensübersicht</span>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <select
            value={`${kpisPeriod.year}-${kpisPeriod.month}`}
            onChange={(e) => {
              const [y, m] = e.target.value.split("-").map(Number);
              setKpisPeriod({ year: y, month: m });
            }}
            className="rounded-[6px] border border-[#1c2035] bg-[#141720] px-3 py-1 font-mono text-[12px] text-[#edf0f7] outline-none"
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
          <span className="inline-flex items-center rounded-[6px] border border-[#1c2035] bg-[#141720] px-3 py-1 text-[11px] text-[#8892b0]">
            Live KPI
          </span>
          <span className="inline-flex items-center rounded-[6px] border border-[rgba(91,156,246,0.25)] bg-[rgba(91,156,246,0.1)] px-3 py-1 text-[11px] font-medium text-[#5b9cf6]">
            Management Ansicht
          </span>
        </div>
      </header>

      <div className="mx-auto max-w-[min(1400px,100%)] space-y-5 px-6 py-5">
        <div className="mb-[10px] flex items-center gap-2">
          <span className="text-[10px] font-medium uppercase tracking-[0.8px] text-[#4a5070]">Kernkennzahlen</span>
          <div className="h-px flex-1 bg-[#1c2035]" />
        </div>

        {portfolio && (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <KpiKarte
              titel="Gesamt-Umsatz"
              wert={formatCurrency(portfolio.totalRevenue)}
              hinweis="Summe aktiver Mietverhältnisse (alle Units)"
              farbe="#edf0f7"
              akzent="#3ddc84"
              badge="Tenancy"
            />
            <KpiKarte
              titel="Vollbelegungs-Potenzial"
              wert={formatCurrency(portfolio.totalFullPotential)}
              hinweis="Co-Living: Zimmerpreise · Apartment: Mieterpreis"
              farbe="#f5a623"
              akzent="#f5a623"
              badge="Tenancy"
            />
            <KpiKarte
              titel="Leerstand"
              wert={formatCurrency(portfolio.totalVacancy)}
              hinweis="Potenzial minus aktueller Umsatz"
              farbe="#ff5f6d"
              akzent="#ff5f6d"
              badge="Tenancy"
            />
            <KpiKarte
              titel="Auslastung %"
              wert={
                portfolio.occupancyRate != null ? formatPercent(portfolio.occupancyRate * 100) : "—"
              }
              hinweis={
                occupancyKpiUi?.showSlots ? (
                  <>
                    <span className="font-medium tabular-nums text-[#5b9cf6]">
                      {portfolio.occupiedSlots} von {portfolio.capacitySlots} Slots belegt
                    </span>
                  </>
                ) : (
                  ""
                )
              }
              hinweisClassName="mt-[4px] text-[10px] leading-[1.4] text-[#5b9cf6]"
              farbe="#5b9cf6"
              akzent="#5b9cf6"
              badge="Tenancy"
            >
              {portfolio.occupancyRate != null && occupancyKpiUi ? (
                <div className="mb-[4px] mt-[7px] h-[2px] w-full overflow-hidden rounded-full bg-[#191c28]">
                  <div
                    className="h-full rounded-full transition-[width] duration-300 ease-out"
                    style={{
                      width: `${occupancyKpiUi.barPct}%`,
                      backgroundColor: "#5b9cf6",
                    }}
                  />
                </div>
              ) : null}
            </KpiKarte>
            <KpiKarte
              titel="Beste Unit"
              wert={
                portfolio.bestUnit
                  ? getPortfolioUnitLabel(portfolio.bestUnit.unit, portfolio.bestUnit.listIndex)
                  : "—"
              }
              hinweis={portfolio.bestUnit ? `${formatCurrency(portfolio.bestUnit.profit)} Gewinn` : ""}
              farbe="#9d7cf4"
              akzent="#9d7cf4"
              wertClassName="!text-[15px]"
              badge="Summary"
            />
          </div>
        )}

        {tenancies === null && !operationsLoadError && (
          <p className="py-2 text-[11px] text-[#8892b0]">Portfolio-KPIs (Tenancies) werden geladen…</p>
        )}

        {portfolio && (
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-[1fr_2fr]">
            <div className="relative overflow-hidden rounded-[10px] border border-[#1c2035] bg-[#10121a] p-[14px_15px] transition-colors hover:border-[#242840]">
              <div className="absolute left-0 right-0 top-0 h-[2px] rounded-t-[10px] bg-[#9d7cf4]" />
              <div className="mb-[5px] flex items-start justify-between gap-2">
                <span className="text-[9px] font-medium uppercase tracking-[0.5px] text-[#4a5070]">Schwächste Unit</span>
                <span className="inline-flex shrink-0 items-center rounded-full border border-[rgba(157,124,244,0.25)] bg-[rgba(157,124,244,0.12)] px-[6px] py-[2px] text-[9px] font-semibold uppercase tracking-[0.4px] text-[#9d7cf4]">
                  Summary
                </span>
              </div>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1 font-mono text-[18px] font-medium leading-snug text-[#9d7cf4]">
                  {portfolio.worstUnit
                    ? getPortfolioUnitLabel(portfolio.worstUnit.unit, portfolio.worstUnit.listIndex)
                    : "—"}
                </div>
                <div className="shrink-0 font-mono text-[12px] text-[#ff5f6d]">
                  {kpis && !kpisLoading && kpis.summary_cards?.trend_vs_previous_month?.revenue_diff_pct != null
                    ? `${kpis.summary_cards.trend_vs_previous_month.revenue_diff_pct >= 0 ? "+" : ""}${kpis.summary_cards.trend_vs_previous_month.revenue_diff_pct}%`
                    : "—"}
                </div>
              </div>
              <p className="mt-[4px] text-[10px] leading-[1.4] text-[#4a5070]">
                {portfolio.worstUnit ? `${formatCurrency(portfolio.worstUnit.profit)} Gewinn` : "Keine Daten"}
              </p>
            </div>

            <div className="relative overflow-hidden rounded-[10px] border border-[#1c2035] bg-[#10121a] p-[14px_15px] transition-colors hover:border-[#242840]">
              <div className="absolute left-0 right-0 top-0 h-[2px] rounded-t-[10px] bg-[#22d3ee]" />
              <div className="mb-[5px] flex items-start justify-between gap-2">
                <span className="text-[9px] font-medium uppercase tracking-[0.5px] text-[#4a5070]">Trend &amp; Prognose</span>
                <span className="inline-flex shrink-0 items-center rounded-full border border-[rgba(91,156,246,0.25)] bg-[rgba(91,156,246,0.12)] px-[6px] py-[2px] text-[9px] font-semibold uppercase tracking-[0.4px] text-[#5b9cf6]">
                  Tenancy
                </span>
              </div>
              <div className="mt-2 grid grid-cols-4 gap-[10px]">
                <div>
                  <p className="mb-[3px] text-[9px] uppercase tracking-[0.4px] text-[#4a5070]">Prognose</p>
                  <p className="font-mono text-[18px] text-[#edf0f7]">
                    {kpis && !kpisLoading && kpis.summary_cards?.forecast_next_month?.revenue != null
                      ? formatCurrency(kpis.summary_cards.forecast_next_month.revenue)
                      : "—"}
                  </p>
                </div>
                <div>
                  <p className="mb-[3px] text-[9px] uppercase tracking-[0.4px] text-[#4a5070]">Ø Umsatz/Zi.</p>
                  <p className="font-mono text-[18px] text-[#3ddc84]">
                    {kpis && !kpisLoading && kpis.summary_cards?.average_revenue_per_room?.value != null
                      ? formatCurrency(kpis.summary_cards.average_revenue_per_room.value)
                      : "—"}
                  </p>
                </div>
                <div>
                  <p className="mb-[3px] text-[9px] uppercase tracking-[0.4px] text-[#4a5070]">Ø Gewinn/Zi.</p>
                  <p className="font-mono text-[18px] text-[#f5a623]">
                    {kpis && !kpisLoading && kpis.summary_cards?.average_profit_per_unit?.value != null
                      ? formatCurrency(kpis.summary_cards.average_profit_per_unit.value)
                      : "—"}
                  </p>
                </div>
                <div>
                  <p className="mb-[3px] text-[9px] uppercase tracking-[0.4px] text-[#4a5070]">Leerstand Tage</p>
                  <p className="font-mono text-[18px] text-[#f5a623]">
                    {kpis && !kpisLoading ? kpis.summary_cards?.vacant_days_this_month?.value ?? "—" : "—"}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {kpisLoading && <p className="py-2 text-[11px] text-[#8892b0]">Lade KPI-Daten…</p>}
        {kpisError && (
          <div className="rounded-[10px] border border-[rgba(255,95,109,0.25)] bg-[rgba(255,95,109,0.08)] px-4 py-3 text-[13px] text-[#ff5f6d]">
            {kpisError}
          </div>
        )}

        <div className="mb-[10px] mt-2 flex items-center gap-2">
          <span className="text-[10px] font-medium uppercase tracking-[0.8px] text-[#4a5070]">Portfolio</span>
          <div className="h-px flex-1 bg-[#1c2035]" />
        </div>

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1.8fr_1fr]">
          <div className="overflow-hidden rounded-[12px] border border-[#1c2035] bg-[#10121a]">
            <div className="flex items-start justify-between border-b border-[#1c2035] px-[15px] py-[12px]">
              <div>
                <p className="text-[13px] font-medium text-[#edf0f7]">Portfolio-Karte</p>
                <p className="mt-0.5 text-[10px] text-[#4a5070]">Standorte &amp; Status (Vorschau)</p>
              </div>
              <p className="text-[10px] text-[#4a5070]">
                {portfolio?.totalUnits ?? units.length} Einheiten · {units.filter((u) => u.latitude != null || u.lat != null).length}{" "}
                auf Karte
              </p>
            </div>
            <div className="bg-[#080a0f]">
              <PortfolioMapSection preview />
            </div>
            <div className="flex flex-wrap items-center gap-[14px] border-t border-[#1c2035] px-[15px] py-[10px]">
              <div className="flex items-center gap-1.5">
                <span className="h-[6px] w-[6px] rounded-full bg-[#3ddc84]" />
                <span className="text-[10px] text-[#4a5070]">Belegt</span>
                <span className="text-[10px] font-medium text-[#edf0f7]">{operationsStats.occupiedRooms}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-[6px] w-[6px] rounded-full bg-[#f5a623]" />
                <span className="text-[10px] text-[#4a5070]">Reserviert</span>
                <span className="text-[10px] font-medium text-[#edf0f7]">{operationsStats.reservedRooms}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-[6px] w-[6px] rounded-full bg-[#ff5f6d]" />
                <span className="text-[10px] text-[#4a5070]">Frei</span>
                <span className="text-[10px] font-medium text-[#edf0f7]">{operationsStats.freeRooms}</span>
              </div>
              <Link
                to="/admin/portfolio-map"
                className="ml-auto rounded-[6px] border border-[#1c2035] bg-[#141720] px-3 py-1 text-[11px] text-[#8892b0] no-underline transition-colors hover:border-[#242840]"
              >
                Portfolio-Karte öffnen →
              </Link>
            </div>
          </div>

          <div className="flex min-h-[320px] flex-col overflow-hidden rounded-[12px] border border-[#1c2035] bg-[#10121a]">
            <div className="border-b border-[#1c2035] px-[15px] py-[12px]">
              <p className="text-[13px] font-medium text-[#edf0f7]">Units</p>
              <p className="text-[10px] text-[#4a5070]">Übersicht nach Auslastung</p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {units.slice(0, 12).map((unit, idx) => {
                const uid = String(unit.id ?? unit.unitId ?? "");
                const occ = (occupancyApi?.units || []).find((o) => String(o.unit_id) === uid);
                const free = occ ? Number(occ.free_rooms ?? 0) : 0;
                const occR = occ ? Number(occ.occupied_rooms ?? 0) : 0;
                const resR = occ ? Number(occ.reserved_rooms ?? 0) : 0;
                let badgeCls =
                  "rounded-full border px-2 py-[2px] text-[9px] font-semibold border-[rgba(61,220,132,0.22)] bg-[rgba(61,220,132,0.12)] text-[#3ddc84]";
                let badgeLabel = "Belegt";
                if (resR > 0 && occR === 0) {
                  badgeCls =
                    "rounded-full border px-2 py-[2px] text-[9px] font-semibold border-[rgba(157,124,244,0.22)] bg-[rgba(157,124,244,0.12)] text-[#9d7cf4]";
                  badgeLabel = "Reserviert";
                } else if (occR > 0 && free > 0) {
                  badgeCls =
                    "rounded-full border px-2 py-[2px] text-[9px] font-semibold border-[rgba(245,166,35,0.22)] bg-[rgba(245,166,35,0.12)] text-[#f5a623]";
                  badgeLabel = "Bald frei";
                } else if (free > 0) {
                  badgeCls =
                    "rounded-full border px-2 py-[2px] text-[9px] font-semibold border-[rgba(255,95,109,0.22)] bg-[rgba(255,95,109,0.12)] text-[#ff5f6d]";
                  badgeLabel = "Frei";
                }
                return (
                  <Link
                    key={uid || idx}
                    to={`/admin/units/${encodeURIComponent(uid)}`}
                    className="flex cursor-pointer items-center justify-between border-b border-[#1c2035] px-[15px] py-[9px] transition-colors hover:bg-[#141720]"
                  >
                    <div className="min-w-0 pr-2">
                      <p className="truncate text-[12px] font-medium text-[#edf0f7]">{getPortfolioUnitLabel(unit, idx)}</p>
                      <p className="truncate text-[10px] text-[#4a5070]">{unit.type || "—"}</p>
                    </div>
                    <span className={badgeCls}>{badgeLabel}</span>
                  </Link>
                );
              })}
            </div>
            <div className="mt-auto grid grid-cols-2 gap-2 border-t border-[#1c2035] px-[15px] py-[10px]">
              <div className="rounded-[7px] bg-[#141720] p-[7px_10px]">
                <p className="mb-[3px] text-[9px] uppercase tracking-[0.4px] text-[#4a5070]">Gewinn</p>
                <p className="font-mono text-[13px] text-[#3ddc84]">{formatCurrency(operationsStats.currentProfit)}</p>
              </div>
              <div className="rounded-[7px] bg-[#141720] p-[7px_10px]">
                <p className="mb-[3px] text-[9px] uppercase tracking-[0.4px] text-[#4a5070]">Leerstand</p>
                <p className="font-mono text-[13px] text-[#f5a623]">{operationsStats.freeRooms} Rooms</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mb-[10px] mt-6 flex items-center gap-2">
          <span className="text-[10px] font-medium uppercase tracking-[0.8px] text-[#4a5070]">Analyse</span>
          <div className="h-px flex-1 bg-[#1c2035]" />
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.3fr_1fr]">
          <div className="flex flex-col gap-3">
            {kpis && !kpisLoading && Array.isArray(kpis.warnings) && kpis.warnings.length > 0 ? (
              <div className="rounded-[12px] border border-[rgba(245,166,35,0.14)] bg-[rgba(245,166,35,0.04)] p-[15px_18px]">
                <h3 className="m-0 text-[12px] font-medium text-[#f5a623]">Warnungen (Units / Liegenschaften)</h3>
                <p className="mt-[2px] text-[10px] text-[#4a5070]">Units mit Leerstand, Kosten ohne Umsatz oder negativem Gewinn.</p>
                <ul className="m-0 list-none p-0">
                  {kpis.warnings.map((w, i) => (
                    <li
                      key={`${w.unit_id}-${i}`}
                      className="flex items-start gap-[10px] border-b border-[rgba(245,166,35,0.07)] py-[8px] last:border-b-0"
                    >
                      <span className="mt-[5px] h-[5px] w-[5px] shrink-0 rounded-full bg-[#f5a623]" />
                      <p className="flex-1 text-[11px] leading-[1.5] text-[#8892b0]">
                        <strong className="font-medium text-[#edf0f7]">{w.unit_title || w.unit_id}</strong>: {w.message}
                      </p>
                      {w.severity === "high" ? (
                        <span className="shrink-0 rounded-[4px] border border-[rgba(255,95,109,0.2)] bg-[rgba(255,95,109,0.12)] px-[6px] py-[2px] text-[9px] font-semibold text-[#ff5f6d]">
                          Hoch
                        </span>
                      ) : (
                        <span className="shrink-0 rounded-[4px] border border-[rgba(245,166,35,0.22)] bg-[rgba(245,166,35,0.12)] px-[6px] py-[2px] text-[9px] font-semibold text-[#f5a623]">
                          Mittel
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {kpis && !kpisLoading && Array.isArray(kpis.assumptions) && kpis.assumptions.length > 0 ? (
              <div className="rounded-[12px] border border-[#1c2035] bg-[#10121a] p-[14px_18px]">
                <h3 className="mb-[10px] text-[10px] font-medium uppercase tracking-[0.7px] text-[#4a5070]">Annahmen &amp; Limitationen</h3>
                <div className="grid grid-cols-1 gap-x-[20px] gap-y-[2px] md:grid-cols-3">
                  {kpis.assumptions.map((a, i) => (
                    <div key={i} className="flex items-start gap-[7px] py-1 text-[10px] leading-[1.5] text-[#4a5070]">
                      <span className="mt-[6px] h-[3px] w-[3px] shrink-0 rounded-full bg-[#4a5070]" />
                      <span>{a}</span>
                    </div>
                  ))}
                </div>
                {kpis.availability ? (
                  <p className="mt-3 text-[10px] leading-relaxed text-[#4a5070]">
                    Verfügbarkeit: Umsatz/Gewinn = {kpis.availability.revenue}; Leerstandstage = {kpis.availability.vacant_days}; Prognose ={" "}
                    {kpis.availability.forecast}; Break-even = {kpis.availability.break_even}.
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="flex flex-col gap-3">
            <div className="rounded-[12px] border border-[#1c2035] bg-[#10121a] p-[16px_18px]">
              <h3 className="m-0 text-[13px] font-medium text-[#edf0f7]">Finanzentwicklung</h3>
              <p className="mt-[2px] text-[10px] text-[#4a5070]">Letzte 6 Monate</p>
              <div className="mt-3 flex flex-wrap gap-3">
                <span className="flex items-center gap-1.5 text-[10px] text-[#4a5070]">
                  <span className="h-[2px] w-[14px] rounded-full bg-[#5b9cf6]" />
                  Umsatz
                </span>
                <span className="flex items-center gap-1.5 text-[10px] text-[#4a5070]">
                  <span className="h-[2px] w-[14px] rounded-full bg-[#3ddc84]" />
                  Gewinn
                </span>
                <span className="flex items-center gap-1.5 text-[10px] text-[#4a5070]">
                  <span className="h-[2px] w-[14px] rounded-full border-t-2 border-dashed border-[#ff5f6d]" />
                  Kosten
                </span>
              </div>
              {monthlyChartsLoading ? (
                <p className="mt-3 text-[11px] text-[#8892b0]">Lade Monatsdaten…</p>
              ) : monthlyChartsError ? (
                <p className="mt-3 text-[11px] text-[#ff5f6d]">{monthlyChartsError}</p>
              ) : financeChartData.length === 0 ? (
                <p className="mt-3 text-[11px] text-[#8892b0]">Keine Daten vorhanden</p>
              ) : (
                renderFinanceLineSvg(financeChartData)
              )}
            </div>

            <div className="rounded-[12px] border border-[#1c2035] bg-[#10121a] p-[16px_18px]">
              <h3 className="m-0 text-[13px] font-medium text-[#edf0f7]">Belegung Rooms</h3>
              <p className="mt-[2px] text-[10px] text-[#4a5070]">Letzte 6 Monate</p>
              <div className="mt-3 flex flex-wrap gap-3">
                <span className="flex items-center gap-1.5 text-[10px] text-[#4a5070]">
                  <span className="h-[7px] w-[7px] rounded-full bg-[#3ddc84]" />
                  Belegt
                </span>
                <span className="flex items-center gap-1.5 text-[10px] text-[#4a5070]">
                  <span className="h-[7px] w-[7px] rounded-full bg-[#ff5f6d]" />
                  Frei
                </span>
              </div>
              {monthlyChartsLoading ? (
                <p className="mt-3 text-[11px] text-[#8892b0]">Lade Monatsdaten…</p>
              ) : monthlyChartsError ? (
                <p className="mt-3 text-[11px] text-[#ff5f6d]">{monthlyChartsError}</p>
              ) : belegungChartData.length === 0 ? (
                <p className="mt-3 text-[11px] text-[#8892b0]">Keine Daten vorhanden</p>
              ) : (
                renderBelegungBarsSvg(belegungChartData)
              )}
            </div>
          </div>
        </div>

        {operationsLoadError && (
          <div className="rounded-[10px] border border-[rgba(255,95,109,0.25)] bg-[rgba(255,95,109,0.08)] px-4 py-3 text-[13px] text-[#ff5f6d]">
            <strong className="font-semibold text-inherit">Fehler beim Laden der Betriebsdaten:</strong> {operationsLoadError}
          </div>
        )}

        <div className="mb-[10px] mt-6 flex items-center gap-2">
          <span className="text-[10px] font-medium uppercase tracking-[0.8px] text-[#4a5070]">Rechnungen · Live</span>
          <div className="h-px flex-1 bg-[#1c2035]" />
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <KpiKarte
            titel="Offene Rechnungen"
            wert={invoiceStats.openCount}
            hinweis={formatCurrency(invoiceStats.openAmount)}
            farbe="#f5a623"
            akzent="#f5a623"
            badge="Live"
          />
          <KpiKarte
            titel="Bezahlte Rechnungen"
            wert={invoiceStats.paidCount}
            hinweis={formatCurrency(invoiceStats.paidAmount)}
            farbe="#3ddc84"
            akzent="#3ddc84"
            badge="Live"
          />
          <KpiKarte
            titel="Überfällige Rechnungen"
            wert={invoiceStats.overdueCount}
            hinweis={formatCurrency(invoiceStats.overdueAmount)}
            farbe="#ff5f6d"
            akzent="#ff5f6d"
            badge="Live"
          />
          <KpiKarte
            titel="Kritische Units"
            wert={operationsStats.criticalUnits}
            hinweis={
              operationsStats.weakestUnit
                ? `Schwächste Unit: ${weakestUnitDisplayLabel || operationsStats.weakestUnit.unitId}`
                : "Keine kritischen Units erkannt"
            }
            farbe="#9d7cf4"
            akzent="#9d7cf4"
            badge="Live"
          />
        </div>

        <div className="rounded-[12px] border border-[#1c2035] bg-[#10121a] p-[15px_18px]">
          <h3 className="m-0 text-[13px] font-medium text-[#edf0f7]">Kritische Hinweise</h3>
          <p className="mb-[12px] mt-[2px] text-[10px] text-[#4a5070]">Die wichtigsten Auffälligkeiten auf einen Blick.</p>
          <div className="grid grid-cols-2 gap-2">
            {systemWarnings.map((warning, index) => {
              const isDanger = warning.level === "danger";
              const box = isDanger
                ? "border border-[rgba(255,95,109,0.18)] bg-[rgba(255,95,109,0.05)]"
                : "border border-[rgba(245,166,35,0.18)] bg-[rgba(245,166,35,0.05)]";
              const title = isDanger ? "text-[11px] font-semibold text-[#ff5f6d]" : "text-[11px] font-semibold text-[#f5a623]";
              return (
                <div key={`${warning.title}-${index}`} className={`rounded-[8px] p-[11px_14px] ${box}`}>
                  <div className={`mb-[4px] ${title}`}>{warning.title}</div>
                  <div className="text-[10px] leading-[1.5] text-[#4a5070]">{warning.text}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="overflow-hidden rounded-[12px] border border-[#1c2035] bg-[#10121a]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1c2035] px-[18px] py-[13px]">
            <div>
              <h3 className="m-0 text-[13px] font-medium text-[#edf0f7]">Letzte Rechnungen</h3>
              <p className="mt-[2px] text-[10px] text-[#4a5070]">Die zuletzt erfassten Rechnungen aus deinem Billing-Modul.</p>
            </div>
            <Link
              to="/admin/invoices"
              className="inline-block whitespace-nowrap rounded-[6px] border border-[rgba(91,156,246,0.28)] bg-[rgba(91,156,246,0.1)] px-[14px] py-[5px] text-[11px] font-medium text-[#5b9cf6] no-underline transition-colors hover:border-[rgba(91,156,246,0.4)]"
            >
              Alle Rechnungen →
            </Link>
          </div>
          {invoiceLoading ? (
            <p className="px-[18px] py-4 text-[11px] text-[#8892b0]">Rechnungen werden geladen...</p>
          ) : invoiceError ? (
            <p className="px-[18px] py-4 text-[11px] text-[#ff5f6d]">{invoiceError}</p>
          ) : latestInvoices.length === 0 ? (
            <p className="px-[18px] py-4 text-[11px] text-[#8892b0]">Noch keine Rechnungen vorhanden.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="text-left">
                    <th className="border-b border-[#1c2035] px-[18px] py-2 text-left text-[9px] font-medium uppercase tracking-[0.6px] text-[#4a5070]">
                      Rechnungsnummer
                    </th>
                    <th className="border-b border-[#1c2035] px-[18px] py-2 text-[9px] font-medium uppercase tracking-[0.6px] text-[#4a5070]">
                      Betrag
                    </th>
                    <th className="border-b border-[#1c2035] px-[18px] py-2 text-[9px] font-medium uppercase tracking-[0.6px] text-[#4a5070]">
                      Status
                    </th>
                    <th className="border-b border-[#1c2035] px-[18px] py-2 text-[9px] font-medium uppercase tracking-[0.6px] text-[#4a5070]">
                      Rechnungsdatum
                    </th>
                    <th className="border-b border-[#1c2035] px-[18px] py-2 text-[9px] font-medium uppercase tracking-[0.6px] text-[#4a5070]">
                      Fälligkeitsdatum
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {latestInvoices.map((invoice, invIdx) => {
                    const overdue = String(invoice.status || "").toLowerCase() === "overdue";
                    return (
                      <tr
                        key={invoice.id}
                        className={`cursor-pointer border-b border-[#1c2035] transition-colors hover:bg-[#141720] ${invIdx === latestInvoices.length - 1 ? "border-b-0" : ""}`}
                      >
                        <td className="px-[18px] py-[10px]">
                          <Link
                            to={`/admin/invoices/${invoice.id}`}
                            className="font-mono text-[11px] text-[#5b9cf6] no-underline hover:underline"
                          >
                            {invoice.invoice_number}
                          </Link>
                        </td>
                        <td className="px-[18px] py-[10px] font-mono text-[12px] font-medium text-[#edf0f7]">
                          {formatCurrency(invoice.amount)}
                        </td>
                        <td className="px-[18px] py-[10px] text-[12px] text-[#8892b0]">
                          <StatusBadge status={invoice.status} />
                        </td>
                        <td className="px-[18px] py-[10px] font-mono text-[11px] text-[#4a5070]">
                          {formatDate(invoice.issue_date)}
                        </td>
                        <td
                          className={`px-[18px] py-[10px] font-mono text-[11px] ${overdue ? "text-[#ff5f6d]" : "text-[#4a5070]"}`}
                        >
                          {formatDate(invoice.due_date)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
