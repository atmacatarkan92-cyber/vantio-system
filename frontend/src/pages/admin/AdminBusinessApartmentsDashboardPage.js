import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ResponsiveContainer,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
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

/** Readable label for lists/cards; UUID only as last resort. */
function apartmentDisplayLabel(unit) {
  if (!unit) return "—";
  const addr = String(unit.address ?? "").trim();
  const city = String(unit.city ?? "").trim();
  if (addr && city) return `${addr}, ${city}`;
  if (addr) return addr;
  const title = String(unit.title ?? unit.name ?? "").trim();
  if (title) return title;
  const id = String(unit.unitId ?? unit.id ?? "").trim();
  return id || "—";
}

function HeroCard({
  title,
  value,
  subtitle,
  accent = "orange",
  trend = null,
}) {
  const styles = {
    orange: {
      card: "border-t-orange-500",
      value: "text-[#fb923c]",
      dot: "bg-orange-500",
    },
    green: {
      card: "border-t-green-500",
      value: "text-[#4ade80]",
      dot: "bg-green-500",
    },
    slate: {
      card: "border-t-slate-500",
      value: "text-[#eef2ff]",
      dot: "bg-slate-500",
    },
    rose: {
      card: "border-t-rose-500",
      value: "text-[#f87171]",
      dot: "bg-rose-500",
    },
    blue: {
      card: "border-t-blue-500",
      value: "text-[#7aaeff]",
      dot: "bg-blue-500",
    },
    amber: {
      card: "border-t-amber-500",
      value: "text-[#fbbf24]",
      dot: "bg-amber-500",
    },
  };

  const style = styles[accent] || styles.orange;

  return (
    <div
      className={`relative overflow-hidden rounded-[14px] border border-white/[0.07] border-t-4 bg-[#141824] p-6 ${style.card}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${style.dot}`} />
            <p className="text-[9px] font-bold uppercase tracking-[1px] text-[#6b7a9a]">{title}</p>
          </div>
          <p className={`mt-3 text-[24px] font-bold tracking-tight ${style.value}`}>
            {value}
          </p>
          <p className="mt-2 text-[11px] text-[#6b7a9a]">{subtitle}</p>
        </div>

        <div className="flex flex-col items-end gap-2">
          <span className="rounded-full border border-white/[0.1] bg-white/[0.06] px-2.5 py-1 text-[10px] font-bold text-[#6b7a9a]">
            Live
          </span>
          {trend ? (
            <span
              className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${
                trend.positive
                  ? "border-green-500/20 bg-green-500/10 text-green-400"
                  : "border-red-500/20 bg-red-500/10 text-red-400"
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
    <div className="rounded-[14px] border border-white/[0.07] bg-[#141824] p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-[16px] font-bold text-[#eef2ff]">{title}</h3>
          {subtitle ? (
            <p className="mt-1 text-[12px] text-[#6b7a9a]">{subtitle}</p>
          ) : null}
        </div>
        {rightSlot}
      </div>
      {children}
    </div>
  );
}

function SmallStatCard({ label, value, hint }) {
  return (
    <div className="rounded-[10px] border border-white/[0.08] bg-[#111520] p-4">
      <p className="text-[10px] text-[#6b7a9a]">{label}</p>
      <p className="mt-2 text-[24px] font-bold text-[#eef2ff]">{value}</p>
      {hint ? <p className="mt-2 text-[11px] text-[#6b7a9a]">{hint}</p> : null}
    </div>
  );
}

function RankingBadge({ value, type }) {
  const styles = {
    success: "border-green-500/20 bg-green-500/10 text-green-400",
    warning: "border-amber-500/20 bg-amber-500/10 text-amber-400",
    danger: "border-red-500/20 bg-red-500/10 text-red-400",
    neutral: "border-white/[0.1] bg-white/[0.06] text-[#6b7a9a]",
    blue: "border-blue-500/20 bg-blue-500/10 text-[#7aaeff]",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-bold ${styles[type]}`}
    >
      {value}
    </span>
  );
}

function FilterSelect({ label, value, onChange, children }) {
  return (
    <div className="min-w-[180px]">
      <label className="mb-2 block text-[10px] text-[#6b7a9a]">{label}</label>
      <select
        value={value}
        onChange={onChange}
        className="w-full rounded-[8px] border border-white/[0.08] bg-[#111520] px-4 py-3 text-sm text-[#eef2ff] outline-none"
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
        title: unit.title || unit.unitId,
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

  return (
    <div className="-m-6 min-h-screen bg-[#07090f] p-6 text-[#eef2ff] md:p-8">
      <div className="mx-auto max-w-[1800px] space-y-8">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[1px] text-[#6b7a9a]">
              Vantio
            </p>
            <h2 className="mt-2 text-[22px] font-bold tracking-tight text-[#eef2ff] md:text-[24px]">
              Business-Apartment Dashboard
            </h2>
            <p className="mt-3 max-w-3xl text-[12px] text-[#6b7a9a]">
              Übersicht über Belegung, Umsatz, Gewinn und Performance deiner
              Business Apartments.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="rounded-full border border-white/[0.1] bg-white/[0.06] px-3 py-1.5 text-[11px] font-bold text-[#6b7a9a]">
              Live KPI
            </span>
            <span className="rounded-full border border-white/[0.1] bg-white/[0.06] px-3 py-1.5 text-[11px] font-bold text-[#6b7a9a]">
              Business Apartments only
            </span>
          </div>
        </div>

        <SectionCard
          title="Global Filter"
          subtitle="Filtere das Dashboard nach Zeitraum, Ort und Apartment"
        >
          <div className="flex flex-col lg:flex-row gap-4">
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
          </div>
        </SectionCard>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
          <HeroCard
            title="Aktueller Umsatz"
            value={
              chartsLoading || chartsError || !heroFinance
                ? "-"
                : formatCurrency(heroFinance.revenue)
            }
            subtitle="Umsatz aus aktuell belegten Apartments"
            accent="orange"
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
            accent="green"
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
            accent="slate"
            trend={costTrend}
          />
          <HeroCard
            title="Belegt in %"
            value={formatPercent(dashboard.occupiedRate)}
            subtitle="Aktuelle Auslastung über alle Apartments"
            accent="rose"
            trend={occupancyTrend}
          />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <SectionCard
            title={financeChartTitle}
            subtitle={financeChartSubtitle}
          >
            {chartsLoading ? (
              <p className="py-8 text-[13px] text-[#6b7a9a]">Lade Monatsdaten…</p>
            ) : chartsError ? (
              <p className="py-8 text-[13px] text-[#f87171]">{chartsError}</p>
            ) : financeChartData.length === 0 ? (
              <p className="py-8 text-[13px] text-[#6b7a9a]">Keine Daten vorhanden</p>
            ) : (
              <div className="h-[420px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={financeChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" vertical={false} />
                    <XAxis dataKey="month" tick={{ fill: "#6b7a9a", fontSize: 11 }} />
                    <YAxis tick={{ fill: "#6b7a9a", fontSize: 11 }} />
                    <Tooltip formatter={(value) => `CHF ${value.toLocaleString()}`} />
                    <Legend />
                    <Bar name="Umsatz" dataKey="revenue" fill="#f97316" radius={[8, 8, 0, 0]} />
                    <Bar name="Ausgaben" dataKey="costs" fill="#334155" radius={[8, 8, 0, 0]} />
                    <Bar name="Gewinn" dataKey="profit" fill="#16a34a" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </SectionCard>

          <SectionCard
            title={occupancyChartTitle}
            subtitle={occupancyChartSubtitle}
          >
            {chartsLoading ? (
              <p className="py-8 text-[13px] text-[#6b7a9a]">Lade Monatsdaten…</p>
            ) : chartsError ? (
              <p className="py-8 text-[13px] text-[#f87171]">{chartsError}</p>
            ) : occupancyChartData.length === 0 ? (
              <p className="py-8 text-[13px] text-[#6b7a9a]">Keine Daten vorhanden</p>
            ) : (
              <div className="h-[420px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={occupancyChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" vertical={false} />
                    <XAxis dataKey="month" tick={{ fill: "#6b7a9a", fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fill: "#6b7a9a", fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Bar name="Belegt" dataKey="occupied" fill="#16a34a" radius={[8, 8, 0, 0]} />
                    <Bar name="Frei" dataKey="free" fill="#ef4444" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </SectionCard>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <SmallStatCard
            label="Apartments gesamt"
            value={dashboard.totalApartments}
            hint="Alle Business Apartments im Filter"
          />
          <SmallStatCard
            label="Belegte Apartments"
            value={dashboard.occupiedApartments}
            hint="Aktuell laufende Apartments"
          />
          <SmallStatCard
            label="Freie Apartments"
            value={dashboard.freeApartments}
            hint="Noch nicht belegte Apartments"
          />
        </div>

        <SectionCard
          title="Top / Flop Apartments"
          subtitle="Schnelle Übersicht der stärksten und schwächsten Apartments"
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <SmallStatCard
              label="Bestes Apartment"
              value={dashboard.bestUnit ? dashboard.bestUnit.displayLabel : "-"}
              hint={
                dashboard.bestUnit
                  ? `${dashboard.bestUnit.place} · ${formatChfOrDash(
                      dashboard.bestUnit.profit
                    )} Gewinn`
                  : "Keine Daten vorhanden"
              }
            />
            <SmallStatCard
              label="Schwächstes Apartment"
              value={dashboard.worstUnit ? dashboard.worstUnit.displayLabel : "-"}
              hint={
                dashboard.worstUnit
                  ? `${dashboard.worstUnit.place} · ${formatChfOrDash(
                      dashboard.worstUnit.profit
                    )} Gewinn`
                  : "Keine Daten vorhanden"
              }
            />
            <SmallStatCard
              label="Ø Gewinn pro Apartment"
              value={
                heroFinance &&
                dashboard.totalApartments > 0 &&
                heroFinance.profit != null
                  ? formatCurrency(
                      heroFinance.profit / dashboard.totalApartments
                    )
                  : "-"
              }
              hint="Durchschnitt über alle Business Apartments"
            />
          </div>
        </SectionCard>

        <SectionCard
          title="Apartment Übersicht"
          subtitle="Schnelle Performance-Sicht über alle Business Apartments"
          rightSlot={
            <RankingBadge
              value={`${dashboard.performance.length} Apartments`}
              type="neutral"
            />
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead className="bg-[#111520]">
                <tr>
                  <th className="py-3 pr-4 text-[9px] font-bold uppercase tracking-[0.8px] text-[#6b7a9a]">
                    Apartment
                  </th>
                  <th className="py-3 pr-4 text-[9px] font-bold uppercase tracking-[0.8px] text-[#6b7a9a]">
                    Ort
                  </th>
                  <th className="py-3 pr-4 text-[9px] font-bold uppercase tracking-[0.8px] text-[#6b7a9a]">
                    Status
                  </th>
                  <th className="py-3 pr-4 text-[9px] font-bold uppercase tracking-[0.8px] text-[#6b7a9a]">
                    Umsatz
                  </th>
                  <th className="py-3 pr-4 text-[9px] font-bold uppercase tracking-[0.8px] text-[#6b7a9a]">
                    Ausgaben
                  </th>
                  <th className="py-3 pr-4 text-[9px] font-bold uppercase tracking-[0.8px] text-[#6b7a9a]">
                    Gewinn
                  </th>
                  <th className="py-3 pr-4 text-[9px] font-bold uppercase tracking-[0.8px] text-[#6b7a9a]">
                    Aktion
                  </th>
                </tr>
              </thead>
              <tbody>
                {dashboard.performance.map((unit) => (
                  <tr
                    key={unit.unitId}
                    className="border-b border-white/[0.05] text-[13px] text-[#eef2ff]"
                  >
                    <td className="py-4 pr-4 font-semibold">
                      <span className="block text-[#7aaeff]">{unit.displayLabel}</span>
                      <span className="mt-0.5 block break-all font-mono text-[10px] font-normal text-[#6b7a9a]">
                        {unit.unitId}
                      </span>
                    </td>
                    <td className="py-4 pr-4 font-medium">{unit.place}</td>
                    <td className="py-4 pr-4">
                      {unit.occupied ? (
                        <RankingBadge value="Belegt" type="success" />
                      ) : (
                        <RankingBadge value="Frei" type="danger" />
                      )}
                    </td>
                    <td className="py-4 pr-4 font-medium text-[#4ade80]">
                      {formatChfOrDash(unit.revenue)}
                    </td>
                    <td className="py-4 pr-4 font-medium">
                      {formatChfOrDash(unit.costs)}
                    </td>
                    <td className="py-4 pr-4 font-medium">
                      {formatChfOrDash(unit.profit)}
                    </td>
                    <td className="py-4 pr-4">
                      <Link
                        to={`/admin/units/${encodeURIComponent(unit.unitId)}`}
                        className="inline-block rounded-[8px] border border-white/[0.1] bg-transparent px-3 py-2 text-[13px] font-semibold text-[#8090b0] no-underline hover:bg-white/[0.04]"
                      >
                        Öffnen
                      </Link>
                    </td>
                  </tr>
                ))}

                {dashboard.performance.length === 0 && (
                  <tr>
                    <td colSpan="7" className="py-8 text-center text-[13px] text-[#6b7a9a]">
                      Keine Business Apartments gefunden.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

export default AdminBusinessApartmentsDashboardPage;