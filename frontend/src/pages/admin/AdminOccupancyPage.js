import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  fetchAdminUnits,
  fetchAdminRooms,
  fetchAdminOccupancy,
  fetchAdminOccupancyRooms,
  fetchAdminTenanciesAll,
  normalizeUnit,
  normalizeRoom,
} from "../../api/adminData";
import OccupancyMap from "../../components/OccupancyMap";
import {
  getRoomOccupancyStatus,
} from "../../utils/unitOccupancyStatus";

function formatPercent(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function StatCard({ label, value, hint, color = "slate" }) {
  const top = {
    slate: "border-t-slate-500",
    green: "border-t-green-500",
    amber: "border-t-amber-500",
    rose: "border-t-rose-500",
    blue: "border-t-blue-500",
  };
  const val = {
    slate: "text-[#0f172a] dark:text-[#eef2ff]",
    green: "text-emerald-700 dark:text-[#4ade80]",
    amber: "text-amber-700 dark:text-[#fbbf24]",
    rose: "text-rose-700 dark:text-[#f87171]",
    blue: "text-[#7aaeff]",
  };
  const shell = {
    slate: "",
    green: "bg-emerald-100 border-emerald-300",
    amber: "bg-amber-100 border-amber-300",
    rose: "bg-rose-100 border-rose-300",
    blue: "",
  };

  return (
    <div
      className={`relative overflow-hidden rounded-[14px] border border-black/10 bg-white border-t-4 dark:border-white/[0.07] dark:bg-[#141824] p-5 ${top[color]} ${shell[color] || ""}`}
    >
      <p className="text-[9px] font-bold uppercase tracking-[1px] text-[#64748b] dark:text-[#6b7a9a]">{label}</p>
      <p className={`mt-2 text-[24px] font-semibold ${val[color]}`}>{value}</p>
      {hint ? <p className="mt-2 text-[11px] text-[#64748b] dark:text-[#6b7a9a]">{hint}</p> : null}
    </div>
  );
}

function SectionCard({ title, subtitle, children }) {
  return (
    <div className="rounded-[14px] border border-black/10 bg-white dark:border-white/[0.07] dark:bg-[#141824] p-6">
      <div className="mb-5">
        <h3 className="text-[16px] font-bold text-[#0f172a] dark:text-[#eef2ff]">{title}</h3>
        {subtitle ? <p className="mt-1 text-[12px] text-[#64748b] dark:text-[#6b7a9a]">{subtitle}</p> : null}
      </div>
      {children}
    </div>
  );
}

function Badge({ children, type = "neutral", className = "" }) {
  const styles = {
    success: "border-green-500/20 bg-green-500/10 text-green-400",
    warning: "border-amber-500/20 bg-amber-500/10 text-amber-400",
    danger: "border-red-500/20 bg-red-500/10 text-red-400",
    info: "border-blue-500/20 bg-blue-500/10 text-[#7aaeff]",
    neutral: "border-black/10 bg-slate-100 text-[#64748b] dark:border-white/[0.1] dark:bg-white/[0.06] dark:text-[#6b7a9a]",
  };

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${styles[type]} ${className}`}>
      {children}
    </span>
  );
}

function getRoomsForUnit(unitId, allRooms) {
  return allRooms.filter((room) => room.unitId === unitId);
}

function getDisplayStatus(occupiedCount, reservedCount, totalRooms) {
  if (totalRooms === 0) return "Keine Rooms";
  if (occupiedCount === totalRooms) return "Voll belegt";
  if (occupiedCount === 0 && reservedCount === 0) return "Komplett frei";
  if (occupiedCount === 0 && reservedCount > 0) return "Reservierungen vorhanden";
  return "Teilbelegt";
}

function getStatusBadgeType(status) {
  if (status === "Voll belegt") return "success";
  if (status === "Teilbelegt") return "warning";
  if (status === "Komplett frei") return "danger";
  if (status === "Reservierungen vorhanden") return "info";
  return "neutral";
}

function getUnitDisplayLabel(unit) {
  if (unit.address && unit.city) {
    return `${unit.address}, ${unit.city}`;
  }
  if (unit.address) return unit.address;
  if (unit.name) return unit.name;
  return unit.unitId || unit.id;
}

function AdminOccupancyPage() {
  const [units, setUnits] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [tenancies, setTenancies] = useState([]);
  const [occupancyFromApi, setOccupancyFromApi] = useState(null);
  const [occupancyRoomsByUnit, setOccupancyRoomsByUnit] = useState({});
  const [onDate] = useState(() => new Date().toISOString().slice(0, 10));

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
      .then((data) => setOccupancyFromApi(data))
      .catch(() => setOccupancyFromApi(null));
  }, []);

  useEffect(() => {
    const coLiving = units.filter((u) => u.type === "Co-Living");
    if (coLiving.length === 0) return;
    let cancelled = false;
    coLiving.forEach((u) => {
      const unitId = u.id ?? u.unitId;
      if (!unitId) return;
      fetchAdminOccupancyRooms({ unit_id: unitId, on_date: onDate })
        .then((data) => {
          if (!cancelled) setOccupancyRoomsByUnit((prev) => ({ ...prev, [unitId]: data }));
        })
        .catch(() => {});
    });
    return () => { cancelled = true; };
  }, [units, onDate]);

  const coLivingUnits = useMemo(() => {
    return units.filter((unit) => unit.type === "Co-Living");
  }, [units]);

  const { apartmentsCount, coLivingCount } = useMemo(() => {
    let apt = 0;
    let cl = 0;
    for (const u of units) {
      if (String(u?.type || "").trim() === "Co-Living") cl += 1;
      else apt += 1;
    }
    return { apartmentsCount: apt, coLivingCount: cl };
  }, [units]);

  const occupancyRows = useMemo(() => {
    if (occupancyFromApi && Array.isArray(occupancyFromApi.units) && occupancyFromApi.units.length > 0) {
      const unitMap = new Map(units.map((u) => [u.id || u.unitId, u]));
      return occupancyFromApi.units.map((occ) => {
        const unit = unitMap.get(occ.unit_id);
        const occupiedCount = occ.occupied_rooms ?? 0;
        const reservedCount = occ.reserved_rooms ?? 0;
        const freeCount = occ.free_rooms ?? 0;
        const totalRooms = occ.total_rooms ?? 0;
        const occupancyRate = occ.occupancy_rate ?? (totalRooms ? (occupiedCount / totalRooms) * 100 : 0);
        const reservedRate = totalRooms ? (reservedCount / totalRooms) * 100 : 0;
        const displayStatus = getDisplayStatus(occupiedCount, reservedCount, totalRooms);
        return {
          unitId: occ.unit_id,
          unit: unit ?? null,
          place: unit ? unit.place || unit.city : occ.unit_id,
          address: unit ? unit.address : "",
          totalRooms,
          occupiedCount,
          reservedCount,
          freeCount,
          occupancyRate,
          reservedRate,
          displayStatus,
        };
      });
    }
    return coLivingUnits.map((unit) => {
      const unitRooms = getRoomsForUnit(unit.unitId, rooms);
      const totalRooms = unitRooms.length;
      let occupiedCount = 0;
      let reservedCount = 0;
      let freeCount = 0;
      for (const room of unitRooms) {
        const occ = getRoomOccupancyStatus(room, tenancies);
        if (occ === "belegt") occupiedCount += 1;
        else if (occ === "reserviert") reservedCount += 1;
        else freeCount += 1;
      }

      const occupancyRate =
        totalRooms > 0 ? (occupiedCount / totalRooms) * 100 : 0;

      const reservedRate =
        totalRooms > 0 ? (reservedCount / totalRooms) * 100 : 0;

      const displayStatus = getDisplayStatus(
        occupiedCount,
        reservedCount,
        totalRooms
      );

      return {
        unitId: unit.unitId,
        unit,
        place: unit.place,
        address: unit.address,
        totalRooms,
        occupiedCount,
        reservedCount,
        freeCount,
        occupancyRate,
        reservedRate,
        displayStatus,
      };
    });
  }, [occupancyFromApi, units, coLivingUnits, rooms, tenancies]);

  const summary = useMemo(() => {
    const totalRooms = occupancyRows.reduce((sum, row) => sum + row.totalRooms, 0);
    const occupiedRooms = occupancyRows.reduce((sum, row) => sum + row.occupiedCount, 0);
    const reservedRooms = occupancyRows.reduce((sum, row) => sum + row.reservedCount, 0);
    const freeRooms = occupancyRows.reduce((sum, row) => sum + row.freeCount, 0);

    const occupancyRate =
      totalRooms > 0 ? (occupiedRooms / totalRooms) * 100 : 0;

    return {
      totalRooms,
      occupiedRooms,
      reservedRooms,
      freeRooms,
      occupancyRate,
    };
  }, [occupancyRows]);

  const weakestUnits = useMemo(() => {
    return [...occupancyRows]
      .sort((a, b) => a.occupancyRate - b.occupancyRate)
      .slice(0, 5);
  }, [occupancyRows]);

  return (
    <div className="min-h-screen bg-[#f8fafc] text-[#0f172a] [color-scheme:light] dark:bg-[#07090f] dark:text-[#eef2ff] dark:[color-scheme:dark]">
      <div className="mx-auto max-w-[min(1400px,100%)] space-y-6 p-6">
      <div>
        <p className="text-[9px] font-bold uppercase tracking-[1px] text-[#64748b] dark:text-[#6b7a9a]">Vantio</p>
        <h2 className="mt-1 text-[22px] font-bold text-[#0f172a] dark:text-[#eef2ff]">Belegung</h2>
        <p className="mt-1 text-[12px] text-[#64748b] dark:text-[#6b7a9a]">
          Übersicht über Auslastung, freie Zimmer, Reservierungen und Belegungsquote
          für Apartments und Co-Living Units.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard
          label="Apartments"
          value={apartmentsCount}
          hint="Units ohne Typ Co-Living"
          color="slate"
        />
        <StatCard
          label="Co-Living Units"
          value={coLivingCount}
          hint="Typ Co-Living"
          color="slate"
        />
        <StatCard
          label="Rooms gesamt"
          value={summary.totalRooms}
          hint="Erfasste Zimmerkapazität"
          color="blue"
        />
        <StatCard
          label="Belegt"
          value={summary.occupiedRooms}
          hint="Aktuell belegte Rooms"
          color="green"
        />
        <StatCard
          label="Reserviert"
          value={summary.reservedRooms}
          hint="Noch nicht eingezogen"
          color="amber"
        />
        <StatCard
          label="Belegungsquote"
          value={formatPercent(summary.occupancyRate)}
          hint="Nur belegte Rooms"
          color="rose"
        />
      </div>

      <SectionCard
        title="Belegungsübersicht pro Unit"
        subtitle="Hier siehst du sofort, welche Units stark laufen und wo Leerstand besteht."
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-[#0f172a] dark:text-[#eef2ff]">
            <thead className="bg-slate-100 dark:bg-[#111520]">
              <tr>
                <th className="py-3 pr-4 text-[9px] font-bold uppercase tracking-[0.8px] text-[#64748b] dark:text-[#6b7a9a]">
                  Unit
                </th>
                <th className="py-3 pr-4 text-[9px] font-bold uppercase tracking-[0.8px] text-[#64748b] dark:text-[#6b7a9a]">
                  Ort
                </th>
                <th className="py-3 pr-4 text-[9px] font-bold uppercase tracking-[0.8px] text-[#64748b] dark:text-[#6b7a9a]">
                  Adresse
                </th>
                <th className="py-3 pr-4 text-[9px] font-bold uppercase tracking-[0.8px] text-[#64748b] dark:text-[#6b7a9a]">
                  Rooms gesamt
                </th>
                <th className="py-3 pr-4 text-[9px] font-bold uppercase tracking-[0.8px] text-[#64748b] dark:text-[#6b7a9a]">
                  Belegt
                </th>
                <th className="py-3 pr-4 text-[9px] font-bold uppercase tracking-[0.8px] text-[#64748b] dark:text-[#6b7a9a]">
                  Reserviert
                </th>
                <th className="py-3 pr-4 text-[9px] font-bold uppercase tracking-[0.8px] text-[#64748b] dark:text-[#6b7a9a]">
                  Frei
                </th>
                <th className="py-3 pr-4 text-[9px] font-bold uppercase tracking-[0.8px] text-[#64748b] dark:text-[#6b7a9a]">
                  Belegt %
                </th>
                <th className="py-3 pr-4 text-[9px] font-bold uppercase tracking-[0.8px] text-[#64748b] dark:text-[#6b7a9a]">
                  Reserviert %
                </th>
                <th className="py-3 pr-4 text-[9px] font-bold uppercase tracking-[0.8px] text-[#64748b] dark:text-[#6b7a9a]">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {occupancyRows.map((row) => (
                <tr
                  key={row.unitId}
                  className="border-b border-black/10 dark:border-white/[0.05] text-[13px] text-[#0f172a] dark:text-[#eef2ff]"
                >
                  <td className="py-4 pr-4 font-semibold">
                    <Link
                      to={`/admin/units/${row.unitId}`}
                      className="font-medium text-sky-700 hover:underline dark:text-sky-400"
                    >
                      {getUnitDisplayLabel(
                        row.unit || { unitId: row.unitId, id: row.unitId }
                      )}
                    </Link>
                    {row.unitId ? (
                      <p className="mt-0.5 break-all font-mono text-[10px] text-slate-600 dark:text-[#6b7a9a]">
                        {row.unitId}
                      </p>
                    ) : null}
                  </td>
                  <td className="py-4 pr-4 font-medium">{row.place}</td>
                  <td className="py-4 pr-4 font-medium text-blue-700 dark:text-blue-400">{row.address}</td>
                  <td className="py-4 pr-4">{row.totalRooms}</td>
                  <td className="py-4 pr-4 font-semibold text-emerald-600 dark:text-emerald-400">{row.occupiedCount}</td>
                  <td className="py-4 pr-4 font-semibold text-amber-600 dark:text-amber-400">{row.reservedCount}</td>
                  <td className="py-4 pr-4 font-semibold text-rose-600 dark:text-rose-400">{row.freeCount}</td>
                  <td className="py-4 pr-4 font-semibold text-emerald-600 dark:text-emerald-400">
                    {formatPercent(row.occupancyRate)}
                  </td>
                  <td className="py-4 pr-4 font-semibold text-amber-600 dark:text-amber-400">
                    {formatPercent(row.reservedRate)}
                  </td>
                  <td className="py-4 pr-4">
                    <Badge
                      type={getStatusBadgeType(row.displayStatus)}
                      className={
                        row.displayStatus === "Voll belegt"
                          ? "bg-emerald-100 border-emerald-300 text-emerald-700 dark:bg-green-500/10 dark:border-green-500/20 dark:text-green-400"
                          : row.displayStatus === "Teilbelegt"
                            ? "bg-amber-100 border-amber-300 text-amber-700 dark:bg-amber-500/10 dark:border-amber-500/20 dark:text-amber-400"
                            : ""
                      }
                    >
                      {row.displayStatus}
                    </Badge>
                  </td>
                </tr>
              ))}

              {occupancyRows.length === 0 && (
                <tr>
                  <td colSpan="10" className="py-8 text-center text-[13px] text-[#64748b] dark:text-[#6b7a9a]">
                    Keine Belegungsdaten gefunden.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard
        title="Raumstatus (Karte)"
        subtitle="Visuelle Karte: Belegt (grün), Reserviert (gelb), Frei (rot). Daten vom Backend (Tenancies)."
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {coLivingUnits.map((unit) => (
            <OccupancyMap
              key={unit.unitId ?? unit.id}
              unit={unit}
              rooms={rooms}
              occupancyData={occupancyRoomsByUnit[unit.id ?? unit.unitId] ?? null}
            />
          ))}
          {coLivingUnits.length === 0 && (
            <p className="text-[13px] text-[#64748b] dark:text-[#6b7a9a]">Keine Co-Living Units. Räume werden pro Unit geladen.</p>
          )}
        </div>
      </SectionCard>

      <SectionCard
        title="Schwächste Belegung"
        subtitle="Diese Units haben aktuell die tiefste Belegungsquote."
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          {weakestUnits.map((row) => (
            <div
              key={row.unitId}
              className="rounded-[10px] border border-rose-300 bg-rose-100 dark:border-white/[0.08] dark:bg-[#111520] p-4"
            >
              <p className="text-[10px] text-[#64748b] dark:text-[#6b7a9a]">{row.place}</p>
              <p className="mt-1 text-[15px] font-bold text-[#7aaeff]">
                {getUnitDisplayLabel(
                  row.unit || { unitId: row.unitId, id: row.unitId }
                )}
              </p>
              {row.unitId ? (
                <p className="mt-0.5 break-all font-mono text-[10px] text-[#64748b] dark:text-[#6b7a9a]">
                  {row.unitId}
                </p>
              ) : null}
              <p className="mt-3 text-[24px] font-semibold text-rose-700 dark:text-[#f87171]">
                {formatPercent(row.occupancyRate)}
              </p>
              <p className="mt-2 text-[11px] text-[#64748b] dark:text-[#6b7a9a]">
                {row.occupiedCount} von {row.totalRooms} Rooms belegt
              </p>
            </div>
          ))}

          {weakestUnits.length === 0 && (
            <p className="text-[13px] text-[#64748b] dark:text-[#6b7a9a]">Keine Daten vorhanden.</p>
          )}
        </div>
      </SectionCard>
      </div>
    </div>
  );
}

export default AdminOccupancyPage;