import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  fetchAdminUnits,
  fetchAdminRooms,
  fetchAdminProperties,
  fetchAdminLandlords,
  fetchAdminPropertyManagers,
  fetchAdminTenanciesAll,
  createAdminUnit,
  updateAdminUnit,
  deleteAdminUnit,
  fetchAdminUnitCosts,
  createAdminUnitCost,
  deleteAdminUnitCost,
  verifyAdminAddress,
  normalizeUnit,
  normalizeRoom,
} from "../../api/adminData";
import { getDisplayUnitId, normalizeUnitTypeLabel } from "../../utils/unitDisplayId";
import {
  getUnitOccupancyStatus,
  formatOccupancyStatusDe,
  occupancyStatusBadgeClassName,
  isLandlordContractLeaseStarted,
  sumActiveTenancyMonthlyRentForUnit,
} from "../../utils/unitOccupancyStatus";
import {
  getCoLivingMetrics,
  getRoomsForUnit,
} from "../../utils/adminUnitCoLivingMetrics";
import { getUnitMonthlyRunningCosts, getUnitCostsTotal } from "../../utils/adminUnitRunningCosts";
import { lookupSwissPlz } from "../../data/swissPlzLookup";
import { SWISS_CANTON_CODES } from "../../constants/swissCantons";
import { buildGoogleMapsSearchUrl } from "../../utils/googleMapsUrl";

function landlordSelectLabel(l) {
  const c = String(l.company_name || "").trim();
  const n = String(l.contact_name || "").trim();
  if (c && n) return `${c} — ${n}`;
  return c || n || String(l.email || "").trim() || l.id;
}

function propertyManagerSelectLabel(pm) {
  const n = String(pm.name || "").trim();
  if (n) return n;
  const e = String(pm.email || "").trim();
  if (e) return e;
  return pm.id;
}

const emptyForm = {
  place: "",
  zip: "",
  address: "",
  canton: "",
  type: "Apartment",
  rooms: "",
  occupiedRooms: 0,
  property_id: "",
  landlord_id: "",
  property_manager_id: "",
  tenantPriceMonthly: "",
  availableFrom: "",
  landlordDepositType: "",
  landlordDepositAmount: "",
  landlordDepositAnnualPremium: "",
  leaseType: "",
  leaseStartDate: "",
  leaseEndDate: "",
  noticeGivenDate: "",
  terminationEffectiveDate: "",
  returnedToLandlordDate: "",
  leaseStatus: "",
  leaseNotes: "",
};

