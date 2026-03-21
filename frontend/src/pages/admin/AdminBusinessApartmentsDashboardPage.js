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
import {
  fetchAdminUnits,
  fetchAdminProfit,
  fetchAdminOccupancy,
  normalizeUnit,
  sanitizeClientErrorMessage,
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
  const [chartsLoading, setChartsLoading] = useState(true);
  const [chartsError, setChartsError] = useState("");
  const [financeChartData, setFinanceChartData] = useState([]);
  const [occupancyChartData, setOccupancyChartData] = useState([]);

  useEffect(() => {
    fetchAdminUnits()
      .then((data) => setUnits(Array.isArray(data) ? data.map(normalizeUnit) : []))
      .catch(() => setUnits([]));
  }, []);

  const businessUnits = useMemo(() => {
    return units.filter((unit) => unit.type === "Business Apartment");
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
      setChartsLoading(false);
      setChartsError("");
      return undefined;
    }
    const allowedIds = new Set(filteredUnits.map((u) => String(u.unitId || u.id)));
    const months = lastNMonths(6);
    setChartsLoading(true);
    setChartsError("");
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
        const occRows = months.map((m, idx) => {
          const o = occupancies[idx];
          const label = new Date(m.year, m.month - 1, 1).toLocaleDateString("de-CH", {
            month: "short",
          });
          let occupied = 0;
          let free = 0;
          for (const u of o?.units || []) {
            if (allowedIds.has(String(u.unit_id))) {
              occupied += Number(u.occupied_rooms || 0);
              free += Number(u.free_rooms || 0);
            }
          }
          return { month: label, occupied, free };
        });
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
        setChartsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filteredUnits]);

  const dashboard = useMemo(() => {
    let totalApartments = 0;
    let occupiedApartments = 0;
    let freeApartments = 0;
    let currentRevenue = 0;
    let runningCosts = 0;
    let currentProfit = 0;

    const performance = filteredUnits.map((unit) => {
      const apartmentRevenue = Number(unit.tenantPriceMonthly || 0);
      const apartmentCosts =
        Number(unit.landlordRentMonthly || 0) +
        Number(unit.utilitiesMonthly || 0) +
        Number(unit.cleaningCostMonthly || 0);

      const occupied = unit.status === "Belegt" || unit.status === "Occupied";
      const revenue = occupied ? apartmentRevenue : 0;
      const profit = revenue - apartmentCosts;

      totalApartments += 1;
      if (occupied) occupiedApartments += 1;
      if (!occupied) freeApartments += 1;
      currentRevenue += revenue;
      runningCosts += apartmentCosts;
      currentProfit += profit;

      return {
        unitId: unit.unitId,
        place: unit.place,
        title: unit.title || unit.unitId,
        revenue,
        costs: apartmentCosts,
        profit,
        occupied,
      };
    });

    const occupiedRate =
      totalApartments > 0 ? (occupiedApartments / totalApartments) * 100 : 0;

    const ranked = [...performance].sort((a, b) => b.profit - a.profit);

    return {
      totalApartments,
      occupiedApartments,
      freeApartments,
      currentRevenue,
      runningCosts,
      currentProfit,
      occupiedRate,
      bestUnit: ranked[0] || null,
      worstUnit: ranked[ranked.length - 1] || null,
      performance: ranked,
    };
  }, [filteredUnits]);

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

  return (
    <div className="min-h-screen bg-slate-50 -m-6 p-6 md:p-8">
      <div className="max-w-[1800px] mx-auto space-y-8">
        <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-6">
          <div>
            <p className="text-sm font-semibold text-orange-600">
              FeelAtHomeNow Admin
            </p>
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-slate-900 mt-2">
              Business-Apartment Dashboard
            </h2>
            <p className="text-slate-500 mt-3 max-w-3xl">
              Übersicht über Belegung, Umsatz, Gewinn und Performance deiner
              Business Apartments.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-3 py-1.5 rounded-full bg-white border border-slate-200 text-sm font-medium text-slate-600">
              Live KPI
            </span>
            <span className="px-3 py-1.5 rounded-full bg-white border border-slate-200 text-sm font-medium text-slate-600">
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
                    {unit.unitId}
                  </option>
                ))}
            </FilterSelect>
          </div>
        </SectionCard>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
          <HeroCard
            title="Aktueller Umsatz"
            value={formatCurrency(dashboard.currentRevenue)}
            subtitle="Umsatz aus aktuell belegten Apartments"
            accent="orange"
            trend={revenueTrend}
          />
          <HeroCard
            title="Gewinn aktuell"
            value={formatCurrency(dashboard.currentProfit)}
            subtitle="Umsatz minus laufende Ausgaben"
            accent="green"
            trend={profitTrend}
          />
          <HeroCard
            title="Aktuelle Ausgaben"
            value={formatCurrency(dashboard.runningCosts)}
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
            title="Finanzentwicklung letzte 6 Monate"
            subtitle="Umsatz, Kosten und Gewinn im zeitlichen Verlauf"
          >
            {chartsLoading ? (
              <p className="text-slate-500 py-8">Lade Monatsdaten…</p>
            ) : chartsError ? (
              <p className="text-rose-700 py-8">{chartsError}</p>
            ) : financeChartData.length === 0 ? (
              <p className="text-slate-500 py-8">Keine Daten vorhanden</p>
            ) : (
              <div className="h-[420px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={financeChartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="month" />
                    <YAxis />
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
            title="Belegung Apartments letzte 6 Monate"
            subtitle="Belegte und freie Apartments im Verlauf"
          >
            {chartsLoading ? (
              <p className="text-slate-500 py-8">Lade Monatsdaten…</p>
            ) : chartsError ? (
              <p className="text-rose-700 py-8">{chartsError}</p>
            ) : occupancyChartData.length === 0 ? (
              <p className="text-slate-500 py-8">Keine Daten vorhanden</p>
            ) : (
              <div className="h-[420px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={occupancyChartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="month" />
                    <YAxis allowDecimals={false} />
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
              value={dashboard.bestUnit ? dashboard.bestUnit.unitId : "-"}
              hint={
                dashboard.bestUnit
                  ? `${dashboard.bestUnit.place} · ${formatCurrency(
                      dashboard.bestUnit.profit
                    )} Gewinn`
                  : "Keine Daten vorhanden"
              }
            />
            <SmallStatCard
              label="Schwächstes Apartment"
              value={dashboard.worstUnit ? dashboard.worstUnit.unitId : "-"}
              hint={
                dashboard.worstUnit
                  ? `${dashboard.worstUnit.place} · ${formatCurrency(
                      dashboard.worstUnit.profit
                    )} Gewinn`
                  : "Keine Daten vorhanden"
              }
            />
            <SmallStatCard
              label="Ø Gewinn pro Apartment"
              value={
                dashboard.totalApartments > 0
                  ? formatCurrency(
                      dashboard.currentProfit / dashboard.totalApartments
                    )
                  : "CHF 0"
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
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 text-sm">
                  <th className="py-3 pr-4">Apartment</th>
                  <th className="py-3 pr-4">Ort</th>
                  <th className="py-3 pr-4">Status</th>
                  <th className="py-3 pr-4">Umsatz</th>
                  <th className="py-3 pr-4">Ausgaben</th>
                  <th className="py-3 pr-4">Gewinn</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.performance.map((unit) => (
                  <tr
                    key={unit.unitId}
                    className="border-b border-slate-100 text-slate-700 hover:bg-slate-50"
                  >
                    <td className="py-4 pr-4 font-semibold text-slate-900">
                      {unit.unitId}
                    </td>
                    <td className="py-4 pr-4">{unit.place}</td>
                    <td className="py-4 pr-4">
                      {unit.occupied ? (
                        <RankingBadge value="Belegt" type="success" />
                      ) : (
                        <RankingBadge value="Frei" type="danger" />
                      )}
                    </td>
                    <td className="py-4 pr-4 font-medium">
                      {formatCurrency(unit.revenue)}
                    </td>
                    <td className="py-4 pr-4 font-medium">
                      {formatCurrency(unit.costs)}
                    </td>
                    <td className="py-4 pr-4 font-medium">
                      {formatCurrency(unit.profit)}
                    </td>
                  </tr>
                ))}

                {dashboard.performance.length === 0 && (
                  <tr>
                    <td colSpan="6" className="py-8 text-center text-slate-500">
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