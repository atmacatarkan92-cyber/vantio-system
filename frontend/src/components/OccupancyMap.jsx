import React from "react";

function normalizeStatusFromRoom(room) {
  const s = (room?.status || "").toString().toLowerCase().trim();
  if (s === "belegt" || s === "occupied") return "occupied";
  if (s === "reserviert" || s === "reserved") return "reserved";
  if (s === "frei" || s === "free") return "free";
  return "unknown";
}

/** Maps API / room status strings to occupied | reserved | free for display styling. */
function normalizeOccupancyStatusKey(raw) {
  const s = String(raw || "").toLowerCase().trim();
  if (s === "belegt" || s === "occupied") return "occupied";
  if (s === "reserviert" || s === "reserved") return "reserved";
  if (s === "frei" || s === "free") return "free";
  return "free";
}

function getRoomDisplayList(unit, rooms = [], occupancyData = null) {
  const unitId = unit?.id ?? unit?.unitId ?? "";
  const roomList = Array.isArray(rooms)
    ? rooms.filter((r) => (r.unitId ?? r.unit_id) === unitId)
    : [];

  if (roomList.length === 0) return [];

  if (occupancyData && Array.isArray(occupancyData.rooms) && occupancyData.rooms.length > 0) {
    return occupancyData.rooms.map((occ) => ({
      room_id: occ.room_id,
      room_name: occ.room_name ?? occ.room_id,
      status: (occ.status || "free").toLowerCase().trim() || "free",
      tenant_name: occ.tenant_name ?? null,
      rent: occ.rent ?? occ.price ?? null,
    }));
  }

  return roomList.map((room, idx) => {
    const status = normalizeStatusFromRoom(room);
    return {
      room_id: room.id ?? room.roomId ?? `room-${idx}`,
      room_name: room.roomName ?? room.name ?? `Zimmer ${idx + 1}`,
      status: status === "unknown" ? "free" : status,
      tenant_name: room.tenant_name ?? room.tenantName ?? null,
      rent: room.rent ?? room.price ?? room.priceMonthly ?? null,
    };
  });
}

function roomCardClasses(status) {
  if (status === "occupied") {
    return "border-[rgba(61,220,132,0.2)] bg-[rgba(61,220,132,0.05)]";
  }
  if (status === "reserved") {
    return "border-[rgba(245,166,35,0.18)] bg-[rgba(245,166,35,0.05)]";
  }
  return "border-[rgba(255,95,109,0.18)] bg-[rgba(255,95,109,0.05)]";
}

function roomDotClass(status) {
  if (status === "occupied") return "bg-[#3ddc84]";
  if (status === "reserved") return "bg-[#f5a623]";
  return "bg-[#ff5f6d]";
}

function roomLabelDe(status) {
  if (status === "occupied") return "Belegt";
  if (status === "reserved") return "Reserviert";
  return "Frei";
}

function RoomTile({ room }) {
  const statusKey = normalizeOccupancyStatusKey(room.status);
  const rentStr =
    room.rent != null
      ? `CHF ${Number(room.rent).toLocaleString("de-CH", { maximumFractionDigits: 0 })}`
      : null;

  return (
    <div
      className={`flex min-w-[150px] flex-1 flex-col rounded-[9px] border p-[12px_14px] ${roomCardClasses(
        statusKey
      )}`}
    >
      <p className="mb-[8px] flex items-center gap-[6px] text-[12px] font-medium text-[#edf0f7]">
        <span className={`h-[6px] w-[6px] shrink-0 rounded-full ${roomDotClass(statusKey)}`} />
        {room.room_name}
      </p>
      <div className="mb-[3px] flex items-baseline justify-between">
        <span className="text-[10px] text-[#4a5070]">Status</span>
        <span
          className={`font-mono text-[11px] ${
            statusKey === "occupied"
              ? "text-[#3ddc84]"
              : statusKey === "reserved"
                ? "text-[#f5a623]"
                : "text-[#ff5f6d]"
          }`}
        >
          {roomLabelDe(statusKey)}
        </span>
      </div>
      {room.tenant_name ? (
        <div className="mb-[3px] text-[11px] text-[#8892b0]">{room.tenant_name}</div>
      ) : (
        <div className="mb-[3px] text-[11px] italic text-[#4a5070]">—</div>
      )}
      {rentStr ? (
        <div className="text-[11px] text-[#8892b0]">
          {rentStr} / Monat
        </div>
      ) : null}
    </div>
  );
}

export default function OccupancyMap({ unit, rooms = [], occupancyData = null, loading = false }) {
  const displayList = getRoomDisplayList(unit, rooms, occupancyData);
  const unitLabel = unit?.title ?? unit?.place ?? unit?.unitId ?? unit?.id ?? "Unit";
  const unitIdStr = unit?.unitId ?? unit?.id ?? "";

  const totalRooms = displayList.length;
  const occupiedCount = displayList.filter(
    (r) => normalizeOccupancyStatusKey(r.status) === "occupied"
  ).length;
  const reservedCount = displayList.filter(
    (r) => normalizeOccupancyStatusKey(r.status) === "reserved"
  ).length;

  if (loading) {
    return (
      <div className="mx-[14px] my-[12px] rounded-[10px] border border-[#1c2035] bg-[#141720] px-8 py-10 text-center text-[13px] text-[#4a5070]">
        <p className="m-0 font-semibold">Raumstatus wird geladen…</p>
      </div>
    );
  }

  if (!displayList.length) {
    return (
      <div className="mx-[14px] my-[12px] rounded-[10px] border border-[#1c2035] bg-[#141720] px-8 py-10 text-center">
        <p className="m-0 text-[13px] font-semibold text-[#edf0f7]">Keine Rooms für diese Unit vorhanden.</p>
        <p className="mt-2 text-[12px] text-[#4a5070]">
          Räume unter Objekte anlegen, um die Belegung anzuzeigen.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-[14px] my-[12px] overflow-hidden rounded-[10px] border border-[#1c2035] bg-[#141720]">
      <div className="flex flex-wrap items-center gap-[10px] border-b border-[#1c2035] px-[14px] py-[11px]">
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-medium text-[#edf0f7]">{unitLabel}</p>
          <p className="mt-[2px] text-[10px] text-[#4a5070]">
            {unitIdStr ? `ID ${unitIdStr}` : "Raumstatus (Belegt / Reserviert / Frei)"}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap gap-[6px]">
          <span className="rounded-full border border-[#1c2035] bg-[#191c28] px-2 py-[2px] text-[9px] font-semibold text-[#8892b0]">
            {totalRooms} Rooms
          </span>
          <span className="rounded-full border border-[rgba(61,220,132,0.2)] bg-[rgba(61,220,132,0.1)] px-2 py-[2px] text-[9px] font-semibold text-[#3ddc84]">
            {occupiedCount} Belegt
          </span>
          <span className="rounded-full border border-[rgba(245,166,35,0.2)] bg-[rgba(245,166,35,0.1)] px-2 py-[2px] text-[9px] font-semibold text-[#f5a623]">
            {reservedCount} Reserviert
          </span>
        </div>
      </div>
      <div className="flex flex-wrap gap-[8px] px-[12px] py-[12px]">
        {displayList.map((room) => (
          <RoomTile key={room.room_id} room={room} />
        ))}
      </div>
    </div>
  );
}
