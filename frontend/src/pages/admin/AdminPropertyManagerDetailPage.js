import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  createAdminPropertyManagerNote,
  fetchAdminAuditLogs,
  fetchAdminLandlord,
  fetchAdminLandlords,
  fetchAdminPropertyManager,
  fetchAdminPropertyManagerNotes,
  fetchAdminPropertyManagerUnits,
  normalizeUnit,
  patchAdminPropertyManager,
} from "../../api/adminData";
import { COMMON_AUDIT_FIELD_LABELS } from "../../utils/auditFieldLabels";
import { resolveAuditFkDisplay } from "../../utils/auditFkDisplay";
import { normalizeUnitTypeLabel } from "../../utils/unitDisplayId";

function landlordLabel(l) {
  if (!l) return "";
  const c = String(l.company_name || "").trim();
  const n = String(l.contact_name || "").trim();
  if (c && n) return `${c} — ${n}`;
  return c || n || String(l.email || "").trim() || l.id;
}

function formatChfMonthly(value) {
  const n = Number(value);
  if (Number.isNaN(n)) return "—";
  return `CHF ${n.toLocaleString("de-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function unitTypeBadgeClasses(type) {
  const raw = String(type ?? "").trim();
  const normalized = normalizeUnitTypeLabel(raw);
  if (normalized === "Co-Living") {
    return "border-sky-500/20 bg-sky-500/10 text-sky-300";
  }
  if (raw === "Business Apartment") {
    return "border-purple-500/20 bg-purple-500/10 text-purple-300";
  }
  return "border-white/[0.08] bg-white/[0.05] text-[#6b7a9a]";
}

function unitStatusBadgeClasses(status) {
  const s = String(status ?? "").trim().toLowerCase();
  if (s === "frei" || s === "") return "border-green-500/20 bg-green-500/10 text-green-400";
  if (s === "belegt" || s === "occupied") return "border-blue-500/20 bg-blue-500/10 text-blue-300";
  if (s === "reserviert" || s === "reserved") return "border-amber-500/20 bg-amber-500/10 text-amber-400";
  return "border-white/[0.08] bg-white/[0.05] text-[#6b7a9a]";
}

function formatDateTime(iso) {
  if (!iso) return "—";
  const normalized = /Z|[+-]\d{2}:\d{2}$/.test(iso) ? iso : `${iso}Z`;
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("de-CH", {
    timeZone: "Europe/Zurich",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

const PM_FIELD_LABELS = {
  ...COMMON_AUDIT_FIELD_LABELS,
  landlord_id: "Verwaltung",
};

function formatPmAuditDisplayValue(field, value, landlordNameById) {
  if (field === "status") {
    if (value == null || value === "") return "—";
    const s = String(value).toLowerCase();
    return s === "inactive" ? "Inaktiv" : "Aktiv";
  }
  if (field === "landlord_id") {
    return resolveAuditFkDisplay(value, landlordNameById);
  }
  if (value == null || value === "") return "—";
  return String(value);
}

function AdminPropertyManagerDetailPage() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [pm, setPm] = useState(null);
  /** undefined = not loaded yet; null = missing / not found */
  const [landlordRow, setLandlordRow] = useState(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [units, setUnits] = useState([]);
  const [unitsLoading, setUnitsLoading] = useState(true);
  const [unitsError, setUnitsError] = useState(null);
  const [statusSaving, setStatusSaving] = useState(false);
  const [notes, setNotes] = useState([]);
  const [notesLoading, setNotesLoading] = useState(true);
  const [newNoteDraft, setNewNoteDraft] = useState("");
  const [newNoteSaving, setNewNoteSaving] = useState(false);
  const [newNoteErr, setNewNoteErr] = useState(null);
  const [newNoteSubmitErr, setNewNoteSubmitErr] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditLoading, setAuditLoading] = useState(true);
  const [auditError, setAuditError] = useState(null);
  /** landlord id -> display label for audit FK resolution */
  const [landlordNameById, setLandlordNameById] = useState({});
  const [editOpen, setEditOpen] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editErr, setEditErr] = useState(null);
  const [editForm, setEditForm] = useState({
    name: "",
    email: "",
    phone: "",
    landlord_id: "",
    status: "active",
  });
  const [landlordsForEdit, setLandlordsForEdit] = useState([]);
  const [landlordsEditLoading, setLandlordsEditLoading] = useState(false);

  const landlordIdsFromAudit = useMemo(() => {
    const ids = new Set();
    if (pm?.landlord_id) ids.add(String(pm.landlord_id));
    for (const log of auditLogs) {
      if (log.action !== "update") continue;
      const ov = log.old_values && typeof log.old_values === "object" ? log.old_values : {};
      const nv = log.new_values && typeof log.new_values === "object" ? log.new_values : {};
      if (Object.prototype.hasOwnProperty.call(ov, "landlord_id") && ov.landlord_id != null && String(ov.landlord_id).trim()) {
        ids.add(String(ov.landlord_id));
      }
      if (Object.prototype.hasOwnProperty.call(nv, "landlord_id") && nv.landlord_id != null && String(nv.landlord_id).trim()) {
        ids.add(String(nv.landlord_id));
      }
    }
    return [...ids];
  }, [auditLogs, pm?.landlord_id]);

  useEffect(() => {
    if (!landlordIdsFromAudit.length) return;
    let cancelled = false;

    landlordIdsFromAudit.forEach((lid) => {
      if (!lid) return;
      if (landlordRow && String(landlordRow.id) === lid) {
        const label = landlordLabel(landlordRow);
        if (!label) return;
        setLandlordNameById((prev) => (prev[lid] === label ? prev : { ...prev, [lid]: label }));
        return;
      }
      fetchAdminLandlord(lid)
        .then((row) => {
          if (cancelled || !row) return;
          const label = landlordLabel(row);
          if (!label) return;
          setLandlordNameById((prev) => (prev[lid] === label ? prev : { ...prev, [lid]: label }));
        })
        .catch(() => {});
    });

    return () => {
      cancelled = true;
    };
  }, [landlordIdsFromAudit, landlordRow]);

  const loadAuditLogs = useCallback(
    (opts = {}) => {
      const silent = opts.silent === true;
      if (!id) return Promise.resolve();
      if (!silent) {
        setAuditLoading(true);
        setAuditError(null);
      }
      return fetchAdminAuditLogs({ entity_type: "property_manager", entity_id: id })
        .then((r) => {
          const items = Array.isArray(r?.items) ? r.items : [];
          setAuditLogs(items);
        })
        .catch(() => {
          if (!silent) {
            setAuditError("Verlauf konnte nicht geladen werden.");
            setAuditLogs([]);
          }
        })
        .finally(() => {
          if (!silent) setAuditLoading(false);
        });
    },
    [id]
  );

  useEffect(() => {
    loadAuditLogs();
  }, [loadAuditLogs, location.key]);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError("");
    fetchAdminPropertyManager(id)
      .then((row) => {
        if (!row) {
          setError("Bewirtschafter nicht gefunden.");
          setPm(null);
          setLandlordRow(undefined);
          return;
        }
        setPm(row);
        const lid = row.landlord_id;
        if (lid) {
          setLandlordRow(undefined);
          fetchAdminLandlord(lid)
            .then((ll) => setLandlordRow(ll ?? null))
            .catch(() => setLandlordRow(null));
        } else {
          setLandlordRow(null);
        }
      })
      .catch(() => {
        setError("Bewirtschafter konnte nicht geladen werden.");
        setPm(null);
        setLandlordRow(undefined);
      })
      .finally(() => setLoading(false));
  }, [id, location.key]);

  useEffect(() => {
    if (!id) return;
    setUnitsLoading(true);
    setUnitsError(null);
    fetchAdminPropertyManagerUnits(id)
      .then((data) => {
        const arr = Array.isArray(data) ? data : [];
        setUnits(arr.map((u) => normalizeUnit(u)));
      })
      .catch((e) => {
        setUnits([]);
        setUnitsError(e?.message?.trim() || "Units konnten nicht geladen werden.");
      })
      .finally(() => setUnitsLoading(false));
  }, [id]);

  useEffect(() => {
    if (!id) return;
    setNotesLoading(true);
    fetchAdminPropertyManagerNotes(id)
      .then((data) => {
        const items = data && Array.isArray(data.items) ? data.items : [];
        setNotes(items);
      })
      .catch(() => setNotes([]))
      .finally(() => setNotesLoading(false));
  }, [id]);

  if (loading) {
    return (
      <p className="min-h-[40vh] bg-[#07090f] px-2 py-8 text-[#6b7a9a]">Lade Bewirtschafter …</p>
    );
  }

  if (error || !pm) {
    return (
      <div className="max-w-3xl bg-[#07090f] px-2 py-6 text-[#eef2ff]">
        <p className="mb-3 text-[#f87171]">{error || "Nicht gefunden."}</p>
        <button
          type="button"
          onClick={() => navigate("/admin/bewirtschafter")}
          className="rounded-[8px] border border-white/[0.1] bg-transparent px-4 py-2 text-sm font-semibold text-[#8090b0] hover:bg-white/[0.04]"
        >
          Zurück zur Liste
        </button>
      </div>
    );
  }

  const displayName = String(pm.name || "").trim() || "Bewirtschafter";
  const isPmActive = String(pm.status || "active").toLowerCase() !== "inactive";

  const saveNewNote = () => {
    if (!id) return;
    const raw = String(newNoteDraft || "").trim();
    if (!raw) {
      setNewNoteErr("Bitte eine Notiz eingeben.");
      return;
    }
    setNewNoteErr(null);
    setNewNoteSubmitErr(null);
    setNewNoteSaving(true);
    createAdminPropertyManagerNote(id, raw)
      .then(() => {
        setNewNoteDraft("");
        return fetchAdminPropertyManagerNotes(id);
      })
      .then((data) => {
        const items = data && Array.isArray(data.items) ? data.items : [];
        setNotes(items);
      })
      .catch((err) => {
        setNewNoteSubmitErr(err?.message || "Notiz konnte nicht gespeichert werden.");
      })
      .finally(() => setNewNoteSaving(false));
  };

  const openEditModal = () => {
    if (!pm) return;
    setEditErr(null);
    setEditForm({
      name: pm.name || "",
      email: pm.email || "",
      phone: pm.phone || "",
      landlord_id: pm.landlord_id || "",
      status: String(pm.status || "active").toLowerCase() === "inactive" ? "inactive" : "active",
    });
    setEditOpen(true);
    setLandlordsEditLoading(true);
    fetchAdminLandlords()
      .then((lls) => setLandlordsForEdit(Array.isArray(lls) ? lls : []))
      .catch(() => setLandlordsForEdit([]))
      .finally(() => setLandlordsEditLoading(false));
  };

  const submitEdit = () => {
    if (!id) return;
    const name = editForm.name.trim();
    if (!name) {
      setEditErr("Name ist erforderlich.");
      return;
    }
    setEditSaving(true);
    setEditErr(null);
    patchAdminPropertyManager(id, {
      name,
      email: editForm.email.trim() || null,
      phone: editForm.phone.trim() || null,
      landlord_id: editForm.landlord_id.trim() || null,
      status: editForm.status === "inactive" ? "inactive" : "active",
    })
      .then(() => fetchAdminPropertyManager(id))
      .then((row) => {
        if (!row) return;
        setPm(row);
        const lid = row.landlord_id;
        if (lid) {
          setLandlordRow(undefined);
          return fetchAdminLandlord(lid).then((ll) => setLandlordRow(ll ?? null));
        }
        setLandlordRow(null);
      })
      .then(() => loadAuditLogs({ silent: true }))
      .then(() => setEditOpen(false))
      .catch((e) => setEditErr(e?.message || "Speichern fehlgeschlagen."))
      .finally(() => setEditSaving(false));
  };

  const handleToggleStatus = () => {
    if (!id) return;
    const next = isPmActive ? "inactive" : "active";
    const msg =
      next === "inactive"
        ? "Diesen Bewirtschafter wirklich als inaktiv markieren?"
        : "Diesen Bewirtschafter wieder aktivieren?";
    if (!window.confirm(msg)) return;
    setStatusSaving(true);
    patchAdminPropertyManager(id, { status: next })
      .then(() => fetchAdminPropertyManager(id))
      .then((row) => {
        if (row) setPm(row);
      })
      .then(() => loadAuditLogs({ silent: true }))
      .catch((e) => {
        window.alert(e?.message || "Status konnte nicht geändert werden.");
      })
      .finally(() => setStatusSaving(false));
  };

  return (
    <div className="min-h-screen max-w-3xl bg-[#07090f] px-2 py-6 text-[#eef2ff]">
      <p className="mb-4">
        <Link
          to="/admin/bewirtschafter"
          className="text-sm font-semibold text-[#7aaeff] hover:underline"
        >
          ← Bewirtschafter
        </Link>
      </p>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 gap-y-2">
            <h1 className="text-[22px] font-bold tracking-tight text-[#eef2ff]">{displayName}</h1>
            <span
              className={
                isPmActive
                  ? "inline-flex items-center rounded-full border border-green-500/20 bg-green-500/10 px-2.5 py-0.5 text-[10px] font-bold text-green-400"
                  : "inline-flex items-center rounded-full border border-white/[0.08] bg-white/[0.05] px-2.5 py-0.5 text-[10px] font-bold text-[#6b7a9a]"
              }
            >
              {isPmActive ? "Aktiv" : "Inaktiv"}
            </span>
          </div>
          <p className="mt-1 text-[12px] text-[#6b7a9a]">Bewirtschafter / Property Manager</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={openEditModal}
            className="inline-flex items-center rounded-[8px] border border-white/[0.1] bg-transparent px-3 py-2 text-sm font-semibold text-[#8090b0] hover:bg-white/[0.04]"
          >
            Bearbeiten
          </button>
          <button
            type="button"
            disabled={statusSaving}
            onClick={handleToggleStatus}
            className={
              isPmActive
                ? "inline-flex items-center rounded-[8px] border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm font-semibold text-[#f87171] hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-60"
                : "inline-flex items-center rounded-[8px] border-none bg-gradient-to-r from-[#5b8cff] to-[#7c5cfc] px-3 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
            }
          >
            {statusSaving
              ? "…"
              : isPmActive
                ? "Als inaktiv markieren"
                : "Aktivieren"}
          </button>
        </div>
      </div>

      <section className="mb-4 rounded-[14px] border border-white/[0.07] bg-[#141824] p-5 md:p-6">
        <h2 className="mb-4 text-[9px] font-bold uppercase tracking-[1px] text-[#6b7a9a]">Stammdaten</h2>
        <div className="space-y-4">
          <div>
            <p className="text-[10px] text-[#6b7a9a]">Name</p>
            <p className="mt-1 text-[13px] font-medium text-[#eef2ff]">{displayName}</p>
          </div>
          <div>
            <p className="text-[10px] text-[#6b7a9a]">E-Mail</p>
            <p className="mt-1 text-[13px] font-medium text-[#eef2ff]">{pm.email?.trim() || "—"}</p>
          </div>
          <div>
            <p className="text-[10px] text-[#6b7a9a]">Telefonnummer</p>
            <p className="mt-1 text-[13px] font-medium text-[#eef2ff]">{pm.phone?.trim() || "—"}</p>
          </div>
        </div>
      </section>

      <section className="mb-4 rounded-[14px] border border-white/[0.07] bg-[#141824] p-5 md:p-6">
        <h2 className="mb-4 text-[9px] font-bold uppercase tracking-[1px] text-[#6b7a9a]">
          Zugeordnete Verwaltung
        </h2>
        {!pm.landlord_id ? (
          <p className="text-sm text-[#6b7a9a]">Keine Verwaltung zugeordnet</p>
        ) : landlordRow === undefined ? (
          <p className="text-sm text-[#6b7a9a]">Lade Verwaltung …</p>
        ) : landlordRow ? (
          <div>
            <Link
              to={`/admin/landlords/${encodeURIComponent(pm.landlord_id)}`}
              className="text-sm font-semibold text-[#7aaeff] underline-offset-2 hover:underline"
            >
              {landlordLabel(landlordRow)}
            </Link>
          </div>
        ) : (
          <p className="text-sm text-[#6b7a9a]">
            Die zugeordnete Verwaltung konnte nicht geladen werden.
          </p>
        )}
      </section>

      <section className="mb-4 rounded-[14px] border border-white/[0.07] bg-[#141824] p-5 md:p-6">
        <h2 className="mb-4 text-[9px] font-bold uppercase tracking-[1px] text-[#6b7a9a]">Notizen</h2>
        <form
          className="mb-6"
          onSubmit={(e) => {
            e.preventDefault();
            saveNewNote();
          }}
        >
          <label htmlFor="pm-new-note" className="mb-1.5 block text-[10px] text-[#6b7a9a]">
            Neue Notiz
          </label>
          <textarea
            id="pm-new-note"
            value={newNoteDraft}
            onChange={(e) => {
              setNewNoteDraft(e.target.value);
              setNewNoteErr(null);
            }}
            disabled={newNoteSaving}
            placeholder="Interne Notiz …"
            rows={3}
            className="w-full rounded-[8px] border border-white/[0.08] bg-[#111520] px-3 py-2 text-sm text-[#eef2ff] placeholder:text-[#6b7a9a]/70 focus:outline-none focus:ring-2 focus:ring-[#7aaeff]/30 disabled:opacity-60"
          />
          {newNoteErr ? <p className="mt-2 text-sm text-[#f87171]">{newNoteErr}</p> : null}
          {newNoteSubmitErr ? <p className="mt-2 text-sm text-[#f87171]">{newNoteSubmitErr}</p> : null}
          <div className="mt-3">
            <button
              type="submit"
              disabled={newNoteSaving}
              className="inline-flex items-center rounded-[8px] border-none bg-gradient-to-r from-[#5b8cff] to-[#7c5cfc] px-3.5 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {newNoteSaving ? "Speichern …" : "Notiz speichern"}
            </button>
          </div>
        </form>
        <div className="border-t border-white/[0.05] pt-5">
          <p className="mb-3 text-[10px] text-[#6b7a9a]">Alle Notizen</p>
          {notesLoading ? (
            <p className="text-sm text-[#6b7a9a]">Lade Notizen …</p>
          ) : !notes.length ? (
            <p className="text-sm text-[#6b7a9a]">Noch keine Notizen vorhanden.</p>
          ) : (
            <ul className="space-y-4">
              {notes.map((n) => (
                <li
                  key={n.id}
                  className="border-b border-white/[0.05] pb-4 last:border-0 last:pb-0"
                >
                  <div className="rounded-[10px] bg-[#111520] p-3">
                    <p className="whitespace-pre-wrap text-sm text-[#eef2ff]">{n.content}</p>
                    <p className="mt-2 text-xs text-[#6b7a9a]">
                      {formatDateTime(n.created_at)} · {n.author_name || "—"}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="mb-4 rounded-[14px] border border-white/[0.07] bg-[#141824] p-5 md:p-6">
        <h2 className="mb-4 text-[9px] font-bold uppercase tracking-[1px] text-[#6b7a9a]">Historie</h2>
        <p className="mb-3 text-[10px] text-[#6b7a9a]">
          Änderungen an Stammdaten (wer, wann, welches Feld).
        </p>
        {auditLoading ? (
          <p className="text-sm text-[#6b7a9a]">Lade Verlauf …</p>
        ) : auditError ? (
          <p className="text-sm text-[#f87171]">{auditError}</p>
        ) : auditLogs.length === 0 ? (
          <p className="text-sm text-[#6b7a9a]">Noch keine Einträge im Audit-Protokoll.</p>
        ) : (
          <ul className="ml-1 space-y-4 border-l-2 border-white/[0.08] pl-4">
            {auditLogs.map((log) => {
              const actor =
                (log.actor_name && String(log.actor_name).trim()) ||
                (log.actor_email && String(log.actor_email).trim()) ||
                null;
              const actorSuffix = actor ? ` · ${actor}` : "";

              if (log.action === "create") {
                return (
                  <li key={log.id}>
                    <p className="text-sm font-medium text-[#eef2ff]">Bewirtschafter angelegt</p>
                    <p className="mt-0.5 text-xs text-[#6b7a9a]">
                      {formatDateTime(log.created_at)}
                      {actorSuffix}
                    </p>
                  </li>
                );
              }

              const ov = log.old_values && typeof log.old_values === "object" ? log.old_values : {};
              const nv = log.new_values && typeof log.new_values === "object" ? log.new_values : {};
              const keys = [...new Set([...Object.keys(ov), ...Object.keys(nv)])];
              const field = keys[0];
              if (!field) {
                return (
                  <li key={log.id}>
                    <p className="text-sm text-[#eef2ff]">Eintrag</p>
                    <p className="mt-0.5 text-xs text-[#6b7a9a]">
                      {formatDateTime(log.created_at)}
                      {actorSuffix}
                    </p>
                  </li>
                );
              }
              const label = PM_FIELD_LABELS[field] || field;
              const oldD = formatPmAuditDisplayValue(field, ov[field], landlordNameById);
              const newD = formatPmAuditDisplayValue(field, nv[field], landlordNameById);
              return (
                <li key={log.id}>
                  <p className="text-sm text-[#eef2ff]">
                    <span className="font-semibold">{label} geändert:</span>{" "}
                    <span className="font-medium tabular-nums">{oldD}</span>
                    <span className="mx-1 text-[#6b7a9a]">→</span>
                    <span className="font-medium tabular-nums">{newD}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-[#6b7a9a]">
                    {formatDateTime(log.created_at)}
                    {actorSuffix}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mb-4 rounded-[14px] border border-white/[0.07] bg-[#141824] p-5 md:p-6">
        <h2 className="mb-4 text-[9px] font-bold uppercase tracking-[1px] text-[#6b7a9a]">
          Zugeordnete Units
        </h2>
        {unitsLoading ? (
          <div className="space-y-2" aria-busy="true">
            <p className="text-sm text-[#6b7a9a]">Lade Units …</p>
            <div className="h-2 w-full max-w-xs animate-pulse rounded bg-[#111520]" />
            <div className="h-2 w-full max-w-[14rem] animate-pulse rounded bg-[#111520]" />
          </div>
        ) : unitsError ? (
          <p className="text-sm text-[#f87171]">{unitsError}</p>
        ) : units.length === 0 ? (
          <div className="rounded-[10px] border border-dashed border-white/[0.07] bg-[#111520] px-5 py-8 text-center">
            <p className="text-sm font-semibold text-[#eef2ff]">Keine Units zugeordnet</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-[#6b7a9a]">
              Diesem Bewirtschafter sind aktuell keine Units als Ansprechpartner zugewiesen.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {units.map((u) => {
              const uid = u.unitId ?? u.id;
              const title = (u.title || u.name || "").trim() || "—";
              const typeLabel = normalizeUnitTypeLabel(u.type) || String(u.type || "").trim() || "—";
              const addr = String(u.address || "").trim();
              const zip = String(u.zip ?? "").trim();
              const city = String(u.city || "").trim();
              const zipCity = [zip, city].filter(Boolean).join(" ");
              const propTitle = String(u.property_title || "").trim();
              return (
                <li
                  key={String(uid)}
                  className="rounded-[14px] border border-white/[0.07] bg-[#111520] p-4 transition-shadow hover:shadow-lg md:p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <Link
                        to={`/admin/units/${encodeURIComponent(uid)}`}
                        className="rounded-sm text-base font-semibold text-[#7aaeff] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7aaeff]/40"
                      >
                        {title}
                      </Link>
                      {propTitle ? (
                        <p className="mt-1 text-xs text-[#6b7a9a]">Liegenschaft: {propTitle}</p>
                      ) : null}
                      {addr ? <p className="mt-2 text-sm text-[#eef2ff]">{addr}</p> : null}
                      {zipCity ? <p className="text-sm text-[#eef2ff]">{zipCity}</p> : null}
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold ${unitTypeBadgeClasses(u.type)}`}
                      >
                        {typeLabel}
                      </span>
                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold ${unitStatusBadgeClasses(u.status)}`}
                      >
                        {u.status || "—"}
                      </span>
                    </div>
                  </div>
                  <p className="mt-3 border-t border-white/[0.05] pt-3 text-sm text-[#eef2ff]">
                    <span className="text-[#6b7a9a]">Miete (Mieter): </span>
                    <span className="font-semibold tabular-nums text-[#4ade80]">
                      {formatChfMonthly(u.tenantPriceMonthly)}
                    </span>
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {editOpen && (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 p-4"
          onClick={() => !editSaving && setEditOpen(false)}
          role="presentation"
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[14px] border border-white/[0.07] bg-[#141824] p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="pm-edit-title"
          >
            <h2 id="pm-edit-title" className="mb-4 text-lg font-semibold text-[#eef2ff]">
              Bewirtschafter bearbeiten
            </h2>
            {landlordsEditLoading ? (
              <p className="mb-4 text-sm text-[#6b7a9a]">Lade Verwaltungen …</p>
            ) : null}
            <div className="space-y-4">
              <div>
                <label htmlFor="pm-edit-name" className="mb-1 block text-[10px] text-[#6b7a9a]">
                  Name *
                </label>
                <input
                  id="pm-edit-name"
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                  disabled={editSaving}
                  className="w-full rounded-[8px] border border-white/[0.08] bg-[#111520] px-3 py-2 text-sm text-[#eef2ff] disabled:opacity-60"
                />
              </div>
              <div>
                <label htmlFor="pm-edit-email" className="mb-1 block text-[10px] text-[#6b7a9a]">
                  E-Mail
                </label>
                <input
                  id="pm-edit-email"
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                  disabled={editSaving}
                  className="w-full rounded-[8px] border border-white/[0.08] bg-[#111520] px-3 py-2 text-sm text-[#eef2ff] disabled:opacity-60"
                />
              </div>
              <div>
                <label htmlFor="pm-edit-phone" className="mb-1 block text-[10px] text-[#6b7a9a]">
                  Telefon
                </label>
                <input
                  id="pm-edit-phone"
                  type="text"
                  value={editForm.phone}
                  onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                  disabled={editSaving}
                  className="w-full rounded-[8px] border border-white/[0.08] bg-[#111520] px-3 py-2 text-sm text-[#eef2ff] disabled:opacity-60"
                />
              </div>
              <div>
                <label htmlFor="pm-edit-landlord" className="mb-1 block text-[10px] text-[#6b7a9a]">
                  Verwaltung
                </label>
                <select
                  id="pm-edit-landlord"
                  value={editForm.landlord_id}
                  onChange={(e) => setEditForm((f) => ({ ...f, landlord_id: e.target.value }))}
                  disabled={editSaving || landlordsEditLoading}
                  className="w-full rounded-[8px] border border-white/[0.08] bg-[#111520] px-3 py-2 text-sm text-[#eef2ff] disabled:opacity-60"
                >
                  <option value="">—</option>
                  {landlordsForEdit.map((l) => (
                    <option key={l.id} value={l.id}>
                      {landlordLabel(l)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="pm-edit-status" className="mb-1 block text-[10px] text-[#6b7a9a]">
                  Status
                </label>
                <select
                  id="pm-edit-status"
                  value={editForm.status}
                  onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value }))}
                  disabled={editSaving}
                  className="w-full rounded-[8px] border border-white/[0.08] bg-[#111520] px-3 py-2 text-sm text-[#eef2ff] disabled:opacity-60"
                >
                  <option value="active">Aktiv</option>
                  <option value="inactive">Inaktiv</option>
                </select>
              </div>
              {editErr ? <p className="text-sm text-[#f87171]">{editErr}</p> : null}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={submitEdit}
                  disabled={editSaving || landlordsEditLoading}
                  className="flex-1 rounded-[8px] border-none bg-gradient-to-r from-[#5b8cff] to-[#7c5cfc] px-3 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
                >
                  {editSaving ? "Speichern …" : "Speichern"}
                </button>
                <button
                  type="button"
                  disabled={editSaving}
                  onClick={() => setEditOpen(false)}
                  className="rounded-[8px] border border-white/[0.1] bg-transparent px-3 py-2 text-sm font-semibold text-[#8090b0] hover:bg-white/[0.04]"
                >
                  Abbrechen
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminPropertyManagerDetailPage;
