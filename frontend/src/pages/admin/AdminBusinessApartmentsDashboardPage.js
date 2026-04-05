import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ResponsiveContainer,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
} from "recharts";
import {
  fetchAdminUnits,
  fetchAdminRooms,
  fetchAdminTenanciesAll,
  fetchAdminProfit,
  normalizeUnit,
  normalizeRoom,
  sanitizeClientErrorMessage,
} from "../../api/adminData";
import {
  getUnitOccupancyStatus,
  isLandlordContractLeaseStarted,
  isTenancyActiveByDates,
  isTenancyReservedSlot,
  isTenancyFuture,
} from "../../utils/unitOccupancyStatus";

function roundCurrency(value) {
  return Math.round(Number(value || 0));
}

function formatCurrency(value) {
  return `CHF ${roundCurrency(value).toLocaleString("de-CH")}`;
}

function formatChfOrDash(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "-";
  }
  return formatCurrency(value);
}

function formatPercent(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

/** Readable label for lists/cards; persisted short ID when present; UUID only as last resort. */
function apartmentDisplayLabel(unit) {
  if (!unit) return "—";
  const shortId = String(unit.shortUnitId ?? unit.short_unit_id ?? "").trim();
  const addr = String(unit.address ?? "").trim();
  const city = String(unit.city ?? "").trim();
  const loc = [addr, city].filter(Boolean).join(", ");
  if (shortId && loc) return `${shortId} · ${loc}`;
  if (shortId) return shortId;
  if (addr && city) return `${addr}, ${city}`;
  if (addr) return addr;
  const title = String(unit.title ?? unit.name ?? "").trim();
  if (title) return title;
  const id = String(unit.unitId ?? unit.id ?? "").trim();
  return id || "—";
}

function HeroCard({ title, value, subtitle, trend = null }) {
  const cfgByTitle = {
    "Aktueller Umsatz": { bar: "#f5a623", valueClass: "text-[20px] text-[#f5a623]" },
    "Gewinn aktuell": { bar: "#3ddc84", valueClass: "text-[20px] text-[#3ddc84]" },
    "Aktuelle Ausgaben": { bar: "#ff5f6d", valueClass: "text-[20px] text-[#ff5f6d]" },
    "Belegt in %": { bar: "#5b9cf6", valueClass: "text-[20px] text-[#5b9cf6]" },
  };
  const cfg = cfgByTitle[title] || {
    bar: "#f5a623",
    valueClass: "text-[20px] text-[#edf0f7]",
  };
  const occPct =
    title === "Belegt in %"
      ? Math.max(0, Math.min(100, parseFloat(String(value)) || 0))
      : null;

  return (
    <div className="relative overflow-hidden rounded-[10px] border border-[#1c2035] bg-[#10121a] p-[13px_15px] transition-colors hover:border-[#242840]">
      <div
        className="absolute left-0 right-0 top-0 h-[2px] rounded-t-[10px]"
        style={{ background: cfg.bar }}
      />
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="mb-[4px] text-[9px] font-medium uppercase tracking-[0.5px] text-[#4a5070]">{title}</p>
          <p className={`mb-[4px] font-mono font-medium leading-none ${cfg.valueClass}`}>{value}</p>
          <p className="text-[10px] leading-[1.4] text-[#4a5070]">{subtitle}</p>
          {occPct != null ? (
            <div className="mb-[4px] mt-[8px] h-[3px] rounded-full bg-[#191c28]">
              <div
                className="h-full rounded-full bg-[#5b9cf6]"
                style={{ width: `${occPct}%` }}
              />
            </div>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="rounded-full border border-[rgba(61,220,132,0.25)] bg-[rgba(61,220,132,0.12)] px-[6px] py-[2px] text-[9px] font-semibold uppercase tracking-[0.4px] text-[#3ddc84]">
            Live
          </span>
          {trend ? (
            <span
              className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold ${
                trend.positive
                  ? "border-[rgba(61,220,132,0.25)] bg-[rgba(61,220,132,0.1)] text-[#3ddc84]"
                  : "border-[rgba(255,95,109,0.25)] bg-[rgba(255,95,109,0.1)] text-[#ff5f6d]"
              }`}
            >
              {trend.label}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function SectionCard({ title, subtitle, children, rightSlot = null }) {
  return (
    <div className="overflow-hidden rounded-[12px] border border-[#1c2035] bg-[#10121a]">
      <div className="flex items-start justify-between gap-3 border-b border-[#1c2035] px-[16px] py-[13px]">
        <div className="min-w-0">
          <h3 className="text-[13px] font-medium text-[#edf0f7]">{title}</h3>
          {subtitle ? (
            <p className="mt-[2px] text-[10px] text-[#4a5070]">{subtitle}</p>
          ) : null}
        </div>
        {rightSlot}
      </div>
      <div className="px-[16px] py-[14px]">{children}</div>
    </div>
  );
}

function SmallStatCard({ label, value, hint, valueClassName = "text-[20px] text-[#edf0f7]" }) {
  const barByLabel = {
    "Apartments gesamt": "#5b9cf6",
    "Belegte Apartments": "#3ddc84",
    "Freie Apartments": "#ff5f6d",
  };
  const bar = barByLabel[label] || "#5b9cf6";

  return (
    <div className="relative overflow-hidden rounded-[10px] border border-[#1c2035] bg-[#10121a] p-[13px_15px] transition-colors hover:border-[#242840]">
      <div
        className="absolute left-0 right-0 top-0 h-[2px] rounded-t-[10px]"
        style={{ background: bar }}
      />
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="mb-[4px] text-[9px] font-medium uppercase tracking-[0.5px] text-[#4a5070]">{label}</p>
          <p className={`mb-[4px] font-mono font-medium leading-none ${valueClassName}`}>{value}</p>
          {hint ? <p className="text-[10px] leading-[1.4] text-[#4a5070]">{hint}</p> : null}
        </div>
        <span className="shrink-0 rounded-full border border-[rgba(61,220,132,0.25)] bg-[rgba(61,220,132,0.12)] px-[6px] py-[2px] text-[9px] font-semibold uppercase tracking-[0.4px] text-[#3ddc84]">
          Live
        </span>
      </div>
    </div>
  );
}

function RankingBadge({ value, type }) {
  const styles = {
    success:
      "border border-[rgba(61,220,132,0.2)] bg-[rgba(61,220,132,0.1)] text-[#3ddc84]",
    warning:
      "border border-[rgba(245,166,35,0.2)] bg-[rgba(245,166,35,0.1)] text-[#f5a623]",
    danger:
      "border border-[rgba(255,95,109,0.2)] bg-[rgba(255,95,109,0.1)] text-[#ff5f6d]",
    neutral: "border border-[#1c2035] bg-[#141720] text-[#8892b0]",
    blue: "border border-[rgba(91,156,246,0.25)] bg-[rgba(91,156,246,0.12)] text-[#5b9cf6]",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-[2px] text-[9px] font-semibold ${styles[type]}`}
    >
      {value}
    </span>
  );
}

function FilterSelect({ label, value, onChange, children }) {
  return (
    <div className="flex min-w-[160px] flex-col gap-[3px]">
      <label className="text-[9px] font-medium uppercase tracking-[0.5px] text-[#4a5070]">{label}</label>
      <select
        value={value}
        onChange={onChange}
        className="w-full cursor-pointer appearance-none rounded-[6px] border border-[#1c2035] bg-[#141720] px-[10px] py-[5px] font-['DM_Sans'] text-[12px] text-[#edf0f7] outline-none"
      >
        {children}
      </select>
    </div>
  );
}

function getTrendLabel(current, previous) {
  if (!previous || previous === 0) return { label: "Neu", positive: true };
  const diff = ((current - previous) / previous) * 100;
  const sign = diff >= 0 ? "+" : "";
  return {
    label: `${sign}${diff.toFixed(1)}% vs. Vormonat`,
    positive: diff >= 0,
  };
}

function lastNMonths(n) {
  const out = [];
  const d = new Date();
  for (let i = n - 1; i >= 0; i -= 1) {
    const dt = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push({ year: dt.getFullYear(), month: dt.getMonth() + 1 });
  }
  return out;
}

/** Business Apartments: klassische Apartments (not Co-Living). Legacy label still accepted. */
function isBusinessApartment(u) {
  const t = String(u?.type || "").trim();
  return t === "Apartment" || t === "Business Apartment";
}

/**
 * Month buckets for charts/KPIs by Zeitraum filter (no backend change).
 * all → rolling last 6 months (existing behavior).
 */
function monthsForPeriod(period) {
  const d = new Date();
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  if (period === "thisMonth") return [{ year: y, month: m }];
  if (period === "lastMonth") {
    const dt = new Date(y, m - 2, 1);
    return [{ year: dt.getFullYear(), month: dt.getMonth() + 1 }];
  }
  if (period === "year") {
    return Array.from({ length: 12 }, (_, i) => ({ year: y, month: i + 1 }));
  }
  return lastNMonths(6);
}

/**
 * Same semantics as getUnitOccupancyStatus for non–Co-Living units, evaluated on month-end day.
 */
function unitOccupancyKeyAsOf(unit, tenancies, asOfIso) {
  const uid = String(unit.unitId || unit.id || "");
  const unitTenancies = (tenancies || []).filter(
    (t) => String(t.unit_id || t.unitId) === uid
  );
  let hasActive = false;
  let hasFuture = false;
  for (const t of unitTenancies) {
    if (isTenancyActiveByDates(t, asOfIso)) hasActive = true;
    if (isTenancyReservedSlot(t, asOfIso) || isTenancyFuture(t, asOfIso)) {
      hasFuture = true;
    }
  }
  if (hasActive) return "belegt";
  if (hasFuture) return "reserviert";
  return "frei";
}

function monthEndDateString(year, month) {
  const lastDay = new Date(year, month, 0);
  const y = lastDay.getFullYear();
  const m = String(lastDay.getMonth() + 1).padStart(2, "0");
  const day = String(lastDay.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function occupancyRateFromChartRow(row) {
  const occ = Number(row?.occupied || 0);
  const free = Number(row?.free || 0);
  const t = occ + free;
  return t > 0 ? (occ / t) * 100 : 0;
}

function AdminBusinessApartmentsDashboardPage() {
  const [selectedPeriod, setSelectedPeriod] = useState("thisMonth");
  const [selectedPlace, setSelectedPlace] = useState("all");
  const [selectedUnitId, setSelectedUnitId] = useState("all");

  const [units, setUnits] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [tenancies, setTenancies] = useState([]);
  const [chartsLoading, setChartsLoading] = useState(true);
  const [chartsError, setChartsError] = useState("");
  const [financeChartData, setFinanceChartData] = useState([]);
  const [occupancyChartData, setOccupancyChartData] = useState([]);
  const [latestUnitProfit, setLatestUnitProfit] = useState({});

  useEffect(() => {
    Promise.all([
      fetchAdminUnits()
        .then((data) => (Array.isArray(data) ? data.map(normalizeUnit) : []))
        .catch(() => []),
      fetchAdminRooms()
        .then((data) => (Array.isArray(data) ? data.map(normalizeRoom) : []))
        .catch(() => []),
      fetchAdminTenanciesAll().catch(() => []),
    ]).then(([u, r, t]) => {
      setUnits(u);
      setRooms(r);
      setTenancies(t);
    });
  }, []);

  const businessUnits = useMemo(() => {
    return units.filter((unit) => isBusinessApartment(unit));
  }, [units]);

  const placeOptions = useMemo(() => {
    const places = [
      ...new Set(businessUnits.map((unit) => unit.place).filter(Boolean)),
    ];
    return places.sort((a, b) => a.localeCompare(b));
  }, [businessUnits]);

  const filteredUnits = useMemo(() => {
    return businessUnits.filter((unit) => {
      const placeOk = selectedPlace === "all" || unit.place === selectedPlace;
      const unitOk = selectedUnitId === "all" || unit.unitId === selectedUnitId;
      return placeOk && unitOk;
    });
  }, [businessUnits, selectedPlace, selectedUnitId]);

  useEffect(() => {
    let cancelled = false;
    if (filteredUnits.length === 0) {
      setFinanceChartData([]);
      setOccupancyChartData([]);
      setLatestUnitProfit({});
      setChartsLoading(false);
      setChartsError("");
      return undefined;
    }
    const allowedIds = new Set(filteredUnits.map((u) => String(u.unitId || u.id)));
    const months = monthsForPeriod(selectedPeriod);
    setChartsLoading(true);
    setChartsError("");
    Promise.all(months.map(({ year, month }) => fetchAdminProfit({ year, month })))
      .then((profits) => {
        if (cancelled) return;
        const finance = months.map((m, idx) => {
          const p = profits[idx];
          const label = new Date(m.year, m.month - 1, 1).toLocaleDateString("de-CH", {
            month: "short",
          });
          let revenue = 0;
          let costs = 0;
          let profit = 0;
          for (const u of p?.units || []) {
            if (allowedIds.has(String(u.unit_id))) {
              revenue += Number(u.revenue || 0);
              costs += Number(u.costs || 0);
              profit += Number(u.profit || 0);
            }
          }
          return { month: label, revenue, costs, profit };
        });
        const occRows = months.map((m) => {
          const asOfIso = monthEndDateString(m.year, m.month);
          const label = new Date(m.year, m.month - 1, 1).toLocaleDateString("de-CH", {
            month: "short",
          });
          let occupied = 0;
          let free = 0;
          for (const unit of filteredUnits) {
            const key = unitOccupancyKeyAsOf(unit, tenancies, asOfIso);
            if (key === "belegt") occupied += 1;
            else free += 1;
          }
          return { month: label, occupied, free };
        });
        const profitByUnitId = {};
        if (selectedPeriod === "year") {
          for (const p of profits) {
            for (const row of p?.units || []) {
              const id = String(row.unit_id);
              if (!allowedIds.has(id)) continue;
              if (!profitByUnitId[id]) {
                profitByUnitId[id] = { revenue: 0, costs: 0, profit: 0 };
              }
              profitByUnitId[id].revenue += Number(row.revenue || 0);
              profitByUnitId[id].costs += Number(row.costs || 0);
              profitByUnitId[id].profit += Number(row.profit || 0);
            }
          }
        } else {
          const lastIdx = months.length - 1;
          const lastProfit = profits[lastIdx];
          for (const row of lastProfit?.units || []) {
            const id = String(row.unit_id);
            if (allowedIds.has(id)) {
              profitByUnitId[id] = {
                revenue: row.revenue != null ? Number(row.revenue) : null,
                costs: row.costs != null ? Number(row.costs) : null,
                profit: row.profit != null ? Number(row.profit) : null,
              };
            }
          }
        }
        setLatestUnitProfit(profitByUnitId);
        setFinanceChartData(finance);
        setOccupancyChartData(occRows);
        setChartsLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        console.error(e);
        setChartsError(
          sanitizeClientErrorMessage(e.message, "Monatsdaten konnten nicht geladen werden.")
        );
        setFinanceChartData([]);
        setOccupancyChartData([]);
        setLatestUnitProfit({});
        setChartsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filteredUnits, selectedPeriod, tenancies]);

  const dashboard = useMemo(() => {
    let totalApartments = 0;
    let occupiedApartments = 0;
    let freeApartments = 0;

    const performance = filteredUnits.map((unit) => {
      const uid = String(unit.id ?? "");
      const uAlt = String(unit.unitId ?? "");
      const finRaw =
        latestUnitProfit[uid] || latestUnitProfit[uAlt] || {
          revenue: null,
          costs: null,
          profit: null,
        };
      const fin = !isLandlordContractLeaseStarted(unit)
        ? { revenue: null, costs: null, profit: null }
        : finRaw;

      const occ = getUnitOccupancyStatus(unit, rooms, tenancies);
      const occupied = occ === "belegt";

      totalApartments += 1;
      if (occupied) occupiedApartments += 1;
      if (!occupied) freeApartments += 1;

      return {
        unitId: unit.unitId,
        displayLabel: apartmentDisplayLabel(unit),
        place: unit.place,
        title: unit.shortUnitId || unit.short_unit_id || unit.title || unit.unitId,
        revenue: fin.revenue,
        costs: fin.costs,
        profit: fin.profit,
        occupied,
      };
    });

    const occupiedRate =
      totalApartments > 0 ? (occupiedApartments / totalApartments) * 100 : 0;

    const ranked = [...performance].sort((a, b) => {
      const pb = b.profit;
      const pa = a.profit;
      if (pb == null && pa == null) return 0;
      if (pb == null) return -1;
      if (pa == null) return 1;
      return pb - pa;
    });

    return {
      totalApartments,
      occupiedApartments,
      freeApartments,
      occupiedRate,
      bestUnit: ranked[0] || null,
      worstUnit: ranked[ranked.length - 1] || null,
      performance: ranked,
    };
  }, [filteredUnits, latestUnitProfit, rooms, tenancies]);

  const revenueTrend = useMemo(() => {
    if (financeChartData.length < 2) return null;
    const cur = financeChartData[financeChartData.length - 1];
    const prev = financeChartData[financeChartData.length - 2];
    return getTrendLabel(cur.revenue, prev.revenue);
  }, [financeChartData]);

  const profitTrend = useMemo(() => {
    if (financeChartData.length < 2) return null;
    const cur = financeChartData[financeChartData.length - 1];
    const prev = financeChartData[financeChartData.length - 2];
    return getTrendLabel(cur.profit, prev.profit);
  }, [financeChartData]);

  const costTrend = useMemo(() => {
    if (financeChartData.length < 2) return null;
    const cur = financeChartData[financeChartData.length - 1];
    const prev = financeChartData[financeChartData.length - 2];
    return getTrendLabel(cur.costs, prev.costs);
  }, [financeChartData]);

  const occupancyTrend = useMemo(() => {
    if (occupancyChartData.length < 2) return null;
    const cur = occupancyChartData[occupancyChartData.length - 1];
    const prev = occupancyChartData[occupancyChartData.length - 2];
    return getTrendLabel(occupancyRateFromChartRow(cur), occupancyRateFromChartRow(prev));
  }, [occupancyChartData]);

  /** KPI hero row: Jahreswerte summiert; sonst letzter Monat der gewählten Periode. */
  const heroFinance = useMemo(() => {
    if (!financeChartData.length) return null;
    if (selectedPeriod === "year") {
      return financeChartData.reduce(
        (acc, row) => ({
          revenue: acc.revenue + row.revenue,
          costs: acc.costs + row.costs,
          profit: acc.profit + row.profit,
        }),
        { revenue: 0, costs: 0, profit: 0 }
      );
    }
    return financeChartData[financeChartData.length - 1];
  }, [financeChartData, selectedPeriod]);

  const financeChartTitle = useMemo(() => {
    if (selectedPeriod === "year") return "Finanzentwicklung dieses Jahr";
    if (selectedPeriod === "all") return "Finanzentwicklung letzte 6 Monate";
    return "Finanzentwicklung";
  }, [selectedPeriod]);

  const financeChartSubtitle = useMemo(() => {
    if (selectedPeriod === "year") {
      return "Umsatz, Kosten und Gewinn pro Monat (laufendes Jahr)";
    }
    if (selectedPeriod === "all") {
      return "Umsatz, Kosten und Gewinn im zeitlichen Verlauf (letzte 6 Monate)";
    }
    if (selectedPeriod === "thisMonth") {
      return "Umsatz, Kosten und Gewinn (aktueller Monat)";
    }
    if (selectedPeriod === "lastMonth") {
      return "Umsatz, Kosten und Gewinn (Vormonat)";
    }
    return "Umsatz, Kosten und Gewinn im zeitlichen Verlauf";
  }, [selectedPeriod]);

  const occupancyChartTitle = useMemo(() => {
    if (selectedPeriod === "year") return "Belegung Apartments dieses Jahr";
    if (selectedPeriod === "all") return "Belegung Apartments letzte 6 Monate";
    return "Belegung Apartments";
  }, [selectedPeriod]);

  const occupancyChartSubtitle = useMemo(() => {
    if (selectedPeriod === "year") {
      return "Belegte und freie Apartments pro Monatsende (einheitliche Logik)";
    }
    if (selectedPeriod === "all") {
      return "Belegte und freie Apartments pro Monatsende (letzte 6 Monate)";
    }
    if (selectedPeriod === "thisMonth") {
      return "Belegte und freie Apartments (aktueller Monat, Monatsende)";
    }
    if (selectedPeriod === "lastMonth") {
      return "Belegte und freie Apartments (Vormonat, Monatsende)";
    }
    return "Belegte und freie Apartments im Verlauf";
  }, [selectedPeriod]);

  const chartAxisTick = { fill: "#4a5070", fontSize: 9, fontFamily: "DM Mono, monospace" };
  const chartTooltipStyle = {
    background: "#10121a",
    border: "1px solid #1c2035",
    borderRadius: 8,
    color: "#edf0f7",
    fontSize: 11,
  };

  return (
    <div className="-m-6 min-h-screen bg-[#080a0f] p-6 md:p-8">
      <div className="mx-auto max-w-[1800px] space-y-[14px]">
        <div className="sticky top-0 z-30 flex h-[50px] items-center justify-between border-b border-[#1c2035] bg-[#0c0e15] px-6 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <span className="font-semibold text-[#edf0f7]">
              Van<span className="text-[#5b9cf6]">tio</span>
            </span>
            <span className="text-[#4a5070]">·</span>
            <span className="text-[14px] font-medium text-[#edf0f7]">Business-Apartment Dashboard</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-[6px] border border-[#1c2035] bg-[#141720] px-3 py-1 text-[11px] text-[#8892b0]">
              Live KPI
            </span>
            <span className="rounded-[6px] border border-[rgba(91,156,246,0.28)] bg-[rgba(91,156,246,0.1)] px-[14px] py-[5px] text-[11px] font-medium text-[#5b9cf6]">
              Business Apartments only
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-[12px] rounded-[10px] border border-[#1c2035] bg-[#10121a] px-[16px] py-[12px]">
          <FilterSelect
            label="Zeitraum"
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value)}
          >
            <option value="lastMonth">Letzter Monat</option>
            <option value="thisMonth">Dieser Monat</option>
            <option value="year">Dieses Jahr</option>
            <option value="all">Alle Zeit</option>
          </FilterSelect>

          <div className="hidden h-[32px] w-px bg-[#1c2035] sm:block" />

          <FilterSelect
            label="Ort"
            value={selectedPlace}
            onChange={(e) => {
              setSelectedPlace(e.target.value);
              setSelectedUnitId("all");
            }}
          >
            <option value="all">Alle Orte</option>
            {placeOptions.map((place) => (
              <option key={place} value={place}>
                {place}
              </option>
            ))}
          </FilterSelect>

          <div className="hidden h-[32px] w-px bg-[#1c2035] sm:block" />

          <FilterSelect
            label="Apartment"
            value={selectedUnitId}
            onChange={(e) => setSelectedUnitId(e.target.value)}
          >
            <option value="all">Alle Apartments</option>
            {businessUnits
              .filter(
                (unit) =>
                  selectedPlace === "all" || unit.place === selectedPlace
              )
              .map((unit) => (
                <option key={unit.unitId} value={unit.unitId}>
                  {apartmentDisplayLabel(unit)}
                </option>
              ))}
          </FilterSelect>

          <div className="ml-auto flex items-center gap-[6px]">
            <span className="h-[6px] w-[6px] rounded-full bg-[#3ddc84]" />
            <span className="text-[11px] text-[#4a5070]">Live</span>
          </div>
        </div>

        <div>
          <div className="mb-[10px] flex items-center gap-2">
            <span className="text-[10px] font-medium uppercase tracking-[0.8px] text-[#4a5070]">
              Aktuell · Live
            </span>
            <div className="h-px flex-1 bg-[#1c2035]" />
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <HeroCard
              title="Aktueller Umsatz"
              value={
                chartsLoading || chartsError || !heroFinance
                  ? "-"
                  : formatCurrency(heroFinance.revenue)
              }
              subtitle="Umsatz aus aktuell belegten Apartments"
              trend={revenueTrend}
            />
            <HeroCard
              title="Gewinn aktuell"
              value={
                chartsLoading || chartsError || !heroFinance
                  ? "-"
                  : formatCurrency(heroFinance.profit)
              }
              subtitle="Umsatz minus laufende Ausgaben"
              trend={profitTrend}
            />
            <HeroCard
              title="Aktuelle Ausgaben"
              value={
                chartsLoading || chartsError || !heroFinance
                  ? "-"
                  : formatCurrency(heroFinance.costs)
              }
              subtitle="Miete, Nebenkosten und Reinigung"
              trend={costTrend}
            />
            <HeroCard
              title="Belegt in %"
              value={formatPercent(dashboard.occupiedRate)}
              subtitle="Aktuelle Auslastung über alle Apartments"
              trend={occupancyTrend}
            />
          </div>
        </div>

        <div>
          <div className="mb-[10px] flex items-center gap-2">
            <span className="text-[10px] font-medium uppercase tracking-[0.8px] text-[#4a5070]">Analyse</span>
            <div className="h-px flex-1 bg-[#1c2035]" />
          </div>
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            <SectionCard title={financeChartTitle} subtitle={financeChartSubtitle}>
              {chartsLoading ? (
                <p className="py-8 text-[12px] text-[#4a5070]">Lade Monatsdaten…</p>
              ) : chartsError ? (
                <p className="py-8 text-[12px] text-[#ff5f6d]">{chartsError}</p>
              ) : financeChartData.length === 0 ? (
                <p className="py-8 text-[12px] text-[#4a5070]">Keine Daten vorhanden</p>
              ) : (
                <>
                  <div className="h-[420px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={financeChartData}>
                        <defs>
                          <linearGradient id="baFinUmsatz" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="rgba(245,166,35,0.85)" />
                            <stop offset="100%" stopColor="rgba(245,166,35,0.4)" />
                          </linearGradient>
                          <linearGradient id="baFinAusgaben" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="rgba(74,80,112,0.7)" />
                            <stop offset="100%" stopColor="rgba(74,80,112,0.3)" />
                          </linearGradient>
                          <linearGradient id="baFinGewinn" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="rgba(61,220,132,0.85)" />
                            <stop offset="100%" stopColor="rgba(61,220,132,0.4)" />
                          </linearGradient>
                        </defs>
                        <CartesianGrid
                          stroke="#1c2035"
                          strokeDasharray="3 4"
                          strokeWidth={0.5}
                          vertical={false}
                        />
                        <XAxis
                          dataKey="month"
                          tick={(props) => {
                            const { x, y, payload, index } = props;
                            const last = index === financeChartData.length - 1;
                            return (
                              <text
                                x={x}
                                y={y}
                                dy={12}
                                textAnchor="middle"
                                fill={last ? "#5b9cf6" : "#4a5070"}
                                fontSize={9}
                                fontFamily="DM Mono, monospace"
                              >
                                {payload.value}
                              </text>
                            );
                          }}
                          axisLine={{ stroke: "#1c2035" }}
                          tickLine={{ stroke: "#1c2035" }}
                        />
                        <YAxis
                          tick={chartAxisTick}
                          axisLine={{ stroke: "#1c2035" }}
                          tickLine={{ stroke: "#1c2035" }}
                        />
                        <Tooltip
                          formatter={(value) => `CHF ${value.toLocaleString()}`}
                          contentStyle={chartTooltipStyle}
                        />
                        <Bar
                          name="Umsatz"
                          dataKey="revenue"
                          fill="url(#baFinUmsatz)"
                          radius={[4, 4, 0, 0]}
                        />
                        <Bar
                          name="Ausgaben"
                          dataKey="costs"
                          fill="url(#baFinAusgaben)"
                          radius={[4, 4, 0, 0]}
                        />
                        <Bar
                          name="Gewinn"
                          dataKey="profit"
                          fill="url(#baFinGewinn)"
                          radius={[4, 4, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-[10px] flex flex-wrap gap-[12px]">
                    <span className="flex items-center gap-[4px] text-[10px] text-[#4a5070]">
                      <span className="h-[7px] w-[7px] rounded-full bg-[#f5a623]" />
                      Umsatz
                    </span>
                    <span className="flex items-center gap-[4px] text-[10px] text-[#4a5070]">
                      <span className="h-[7px] w-[7px] rounded-full bg-[#4a5070]" />
                      Ausgaben
                    </span>
                    <span className="flex items-center gap-[4px] text-[10px] text-[#4a5070]">
                      <span className="h-[7px] w-[7px] rounded-full bg-[#3ddc84]" />
                      Gewinn
                    </span>
                  </div>
                </>
              )}
            </SectionCard>

            <SectionCard title={occupancyChartTitle} subtitle={occupancyChartSubtitle}>
              {chartsLoading ? (
                <p className="py-8 text-[12px] text-[#4a5070]">Lade Monatsdaten…</p>
              ) : chartsError ? (
                <p className="py-8 text-[12px] text-[#ff5f6d]">{chartsError}</p>
              ) : occupancyChartData.length === 0 ? (
                <p className="py-8 text-[12px] text-[#4a5070]">Keine Daten vorhanden</p>
              ) : (
                <>
                  <div className="h-[420px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={occupancyChartData}>
                        <defs>
                          <linearGradient id="baOccBelegt" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="rgba(61,220,132,0.9)" />
                            <stop offset="100%" stopColor="rgba(61,220,132,0.45)" />
                          </linearGradient>
                          <linearGradient id="baOccFrei" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="rgba(255,95,109,0.9)" />
                            <stop offset="100%" stopColor="rgba(255,95,109,0.4)" />
                          </linearGradient>
                        </defs>
                        <CartesianGrid
                          stroke="#1c2035"
                          strokeDasharray="3 4"
                          strokeWidth={0.5}
                          vertical={false}
                        />
                        <XAxis
                          dataKey="month"
                          tick={(props) => {
                            const { x, y, payload, index } = props;
                            const last = index === occupancyChartData.length - 1;
                            return (
                              <text
                                x={x}
                                y={y}
                                dy={12}
                                textAnchor="middle"
                                fill={last ? "#5b9cf6" : "#4a5070"}
                                fontSize={9}
                                fontFamily="DM Mono, monospace"
                              >
                                {payload.value}
                              </text>
                            );
                          }}
                          axisLine={{ stroke: "#1c2035" }}
                          tickLine={{ stroke: "#1c2035" }}
                        />
                        <YAxis
                          allowDecimals={false}
                          tick={chartAxisTick}
                          axisLine={{ stroke: "#1c2035" }}
                          tickLine={{ stroke: "#1c2035" }}
                        />
                        <Tooltip contentStyle={chartTooltipStyle} />
                        <Bar
                          name="Belegt"
                          dataKey="occupied"
                          fill="url(#baOccBelegt)"
                          radius={[4, 4, 0, 0]}
                        />
                        <Bar
                          name="Frei"
                          dataKey="free"
                          fill="url(#baOccFrei)"
                          radius={[4, 4, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-[10px] flex flex-wrap gap-[12px]">
                    <span className="flex items-center gap-[4px] text-[10px] text-[#4a5070]">
                      <span className="h-[7px] w-[7px] rounded-full bg-[#3ddc84]" />
                      Belegt
                    </span>
                    <span className="flex items-center gap-[4px] text-[10px] text-[#4a5070]">
                      <span className="h-[7px] w-[7px] rounded-full bg-[#ff5f6d]" />
                      Frei
                    </span>
                  </div>
                </>
              )}
            </SectionCard>
          </div>
        </div>

        <div>
          <div className="mb-[10px] flex items-center gap-2">
            <span className="text-[10px] font-medium uppercase tracking-[0.8px] text-[#4a5070]">Bestand</span>
            <div className="h-px flex-1 bg-[#1c2035]" />
          </div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            <SmallStatCard
              label="Apartments gesamt"
              value={dashboard.totalApartments}
              hint="Alle Business Apartments im Filter"
              valueClassName="text-[20px] text-[#5b9cf6]"
            />
            <SmallStatCard
              label="Belegte Apartments"
              value={dashboard.occupiedApartments}
              hint="Aktuell laufende Apartments"
              valueClassName="text-[20px] text-[#3ddc84]"
            />
            <SmallStatCard
              label="Freie Apartments"
              value={dashboard.freeApartments}
              hint="Noch nicht belegte Apartments"
              valueClassName="text-[20px] text-[#ff5f6d]"
            />
          </div>
        </div>

        <div className="overflow-hidden rounded-[12px] border border-[#1c2035] bg-[#10121a]">
          <div className="border-b border-[#1c2035] px-[18px] py-[13px]">
            <h3 className="text-[13px] font-medium text-[#edf0f7]">Top / Flop Apartments</h3>
            <p className="mt-[2px] text-[10px] text-[#4a5070]">
              Schnelle Übersicht der stärksten und schwächsten Apartments
            </p>
          </div>
          <div className="grid grid-cols-1 gap-0 md:grid-cols-3">
            <div className="border-b border-[#1c2035] px-[18px] py-[16px] md:border-b-0 md:border-r md:border-[#1c2035]">
              <p className="mb-[6px] text-[9px] font-medium uppercase tracking-[0.6px] text-[#4a5070]">
                ⭐ Bestes Apartment
              </p>
              <p className="mb-[4px] text-[14px] font-medium text-[#edf0f7]">
                {dashboard.bestUnit ? dashboard.bestUnit.displayLabel : "—"}
              </p>
              <p className="text-[11px] text-[#3ddc84]">
                {dashboard.bestUnit
                  ? `${dashboard.bestUnit.place} · ${formatChfOrDash(
                      dashboard.bestUnit.profit
                    )} Gewinn`
                  : "Keine Daten vorhanden"}
              </p>
            </div>
            <div className="border-b border-[#1c2035] px-[18px] py-[16px] md:border-b-0 md:border-r md:border-[#1c2035]">
              <p className="mb-[6px] text-[9px] font-medium uppercase tracking-[0.6px] text-[#4a5070]">
                ⚠ Schwächstes Apartment
              </p>
              <p className="mb-[4px] text-[14px] font-medium text-[#edf0f7]">
                {dashboard.worstUnit ? dashboard.worstUnit.displayLabel : "—"}
              </p>
              <p className="text-[11px] text-[#ff5f6d]">
                {dashboard.worstUnit
                  ? `${dashboard.worstUnit.place} · ${formatChfOrDash(
                      dashboard.worstUnit.profit
                    )} Gewinn`
                  : "Keine Daten vorhanden"}
              </p>
            </div>
            <div className="px-[18px] py-[16px]">
              <p className="mb-[6px] text-[9px] font-medium uppercase tracking-[0.6px] text-[#4a5070]">
                Ø Gewinn pro Apartment
              </p>
              <p className="mb-[4px] font-mono text-[20px] font-medium text-[#f5a623]">
                {heroFinance &&
                dashboard.totalApartments > 0 &&
                heroFinance.profit != null
                  ? formatCurrency(
                      heroFinance.profit / dashboard.totalApartments
                    )
                  : "—"}
              </p>
              <p className="text-[11px] text-[#4a5070]">Durchschnitt über alle Business Apartments</p>
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-[12px] border border-[#1c2035] bg-[#10121a]">
          <div className="flex flex-col gap-2 border-b border-[#1c2035] px-[18px] py-[13px] sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-[13px] font-medium text-[#edf0f7]">Apartment Übersicht</h3>
              <p className="mt-[2px] text-[10px] text-[#4a5070]">
                Schnelle Performance-Sicht über alle Business Apartments
              </p>
            </div>
            <RankingBadge
              value={`${dashboard.performance.length} Apartments`}
              type="neutral"
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr>
                  <th className="border-b border-[#1c2035] px-[16px] py-[8px] text-left text-[9px] font-medium uppercase tracking-[0.6px] text-[#4a5070]">
                    Apartment
                  </th>
                  <th className="border-b border-[#1c2035] px-[16px] py-[8px] text-left text-[9px] font-medium uppercase tracking-[0.6px] text-[#4a5070]">
                    Ort
                  </th>
                  <th className="border-b border-[#1c2035] px-[16px] py-[8px] text-left text-[9px] font-medium uppercase tracking-[0.6px] text-[#4a5070]">
                    Status
                  </th>
                  <th className="border-b border-[#1c2035] px-[16px] py-[8px] text-left text-[9px] font-medium uppercase tracking-[0.6px] text-[#4a5070]">
                    Umsatz
                  </th>
                  <th className="border-b border-[#1c2035] px-[16px] py-[8px] text-left text-[9px] font-medium uppercase tracking-[0.6px] text-[#4a5070]">
                    Ausgaben
                  </th>
                  <th className="border-b border-[#1c2035] px-[16px] py-[8px] text-left text-[9px] font-medium uppercase tracking-[0.6px] text-[#4a5070]">
                    Gewinn
                  </th>
                  <th className="border-b border-[#1c2035] px-[16px] py-[8px] text-left text-[9px] font-medium uppercase tracking-[0.6px] text-[#4a5070]">
                    Aktion
                  </th>
                </tr>
              </thead>
              <tbody>
                {dashboard.performance.map((unit, rowIdx, arr) => (
                  <tr
                    key={unit.unitId}
                    className={`cursor-pointer border-b border-[#1c2035] text-[11px] text-[#8892b0] transition-colors hover:bg-[#141720] ${
                      rowIdx === arr.length - 1 ? "border-b-0" : ""
                    }`}
                  >
                    <td className="align-middle px-[16px] py-[11px]">
                      <span className="block font-mono text-[11px] font-medium text-[#5b9cf6]">
                        {unit.displayLabel}
                      </span>
                      <span className="mt-[2px] block max-w-[200px] truncate font-mono text-[8px] text-[#4a5070]">
                        {unit.unitId}
                      </span>
                    </td>
                    <td className="align-middle px-[16px] py-[11px] text-[11px] text-[#4a5070]">
                      {unit.place}
                    </td>
                    <td className="align-middle px-[16px] py-[11px]">
                      {unit.occupied ? (
                        <RankingBadge value="Belegt" type="success" />
                      ) : (
                        <RankingBadge value="Frei" type="danger" />
                      )}
                    </td>
                    <td
                      className={`align-middle px-[16px] py-[11px] font-mono text-[11px] text-[#f5a623] ${
                        formatChfOrDash(unit.revenue) === "-" ? "text-[#4a5070]" : ""
                      }`}
                    >
                      {formatChfOrDash(unit.revenue)}
                    </td>
                    <td
                      className={`align-middle px-[16px] py-[11px] font-mono text-[11px] ${
                        formatChfOrDash(unit.costs) === "-" ? "text-[#4a5070]" : "text-[#8892b0]"
                      }`}
                    >
                      {formatChfOrDash(unit.costs)}
                    </td>
                    <td
                      className={`align-middle px-[16px] py-[11px] font-mono text-[11px] ${
                        formatChfOrDash(unit.profit) === "-"
                          ? "text-[#4a5070]"
                          : unit.profit != null && Number(unit.profit) >= 0
                            ? "font-medium text-[#3ddc84]"
                            : "font-medium text-[#ff5f6d]"
                      }`}
                    >
                      {formatChfOrDash(unit.profit)}
                    </td>
                    <td className="align-middle px-[16px] py-[11px]">
                      <Link
                        to={`/admin/units/${encodeURIComponent(unit.unitId)}`}
                        className="inline-block rounded-[6px] border border-[#1c2035] bg-[#141720] px-[10px] py-[3px] text-[10px] text-[#8892b0] no-underline transition-colors hover:border-[#242840] hover:text-[#edf0f7]"
                      >
                        Öffnen
                      </Link>
                    </td>
                  </tr>
                ))}

                {dashboard.performance.length === 0 && (
                  <tr>
                    <td
                      colSpan="7"
                      className="border-b-0 px-[16px] py-8 text-center text-[12px] text-[#4a5070]"
                    >
                      Keine Business Apartments gefunden.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AdminBusinessApartmentsDashboardPage;