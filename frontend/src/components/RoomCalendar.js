import React from "react";
import {
  getRoomOccupancyStatus,
  getTodayIsoForOccupancy,
  isTenancyActiveByDates,
  isTenancyFuture,
  parseIsoDate,
  formatOccupancyStatusDe,
} from "../utils/unitOccupancyStatus";

const DEFAULT_MIN_STAY_MONTHS = 3;
const DEFAULT_NOTICE_PERIOD_MONTHS = 3;
const MONTH_PREVIEW_COUNT = 9;

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

function formatCurrency(value) {
  return `CHF ${Math.round(Number(value || 0)).toLocaleString("de-CH")}`;
}

function getMonthBarStyle(type) {
  if (type === "secure") {
    return "bg-[rgba(61,220,132,0.12)] text-[#3ddc84] border border-[rgba(61,220,132,0.2)]";
  }

  if (type === "risk") {
    return "bg-[rgba(245,166,35,0.12)] text-[#f5a623] border border-[rgba(245,166,35,0.2)]";
  }

  if (type === "reserved") {
    return "bg-[rgba(157,124,244,0.1)] text-[#9d7cf4] border border-[rgba(157,124,244,0.2)]";
  }

  return "bg-[rgba(255,95,109,0.1)] text-[#ff5f6d] border border-[rgba(255,95,109,0.18)]";
}

function getLegendText(type) {
  if (type === "secure") return "Sicher";
  if (type === "risk") return "Risiko";
  if (type === "reserved") return "Reserviert";
  return "Frei";
}

function tenanciesForRoom(room, tenancies) {
  if (!tenancies) return [];
  const rid = String(room.room_id || room.roomId || room.id || "");
  return tenancies.filter(
    (t) => String(t.room_id || t.roomId || "") === rid
  );
}

function parseMoveInDate(room, roomT, todayIso) {
  const active = roomT.find((t) => isTenancyActiveByDates(t, todayIso));
  const future = roomT.find((t) => isTenancyFuture(t, todayIso));
  const raw =
    active?.move_in_date ||
    future?.move_in_date ||
    (room.moveInDate && room.moveInDate !== "-" ? room.moveInDate : null);
  if (!raw) return null;
  const p = parseIsoDate(raw);
  if (!p) return null;
  const [y, m, d] = p.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function getRoomMonthlyTimeline(room, tenancies) {
  const today = getTodayIsoForOccupancy();
  const occ =
    tenancies == null ? null : getRoomOccupancyStatus(room, tenancies);
  const roomT = tenanciesForRoom(room, tenancies || []);
  const moveInDate = parseMoveInDate(room, roomT, today);

  const minimumStayMonths = Number(
    room.minimumStayMonths || DEFAULT_MIN_STAY_MONTHS
  );
  const noticePeriodMonths = Number(
    room.noticePeriodMonths || DEFAULT_NOTICE_PERIOD_MONTHS
  );

  const secureMonths = minimumStayMonths + noticePeriodMonths;

  const currentMonthStart = startOfMonth(new Date());

  return Array.from({ length: MONTH_PREVIEW_COUNT }, (_, index) => {
    const monthDate = addMonths(currentMonthStart, index);

    if (occ === null || occ === "frei") {
      return {
        label: formatMonthLabel(monthDate),
        type: "free",
      };
    }

    if (occ === "reserviert") {
      return {
        label: formatMonthLabel(monthDate),
        type: index === 0 ? "reserved" : "free",
      };
    }

    if (occ === "belegt") {
      if (moveInDate && !Number.isNaN(moveInDate.getTime())) {
        const secureUntilDate = addMonths(moveInDate, secureMonths);
        const riskUntilDate = addMonths(secureUntilDate, 1);

        if (monthDate < secureUntilDate) {
          return {
            label: formatMonthLabel(monthDate),
            type: "secure",
          };
        }

        if (monthDate >= secureUntilDate && monthDate < riskUntilDate) {
          return {
            label: formatMonthLabel(monthDate),
            type: "risk",
          };
        }

        return {
          label: formatMonthLabel(monthDate),
          type: "free",
        };
      }

      if (index < secureMonths) {
        return {
          label: formatMonthLabel(monthDate),
          type: "secure",
        };
      }

      if (index === secureMonths) {
        return {
          label: formatMonthLabel(monthDate),
          type: "risk",
        };
      }

      return {
        label: formatMonthLabel(monthDate),
        type: "free",
      };
    }

    return {
      label: formatMonthLabel(monthDate),
      type: "free",
    };
  });
}

function getRiskMonthsCount(timeline) {
  return timeline.filter((item) => item.type === "risk").length;
}

function getFreeMonthsCount(timeline) {
  return timeline.filter((item) => item.type === "free").length;
}

function getEstimatedLostRevenue(room, timeline) {
  const monthly = Number(room.priceMonthly || 0);
  if (!monthly) return 0;

  const freeMonths = getFreeMonthsCount(timeline);
  const riskMonths = getRiskMonthsCount(timeline);

  return freeMonths * monthly + riskMonths * (monthly * 0.5);
}

function RoomCalendar({ unit, rooms: allRooms = [], tenancies = null }) {
  const unitRooms = allRooms.filter(
    (room) => (room.unitId || room.unit_id) === (unit.unitId || unit.id)
  );

  if (unitRooms.length === 0) {
    return (
      <div className="mx-[14px] my-[12px] overflow-hidden rounded-[10px] border border-[#1c2035] bg-[#141720]">
        <div className="flex flex-wrap items-center gap-[10px] border-b border-[#1c2035] px-[14px] py-[11px]">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[11px] font-medium text-[#5b9cf6]">{unit.unitId}</p>
            <p className="mt-[2px] text-[11px] text-[#8892b0]">{unit.place}</p>
          </div>
        </div>
        <p className="px-[14px] py-[12px] text-[11px] italic text-[#4a5070]">Keine Rooms für diese Unit erfasst.</p>
      </div>
    );
  }

  const unitFreeMonths = unitRooms.reduce((sum, room) => {
    const timeline = getRoomMonthlyTimeline(room, tenancies);
    return sum + getFreeMonthsCount(timeline);
  }, 0);

  const unitRiskMonths = unitRooms.reduce((sum, room) => {
    const timeline = getRoomMonthlyTimeline(room, tenancies);
    return sum + getRiskMonthsCount(timeline);
  }, 0);

  const unitEstimatedLostRevenue = unitRooms.reduce((sum, room) => {
    const timeline = getRoomMonthlyTimeline(room, tenancies);
    return sum + getEstimatedLostRevenue(room, timeline);
  }, 0);

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
            {unitFreeMonths} freie Monate
          </span>
          <span className="rounded-full border border-[rgba(245,166,35,0.2)] bg-[rgba(245,166,35,0.1)] px-2 py-[2px] text-[9px] font-semibold text-[#f5a623]">
            {unitRiskMonths} Risiko-Monate
          </span>
          <span className="rounded-full border border-[rgba(255,95,109,0.2)] bg-[rgba(255,95,109,0.1)] px-2 py-[2px] font-mono text-[9px] font-semibold text-[#ff5f6d]">
            {formatCurrency(unitEstimatedLostRevenue)} pot. Verlust
          </span>
        </div>
      </div>

      <div className="px-0 pb-0 pt-0">
        {unitRooms.map((room, index) => {
          const timeline = getRoomMonthlyTimeline(room, tenancies);
          const freeMonths = getFreeMonthsCount(timeline);
          const riskMonths = getRiskMonthsCount(timeline);
          const estimatedLostRevenue = getEstimatedLostRevenue(room, timeline);
          const occ =
            tenancies != null ? getRoomOccupancyStatus(room, tenancies) : null;

          return (
            <div
              key={room.roomId || index}
              className="border-b border-[#1c2035] px-[14px] py-[12px] last:border-b-0"
            >
              <div className="mb-[8px] flex flex-col gap-[8px] sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[12px] font-medium text-[#edf0f7]">
                    {room.roomName || room.name || `Zimmer ${index + 1}`}
                  </p>

                  <p className="mt-[1px] text-[10px] text-[#4a5070]">
                    {occ != null ? formatOccupancyStatusDe(occ) : "—"}
                    {room.priceMonthly
                      ? ` · CHF ${Number(room.priceMonthly).toLocaleString("de-CH")}`
                      : ""}
                    {room.moveInDate ? ` · Einzug ${room.moveInDate}` : ""}
                    {` · Mindestdauer ${Number(
                      room.minimumStayMonths || DEFAULT_MIN_STAY_MONTHS
                    )}M`}
                    {` · Kündigung ${Number(
                      room.noticePeriodMonths || DEFAULT_NOTICE_PERIOD_MONTHS
                    )}M`}
                  </p>
                </div>

                <div className="flex flex-wrap gap-[4px] sm:justify-end">
                  <span className="rounded-full border border-[rgba(61,220,132,0.2)] bg-[rgba(61,220,132,0.1)] px-2 py-[2px] text-[9px] font-semibold text-[#3ddc84]">
                    {freeMonths} freie Monate
                  </span>
                  <span className="rounded-full border border-[rgba(245,166,35,0.2)] bg-[rgba(245,166,35,0.1)] px-2 py-[2px] text-[9px] font-semibold text-[#f5a623]">
                    {riskMonths} Risiko-Monate
                  </span>
                  <span className="rounded-full border border-[rgba(255,95,109,0.2)] bg-[rgba(255,95,109,0.1)] px-2 py-[2px] font-mono text-[9px] font-semibold text-[#ff5f6d]">
                    {formatCurrency(estimatedLostRevenue)} Risiko
                  </span>
                </div>
              </div>

              <div className="mb-[4px] grid grid-cols-3 gap-[3px] md:grid-cols-4 xl:grid-cols-9">
                {timeline.map((month, mi) => (
                  <div
                    key={`${room.roomId || index}-h-${mi}-${month.label}`}
                    className="text-center font-mono text-[8px] text-[#4a5070]"
                  >
                    {month.label}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-[3px] md:grid-cols-4 xl:grid-cols-9">
                {timeline.map((month, mi) => (
                  <div
                    key={`${room.roomId || index}-c-${mi}-${month.label}`}
                    className={`rounded-[5px] px-[2px] py-[5px] text-center font-mono text-[9px] font-semibold tracking-[0.2px] ${getMonthBarStyle(
                      month.type
                    )}`}
                  >
                    {getLegendText(month.type)}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default RoomCalendar;
