import React, { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  fetchAdminUnits,
  fetchAdminRooms,
  fetchAdminProperties,
  createAdminUnit,
  updateAdminUnit,
  deleteAdminUnit,
  normalizeUnit,
  normalizeRoom,
} from "../../api/adminData";
import { getDisplayUnitId, normalizeUnitTypeLabel } from "../../utils/unitDisplayId";

const emptyForm = {
  place: "",
  zip: "",
  address: "",
  type: "Apartment",
  rooms: "",
  occupiedRooms: 0,
  status: "Frei",
  property_id: "",
  tenantPriceMonthly: "",
  landlordRentMonthly: "",
  utilitiesMonthly: "",
  cleaningCostMonthly: "",
  availableFrom: "",
  landlordLeaseStartDate: "",
};

function parseMoneyChf(raw) {
  if (raw === "" || raw == null) return 0;
  const n = Number(String(raw).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function dateOnlyOrNull(raw) {
  const s = String(raw || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}/.test(s)) return null;
  return s.slice(0, 10);
}

function numFieldStr(v) {
  if (v == null || v === "") return "";
  return String(v);
}

/** Stable room count from number input (avoids `|| 0` turning "" into 0 incorrectly for parsing). */
function parseRoomsTotal(raw) {
  if (raw === "" || raw === null || raw === undefined) return 0;
  const s = String(raw).replace(/\u00a0/g, " ").trim();
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

function parseRoomPriceChf(raw) {
  if (raw === "" || raw === null || raw === undefined) return NaN;
  const n = Number(String(raw).replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}

function sumCoLivingRoomPricesChf(rows) {
  if (!Array.isArray(rows)) return 0;
  return rows.reduce((sum, row) => {
    const p = parseRoomPriceChf(row?.price);
    return sum + (Number.isFinite(p) && p >= 0 ? p : 0);
  }, 0);
}

function sumFirstNCoLivingRoomPricesChf(rows, n) {
  if (!Array.isArray(rows) || rows.length === 0) return 0;
  const cap = Math.min(Math.max(0, Math.floor(Number(n) || 0)), rows.length);
  let sum = 0;
  for (let i = 0; i < cap; i++) {
    const p = parseRoomPriceChf(rows[i]?.price);
    sum += Number.isFinite(p) && p >= 0 ? p : 0;
  }
  return sum;
}

/** One row per room; preserves existing row state when count changes. */
function ensureCoLivingRoomRows(n, prev) {
  const safe = Array.isArray(prev) ? prev : [];
  return Array.from({ length: n }, (_, i) => {
    if (safe[i]) {
      const r = safe[i];
      return { ...r, available_from: r.available_from ?? "" };
    }
    return {
      name: `Zimmer ${i + 1}`,
      price: "",
      floor: "",
      size_m2: "",
      status: "Frei",
      available_from: "",
    };
  });
}

function roundCurrency(value) {
  return Math.round(Number(value || 0));
}

function formatCurrency(value) {
  return `CHF ${roundCurrency(value).toLocaleString("de-CH")}`;
}

function getTodayDateString() {
  return new Date().toISOString().split("T")[0];
}

function hasLeaseStarted(unit) {
  if (!unit.landlordLeaseStartDate) return true;
  return unit.landlordLeaseStartDate <= getTodayDateString();
}

function getRunningMonthlyCosts(unit) {
  if (!hasLeaseStarted(unit)) return 0;

  return (
    Number(unit.landlordRentMonthly || 0) +
    Number(unit.utilitiesMonthly || 0) +
    Number(unit.cleaningCostMonthly || 0)
  );
}

function calculateApartmentProfit(unit) {
  const tenantPrice = Number(unit.tenantPriceMonthly || 0);
  const runningCosts = getRunningMonthlyCosts(unit);
  return tenantPrice - runningCosts;
}

function getRoomsForUnit(unitId, allRooms = []) {
  return allRooms.filter((room) => (room.unitId || room.unit_id) === unitId);
}

function getCoLivingMetrics(unit, allRooms = []) {
  const leaseStarted = hasLeaseStarted(unit);
  const rooms = getRoomsForUnit(unit.unitId || unit.id, allRooms);

  if (rooms.length === 0) {
    const occupied = Number(unit.occupiedRooms || 0);
    const total = Number(unit.rooms || 0);
    const fullRevenue = Number(unit.tenantPriceMonthly || 0);

    const currentRevenue =
      total > 0 && leaseStarted ? (fullRevenue / total) * occupied : 0;

    return {
      occupiedCount: occupied,
      reservedCount: 0,
      freeCount: Math.max(total - occupied, 0),
      totalRooms: total,
      fullRevenue,
      currentRevenue,
      vacancyLoss: leaseStarted ? fullRevenue - currentRevenue : 0,
      currentProfit: currentRevenue - getRunningMonthlyCosts(unit),
      displayStatus:
        occupied === 0
          ? "Frei"
          : occupied === total
          ? "Belegt"
          : "Teilbelegt",
    };
  }

  const occupiedRooms = rooms.filter((room) => room.status === "Belegt");
  const reservedRooms = rooms.filter((room) => room.status === "Reserviert");
  const freeRooms = rooms.filter((room) => room.status === "Frei");

  const fullRevenue = rooms.reduce(
    (sum, room) => sum + Number(room.priceMonthly || 0),
    0
  );

  const currentRevenue = leaseStarted
    ? occupiedRooms.reduce(
        (sum, room) => sum + Number(room.priceMonthly || 0),
        0
      )
    : 0;

  let displayStatus = "Frei";
  if (occupiedRooms.length > 0 && occupiedRooms.length === rooms.length) {
    displayStatus = "Belegt";
  } else if (occupiedRooms.length > 0 || reservedRooms.length > 0) {
    displayStatus = "Teilbelegt";
  }

  return {
    occupiedCount: occupiedRooms.length,
    reservedCount: reservedRooms.length,
    freeCount: freeRooms.length,
    totalRooms: rooms.length,
    fullRevenue,
    currentRevenue,
    vacancyLoss: leaseStarted ? fullRevenue - currentRevenue : 0,
    currentProfit: currentRevenue - getRunningMonthlyCosts(unit),
    displayStatus,
  };
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

function ApartmentTable({ items, onEdit, onDelete }) {
  return (
    <SectionCard
      title="Business Apartments / klassische Apartments"
      subtitle="Einzelne vermietbare Einheiten mit einem Vertrag pro Apartment."
    >
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500 text-sm">
              <th className="py-3 pr-4">Unit ID</th>
              <th className="py-3 pr-4">Ort</th>
              <th className="py-3 pr-4">PLZ</th>
              <th className="py-3 pr-4">Adresse</th>
              <th className="py-3 pr-4">Typ</th>
              <th className="py-3 pr-4">Liegenschaft</th>
              <th className="py-3 pr-4">Status</th>
              <th className="py-3 pr-4">Zimmer</th>
              <th className="py-3 pr-4">Mieterpreis</th>
              <th className="py-3 pr-4">Mietkosten</th>
              <th className="py-3 pr-4">Gewinn aktuell</th>
              <th className="py-3 pr-4">Verfügbar ab</th>
              <th className="py-3 pr-4">Mietstart Vermieter</th>
              <th className="py-3 pr-4">Aktionen</th>
            </tr>
          </thead>

          <tbody>
            {items.map((unit, index) => (
              <tr
                key={unit.id}
                className="border-b border-slate-100 text-slate-700"
              >
                <td className="py-4 pr-4 font-medium">
                  <Link
                    to={`/admin/units/${unit.unitId}`}
                    className="text-orange-600 hover:text-orange-700 hover:underline block"
                  >
                    {getDisplayUnitId(unit, index)}
                  </Link>
                  <span className="block text-[10px] text-slate-400 font-normal break-all mt-0.5">
                    {unit.unitId}
                  </span>
                </td>
                <td className="py-4 pr-4">{unit.place}</td>
                <td className="py-4 pr-4">{unit.zip}</td>
                <td className="py-4 pr-4">{unit.address}</td>
                <td className="py-4 pr-4">{unit.type}</td>
                <td className="py-4 pr-4">{unit.property_title || "—"}</td>
                <td className="py-4 pr-4">{unit.status}</td>
                <td className="py-4 pr-4">{unit.rooms}</td>
                <td className="py-4 pr-4">
                  {formatCurrency(unit.tenantPriceMonthly)}
                </td>
                <td className="py-4 pr-4">
                  {formatCurrency(unit.landlordRentMonthly)}
                </td>
                <td className="py-4 pr-4 font-medium">
                  {formatCurrency(calculateApartmentProfit(unit))}
                </td>
                <td className="py-4 pr-4">{unit.availableFrom}</td>
                <td className="py-4 pr-4">
                  {unit.landlordLeaseStartDate || "-"}
                </td>
                <td className="py-4 pr-4">
                  <div className="flex gap-2">
                    <button
                      onClick={() => onEdit(unit)}
                      className="px-3 py-2 rounded-lg border border-slate-300 text-sm hover:bg-slate-50"
                    >
                      Bearbeiten
                    </button>
                    <button
                      onClick={() => onDelete(unit.id)}
                      className="px-3 py-2 rounded-lg border border-red-300 text-red-600 text-sm hover:bg-red-50"
                    >
                      Löschen
                    </button>
                  </div>
                </td>
              </tr>
            ))}

            {items.length === 0 && (
              <tr>
                <td colSpan="14" className="py-8 text-center text-slate-500">
                  Keine Apartments gefunden.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

function CoLivingTable({ items, rooms, onEdit, onDelete }) {
  return (
    <SectionCard
      title="Co-Living Units"
      subtitle="Mehrzimmer-Einheiten mit Room-Logik, Belegung und Umsatzberechnung."
    >
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500 text-sm">
              <th className="py-3 pr-4">Unit ID</th>
              <th className="py-3 pr-4">Ort</th>
              <th className="py-3 pr-4">PLZ</th>
              <th className="py-3 pr-4">Adresse</th>
              <th className="py-3 pr-4">Liegenschaft</th>
              <th className="py-3 pr-4">Status</th>
              <th className="py-3 pr-4">Belegt</th>
              <th className="py-3 pr-4">Reserviert</th>
              <th className="py-3 pr-4">Frei</th>
              <th className="py-3 pr-4">Vollbelegung</th>
              <th className="py-3 pr-4">Aktuell</th>
              <th className="py-3 pr-4">Leerstand</th>
              <th className="py-3 pr-4">Gewinn aktuell</th>
              <th className="py-3 pr-4">Mietstart Vermieter</th>
              <th className="py-3 pr-4">Aktionen</th>
            </tr>
          </thead>

          <tbody>
            {items.map((unit, index) => {
              const metrics = getCoLivingMetrics(unit, rooms);

              return (
                <tr
                  key={unit.id}
                  className="border-b border-slate-100 text-slate-700"
                >
                  <td className="py-4 pr-4 font-medium">
                    <Link
                      to={`/admin/units/${unit.unitId}`}
                      className="text-orange-600 hover:text-orange-700 hover:underline block"
                    >
                      {getDisplayUnitId(unit, index)}
                    </Link>
                    <span className="block text-[10px] text-slate-400 font-normal break-all mt-0.5">
                      {unit.unitId}
                    </span>
                  </td>
                  <td className="py-4 pr-4">{unit.place}</td>
                <td className="py-4 pr-4">{unit.zip}</td>
                <td className="py-4 pr-4">{unit.address}</td>
                <td className="py-4 pr-4">{unit.property_title || "—"}</td>
                <td className="py-4 pr-4">{metrics.displayStatus}</td>
                  <td className="py-4 pr-4">{metrics.occupiedCount}</td>
                  <td className="py-4 pr-4">{metrics.reservedCount}</td>
                  <td className="py-4 pr-4">{metrics.freeCount}</td>
                  <td className="py-4 pr-4">
                    {formatCurrency(metrics.fullRevenue)}
                  </td>
                  <td className="py-4 pr-4">
                    {formatCurrency(metrics.currentRevenue)}
                  </td>
                  <td className="py-4 pr-4">
                    {formatCurrency(metrics.vacancyLoss)}
                  </td>
                  <td className="py-4 pr-4 font-medium">
                    {formatCurrency(metrics.currentProfit)}
                  </td>
                  <td className="py-4 pr-4">
                    {unit.landlordLeaseStartDate || "-"}
                  </td>
                  <td className="py-4 pr-4">
                    <div className="flex gap-2">
                      <button
                        onClick={() => onEdit(unit)}
                        className="px-3 py-2 rounded-lg border border-slate-300 text-sm hover:bg-slate-50"
                      >
                        Bearbeiten
                      </button>
                      <button
                        onClick={() => onDelete(unit.id)}
                        className="px-3 py-2 rounded-lg border border-red-300 text-red-600 text-sm hover:bg-red-50"
                      >
                        Löschen
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}

            {items.length === 0 && (
              <tr>
                <td colSpan="15" className="py-8 text-center text-slate-500">
                  Keine Co-Living Einheiten gefunden.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

function StatCard({ label, value, hint }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="text-2xl font-bold text-slate-800 mt-2">{value}</p>
      {hint ? <p className="text-xs text-slate-400 mt-2">{hint}</p> : null}
    </div>
  );
}

function AdminApartmentsPage() {
  const [units, setUnits] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFetchError("");

    Promise.allSettled([
      fetchAdminUnits(),
      fetchAdminRooms(),
      fetchAdminProperties(),
    ]).then((results) => {
      if (cancelled) return;

      const [unitsRes, roomsRes, propsRes] = results;

      if (unitsRes.status === "fulfilled") {
        const data = unitsRes.value;
        setUnits(Array.isArray(data) ? data.map(normalizeUnit) : []);
      } else {
        console.error(unitsRes.reason);
        setFetchError(
          unitsRes.reason?.message || "Einheiten konnten nicht geladen werden."
        );
        setUnits([]);
      }

      if (roomsRes.status === "fulfilled") {
        const data = roomsRes.value;
        setRooms(Array.isArray(data) ? data.map(normalizeRoom) : []);
      } else {
        console.error(roomsRes.reason);
        setRooms([]);
      }

      if (propsRes.status === "fulfilled") {
        const data = propsRes.value;
        setProperties(Array.isArray(data) ? data : []);
      } else {
        console.error(propsRes.reason);
        setProperties([]);
      }

      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const [searchTerm, setSearchTerm] = useState("");
  const [propertyFilter, setPropertyFilter] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState(emptyForm);
  const [coLivingRoomRows, setCoLivingRoomRows] = useState([]);

  const normalizedUnitType = normalizeUnitTypeLabel(formData.type);
  const isCoLivingType = normalizedUnitType === "Co-Living";
  const parsedRoomsTotal = useMemo(
    () => parseRoomsTotal(formData.rooms),
    [formData.rooms]
  );

  const coLivingRowsForDisplay = useMemo(() => {
    if (!isCoLivingType || editingId || parsedRoomsTotal <= 0) return [];
    return ensureCoLivingRoomRows(parsedRoomsTotal, coLivingRoomRows);
  }, [isCoLivingType, editingId, parsedRoomsTotal, coLivingRoomRows]);

  const coLivingOccupiedClamped = useMemo(() => {
    if (!isCoLivingType) return 0;
    return 0;
  }, [isCoLivingType]);

  const coLivingFullOccupancyRevenue = useMemo(() => {
    if (!isCoLivingType) return 0;
    const rows = coLivingRowsForDisplay;
    if (rows.length > 0 && rows.length === parsedRoomsTotal && parsedRoomsTotal > 0) {
      return sumCoLivingRoomPricesChf(rows);
    }
    return Number(formData.tenantPriceMonthly || 0);
  }, [
    isCoLivingType,
    coLivingRowsForDisplay,
    parsedRoomsTotal,
    formData.tenantPriceMonthly,
  ]);

  const nextUnitId = useMemo(() => {
    const maxNumber = units.reduce((max, item) => {
      const uid = item.unitId || item.id || "";
      const parts = String(uid).split("-");
      const number = parseInt(parts[parts.length - 1] || "0", 10);
      return !isNaN(number) && number > max ? number : max;
    }, 0);
    return `FAH-U-${String(maxNumber + 1).padStart(4, "0")}`;
  }, [units]);

  // useLayoutEffect: must run before paint so room blocks exist before submit (Enter) in the same tick as the last rooms change.
  useLayoutEffect(() => {
    if (!isModalOpen || editingId) return;
    if (!isCoLivingType) {
      setCoLivingRoomRows([]);
      return;
    }
    const n = parsedRoomsTotal;
    if (n === 0) {
      setCoLivingRoomRows([]);
      return;
    }
    setCoLivingRoomRows((prev) => ensureCoLivingRoomRows(n, prev));
  }, [isModalOpen, editingId, isCoLivingType, parsedRoomsTotal]);

  const filteredUnits = useMemo(() => {
    let result = units;
    const search = searchTerm.toLowerCase().trim();
    if (search) {
      result = result.filter((unit) => {
        const a = String(unit.unitId || unit.id || "").toLowerCase();
        const b = String(unit.place || unit.city || "").toLowerCase();
        const c = String(unit.zip || "").toLowerCase();
        const d = String(unit.address || "").toLowerCase();
        const e = String(unit.type || "").toLowerCase();
        const f = String(unit.status || "").toLowerCase();
        const g = String(unit.property_title || "").toLowerCase();
        return a.includes(search) || b.includes(search) || c.includes(search) || d.includes(search) || e.includes(search) || f.includes(search) || g.includes(search);
      });
    }
    if (propertyFilter) {
      result = result.filter((unit) => String(unit.property_id || "") === String(propertyFilter));
    }
    return result;
  }, [units, searchTerm, propertyFilter]);

  const apartmentUnits = filteredUnits.filter((item) => item.type === "Apartment");
  const coLivingUnits = filteredUnits.filter((item) => item.type === "Co-Living");

  const summary = useMemo(() => {
    const totalUnits = filteredUnits.length;
    const totalApartments = apartmentUnits.length;
    const totalCoLivingUnits = coLivingUnits.length;

    const currentRevenue = filteredUnits.reduce((sum, unit) => {
      if (unit.type === "Apartment") {
        return sum + Number(unit.tenantPriceMonthly || 0);
      }

      const metrics = getCoLivingMetrics(unit, rooms);
      return sum + Number(metrics.currentRevenue || 0);
    }, 0);

    const runningCosts = filteredUnits.reduce(
      (sum, unit) => sum + getRunningMonthlyCosts(unit),
      0
    );

    return {
      totalUnits,
      totalApartments,
      totalCoLivingUnits,
      currentRevenue,
      runningCosts,
      currentProfit: currentRevenue - runningCosts,
    };
  }, [filteredUnits, apartmentUnits.length, coLivingUnits.length, rooms]);

  function handleOpenCreateModal() {
    setEditingId(null);
    setFormData(emptyForm);
    setCoLivingRoomRows([]);
    setIsModalOpen(true);
  }

  function handleOpenEditModal(unit) {
    setEditingId(unit.id);
    setFormData({
      place: unit.place,
      zip: unit.zip != null && unit.zip !== "" ? String(unit.zip) : "",
      address: unit.address,
      type: unit.type,
      rooms: unit.rooms,
      occupiedRooms: unit.occupiedRooms || 0,
      status: unit.status,
      property_id: unit.property_id || "",
      tenantPriceMonthly: numFieldStr(unit.tenantPriceMonthly),
      landlordRentMonthly: numFieldStr(unit.landlordRentMonthly),
      utilitiesMonthly: numFieldStr(unit.utilitiesMonthly),
      cleaningCostMonthly: numFieldStr(unit.cleaningCostMonthly),
      availableFrom: numFieldStr(unit.availableFrom).slice(0, 10),
      landlordLeaseStartDate: numFieldStr(unit.landlordLeaseStartDate).slice(0, 10),
    });
    setSaveError("");
    setIsModalOpen(true);
  }

  function handleCloseModal() {
    setIsModalOpen(false);
    setEditingId(null);
    setFormData(emptyForm);
    setCoLivingRoomRows([]);
  }

  function handleCoLivingRoomChange(index, field, rawValue) {
    setCoLivingRoomRows((prev) => {
      const base = ensureCoLivingRoomRows(parsedRoomsTotal, prev);
      const next = [...base];
      if (index < 0 || index >= next.length) return prev;
      next[index] = { ...next[index], [field]: rawValue };
      return next;
    });
  }

  function handleChange(event) {
    const { name, value } = event.target;

    let nextValue = value;

    if (name === "occupiedRooms") {
      const totalRooms = parseRoomsTotal(formData.rooms);
      let occupied = Number(value);
      if (Number.isNaN(occupied)) occupied = 0;
      occupied = Math.floor(occupied);
      if (occupied < 0) occupied = 0;
      if (totalRooms > 0 && occupied > totalRooms) occupied = totalRooms;
      nextValue = occupied;
    }

    if (name === "type" && value === "Apartment") {
      setFormData((prev) => ({
        ...prev,
        type: value,
        occupiedRooms: 0,
      }));
      return;
    }

    if (name === "type" && value === "Co-Living") {
      setFormData((prev) => ({
        ...prev,
        type: value,
        occupiedRooms: 0,
        status: "Frei",
      }));
      return;
    }

    setFormData((prev) => ({
      ...prev,
      [name]: nextValue,
    }));
  }

  function handleSubmit(event) {
    event.preventDefault();
    setSaveError("");

    const coLivingRowsForSubmit =
      !editingId && isCoLivingType && parsedRoomsTotal > 0
        ? ensureCoLivingRoomRows(parsedRoomsTotal, coLivingRoomRows)
        : coLivingRoomRows;

    if (!editingId && isCoLivingType) {
      const n = parsedRoomsTotal;
      if (n > 0) {
        if (coLivingRowsForSubmit.length !== n) {
          setSaveError(
            "Bei Co-Living muss die Anzahl Zimmer mit den ausgefüllten Zimmerzeilen übereinstimmen."
          );
          return;
        }
        const allowedStatus = ["Frei", "Belegt", "Reserviert"];
        for (let i = 0; i < n; i++) {
          const row = coLivingRowsForSubmit[i];
          if (!row || !String(row.name || "").trim()) {
            setSaveError(`Zimmer ${i + 1}: Name ist erforderlich.`);
            return;
          }
          if (row.price === "" || row.price === null || row.price === undefined) {
            setSaveError(`Zimmer ${i + 1}: Preis ist erforderlich.`);
            return;
          }
          const prn = Number(String(row.price).replace(",", "."));
          if (Number.isNaN(prn) || prn < 0) {
            setSaveError(`Zimmer ${i + 1}: Ungültiger Preis.`);
            return;
          }
          const st = row.status || "Frei";
          if (!allowedStatus.includes(st)) {
            setSaveError(`Zimmer ${i + 1}: Ungültiger Status.`);
            return;
          }
          if (row.floor !== "" && row.floor != null) {
            const fl = Number(String(row.floor).replace(",", "."));
            if (Number.isNaN(fl) || fl < 0) {
              setSaveError(`Zimmer ${i + 1}: Ungültige Etage.`);
              return;
            }
          }
          if (row.size_m2 !== "" && row.size_m2 != null) {
            const sm = Number(String(row.size_m2).replace(",", "."));
            if (Number.isNaN(sm) || sm < 0) {
              setSaveError(`Zimmer ${i + 1}: Ungültige Fläche (m²).`);
              return;
            }
          }
        }
      }
    }

    setSaving(true);

    const apiPayload = {
      title: (formData.place || formData.address || "Unit").trim() || "Unit",
      address: (formData.address || "").trim() || "",
      city: (formData.place || "").trim() || "",
      city_id: null,
      type: normalizedUnitType || null,
      rooms: parsedRoomsTotal,
      property_id: (formData.property_id || "").trim() || null,
      tenant_price_monthly_chf: parseMoneyChf(formData.tenantPriceMonthly),
      landlord_rent_monthly_chf: parseMoneyChf(formData.landlordRentMonthly),
      utilities_monthly_chf: parseMoneyChf(formData.utilitiesMonthly),
      cleaning_cost_monthly_chf: parseMoneyChf(formData.cleaningCostMonthly),
      landlord_lease_start_date: dateOnlyOrNull(formData.landlordLeaseStartDate),
      available_from: dateOnlyOrNull(formData.availableFrom),
      occupancy_status: String(formData.status || "").trim() || null,
      occupied_rooms: Math.max(0, Math.floor(Number(formData.occupiedRooms) || 0)),
      postal_code: String(formData.zip || "").trim() || null,
    };

    if (!editingId && isCoLivingType) {
      const n = parsedRoomsTotal;
      if (n > 0) {
        apiPayload.co_living_rooms = coLivingRowsForSubmit.map((row) => {
          const floorRaw = row.floor;
          const floor =
            floorRaw === "" || floorRaw == null
              ? null
              : Math.round(Number(String(floorRaw).replace(",", ".")));
          const sizeRaw = row.size_m2;
          const size_m2 =
            sizeRaw === "" || sizeRaw == null
              ? null
              : Number(String(sizeRaw).replace(",", "."));
          return {
            name: String(row.name).trim(),
            price: Math.round(Number(String(row.price).replace(",", "."))),
            floor,
            size_m2,
            status: row.status || "Frei",
          };
        });
      }
    }

    const promise = editingId
      ? updateAdminUnit(editingId, apiPayload)
      : createAdminUnit(apiPayload);

    promise
      .then(() => Promise.all([fetchAdminUnits(), fetchAdminRooms()]))
      .then(([unitsData, roomsData]) => {
        setUnits(Array.isArray(unitsData) ? unitsData.map(normalizeUnit) : []);
        setRooms(Array.isArray(roomsData) ? roomsData.map(normalizeRoom) : []);
        handleCloseModal();
      })
      .catch((e) => {
        const msg =
          (typeof e === "string" && e) ||
          (e && typeof e.message === "string" && e.message) ||
          (e != null && String(e)) ||
          "Speichern fehlgeschlagen.";
        setSaveError(msg);
      })
      .finally(() => setSaving(false));
  }

  function handleDelete(id) {
    const unitRooms = getRoomsForUnit(id, rooms);
    const confirmMsg =
      unitRooms.length > 0
        ? "Diese Unit enthält noch Zimmer. Wirklich löschen?"
        : "Möchtest du diese Unit wirklich löschen?";
    const confirmed = window.confirm(confirmMsg);

    if (!confirmed) return;

    setDeleteError("");
    deleteAdminUnit(id)
      .then(() => {
        setUnits((prev) => prev.filter((item) => item.id !== id));
        setRooms((prev) =>
          prev.filter(
            (r) => String(r.unitId || r.unit_id) !== String(id)
          )
        );
        return Promise.all([fetchAdminUnits(), fetchAdminRooms()])
          .then(([unitsData, roomsData]) => {
            setUnits(
              Array.isArray(unitsData) ? unitsData.map(normalizeUnit) : []
            );
            setRooms(
              Array.isArray(roomsData) ? roomsData.map(normalizeRoom) : []
            );
          })
          .catch((refetchErr) => {
            setDeleteError(
              `Gelöscht. Liste konnte nicht aktualisiert werden: ${
                refetchErr?.message || String(refetchErr)
              }`
            );
          });
      })
      .catch((e) => {
        const msg =
          (e && typeof e.message === "string" && e.message) ||
          (e != null && String(e)) ||
          "Löschen fehlgeschlagen.";
        setDeleteError(msg);
      });
  }

  const formLeaseStarted =
    !formData.landlordLeaseStartDate ||
    formData.landlordLeaseStartDate <= getTodayDateString();

  const formRunningMonthlyCosts = formLeaseStarted
    ? Number(formData.landlordRentMonthly || 0) +
      Number(formData.utilitiesMonthly || 0) +
      Number(formData.cleaningCostMonthly || 0)
    : 0;

  const currentApartmentProfit =
    Number(formData.tenantPriceMonthly || 0) - formRunningMonthlyCosts;

  const currentFreeRooms = isCoLivingType
    ? Math.max(parsedRoomsTotal - coLivingOccupiedClamped, 0)
    : "-";

  const currentCoLivingRevenue =
    isCoLivingType && parsedRoomsTotal > 0 && formLeaseStarted
      ? coLivingRowsForDisplay.length > 0 &&
        coLivingRowsForDisplay.length === parsedRoomsTotal
        ? sumFirstNCoLivingRoomPricesChf(
            coLivingRowsForDisplay,
            coLivingOccupiedClamped
          )
        : (coLivingFullOccupancyRevenue / parsedRoomsTotal) *
          coLivingOccupiedClamped
      : 0;

  const currentCoLivingVacancy =
    isCoLivingType && formLeaseStarted
      ? coLivingFullOccupancyRevenue - currentCoLivingRevenue
      : 0;

  const currentCoLivingProfit =
    currentCoLivingRevenue - formRunningMonthlyCosts;

  return (
    <div data-testid="admin-apartments-page">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-3xl font-bold text-slate-800">
            Apartments / Units
          </h2>
          <p className="text-slate-500 mt-1">
            Verwalte hier alle vermietbaren Einheiten, also Apartments und
            Co-Living Units.
          </p>
        </div>

        <button
          onClick={handleOpenCreateModal}
          className="bg-orange-500 hover:bg-orange-600 text-white px-5 py-3 rounded-lg font-medium transition"
        >
          + Unit hinzufügen
        </button>
      </div>

      {loading && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center text-slate-600">
          Laden…
        </div>
      )}

      {!loading && fetchError && (
        <div className="bg-white rounded-2xl border border-red-200 shadow-sm p-8 text-center text-red-600">
          {fetchError}
        </div>
      )}

      {!loading && deleteError && (
        <div className="bg-white rounded-2xl border border-red-200 shadow-sm p-4 mb-4 text-center text-red-600 text-sm">
          {deleteError}
        </div>
      )}

      {!loading && !fetchError && units.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center text-slate-600">
          Keine Daten vorhanden
        </div>
      )}

      {!loading && !fetchError && units.length > 0 && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4 mb-6">
            <StatCard
              label="Units gesamt"
              value={summary.totalUnits}
              hint="Alle gefilterten Einheiten"
            />
            <StatCard
              label="Apartments"
              value={summary.totalApartments}
              hint="Klassische Einzelwohnungen"
            />
            <StatCard
              label="Co-Living Units"
              value={summary.totalCoLivingUnits}
              hint="Mehrzimmer-Einheiten"
            />
            <StatCard
              label="Aktueller Umsatz"
              value={formatCurrency(summary.currentRevenue)}
              hint="Auf Basis der aktuellen Daten"
            />
            <StatCard
              label="Gewinn aktuell"
              value={formatCurrency(summary.currentProfit)}
              hint="Umsatz minus laufende Kosten"
            />
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-6 flex flex-wrap items-center gap-4">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Suche nach Unit ID, Ort, PLZ, Adresse oder Typ..."
              className="w-full md:w-96 border border-slate-300 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500"
            />
            <select
              value={propertyFilter}
              onChange={(e) => setPropertyFilter(e.target.value)}
              className="border border-slate-300 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500 min-w-[180px]"
            >
              <option value="">Alle Liegenschaften</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>{p.title || p.id}</option>
              ))}
            </select>
          </div>

          <div className="space-y-6">
            <ApartmentTable
              items={apartmentUnits}
              onEdit={handleOpenEditModal}
              onDelete={handleDelete}
            />

            <CoLivingTable
              items={coLivingUnits}
              rooms={rooms}
              onEdit={handleOpenEditModal}
              onDelete={handleDelete}
            />
          </div>
        </>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white w-full max-w-3xl rounded-2xl shadow-xl border border-slate-200 p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-2xl font-bold text-slate-800">
                  {editingId ? "Unit bearbeiten" : "Neue Unit hinzufügen"}
                </h3>
                <p className="text-slate-500 mt-1">
                  {editingId
                    ? "Bearbeite hier die vorhandene Unit."
                    : "Die Unit ID wird automatisch vergeben."}
                </p>
              </div>

              <button
                onClick={handleCloseModal}
                className="text-slate-500 hover:text-slate-700 text-2xl leading-none"
              >
                ×
              </button>
            </div>

            <div className="mb-6 bg-slate-50 border border-slate-200 rounded-xl p-4">
              <p className="text-sm text-slate-500">
                {editingId ? "Unit ID" : "Automatische Unit ID"}
              </p>
              <p className="text-xl font-bold text-slate-800 mt-1">
                {editingId
                  ? units.find((item) => item.id === editingId)?.unitId
                  : nextUnitId}
              </p>
            </div>

            {saveError && (
              <p className="mb-4 text-red-600 text-sm">{saveError}</p>
            )}
            <form onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-slate-600 mb-2">
                    Ort
                  </label>
                  <input
                    type="text"
                    name="place"
                    value={formData.place}
                    onChange={handleChange}
                    required
                    className="w-full border border-slate-300 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-sm text-slate-600 mb-2">
                    PLZ
                  </label>
                  <input
                    type="text"
                    name="zip"
                    value={formData.zip}
                    onChange={handleChange}
                    required
                    className="w-full border border-slate-300 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm text-slate-600 mb-2">
                    Adresse
                  </label>
                  <input
                    type="text"
                    name="address"
                    value={formData.address}
                    onChange={handleChange}
                    required
                    className="w-full border border-slate-300 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-sm text-slate-600 mb-2">
                    Typ
                  </label>
                  <select
                    name="type"
                    value={formData.type}
                    onChange={handleChange}
                    className="w-full border border-slate-300 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500"
                  >
                    <option value="Apartment">Apartment</option>
                    <option value="Co-Living">Co-Living</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm text-slate-600 mb-2">
                    Liegenschaft (optional)
                  </label>
                  <select
                    name="property_id"
                    value={formData.property_id}
                    onChange={handleChange}
                    className="w-full border border-slate-300 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500"
                  >
                    <option value="">— Nicht zugewiesen</option>
                    {properties.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title || p.id}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm text-slate-600 mb-2">
                    Zimmer gesamt
                  </label>
                  {isCoLivingType ? (
                    <p className="text-xs text-slate-500 mb-2">
                      Zimmer-Details erscheinen, sobald «Zimmer gesamt» größer als 0 ist.
                    </p>
                  ) : null}
                  <input
                    type="number"
                    name="rooms"
                    value={formData.rooms}
                    onChange={handleChange}
                    required
                    placeholder="z. B. 3"
                    className="w-full border border-slate-300 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>

                {isCoLivingType &&
                  !editingId &&
                  parsedRoomsTotal > 0 &&
                  coLivingRowsForDisplay.map((row, idx) => (
                    <div
                      key={idx}
                      className="md:col-span-2 border border-slate-200 rounded-xl p-4 bg-slate-50/90"
                    >
                      <p className="text-sm font-semibold text-slate-800 mb-3">
                        Zimmer {idx + 1}
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-xs text-slate-600 mb-1">Name</label>
                          <input
                            type="text"
                            value={row.name}
                            onChange={(e) =>
                              handleCoLivingRoomChange(idx, "name", e.target.value)
                            }
                            required
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-600 mb-1">Preis (CHF)</label>
                          <input
                            type="number"
                            min="0"
                            value={row.price}
                            onChange={(e) =>
                              handleCoLivingRoomChange(idx, "price", e.target.value)
                            }
                            required
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-600 mb-1">Etage</label>
                          <input
                            type="number"
                            min="0"
                            value={row.floor}
                            onChange={(e) =>
                              handleCoLivingRoomChange(idx, "floor", e.target.value)
                            }
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-600 mb-1">Fläche (m²)</label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={row.size_m2}
                            onChange={(e) =>
                              handleCoLivingRoomChange(idx, "size_m2", e.target.value)
                            }
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-600 mb-1">Status</label>
                          <select
                            value={row.status}
                            onChange={(e) =>
                              handleCoLivingRoomChange(idx, "status", e.target.value)
                            }
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-500"
                          >
                            <option>Frei</option>
                            <option>Belegt</option>
                            <option>Reserviert</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-slate-600 mb-1">
                            Verfügbar ab
                          </label>
                          <input
                            type="date"
                            value={row.available_from ?? ""}
                            onChange={(e) =>
                              handleCoLivingRoomChange(
                                idx,
                                "available_from",
                                e.target.value
                              )
                            }
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-500"
                          />
                        </div>
                      </div>
                    </div>
                  ))}

                {!isCoLivingType ? (
                  <div>
                    <label className="block text-sm text-slate-600 mb-2">
                      Status
                    </label>
                    <select
                      name="status"
                      value={formData.status}
                      onChange={handleChange}
                      className="w-full border border-slate-300 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500"
                    >
                      <option>Frei</option>
                      <option>Belegt</option>
                      <option>Reserviert</option>
                      <option>Teilbelegt</option>
                      <option>In Vorbereitung</option>
                    </select>
                  </div>
                ) : (
                  <div className="md:col-span-2">
                    <p className="text-sm text-slate-600 mb-1">Status (Einheit)</p>
                    <p className="text-xs text-slate-500 border border-slate-200 bg-slate-50 rounded-lg px-4 py-3">
                      Belegung und Status folgen aus Mietverhältnissen; Vorschau-KPI nutzt 0 belegte Zimmer.
                    </p>
                  </div>
                )}

                {!isCoLivingType ? (
                  <div>
                    <label className="block text-sm text-slate-600 mb-2">
                      Verfügbar ab
                    </label>
                    <input
                      type="date"
                      name="availableFrom"
                      value={formData.availableFrom}
                      onChange={handleChange}
                      required={formData.status === "Frei"}
                      className="w-full border border-slate-300 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>
                ) : null}

                <div>
                  <label className="block text-sm text-slate-600 mb-2">
                    Mietbeginn an Vermieter
                  </label>
                  <input
                    type="date"
                    name="landlordLeaseStartDate"
                    value={formData.landlordLeaseStartDate}
                    onChange={handleChange}
                    required
                    className="w-full border border-slate-300 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-sm text-slate-600 mb-2">
                    {isCoLivingType
                      ? "Vollbelegung Umsatz / Monat"
                      : "Mieterpreis pro Monat"}
                  </label>
                  {isCoLivingType ? (
                    <div
                      className="w-full border border-slate-200 bg-slate-50 rounded-lg px-4 py-3 text-slate-800"
                      aria-readonly="true"
                    >
                      {formatCurrency(coLivingFullOccupancyRevenue)}
                      <span className="block text-xs text-slate-500 mt-1 font-normal">
                        Summe der Zimmerpreise (nicht editierbar)
                      </span>
                    </div>
                  ) : (
                    <input
                      type="number"
                      name="tenantPriceMonthly"
                      value={formData.tenantPriceMonthly}
                      onChange={handleChange}
                      required
                      placeholder="z. B. 2450"
                      className="w-full border border-slate-300 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  )}
                </div>

                <div>
                  <label className="block text-sm text-slate-600 mb-2">
                    Mietkosten an Vermieter
                  </label>
                  <input
                    type="number"
                    name="landlordRentMonthly"
                    value={formData.landlordRentMonthly}
                    onChange={handleChange}
                    required
                    placeholder="z. B. 1850"
                    className="w-full border border-slate-300 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-sm text-slate-600 mb-2">
                    Nebenkosten pro Monat
                  </label>
                  <input
                    type="number"
                    name="utilitiesMonthly"
                    value={formData.utilitiesMonthly}
                    onChange={handleChange}
                    required
                    placeholder="z. B. 180"
                    className="w-full border border-slate-300 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-sm text-slate-600 mb-2">
                    Reinigungskosten pro Monat
                  </label>
                  <input
                    type="number"
                    name="cleaningCostMonthly"
                    value={formData.cleaningCostMonthly}
                    onChange={handleChange}
                    required
                    placeholder="z. B. 120"
                    className="w-full border border-slate-300 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
              </div>

              <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                {!isCoLivingType ? (
                  <>
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                      <p className="text-sm text-slate-500">Gewinn aktuell</p>
                      <p className="text-2xl font-bold text-slate-800 mt-1">
                        {formatCurrency(currentApartmentProfit)}
                      </p>
                    </div>

                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                      <p className="text-sm text-slate-500">Zimmer</p>
                      <p className="text-2xl font-bold text-slate-800 mt-1">
                        {formData.rooms || 0}
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                      <p className="text-sm text-slate-500">Aktueller Monatsumsatz</p>
                      <p className="text-2xl font-bold text-slate-800 mt-1">
                        {formatCurrency(currentCoLivingRevenue)}
                      </p>
                    </div>

                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                      <p className="text-sm text-slate-500">Leerstandsverlust</p>
                      <p className="text-2xl font-bold text-slate-800 mt-1">
                        {formatCurrency(currentCoLivingVacancy)}
                      </p>
                    </div>

                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                      <p className="text-sm text-slate-500">Gewinn aktuell</p>
                      <p className="text-2xl font-bold text-slate-800 mt-1">
                        {formatCurrency(currentCoLivingProfit)}
                      </p>
                    </div>

                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                      <p className="text-sm text-slate-500">Freie Zimmer</p>
                      <p className="text-2xl font-bold text-slate-800 mt-1">
                        {currentFreeRooms}
                      </p>
                    </div>
                  </>
                )}
              </div>

              {!formLeaseStarted && (
                <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <p className="text-sm text-amber-800">
                    Hinweis: Der Mietbeginn an den Vermieter liegt in der Zukunft.
                    Deshalb werden die aktuellen KPI noch ohne laufende Monatskosten gerechnet.
                  </p>
                </div>
              )}

              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-5 py-3 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
                >
                  Abbrechen
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className="bg-orange-500 hover:bg-orange-600 text-white px-5 py-3 rounded-lg font-medium transition disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {saving ? "Speichern …" : editingId ? "Änderungen speichern" : "Unit speichern"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminApartmentsPage;