import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import RoomMap from "../../components/RoomMap";
import RoomCalendar from "../../components/RoomCalendar";
import OccupancyMap from "../../components/OccupancyMap";
import {
  fetchAdminUnit,
  fetchAdminRooms,
  fetchAdminOccupancyRooms,
  fetchAdminTenancies,
  fetchAdminTenant,
  fetchAdminLandlord,
  fetchAdminPropertyManagers,
  fetchAdminAuditLogs,
  normalizeUnit,
  normalizeRoom,
} from "../../api/adminData";

const UNIT_AUDIT_FIELD_LABELS = {
  landlord_id: "Verwaltung",
  property_manager_id: "Bewirtschafter",
  property_id: "Liegenschaft",
  title: "Titel",
  address: "Adresse",
  city: "Ort",
  postal_code: "PLZ",
  rooms: "Zimmeranzahl",
  type: "Typ",
  tenant_price_monthly_chf: "Mieterpreis",
  landlord_rent_monthly_chf: "Mietkosten Vermieter",
  utilities_monthly_chf: "Nebenkosten",
  cleaning_cost_monthly_chf: "Reinigung",
  occupancy_status: "Belegungsstatus",
  occupied_rooms: "belegte Zimmer",
  landlord_lease_start_date: "Mietstart Vermieter",
  available_from: "Verfügbar ab",
  landlord_deposit_type: "Kautionsart Vermieter",
  landlord_deposit_amount: "Kaution Vermieter",
  landlord_deposit_annual_premium: "Kautionsprämie",
};

/** Order for audit update lines (remaining keys sorted alphabetically after these). */
const AUDIT_UPDATE_FIELD_ORDER = [
  "landlord_id",
  "property_manager_id",
  "tenant_price_monthly_chf",
  "landlord_rent_monthly_chf",
  "occupancy_status",
];

function auditValuesEqual(a, b) {
  if (a === b) return true;
  if (a == null && b == null) return true;
  return JSON.stringify(a) === JSON.stringify(b);
}

function formatAuditTimestamp(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString("de-CH", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function auditActionLabel(action) {
  const a = String(action || "").toLowerCase();
  if (a === "create") return "Erstellt";
  if (a === "delete") return "Gelöscht";
  if (a === "update") return "Bearbeitet";
  return action || "—";
}

function roundCurrency(value) {
  return Math.round(Number(value || 0));
}

function formatCurrency(value) {
  return `CHF ${roundCurrency(value).toLocaleString("de-CH")}`;
}

function formatChfOrDash(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "-";
  }
  return formatCurrency(value);
}

function formatPercent(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function getTodayDateString() {
  return new Date().toISOString().split("T")[0];
}

function hasLeaseStarted(unit) {
  if (!unit.landlordLeaseStartDate) return true;
  return unit.landlordLeaseStartDate <= getTodayDateString();
}

/** Monthly share of landlord insurance deposit premium (annual / 12). */
function landlordDepositInsuranceMonthly(unit) {
  const t = String(unit.landlordDepositType || "").trim().toLowerCase();
  if (t !== "insurance") return 0;
  const premium = Number(unit.landlordDepositAnnualPremium);
  if (!Number.isFinite(premium) || premium <= 0) return 0;
  return premium / 12;
}

const LANDLORD_DEPOSIT_TYPE_LABELS = {
  bank: "Bankdepot",
  insurance: "Versicherung",
  cash: "Bareinzahlung",
  none: "Keine",
};

const AUDIT_CHF_KEYS = new Set([
  "tenant_price_monthly_chf",
  "landlord_rent_monthly_chf",
  "utilities_monthly_chf",
  "cleaning_cost_monthly_chf",
  "landlord_deposit_amount",
  "landlord_deposit_annual_premium",
]);

const AUDIT_DATE_KEYS = new Set(["landlord_lease_start_date", "available_from"]);

function auditFallbackIdDisplay(value) {
  if (value === null || value === undefined || value === "") return "—";
  const s = String(value);
  if (s.length > 24) return `${s.slice(0, 8)}…${s.slice(-4)}`;
  return s;
}

function sortAuditChangedFieldKeys(keys) {
  const priority = new Map(AUDIT_UPDATE_FIELD_ORDER.map((k, i) => [k, i]));
  return [...keys].sort((a, b) => {
    const pa = priority.has(a) ? priority.get(a) : 1000;
    const pb = priority.has(b) ? priority.get(b) : 1000;
    if (pa !== pb) return pa - pb;
    return a.localeCompare(b);
  });
}

function formatAuditFieldValue(key, value, resolvers) {
  const r = resolvers || {};
  if (value === null || value === undefined || value === "") return "—";
  if (key === "landlord_id") {
    const s = String(value);
    if (r.landlordById && r.landlordById[s]) return r.landlordById[s];
    return auditFallbackIdDisplay(s);
  }
  if (key === "property_manager_id") {
    const s = String(value);
    if (r.pmById && r.pmById[s]) return r.pmById[s];
    return auditFallbackIdDisplay(s);
  }
  if (key === "property_id") {
    const s = String(value);
    if (r.propertyById && r.propertyById[s]) return r.propertyById[s];
    return auditFallbackIdDisplay(s);
  }
  if (AUDIT_CHF_KEYS.has(key)) {
    const n = Number(value);
    if (Number.isNaN(n)) return String(value);
    return `CHF ${Math.round(n).toLocaleString("de-CH")}`;
  }
  if (AUDIT_DATE_KEYS.has(key)) {
    const s = String(value);
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return d.toLocaleDateString("de-CH");
    return s;
  }
  if (key === "landlord_deposit_type") {
    const k = String(value).toLowerCase();
    return LANDLORD_DEPOSIT_TYPE_LABELS[k] || String(value);
  }
  if (key === "city_id") {
    return auditFallbackIdDisplay(String(value));
  }
  if (key === "rooms" || key === "occupied_rooms") {
    const n = Number(value);
    if (Number.isNaN(n)) return String(value);
    return String(Math.round(n));
  }
  return String(value);
}

function buildAuditUpdateLines(entry, resolvers) {
  const oldV = entry.old_values;
  const newV = entry.new_values;
  if (!oldV || !newV) return ["Unit bearbeitet"];
  const keys = new Set([...Object.keys(oldV), ...Object.keys(newV)]);
  const changedKeys = [];
  for (const k of keys) {
    if (auditValuesEqual(oldV[k], newV[k])) continue;
    if (!UNIT_AUDIT_FIELD_LABELS[k]) continue;
    changedKeys.push(k);
  }
  if (changedKeys.length === 0) return ["Unit bearbeitet"];
  const sorted = sortAuditChangedFieldKeys(changedKeys);
  const detailLines = sorted.map((k) => {
    const lbl = UNIT_AUDIT_FIELD_LABELS[k];
    const oldStr = formatAuditFieldValue(k, oldV[k], resolvers);
    const newStr = formatAuditFieldValue(k, newV[k], resolvers);
    return `${lbl} geändert: ${oldStr} → ${newStr}`;
  });
  const limited =
    detailLines.length <= 3
      ? detailLines
      : [...detailLines.slice(0, 3), "Weitere Änderungen"];
  return ["Unit bearbeitet", ...limited];
}

function getAuditEntryDisplayLines(entry, resolvers) {
  const action = String(entry.action || "").toLowerCase();
  if (action === "create") return ["Unit erstellt"];
  if (action === "delete") return ["Unit gelöscht"];
  if (action === "update") return buildAuditUpdateLines(entry, resolvers);
  return ["Unit bearbeitet"];
}

function getRunningMonthlyCosts(unit) {
  if (!hasLeaseStarted(unit)) return 0;
  return (
    Number(unit.landlordRentMonthly || 0) +
    Number(unit.utilitiesMonthly || 0) +
    Number(unit.cleaningCostMonthly || 0) +
    landlordDepositInsuranceMonthly(unit)
  );
}

function isTenancyActive(t) {
  return String(t.status || "").toLowerCase() === "active";
}

function formatTenancyMoveIn(iso) {
  if (!iso) return "—";
  const s = String(iso);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : s;
}

const TENANT_DEPOSIT_TYPE_LABELS = {
  bank: "Bank",
  insurance: "Versicherung",
  cash: "Bar",
  none: "Keine",
};

const TENANT_DEPOSIT_PROVIDER_LABELS = {
  swisscaution: "SwissCaution",
  smartcaution: "SmartCaution",
  firstcaution: "FirstCaution",
  gocaution: "GoCaution",
  other: "Sonstige",
};

function tenantDepositTypeLabel(raw) {
  if (!raw || typeof raw !== "string") return "—";
  const k = String(raw).toLowerCase();
  return TENANT_DEPOSIT_TYPE_LABELS[k] || raw;
}

function tenantDepositProviderLabel(raw) {
  if (!raw || typeof raw !== "string") return "—";
  const k = String(raw).toLowerCase();
  return TENANT_DEPOSIT_PROVIDER_LABELS[k] || raw;
}

function isUuidLike(s) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    String(s || "").trim()
  );
}

