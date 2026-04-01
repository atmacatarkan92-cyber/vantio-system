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
  const styles = {
    slate: "border-slate-200 bg-white text-slate-800",
    green: "border-emerald-200 bg-emerald-50 text-emerald-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    rose: "border-rose-200 bg-rose-50 text-rose-700",
    blue: "border-sky-200 bg-sky-50 text-sky-700",
  };

  return (
    <div className={`rounded-2xl border shadow-sm p-5 ${styles[color]}`}>
      <p className="text-sm opacity-80">{label}</p>
      <p className="text-3xl font-bold mt-2">{value}</p>
      {hint ? <p className="text-xs opacity-70 mt-2">{hint}</p> : null}
    </div>
  );
}

function SectionCard({ title, subtitle, children }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
      <div className="mb-5">
        <h3 className="text-2xl font-semibold text-slate-800">{title}</h3>
        {subtitle ? <p className="text-slate-500 mt-1">{subtitle}</p> : null}
      </div>
      {children}
    </div>
  );
}

function Badge({ children, type = "neutral" }) {
  const styles = {
    success: "bg-emerald-100 text-emerald-700",
    warning: "bg-amber-100 text-amber-700",
    danger: "bg-rose-100 text-rose-700",
    info: "bg-sky-100 text-sky-700",
    neutral: "bg-slate-100 text-slate-700",
  };

  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${styles[type]}`}>
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
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold text-orange-600">Vantio</p>
        <h2 className="text-3xl font-bold text-slate-800 mt-1">Belegung</h2>
        <p className="text-slate-500 mt-1">
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
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 text-sm">
                <th className="py-3 pr-4">Unit</th>
                <th className="py-3 pr-4">Ort</th>
                <th className="py-3 pr-4">Adresse</th>
                <th className="py-3 pr-4">Rooms gesamt</th>
                <th className="py-3 pr-4">Belegt</th>
                <th className="py-3 pr-4">Reserviert</th>
                <th className="py-3 pr-4">Frei</th>
                <th className="py-3 pr-4">Belegt %</th>
                <th className="py-3 pr-4">Reserviert %</th>
                <th className="py-3 pr-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {occupancyRows.map((row) => (
                <tr
                  key={row.unitId}
                  className="border-b border-slate-100 text-slate-700 hover:bg-slate-50"
                >
                  <td className="py-4 pr-4 font-semibold text-slate-900">
                    <Link
                      to={`/admin/units/${row.unitId}`}
                      className="text-orange-600 hover:text-orange-700 hover:underline"
                    >
                      {getUnitDisplayLabel(
                        row.unit || { unitId: row.unitId, id: row.unitId }
                      )}
                    </Link>
                    {row.unitId ? (
                      <p className="text-xs text-slate-400 mt-0.5 font-mono break-all">
                        {row.unitId}
                      </p>
                    ) : null}
                  </td>
                  <td className="py-4 pr-4">{row.place}</td>
                  <td className="py-4 pr-4">{row.address}</td>
                  <td className="py-4 pr-4">{row.totalRooms}</td>
                  <td className="py-4 pr-4">{row.occupiedCount}</td>
                  <td className="py-4 pr-4">{row.reservedCount}</td>
                  <td className="py-4 pr-4">{row.freeCount}</td>
                  <td className="py-4 pr-4 font-medium">
                    {formatPercent(row.occupancyRate)}
                  </td>
                  <td className="py-4 pr-4 font-medium">
                    {formatPercent(row.reservedRate)}
                  </td>
                  <td className="py-4 pr-4">
                    <Badge type={getStatusBadgeType(row.displayStatus)}>
                      {row.displayStatus}
                    </Badge>
                  </td>
                </tr>
              ))}

              {occupancyRows.length === 0 && (
                <tr>
                  <td colSpan="10" className="py-8 text-center text-slate-500">
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
            <p className="text-slate-500">Keine Co-Living Units. Räume werden pro Unit geladen.</p>
          )}
        </div>
      </SectionCard>

      <SectionCard
        title="Schwächste Belegung"
        subtitle="Diese Units haben aktuell die tiefste Belegungsquote."
      >
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
          {weakestUnits.map((row) => (
            <div
              key={row.unitId}
              className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
            >
              <p className="text-sm text-slate-500">{row.place}</p>
              <p className="text-lg font-bold text-slate-900 mt-1">
                {getUnitDisplayLabel(
                  row.unit || { unitId: row.unitId, id: row.unitId }
                )}
              </p>
              {row.unitId ? (
                <p className="text-xs text-slate-400 mt-0.5 font-mono break-all">
                  {row.unitId}
                </p>
              ) : null}
              <p className="text-2xl font-bold text-rose-600 mt-3">
                {formatPercent(row.occupancyRate)}
              </p>
              <p className="text-sm text-slate-500 mt-2">
                {row.occupiedCount} von {row.totalRooms} Rooms belegt
              </p>
            </div>
          ))}

          {weakestUnits.length === 0 && (
            <p className="text-slate-500">Keine Daten vorhanden.</p>
          )}
        </div>
      </SectionCard>
    </div>
  );
}

export default AdminOccupancyPage;