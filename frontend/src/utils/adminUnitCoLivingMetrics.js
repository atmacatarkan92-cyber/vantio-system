/**
 * Shared Co-Living / room-list metrics for admin unit list + unit detail (Phase 3).
 * Tenancy-driven occupancy and revenue; full potential from room list prices.
 */

import {
  getRoomOccupancyStatus,
  isLandlordContractLeaseStarted,
  sumActiveTenancyMonthlyRentForUnit,
} from "./unitOccupancyStatus";

export function getRoomsForUnit(unitId, allRooms) {
  if (!allRooms || unitId == null || unitId === "") return [];
  const uid = String(unitId);
  return allRooms.filter(
    (room) => String(room.unitId || room.unit_id) === uid
  );
}

export function getCoLivingMetrics(unit, allRooms, tenancies) {
  const leaseStarted = isLandlordContractLeaseStarted(unit);
  const rooms = getRoomsForUnit(unit.unitId ?? unit.id, allRooms);

  if (rooms.length === 0) {
    const occupied = Number(unit.occupiedRooms || 0);
    const total = Number(unit.rooms || 0);
    return {
      occupiedCount: occupied,
      reservedCount: 0,
      freeCount: Math.max(total - occupied, 0),
      totalRooms: total,
      fullRevenue: null,
      currentRevenue: null,
      vacancyLoss: null,
      currentProfit: null,
      runningCosts: null,
      leaseStarted,
    };
  }

  let occupiedRooms;
  let reservedRooms;
  let freeRooms;
  if (tenancies == null) {
    occupiedRooms = [];
    reservedRooms = [];
    freeRooms = rooms;
  } else {
    occupiedRooms = rooms.filter(
      (room) => getRoomOccupancyStatus(room, tenancies) === "belegt"
    );
    reservedRooms = rooms.filter(
      (room) => getRoomOccupancyStatus(room, tenancies) === "reserviert"
    );
    freeRooms = rooms.filter(
      (room) => getRoomOccupancyStatus(room, tenancies) === "frei"
    );
  }

  const fullRevenue = rooms.reduce(
    (sum, room) => sum + Number(room.priceMonthly || 0),
    0
  );

  const activeRentFromTenancies =
    tenancies == null
      ? 0
      : sumActiveTenancyMonthlyRentForUnit(unit, tenancies);
  const currentRevenue = activeRentFromTenancies;
  const vacancyLoss =
    fullRevenue != null
      ? Math.max(0, Number(fullRevenue) - activeRentFromTenancies)
      : 0;

  return {
    occupiedCount: occupiedRooms.length,
    reservedCount: reservedRooms.length,
    freeCount: freeRooms.length,
    totalRooms: rooms.length,
    fullRevenue,
    currentRevenue,
    vacancyLoss,
    currentProfit: null,
    runningCosts: null,
    leaseStarted,
  };
}
