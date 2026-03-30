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
  normalizeUnit,
  normalizeRoom,
} from "../../api/adminData";
import OccupancyMap from "../../components/OccupancyMap";

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

function isDateOnOrAfter(dateA, dateB) {
  if (!dateA) return false;
  return new Date(dateA) >= new Date(dateB);
}

function overlapsMonth(startDate, endDate, monthStart, monthEnd) {
  if (!startDate) return false;

  const start = new Date(startDate);
  const end = endDate ? new Date(endDate) : null;

  if (start > monthEnd) return false;
  if (end && end < monthStart) return false;

  return true;
}

function getRoomsForUnit(unitId, allRooms = []) {
  return allRooms.filter((room) => (room.unitId || room.unit_id) === unitId);
}

function getCoLivingMetricsForMonth(unit, activeMonth, allRooms = []) {
  const rooms = getRoomsForUnit(unit.unitId || unit.id, allRooms);
  const monthStart = getMonthStart(activeMonth);
  const monthEnd = getMonthEnd(activeMonth);
  const leaseStarted = hasLeaseStarted(unit);

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

  const occupiedRooms = rooms.filter((room) => {
    if (room.status !== "Belegt") return false;
    if (!room.moveInDate || room.moveInDate === "-") return false;

    const moveInDate = room.moveInDate;
    const moveOutDate =
      room.moveOutDate && room.moveOutDate !== "-" ? room.moveOutDate : null;

    return overlapsMonth(moveInDate, moveOutDate, monthStart, monthEnd);
  });

  const reservedRooms = rooms.filter((room) => {
    if (room.status !== "Reserviert") return false;

    const reservedFrom =
      room.reservedFrom && room.reservedFrom !== "-"
        ? room.reservedFrom
        : room.moveInDate && room.moveInDate !== "-"
        ? room.moveInDate
        : null;

    const reservedUntil =
      room.reservedUntil && room.reservedUntil !== "-"
        ? room.reservedUntil
        : null;

    if (!reservedFrom && !reservedUntil) return true;
    if (!reservedFrom && reservedUntil) {
      return isDateOnOrAfter(reservedUntil, monthStart);
    }

    return overlapsMonth(reservedFrom, reservedUntil, monthStart, monthEnd);
  });

  const freeRooms = rooms.filter((room) => {
    const isOccupiedInMonth =
      room.status === "Belegt" &&
      room.moveInDate &&
      room.moveInDate !== "-" &&
      overlapsMonth(
        room.moveInDate,
        room.moveOutDate && room.moveOutDate !== "-" ? room.moveOutDate : null,
        monthStart,
        monthEnd
      );

    const isReservedInMonth =
      room.status === "Reserviert" &&
      (() => {
        const reservedFrom =
          room.reservedFrom && room.reservedFrom !== "-"
            ? room.reservedFrom
            : room.moveInDate && room.moveInDate !== "-"
            ? room.moveInDate
            : null;

        const reservedUntil =
          room.reservedUntil && room.reservedUntil !== "-"
            ? room.reservedUntil
            : null;

        if (!reservedFrom && !reservedUntil) return true;
        if (!reservedFrom && reservedUntil) {
          return isDateOnOrAfter(reservedUntil, monthStart);
        }

        return overlapsMonth(
          reservedFrom,
          reservedUntil,
          monthStart,
          monthEnd
        );
      })();

    return !isOccupiedInMonth && !isReservedInMonth;
  });

  return {
    occupiedCount: occupiedRooms.length,
    reservedCount: reservedRooms.length,
    freeCount: freeRooms.length,
    totalRooms: rooms.length,
    fullRevenue: null,
    currentRevenue: null,
    vacancyLoss: null,
    currentProfit: null,
    runningCosts: null,
    isFullyOccupied:
      rooms.length > 0 && occupiedRooms.length === rooms.length,
    isPartiallyOccupied:
      occupiedRooms.length > 0 && occupiedRooms.length < rooms.length,
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
      card: "bg-gradient-to-br from-orange-50 to-white border-orange-100",
      value: "text-orange-600",
      dot: "bg-orange-500",
    },
    green: {
      card: "bg-gradient-to-br from-emerald-50 to-white border-emerald-100",
      value: "text-emerald-600",
      dot: "bg-emerald-500",
    },
    slate: {
      card: "bg-gradient-to-br from-slate-50 to-white border-slate-200",
      value: "text-slate-800",
      dot: "bg-slate-500",
    },
    rose: {
      card: "bg-gradient-to-br from-rose-50 to-white border-rose-100",
      value: "text-rose-600",
      dot: "bg-rose-500",
    },
    blue: {
      card: "bg-gradient-to-br from-sky-50 to-white border-sky-100",
      value: "text-sky-600",
      dot: "bg-sky-500",
    },
    amber: {
      card: "bg-gradient-to-br from-amber-50 to-white border-amber-100",
      value: "text-amber-600",
      dot: "bg-amber-500",
    },
  };

  const style = styles[accent] || styles.orange;

  return (
    <div className={`rounded-3xl border p-6 shadow-sm ${style.card}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${style.dot}`} />
            <p className="text-sm font-medium text-slate-500">{title}</p>
          </div>
          <p className={`text-5xl font-bold mt-4 tracking-tight ${style.value}`}>
            {value}
          </p>
          <p className="text-sm text-slate-500 mt-3">{subtitle}</p>
        </div>

        <div className="flex flex-col items-end gap-2">
          <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-white border border-slate-200 text-slate-600">
            Live
          </span>
          {trend ? (
            <span
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                trend.positive
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-rose-100 text-rose-700"
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
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          {subtitle ? (
            <p className="text-sm text-slate-500 mt-1">{subtitle}</p>
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
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="text-2xl font-bold text-slate-900 mt-2">{value}</p>
      {hint ? <p className="text-xs text-slate-400 mt-2">{hint}</p> : null}
    </div>
  );
}

function ProgressRow({
  label,
  value,
  count,
  colorClass,
  trackClass = "bg-slate-200",
}) {
  const safeValue = Math.max(0, Math.min(Number(value || 0), 100));

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-slate-700">{label}</p>
          <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600">
            {count}
          </span>
        </div>
        <p className="text-sm font-semibold text-slate-900">
          {formatPercent(safeValue)}
        </p>
      </div>
      <div className={`w-full h-3 rounded-full overflow-hidden ${trackClass}`}>
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
    success: "bg-emerald-100 text-emerald-700",
    warning: "bg-amber-100 text-amber-700",
    danger: "bg-rose-100 text-rose-700",
    neutral: "bg-slate-100 text-slate-700",
    blue: "bg-sky-100 text-sky-700",
  };

  return (
    <span
      className={`px-2.5 py-1 rounded-full text-xs font-semibold ${styles[type]}`}
    >
      {value}
    </span>
  );
}

function FilterSelect({ label, value, onChange, children }) {
  return (
    <div className="min-w-[180px]">
      <label className="block text-xs font-semibold text-slate-500 mb-2">
        {label}
      </label>
      <select
        value={value}
        onChange={onChange}
        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-orange-500"
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
      const metrics = getCoLivingMetricsForMonth(unit, activeMonth, rooms);
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
    profitByUnitIdActive,
    profitForActiveMonth,
  ]);

  const dashboardDisplay = useMemo(() => {
    const base = dashboard;
    if (!occupancyApi || !occupancyApi.summary) return base;
    return {
      ...base,
      totalRooms: occupancyApi.summary.total_rooms ?? base.totalRooms,
      occupiedRooms: occupancyApi.summary.occupied_rooms ?? base.occupiedRooms,
      reservedRooms: occupancyApi.summary.reserved_rooms ?? base.reservedRooms,
      freeRooms: occupancyApi.summary.free_rooms ?? base.freeRooms,
      occupiedRate: occupancyApi.summary.occupancy_rate ?? base.occupiedRate,
    };
  }, [dashboard, occupancyApi]);

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
    const expectedOccupancyRate =
      occupancyApi?.summary?.occupancy_rate != null
        ? Number(occupancyApi.summary.occupancy_rate)
        : dashboard.occupiedRate;

    return {
      forecastRevenue,
      forecastCosts,
      forecastProfit,
      expectedOccupancyRate,
      criticalUnits,
    };
  }, [profitForActiveMonth, filteredUnits, occupancyApi, dashboard.occupiedRate]);

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
    <div className="min-h-screen bg-slate-50 -m-6 p-6 md:p-8">
      <div className="max-w-[1800px] mx-auto space-y-8">
        <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-6">
          <div>
            <p className="text-sm font-semibold text-orange-600">
              Vantio
            </p>
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-slate-900 mt-2">
              Co-Living Dashboard
            </h2>
            <p className="text-slate-500 mt-3 max-w-3xl">
              Übersicht über aktuelle Belegung, Kosten, Umsatz, Gewinn und die
              wichtigsten operativen Signale deiner Co-Living Units.
            </p>

            <div className="mt-4">
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white shadow-sm"
              >
                <option value="month">Dieser Monat</option>
                <option value="lastMonth">Letzter Monat</option>
                <option value="year">Dieses Jahr</option>
                <option value="all">Alle Zeit</option>
              </select>
            </div>
          </div>

          {activeMonth > startOfMonth(new Date()) && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Zukunftsmonat gewählt: Diese Werte sind eine Prognose auf Basis
              aktueller Belegungen, Reservierungen und bekannter Kosten.
            </div>
          )}

          <div className="flex items-center gap-2">
            <span className="px-3 py-1.5 rounded-full bg-white border border-slate-200 text-sm font-medium text-slate-600">
              Live KPI
            </span>
            <span className="px-3 py-1.5 rounded-full bg-white border border-slate-200 text-sm font-medium text-slate-600">
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
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {dashboardWarnings.map((warning, index) => (
              <div
                key={`${warning.title}-${index}`}
                className={`rounded-2xl border p-4 ${
                  warning.type === "danger"
                    ? "border-rose-200 bg-rose-50"
                    : "border-amber-200 bg-amber-50"
                }`}
              >
                <p
                  className={`text-sm font-semibold ${
                    warning.type === "danger"
                      ? "text-rose-700"
                      : "text-amber-700"
                  }`}
                >
                  {warning.title}
                </p>
                <p
                  className={`text-sm mt-2 ${
                    warning.type === "danger"
                      ? "text-rose-600"
                      : "text-amber-700"
                  }`}
                >
                  {warning.text}
                </p>
              </div>
            ))}

            {dashboardWarnings.length === 0 && (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-sm font-semibold text-emerald-700">
                  Keine kritischen Warnungen
                </p>
                <p className="text-sm text-emerald-600 mt-2">
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
                hint={`${formatPercent(dashboard.reservedRate)} reserviert`}
              />
              <SmallStatCard
                label="Frei"
                value={dashboardDisplay.freeRooms}
                hint={`${formatPercent(dashboard.freeRate)} frei`}
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
                  value={dashboard.reservedRate}
                  count={`${dashboardDisplay.reservedRooms} Rooms`}
                  colorClass="bg-amber-400"
                />
                <ProgressRow
                  label="Frei"
                  value={dashboard.freeRate}
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
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 text-sm">
                  <th className="py-3 pr-4">Monat</th>
                  <th className="py-3 pr-4">Sicher</th>
                  <th className="py-3 pr-4">Reserviert</th>
                  <th className="py-3 pr-4">Risiko</th>
                  <th className="py-3 pr-4">Offenes Potenzial</th>
                  <th className="py-3 pr-4">Forecast Umsatz</th>
                </tr>
              </thead>
              <tbody>
                {monthlyRevenueForecast.map((row) => (
                  <tr
                    key={row.month}
                    className="border-b border-slate-100 text-slate-700 hover:bg-slate-50"
                  >
                    <td className="py-4 pr-4 font-semibold text-slate-900">
                      {row.month}
                    </td>
                    <td className="py-4 pr-4 text-emerald-700 font-medium">
                      {formatChfOrDash(row.secureRevenue)}
                    </td>
                    <td className="py-4 pr-4 text-sky-700 font-medium">
                      {formatChfOrDash(row.reservedRevenue)}
                    </td>
                    <td className="py-4 pr-4 text-amber-700 font-medium">
                      {formatChfOrDash(row.riskRevenue)}
                    </td>
                    <td className="py-4 pr-4 text-rose-700 font-medium">
                      {formatChfOrDash(row.freeRevenue)}
                    </td>
                    <td className="py-4 pr-4 font-bold text-slate-900">
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
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis
                      dataKey="month"
                      tick={{ fill: "#64748b", fontSize: 12 }}
                    />
                    <YAxis tick={{ fill: "#64748b", fontSize: 12 }} />
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
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis
                      dataKey="name"
                      tick={{ fill: "#64748b", fontSize: 12 }}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fill: "#64748b", fontSize: 12 }}
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
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm text-amber-800">
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