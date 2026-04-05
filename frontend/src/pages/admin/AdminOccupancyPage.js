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

function occupancyBarVisual(rate) {
  const r = Number(rate) || 0;
  if (r >= 100) return { fill: "bg-[#3ddc84]", text: "text-[#3ddc84]" };
  if (r >= 50) return { fill: "bg-[#f5a623]", text: "text-[#f5a623]" };
  if (r > 0) return { fill: "bg-[#ff5f6d]", text: "text-[#ff5f6d]" };
  return { fill: "bg-[#4a5070]", text: "text-[#4a5070]" };
}

function SectionCard({ title, subtitle, children }) {
  return (
    <div className="overflow-hidden rounded-[12px] border border-[#1c2035] bg-[#10121a]">
      <div className="border-b border-[#1c2035] px-[18px] py-[13px]">
        <h3 className="text-[13px] font-medium text-[#edf0f7]">{title}</h3>
        {subtitle ? <p className="mt-[2px] text-[10px] text-[#4a5070]">{subtitle}</p> : null}
      </div>
      <div>{children}</div>
    </div>
  );
}

function Badge({ children, type = "neutral", className = "" }) {
  const styles = {
    success:
      "border border-[rgba(61,220,132,0.2)] bg-[rgba(61,220,132,0.1)] text-[#3ddc84]",
    warning:
      "border border-[rgba(245,166,35,0.2)] bg-[rgba(245,166,35,0.1)] text-[#f5a623]",
    danger:
      "border border-[rgba(255,95,109,0.2)] bg-[rgba(255,95,109,0.1)] text-[#ff5f6d]",
    info: "border border-[rgba(91,156,246,0.2)] bg-[rgba(91,156,246,0.1)] text-[#5b9cf6]",
    neutral: "border border-[#1c2035] bg-[#141720] text-[#8892b0]",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-[2px] text-[9px] font-semibold ${styles[type]} ${className}`}
    >
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
  if (status === "Reservierungen vorhanden") return "warning";
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

  const quotePct = Math.min(100, Math.max(0, Number(summary.occupancyRate) || 0));

  return (
    <div className="-m-6 min-h-screen bg-[#080a0f]">
      <div className="sticky top-0 z-30 flex h-[50px] items-center border-b border-[#1c2035] bg-[#0c0e15] px-6 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-[#edf0f7]">
            Van<span className="text-[#5b9cf6]">tio</span>
          </span>
          <span className="text-[#4a5070]">·</span>
          <span className="text-[14px] font-medium text-[#edf0f7]">Belegung</span>
        </div>
      </div>

      <div className="flex flex-col gap-4 px-6 py-5">
        <div>
          <div className="mb-[10px] flex items-center gap-2">
            <span className="text-[10px] font-medium uppercase tracking-[0.8px] text-[#4a5070]">
              Übersicht · Live
            </span>
            <div className="h-px flex-1 bg-[#1c2035]" />
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <div className="relative overflow-hidden rounded-[10px] border border-[#1c2035] bg-[#10121a] p-[13px_15px] transition-colors hover:border-[#242840]">
              <div className="absolute left-0 right-0 top-0 h-[2px] rounded-t-[10px] bg-[#5b9cf6]" />
              <p className="mb-[4px] text-[9px] font-medium uppercase tracking-[0.5px] text-[#4a5070]">Apartments</p>
              <p className="mb-[4px] font-mono text-[22px] font-medium leading-none text-[#5b9cf6]">{apartmentsCount}</p>
              <p className="text-[10px] leading-[1.4] text-[#4a5070]">Units ohne Typ Co-Living</p>
            </div>
            <div className="relative overflow-hidden rounded-[10px] border border-[#1c2035] bg-[#10121a] p-[13px_15px] transition-colors hover:border-[#242840]">
              <div className="absolute left-0 right-0 top-0 h-[2px] rounded-t-[10px] bg-[#22d3ee]" />
              <p className="mb-[4px] text-[9px] font-medium uppercase tracking-[0.5px] text-[#4a5070]">Co-Living Units</p>
              <p className="mb-[4px] font-mono text-[22px] font-medium leading-none text-[#22d3ee]">{coLivingCount}</p>
              <p className="text-[10px] leading-[1.4] text-[#4a5070]">Typ Co-Living</p>
            </div>
            <div className="relative overflow-hidden rounded-[10px] border border-[#1c2035] bg-[#10121a] p-[13px_15px] transition-colors hover:border-[#242840]">
              <div className="absolute left-0 right-0 top-0 h-[2px] rounded-t-[10px] bg-[#edf0f7]" />
              <p className="mb-[4px] text-[9px] font-medium uppercase tracking-[0.5px] text-[#4a5070]">Rooms gesamt</p>
              <p className="mb-[4px] font-mono text-[22px] font-medium leading-none text-[#edf0f7]">{summary.totalRooms}</p>
              <p className="text-[10px] leading-[1.4] text-[#4a5070]">Erfasste Zimmerkapazität</p>
            </div>
            <div className="relative overflow-hidden rounded-[10px] border border-[#1c2035] bg-[#10121a] p-[13px_15px] transition-colors hover:border-[#242840]">
              <div className="absolute left-0 right-0 top-0 h-[2px] rounded-t-[10px] bg-[#3ddc84]" />
              <p className="mb-[4px] text-[9px] font-medium uppercase tracking-[0.5px] text-[#4a5070]">Belegt</p>
              <p className="mb-[4px] font-mono text-[22px] font-medium leading-none text-[#3ddc84]">{summary.occupiedRooms}</p>
              <p className="text-[10px] leading-[1.4] text-[#4a5070]">Aktuell belegte Rooms</p>
            </div>
            <div className="relative overflow-hidden rounded-[10px] border border-[#1c2035] bg-[#10121a] p-[13px_15px] transition-colors hover:border-[#242840]">
              <div className="absolute left-0 right-0 top-0 h-[2px] rounded-t-[10px] bg-[#f5a623]" />
              <p className="mb-[4px] text-[9px] font-medium uppercase tracking-[0.5px] text-[#4a5070]">Reserviert</p>
              <p className="mb-[4px] font-mono text-[22px] font-medium leading-none text-[#f5a623]">{summary.reservedRooms}</p>
              <p className="text-[10px] leading-[1.4] text-[#4a5070]">Noch nicht eingezogen</p>
            </div>
            <div className="relative overflow-hidden rounded-[10px] border border-[#1c2035] bg-[#10121a] p-[13px_15px] transition-colors hover:border-[#242840]">
              <div className="absolute left-0 right-0 top-0 h-[2px] rounded-t-[10px] bg-[#9d7cf4]" />
              <p className="mb-[4px] text-[9px] font-medium uppercase tracking-[0.5px] text-[#4a5070]">Belegungsquote</p>
              <p className="mb-[4px] font-mono text-[20px] font-medium leading-none text-[#9d7cf4]">
                {formatPercent(summary.occupancyRate)}
              </p>
              <div className="mb-[4px] mt-[7px] h-[3px] rounded-full bg-[#191c28]">
                <div
                  className="h-full rounded-full bg-[#9d7cf4]"
                  style={{ width: `${quotePct}%` }}
                />
              </div>
              <p className="text-[10px] text-[#9d7cf4]">Nur belegte Rooms</p>
            </div>
          </div>
        </div>

        <div>
          <div className="mb-[10px] flex items-center gap-2">
            <span className="text-[10px] font-medium uppercase tracking-[0.8px] text-[#4a5070]">
              Belegungsübersicht pro Unit
            </span>
            <div className="h-px flex-1 bg-[#1c2035]" />
          </div>
          <SectionCard
            title="Belegungsübersicht pro Unit"
            subtitle="Hier siehst du sofort, welche Units stark laufen und wo Leerstand besteht."
          >
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr>
                    <th className="whitespace-nowrap border-b border-[#1c2035] px-[14px] py-[8px] text-left text-[9px] font-medium uppercase tracking-[0.6px] text-[#4a5070]">
                      Unit
                    </th>
                    <th className="whitespace-nowrap border-b border-[#1c2035] px-[14px] py-[8px] text-left text-[9px] font-medium uppercase tracking-[0.6px] text-[#4a5070]">
                      Ort
                    </th>
                    <th className="whitespace-nowrap border-b border-[#1c2035] px-[14px] py-[8px] text-left text-[9px] font-medium uppercase tracking-[0.6px] text-[#4a5070]">
                      Adresse
                    </th>
                    <th className="whitespace-nowrap border-b border-[#1c2035] px-[14px] py-[8px] text-left text-[9px] font-medium uppercase tracking-[0.6px] text-[#4a5070]">
                      Rooms gesamt
                    </th>
                    <th className="whitespace-nowrap border-b border-[#1c2035] px-[14px] py-[8px] text-left text-[9px] font-medium uppercase tracking-[0.6px] text-[#4a5070]">
                      Belegt
                    </th>
                    <th className="whitespace-nowrap border-b border-[#1c2035] px-[14px] py-[8px] text-left text-[9px] font-medium uppercase tracking-[0.6px] text-[#4a5070]">
                      Reserviert
                    </th>
                    <th className="whitespace-nowrap border-b border-[#1c2035] px-[14px] py-[8px] text-left text-[9px] font-medium uppercase tracking-[0.6px] text-[#4a5070]">
                      Frei
                    </th>
                    <th className="whitespace-nowrap border-b border-[#1c2035] px-[14px] py-[8px] text-left text-[9px] font-medium uppercase tracking-[0.6px] text-[#4a5070]">
                      Belegt %
                    </th>
                    <th className="whitespace-nowrap border-b border-[#1c2035] px-[14px] py-[8px] text-left text-[9px] font-medium uppercase tracking-[0.6px] text-[#4a5070]">
                      Reserviert %
                    </th>
                    <th className="whitespace-nowrap border-b border-[#1c2035] px-[14px] py-[8px] text-left text-[9px] font-medium uppercase tracking-[0.6px] text-[#4a5070]">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {occupancyRows.map((row, idx, arr) => {
                    const bar = occupancyBarVisual(row.occupancyRate);
                    return (
                      <tr
                        key={row.unitId}
                        className={`cursor-pointer border-b border-[#1c2035] text-[11px] text-[#8892b0] transition-colors hover:bg-[#141720] ${
                          idx === arr.length - 1 ? "border-b-0" : ""
                        }`}
                      >
                        <td className="align-middle px-[14px] py-[11px]">
                          <Link
                            to={`/admin/units/${row.unitId}`}
                            className="font-mono text-[11px] font-medium text-[#5b9cf6] hover:underline"
                          >
                            {getUnitDisplayLabel(
                              row.unit || { unitId: row.unitId, id: row.unitId }
                            )}
                          </Link>
                          {row.unitId ? (
                            <span className="mt-[2px] block max-w-[180px] truncate font-mono text-[8px] text-[#4a5070]">
                              {row.unitId}
                            </span>
                          ) : null}
                        </td>
                        <td className="align-middle px-[14px] py-[11px] text-[11px] text-[#4a5070]">{row.place}</td>
                        <td className="align-middle px-[14px] py-[11px] text-[11px] text-[#5b9cf6]">
                          <span className="flex items-center gap-[4px]">
                            <span aria-hidden>📍</span>
                            {row.address || "—"}
                          </span>
                        </td>
                        <td className="align-middle px-[14px] py-[11px] font-mono text-[11px] text-[#edf0f7]">
                          {row.totalRooms}
                        </td>
                        <td
                          className={`align-middle px-[14px] py-[11px] font-mono text-[11px] ${
                            row.occupiedCount === 0
                              ? "text-[#4a5070]"
                              : "font-medium text-[#3ddc84]"
                          }`}
                        >
                          {row.occupiedCount}
                        </td>
                        <td
                          className={`align-middle px-[14px] py-[11px] font-mono text-[11px] ${
                            row.reservedCount === 0 ? "text-[#4a5070]" : "text-[#f5a623]"
                          }`}
                        >
                          {row.reservedCount}
                        </td>
                        <td
                          className={`align-middle px-[14px] py-[11px] font-mono text-[11px] ${
                            row.freeCount === 0 ? "text-[#4a5070]" : "text-[#ff5f6d]"
                          }`}
                        >
                          {row.freeCount}
                        </td>
                        <td className="align-middle px-[14px] py-[11px]">
                          <div className="flex items-center gap-[6px]">
                            <div className="h-[4px] w-[70px] overflow-hidden rounded-full bg-[#191c28]">
                              <div
                                className={`h-full rounded-full ${bar.fill}`}
                                style={{ width: `${Math.min(100, Math.max(0, row.occupancyRate))}%` }}
                              />
                            </div>
                            <span className={`font-mono text-[10px] ${bar.text}`}>
                              {formatPercent(row.occupancyRate)}
                            </span>
                          </div>
                        </td>
                        <td className="align-middle px-[14px] py-[11px] font-mono text-[10px] text-[#4a5070]">
                          {formatPercent(row.reservedRate)}
                        </td>
                        <td className="align-middle px-[14px] py-[11px]">
                          <Badge type={getStatusBadgeType(row.displayStatus)}>
                            {row.displayStatus}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}

                  {occupancyRows.length === 0 && (
                    <tr>
                      <td
                        colSpan="10"
                        className="border-b-0 px-[14px] py-8 text-center text-[12px] text-[#4a5070]"
                      >
                        Keine Belegungsdaten gefunden.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </div>

        <div>
          <div className="mb-[10px] flex items-center gap-2">
            <span className="text-[10px] font-medium uppercase tracking-[0.8px] text-[#4a5070]">Raumstatus · Karte</span>
            <div className="h-px flex-1 bg-[#1c2035]" />
          </div>
          <SectionCard
            title="Raumstatus (Karte)"
            subtitle="Visuelle Karte: Belegt (grün), Reserviert (gelb), Frei (rot). Daten vom Backend (Tenancies)."
          >
            <div className="grid grid-cols-1 gap-0 lg:grid-cols-2">
              {coLivingUnits.map((unit) => (
                <OccupancyMap
                  key={unit.unitId ?? unit.id}
                  unit={unit}
                  rooms={rooms}
                  occupancyData={occupancyRoomsByUnit[unit.id ?? unit.unitId] ?? null}
                />
              ))}
              {coLivingUnits.length === 0 && (
                <p className="px-[18px] py-[16px] text-[12px] text-[#4a5070]">
                  Keine Co-Living Units. Räume werden pro Unit geladen.
                </p>
              )}
            </div>
          </SectionCard>
        </div>

        <SectionCard
          title="Schwächste Belegung"
          subtitle="Diese Units haben aktuell die tiefste Belegungsquote."
        >
          <div className="grid grid-cols-1 gap-3 px-[14px] py-[12px] md:grid-cols-2 xl:grid-cols-5">
            {weakestUnits.map((row) => (
              <div
                key={row.unitId}
                className="rounded-[10px] border border-[#1c2035] bg-[#141720] p-4"
              >
                <p className="text-[10px] text-[#4a5070]">{row.place}</p>
                <p className="mt-1 font-mono text-[13px] font-medium text-[#5b9cf6]">
                  {getUnitDisplayLabel(
                    row.unit || { unitId: row.unitId, id: row.unitId }
                  )}
                </p>
                {row.unitId ? (
                  <p className="mt-0.5 max-w-[180px] truncate font-mono text-[8px] text-[#4a5070]">
                    {row.unitId}
                  </p>
                ) : null}
                <p className="mt-3 font-mono text-[22px] font-semibold text-[#ff5f6d]">
                  {formatPercent(row.occupancyRate)}
                </p>
                <p className="mt-2 text-[11px] text-[#4a5070]">
                  {row.occupiedCount} von {row.totalRooms} Rooms belegt
                </p>
              </div>
            ))}

            {weakestUnits.length === 0 && (
              <p className="col-span-full text-[12px] text-[#4a5070]">Keine Daten vorhanden.</p>
            )}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

export default AdminOccupancyPage;