function landlordDisplayName(l) {
  if (!l) return "—";
  const c = String(l.company_name || "").trim();
  const n = String(l.contact_name || "").trim();
  if (c && n) return `${c} — ${n}`;
  return c || n || String(l.email || "").trim() || l.id || "—";
}

function propertyManagerDisplayName(p) {
  if (!p) return "—";
  const n = String(p.name || "").trim();
  if (n) return n;
  const e = String(p.email || "").trim();
  if (e) return e;
  return p.id || "—";
}

function formatUnitHeaderLocationLine(unit) {
  const street = String(unit.address || "").trim();
  const zip = String(unit.zip || "").trim();
  const city = String(unit.place || unit.city || "").trim();
  const tail = [zip, city].filter(Boolean).join(" ");
  if (street && tail) return `${street}, ${tail}`;
  if (street) return street;
  if (tail) return tail;
  return "—";
}

function getUnitPageMainTitle(unit) {
  if (!unit) return "—";
  const uid = String(unit.unitId || "").trim();
  const address = String(unit.address || "").trim();
  if (uid && !isUuidLike(uid) && address) {
    return `${uid} · ${address}`;
  }
  return formatUnitHeaderLocationLine(unit);
}

function getRoomsForUnit(unitId, allRooms) {
  return allRooms.filter((room) => room.unitId === unitId);
}

function getCoLivingMetrics(unit, allRooms) {
  const leaseStarted = hasLeaseStarted(unit);
  const rooms = getRoomsForUnit(unit.unitId, allRooms);

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

  return {
    occupiedCount: occupiedRooms.length,
    reservedCount: reservedRooms.length,
    freeCount: freeRooms.length,
    totalRooms: rooms.length,
    fullRevenue,
    currentRevenue,
    vacancyLoss: leaseStarted ? fullRevenue - currentRevenue : 0,
    currentProfit: null,
    runningCosts: null,
    leaseStarted,
  };
}

function SectionCard({ title, subtitle, children, rightSlot = null }) {
  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          {subtitle ? (
            <p className="text-sm text-slate-500 mt-1">{subtitle}</p>
          ) : null}
        </div>
        {rightSlot}
      </div>
      {children}
    </div>
  );
}

function SmallStatCard({ label, value, hint, accent = "slate" }) {
  const accentStyles = {
    slate: "bg-slate-50 border-slate-200 text-slate-900",
    green: "bg-emerald-50 border-emerald-200 text-emerald-700",
    orange: "bg-orange-50 border-orange-200 text-orange-700",
    rose: "bg-rose-50 border-rose-200 text-rose-700",
    amber: "bg-amber-50 border-amber-200 text-amber-700",
    blue: "bg-sky-50 border-sky-200 text-sky-700",
  };

  return (
    <div
      className={`rounded-2xl border p-4 ${
        accentStyles[accent] || accentStyles.slate
      }`}
    >
      <p className="text-sm opacity-70">{label}</p>
      <p className="text-2xl font-bold mt-2">{value}</p>
      {hint ? <p className="text-xs opacity-70 mt-2">{hint}</p> : null}
    </div>
  );
}