function parseMoneyChf(raw) {
  if (raw === "" || raw == null) return 0;
  const n = Number(String(raw).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function parseOptionalMoneyChf(raw) {
  if (raw === "" || raw == null) return null;
  const n = Number(String(raw).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function dateOnlyOrNull(raw) {
  const s = String(raw || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}/.test(s)) return null;
  return s.slice(0, 10);
}

function strOrNull(raw) {
  const t = String(raw ?? "").trim();
  return t === "" ? null : t;
}

function numFieldStr(v) {
  if (v == null || v === "") return "";
  return String(v);
}

function formatCurrencyChf2(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "CHF —";
  return `CHF ${n.toLocaleString("de-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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

const MODAL_COST_TYPE_OPTIONS = [
  "Miete",
  "Nebenkosten",
  "Reinigung",
  "Internet",
  "Sonstiges",
];
const MODAL_COST_FIXED_SET = new Set([
  "Miete",
  "Nebenkosten",
  "Reinigung",
  "Internet",
]);

function newModalCostRowId() {
  return `mc-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function makeDefaultModalCostRows() {
  return [
    { id: newModalCostRowId(), cost_type: "Miete", custom_type: "", amount_chf: "", frequency: "monthly" },
    { id: newModalCostRowId(), cost_type: "Nebenkosten", custom_type: "", amount_chf: "", frequency: "monthly" },
    { id: newModalCostRowId(), cost_type: "Reinigung", custom_type: "", amount_chf: "", frequency: "monthly" },
  ];
}

function modalRowsFromApiCosts(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return makeDefaultModalCostRows();
  return rows.map((r) => {
    const ct = String(r.cost_type || "");
    const freq = String(r.frequency || "monthly").trim().toLowerCase() || "monthly";
    if (MODAL_COST_FIXED_SET.has(ct)) {
      return {
        id: r.id,
        cost_type: ct,
        custom_type: "",
        amount_chf: String(r.amount_chf ?? ""),
        frequency: freq,
      };
    }
    return {
      id: r.id,
      cost_type: "Sonstiges",
      custom_type: ct,
      amount_chf: String(r.amount_chf ?? ""),
      frequency: freq,
    };
  });
}

function parseModalCostAmount(raw) {
  const n = Number(String(raw ?? "").replace(",", ".").trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function resolveModalCostBackendType(row) {
  if (row.cost_type === "Sonstiges") return String(row.custom_type || "").trim();
  return String(row.cost_type || "").trim();
}

function buildValidModalCostRows(rows) {
  if (!Array.isArray(rows)) return [];
  const out = [];
  for (const row of rows) {
    if (!row || !row.cost_type) continue;
    const ct = resolveModalCostBackendType(row);
    if (!ct) continue;
    const amt = parseModalCostAmount(row.amount_chf);
    if (amt == null) continue;
    const freq = String(row.frequency || "monthly").trim().toLowerCase() || "monthly";
    if (!["monthly", "yearly", "one_time"].includes(freq)) continue;
    out.push({ cost_type: ct, amount_chf: amt, frequency: freq });
  }
  return out;
}

function runningMonthlyCostsForUnit(unit, unitCostsRows) {
  if (!isLandlordContractLeaseStarted(unit)) return 0;
  return getUnitMonthlyRunningCosts(unit, unitCostsRows);
}

function calculateApartmentProfit(unit, unitCostsRows) {
  const tenantPrice = Number(unit.tenantPriceMonthly || 0);
  return tenantPrice - runningMonthlyCostsForUnit(unit, unitCostsRows);
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

function ApartmentTable({ items, rooms, tenancies, unitCostsByUnitId, onEdit, onDelete }) {
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
              <th className="py-3 pr-4">Mietbeginn (Vertrag)</th>
              <th className="py-3 pr-4">Aktionen</th>
            </tr>
          </thead>

          <tbody>
            {items.map((unit, index) => {
              const occ = getUnitOccupancyStatus(unit, rooms, tenancies);
              const leaseEnded =
                String(unit.leaseStatus ?? unit.lease_status ?? "").trim() ===
                "ended";
              const unitCosts =
                unitCostsByUnitId?.[String(unit.id)] ??
                unitCostsByUnitId?.[unit.id] ??
                [];
              return (
              <tr
                key={unit.id}
                className={`border-b border-slate-100 text-slate-700 ${
                  leaseEnded ? "opacity-60" : ""
                }`}
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
                <td className="py-4 pr-4">
                  {occ == null ? (
                    <span className="text-slate-400">—</span>
                  ) : (
                    <span
                      className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${occupancyStatusBadgeClassName(
                        occ
                      )}`}
                    >
                      {formatOccupancyStatusDe(occ)}
                    </span>
                  )}
                </td>
                <td className="py-4 pr-4">{unit.rooms}</td>
                <td className="py-4 pr-4">
                  {formatCurrency(unit.tenantPriceMonthly)}
                </td>
                <td className="py-4 pr-4">
                  {formatCurrency(runningMonthlyCostsForUnit(unit, unitCosts))}
                </td>
                <td className="py-4 pr-4 font-medium">
                  {formatCurrency(calculateApartmentProfit(unit, unitCosts))}
                </td>
                <td className="py-4 pr-4">{unit.availableFrom}</td>
                <td className="py-4 pr-4">
                  {unit.leaseStartDate || "—"}
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

function CoLivingTable({ items, rooms, tenancies, unitCostsByUnitId, onEdit, onDelete }) {
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
              <th className="py-3 pr-4">Mietbeginn (Vertrag)</th>
              <th className="py-3 pr-4">Aktionen</th>
            </tr>
          </thead>

          <tbody>
            {items.map((unit, index) => {
              const metrics = getCoLivingMetrics(unit, rooms, tenancies);
              const unitCosts =
                unitCostsByUnitId?.[String(unit.id)] ??
                unitCostsByUnitId?.[unit.id] ??
                [];
              const currentProfit =
                Number(metrics.currentRevenue ?? 0) -
                runningMonthlyCostsForUnit(unit, unitCosts);
              const occ = getUnitOccupancyStatus(unit, rooms, tenancies);
              const leaseEnded =
                String(unit.leaseStatus ?? unit.lease_status ?? "").trim() ===
                "ended";

              return (
                <tr
                  key={unit.id}
                  className={`border-b border-slate-100 text-slate-700 ${
                    leaseEnded ? "opacity-60" : ""
                  }`}
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
                <td className="py-4 pr-4">
                  {occ == null ? (
                    <span className="text-slate-400">—</span>
                  ) : (
                    <span
                      className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${occupancyStatusBadgeClassName(
                        occ
                      )}`}
                    >
                      {formatOccupancyStatusDe(occ)}
                    </span>
                  )}
                </td>
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
                    {formatCurrency(currentProfit)}
                  </td>
                  <td className="py-4 pr-4">
                    {unit.leaseStartDate || "—"}
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
  const [tenancies, setTenancies] = useState(null);
  const [properties, setProperties] = useState([]);
  const [landlords, setLandlords] = useState([]);
  const [propertyManagers, setPropertyManagers] = useState([]);
  const [landlordFilter, setLandlordFilter] = useState("");
  const [propertyManagerFilter, setPropertyManagerFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [unitCostsByUnitId, setUnitCostsByUnitId] = useState({});

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFetchError("");

    Promise.allSettled([
      fetchAdminUnits(),
      fetchAdminRooms(),
      fetchAdminProperties(),
      fetchAdminLandlords(),
      fetchAdminPropertyManagers(),
      fetchAdminTenanciesAll(),
    ]).then((results) => {
      if (cancelled) return;

      const [unitsRes, roomsRes, propsRes, landlordsRes, pmRes, tenRes] = results;

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

      if (landlordsRes.status === "fulfilled") {
        const data = landlordsRes.value;
        setLandlords(Array.isArray(data) ? data : []);
      } else {
        console.error(landlordsRes.reason);
        setLandlords([]);
      }

      if (pmRes.status === "fulfilled") {
        const data = pmRes.value;
        setPropertyManagers(Array.isArray(data) ? data : []);
      } else {
        console.error(pmRes.reason);
        setPropertyManagers([]);
      }

      if (tenRes.status === "fulfilled") {
        const data = tenRes.value;
        setTenancies(Array.isArray(data) ? data : []);
      } else {
        console.error(tenRes.reason);
        setTenancies(null);
      }

      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!Array.isArray(units) || units.length === 0) {
      setUnitCostsByUnitId({});
      return undefined;
    }
    let cancelled = false;
    Promise.all(
      units.map((u) =>
        fetchAdminUnitCosts(u.id)
          .then((rows) => [String(u.id), Array.isArray(rows) ? rows : []])
          .catch(() => [String(u.id), []])
      )
    ).then((entries) => {
      if (cancelled) return;
      setUnitCostsByUnitId(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [units]);

  const [searchTerm, setSearchTerm] = useState("");
  const [propertyFilter, setPropertyFilter] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState(emptyForm);
  const [modalCostRows, setModalCostRows] = useState([]);
  const [coLivingRoomRows, setCoLivingRoomRows] = useState([]);
  const [unitAddrBusy, setUnitAddrBusy] = useState(false);
  const [unitCantonHint, setUnitCantonHint] = useState("");
  const [unitCantonLockedByPlz, setUnitCantonLockedByPlz] = useState(false);
  const [unitPlzNotFound, setUnitPlzNotFound] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

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
    return 0;
  }, [
    isCoLivingType,
    coLivingRowsForDisplay,
    parsedRoomsTotal,
  ]);

  const derivedMonthlyTotalCosts = useMemo(() => {
    const unitLike = {
      landlordDepositType: formData.landlordDepositType,
      landlordDepositAnnualPremium: formData.landlordDepositAnnualPremium,
    };
    return getUnitMonthlyRunningCosts(unitLike, modalCostRows);
  }, [formData.landlordDepositType, formData.landlordDepositAnnualPremium, modalCostRows]);

  const derivedOneTimeCostsTotal = useMemo(() => {
    if (!Array.isArray(modalCostRows)) return 0;
    return modalCostRows.reduce((sum, r) => {
      const freq = String(r?.frequency || "monthly").trim().toLowerCase();
      if (freq !== "one_time") return sum;
      const amt = Number(r?.amount_chf);
      return sum + (Number.isFinite(amt) && amt > 0 ? amt : 0);
    }, 0);
  }, [modalCostRows]);

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
        const occ = getUnitOccupancyStatus(unit, rooms, tenancies);
        const f = formatOccupancyStatusDe(occ).toLowerCase();
        const g = String(unit.property_title || "").toLowerCase();
        return (
          a.includes(search) ||
          b.includes(search) ||
          c.includes(search) ||
          d.includes(search) ||
          e.includes(search) ||
          f.includes(search) ||
          g.includes(search)
        );
      });
    }
    if (propertyFilter) {
      result = result.filter((unit) => String(unit.property_id || "") === String(propertyFilter));
    }
    return result;
  }, [units, searchTerm, propertyFilter, rooms, tenancies]);

  const filteredLandlordsForSelect = useMemo(() => {
    const q = landlordFilter.toLowerCase().trim();
    if (!q) return landlords;
    return landlords.filter((l) => {
      const blob = `${l.company_name || ""} ${l.contact_name || ""} ${l.email || ""}`.toLowerCase();
      return blob.includes(q);
    });
  }, [landlords, landlordFilter]);

  const filteredPropertyManagersForSelect = useMemo(() => {
    const q = propertyManagerFilter.toLowerCase().trim();
    if (!q) return propertyManagers;
    return propertyManagers.filter((p) => {
      const blob = `${p.name || ""} ${p.email || ""} ${p.phone || ""}`.toLowerCase();
      return blob.includes(q);
    });
  }, [propertyManagers, propertyManagerFilter]);

  const apartmentUnits = filteredUnits.filter((item) => item.type === "Apartment");
  const coLivingUnits = filteredUnits.filter((item) => item.type === "Co-Living");

  const summary = useMemo(() => {
    const totalUnits = filteredUnits.length;
    const totalApartments = apartmentUnits.length;
    const totalCoLivingUnits = coLivingUnits.length;

    const currentRevenue = filteredUnits.reduce((sum, unit) => {
      if (!Array.isArray(tenancies)) return sum;
      if (unit.type === "Apartment") {
        return sum + sumActiveTenancyMonthlyRentForUnit(unit, tenancies);
      }

      const metrics = getCoLivingMetrics(unit, rooms, tenancies);
      return sum + Number(metrics.currentRevenue || 0);
    }, 0);

    const runningCosts = filteredUnits.reduce((sum, unit) => {
      const rows =
        unitCostsByUnitId[String(unit.id)] ?? unitCostsByUnitId[unit.id] ?? [];
      return sum + runningMonthlyCostsForUnit(unit, rows);
    }, 0);

    return {
      totalUnits,
      totalApartments,
      totalCoLivingUnits,
      currentRevenue,
      runningCosts,
      currentProfit: currentRevenue - runningCosts,
    };
  }, [
    filteredUnits,
    apartmentUnits.length,
    coLivingUnits.length,
    rooms,
    tenancies,
    unitCostsByUnitId,
  ]);

  function handleOpenCreateModal() {
    setEditingId(null);
    setFormData(emptyForm);
    setModalCostRows(makeDefaultModalCostRows());
    setCoLivingRoomRows([]);
    setLandlordFilter("");
    setPropertyManagerFilter("");
    setUnitAddrBusy(false);
    setUnitCantonHint("");
    setUnitCantonLockedByPlz(false);
    setUnitPlzNotFound(false);
    setIsModalOpen(true);
  }

  const handleOpenEditModal = useCallback(async (unit) => {
    setEditingId(unit.id);
    setLandlordFilter("");
    setPropertyManagerFilter("");
    setFormData({
      place: unit.place,
      zip: unit.zip != null && unit.zip !== "" ? String(unit.zip) : "",
      address: unit.address,
      canton: "",
      type: unit.type,
      rooms: unit.rooms,
      occupiedRooms: unit.occupiedRooms || 0,
      property_id: unit.property_id || "",
      landlord_id:
        unit.landlord_id != null && unit.landlord_id !== ""
          ? String(unit.landlord_id)
          : "",
      property_manager_id:
        unit.property_manager_id != null && unit.property_manager_id !== ""
          ? String(unit.property_manager_id)
          : "",
      tenantPriceMonthly: numFieldStr(unit.tenantPriceMonthly),
      availableFrom: numFieldStr(unit.availableFrom).slice(0, 10),
      landlordDepositType: String(unit.landlordDepositType || "").trim(),
      landlordDepositAmount: numFieldStr(unit.landlordDepositAmount),
      landlordDepositAnnualPremium: numFieldStr(unit.landlordDepositAnnualPremium),
      leaseType: String(unit.leaseType ?? "").trim(),
      leaseStartDate: numFieldStr(unit.leaseStartDate).slice(0, 10),
      leaseEndDate: numFieldStr(unit.leaseEndDate).slice(0, 10),
      noticeGivenDate: numFieldStr(unit.noticeGivenDate).slice(0, 10),
      terminationEffectiveDate: numFieldStr(unit.terminationEffectiveDate).slice(
        0,
        10
      ),
      returnedToLandlordDate: numFieldStr(unit.returnedToLandlordDate).slice(0, 10),
      leaseStatus: String(unit.leaseStatus ?? "").trim(),
      leaseNotes: unit.leaseNotes != null ? String(unit.leaseNotes) : "",
    });
    setSaveError("");
    setUnitAddrBusy(false);
    setUnitCantonHint("");
    setUnitCantonLockedByPlz(false);
    setUnitPlzNotFound(false);
    let costRows = makeDefaultModalCostRows();
    try {
      const costs = await fetchAdminUnitCosts(unit.id);
      costRows = modalRowsFromApiCosts(costs);
    } catch {
      costRows = makeDefaultModalCostRows();
    }
    setModalCostRows(costRows);
    setIsModalOpen(true);
  }, []);

  useEffect(() => {
    const raw = location.state?.editUnitId;
    if (raw == null || raw === "") return;
    if (units.length === 0) return;
    const id = String(raw);
    const unit = units.find(
      (u) => String(u.id) === id || String(u.unitId) === id
    );
    if (unit) {
      handleOpenEditModal(unit);
    }
    navigate(location.pathname, { replace: true, state: {} });
  }, [units, location.state, location.pathname, navigate, handleOpenEditModal]);

  function handleCloseModal() {
    setIsModalOpen(false);
    setEditingId(null);
    setFormData(emptyForm);
    setModalCostRows([]);
    setCoLivingRoomRows([]);
    setLandlordFilter("");
    setPropertyManagerFilter("");
    setUnitAddrBusy(false);
    setUnitCantonHint("");
    setUnitCantonLockedByPlz(false);
    setUnitPlzNotFound(false);
  }

  function addModalCostRow() {
    setModalCostRows((prev) => [
      ...prev,
      {
        id: newModalCostRowId(),
        cost_type: "",
        custom_type: "",
        amount_chf: "",
        frequency: "monthly",
      },
    ]);
  }

  const handleUnitPostalCodeChange = (e) => {
    const next = e.target.value;
    const plz = next.trim();
    if (!/^\d{4}$/.test(plz)) {
      setUnitCantonLockedByPlz(false);
      setUnitPlzNotFound(false);
      setFormData((f) => ({ ...f, zip: next }));
      return;
    }
    const hit = lookupSwissPlz(plz);
    if (hit) {
      setFormData((f) => ({
        ...f,
        zip: next,
        place: hit.city,
        canton: hit.canton,
      }));
      setUnitCantonLockedByPlz(true);
      setUnitPlzNotFound(false);
    } else {
      setFormData((f) => ({ ...f, zip: next }));
      setUnitCantonLockedByPlz(false);
      setUnitPlzNotFound(true);
    }
  };

  function removeModalCostRow(rowId) {
    setModalCostRows((prev) => prev.filter((r) => r.id !== rowId));
  }

  function updateModalCostRow(rowId, patch) {
    setModalCostRows((prev) =>
      prev.map((r) => (r.id === rowId ? { ...r, ...patch } : r))
    );
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
      }));
      return;
    }

    if (name === "landlordDepositType" && value !== "insurance") {
      setFormData((prev) => ({
        ...prev,
        landlordDepositType: value,
        landlordDepositAnnualPremium: "",
      }));
      return;
    }

    if (name === "leaseType" && value !== "fixed_term") {
      setFormData((prev) => ({
        ...prev,
        leaseType: value,
        leaseEndDate: "",
      }));
      return;
    }

    setFormData((prev) => ({
      ...prev,
      [name]: nextValue,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaveError("");

    const validCostRows = buildValidModalCostRows(modalCostRows);
    if (validCostRows.length === 0) {
      setSaveError(
        "Mindestens eine Kosten-Zeile mit Kostenart, Frequenz und gültigem Betrag ist erforderlich."
      );
      return;
    }

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

    const persistedUnitFields = {
      tenant_price_monthly_chf: 0,
      available_from: dateOnlyOrNull(formData.availableFrom),
      occupied_rooms: Math.max(0, Math.floor(Number(formData.occupiedRooms) || 0)),
      postal_code: String(formData.zip || "").trim() || null,
      landlord_deposit_type: String(formData.landlordDepositType || "").trim() || null,
      landlord_deposit_amount: parseOptionalMoneyChf(formData.landlordDepositAmount),
      landlord_deposit_annual_premium: parseOptionalMoneyChf(
        formData.landlordDepositAnnualPremium
      ),
      lease_type: strOrNull(formData.leaseType),
      lease_start_date: dateOnlyOrNull(formData.leaseStartDate),
      lease_end_date:
        formData.leaseType === "fixed_term"
          ? dateOnlyOrNull(formData.leaseEndDate)
          : null,
      notice_given_date: dateOnlyOrNull(formData.noticeGivenDate),
      termination_effective_date: dateOnlyOrNull(
        formData.terminationEffectiveDate
      ),
      returned_to_landlord_date: dateOnlyOrNull(formData.returnedToLandlordDate),
      lease_status: strOrNull(formData.leaseStatus),
      lease_notes: strOrNull(formData.leaseNotes),
    };

    const baseUnitPayload = {
      title: (formData.place || formData.address || "Unit").trim() || "Unit",
      address: (formData.address || "").trim() || "",
      city: (formData.place || "").trim() || "",
      city_id: null,
      type: normalizedUnitType || null,
      rooms: parsedRoomsTotal,
      property_id: (formData.property_id || "").trim() || null,
      landlord_id: (formData.landlord_id || "").trim() || null,
      property_manager_id: (formData.property_manager_id || "").trim() || null,
    };

    const apiPayload = {
      ...baseUnitPayload,
      ...persistedUnitFields,
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

    try {
      if (editingId) {
        await updateAdminUnit(editingId, {
          ...baseUnitPayload,
          ...persistedUnitFields,
        });
        const existing = await fetchAdminUnitCosts(editingId);
        for (const c of existing) {
          await deleteAdminUnitCost(editingId, c.id);
        }
        for (const row of validCostRows) {
          await createAdminUnitCost(editingId, {
            cost_type: row.cost_type,
            amount_chf: row.amount_chf,
            frequency: row.frequency,
          });
        }
      } else {
        const created = await createAdminUnit(apiPayload);
        const newId = created?.id || created?.unitId;
        if (!newId) {
          throw new Error("Unit konnte nicht gespeichert werden.");
        }
        for (const row of validCostRows) {
          await createAdminUnitCost(newId, {
            cost_type: row.cost_type,
            amount_chf: row.amount_chf,
            frequency: row.frequency,
          });
        }
      }

      const [unitsData, roomsData, tenanciesData] = await Promise.all([
        fetchAdminUnits(),
        fetchAdminRooms(),
        fetchAdminTenanciesAll(),
      ]);
      setUnits(Array.isArray(unitsData) ? unitsData.map(normalizeUnit) : []);
      setRooms(Array.isArray(roomsData) ? roomsData.map(normalizeRoom) : []);
      setTenancies(Array.isArray(tenanciesData) ? tenanciesData : []);
      handleCloseModal();
    } catch (e) {
      const msg =
        (typeof e === "string" && e) ||
        (e && typeof e.message === "string" && e.message) ||
        (e != null && String(e)) ||
        "Speichern fehlgeschlagen.";
      setSaveError(msg);
    } finally {
      setSaving(false);
    }
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
        return Promise.all([
          fetchAdminUnits(),
          fetchAdminRooms(),
          fetchAdminTenanciesAll(),
        ])
          .then(([unitsData, roomsData, tenanciesData]) => {
            setUnits(
              Array.isArray(unitsData) ? unitsData.map(normalizeUnit) : []
            );
            setRooms(
              Array.isArray(roomsData) ? roomsData.map(normalizeRoom) : []
            );
            setTenancies(Array.isArray(tenanciesData) ? tenanciesData : []);
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
    !formData.leaseStartDate ||
    formData.leaseStartDate <= getTodayDateString();

  const formRunningMonthlyCosts = useMemo(() => {
    if (!formLeaseStarted) return 0;
    return modalCostRows.reduce((sum, row) => {
      const n = parseModalCostAmount(row.amount_chf);
      return sum + (n != null ? n : 0);
    }, 0);
  }, [formLeaseStarted, modalCostRows]);

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
              placeholder="Suche nach Unit ID, Ort, PLZ, Adresse, Typ oder Belegung…"
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
              rooms={rooms}
              tenancies={tenancies}
              unitCostsByUnitId={unitCostsByUnitId}
              onEdit={handleOpenEditModal}
              onDelete={handleDelete}
            />

            <CoLivingTable
              items={coLivingUnits}
              rooms={rooms}
              tenancies={tenancies}
              unitCostsByUnitId={unitCostsByUnitId}
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
                    onChange={handleUnitPostalCodeChange}
                    required
                    className="w-full border border-slate-300 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500"
                  />
                  {unitPlzNotFound ? (
                    <p className="mt-1 text-xs text-slate-400">PLZ nicht gefunden</p>
                  ) : null}
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

                <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-3 items-start">
                  <div className="md:col-span-1">
                    <label className="block text-sm text-slate-600 mb-2">
                      Kanton (optional)
                    </label>
                    <select
                      name="canton"
                      value={formData.canton || ""}
                      onChange={(e) =>
                        setFormData((f) => ({ ...f, canton: e.target.value }))
                      }
                      disabled={saving || unitCantonLockedByPlz}
                      className="w-full border border-slate-300 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500 bg-white disabled:opacity-50"
                    >
                      <option value="">—</option>
                      {formData.canton && !SWISS_CANTON_CODES.includes(formData.canton) ? (
                        <option value={formData.canton}>{formData.canton}</option>
                      ) : null}
                      {SWISS_CANTON_CODES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="md:col-span-2 flex flex-col gap-1.5 pt-7">
                    <button
                      type="button"
                      onClick={() => {
                        window.open(
                          buildGoogleMapsSearchUrl(
                            formData.address,
                            formData.zip,
                            formData.place
                          ),
                          "_blank",
                          "noopener,noreferrer"
                        );
                        setUnitAddrBusy(true);
                        setUnitCantonHint("Kanton wird ermittelt …");
                        verifyAdminAddress({
                          address_line1: formData.address,
                          postal_code: formData.zip,
                          city: formData.place,
                        })
                          .then((res) => {
                            const c = res?.normalized?.canton;
                            if (res?.valid && c != null && String(c).trim() !== "") {
                              const code = String(c).trim().toUpperCase();
                              setFormData((f) => ({ ...f, canton: code }));
                              setUnitCantonHint("Kanton automatisch erkannt.");
                            } else {
                              setUnitCantonHint(
                                "Kein Kanton automatisch ermittelbar. Bitte bei Bedarf manuell wählen."
                              );
                            }
                          })
                          .catch(() =>
                            setUnitCantonHint("Kanton konnte nicht automatisch ermittelt werden.")
                          )
                          .finally(() => setUnitAddrBusy(false));
                      }}
                      disabled={
                        saving ||
                        unitAddrBusy ||
                        !(String(formData.address || "").trim()) ||
                        !(String(formData.zip || "").trim()) ||
                        !(String(formData.place || "").trim())
                      }
                      className="self-start rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {unitAddrBusy ? "…" : "Adresse prüfen"}
                    </button>
                    <p className="text-xs text-slate-500">
                      Öffnet Google Maps in einem neuen Tab. Der Kanton wird im Hintergrund ergänzt, wenn die
                      Abfrage einen Wert liefert.
                    </p>
                    {unitCantonHint ? (
                      <p className="text-xs text-slate-500">{unitCantonHint}</p>
                    ) : null}
                  </div>
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
                    Verwaltung (optional)
                  </label>
                  <input
                    type="search"
                    value={landlordFilter}
                    onChange={(e) => setLandlordFilter(e.target.value)}
                    placeholder="Suchen…"
                    className="w-full border border-slate-300 rounded-lg px-4 py-2 mb-2 text-sm outline-none focus:ring-2 focus:ring-orange-500"
                    autoComplete="off"
                  />
                  <select
                    name="landlord_id"
                    value={formData.landlord_id}
                    onChange={handleChange}
                    className="w-full border border-slate-300 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500"
                  >
                    <option value="">— Keine Auswahl</option>
                    {filteredLandlordsForSelect.map((l) => (
                      <option key={l.id} value={l.id}>
                        {landlordSelectLabel(l)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm text-slate-600 mb-2">
                    Bewirtschafter (optional)
                  </label>
                  <input
                    type="search"
                    value={propertyManagerFilter}
                    onChange={(e) => setPropertyManagerFilter(e.target.value)}
                    placeholder="Suchen…"
                    className="w-full border border-slate-300 rounded-lg px-4 py-2 mb-2 text-sm outline-none focus:ring-2 focus:ring-orange-500"
                    autoComplete="off"
                  />
                  <select
                    name="property_manager_id"
                    value={formData.property_manager_id}
                    onChange={handleChange}
                    className="w-full border border-slate-300 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500"
                  >
                    <option value="">— Keine Auswahl</option>
                    {filteredPropertyManagersForSelect.map((pm) => (
                      <option key={pm.id} value={pm.id}>
                        {propertyManagerSelectLabel(pm)}
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

                {isCoLivingType ? (
                  <div className="md:col-span-2">
                    <p className="text-xs text-slate-500 border border-slate-200 bg-slate-50 rounded-lg px-4 py-3">
                      Belegung der Einheit folgt aus Mietverhältnissen; Vorschau-KPI nutzt 0 belegte
                      Zimmer.
                    </p>
                  </div>
                ) : null}

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
                      required
                      className="w-full border border-slate-300 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>
                ) : null}

                <div>
                  <label className="block text-sm text-slate-600 mb-2">
                    Monatliche Gesamtkosten
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
                    <div
                      className="w-full border border-slate-200 bg-slate-50 rounded-lg px-4 py-3 text-slate-800"
                      aria-readonly="true"
                    >
                      {formatCurrencyChf2(derivedMonthlyTotalCosts)}
                      <span className="block text-xs text-slate-500 mt-1 font-normal">
                        Monatlich (voll) + jährlich (/12) + Kautionsversicherung (/12), einmalig ausgeschlossen.
                      </span>
                      {derivedOneTimeCostsTotal > 0 ? (
                        <span className="block text-xs text-slate-500 mt-1 font-normal">
                          Einmalige Kosten gesamt: {formatCurrencyChf2(derivedOneTimeCostsTotal)}
                        </span>
                      ) : null}
                    </div>
                  )}
                </div>

                <div className="md:col-span-2 border border-slate-200 rounded-xl p-4 bg-slate-50/90">
                  <p className="text-sm font-semibold text-slate-800 mb-3">
                    Kostenpositionen
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-slate-700">
                      <thead>
                        <tr className="border-b border-slate-200 text-slate-500">
                          <th className="py-2 pr-4 font-medium">Kostenart</th>
                          <th className="py-2 pr-4 font-medium">Frequenz</th>
                          <th className="py-2 pr-4 font-medium">Betrag (CHF)</th>
                          <th className="py-2 pr-4 font-medium w-24"> </th>
                        </tr>
                      </thead>
                      <tbody>
                        {modalCostRows.map((row) => (
                          <tr key={row.id} className="border-b border-slate-100 align-top">
                            <td className="py-2 pr-4">
                              <select
                                value={row.cost_type}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  updateModalCostRow(row.id, {
                                    cost_type: v,
                                    custom_type: v === "Sonstiges" ? row.custom_type : "",
                                  });
                                }}
                                disabled={saving}
                                className="w-full border border-slate-300 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500 bg-white disabled:opacity-50"
                              >
                                <option value="">— wählen —</option>
                                {MODAL_COST_TYPE_OPTIONS.map((opt) => (
                                  <option key={opt} value={opt}>
                                    {opt}
                                  </option>
                                ))}
                              </select>
                              {row.cost_type === "Sonstiges" ? (
                                <input
                                  type="text"
                                  value={row.custom_type}
                                  onChange={(e) =>
                                    updateModalCostRow(row.id, {
                                      custom_type: e.target.value,
                                    })
                                  }
                                  disabled={saving}
                                  placeholder="Bezeichnung"
                                  className="w-full border border-slate-300 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500 mt-2 disabled:opacity-50"
                                />
                              ) : null}
                            </td>
                            <td className="py-2 pr-4">
                              <select
                                value={row.frequency || "monthly"}
                                onChange={(e) =>
                                  updateModalCostRow(row.id, { frequency: e.target.value })
                                }
                                disabled={saving}
                                className="w-full border border-slate-300 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500 bg-white disabled:opacity-50"
                              >
                                <option value="monthly">Monatlich</option>
                                <option value="yearly">Jährlich</option>
                                <option value="one_time">Einmalig</option>
                              </select>
                            </td>
                            <td className="py-2 pr-4">
                              <input
                                type="number"
                                value={row.amount_chf}
                                onChange={(e) =>
                                  updateModalCostRow(row.id, {
                                    amount_chf: e.target.value,
                                  })
                                }
                                disabled={saving}
                                className="w-full border border-slate-300 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500 disabled:opacity-50"
                              />
                            </td>
                            <td className="py-2 pr-4">
                              <button
                                type="button"
                                disabled={saving}
                                onClick={() => removeModalCostRow(row.id)}
                                className="text-red-600 hover:underline text-sm font-medium disabled:opacity-50"
                              >
                                Löschen
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={addModalCostRow}
                    className="mt-3 text-sm border border-slate-300 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg font-medium disabled:opacity-50"
                  >
                    + Kostenart hinzufügen
                  </button>
                </div>

                <div>
                  <label className="block text-sm text-slate-600 mb-2">
                    Kautionsart Vermieter
                  </label>
                  <select
                    name="landlordDepositType"
                    value={formData.landlordDepositType}
                    onChange={handleChange}
                    className="w-full border border-slate-300 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500 bg-white"
                  >
                    <option value="">—</option>
                    <option value="bank">Bank</option>
                    <option value="insurance">Versicherung</option>
                    <option value="cash">Bar</option>
                    <option value="none">Keine</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm text-slate-600 mb-2">
                    Kautionsbetrag Vermieter
                  </label>
                  <input
                    type="number"
                    name="landlordDepositAmount"
                    value={formData.landlordDepositAmount}
                    onChange={handleChange}
                    min="0"
                    step="0.01"
                    placeholder="z. B. 5000"
                    className="w-full border border-slate-300 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>

                {formData.landlordDepositType === "insurance" ? (
                  <div>
                    <label className="block text-sm text-slate-600 mb-2">
                      Jahresprämie Vermieter
                    </label>
                    <input
                      type="number"
                      name="landlordDepositAnnualPremium"
                      value={formData.landlordDepositAnnualPremium}
                      onChange={handleChange}
                      min="0"
                      step="0.01"
                      placeholder="z. B. 350"
                      className="w-full border border-slate-300 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>
                ) : null}

                <div className="md:col-span-2 border-t border-slate-200 pt-5 mt-1">
                  <p className="text-sm font-semibold text-slate-800 mb-3">
                    Vertrag Vermieter
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-slate-600 mb-2">
                        Vertragsart
                      </label>
                      <select
                        name="leaseType"
                        value={formData.leaseType}
                        onChange={handleChange}
                        className="w-full border border-slate-300 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500 bg-white"
                      >
                        <option value="">—</option>
                        <option value="open_ended">Unbefristet</option>
                        <option value="fixed_term">Befristet</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm text-slate-600 mb-2">
                        Mietbeginn
                      </label>
                      <input
                        type="date"
                        name="leaseStartDate"
                        value={formData.leaseStartDate}
                        onChange={handleChange}
                        className="w-full border border-slate-300 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500"
                      />
                    </div>

                    {formData.leaseType === "fixed_term" ? (
                      <div>
                        <label className="block text-sm text-slate-600 mb-2">
                          Vertragsende
                        </label>
                        <input
                          type="date"
                          name="leaseEndDate"
                          value={formData.leaseEndDate}
                          onChange={handleChange}
                          className="w-full border border-slate-300 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500"
                        />
                      </div>
                    ) : null}

                    <div>
                      <label className="block text-sm text-slate-600 mb-2">
                        Kündigung eingereicht am
                      </label>
                      <input
                        type="date"
                        name="noticeGivenDate"
                        value={formData.noticeGivenDate}
                        onChange={handleChange}
                        className="w-full border border-slate-300 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm text-slate-600 mb-2">
                        Kündigung wirksam per
                      </label>
                      <input
                        type="date"
                        name="terminationEffectiveDate"
                        value={formData.terminationEffectiveDate}
                        onChange={handleChange}
                        className="w-full border border-slate-300 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm text-slate-600 mb-2">
                        Rückgabe erfolgt am
                      </label>
                      <input
                        type="date"
                        name="returnedToLandlordDate"
                        value={formData.returnedToLandlordDate}
                        onChange={handleChange}
                        className="w-full border border-slate-300 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm text-slate-600 mb-2">
                        Vertragsstatus
                      </label>
                      <select
                        name="leaseStatus"
                        value={formData.leaseStatus}
                        onChange={handleChange}
                        className="w-full border border-slate-300 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500 bg-white"
                      >
                        <option value="">—</option>
                        <option value="active">Aktiv</option>
                        <option value="notice_given">Gekündigt</option>
                        <option value="ended">Beendet</option>
                      </select>
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-sm text-slate-600 mb-2">
                        Notizen
                      </label>
                      <textarea
                        name="leaseNotes"
                        value={formData.leaseNotes}
                        onChange={handleChange}
                        rows={3}
                        className="w-full border border-slate-300 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500 resize-y min-h-[5rem]"
                      />
                    </div>
                  </div>
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
                    Hinweis: Der Mietbeginn im Vertrag Vermieter liegt in der Zukunft.
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