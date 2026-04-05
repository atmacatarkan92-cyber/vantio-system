import React from "react";
import {
  getRoomOccupancyStatus,
  formatOccupancyStatusDe,
} from "../utils/unitOccupancyStatus";

function getRoomCardClasses(occ) {
  if (occ === "belegt") {
    return "border-[rgba(61,220,132,0.2)] bg-[rgba(61,220,132,0.05)]";
  }
  if (occ === "reserviert") {
    return "border-[rgba(245,166,35,0.18)] bg-[rgba(245,166,35,0.05)]";
  }
  if (occ === "frei") {
    return "border-[rgba(255,95,109,0.18)] bg-[rgba(255,95,109,0.05)]";
  }
  return "border-[rgba(255,95,109,0.18)] bg-[rgba(255,95,109,0.05)]";
}

function getStatusDotClass(occ) {
  if (occ === "belegt") return "bg-[#3ddc84]";
  if (occ === "reserviert") return "bg-[#f5a623]";
  return "bg-[#ff5f6d]";
}

function getStatusValueClass(occ) {
  if (occ === "belegt") return "text-[#3ddc84]";
  if (occ === "reserviert") return "text-[#f5a623]";
  return "text-[#ff5f6d]";
}

function getStatusLabelFromOcc(occ) {
  if (occ == null) return "—";
  return formatOccupancyStatusDe(occ);
}

function RoomMap({ unit, rooms: allRooms = [], tenancies = null }) {
  const unitRooms = allRooms.filter((room) => (room.unitId || room.unit_id) === (unit.unitId || unit.id));

  const occupiedCount =
    tenancies == null
      ? 0
      : unitRooms.filter(
          (room) => getRoomOccupancyStatus(room, tenancies) === "belegt"
        ).length;
  const reservedCount =
    tenancies == null
      ? 0
      : unitRooms.filter(
          (room) => getRoomOccupancyStatus(room, tenancies) === "reserviert"
        ).length;
  const freeCount =
    tenancies == null
      ? unitRooms.length
      : unitRooms.filter(
          (room) => getRoomOccupancyStatus(room, tenancies) === "frei"
        ).length;

  if (unitRooms.length === 0) {
    return (
      <div className="mx-[14px] my-[12px] overflow-hidden rounded-[10px] border border-[#1c2035] bg-[#141720]">
        <div className="flex flex-wrap items-center gap-[10px] border-b border-[#1c2035] px-[14px] py-[11px]">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[11px] font-medium text-[#5b9cf6]">{unit.unitId}</p>
            <p className="mt-[2px] text-[11px] text-[#8892b0]">{unit.place}</p>
          </div>
        </div>
        <p className="px-[12px] py-[12px] text-[11px] italic text-[#4a5070]">Keine Rooms für diese Unit erfasst.</p>
      </div>
    );
  }

  return (
    <div className="mx-[14px] my-[12px] overflow-hidden rounded-[10px] border border-[#1c2035] bg-[#141720]">
      <div className="flex flex-wrap items-center gap-[10px] border-b border-[#1c2035] px-[14px] py-[11px]">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[11px] font-medium text-[#5b9cf6]">{unit.unitId}</p>
          <p className="mt-[2px] text-[11px] text-[#8892b0]">{unit.place}</p>
        </div>
        <div className="ml-auto flex flex-wrap gap-[6px]">
          <span className="rounded-full border border-[#1c2035] bg-[#191c28] px-2 py-[2px] text-[9px] font-semibold text-[#8892b0]">
            {unitRooms.length} Rooms
          </span>
          <span className="rounded-full border border-[rgba(61,220,132,0.2)] bg-[rgba(61,220,132,0.1)] px-2 py-[2px] text-[9px] font-semibold text-[#3ddc84]">
            {occupiedCount} Belegt
          </span>
          <span className="rounded-full border border-[rgba(245,166,35,0.2)] bg-[rgba(245,166,35,0.1)] px-2 py-[2px] text-[9px] font-semibold text-[#f5a623]">
            {reservedCount} Reserviert
          </span>
          <span className="rounded-full border border-[rgba(255,95,109,0.2)] bg-[rgba(255,95,109,0.1)] px-2 py-[2px] text-[9px] font-semibold text-[#ff5f6d]">
            {freeCount} Frei
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-[8px] px-[12px] py-[12px]">
        {unitRooms.map((room, index) => {
          const occ =
            tenancies != null ? getRoomOccupancyStatus(room, tenancies) : null;
          return (
            <div
              key={room.roomId || index}
              className={`flex-1 min-w-[150px] rounded-[9px] border p-[12px_14px] ${getRoomCardClasses(occ)}`}
            >
              <p className="mb-[8px] flex items-center gap-[6px] text-[12px] font-medium text-[#edf0f7]">
                <span className={`h-[6px] w-[6px] shrink-0 rounded-full ${getStatusDotClass(occ)}`} />
                {room.roomName || room.name || `Zimmer ${index + 1}`}
              </p>

              <div className="mb-[3px] flex items-baseline justify-between">
                <span className="text-[10px] text-[#4a5070]">Status</span>
                <span className={`font-mono text-[11px] ${getStatusValueClass(occ)}`}>
                  {getStatusLabelFromOcc(occ)}
                </span>
              </div>

              {room.priceMonthly ? (
                <div className="mb-[3px] flex items-baseline justify-between">
                  <span className="text-[10px] text-[#4a5070]">Miete / Mt.</span>
                  <span className="font-mono text-[11px] text-[#8892b0]">
                    CHF {Number(room.priceMonthly).toLocaleString("de-CH")}
                  </span>
                </div>
              ) : (
                <div className="mb-[3px] flex items-baseline justify-between">
                  <span className="text-[10px] text-[#4a5070]">Miete / Mt.</span>
                  <span className="font-mono text-[11px] italic text-[#4a5070]">—</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default RoomMap;