function Badge({ children, tone = "slate" }) {
  const tones = {
    slate: "bg-slate-100 text-slate-700",
    green: "bg-emerald-100 text-emerald-700",
    orange: "bg-orange-100 text-orange-700",
    rose: "bg-rose-100 text-rose-700",
    amber: "bg-amber-100 text-amber-700",
    blue: "bg-sky-100 text-sky-700",
  };

  return (
    <span
      className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
        tones[tone] || tones.slate
      }`}
    >
      {children}
    </span>
  );
}

function getStatusTone(status) {
  if (status === "Belegt") return "green";
  if (status === "Reserviert") return "amber";
  if (status === "Frei") return "rose";
  if (status === "In Reinigung") return "blue";
  if (status === "Blockiert") return "slate";
  if (status === "In Einrichtung") return "orange";
  return "slate";
}

function buildUnitWarnings(unit, rooms, metrics) {
  const warnings = [];
  const isApartment = unit.type === "Apartment";

  if (!metrics.leaseStarted && metrics.currentRevenue <= 0) {
    warnings.push({
      tone: "rose",
      text: "Mietstart Vermieter liegt in der Zukunft und aktuell ist noch kein Umsatz gesichert.",
    });
  }

  if (metrics.currentRevenue != null && metrics.currentRevenue <= 0) {
    warnings.push({
      tone: "rose",
      text: "Keine aktuellen Einnahmen vorhanden.",
    });
  }

  if (isApartment) {
    if (
      metrics.apartmentTenanciesLoaded &&
      metrics.apartmentHasActiveTenancy === false
    ) {
      warnings.push({
        tone: "amber",
        text: "Wohnung leer",
      });
    }
  } else if (metrics.freeCount > 0) {
    warnings.push({
      tone: "amber",
      text: `${metrics.freeCount} freie Rooms ohne aktuelle Belegung.`,
    });
  }

  if (
    metrics.currentProfit != null &&
    metrics.currentProfit < 0
  ) {
    warnings.push({
      tone: "rose",
      text: `Aktuell unter Break-Even um ${formatCurrency(
        Math.abs(metrics.currentProfit)
      )}.`,
    });
  }

  if (isApartment) {
    return warnings.slice(0, 8);
  }

  rooms.forEach((room) => {
    const roomLabel = room.roomName || room.name || room.roomId || "Room";

    if (
      room.status === "Reserviert" &&
      (!room.reservedUntil || room.reservedUntil === "-")
    ) {
      warnings.push({
        tone: "amber",
        text: `${roomLabel}: Reserviert, aber ohne "Reserviert bis" Datum.`,
      });
    }

    if (
      room.status === "Belegt" &&
      (!room.moveInDate || room.moveInDate === "-")
    ) {
      warnings.push({
        tone: "amber",
        text: `${roomLabel}: Belegt, aber ohne Einzugsdatum.`,
      });
    }

    if (
      room.status === "Frei" &&
      (!room.freeFromDate || room.freeFromDate === "-")
    ) {
      warnings.push({
        tone: "amber",
        text: `${roomLabel}: Frei, aber ohne Frei-ab-Datum.`,
      });
    }
  });

  return warnings.slice(0, 8);
}

function AdminUnitDetailPage() {
  const { unitId } = useParams();
  const [unit, setUnit] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditLogLoading, setAuditLogLoading] = useState(true);
  const [auditLogError, setAuditLogError] = useState("");
  const [verwaltungLabel, setVerwaltungLabel] = useState("");
  const [bewirtschafterLabel, setBewirtschafterLabel] = useState("");
  const [linksResolving, setLinksResolving] = useState(false);

  useEffect(() => {
    if (!unitId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchAdminUnit(unitId)
      .then((u) => setUnit(u ? normalizeUnit(u) : null))
      .catch(() => setUnit(null))
      .finally(() => setLoading(false));
  }, [unitId]);

  useEffect(() => {
    if (!unit) {
      setVerwaltungLabel("");
      setBewirtschafterLabel("");
      setLinksResolving(false);
      return;
    }
    const lid = unit.landlord_id;
    const pmid = unit.property_manager_id;
    if (!lid && !pmid) {
      setVerwaltungLabel("");
      setBewirtschafterLabel("");
      setLinksResolving(false);
      return;
    }
    setLinksResolving(true);
    let cancelled = false;
    Promise.all([
      lid ? fetchAdminLandlord(lid) : Promise.resolve(null),
      pmid ? fetchAdminPropertyManagers() : Promise.resolve(null),
    ])
      .then(([ll, pmList]) => {
        if (cancelled) return;
        if (lid) {
          setVerwaltungLabel(ll ? landlordDisplayName(ll) : "—");
        } else {
          setVerwaltungLabel("");
        }
        if (pmid) {
          const p = Array.isArray(pmList) ? pmList.find((x) => String(x.id) === String(pmid)) : null;
          setBewirtschafterLabel(p ? propertyManagerDisplayName(p) : "—");
        } else {
          setBewirtschafterLabel("");
        }
      })
      .catch(() => {
        if (!cancelled) {
          if (lid) setVerwaltungLabel("—");
          if (pmid) setBewirtschafterLabel("—");
        }
      })
      .finally(() => {
        if (!cancelled) setLinksResolving(false);
      });
    return () => {
      cancelled = true;
    };
  }, [unit]);

  useEffect(() => {
    if (!unitId) return;
    fetchAdminRooms(unitId)
      .then((data) => setRooms(Array.isArray(data) ? data.map(normalizeRoom) : []))
      .catch(() => setRooms([]));
  }, [unitId]);

  useEffect(() => {
    if (!unitId) return;
    setAuditLogLoading(true);
    setAuditLogError("");
    fetchAdminAuditLogs({ entity_type: "unit", entity_id: unitId })
      .then((data) => setAuditLogs(Array.isArray(data.items) ? data.items : []))
      .catch((e) => {
        setAuditLogError(e.message || "Fehler beim Laden des Verlaufs.");
        setAuditLogs([]);
      })
      .finally(() => setAuditLogLoading(false));
  }, [unitId]);

  const auditResolvers = useMemo(() => {
    const landlordById = {};
    if (unit?.landlord_id && verwaltungLabel && verwaltungLabel !== "—") {
      landlordById[String(unit.landlord_id)] = verwaltungLabel;
    }
    const pmById = {};
    if (unit?.property_manager_id && bewirtschafterLabel && bewirtschafterLabel !== "—") {
      pmById[String(unit.property_manager_id)] = bewirtschafterLabel;
    }
    const propertyById = {};
    if (unit?.property_id) {
      const title = String(unit.property_title || "").trim();
      if (title) propertyById[String(unit.property_id)] = title;
    }
    return { landlordById, pmById, propertyById };
  }, [unit, verwaltungLabel, bewirtschafterLabel]);

  const [occupancyRoomsData, setOccupancyRoomsData] = useState(null);
  useEffect(() => {
    if (!unitId) return;
    const onDate = new Date().toISOString().slice(0, 10);
    fetchAdminOccupancyRooms({ unit_id: unitId, on_date: onDate })
      .then((data) => setOccupancyRoomsData(data))
      .catch(() => setOccupancyRoomsData(null));
  }, [unitId]);

  const [unitTenancies, setUnitTenancies] = useState(null);
  const [tenantNameMap, setTenantNameMap] = useState({});
  useEffect(() => {
    if (!unitId) return;
    setUnitTenancies(null);
    setTenantNameMap({});
    fetchAdminTenancies({ unit_id: unitId, limit: 200 })
      .then((items) => setUnitTenancies(Array.isArray(items) ? items : []))
      .catch(() => setUnitTenancies([]));
  }, [unitId]);

  useEffect(() => {
    if (!unitTenancies || !unitId) return;
    const active = unitTenancies.filter(isTenancyActive);
    const ids = [...new Set(active.map((t) => String(t.tenant_id)))];
    if (ids.length === 0) {
      setTenantNameMap({});
      return;
    }
    let cancelled = false;
    Promise.all(ids.map((id) => fetchAdminTenant(id))).then((rows) => {
      if (cancelled) return;
      const m = {};
      ids.forEach((id, i) => {
        const r = rows[i];
        if (r) {
          m[id] =
            String(r.display_name || r.full_name || "").trim() ||
            `${r.first_name || ""} ${r.last_name || ""}`.trim() ||
            "—";
        }
      });
      setTenantNameMap(m);
    });
    return () => {
      cancelled = true;
    };
  }, [unitTenancies, unitId]);

  const [isRoomModalOpen, setIsRoomModalOpen] = useState(false);
  const [editingRoomId, setEditingRoomId] = useState(null);
  const [roomForm, setRoomForm] = useState({
    roomName: "",
    status: "Frei",
    tenant: "",
    priceMonthly: "",
    moveInDate: "",
    freeFromDate: "",
    reservedUntil: "",
    blockedUntil: "",
    blockedReason: "",
    setupReadyDate: "",
    minimumStayMonths: "3",
    noticePeriodMonths: "3",
  });

  const safeUnit = useMemo(
    () =>
      unit || {
        unitId: "",
        id: "",
        type: "",
        place: "",
        zip: "",
        address: "",
        rooms: 0,
        status: "",
        availableFrom: "",
        landlordLeaseStartDate: "",
        occupiedRooms: 0,
      },
    [unit]
  );

  const unitRooms = useMemo(() => {
    return rooms.filter((room) => room.unitId === safeUnit.unitId);
  }, [rooms, safeUnit.unitId]);

  const activeUnitTenancies = useMemo(() => {
    if (!unitTenancies) return [];
    return unitTenancies.filter(isTenancyActive);
  }, [unitTenancies]);

  const metrics = useMemo(() => {
    const base = getCoLivingMetrics(safeUnit, rooms);
    const isApt = safeUnit.type === "Apartment";

    if (unitTenancies === null) {
      if (isApt) {
        return {
          ...base,
          apartmentTenanciesLoaded: false,
          apartmentHasActiveTenancy: null,
        };
      }
      return base;
    }

    const activeRentSum = activeUnitTenancies.reduce(
      (sum, t) => sum + Number(t.monthly_rent || 0),
      0
    );
    const runningCosts = getRunningMonthlyCosts(safeUnit);

    if (isApt) {
      const occupied = activeUnitTenancies.length > 0;
      const profit =
        base.leaseStarted && runningCosts != null
          ? activeRentSum - runningCosts
          : base.currentProfit;
      return {
        ...base,
        currentRevenue: activeRentSum,
        runningCosts,
        currentProfit: profit,
        fullRevenue: activeRentSum,
        occupiedCount: occupied ? 1 : 0,
        freeCount: occupied ? 0 : 1,
        reservedCount: 0,
        totalRooms: 1,
        vacancyLoss: 0,
        apartmentTenanciesLoaded: true,
        apartmentHasActiveTenancy: occupied,
      };
    }

    const profit =
      base.leaseStarted && runningCosts != null
        ? activeRentSum - runningCosts
        : base.currentProfit;
    return {
      ...base,
      currentRevenue: activeRentSum,
      runningCosts,
      currentProfit: profit,
      vacancyLoss:
        base.fullRevenue != null && base.leaseStarted
          ? base.fullRevenue - activeRentSum
          : base.vacancyLoss,
      apartmentTenanciesLoaded: true,
    };
  }, [safeUnit, rooms, unitTenancies, activeUnitTenancies]);

  const occupancyRate =
    metrics.totalRooms > 0
      ? (metrics.occupiedCount / metrics.totalRooms) * 100
      : 0;

  const unitWarnings = useMemo(() => {
    return buildUnitWarnings(safeUnit, unitRooms, metrics);
  }, [safeUnit, unitRooms, metrics]);

  const nextUnitForecast = {
    revenue: metrics.currentRevenue,
    fullPotential: metrics.fullRevenue,
    openPotential:
      metrics.fullRevenue != null && metrics.currentRevenue != null
        ? Math.max(metrics.fullRevenue - metrics.currentRevenue, 0)
        : null,
    profit: metrics.currentProfit,
  };

  const unitNumber =
    safeUnit.unitId && safeUnit.unitId.split("-")[2]
      ? safeUnit.unitId.split("-")[2]
      : "0000";

  const nextNumber = unitRooms.length + 1;
  const nextRoomId = `FAH-R-${unitNumber}-${String(nextNumber).padStart(
    2,
    "0"
  )}`;

  if (loading) {
    return (
      <div>
        <p className="text-slate-500">Lade Unit…</p>
      </div>
    );
  }

  if (!unit) {
    return (
      <div>
        <h2 className="text-3xl font-bold text-slate-800 mb-2">
          Unit nicht gefunden
        </h2>
        <p className="text-slate-500 mb-6">
          Für diese Unit ID konnten keine Daten gefunden werden.
        </p>

        <Link
          to="/admin/apartments"
          className="inline-block bg-orange-500 hover:bg-orange-600 text-white px-5 py-3 rounded-lg font-medium transition"
        >
          Zurück zu Units
        </Link>
      </div>
    );
  }

  function handleOpenRoomModal() {
    setEditingRoomId(null);
    setRoomForm({
      roomName: `Zimmer ${unitRooms.length + 1}`,
      status: "Frei",
      tenant: "",
      priceMonthly: "",
      moveInDate: "",
      freeFromDate: unit.availableFrom || "",
      reservedUntil: "",
      blockedUntil: "",
      blockedReason: "",
      setupReadyDate: "",
      minimumStayMonths: "3",
      noticePeriodMonths: "3",
    });
    setIsRoomModalOpen(true);
  }

  function handleOpenEditRoomModal(room) {
    setEditingRoomId(room.id);
    setRoomForm({
      roomName: room.roomName || "",
      status: room.status || "Frei",
      tenant: room.tenant === "-" ? "" : room.tenant || "",
      priceMonthly: room.priceMonthly ?? "",
      moveInDate: room.moveInDate === "-" ? "" : room.moveInDate || "",
      freeFromDate: room.freeFromDate === "-" ? "" : room.freeFromDate || "",
      reservedUntil:
        room.reservedUntil === "-" ? "" : room.reservedUntil || "",
      blockedUntil: room.blockedUntil === "-" ? "" : room.blockedUntil || "",
      blockedReason:
        room.blockedReason === "-" ? "" : room.blockedReason || "",
      setupReadyDate:
        room.setupReadyDate === "-" ? "" : room.setupReadyDate || "",
      minimumStayMonths: String(room.minimumStayMonths || 3),
      noticePeriodMonths: String(room.noticePeriodMonths || 3),
    });
    setIsRoomModalOpen(true);
  }

  function handleCloseRoomModal() {
    setIsRoomModalOpen(false);
    setEditingRoomId(null);
    setRoomForm({
      roomName: "",
      status: "Frei",
      tenant: "",
      priceMonthly: "",
      moveInDate: "",
      freeFromDate: unit.availableFrom || "",
      reservedUntil: "",
      blockedUntil: "",
      blockedReason: "",
      setupReadyDate: "",
      minimumStayMonths: "3",
      noticePeriodMonths: "3",
    });
  }

  function handleRoomChange(event) {
    const { name, value } = event.target;

    setRoomForm((prev) => {
      const next = {
        ...prev,
        [name]: value,
      };

      if (name === "status") {
        if (value === "Blockiert" || value === "In Einrichtung") {
          next.priceMonthly = "";
        }

        if (value !== "Belegt") {
          next.tenant = "";
          next.moveInDate = "";
        }

        if (value !== "Reserviert") {
          next.reservedUntil = "";
        }

        if (value !== "Blockiert") {
          next.blockedUntil = "";
          next.blockedReason = "";
        }

        if (value !== "In Einrichtung") {
          next.setupReadyDate = "";
        }
      }

      return next;
    });
  }

  function handleRoomSubmit(event) {
    event.preventDefault();

    const isOccupied = roomForm.status === "Belegt";
    const isReserved = roomForm.status === "Reserviert";
    const isBlocked = roomForm.status === "Blockiert";
    const isSetup = roomForm.status === "In Einrichtung";

    const payload = {
      roomName: roomForm.roomName,
      status: roomForm.status,
      tenant: isOccupied || isReserved ? roomForm.tenant || "-" : "-",
      priceMonthly:
        isBlocked || isSetup ? 0 : Number(roomForm.priceMonthly || 0),
      moveInDate: isOccupied ? roomForm.moveInDate || "-" : "-",
      freeFromDate:
        roomForm.status === "Frei" ||
        roomForm.status === "Belegt" ||
        roomForm.status === "In Reinigung"
          ? roomForm.freeFromDate || "-"
          : "-",
      reservedUntil: isReserved ? roomForm.reservedUntil || "-" : "-",
      blockedUntil: isBlocked ? roomForm.blockedUntil || "-" : "-",
      blockedReason: isBlocked ? roomForm.blockedReason || "-" : "-",
      setupReadyDate: isSetup ? roomForm.setupReadyDate || "-" : "-",
      minimumStayMonths: Number(roomForm.minimumStayMonths || 3),
      noticePeriodMonths: Number(roomForm.noticePeriodMonths || 3),
    };

    if (editingRoomId !== null) {
      setRooms((prevRooms) =>
        prevRooms.map((room) =>
          String(room.id) === String(editingRoomId)
            ? {
                ...room,
                ...payload,
              }
            : room
        )
      );
    } else {
      const newRoom = {
        id: Date.now().toString(),
        unitId: unit.unitId,
        roomId: nextRoomId,
        ...payload,
      };

      setRooms((prevRooms) => [...prevRooms, newRoom]);
    }

    handleCloseRoomModal();
  }

  function handleDeleteRoom(id) {
    const confirmed = window.confirm(
      "Möchtest du diesen Room wirklich löschen?"
    );
    if (!confirmed) return;

    setRooms((prev) => prev.filter((room) => String(room.id) !== String(id)));
  }

  const landlordDepositTypeKey = String(unit.landlordDepositType || "")
    .trim()
    .toLowerCase();
  const showLandlordDepositNone =
    !landlordDepositTypeKey || landlordDepositTypeKey === "none";
  const landlordDepositKindLabel =
    LANDLORD_DEPOSIT_TYPE_LABELS[landlordDepositTypeKey] ||
    unit.landlordDepositType ||
    "—";

  return (
    <div className="min-h-screen bg-slate-50 -m-6 p-6 md:p-8">
      <div className="max-w-[1800px] mx-auto space-y-8">
        <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-6">
          <div>
            <p className="text-sm font-semibold text-orange-600">
              Unit Intelligence
            </p>
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-slate-900 mt-2">
              {getUnitPageMainTitle(unit)}
            </h2>
            <p className="text-xs text-slate-400 mt-2 font-mono break-all">
              {unit.id || unit.unitId}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Badge tone={getStatusTone(unit.status)}>{unit.status}</Badge>
            <Link
              to="/admin/apartments"
              className="inline-block border border-slate-300 hover:bg-slate-50 text-slate-700 px-5 py-3 rounded-xl font-medium transition"
            >
              Zurück
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <SectionCard
            title="Stammdaten"
            subtitle="Grunddaten und aktuelle Struktur dieser Unit"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-slate-700">
              <div>
                <p className="text-sm text-slate-500">Unit ID</p>
                <p className="font-medium">{unit.unitId}</p>
              </div>

              <div>
                <p className="text-sm text-slate-500">Typ</p>
                <p className="font-medium">{unit.type}</p>
              </div>

              <div>
                <p className="text-sm text-slate-500">Ort</p>
                <p className="font-medium">{unit.place}</p>
              </div>

              <div>
                <p className="text-sm text-slate-500">PLZ</p>
                <p className="font-medium">{unit.zip}</p>
              </div>

              <div>
                <p className="text-sm text-slate-500">Adresse</p>
                <p className="font-medium">{unit.address}</p>
              </div>

              <div>
                <p className="text-sm text-slate-500">Zimmer gesamt</p>
                <p className="font-medium">{unit.rooms}</p>
              </div>

              <div>
                <p className="text-sm text-slate-500">Liegenschaft</p>
                <p className="font-medium">{unit.property_title || "—"}</p>
              </div>

              <div>
                <p className="text-sm text-slate-500">Verwaltung</p>
                <p className="font-medium">
                  {unit.landlord_id ? (
                    linksResolving ? (
                      "…"
                    ) : (
                      <Link
                        to={`/admin/landlords?edit=${encodeURIComponent(unit.landlord_id)}`}
                        className="text-orange-600 hover:underline"
                      >
                        {verwaltungLabel || "—"}
                      </Link>
                    )
                  ) : (
                    "—"
                  )}
                </p>
              </div>

              <div>
                <p className="text-sm text-slate-500">Bewirtschafter</p>
                <p className="font-medium">
                  {unit.property_manager_id ? (
                    linksResolving ? (
                      "…"
                    ) : (
                      <Link
                        to={`/admin/bewirtschafter?edit=${encodeURIComponent(unit.property_manager_id)}`}
                        className="text-orange-600 hover:underline"
                      >
                        {bewirtschafterLabel || "—"}
                      </Link>
                    )
                  ) : (
                    "—"
                  )}
                </p>
              </div>

              <div>
                <p className="text-sm text-slate-500">Verfügbar ab</p>
                <p className="font-medium">{unit.availableFrom || "-"}</p>
              </div>

              <div>
                <p className="text-sm text-slate-500">Mietstart Vermieter</p>
                <p className="font-medium">
                  {unit.landlordLeaseStartDate || "-"}
                </p>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title="Finanzübersicht"
            subtitle="Aktuelle Finanzlogik und Potenzial dieser Unit"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <SmallStatCard
                label="Vollbelegung Umsatz"
                value={formatChfOrDash(metrics.fullRevenue)}
                hint="Maximum bei voller Belegung"
                accent="orange"
              />
              <SmallStatCard
                label="Aktueller Umsatz"
                value={formatChfOrDash(metrics.currentRevenue)}
                hint="Summe Monatsmiete aktiver Mietverhältnisse"
                accent="green"
              />
              <SmallStatCard
                label="Laufende Kosten"
                value={formatChfOrDash(metrics.runningCosts)}
                hint={
                  landlordDepositInsuranceMonthly(unit) > 0
                    ? "Miete + NK + Reinigung + Anteil Kautionsversicherung (Jahresprämie / 12)"
                    : "Miete + NK + Reinigung"
                }
                accent="slate"
              />
              <SmallStatCard
                label="Gewinn aktuell"
                value={formatChfOrDash(metrics.currentProfit)}
                hint="Umsatz minus laufende Kosten"
                accent="slate"
              />
            </div>
          </SectionCard>
        </div>

        <SectionCard
          title="Kaution Vermieter"
          subtitle="Hinterlegung gegenüber dem Vermieter (nicht Mieterkaution)"
        >
          {showLandlordDepositNone ? (
            <p className="text-sm text-slate-500">Keine Kaution erfasst</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-slate-700">
              <div>
                <p className="text-sm text-slate-500">Kautionsart</p>
                <p className="font-medium">{landlordDepositKindLabel}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500">Kautionsbetrag</p>
                <p className="font-medium">
                  {formatChfOrDash(unit.landlordDepositAmount)}
                </p>
              </div>
              {landlordDepositTypeKey === "insurance" ? (
                <div>
                  <p className="text-sm text-slate-500">Jahresprämie</p>
                  <p className="font-medium">
                    {formatChfOrDash(unit.landlordDepositAnnualPremium)}
                  </p>
                </div>
              ) : null}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Mieter"
          subtitle="Aktive Mietverhältnisse für diese Unit (Status: active)"
        >
          {unitTenancies === null ? (
            <p className="text-sm text-slate-500">Lade Mietverhältnisse …</p>
          ) : activeUnitTenancies.length === 0 ? (
            <p className="text-sm text-slate-500">Keine aktiven Mieter.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-700">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2 pr-4 font-medium">Name</th>
                    <th className="py-2 pr-4 font-medium text-right">Monatsmiete</th>
                    <th className="py-2 pr-4 font-medium">Kautionsart</th>
                    <th className="py-2 pr-4 font-medium text-right">Kautionsbetrag</th>
                    <th className="py-2 pr-4 font-medium">Anbieter</th>
                    <th className="py-2 pr-4 font-medium">Mietbeginn</th>
                  </tr>
                </thead>
                <tbody>
                  {activeUnitTenancies.map((tn) => {
                    const tdt = String(tn.tenant_deposit_type || "").toLowerCase();
                    return (
                      <tr key={String(tn.id)} className="border-b border-slate-100">
                        <td className="py-2 pr-4 font-medium">
                          <Link
                            to={`/admin/tenants/${String(tn.tenant_id)}`}
                            className="text-orange-600 hover:text-orange-700 hover:underline"
                          >
                            {tenantNameMap[String(tn.tenant_id)] || "…"}
                          </Link>
                        </td>
                        <td className="py-2 pr-4 text-right">
                          {formatChfOrDash(tn.monthly_rent)}
                        </td>
                        <td className="py-2 pr-4 text-slate-600">
                          {tenantDepositTypeLabel(tn.tenant_deposit_type)}
                        </td>
                        <td className="py-2 pr-4 text-right text-slate-600">
                          {formatChfOrDash(tn.tenant_deposit_amount)}
                        </td>
                        <td className="py-2 pr-4 text-slate-600">
                          {tdt === "insurance"
                            ? tenantDepositProviderLabel(tn.tenant_deposit_provider)
                            : "—"}
                        </td>
                        <td className="py-2 pr-4 text-slate-600">
                          {formatTenancyMoveIn(tn.move_in_date)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-4">
          <SmallStatCard
            label="Rooms gesamt"
            value={metrics.totalRooms}
            hint="Gesamte Kapazität"
            accent="slate"
          />
          <SmallStatCard
            label="Belegt"
            value={metrics.occupiedCount}
            hint="Aktuell belegt"
            accent="green"
          />
          <SmallStatCard
            label="Reserviert"
            value={metrics.reservedCount}
            hint="Zukünftige Belegung"
            accent="amber"
          />
          <SmallStatCard
            label="Frei"
            value={metrics.freeCount}
            hint="Aktuell frei"
            accent="rose"
          />
          <SmallStatCard
            label="Belegt in %"
            value={formatPercent(occupancyRate)}
            hint="Aktuelle Auslastung"
            accent="blue"
          />
          <SmallStatCard
            label="Leerstand"
            value={formatChfOrDash(metrics.vacancyLoss)}
            hint="Fehlender Umsatz"
            accent="rose"
          />
        </div>

        <SectionCard
          title="Automatische Warnungen"
          subtitle="Wichtige Hinweise nur für diese Unit"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {unitWarnings.map((warning, index) => (
              <div
                key={`${warning.text}-${index}`}
                className={`rounded-2xl border p-4 ${
                  warning.tone === "rose"
                    ? "border-rose-200 bg-rose-50"
                    : "border-amber-200 bg-amber-50"
                }`}
              >
                <p
                  className={`text-sm font-medium ${
                    warning.tone === "rose"
                      ? "text-rose-700"
                      : "text-amber-700"
                  }`}
                >
                  {warning.text}
                </p>
              </div>
            ))}

            {unitWarnings.length === 0 && (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-sm font-medium text-emerald-700">
                  Keine kritischen Warnungen für diese Unit
                </p>
              </div>
            )}
          </div>
        </SectionCard>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <SectionCard
            title="Forecast für diese Unit"
            subtitle="Operative Vorschau auf Umsatz und Potenzial"
          >
            <div className="grid grid-cols-1 gap-4">
              <SmallStatCard
                label="Aktueller Umsatz"
                value={formatChfOrDash(nextUnitForecast.revenue)}
                hint="Live berechnet"
                accent="green"
              />
              <SmallStatCard
                label="Offenes Potenzial"
                value={formatChfOrDash(nextUnitForecast.openPotential)}
                hint="Noch nicht vermietete Kapazität"
                accent="amber"
              />
              <SmallStatCard
                label="Vollbelegung Potenzial"
                value={formatChfOrDash(nextUnitForecast.fullPotential)}
                hint="Bei 100% Belegung"
                accent="orange"
              />
              <SmallStatCard
                label="Gewinn aktuell"
                value={formatChfOrDash(nextUnitForecast.profit)}
                hint="Aktuelle Unit-Marge"
                accent="slate"
              />
            </div>
          </SectionCard>

          <SectionCard
            title="Room Status Übersicht"
            subtitle="Schneller Blick auf alle Zimmer"
          >
            <div className="space-y-3">
              {unitRooms.map((room) => (
                <div
                  key={room.id}
                  className="rounded-2xl border border-slate-200 bg-slate-50 p-4 flex items-center justify-between gap-4"
                >
                  <div>
                    <p className="font-semibold text-slate-800">
                      {room.roomName}
                    </p>
                    <p className="text-sm text-slate-500 mt-1">
                      {formatChfOrDash(room.priceMonthly)} ·{" "}
                      {room.moveInDate && room.moveInDate !== "-"
                        ? `Einzug ${room.moveInDate}`
                        : "Kein Einzug erfasst"}
                    </p>
                  </div>

                  <Badge tone={getStatusTone(room.status)}>{room.status}</Badge>
                </div>
              ))}

              {unitRooms.length === 0 && (
                <p className="text-sm text-slate-500">
                  Noch keine Rooms vorhanden.
                </p>
              )}
            </div>
          </SectionCard>

          <SectionCard
            title="Break-Even"
            subtitle="Deckt diese Unit ihre laufenden Kosten?"
          >
            <div className="grid grid-cols-1 gap-4">
              <SmallStatCard
                label="Aktueller Umsatz"
                value={formatChfOrDash(metrics.currentRevenue)}
                hint="Live Umsatz"
                accent="green"
              />
              <SmallStatCard
                label="Break-Even"
                value={formatChfOrDash(metrics.runningCosts)}
                hint="Notwendiger Monatsumsatz"
                accent="slate"
              />
              <SmallStatCard
                label="Differenz"
                value={formatChfOrDash(
                  metrics.currentRevenue != null &&
                    metrics.runningCosts != null
                    ? metrics.currentRevenue - metrics.runningCosts
                    : null
                )}
                hint={
                  metrics.currentRevenue != null &&
                  metrics.runningCosts != null
                    ? metrics.currentRevenue - metrics.runningCosts >= 0
                      ? "Über Break-Even"
                      : "Unter Break-Even"
                    : "Keine Daten vorhanden"
                }
                accent={
                  metrics.currentRevenue != null &&
                  metrics.runningCosts != null
                    ? metrics.currentRevenue - metrics.runningCosts >= 0
                      ? "green"
                      : "rose"
                    : "slate"
                }
              />
            </div>
          </SectionCard>
        </div>

        {unit.type === "Co-Living" && (
          <SectionCard
            title="Rooms"
            subtitle="Echte Room-Verwaltung für diese Co-Living Unit"
            rightSlot={
              <button
                onClick={handleOpenRoomModal}
                className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-xl font-medium transition"
              >
                + Room hinzufügen
              </button>
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 text-sm">
                    <th className="py-3 pr-4">Room ID</th>
                    <th className="py-3 pr-4">Zimmer</th>
                    <th className="py-3 pr-4">Status</th>
                    <th className="py-3 pr-4">Mieter</th>
                    <th className="py-3 pr-4">Preis</th>
                    <th className="py-3 pr-4">Einzug</th>
                    <th className="py-3 pr-4">Frei ab</th>
                    <th className="py-3 pr-4">Min. Dauer</th>
                    <th className="py-3 pr-4">Kündigung</th>
                    <th className="py-3 pr-4">Aktionen</th>
                  </tr>
                </thead>

                <tbody>
                  {unitRooms.map((room) => (
                    <tr
                      key={room.id}
                      className="border-b border-slate-100 text-slate-700"
                    >
                      <td className="py-4 pr-4 font-medium text-orange-600">
                        {room.roomId}
                      </td>
                      <td className="py-4 pr-4">{room.roomName}</td>
                      <td className="py-4 pr-4">
                        <Badge tone={getStatusTone(room.status)}>
                          {room.status}
                        </Badge>
                      </td>
                      <td className="py-4 pr-4">{room.tenant}</td>
                      <td className="py-4 pr-4">
                        {formatChfOrDash(room.priceMonthly)}
                      </td>
                      <td className="py-4 pr-4">{room.moveInDate || "-"}</td>
                      <td className="py-4 pr-4">{room.freeFromDate || "-"}</td>
                      <td className="py-4 pr-4">
                        {room.minimumStayMonths || 3} M
                      </td>
                      <td className="py-4 pr-4">
                        {room.noticePeriodMonths || 3} M
                      </td>
                      <td className="py-4 pr-4">
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleOpenEditRoomModal(room)}
                            className="px-3 py-2 rounded-lg border border-slate-300 text-sm hover:bg-slate-50"
                          >
                            Bearbeiten
                          </button>
                          <button
                            onClick={() => handleDeleteRoom(room.id)}
                            className="px-3 py-2 rounded-lg border border-red-300 text-red-600 text-sm hover:bg-red-50"
                          >
                            Löschen
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}

                  {unitRooms.length === 0 && (
                    <tr>
                      <td
                        colSpan="10"
                        className="py-8 text-center text-slate-500"
                      >
                        Noch keine Rooms vorhanden.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </SectionCard>
        )}

        {unit.type === "Co-Living" && (
          <SectionCard
            title="Raumstatus (Belegung)"
            subtitle="Belegt (grün), Reserviert (gelb), Frei (rot) – aus Tenancies"
          >
            <OccupancyMap
              unit={unit}
              rooms={unitRooms}
              occupancyData={occupancyRoomsData}
            />
          </SectionCard>
        )}

        {unit.type === "Co-Living" && (
          <SectionCard
            title="Room Map"
            subtitle="Visuelle Übersicht aller Rooms dieser Unit"
          >
            <RoomMap unit={unit} rooms={unitRooms} />
          </SectionCard>
        )}

        {unit.type === "Co-Living" && (
          <SectionCard
            title="Belegungskalender"
            subtitle="Monatskalender nur für diese Unit"
          >
            <RoomCalendar unit={unit} rooms={unitRooms} />
          </SectionCard>
        )}

        <SectionCard
          title="Verlauf"
          subtitle="Änderungen an dieser Unit (Audit-Log, neueste zuerst)"
        >
          {auditLogLoading ? (
            <p className="text-sm text-slate-500">Lade Verlauf …</p>
          ) : auditLogError ? (
            <p className="text-sm text-red-600">{auditLogError}</p>
          ) : auditLogs.length === 0 ? (
            <p className="text-sm text-slate-500">Keine Aktivitäten vorhanden</p>
          ) : (
            <ul className="space-y-0 border-l border-slate-200 pl-4 ml-1">
              {auditLogs.map((entry) => (
                <li
                  key={entry.id}
                  className="relative pb-4 last:pb-0 pl-2 -ml-px border-l border-transparent"
                >
                  <span
                    className="absolute -left-[5px] top-1.5 h-2 w-2 rounded-full bg-orange-500"
                    aria-hidden
                  />
                  <p className="text-xs text-slate-500">
                    {formatAuditTimestamp(entry.created_at)}
                  </p>
                  <div className="font-medium text-slate-800 mt-0.5 space-y-1">
                    {getAuditEntryDisplayLines(entry, auditResolvers).map((line, idx) => (
                      <p key={idx}>{line}</p>
                    ))}
                  </div>
                  <p className="text-sm text-slate-600 mt-1">
                    {auditActionLabel(entry.action)}
                    {" · "}
                    {entry.actor_name ||
                      entry.actor_email ||
                      entry.actor_user_id ||
                      "—"}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        {isRoomModalOpen && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
            <div className="bg-white w-full max-w-3xl rounded-2xl shadow-xl border border-slate-200 p-6 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-2xl font-bold text-slate-800">
                    {editingRoomId
                      ? "Room bearbeiten"
                      : "Neuen Room hinzufügen"}
                  </h3>
                  <p className="text-slate-500 mt-1">
                    {editingRoomId
                      ? "Bearbeite hier den vorhandenen Room."
                      : "Room ID wird automatisch vergeben."}
                  </p>
                </div>

                <button
                  onClick={handleCloseRoomModal}
                  className="text-slate-500 hover:text-slate-700 text-2xl leading-none"
                >
                  ×
                </button>
              </div>

              <div className="mb-6 bg-slate-50 border border-slate-200 rounded-xl p-4">
                <p className="text-sm text-slate-500">
                  {editingRoomId ? "Room ID" : "Automatische Room ID"}
                </p>
                <p className="text-xl font-bold text-slate-800 mt-1">
                  {editingRoomId
                    ? unitRooms.find(
                        (room) => String(room.id) === String(editingRoomId)
                      )?.roomId
                    : nextRoomId}
                </p>
              </div>

              <form onSubmit={handleRoomSubmit}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-slate-600 mb-2">
                      Zimmername
                    </label>
                    <input
                      type="text"
                      name="roomName"
                      value={roomForm.roomName}
                      onChange={handleRoomChange}
                      required
                      className="w-full border border-slate-300 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-slate-600 mb-2">
                      Status
                    </label>
                    <select
                      name="status"
                      value={roomForm.status}
                      onChange={handleRoomChange}
                      className="w-full border border-slate-300 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500"
                    >
                      <option>Frei</option>
                      <option>Belegt</option>
                      <option>Reserviert</option>
                      <option>In Reinigung</option>
                      <option>Blockiert</option>
                      <option>In Einrichtung</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm text-slate-600 mb-2">
                      Mieter / reserviert für
                    </label>
                    <input
                      type="text"
                      name="tenant"
                      value={roomForm.tenant}
                      onChange={handleRoomChange}
                      placeholder="z. B. Max Muster"
                      disabled={
                        roomForm.status !== "Belegt" &&
                        roomForm.status !== "Reserviert"
                      }
                      className="w-full border border-slate-300 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500 disabled:bg-slate-100 disabled:text-slate-400"
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-slate-600 mb-2">
                      Preis pro Monat
                    </label>
                    <input
                      type="number"
                      name="priceMonthly"
                      value={roomForm.priceMonthly}
                      onChange={handleRoomChange}
                      required={
                        roomForm.status !== "Blockiert" &&
                        roomForm.status !== "In Einrichtung"
                      }
                      disabled={
                        roomForm.status === "Blockiert" ||
                        roomForm.status === "In Einrichtung"
                      }
                      placeholder="z. B. 950"
                      className="w-full border border-slate-300 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500 disabled:bg-slate-100 disabled:text-slate-400"
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-slate-600 mb-2">
                      Einzugsdatum
                    </label>
                    <input
                      type="date"
                      name="moveInDate"
                      value={roomForm.moveInDate}
                      onChange={handleRoomChange}
                      disabled={roomForm.status !== "Belegt"}
                      className="w-full border border-slate-300 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500 disabled:bg-slate-100 disabled:text-slate-400"
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-slate-600 mb-2">
                      Frei ab / Auszugsdatum
                    </label>
                    <input
                      type="date"
                      name="freeFromDate"
                      value={roomForm.freeFromDate}
                      onChange={handleRoomChange}
                      className="w-full border border-slate-300 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-slate-600 mb-2">
                      Mindestmietdauer in Monaten
                    </label>
                    <input
                      type="number"
                      name="minimumStayMonths"
                      value={roomForm.minimumStayMonths}
                      onChange={handleRoomChange}
                      min="1"
                      className="w-full border border-slate-300 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-slate-600 mb-2">
                      Kündigungsfrist in Monaten
                    </label>
                    <input
                      type="number"
                      name="noticePeriodMonths"
                      value={roomForm.noticePeriodMonths}
                      onChange={handleRoomChange}
                      min="1"
                      className="w-full border border-slate-300 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>

                  {roomForm.status === "Reserviert" && (
                    <div className="md:col-span-2">
                      <label className="block text-sm text-slate-600 mb-2">
                        Reserviert bis
                      </label>
                      <input
                        type="date"
                        name="reservedUntil"
                        value={roomForm.reservedUntil}
                        onChange={handleRoomChange}
                        className="w-full border border-slate-300 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500"
                      />
                    </div>
                  )}

                  {roomForm.status === "Blockiert" && (
                    <>
                      <div>
                        <label className="block text-sm text-slate-600 mb-2">
                          Blockiert bis
                        </label>
                        <input
                          type="date"
                          name="blockedUntil"
                          value={roomForm.blockedUntil}
                          onChange={handleRoomChange}
                          className="w-full border border-slate-300 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500"
                        />
                      </div>

                      <div>
                        <label className="block text-sm text-slate-600 mb-2">
                          Grund
                        </label>
                        <input
                          type="text"
                          name="blockedReason"
                          value={roomForm.blockedReason}
                          onChange={handleRoomChange}
                          placeholder="z. B. Renovation"
                          className="w-full border border-slate-300 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500"
                        />
                      </div>
                    </>
                  )}

                  {roomForm.status === "In Einrichtung" && (
                    <div className="md:col-span-2">
                      <label className="block text-sm text-slate-600 mb-2">
                        Bereit ab
                      </label>
                      <input
                        type="date"
                        name="setupReadyDate"
                        value={roomForm.setupReadyDate}
                        onChange={handleRoomChange}
                        className="w-full border border-slate-300 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500"
                      />
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-3 mt-6">
                  <button
                    type="button"
                    onClick={handleCloseRoomModal}
                    className="px-5 py-3 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
                  >
                    Abbrechen
                  </button>

                  <button
                    type="submit"
                    className="bg-orange-500 hover:bg-orange-600 text-white px-5 py-3 rounded-lg font-medium transition"
                  >
                    {editingRoomId
                      ? "Änderungen speichern"
                      : "Room speichern"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminUnitDetailPage;