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
import { fetchAdminUnits, fetchAdminRooms, fetchAdminOccupancy, fetchAdminOccupancyRooms, fetchAdminRevenueForecast, normalizeUnit, normalizeRoom } from "../../api/adminData";
import OccupancyMap from "../../components/OccupancyMap";

const DEFAULT_MIN_STAY_MONTHS = 3;
const DEFAULT_NOTICE_PERIOD_MONTHS = 3;
const MONTH_FORECAST_COUNT = 6;

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

function formatMonthLabel(date) {
  return date.toLocaleDateString("de-CH", {
    month: "short",
    year: "2-digit",
  });
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

function isDateAfter(dateA, dateB) {
  if (!dateA) return false;
  return new Date(dateA) > new Date(dateB);
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

  const fullRevenue = rooms.reduce(
    (sum, room) => sum + Number(room.priceMonthly || 0),
    0
  );

  const currentRevenue = occupiedRooms.reduce(
    (sum, room) => sum + Number(room.priceMonthly || 0),
    0
  );

  return {
    occupiedCount: occupiedRooms.length,
    reservedCount: reservedRooms.length,
    freeCount: freeRooms.length,
    totalRooms: rooms.length,
    fullRevenue,
    currentRevenue,
    vacancyLoss: Math.max(fullRevenue - currentRevenue, 0),
    currentProfit: null,
    runningCosts: null,
    isFullyOccupied:
      rooms.length > 0 && occupiedRooms.length === rooms.length,
    isPartiallyOccupied:
      occupiedRooms.length > 0 && occupiedRooms.length < rooms.length,
    leaseStarted,
  };
}

function getRoomMonthType(room, monthIndex) {
  const targetMonth = addMonths(startOfMonth(new Date()), monthIndex);
  const monthStart = getMonthStart(targetMonth);
  const monthEnd = getMonthEnd(targetMonth);

  if (room.status === "Frei") return "free";

  if (room.status === "Reserviert") {
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

    if (!reservedFrom && !reservedUntil) return monthIndex <= 1 ? "reserved" : "free";
    if (!reservedFrom && reservedUntil) {
      return isDateOnOrAfter(reservedUntil, monthStart) ? "reserved" : "free";
    }

    return overlapsMonth(reservedFrom, reservedUntil, monthStart, monthEnd)
      ? "reserved"
      : "free";
  }

  if (room.status === "Belegt") {
    if (!room.moveInDate || room.moveInDate === "-") return "free";

    const moveOutDate =
      room.moveOutDate && room.moveOutDate !== "-" ? room.moveOutDate : null;

    if (moveOutDate) {
      return overlapsMonth(room.moveInDate, moveOutDate, monthStart, monthEnd)
        ? "secure"
        : "free";
    }

    const minimumStayMonths = Number(
      room.minimumStayMonths || DEFAULT_MIN_STAY_MONTHS
    );
    const noticePeriodMonths = Number(
      room.noticePeriodMonths || DEFAULT_NOTICE_PERIOD_MONTHS
    );
    const secureMonths = minimumStayMonths + noticePeriodMonths;

    const moveIn = new Date(room.moveInDate);
    const monthsDiff =
      (monthStart.getFullYear() - moveIn.getFullYear()) * 12 +
      (monthStart.getMonth() - moveIn.getMonth());

    if (monthsDiff < 0) return "free";
    if (monthsDiff < secureMonths) return "secure";
    if (monthsDiff === secureMonths) return "risk";
    return "free";
  }

  return "free";
}

function buildMonthlyForecast(units, allRooms = []) {
  const baseMonth = startOfMonth(new Date());

  return Array.from({ length: MONTH_FORECAST_COUNT }, (_, index) => {
    const monthDate = addMonths(baseMonth, index);

    let secureRevenue = 0;
    let reservedRevenue = 0;
    let riskRevenue = 0;
    let freeRevenue = 0;

    units.forEach((unit) => {
      const rooms = getRoomsForUnit(unit.unitId || unit.id, allRooms);

      if (rooms.length === 0) {
        return;
      }

      rooms.forEach((room) => {
        const roomValue = Number(room.priceMonthly || 0);
        const type = getRoomMonthType(room, index);

        if (type === "secure") secureRevenue += roomValue;
        if (type === "reserved") reservedRevenue += roomValue;
        if (type === "risk") riskRevenue += roomValue * 0.5;
        if (type === "free") freeRevenue += roomValue;
      });
    });

    return {
      month: formatMonthLabel(monthDate),
      secureRevenue,
      reservedRevenue,
      riskRevenue,
      freeRevenue,
      forecastRevenue: secureRevenue + reservedRevenue + riskRevenue,
    };
  });
}

function buildWarnings(units, rankedUnits, activeMonth, allRooms = []) {
  const warnings = [];

  rankedUnits.forEach((unit) => {
    if (unit.currentRevenue != null && unit.currentRevenue <= 0) {
      warnings.push({
        type: "danger",
        title: `${unit.unitId} · ${unit.place}`,
        text: "Keine aktuellen Einnahmen vorhanden.",
      });
    }

    if (unit.breakEvenGap != null && unit.breakEvenGap < 0) {
      warnings.push({
        type: "danger",
        title: `${unit.unitId} · ${unit.place}`,
        text: `Unter Break-Even um ${formatCurrency(
          Math.abs(unit.breakEvenGap)
        )}.`,
      });
    }

    if (unit.freeCount > 0) {
      warnings.push({
        type: "warning",
        title: `${unit.unitId} · ${unit.place}`,
        text: `${unit.freeCount} freie Rooms ohne aktuelle Belegung.`,
      });
    }

    if (unit.vacancyDays > 0) {
      warnings.push({
        type: "warning",
        title: `${unit.unitId} · ${unit.place}`,
        text: `${unit.vacancyDays} Leerstandstage in der Vorschau erkannt.`,
      });
    }
  });

  units.forEach((unit) => {
    if (!hasLeaseStarted(unit)) {
      const metrics = getCoLivingMetricsForMonth(unit, activeMonth, allRooms);
      if (
        metrics.currentRevenue != null &&
        metrics.currentRevenue <= 0
      ) {
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
  const [revenueForecastApi, setRevenueForecastApi] = useState(null);
  const [occupancyRoomsMap, setOccupancyRoomsMap] = useState(null);

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
    const y = new Date().getFullYear();
    fetchAdminRevenueForecast({ year: y })
      .then((data) => setRevenueForecastApi(data))
      .catch(() => setRevenueForecastApi(null));
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
      vacancyDays: 0,
      lostRevenue7Days: 0,
    };

    const unitPerformance = filteredUnits.map((unit) => {
      const metrics = getCoLivingMetricsForMonth(unit, activeMonth, rooms);
      const unitRooms = getRoomsForUnit(unit.unitId || unit.id, rooms);

      const unitVacancyDays = unitRooms.reduce((sum, room) => {
        if (room.status === "Frei") return sum + 7;
        if (room.status === "Reserviert") return sum + 4;
        return sum;
      }, 0);

      const unitLostRevenue7Days = unitRooms.reduce((sum, room) => {
        const monthly = Number(room.priceMonthly || 0);
        const dailyRate = monthly / 30;

        if (room.status === "Frei") return sum + dailyRate * 7;
        if (room.status === "Reserviert") return sum + dailyRate * 4;
        return sum;
      }, 0);

      const occupancyRate =
        metrics.totalRooms > 0
          ? (metrics.occupiedCount / metrics.totalRooms) * 100
          : 0;

      totals.totalRooms += metrics.totalRooms;
      totals.occupiedRooms += metrics.occupiedCount;
      totals.reservedRooms += metrics.reservedCount;
      totals.freeRooms += metrics.freeCount;
      if (metrics.fullRevenue != null) {
        totals.fullRevenue =
          (totals.fullRevenue ?? 0) + metrics.fullRevenue;
      }
      if (metrics.currentRevenue != null) {
        totals.currentRevenue =
          (totals.currentRevenue ?? 0) + metrics.currentRevenue;
      }
      if (metrics.vacancyLoss != null) {
        totals.vacancyLoss =
          (totals.vacancyLoss ?? 0) + metrics.vacancyLoss;
      }
      totals.vacancyDays += unitVacancyDays;
      totals.lostRevenue7Days += unitLostRevenue7Days;

      if (metrics.isFullyOccupied) totals.fullUnits += 1;
      if (metrics.isPartiallyOccupied) totals.partialUnits += 1;
      if (!metrics.leaseStarted) totals.notStartedUnits += 1;

      return {
        unitId: unit.unitId,
        place: unit.place,
        totalRooms: metrics.totalRooms,
        occupiedCount: metrics.occupiedCount,
        reservedCount: metrics.reservedCount,
        freeCount: metrics.freeCount,
        occupancyRate,
        currentRevenue: metrics.currentRevenue,
        currentProfit: metrics.currentProfit,
        vacancyLoss: metrics.vacancyLoss,
        runningCosts: metrics.runningCosts,
        fullRevenue: metrics.fullRevenue,
        breakEvenRevenue: metrics.runningCosts,
        breakEvenGap:
          metrics.currentRevenue != null && metrics.runningCosts != null
            ? metrics.currentRevenue - metrics.runningCosts
            : null,
        vacancyDays: unitVacancyDays,
        lostRevenue7Days: unitLostRevenue7Days,
      };
    });

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
    const averageProfitPerUnit = null;

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
  }, [filteredUnits, activeMonth, rooms]);

  const forecast = useMemo(() => {
    let forecastRevenue = null;
    let forecastOccupiedRooms = 0;
    let forecastReservedRooms = 0;
    let forecastTotalRooms = 0;
    let criticalUnits = 0;

    filteredUnits.forEach((unit) => {
      const metrics = getCoLivingMetricsForMonth(unit, activeMonth, rooms);
      const totalRooms = Number(metrics.totalRooms || 0);
      const occupiedCount = Number(metrics.occupiedCount || 0);
      const reservedCount = Number(metrics.reservedCount || 0);
      const fullRevenue =
        metrics.fullRevenue != null ? Number(metrics.fullRevenue) : null;

      let reservedWeight = 1;
      if (selectedPeriod === "thisMonth") reservedWeight = 0.35;
      if (selectedPeriod === "nextMonth") reservedWeight = 0.7;
      if (selectedPeriod === "customMonth") reservedWeight = 0.7;

      if (fullRevenue == null || totalRooms <= 0) {
        forecastOccupiedRooms += occupiedCount;
        forecastReservedRooms += reservedCount * reservedWeight;
        forecastTotalRooms += totalRooms;
        return;
      }

      const roomValue = fullRevenue / totalRooms;
      const expectedBookedRooms = Math.min(
        occupiedCount + reservedCount * reservedWeight,
        totalRooms
      );

      const expectedRevenue = roomValue * expectedBookedRooms;

      forecastRevenue = (forecastRevenue ?? 0) + expectedRevenue;
      forecastOccupiedRooms += occupiedCount;
      forecastReservedRooms += reservedCount * reservedWeight;
      forecastTotalRooms += totalRooms;

      if (expectedBookedRooms / Math.max(totalRooms, 1) < 0.5) {
        criticalUnits += 1;
      }
    });

    const expectedOccupancyRate =
      forecastTotalRooms > 0
        ? ((forecastOccupiedRooms + forecastReservedRooms) / forecastTotalRooms) *
          100
        : 0;

    return {
      forecastRevenue,
      forecastCosts: null,
      forecastProfit: null,
      expectedOccupancyRate,
      criticalUnits,
    };
  }, [filteredUnits, selectedPeriod, activeMonth, rooms]);

  const monthlyRevenueForecast = useMemo(() => {
    if (revenueForecastApi && Array.isArray(revenueForecastApi.by_month) && revenueForecastApi.by_month.length > 0) {
      return revenueForecastApi.by_month.slice(0, 6).map((m) => ({
        month: new Date(m.year, m.month - 1, 1).toLocaleDateString("de-CH", { month: "short" }),
        secureRevenue: m.expected_revenue,
        reservedRevenue: 0,
        riskRevenue: 0,
        freeRevenue: 0,
        forecastRevenue: m.expected_revenue,
      }));
    }
    return buildMonthlyForecast(filteredUnits, rooms);
  }, [filteredUnits, rooms, revenueForecastApi]);

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

  const dashboardWarnings = useMemo(() => {
    return buildWarnings(filteredUnits, dashboard.rankedUnits, activeMonth, rooms);
  }, [filteredUnits, dashboard.rankedUnits, activeMonth, rooms]);

  const roomStatusChartData = [
    { name: "Belegt", value: dashboardDisplay.occupiedRooms },
    { name: "Reserviert", value: dashboardDisplay.reservedRooms },
    { name: "Frei", value: dashboardDisplay.freeRooms },
  ];

  const monthlyChartData = useMemo(() => {
    return Array.from({ length: 6 }, (_, index) => {
      const monthDate = addMonths(startOfMonth(activeMonth), index - 2);
      let umsatz = null;

      filteredUnits.forEach((unit) => {
        const metrics = getCoLivingMetricsForMonth(unit, monthDate, rooms);
        if (metrics.currentRevenue != null) {
          umsatz = (umsatz ?? 0) + metrics.currentRevenue;
        }
      });

      return {
        month: monthDate.toLocaleDateString("de-CH", { month: "short" }),
        umsatz,
      };
    });
  }, [filteredUnits, activeMonth, rooms]);

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
              FeelAtHomeNow Admin
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
            value={formatChfOrDash(dashboard.currentRevenue)}
            subtitle="Nur belegte Rooms werden als Umsatz gerechnet"
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
                value={dashboard.vacancyDays}
                hint="Version 1 auf Basis von Room-Status"
              />
              <SmallStatCard
                label="Umsatzverlust 7 Tage"
                value={formatChfOrDash(dashboard.lostRevenue7Days)}
                hint="Geschätzter Verlust durch frei / reserviert"
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