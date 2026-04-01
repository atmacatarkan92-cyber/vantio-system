import React, { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  BarChart,
  Bar,
} from "recharts";
import { API_BASE_URL, getApiHeaders } from "../../config";
import {
  fetchAdminUnits,
  fetchAdminRooms,
  fetchAdminOccupancy,
  fetchAdminOccupancyRooms,
  fetchAdminProfit,
  fetchAdminTenanciesAll,
  normalizeUnit,
  normalizeRoom,
} from "../../api/adminData";
import OccupancyMap from "../../components/OccupancyMap";
import {
  getRoomOccupancyStatus,
  parseIsoDate,
  tenanciesForRoom,
} from "../../utils/unitOccupancyStatus";

function sumFilteredProfitField(profitResponse, filteredUnits, field) {
  if (!profitResponse?.units || !Array.isArray(profitResponse.units)) return null;
  const allowed = new Set(
    filteredUnits.map((u) => String(u.id ?? u.unitId))
  );
  let sum = 0;
  for (const row of profitResponse.units) {
    if (allowed.has(String(row.unit_id))) {
      sum += Number(row[field] ?? 0);
    }
  }
  return sum;
}

function profitRowsByUnitId(profitResponse) {
  const m = new Map();
  if (!profitResponse?.units) return m;
  for (const row of profitResponse.units) {
    m.set(String(row.unit_id), row);
  }
  return m;
}

/** Sum GET /api/admin/occupancy `units[]` rows whose unit_id is in filtered Co-Living units (same scope as the page). */
function aggregateOccupancyForFilter(occupancyApi, filteredUnits) {
  if (!occupancyApi?.units || !Array.isArray(occupancyApi.units)) return null;
  const allowed = new Set(
    filteredUnits.map((u) => String(u.id ?? u.unitId))
  );
  let totalRooms = 0;
  let occupiedRooms = 0;
  let reservedRooms = 0;
  let freeRooms = 0;
  for (const row of occupancyApi.units) {
    if (!allowed.has(String(row.unit_id))) continue;
    totalRooms += Number(row.total_rooms ?? 0);
    occupiedRooms += Number(row.occupied_rooms ?? 0);
    reservedRooms += Number(row.reserved_rooms ?? 0);
    freeRooms += Number(row.free_rooms ?? 0);
  }
  const occupiedRate =
    totalRooms > 0 ? (occupiedRooms / totalRooms) * 100 : 0;
  const reservedRate =
    totalRooms > 0 ? (reservedRooms / totalRooms) * 100 : 0;
  const freeRate = totalRooms > 0 ? (freeRooms / totalRooms) * 100 : 0;
  const round1 = (n) => Math.round(n * 10) / 10;
  return {
    totalRooms,
    occupiedRooms,
    reservedRooms,
    freeRooms,
    occupiedRate: round1(occupiedRate),
    reservedRate: round1(reservedRate),
    freeRate: round1(freeRate),
  };
}

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

function getTodayDateString() {
  return new Date().toISOString().split("T")[0];
}

function getSelectedMonthDate(selectedPeriod, selectedMonth) {
  const today = new Date();

  if (selectedPeriod === "lastMonth") {
    return new Date(today.getFullYear(), today.getMonth() - 1, 1);
  }

  if (selectedPeriod === "thisMonth") {
    return new Date(today.getFullYear(), today.getMonth(), 1);
  }

  if (selectedPeriod === "nextMonth") {
    return new Date(today.getFullYear(), today.getMonth() + 1, 1);
  }

  if (selectedPeriod === "customMonth" && selectedMonth) {
    const [year, month] = selectedMonth.split("-");
    return new Date(Number(year), Number(month) - 1, 1);
  }

  return new Date(today.getFullYear(), today.getMonth(), 1);
}

function addMonths(date, months) {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function hasLeaseStarted(unit) {
  const c = String(unit?.leaseStartDate ?? unit?.lease_start_date ?? "").trim();
  if (c && /^\d{4}-\d{2}-\d{2}/.test(c)) {
    return c.slice(0, 10) <= getTodayDateString();
  }
  const af = String(unit?.availableFrom ?? "").trim();
  if (af && /^\d{4}-\d{2}-\d{2}/.test(af)) {
    return af.slice(0, 10) <= getTodayDateString();
  }
  return false;
}

function getMonthStart(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function getMonthEnd(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function getRoomsForUnit(unitId, allRooms = []) {
  return allRooms.filter((room) => (room.unitId || room.unit_id) === unitId);
}

function toIsoDay(d) {
  if (!d || !(d instanceof Date) || Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function tenancyOverlapsMonth(t, monthStart, monthEnd) {
  const moveIn = parseIsoDate(t?.move_in_date);
  if (!moveIn) return false;
  const moveOut = t.move_out_date ? parseIsoDate(t.move_out_date) : null;
  const end = moveOut || "9999-12-31";
  const ms = toIsoDay(monthStart);
  const me = toIsoDay(monthEnd);
  if (!ms || !me) return false;
  return moveIn <= me && end >= ms;
}

function normalizeTenancyStatusLocal(t) {
  return String(t?.status ?? "").trim().toLowerCase();
}

/** Current month: getRoomOccupancyStatus. Other months: overlap + active / reserved / ended only; else frei. */
function roomOccupancyKindForMonth(room, tenancies, monthStart, monthEnd, isCurrentMonth) {
  if (isCurrentMonth) {
    return getRoomOccupancyStatus(room, tenancies) || "frei";
  }
  const roomT = tenanciesForRoom(room, tenancies || []).filter((t) =>
    tenancyOverlapsMonth(t, monthStart, monthEnd)
  );
  if (roomT.length === 0) return "frei";
  if (roomT.some((t) => normalizeTenancyStatusLocal(t) === "active")) return "belegt";
  if (roomT.some((t) => normalizeTenancyStatusLocal(t) === "reserved")) return "reserviert";
  if (roomT.some((t) => normalizeTenancyStatusLocal(t) === "ended")) return "belegt";
  return "frei";
}

function getCoLivingMetricsForMonth(unit, activeMonth, allRooms = [], tenancies = []) {
  const rooms = getRoomsForUnit(unit.unitId || unit.id, allRooms);
  const monthStart = getMonthStart(activeMonth);
  const monthEnd = getMonthEnd(activeMonth);
  const leaseStarted = hasLeaseStarted(unit);
  const now = new Date();
  const isCurrentMonth =
    activeMonth.getFullYear() === now.getFullYear() &&
    activeMonth.getMonth() === now.getMonth();

  if (rooms.length === 0) {
    const total = Number(unit.rooms || 0);

    return {
      occupiedCount: 0,
      reservedCount: 0,
      freeCount: total,
      totalRooms: total,
      fullRevenue: null,
      currentRevenue: null,
      vacancyLoss: null,
      currentProfit: null,
      runningCosts: null,
      isFullyOccupied: false,
      isPartiallyOccupied: false,
      leaseStarted,
    };
  }

  let occupiedCount = 0;
  let reservedCount = 0;
  let freeCount = 0;
  for (const room of rooms) {
    const kind = roomOccupancyKindForMonth(
      room,
      tenancies,
      monthStart,
      monthEnd,
      isCurrentMonth
    );
    if (kind === "belegt") occupiedCount += 1;
    else if (kind === "reserviert") reservedCount += 1;
    else freeCount += 1;
  }

  return {
    occupiedCount,
    reservedCount,
    freeCount,
    totalRooms: rooms.length,
    fullRevenue: null,
    currentRevenue: null,
    vacancyLoss: null,
    currentProfit: null,
    runningCosts: null,
    isFullyOccupied:
      rooms.length > 0 && occupiedCount === rooms.length,
    isPartiallyOccupied:
      occupiedCount > 0 && occupiedCount < rooms.length,
    leaseStarted,
  };
}

function buildWarnings(units, rankedUnits, profitByUnitId) {
  const warnings = [];

  rankedUnits.forEach((unit) => {
    const uid = String(unit.internalUnitId ?? "");
    const prow = uid ? profitByUnitId.get(uid) : null;
    const rev = prow != null ? Number(prow.revenue) : null;
    const prof = prow != null ? Number(prow.profit) : null;

    if (rev != null && rev <= 0) {
      warnings.push({
        type: "danger",
        title: `${unit.unitId} · ${unit.place}`,
        text: "Keine aktuellen Einnahmen vorhanden.",
      });
    }

    if (prof != null && prof < 0) {
      warnings.push({
        type: "danger",
        title: `${unit.unitId} · ${unit.place}`,
        text: `Unter Break-Even um ${formatCurrency(Math.abs(prof))}.`,
      });
    }

    if (unit.freeCount > 0) {
      warnings.push({
        type: "warning",
        title: `${unit.unitId} · ${unit.place}`,
        text: `${unit.freeCount} freie Rooms ohne aktuelle Belegung.`,
      });
    }
  });

  units.forEach((unit) => {
    if (!hasLeaseStarted(unit)) {
      const uid = String(unit.id ?? unit.unitId);
      const prow = profitByUnitId.get(uid);
      const rev = prow != null ? Number(prow.revenue) : null;
      if (rev != null && rev <= 0) {
        warnings.push({
          type: "danger",
          title: `${unit.unitId} · ${unit.place}`,
          text: "Mietstart Vermieter liegt in der Zukunft und aktuell ist noch kein Umsatz gesichert.",
        });
      }
    }
  });

  return warnings.slice(0, 6);
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

function ProgressRow({
  label,
  value,
  count,
  colorClass,
  trackClass = "bg-[#111520]",
}) {
  const safeValue = Math.max(0, Math.min(Number(value || 0), 100));

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <p className="text-[13px] font-medium text-[#eef2ff]">{label}</p>
          <span className="rounded-full border border-white/[0.1] bg-white/[0.06] px-2 py-0.5 text-[10px] font-bold text-[#6b7a9a]">
            {count}
          </span>
        </div>
        <p className="text-[13px] font-semibold text-[#eef2ff]">
          {formatPercent(safeValue)}
        </p>
      </div>
      <div className={`h-3 w-full overflow-hidden rounded-full ${trackClass}`}>
        <div
          className={`h-full rounded-full ${colorClass}`}
          style={{ width: `${safeValue}%` }}
        />
      </div>
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

function AdminCoLivingDashboardPage() {
  const [selectedPeriod, setSelectedPeriod] = useState("thisMonth");
  const [selectedMonth, setSelectedMonth] = useState("");
  const [selectedPlace, setSelectedPlace] = useState("all");
  const [selectedUnitId, setSelectedUnitId] = useState("all");
  const [period, setPeriod] = useState("month");

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/invoices`, { headers: getApiHeaders() }).catch((err) => {
      console.error("Error loading invoices:", err);
    });
  }, []);

  const activeMonth = useMemo(() => {
    return getSelectedMonthDate(selectedPeriod, selectedMonth);
  }, [selectedPeriod, selectedMonth]);

  const [units, setUnits] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [tenancies, setTenancies] = useState([]);
  const [occupancyApi, setOccupancyApi] = useState(null);
  const [occupancyRoomsMap, setOccupancyRoomsMap] = useState(null);
  const [profitSixMonth, setProfitSixMonth] = useState(null);
  const [profitSixMonthLoading, setProfitSixMonthLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const periods = Array.from({ length: 6 }, (_, index) => {
      const d = addMonths(startOfMonth(activeMonth), index - 2);
      return { year: d.getFullYear(), month: d.getMonth() + 1 };
    });
    setProfitSixMonthLoading(true);
    Promise.all(
      periods.map((p) => fetchAdminProfit(p).catch(() => null))
    )
      .then((arr) => {
        if (!cancelled) setProfitSixMonth(arr);
      })
      .finally(() => {
        if (!cancelled) setProfitSixMonthLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeMonth]);

  useEffect(() => {
    fetchAdminUnits()
      .then((data) => setUnits(Array.isArray(data) ? data.map(normalizeUnit) : []))
      .catch(() => setUnits([]));
    fetchAdminRooms()
      .then((data) => setRooms(Array.isArray(data) ? data.map(normalizeRoom) : []))
      .catch(() => setRooms([]));
    fetchAdminTenanciesAll()
      .then((data) => setTenancies(Array.isArray(data) ? data : []))
      .catch(() => setTenancies([]));
    fetchAdminOccupancy()
      .then((data) => setOccupancyApi(data))
      .catch(() => setOccupancyApi(null));
  }, []);

  const allCoLivingUnits = useMemo(() => {
    return units.filter((unit) => unit.type === "Co-Living");
  }, [units]);

  const placeOptions = useMemo(() => {
    const places = [
      ...new Set(allCoLivingUnits.map((unit) => unit.place).filter(Boolean)),
    ];
    return places.sort((a, b) => a.localeCompare(b));
  }, [allCoLivingUnits]);

  const filteredUnits = useMemo(() => {
    return allCoLivingUnits.filter((unit) => {
      const placeOk = selectedPlace === "all" || unit.place === selectedPlace;
      const unitOk = selectedUnitId === "all" || unit.unitId === selectedUnitId;
      return placeOk && unitOk;
    });
  }, [allCoLivingUnits, selectedPlace, selectedUnitId]);

  const firstFilteredUnit = useMemo(() => filteredUnits[0], [filteredUnits]);
  useEffect(() => {
    if (!firstFilteredUnit) {
      setOccupancyRoomsMap(null);
      return;
    }
    const uid = firstFilteredUnit.id ?? firstFilteredUnit.unitId;
    if (!uid) return;
    const onDate = new Date().toISOString().slice(0, 10);
    fetchAdminOccupancyRooms({ unit_id: uid, on_date: onDate })
      .then((data) => setOccupancyRoomsMap(data))
      .catch(() => setOccupancyRoomsMap(null));
  }, [firstFilteredUnit]);

  const profitForActiveMonth = useMemo(
    () => (profitSixMonth?.length === 6 ? profitSixMonth[2] : null),
    [profitSixMonth]
  );

  const profitByUnitIdActive = useMemo(
    () => profitRowsByUnitId(profitForActiveMonth),
    [profitForActiveMonth]
  );

  /** Aktueller Monat (Index 2): Backend-Umsatz, gefiltert. */
  const heroCurrentRevenueBackend = useMemo(() => {
    if (profitSixMonthLoading) return null;
    return sumFilteredProfitField(profitSixMonth?.[2], filteredUnits, "revenue");
  }, [profitSixMonth, profitSixMonthLoading, filteredUnits]);

  const dashboard = useMemo(() => {
    const totals = {
      unitsCount: filteredUnits.length,
      totalRooms: 0,
      occupiedRooms: 0,
      reservedRooms: 0,
      freeRooms: 0,
      fullRevenue: null,
      currentRevenue: null,
      runningCosts: null,
      vacancyLoss: null,
      currentProfit: null,
      fullUnits: 0,
      partialUnits: 0,
      notStartedUnits: 0,
      vacancyDays: null,
      lostRevenue7Days: null,
    };

    let totalRev = 0;
    let totalCost = 0;
    let totalProf = 0;

    const unitPerformance = filteredUnits.map((unit) => {
      const metrics = getCoLivingMetricsForMonth(unit, activeMonth, rooms, tenancies);
      const uid = String(unit.id ?? unit.unitId);
      const prow = profitByUnitIdActive.get(uid);
      const currentRevenue = prow != null ? Number(prow.revenue) : null;
      const currentProfit = prow != null ? Number(prow.profit) : null;
      const runningCosts = prow != null ? Number(prow.costs) : null;

      if (prow != null) {
        totalRev += Number(prow.revenue);
        totalCost += Number(prow.costs);
        totalProf += Number(prow.profit);
      }

      const occupancyRate =
        metrics.totalRooms > 0
          ? (metrics.occupiedCount / metrics.totalRooms) * 100
          : 0;

      totals.totalRooms += metrics.totalRooms;
      totals.occupiedRooms += metrics.occupiedCount;
      totals.reservedRooms += metrics.reservedCount;
      totals.freeRooms += metrics.freeCount;

      if (metrics.isFullyOccupied) totals.fullUnits += 1;
      if (metrics.isPartiallyOccupied) totals.partialUnits += 1;
      if (!metrics.leaseStarted) totals.notStartedUnits += 1;

      return {
        unitId: unit.unitId,
        internalUnitId: uid,
        place: unit.place,
        totalRooms: metrics.totalRooms,
        occupiedCount: metrics.occupiedCount,
        reservedCount: metrics.reservedCount,
        freeCount: metrics.freeCount,
        occupancyRate,
        currentRevenue,
        currentProfit,
        vacancyLoss: null,
        runningCosts,
        fullRevenue: null,
        breakEvenRevenue: runningCosts,
        breakEvenGap:
          currentRevenue != null && runningCosts != null
            ? currentRevenue - runningCosts
            : null,
        vacancyDays: null,
        lostRevenue7Days: null,
      };
    });

    totals.currentRevenue =
      profitForActiveMonth != null ? totalRev : null;
    totals.runningCosts =
      profitForActiveMonth != null ? totalCost : null;
    totals.currentProfit =
      profitForActiveMonth != null ? totalProf : null;

    const occupiedRate =
      totals.totalRooms > 0
        ? (totals.occupiedRooms / totals.totalRooms) * 100
        : 0;
    const reservedRate =
      totals.totalRooms > 0
        ? (totals.reservedRooms / totals.totalRooms) * 100
        : 0;
    const freeRate =
      totals.totalRooms > 0 ? (totals.freeRooms / totals.totalRooms) * 100 : 0;

    const averageRevenuePerRoom =
      totals.totalRooms > 0 && totals.currentRevenue != null
        ? totals.currentRevenue / totals.totalRooms
        : null;
    const averageProfitPerUnit =
      filteredUnits.length > 0 && totals.currentProfit != null
        ? totals.currentProfit / filteredUnits.length
        : null;

    const rankedUnits = [...unitPerformance].sort((a, b) => {
      const br = b.currentRevenue ?? -Infinity;
      const ar = a.currentRevenue ?? -Infinity;
      return br - ar;
    });
    const bestUnit = rankedUnits.length > 0 ? rankedUnits[0] : null;
    const worstUnit =
      rankedUnits.length > 0 ? rankedUnits[rankedUnits.length - 1] : null;

    return {
      ...totals,
      occupiedRate,
      reservedRate,
      freeRate,
      averageRevenuePerRoom,
      averageProfitPerUnit,
      rankedUnits,
      bestUnit,
      worstUnit,
    };
  }, [
    filteredUnits,
    activeMonth,
    rooms,
    tenancies,
    profitByUnitIdActive,
    profitForActiveMonth,
  ]);

  const dashboardDisplay = useMemo(() => {
    const base = dashboard;
    const agg = aggregateOccupancyForFilter(occupancyApi, filteredUnits);
    if (agg == null) return base;
    return {
      ...base,
      totalRooms: agg.totalRooms,
      occupiedRooms: agg.occupiedRooms,
      reservedRooms: agg.reservedRooms,
      freeRooms: agg.freeRooms,
      occupiedRate: agg.occupiedRate,
      reservedRate: agg.reservedRate,
      freeRate: agg.freeRate,
    };
  }, [dashboard, occupancyApi, filteredUnits]);

  const forecast = useMemo(() => {
    if (!profitForActiveMonth?.units) {
      return {
        forecastRevenue: null,
        forecastCosts: null,
        forecastProfit: null,
        expectedOccupancyRate: 0,
        criticalUnits: 0,
      };
    }
    const forecastRevenue = sumFilteredProfitField(
      profitForActiveMonth,
      filteredUnits,
      "revenue"
    );
    const forecastCosts = sumFilteredProfitField(
      profitForActiveMonth,
      filteredUnits,
      "costs"
    );
    const forecastProfit = sumFilteredProfitField(
      profitForActiveMonth,
      filteredUnits,
      "profit"
    );
    let criticalUnits = 0;
    const allowed = new Set(
      filteredUnits.map((u) => String(u.id ?? u.unitId))
    );
    for (const row of profitForActiveMonth.units) {
      if (!allowed.has(String(row.unit_id))) continue;
      if (Number(row.profit) < 0) criticalUnits += 1;
    }
    const expectedOccupancyRate = dashboardDisplay.occupiedRate;

    return {
      forecastRevenue,
      forecastCosts,
      forecastProfit,
      expectedOccupancyRate,
      criticalUnits,
    };
  }, [profitForActiveMonth, filteredUnits, dashboardDisplay.occupiedRate]);

  const monthlyRevenueForecast = useMemo(() => {
    if (!profitSixMonth || profitSixMonth.length !== 6) {
      return Array.from({ length: 6 }, (_, index) => {
        const monthDate = addMonths(startOfMonth(activeMonth), index - 2);
        return {
          month: monthDate.toLocaleDateString("de-CH", { month: "short" }),
          secureRevenue: null,
          reservedRevenue: 0,
          riskRevenue: 0,
          freeRevenue: 0,
          forecastRevenue: null,
        };
      });
    }
    return profitSixMonth.map((profitData, index) => {
      const monthDate = addMonths(startOfMonth(activeMonth), index - 2);
      const total = sumFilteredProfitField(profitData, filteredUnits, "revenue");
      return {
        month: monthDate.toLocaleDateString("de-CH", { month: "short" }),
        secureRevenue: total,
        reservedRevenue: 0,
        riskRevenue: 0,
        freeRevenue: 0,
        forecastRevenue: total,
      };
    });
  }, [profitSixMonth, activeMonth, filteredUnits]);

  const dashboardWarnings = useMemo(() => {
    return buildWarnings(
      filteredUnits,
      dashboard.rankedUnits,
      profitByUnitIdActive
    );
  }, [filteredUnits, dashboard.rankedUnits, profitByUnitIdActive]);

  const roomStatusChartData = [
    { name: "Belegt", value: dashboardDisplay.occupiedRooms },
    { name: "Reserviert", value: dashboardDisplay.reservedRooms },
    { name: "Frei", value: dashboardDisplay.freeRooms },
  ];

  const monthlyChartData = useMemo(() => {
    if (!profitSixMonth || profitSixMonth.length !== 6) {
      return Array.from({ length: 6 }, (_, index) => {
        const monthDate = addMonths(startOfMonth(activeMonth), index - 2);
        return {
          month: monthDate.toLocaleDateString("de-CH", { month: "short" }),
          umsatz: null,
        };
      });
    }
    return profitSixMonth.map((profitData, index) => {
      const monthDate = addMonths(startOfMonth(activeMonth), index - 2);
      return {
        month: monthDate.toLocaleDateString("de-CH", { month: "short" }),
        umsatz: sumFilteredProfitField(profitData, filteredUnits, "revenue"),
      };
    });
  }, [profitSixMonth, activeMonth, filteredUnits]);

  const revenueTrend = getTrendLabel(
    monthlyChartData[5]?.umsatz ?? 0,
    monthlyChartData[4]?.umsatz ?? 0
  );

  const profitTrend = null;

  const costTrend = null;

  const occupancyTrend = null;

  return (
    <div className="-m-6 min-h-screen bg-[#07090f] p-6 text-[#eef2ff] md:p-8">
      <div className="mx-auto max-w-[1800px] space-y-8">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[1px] text-[#6b7a9a]">
              Vantio
            </p>
            <h2 className="mt-2 text-[22px] font-bold tracking-tight text-[#eef2ff] md:text-[24px]">
              Co-Living Dashboard
            </h2>
            <p className="mt-3 max-w-3xl text-[12px] text-[#6b7a9a]">
              Übersicht über aktuelle Belegung, Kosten, Umsatz, Gewinn und die
              wichtigsten operativen Signale deiner Co-Living Units.
            </p>

            <div className="mt-4">
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                className="rounded-[8px] border border-white/[0.08] bg-[#111520] px-3 py-2 text-sm text-[#eef2ff]"
              >
                <option value="month">Dieser Monat</option>
                <option value="lastMonth">Letzter Monat</option>
                <option value="year">Dieses Jahr</option>
                <option value="all">Alle Zeit</option>
              </select>
            </div>
          </div>

          {activeMonth > startOfMonth(new Date()) && (
            <div className="rounded-[10px] border border-amber-500/[0.15] bg-amber-500/[0.06] px-4 py-3 text-[13px] text-[#fbbf24]">
              Zukunftsmonat gewählt: Diese Werte sind eine Prognose auf Basis
              aktueller Belegungen, Reservierungen und bekannter Kosten.
            </div>
          )}

          <div className="flex items-center gap-2">
            <span className="rounded-full border border-white/[0.1] bg-white/[0.06] px-3 py-1.5 text-[11px] font-bold text-[#6b7a9a]">
              Live KPI
            </span>
            <span className="rounded-full border border-white/[0.1] bg-white/[0.06] px-3 py-1.5 text-[11px] font-bold text-[#6b7a9a]">
              Co-Living only
            </span>
          </div>
        </div>

        <SectionCard
          title="Global Filter"
          subtitle="Filtere das Dashboard nach Zeitraum, Ort und einzelner Unit"
        >
          <div className="flex flex-col lg:flex-row gap-4">
            <FilterSelect
              label="Zeitraum"
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
            >
              <option value="lastMonth">Letzter Monat</option>
              <option value="thisMonth">Dieser Monat</option>
              <option value="nextMonth">Nächster Monat</option>
              <option value="customMonth">Monat auswählen</option>
            </FilterSelect>

            {selectedPeriod === "customMonth" && (
              <FilterSelect
                label="Monat"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
              >
                <option value="">Monat wählen</option>
                <option value="2026-01">Jan 2026</option>
                <option value="2026-02">Feb 2026</option>
                <option value="2026-03">Mär 2026</option>
                <option value="2026-04">Apr 2026</option>
                <option value="2026-05">Mai 2026</option>
                <option value="2026-06">Jun 2026</option>
                <option value="2026-07">Jul 2026</option>
                <option value="2026-08">Aug 2026</option>
                <option value="2026-09">Sep 2026</option>
                <option value="2026-10">Okt 2026</option>
                <option value="2026-11">Nov 2026</option>
                <option value="2026-12">Dez 2026</option>
              </FilterSelect>
            )}

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
              label="Unit"
              value={selectedUnitId}
              onChange={(e) => setSelectedUnitId(e.target.value)}
            >
              <option value="all">Alle Units</option>
              {allCoLivingUnits
                .filter(
                  (unit) =>
                    selectedPlace === "all" || unit.place === selectedPlace
                )
                .map((unit) => (
                  <option key={unit.unitId} value={unit.unitId}>
                    {unit.unitId}
                  </option>
                ))}
            </FilterSelect>
          </div>
        </SectionCard>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
          <HeroCard
            title="Aktueller Umsatz"
            value={formatChfOrDash(heroCurrentRevenueBackend)}
            subtitle="Prorierter Mietumsatz (Backend) für den gewählten Monat"
            accent="orange"
            trend={revenueTrend}
          />
          <HeroCard
            title="Gewinn aktuell"
            value={formatChfOrDash(dashboard.currentProfit)}
            subtitle="Umsatz minus laufende Ausgaben"
            accent="green"
            trend={profitTrend}
          />
          <HeroCard
            title="Aktuelle Ausgaben"
            value={formatChfOrDash(dashboard.runningCosts)}
            subtitle="Miete an Vermieter, Nebenkosten und Reinigung"
            accent="slate"
            trend={costTrend}
          />
          <HeroCard
            title="Belegt in %"
            value={formatPercent(dashboardDisplay.occupiedRate)}
            subtitle="Aktuelle Auslastung über alle Rooms"
            accent="rose"
            trend={occupancyTrend}
          />
        </div>

        <SectionCard
          title="Forecast"
          subtitle="Vorausschau basierend auf belegten Rooms, Reservierungen und laufenden Kosten"
          rightSlot={<RankingBadge value={selectedPeriod} type="blue" />}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-5">
            <HeroCard
              title="Forecast Umsatz"
              value={formatChfOrDash(forecast.forecastRevenue)}
              subtitle="Erwarteter Umsatz im gewählten Zeitraum"
              accent="blue"
            />
            <HeroCard
              title="Forecast Gewinn"
              value={formatChfOrDash(forecast.forecastProfit)}
              subtitle="Erwarteter Gewinn nach Kosten"
              accent="green"
            />
            <HeroCard
              title="Forecast Kosten"
              value={formatChfOrDash(forecast.forecastCosts)}
              subtitle="Erwartete laufende Kosten im gewählten Zeitraum"
              accent="slate"
            />
            <HeroCard
              title="Forecast Belegung %"
              value={formatPercent(forecast.expectedOccupancyRate)}
              subtitle="Belegt + gewichtete Reservierungen"
              accent="amber"
            />
            <HeroCard
              title="Kritische Units"
              value={forecast.criticalUnits}
              subtitle="Negativer Gewinn oder tiefe erwartete Belegung"
              accent="rose"
            />
          </div>
        </SectionCard>

        {firstFilteredUnit && (
          <SectionCard
            title="Raumstatus (Karte)"
            subtitle={`Belegung: ${firstFilteredUnit.place || firstFilteredUnit.unitId || "Unit"} – Belegt (grün), Reserviert (gelb), Frei (rot)`}
          >
            <OccupancyMap
              unit={firstFilteredUnit}
              rooms={rooms}
              occupancyData={occupancyRoomsMap}
            />
          </SectionCard>
        )}

        <SectionCard
          title="Automatische Warnungen"
          subtitle="Früherkennung für Leerstand, Risiken und schwache Units"
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {dashboardWarnings.map((warning, index) => (
              <div
                key={`${warning.title}-${index}`}
                className={`rounded-[10px] border p-4 ${
                  warning.type === "danger"
                    ? "border-red-500/20 bg-red-500/10"
                    : "border-amber-500/[0.15] bg-amber-500/[0.06]"
                }`}
              >
                <p
                  className={`text-[13px] font-semibold ${
                    warning.type === "danger"
                      ? "text-red-400"
                      : "text-[#fbbf24]"
                  }`}
                >
                  {warning.title}
                </p>
                <p
                  className={`mt-2 text-[13px] font-medium text-[#6b7a9a] ${
                    warning.type === "danger" ? "" : ""
                  }`}
                >
                  {warning.text}
                </p>
              </div>
            ))}

            {dashboardWarnings.length === 0 && (
              <div className="rounded-[10px] border border-green-500/20 bg-green-500/10 p-4">
                <p className="text-[13px] font-semibold text-green-400">
                  Keine kritischen Warnungen
                </p>
                <p className="mt-2 text-[13px] text-[#6b7a9a]">
                  Aktuell wurden keine dringenden Risiken erkannt.
                </p>
              </div>
            )}
          </div>
        </SectionCard>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <SectionCard
            title="Leerstand 7 Tage"
            subtitle="Geschätzter Leerstand über alle gefilterten Rooms"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <SmallStatCard
                label="Leerstandstage gesamt"
                value="—"
                hint="Nicht berechnet"
              />
              <SmallStatCard
                label="Umsatzverlust 7 Tage"
                value={formatChfOrDash(dashboard.lostRevenue7Days)}
                hint="Nicht berechnet"
              />
            </div>
          </SectionCard>

          <SectionCard
            title="Kurze Room-Status-Zusammenfassung"
            subtitle="Kompakter Überblick über den aktuellen Bestand"
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <SmallStatCard
                label="Belegt"
                value={dashboardDisplay.occupiedRooms}
                hint={`${formatPercent(dashboardDisplay.occupiedRate)} Auslastung`}
              />
              <SmallStatCard
                label="Reserviert"
                value={dashboardDisplay.reservedRooms}
                hint={`${formatPercent(dashboardDisplay.reservedRate)} reserviert`}
              />
              <SmallStatCard
                label="Frei"
                value={dashboardDisplay.freeRooms}
                hint={`${formatPercent(dashboardDisplay.freeRate)} frei`}
              />
            </div>
          </SectionCard>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          <div className="xl:col-span-5">
            <SectionCard
              title="Auslastung auf einen Blick"
              subtitle="So verteilt sich dein aktueller Room-Status"
              rightSlot={
                <RankingBadge
                  value={`${dashboardDisplay.totalRooms} Rooms`}
                  type="neutral"
                />
              }
            >
              <div className="space-y-5">
                <ProgressRow
                  label="Belegt"
                  value={dashboardDisplay.occupiedRate}
                  count={`${dashboardDisplay.occupiedRooms} Rooms`}
                  colorClass="bg-emerald-500"
                />
                <ProgressRow
                  label="Reserviert"
                  value={dashboardDisplay.reservedRate}
                  count={`${dashboardDisplay.reservedRooms} Rooms`}
                  colorClass="bg-amber-400"
                />
                <ProgressRow
                  label="Frei"
                  value={dashboardDisplay.freeRate}
                  count={`${dashboardDisplay.freeRooms} Rooms`}
                  colorClass="bg-rose-500"
                />
              </div>
            </SectionCard>
          </div>

          <div className="xl:col-span-3">
            <SectionCard
              title="Bestand & Kapazität"
              subtitle="Grundstruktur deiner Co-Living Einheiten"
            >
              <div className="grid grid-cols-1 gap-4">
                <SmallStatCard
                  label="Co-Living Units"
                  value={dashboard.unitsCount}
                  hint="Alle aktiven Co-Living Einheiten"
                />
                <SmallStatCard
                  label="Rooms gesamt"
                  value={dashboardDisplay.totalRooms}
                  hint="Gesamte Zimmerkapazität"
                />
                <SmallStatCard
                  label="Vollbelegte Units"
                  value={dashboard.fullUnits}
                  hint="Alle Rooms belegt"
                />
                <SmallStatCard
                  label="Teilbelegte Units"
                  value={dashboard.partialUnits}
                  hint="Mindestens 1 Room belegt"
                />
              </div>
            </SectionCard>
          </div>

          <div className="xl:col-span-4">
            <SectionCard
              title="Potenzial & Qualität"
              subtitle="Was heute schon läuft und was noch offen ist"
            >
              <div className="grid grid-cols-1 gap-4">
                <SmallStatCard
                  label="Vollbelegung Umsatz"
                  value={formatChfOrDash(dashboard.fullRevenue)}
                  hint="Maximum bei 100% Auslastung"
                />
                <SmallStatCard
                  label="Leerstand"
                  value={formatChfOrDash(dashboard.vacancyLoss)}
                  hint="Fehlender Umsatz durch freie Rooms"
                />
                <SmallStatCard
                  label="Ø Umsatz pro Room"
                  value={formatChfOrDash(dashboard.averageRevenuePerRoom)}
                  hint="Aktueller Durchschnitt über alle Rooms"
                />
                <SmallStatCard
                  label="Ø Gewinn pro Unit"
                  value={formatChfOrDash(dashboard.averageProfitPerUnit)}
                  hint="Aktueller Durchschnitt über alle Co-Living Units"
                />
              </div>
            </SectionCard>
          </div>
        </div>

        <SectionCard
          title="Monatlicher Umsatz-Forecast"
          subtitle="Voraussichtlicher Umsatz und freie Kapazität auf Basis sicherer, reservierter und risikobehafteter Monate"
        >
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead className="bg-[#111520]">
                <tr className="text-left">
                  <th className="py-3 pr-4 text-[9px] font-bold uppercase tracking-[0.8px] text-[#6b7a9a]">
                    Monat
                  </th>
                  <th className="py-3 pr-4 text-[9px] font-bold uppercase tracking-[0.8px] text-[#6b7a9a]">
                    Sicher
                  </th>
                  <th className="py-3 pr-4 text-[9px] font-bold uppercase tracking-[0.8px] text-[#6b7a9a]">
                    Reserviert
                  </th>
                  <th className="py-3 pr-4 text-[9px] font-bold uppercase tracking-[0.8px] text-[#6b7a9a]">
                    Risiko
                  </th>
                  <th className="py-3 pr-4 text-[9px] font-bold uppercase tracking-[0.8px] text-[#6b7a9a]">
                    Offenes Potenzial
                  </th>
                  <th className="py-3 pr-4 text-[9px] font-bold uppercase tracking-[0.8px] text-[#6b7a9a]">
                    Forecast Umsatz
                  </th>
                </tr>
              </thead>
              <tbody>
                {monthlyRevenueForecast.map((row) => (
                  <tr
                    key={row.month}
                    className="border-b border-white/[0.05] text-[13px] text-[#eef2ff]"
                  >
                    <td className="py-4 pr-4 font-semibold text-[#eef2ff]">
                      {row.month}
                    </td>
                    <td className="py-4 pr-4 font-medium text-[#4ade80]">
                      {formatChfOrDash(row.secureRevenue)}
                    </td>
                    <td className="py-4 pr-4 font-medium text-[#7aaeff]">
                      {formatChfOrDash(row.reservedRevenue)}
                    </td>
                    <td className="py-4 pr-4 font-medium text-[#fbbf24]">
                      {formatChfOrDash(row.riskRevenue)}
                    </td>
                    <td className="py-4 pr-4 font-medium text-[#f87171]">
                      {formatChfOrDash(row.freeRevenue)}
                    </td>
                    <td className="py-4 pr-4 font-bold text-[#eef2ff]">
                      {formatChfOrDash(row.forecastRevenue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          <div className="xl:col-span-8">
            <SectionCard
              title="Monatsverlauf"
              subtitle="Berechnet auf Basis des gewählten Monatsfilters und der Room-Daten."
            >
              <div className="h-[420px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={monthlyChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                    <XAxis
                      dataKey="month"
                      tick={{ fill: "#6b7a9a", fontSize: 12 }}
                    />
                    <YAxis tick={{ fill: "#6b7a9a", fontSize: 12 }} />
                    <Tooltip
                      formatter={(value) =>
                        value === null || value === undefined
                          ? "-"
                          : formatCurrency(value)
                      }
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="umsatz"
                      name="Umsatz"
                      stroke="#f97316"
                      strokeWidth={4}
                      dot={{ r: 3 }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </SectionCard>
          </div>

          <div className="xl:col-span-4">
            <SectionCard
              title="Room-Status aktuell"
              subtitle="Live aus deinen Co-Living Rooms berechnet"
            >
              <div className="h-[420px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={roomStatusChartData} barCategoryGap={28}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                    <XAxis
                      dataKey="name"
                      tick={{ fill: "#6b7a9a", fontSize: 12 }}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fill: "#6b7a9a", fontSize: 12 }}
                    />
                    <Tooltip />
                    <Bar
                      dataKey="value"
                      name="Anzahl Rooms"
                      fill="#f97316"
                      radius={[12, 12, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </SectionCard>
          </div>
        </div>

        {dashboard.notStartedUnits > 0 && (
          <div className="rounded-[10px] border border-amber-500/[0.15] bg-amber-500/[0.06] p-4">
            <p className="text-[13px] text-[#fbbf24]">
              Hinweis: {dashboard.notStartedUnits} Unit(s) haben einen zukünftigen
              Mietstart beim Vermieter. Diese laufenden Kosten werden aktuell
              noch nicht in die Live-Ausgaben einberechnet.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminCoLivingDashboardPage;