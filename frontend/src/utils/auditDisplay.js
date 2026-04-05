/**
 * Centralized audit log formatting for admin + platform UI.
 * Backend/API shapes unchanged; display-only.
 */

import {
  revenueTypeLabelForDisplay,
  revenueFrequencyLabel,
} from "./tenancyRevenueBreakdown";
import { resolveAuditFkDisplay } from "./auditFkDisplay";
import { ENTITY_AUDIT_LABELS, getAuditFieldLabel } from "./auditFieldLabels";

/** @typedef {{ label: string, old: string, new: string }} AuditChange */

/** Order for unit audit update fields (remaining keys sorted alphabetically after these). */
const AUDIT_UPDATE_FIELD_ORDER = [
  "landlord_id",
  "property_manager_id",
  "owner_id",
  "tenant_price_monthly_chf",
  "landlord_rent_monthly_chf",
  "occupancy_status",
];

const LANDLORD_DEPOSIT_TYPE_LABELS = {
  bank: "Bankdepot",
  insurance: "Versicherung",
  cash: "Bareinzahlung",
  none: "Keine",
};

const UNIT_COST_AUDIT_FREQ_LABELS = {
  monthly: "Monatlich",
  yearly: "Jährlich",
  one_time: "Einmalig",
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

function roundCurrency(value) {
  return Math.round(Number(value || 0));
}

function formatCurrency(value) {
  return `CHF ${roundCurrency(value).toLocaleString("de-CH")}`;
}

function dashEmpties(value) {
  if (value == null || value === "") return "—";
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return s;
}

export function auditValuesEqual(a, b) {
  if (a === b) return true;
  if (a == null && b == null) return true;
  return JSON.stringify(a) === JSON.stringify(b);
}

export function auditActionLabel(action) {
  const a = String(action || "").toLowerCase();
  if (a === "create") return "Erstellt";
  if (a === "delete") return "Gelöscht";
  if (a === "update") return "Bearbeitet";
  return action || "—";
}

export function formatAuditTimestamp(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString("de-CH", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

/** Display-only: best-effort actor line for audit UIs (no API changes). */
export function auditActorDisplay(log) {
  if (!log) return null;
  const n = log.actor_name && String(log.actor_name).trim();
  if (n) return n;
  const e = log.actor_email && String(log.actor_email).trim();
  if (e) return e;
  if (log.actor_user_id != null && String(log.actor_user_id).trim() !== "") {
    return String(log.actor_user_id).trim();
  }
  return null;
}

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

/** Unit flat-field value formatting (FK + CHF + dates). */
export function formatUnitAuditFieldValue(key, value, resolvers) {
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
  if (key === "owner_id") {
    const s = String(value);
    if (r.ownerById && r.ownerById[s]) return r.ownerById[s];
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

function formatUnitCostAuditSnapshot(uc) {
  if (!uc || typeof uc !== "object") return "—";
  const ct = String(uc.cost_type || "").trim() || "—";
  const n = Number(uc.amount_chf);
  const amt = Number.isFinite(n) ? formatCurrency(n) : "—";
  const fq = String(uc.frequency || "monthly").trim().toLowerCase();
  const fqLabel = UNIT_COST_AUDIT_FREQ_LABELS[fq] || fq;
  return `${ct} · ${amt} · ${fqLabel}`;
}

function buildUnitCostAuditUpdateLines(ucOld, ucNew) {
  const lines = [];
  if (String(ucOld.cost_type || "") !== String(ucNew.cost_type || "")) {
    lines.push(`Kostenart: ${dashEmpties(ucOld.cost_type)} → ${dashEmpties(ucNew.cost_type)}`);
  }
  const oAmt = Number(ucOld.amount_chf);
  const nAmt = Number(ucNew.amount_chf);
  if (Number.isFinite(oAmt) && Number.isFinite(nAmt) && oAmt !== nAmt) {
    lines.push(`Betrag: ${formatCurrency(oAmt)} → ${formatCurrency(nAmt)}`);
  } else if (String(ucOld.amount_chf) !== String(ucNew.amount_chf)) {
    lines.push(`Betrag: ${dashEmpties(ucOld.amount_chf)} → ${dashEmpties(ucNew.amount_chf)}`);
  }
  const oFq = String(ucOld.frequency || "").trim().toLowerCase();
  const nFq = String(ucNew.frequency || "").trim().toLowerCase();
  if (oFq !== nFq) {
    lines.push(
      `Frequenz: ${UNIT_COST_AUDIT_FREQ_LABELS[oFq] || oFq} → ${UNIT_COST_AUDIT_FREQ_LABELS[nFq] || nFq}`
    );
  }
  return lines;
}

function formatAuditIsoDateDe(iso) {
  if (!iso) return "—";
  const s = String(iso).slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split("-");
    return `${d}.${m}.${y}`;
  }
  return String(iso);
}

function formatChfPlain(n) {
  if (n == null || n === "") return "—";
  const x = Number(n);
  if (Number.isNaN(x)) return String(n);
  return `${x.toLocaleString("de-CH")} CHF`;
}

function tenancyDisplayStatusLabelDeUnit(ds) {
  const k = String(ds || "").toLowerCase();
  if (k === "active") return "Aktiv";
  if (k === "reserved") return "Reserviert";
  if (k === "notice_given") return "Gekündigt";
  if (k === "ended") return "Beendet";
  return "—";
}

/**
 * String lines for unit timeline (backward compatible with AdminUnitDetailPage).
 * @param {object} entry
 * @param {object} resolvers
 * @returns {string[]}
 */
export function buildAuditUpdateLines(entry, resolvers) {
  const rawOld = entry.old_values;
  const rawNew = entry.new_values;
  const oldV =
    rawOld != null && typeof rawOld === "object" && !Array.isArray(rawOld) ? rawOld : {};
  const newV =
    rawNew != null && typeof rawNew === "object" && !Array.isArray(rawNew) ? rawNew : {};

  const docExtraLines = [];
  if (
    newV.unit_document?.action === "uploaded" &&
    String(newV.unit_document?.file_name || "").trim() !== ""
  ) {
    docExtraLines.push(`Dokument hochgeladen: ${String(newV.unit_document.file_name)}`);
  } else if (newV.document_uploaded != null && String(newV.document_uploaded).trim() !== "") {
    docExtraLines.push(`Dokument hochgeladen: ${String(newV.document_uploaded)}`);
  }
  if (
    oldV.unit_document?.action === "deleted" &&
    String(oldV.unit_document?.file_name || "").trim() !== ""
  ) {
    docExtraLines.push(`Dokument gelöscht: ${String(oldV.unit_document.file_name)}`);
  } else if (oldV.document_deleted != null && String(oldV.document_deleted).trim() !== "") {
    docExtraLines.push(`Dokument gelöscht: ${String(oldV.document_deleted)}`);
  }

  const hasOld = rawOld != null && typeof rawOld === "object" && !Array.isArray(rawOld);
  const hasNew = rawNew != null && typeof rawNew === "object" && !Array.isArray(rawNew);
  if (!hasOld || !hasNew) {
    return docExtraLines.length ? ["Unit bearbeitet", ...docExtraLines] : ["Unit bearbeitet"];
  }

  const unitLabels = ENTITY_AUDIT_LABELS.unit || {};
  const keys = new Set([...Object.keys(oldV), ...Object.keys(newV)]);
  const changedKeys = [];
  for (const k of keys) {
    if (
      k === "document_uploaded" ||
      k === "document_deleted" ||
      k === "unit_document" ||
      k === "room" ||
      k === "tenancy" ||
      k === "tenancy_revenue" ||
      k === "unit_cost"
    ) {
      continue;
    }
    if (auditValuesEqual(oldV[k], newV[k])) continue;
    if (!unitLabels[k]) continue;
    changedKeys.push(k);
  }
  if (changedKeys.length === 0) {
    return docExtraLines.length ? ["Unit bearbeitet", ...docExtraLines] : ["Unit bearbeitet"];
  }
  const sorted = sortAuditChangedFieldKeys(changedKeys);
  const detailLines = sorted.map((k) => {
    const lbl = unitLabels[k];
    const oldStr = formatUnitAuditFieldValue(k, oldV[k], resolvers);
    const newStr = formatUnitAuditFieldValue(k, newV[k], resolvers);
    return `${lbl} geändert: ${oldStr} → ${newStr}`;
  });
  const limited =
    detailLines.length <= 3 ? detailLines : [...detailLines.slice(0, 3), "Weitere Änderungen"];
  return ["Unit bearbeitet", ...docExtraLines, ...limited];
}

function buildUnitFlatFieldChangesFixed(entry, resolvers) {
  const rawOld = entry.old_values;
  const rawNew = entry.new_values;
  const oldV =
    rawOld != null && typeof rawOld === "object" && !Array.isArray(rawOld) ? rawOld : {};
  const newV =
    rawNew != null && typeof rawNew === "object" && !Array.isArray(rawNew) ? newV : {};
  const hasOld = rawOld != null && typeof rawOld === "object" && !Array.isArray(rawOld);
  const hasNew = rawNew != null && typeof rawNew === "object" && !Array.isArray(rawNew);
  if (!hasOld || !hasNew) return [];

  const unitLabels = ENTITY_AUDIT_LABELS.unit || {};
  const keys = new Set([...Object.keys(oldV), ...Object.keys(newV)]);
  const changedKeys = [];
  for (const k of keys) {
    if (
      k === "document_uploaded" ||
      k === "document_deleted" ||
      k === "unit_document" ||
      k === "room" ||
      k === "tenancy" ||
      k === "tenancy_revenue" ||
      k === "unit_cost"
    ) {
      continue;
    }
    if (auditValuesEqual(oldV[k], newV[k])) continue;
    if (!unitLabels[k]) continue;
    changedKeys.push(k);
  }
  const sorted = sortAuditChangedFieldKeys(changedKeys);
  return sorted.map((k) => ({
    label: unitLabels[k],
    old: formatUnitAuditFieldValue(k, oldV[k], resolvers),
    new: formatUnitAuditFieldValue(k, newV[k], resolvers),
  }));
}

function parseLineToChange(line) {
  const m = String(line).match(/^(.+?) geändert: (.+) → (.+)$/);
  if (m) return { label: m[1].trim(), old: m[2].trim(), new: m[3].trim() };
  const m2 = String(line).match(/^([^:]+):\s*(.+?)\s*→\s*(.+)$/);
  if (m2 && !line.includes("·") && line.includes("→")) {
    return { label: m2[1].trim(), old: m2[2].trim(), new: m2[3].trim() };
  }
  return null;
}

/**
 * Full unit audit display lines (timeline) — same behavior as former AdminUnitDetailPage inline impl.
 */
export function getAuditEntryDisplayLines(entry, resolvers) {
  const action = String(entry.action || "").toLowerCase();
  const nv = entry.new_values;
  const ov = entry.old_values;
  const objNv = nv && typeof nv === "object" && !Array.isArray(nv) ? nv : {};
  const objOv = ov && typeof ov === "object" && !Array.isArray(ov) ? ov : {};

  const roomNew = objNv.room;
  const roomOld = objOv.room;
  if (roomNew || roomOld) {
    if (action === "create" && roomNew) {
      const nm = String(roomNew.name || "").trim() || "—";
      return [`Zimmer hinzugefügt: ${nm}`];
    }
    if (action === "delete" && roomOld) {
      return [`Zimmer gelöscht: ${String(roomOld.name || "").trim() || "—"}`];
    }
    if (action === "update" && roomOld && roomNew) {
      const lines = [];
      if (String(roomOld.name || "") !== String(roomNew.name || "")) {
        lines.push(`Name: ${roomOld.name || "—"} → ${roomNew.name || "—"}`);
      }
      if (String(roomOld.status || "") !== String(roomNew.status || "")) {
        lines.push(`Status: ${roomOld.status || "—"} → ${roomNew.status || "—"}`);
      }
      const op = Number(roomOld.price);
      const np = Number(roomNew.price);
      if (!Number.isNaN(op) && !Number.isNaN(np) && op !== np) {
        lines.push(`Geplanter Mietpreis: ${formatChfPlain(op)} → ${formatChfPlain(np)}`);
      }
      return lines.length ? ["Zimmer bearbeitet", ...lines] : ["Zimmer bearbeitet"];
    }
  }

  const tenNew = objNv.tenancy;
  const tenOld = objOv.tenancy;
  if (tenNew || tenOld) {
    if (action === "create" && tenNew) {
      const end = tenNew.display_end_date || tenNew.move_out_date;
      return [
        `Mietverhältnis erstellt · Einzug ${formatAuditIsoDateDe(tenNew.move_in_date)} · Ende ${formatAuditIsoDateDe(end)} · ${formatChfPlain(tenNew.monthly_rent)}/Monat`,
      ];
    }
    if (action === "delete" && tenOld) {
      return [`Mietverhältnis gelöscht · Einzug ${formatAuditIsoDateDe(tenOld.move_in_date)}`];
    }
    if (action === "update" && tenOld && tenNew) {
      const lines = [];
      if (String(tenOld.termination_effective_date || "") !== String(tenNew.termination_effective_date || "")) {
        if (tenNew.termination_effective_date) {
          lines.push(`Kündigung wirksam per ${formatAuditIsoDateDe(tenNew.termination_effective_date)}`);
        }
      }
      if (
        String(tenOld.notice_given_at || "") !== String(tenNew.notice_given_at || "") &&
        tenNew.notice_given_at
      ) {
        lines.push(`Kündigung erfasst · eingegangen am ${formatAuditIsoDateDe(tenNew.notice_given_at)}`);
      }
      if (
        String(tenOld.actual_move_out_date || "") !== String(tenNew.actual_move_out_date || "") &&
        tenNew.actual_move_out_date
      ) {
        lines.push(`Rückgabe erfolgt am ${formatAuditIsoDateDe(tenNew.actual_move_out_date)}`);
      }
      if (String(tenOld.display_end_date || "") !== String(tenNew.display_end_date || "")) {
        lines.push(
          `Mietende geändert: ${formatAuditIsoDateDe(tenOld.display_end_date) || "—"} → ${formatAuditIsoDateDe(tenNew.display_end_date) || "—"}`
        );
      }
      if (String(tenOld.display_status || "") !== String(tenNew.display_status || "")) {
        lines.push(
          `Status: ${tenancyDisplayStatusLabelDeUnit(tenOld.display_status)} → ${tenancyDisplayStatusLabelDeUnit(tenNew.display_status)}`
        );
      }
      return lines.length ? ["Mietverhältnis bearbeitet", ...lines] : ["Mietverhältnis bearbeitet"];
    }
  }

  const revN = objNv.tenancy_revenue;
  const revO = objOv.tenancy_revenue;
  if (revN || revO) {
    if (action === "create" && revN) {
      return [
        `Einnahme hinzugefügt: ${revenueTypeLabelForDisplay(revN.type)}, ${formatChfPlain(revN.amount_chf)}, ${revenueFrequencyLabel(revN.frequency).toLowerCase()}`,
      ];
    }
    if (action === "delete" && revO) {
      return [
        `Einnahme gelöscht: ${revenueTypeLabelForDisplay(revO.type)}, ${formatChfPlain(revO.amount_chf)}, ${revenueFrequencyLabel(revO.frequency).toLowerCase()}`,
      ];
    }
    if (action === "update" && revO && revN) {
      return [
        `Einnahme bearbeitet: ${revenueTypeLabelForDisplay(revN.type)}, ${formatChfPlain(revN.amount_chf)}, ${revenueFrequencyLabel(revN.frequency).toLowerCase()}`,
      ];
    }
  }

  const udNew = objNv.unit_document;
  const udOld = objOv.unit_document;
  if (action === "update" && udOld && udOld.action === "deleted" && udOld.file_name) {
    return [`Dokument gelöscht: ${String(udOld.file_name)}`];
  }
  if (action === "update" && udNew && udNew.action === "uploaded" && udNew.file_name) {
    return [`Dokument hochgeladen: ${String(udNew.file_name)}`];
  }

  const ucNew = nv && typeof nv === "object" && !Array.isArray(nv) ? nv.unit_cost : null;
  const ucOld = ov && typeof ov === "object" && !Array.isArray(ov) ? ov.unit_cost : null;

  if (action === "create" && ucNew) {
    return [`Kosten hinzugefügt: ${formatUnitCostAuditSnapshot(ucNew)}`];
  }
  if (action === "delete" && ucOld) {
    return [`Kosten gelöscht: ${formatUnitCostAuditSnapshot(ucOld)}`];
  }
  if (action === "update" && ucOld && ucNew) {
    const detail = buildUnitCostAuditUpdateLines(ucOld, ucNew);
    return detail.length ? ["Kosten bearbeitet", ...detail] : ["Kosten bearbeitet"];
  }

  if (action === "create") return ["Unit erstellt"];
  if (action === "delete") return ["Unit gelöscht"];
  if (action === "update") return buildAuditUpdateLines(entry, resolvers);
  return ["Unit bearbeitet"];
}

function linesToChanges(lines) {
  /** @type {AuditChange[]} */
  const changes = [];
  for (const line of lines) {
    const parsed = parseLineToChange(line);
    if (parsed) {
      changes.push(parsed);
      continue;
    }
    if (line === "Weitere Änderungen") continue;
    if (
      line.startsWith("Dokument ") ||
      line.startsWith("Unit ") ||
      line.startsWith("Zimmer ") ||
      line.startsWith("Mietverhältnis ") ||
      line.startsWith("Einnahme ") ||
      line.startsWith("Kosten ")
    ) {
      changes.push({ label: "Ereignis", old: "—", new: line });
    } else {
      changes.push({ label: "Details", old: "—", new: line });
    }
  }
  return changes;
}

function formatAuditScalar(v) {
  if (v == null || v === "") return "—";
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return s.length > 120 ? `${s.slice(0, 117)}…` : s;
}

function unitLabelFromMap(u) {
  if (!u) return "—";
  const nu = u;
  const t = nu.title || nu.address || "";
  const place = nu.place || [nu.postal_code, nu.city].filter(Boolean).join(" ");
  const line = [t, place].filter(Boolean).join(" · ");
  return line || nu.id || "—";
}

/**
 * @param {object} log
 * @param {Map<string, object>} [unitById]
 */
export function formatInventoryAuditResult(log, unitById) {
  const a = String(log.action || "").toLowerCase();
  const ov = log.old_values && typeof log.old_values === "object" ? log.old_values : {};
  const nv = log.new_values && typeof log.new_values === "object" ? log.new_values : {};
  const invLabels = ENTITY_AUDIT_LABELS.inventory_item || {};

  if (a === "create" && nv.inventory_assignment) {
    const asg = nv.inventory_assignment;
    const u = unitById && unitById.get ? unitById.get(String(asg.unit_id)) : null;
    const ul = u ? unitLabelFromMap(u) : String(asg.unit_id || "").slice(0, 12);
    return {
      summary: `Zuordnung hinzugefügt · ${ul} · Menge ${asg.quantity ?? "—"}`,
      changes: [{ label: "Zuordnung", old: "—", new: `${ul} · ${asg.quantity ?? "—"}` }],
    };
  }
  if (a === "delete" && ov.inventory_assignment && !ov.name && !ov.inventory_number) {
    const asg = ov.inventory_assignment;
    const u = unitById && unitById.get ? unitById.get(String(asg.unit_id)) : null;
    const ul = u ? unitLabelFromMap(u) : String(asg.unit_id || "").slice(0, 12);
    return {
      summary: `Zuordnung entfernt · ${ul}`,
      changes: [{ label: "Zuordnung", old: `${ul}`, new: "—" }],
    };
  }
  if (a === "update" && ov.inventory_assignment && nv.inventory_assignment) {
    const o = ov.inventory_assignment;
    const n = nv.inventory_assignment;
    /** @type {AuditChange[]} */
    const ch = [];
    if (!auditValuesEqual(o.unit_id, n.unit_id)) {
      const ol = unitById?.get?.(String(o.unit_id)) ? unitLabelFromMap(unitById.get(String(o.unit_id))) : String(o.unit_id || "");
      const nl = unitById?.get?.(String(n.unit_id)) ? unitLabelFromMap(unitById.get(String(n.unit_id))) : String(n.unit_id || "");
      ch.push({ label: "Unit", old: ol, new: nl });
    }
    if (!auditValuesEqual(o.quantity, n.quantity)) {
      ch.push({ label: "Menge", old: formatAuditScalar(o.quantity), new: formatAuditScalar(n.quantity) });
    }
    if (!auditValuesEqual(o.room_id, n.room_id)) {
      ch.push({ label: "Zimmer (ID)", old: formatAuditScalar(o.room_id), new: formatAuditScalar(n.room_id) });
    }
    return {
      summary: ch.length ? "Zuordnung bearbeitet" : "Zuordnung bearbeitet",
      changes: ch.length ? ch : [{ label: "Zuordnung", old: "—", new: "Bearbeitet" }],
    };
  }
  if (a === "create" && (nv.inventory_number != null || nv.name != null) && !nv.inventory_assignment) {
    return {
      summary: `Artikel erstellt · ${nv.inventory_number || nv.name || ""}`.trim(),
      changes: [],
    };
  }
  if (a === "delete" && (ov.inventory_number != null || ov.name != null) && !ov.inventory_assignment) {
    /** Full `model_snapshot` exists on delete; surface core identifying fields for auditability. */
    const skip = new Set(["id", "organization_id", "created_at", "updated_at", "inventory_assignment"]);
    const priority = [
      "inventory_number",
      "name",
      "category",
      "supplier_article_number",
      "brand",
      "purchase_price_chf",
      "purchase_date",
      "total_quantity",
      "condition",
      "status",
      "purchased_from",
      "product_url",
      "notes",
    ];
    const seen = new Set();
    /** @type {AuditChange[]} */
    const changes = [];
    for (const k of priority) {
      if (!Object.prototype.hasOwnProperty.call(ov, k) || skip.has(k)) continue;
      seen.add(k);
      const lbl = invLabels[k] || getAuditFieldLabel("inventory_item", k);
      changes.push({
        label: lbl,
        old: formatAuditScalar(ov[k]),
        new: "—",
      });
    }
    for (const k of Object.keys(ov)) {
      if (skip.has(k) || seen.has(k) || k === "inventory_assignment") continue;
      if (!invLabels[k]) continue;
      seen.add(k);
      const lbl = invLabels[k] || getAuditFieldLabel("inventory_item", k);
      changes.push({ label: lbl, old: formatAuditScalar(ov[k]), new: "—" });
    }
    const num = ov.inventory_number != null ? String(ov.inventory_number).trim() : "";
    const nm = ov.name != null ? String(ov.name).trim() : "";
    const summary =
      num || nm
        ? `Artikel gelöscht${num ? ` · ${num}` : ""}${nm ? ` · ${nm}` : ""}`
        : "Artikel gelöscht";
    return { summary, changes };
  }
  if (a === "update") {
    const keys = [...new Set([...Object.keys(ov), ...Object.keys(nv)])].filter(
      (k) =>
        k !== "inventory_assignment" &&
        k !== "created_at" &&
        k !== "updated_at" &&
        k !== "id" &&
        k !== "organization_id"
    );
    /** @type {AuditChange[]} */
    const changes = [];
    for (const k of keys) {
      if (auditValuesEqual(ov[k], nv[k])) continue;
      const lbl = invLabels[k] || k;
      changes.push({
        label: lbl,
        old: formatAuditScalar(ov[k]),
        new: formatAuditScalar(nv[k]),
      });
    }
    const changedKeys = keys.filter((k) => !auditValuesEqual(ov[k], nv[k]));
    let summary;
    if (changedKeys.length === 1) {
      const k = changedKeys[0];
      const lbl = invLabels[k] || k;
      summary = `${lbl}: ${formatAuditScalar(ov[k])} → ${formatAuditScalar(nv[k])}`;
    } else if (changedKeys.length > 1) {
      summary = "Artikel bearbeitet";
    } else {
      summary = "Bearbeitet";
    }
    return { summary, changes };
  }
  return {
    summary:
      a === "create"
        ? "Artikel erstellt"
        : a === "delete"
          ? "Eintrag gelöscht"
          : a === "update"
            ? "Bearbeitet"
            : String(log.action || "—"),
    changes: [],
  };
}

function formatLandlordAuditValue(field, value, userNameById) {
  if (field === "deleted_at") {
    return value == null || value === "" ? "Aktiv" : "Archiviert";
  }
  if (field === "status") {
    if (value == null || value === "") return "—";
    const s = String(value).toLowerCase();
    return s === "inactive" ? "Inaktiv" : "Aktiv";
  }
  if (field === "user_id") {
    return resolveAuditFkDisplay(value, userNameById || {});
  }
  if (value == null || value === "") return "—";
  return String(value);
}

function formatPmAuditValue(field, value, landlordNameById) {
  if (field === "status") {
    if (value == null || value === "") return "—";
    const s = String(value).toLowerCase();
    return s === "inactive" ? "Inaktiv" : "Aktiv";
  }
  if (field === "landlord_id") {
    return resolveAuditFkDisplay(value, landlordNameById || {});
  }
  if (value == null || value === "") return "—";
  return String(value);
}

function formatOwnerAuditValue(field, value) {
  if (value == null || value === "") return "—";
  if (field === "status") {
    const s = String(value).toLowerCase();
    return s === "inactive" ? "Inaktiv" : "Aktiv";
  }
  return String(value);
}

/**
 * Full diff for simple entity logs (landlord, property_manager, owner flat updates).
 * @param {string} entityType
 * @param {(field: string, value: unknown) => string} formatValue
 */
function buildGenericEntityChanges(ov, nv, entityType, formatValue) {
  const keys = [...new Set([...Object.keys(ov), ...Object.keys(nv)])];
  /** @type {AuditChange[]} */
  const changes = [];
  for (const k of keys) {
    if (auditValuesEqual(ov[k], nv[k])) continue;
    changes.push({
      label: getAuditFieldLabel(entityType, k),
      old: formatValue(k, ov[k]),
      new: formatValue(k, nv[k]),
    });
  }
  return changes;
}

function inferEntityType(log) {
  const t = log.target_type ?? log.entity_type ?? log.targetType;
  return t != null ? String(t) : "";
}

/**
 * Full unit delete with flat model_snapshot (not room/tenancy nested payloads).
 * @returns {{ summary: string, changes: AuditChange[] } | null}
 */
function tryFormatUnitFlatDelete(log, resolvers) {
  const ov =
    log.old_values != null && typeof log.old_values === "object" && !Array.isArray(log.old_values)
      ? log.old_values
      : null;
  if (!ov) return null;
  if (ov.room || ov.tenancy || ov.tenancy_revenue || ov.unit_cost || ov.unit_document) return null;

  const unitLabels = ENTITY_AUDIT_LABELS.unit || {};
  const skip = new Set([
    "id",
    "organization_id",
    "created_at",
    "updated_at",
  ]);
  const priority = [
    "title",
    "address",
    "postal_code",
    "city",
    "type",
    "rooms",
    "tenant_price_monthly_chf",
    "landlord_rent_monthly_chf",
    "occupancy_status",
  ];
  const seen = new Set();
  /** @type {AuditChange[]} */
  const changes = [];
  for (const k of priority) {
    if (!Object.prototype.hasOwnProperty.call(ov, k) || skip.has(k)) continue;
    seen.add(k);
    const lbl = unitLabels[k] || k;
    changes.push({
      label: lbl,
      old: formatUnitAuditFieldValue(k, ov[k], resolvers),
      new: "—",
    });
  }
  for (const k of Object.keys(ov)) {
    if (skip.has(k) || seen.has(k)) continue;
    if (!unitLabels[k]) continue;
    seen.add(k);
    changes.push({
      label: unitLabels[k],
      old: formatUnitAuditFieldValue(k, ov[k], resolvers),
      new: "—",
    });
  }
  const title = String(ov.title || "").trim();
  const city = String(ov.city || "").trim();
  const pc = String(ov.postal_code || "").trim();
  const place = [pc, city].filter(Boolean).join(" ");
  const summary =
    title || place
      ? `Einheit gelöscht${title ? ` · ${title}` : ""}${place ? ` · ${place}` : ""}`
      : "Einheit gelöscht";
  return { summary, changes };
}

/**
 * Tenant row delete (model_snapshot); skips tenancy/revenue/document-specific payloads.
 * @returns {{ summary: string, changes: AuditChange[] } | null}
 */
function tryFormatTenantFlatDelete(log) {
  const ov =
    log.old_values != null && typeof log.old_values === "object" && !Array.isArray(log.old_values)
      ? log.old_values
      : null;
  if (!ov) return null;
  if (ov.tenancy || ov.tenancy_revenue || ov.document_uploaded != null || ov.document_deleted != null) {
    return null;
  }

  const fn = String(ov.first_name || "").trim();
  const ln = String(ov.last_name || "").trim();
  const legacy = String(ov.name || "").trim();
  const displayName =
    [fn, ln].filter(Boolean).join(" ") || legacy || String(ov.email || "").trim() || "—";

  const skip = new Set(["id", "organization_id", "created_at", "updated_at", "room_id"]);
  const priority = [
    "first_name",
    "last_name",
    "name",
    "email",
    "phone",
    "company",
    "street",
    "postal_code",
    "city",
    "country",
  ];
  const seen = new Set();
  /** @type {AuditChange[]} */
  const changes = [];
  for (const k of priority) {
    if (!Object.prototype.hasOwnProperty.call(ov, k) || skip.has(k)) continue;
    seen.add(k);
    changes.push({
      label: getAuditFieldLabel("tenant", k),
      old: formatAuditScalar(ov[k]),
      new: "—",
    });
  }
  const tenantLabels = ENTITY_AUDIT_LABELS.tenant || {};
  for (const k of Object.keys(ov)) {
    if (skip.has(k) || seen.has(k)) continue;
    if (!tenantLabels[k]) continue;
    changes.push({
      label: getAuditFieldLabel("tenant", k),
      old: formatAuditScalar(ov[k]),
      new: "—",
    });
  }
  return {
    summary: `Mieter gelöscht · ${displayName}`,
    changes,
  };
}

/**
 * Main entry: human summary + structured field changes.
 * @param {object} log
 * @param {object} [context]
 * @param {string} [context.entityType] - unit | inventory_item | landlord | property_manager | tenant | owner
 * @param {object} [context.resolvers] - unit: landlordById, pmById, etc.
 * @param {Map} [context.unitById] - inventory
 * @param {object} [context.userNameById] - landlord user fk
 * @param {object} [context.landlordNameById] - pm fk
 */
export function formatAuditLog(log, context = {}) {
  const entityType = context.entityType || inferEntityType(log);
  const action = String(log.action || "").toLowerCase();
  const resolvers = context.resolvers || {};

  if (entityType === "unit" && action === "delete") {
    const flatUnit = tryFormatUnitFlatDelete(log, resolvers);
    if (flatUnit) return flatUnit;
  }
  if (entityType === "tenant" && action === "delete") {
    const flatTenant = tryFormatTenantFlatDelete(log);
    if (flatTenant) return flatTenant;
  }

  if (entityType === "unit") {
    const lines = getAuditEntryDisplayLines(log, context.resolvers || {});
    const flatChanges = buildUnitFlatFieldChangesFixed(log, context.resolvers || {});
    const changes =
      action === "update" && flatChanges.length > 0 ? flatChanges : linesToChanges(lines.slice(1));
    return {
      summary: lines[0] || auditActionLabel(log.action),
      changes,
    };
  }

  if (entityType === "inventory_item") {
    return formatInventoryAuditResult(log, context.unitById);
  }

  if (entityType === "landlord") {
    const action = String(log.action || "").toLowerCase();
    if (action === "create") {
      return { summary: "Verwaltung angelegt", changes: [] };
    }
    const ov = log.old_values && typeof log.old_values === "object" ? log.old_values : {};
    const nv = log.new_values && typeof log.new_values === "object" ? log.new_values : {};
    const changes = buildGenericEntityChanges(ov, nv, "landlord", (k, v) =>
      formatLandlordAuditValue(k, v, context.userNameById)
    );
    const summary =
      changes.length === 1
        ? `${changes[0].label} geändert: ${changes[0].old} → ${changes[0].new}`
        : changes.length > 1
          ? "Verwaltung bearbeitet"
          : "Eintrag";
    return { summary, changes };
  }

  if (entityType === "property_manager") {
    const action = String(log.action || "").toLowerCase();
    if (action === "create") {
      return { summary: "Bewirtschafter angelegt", changes: [] };
    }
    const ov = log.old_values && typeof log.old_values === "object" ? log.old_values : {};
    const nv = log.new_values && typeof log.new_values === "object" ? log.new_values : {};
    const changes = buildGenericEntityChanges(ov, nv, "property_manager", (k, v) =>
      formatPmAuditValue(k, v, context.landlordNameById)
    );
    const summary =
      changes.length === 1
        ? `${changes[0].label} geändert: ${changes[0].old} → ${changes[0].new}`
        : changes.length > 1
          ? "Bewirtschafter bearbeitet"
          : "Eintrag";
    return { summary, changes };
  }

  if (entityType === "owner") {
    const action = String(log.action || "").toLowerCase();
    if (action === "create") {
      return { summary: "Eigentümer angelegt", changes: [] };
    }
    const ov = log.old_values && typeof log.old_values === "object" ? log.old_values : {};
    const nv = log.new_values && typeof log.new_values === "object" ? log.new_values : {};
    if (
      nv.document_uploaded != null &&
      String(nv.document_uploaded).trim() !== ""
    ) {
      return {
        summary: `Dokument hochgeladen: ${String(nv.document_uploaded)}`,
        changes: [],
      };
    }
    if (ov.document_deleted != null && String(ov.document_deleted).trim() !== "") {
      return {
        summary: `Dokument gelöscht: ${String(ov.document_deleted)}`,
        changes: [],
      };
    }
    const changes = buildGenericEntityChanges(ov, nv, "owner", (k, v) => formatOwnerAuditValue(k, v));
    const summary =
      changes.length === 1
        ? `${changes[0].label} geändert: ${changes[0].old} → ${changes[0].new}`
        : changes.length > 1
          ? "Eigentümer bearbeitet"
          : "Eintrag";
    return { summary, changes };
  }

  if (entityType === "tenant") {
    const action = String(log.action || "").toLowerCase();
    const nv = log.new_values && typeof log.new_values === "object" ? log.new_values : {};
    const ov = log.old_values && typeof log.old_values === "object" ? log.old_values : {};

    if (nv.document_uploaded != null && String(nv.document_uploaded).trim() !== "") {
      return {
        summary: `Dokument hochgeladen: ${String(nv.document_uploaded)}`,
        changes: [],
      };
    }
    if (ov.document_deleted != null && String(ov.document_deleted).trim() !== "") {
      return {
        summary: `Dokument gelöscht: ${String(ov.document_deleted)}`,
        changes: [],
      };
    }

    if (nv.tenancy || ov.tenancy) {
      if (action === "create" && nv.tenancy && typeof nv.tenancy === "object") {
        const t = nv.tenancy;
        const end = t.display_end_date || t.move_out_date;
        return {
          summary: `Mietverhältnis erstellt · Einzug ${formatAuditIsoDateDe(t.move_in_date)} · Ende ${formatAuditIsoDateDe(end)} · ${formatChfPlain(t.monthly_rent)}/Monat`,
          changes: [],
        };
      }
      if (action === "delete" && ov.tenancy && typeof ov.tenancy === "object") {
        const t = ov.tenancy;
        return {
          summary: `Mietverhältnis gelöscht · Einzug ${formatAuditIsoDateDe(t.move_in_date)}`,
          changes: [],
        };
      }
      if (action === "update" && ov.tenancy && nv.tenancy) {
        const o = ov.tenancy;
        const n = nv.tenancy;
        /** @type {AuditChange[]} */
        const changes = [];
        if (String(o.termination_effective_date || "") !== String(n.termination_effective_date || "")) {
          changes.push({
            label: "Kündigung wirksam",
            old: formatAuditIsoDateDe(o.termination_effective_date),
            new: formatAuditIsoDateDe(n.termination_effective_date),
          });
        }
        if (String(o.display_end_date || "") !== String(n.display_end_date || "")) {
          changes.push({
            label: "Mietende",
            old: formatAuditIsoDateDe(o.display_end_date),
            new: formatAuditIsoDateDe(n.display_end_date),
          });
        }
        if (String(o.display_status || "") !== String(n.display_status || "")) {
          changes.push({
            label: "Status",
            old: tenancyDisplayStatusLabelDeUnit(o.display_status),
            new: tenancyDisplayStatusLabelDeUnit(n.display_status),
          });
        }
        return {
          summary: changes.length ? `Mietverhältnis bearbeitet: ${changes.map((c) => `${c.label}`).join(", ")}` : "Mietverhältnis bearbeitet",
          changes,
        };
      }
    }

    const rN = nv.tenancy_revenue;
    const rO = ov.tenancy_revenue;
    if (rN || rO) {
      if (action === "create" && rN) {
        return {
          summary: `Einnahme hinzugefügt: ${revenueTypeLabelForDisplay(rN.type)}, ${formatChfPlain(rN.amount_chf)}, ${revenueFrequencyLabel(rN.frequency).toLowerCase()}`,
          changes: [],
        };
      }
      if (action === "delete" && rO) {
        return {
          summary: `Einnahme gelöscht: ${revenueTypeLabelForDisplay(rO.type)}, ${formatChfPlain(rO.amount_chf)}, ${revenueFrequencyLabel(rO.frequency).toLowerCase()}`,
          changes: [],
        };
      }
      if (action === "update" && rO && rN) {
        return {
          summary: `Einnahme bearbeitet: ${revenueTypeLabelForDisplay(rN.type)}, ${formatChfPlain(rN.amount_chf)}, ${revenueFrequencyLabel(rN.frequency).toLowerCase()}`,
          changes: [],
        };
      }
    }

    const flat = buildGenericEntityChanges(ov, nv, "tenant", (k, v) => formatAuditScalar(v));
    return {
      summary: flat.length === 1 ? `${flat[0].label}: ${flat[0].old} → ${flat[0].new}` : "Mieter bearbeitet",
      changes: flat,
    };
  }

  const ov = log.old_values && typeof log.old_values === "object" ? log.old_values : {};
  const nv = log.new_values && typeof log.new_values === "object" ? log.new_values : {};
  const changes = buildGenericEntityChanges(ov, nv, entityType || "generic", (k, v) =>
    formatAuditScalar(v)
  );
  return {
    summary:
      changes.length > 0
        ? `${auditActionLabel(log.action)} · ${changes.length} Feld(er)`
        : auditActionLabel(log.action),
    changes,
  };
}
