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
  const cfg = {
    slate: { bar: "#5b9cf6", val: "text-[#5b9cf6]" },
    green: { bar: "#3ddc84", val: "text-[#3ddc84]" },
    amber: { bar: "#f5a623", val: "text-[#f5a623]" },
    rose: { bar: "#ff5f6d", val: "text-[#ff5f6d]" },
  };
  const c = cfg[color] || cfg.slate;

  return (
    <div className="relative overflow-hidden rounded-[10px] border border-[#1c2035] bg-[#10121a] p-[13px_15px] transition-colors hover:border-[#242840]">
      <div
        className="absolute left-0 right-0 top-0 h-[2px] rounded-t-[10px]"
        style={{ background: c.bar }}
      />
      <p className="mb-[4px] text-[9px] font-medium uppercase tracking-[0.5px] text-[#4a5070]">{label}</p>
      <p className={`mb-[4px] font-mono text-[24px] font-medium leading-none ${c.val}`}>{value}</p>
      {hint ? <p className="text-[10px] leading-[1.4] text-[#4a5070]">{hint}</p> : null}
    </div>
  );
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
    <div className="-m-6 min-h-screen bg-[#080a0f] p-6 md:p-8">
      <div className="mx-auto max-w-[min(1400px,100%)] space-y-[14px]">
        <div className="sticky top-0 z-30 flex min-h-[50px] flex-col justify-center border-b border-[#1c2035] bg-[#0c0e15] px-6 py-[10px] backdrop-blur-md">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-semibold text-[#edf0f7]">
              Van<span className="text-[#5b9cf6]">tio</span>
            </span>
            <span className="text-[#4a5070]">·</span>
            <span className="text-[14px] font-medium text-[#edf0f7]">Co-Living-Zimmer</span>
          </div>
          <p className="mt-[4px] text-[10px] text-[#4a5070]">
            Übersicht über alle Co-Living-Zimmer, deren Belegung und Verfügbarkeit.
          </p>
        </div>

        <div>
          <div className="mb-[10px] flex items-center gap-2">
            <span className="text-[10px] font-medium uppercase tracking-[0.8px] text-[#4a5070]">
              Übersicht · Live
            </span>
            <div className="h-px flex-1 bg-[#1c2035]" />
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
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
        </div>

        <div>
          <div className="mb-[10px] flex items-center gap-2">
            <span className="text-[10px] font-medium uppercase tracking-[0.8px] text-[#4a5070]">Room Map</span>
            <div className="h-px flex-1 bg-[#1c2035]" />
          </div>
          <SectionCard
            title="Room Map"
            subtitle="Visuelle Übersicht aller Co-Living-Zimmer pro Unit"
          >
            <div className="space-y-0">
              {coLivingUnits.map((unit) => (
                <RoomMap
                  key={unit.unitId || unit.id}
                  unit={unit}
                  rooms={rooms}
                  tenancies={tenancies}
                />
              ))}

              {coLivingUnits.length === 0 && (
                <p className="px-[18px] py-[16px] text-[12px] text-[#4a5070]">Keine Co-Living Units gefunden.</p>
              )}
            </div>
          </SectionCard>
        </div>

        <div>
          <div className="mb-[10px] flex items-center gap-2">
            <span className="text-[10px] font-medium uppercase tracking-[0.8px] text-[#4a5070]">
              Belegungskalender
            </span>
            <div className="h-px flex-1 bg-[#1c2035]" />
          </div>
          <SectionCard
            title="Belegungskalender"
            subtitle="Monatsvorschau pro Co-Living-Zimmer mit sicher, Risiko, reserviert und frei"
          >
            <div className="space-y-0">
              {coLivingUnits.map((unit) => (
                <RoomCalendar
                  key={unit.unitId || unit.id}
                  unit={unit}
                  rooms={rooms}
                  tenancies={tenancies}
                />
              ))}

              {coLivingUnits.length === 0 && (
                <p className="px-[18px] py-[16px] text-[12px] text-[#4a5070]">Keine Co-Living Units gefunden.</p>
              )}
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

export default AdminRoomsPage;
