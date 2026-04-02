import React, { useEffect, useMemo, useState } from "react";
import RoomMap from "../../components/RoomMap";
import RoomCalendar from "../../components/RoomCalendar";
import {
  fetchAdminUnits,
  fetchAdminRooms,
  fetchAdminTenanciesAll,
  normalizeUnit,
  normalizeRoom,
} from "../../api/adminData";
import { getRoomOccupancyStatus } from "../../utils/unitOccupancyStatus";

function StatCard({ label, value, hint, color = "slate" }) {
  const top = {
    slate: "border-t-slate-500",
    green: "border-t-green-500",
    amber: "border-t-amber-500",
    rose: "border-t-red-500",
  };
  const val = {
    slate: "text-[#0f172a] dark:text-[#eef2ff]",
    green: "text-[#4ade80]",
    amber: "text-[#fbbf24]",
    rose: "text-[#f87171]",
  };

  return (
    <div
      className={`relative overflow-hidden rounded-[14px] border border-black/10 bg-white border-t-4 dark:border-white/[0.07] dark:bg-[#141824] p-5 ${top[color]}`}
    >
      <p className="text-[9px] font-bold uppercase tracking-[1px] text-[#64748b] dark:text-[#6b7a9a]">{label}</p>
      <p className={`mt-2 text-[24px] font-bold ${val[color]}`}>{value}</p>
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

function AdminRoomsPage() {
  const [units, setUnits] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [tenancies, setTenancies] = useState([]);

  useEffect(() => {
    fetchAdminUnits()
      .then((data) => setUnits(Array.isArray(data) ? data.map(normalizeUnit) : []))
      .catch(() => setUnits([]));
    fetchAdminRooms()
      .then((data) => setRooms(Array.isArray(data) ? data.map(normalizeRoom) : []))
      .catch(() => setRooms([]));
    fetchAdminTenanciesAll()
      .then((r) => setTenancies(Array.isArray(r) ? r : []))
      .catch(() => setTenancies([]));
  }, []);

  const coLivingUnits = useMemo(() => {
    return units.filter((unit) => unit.type === "Co-Living");
  }, [units]);

  const coLivingRooms = useMemo(() => {
    const ids = new Set(
      coLivingUnits.map((u) => u.unitId || u.id).filter(Boolean)
    );
    return rooms.filter((room) => ids.has(room.unitId ?? room.unit_id));
  }, [rooms, coLivingUnits]);

  const roomStats = useMemo(() => {
    const occupied = coLivingRooms.filter(
      (room) => getRoomOccupancyStatus(room, tenancies) === "belegt"
    ).length;
    const reserved = coLivingRooms.filter(
      (room) => getRoomOccupancyStatus(room, tenancies) === "reserviert"
    ).length;
    const free = coLivingRooms.filter(
      (room) => getRoomOccupancyStatus(room, tenancies) === "frei"
    ).length;

    return {
      total: coLivingRooms.length,
      occupied,
      reserved,
      free,
    };
  }, [coLivingRooms, tenancies]);

  return (
    <div className="min-h-screen bg-[#f8fafc] text-[#0f172a] [color-scheme:light] dark:bg-[#07090f] dark:text-[#eef2ff] dark:[color-scheme:dark]">
      <div className="mx-auto max-w-[min(1400px,100%)] space-y-6 p-6">
        <div>
          <h2 className="text-[22px] font-bold text-[#0f172a] dark:text-[#eef2ff]">Co-Living-Zimmer</h2>
          <p className="mt-1 text-[12px] text-[#64748b] dark:text-[#6b7a9a]">
            Übersicht über alle Co-Living-Zimmer, deren Belegung und Verfügbarkeit.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Rooms gesamt"
            value={roomStats.total}
            hint="Alle Co-Living-Zimmer"
            color="slate"
          />
          <StatCard
            label="Belegt"
            value={roomStats.occupied}
            hint="Aktuell belegte Co-Living-Zimmer"
            color="green"
          />
          <StatCard
            label="Reserviert"
            value={roomStats.reserved}
            hint="Reservierte Co-Living-Zimmer"
            color="amber"
          />
          <StatCard
            label="Frei"
            value={roomStats.free}
            hint="Freie Co-Living-Zimmer"
            color="rose"
          />
        </div>

        <SectionCard
          title="Room Map"
          subtitle="Visuelle Übersicht aller Co-Living-Zimmer pro Unit"
        >
          <div className="space-y-6">
            {coLivingUnits.map((unit) => (
              <RoomMap
                key={unit.unitId || unit.id}
                unit={unit}
                rooms={rooms}
                tenancies={tenancies}
              />
            ))}

            {coLivingUnits.length === 0 && (
              <p className="text-[13px] text-[#64748b] dark:text-[#6b7a9a]">Keine Co-Living Units gefunden.</p>
            )}
          </div>
        </SectionCard>

        <SectionCard
          title="Belegungskalender"
          subtitle="Monatsvorschau pro Co-Living-Zimmer mit sicher, Risiko, reserviert und frei"
        >
          <div className="space-y-6">
            {coLivingUnits.map((unit) => (
              <RoomCalendar
                key={unit.unitId || unit.id}
                unit={unit}
                rooms={rooms}
                tenancies={tenancies}
              />
            ))}

            {coLivingUnits.length === 0 && (
              <p className="text-[13px] text-[#64748b] dark:text-[#6b7a9a]">Keine Co-Living Units gefunden.</p>
            )}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

export default AdminRoomsPage;
