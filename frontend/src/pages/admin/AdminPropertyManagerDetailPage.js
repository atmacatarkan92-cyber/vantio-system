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
  fetchAdminRooms,
  fetchAdminTenanciesAll,
  normalizeUnit,
  normalizeRoom,
  patchAdminPropertyManager,
} from "../../api/adminData";
import { formatAuditLog, auditActorDisplay, auditActionLabel } from "../../utils/auditDisplay";
import { normalizeUnitTypeLabel } from "../../utils/unitDisplayId";
import { useTheme } from "../../contexts/ThemeContext";
import { getCoLivingMetrics } from "../../utils/adminUnitCoLivingMetrics";
import {
  formatOccupancyStatusDe,
  getUnitOccupancyStatus,
  sumActiveTenancyMonthlyRentForUnit,
} from "../../utils/unitOccupancyStatus";

function landlordLabel(l) {
  if (!l) return "";
  const c = String(l.company_name || "").trim();
  const n = String(l.contact_name || "").trim();
  if (c && n) return `${c} — ${n}`;
  return c || n || String(l.email || "").trim() || l.id;
}

function landlordDisplayLabel(l) {
  if (!l) return "";
  const norm = (v) => {
    const t = String(v ?? "").trim();
    if (!t || t === "—") return "";
    return t;
  };
  const c = norm(l.company_name);
  const n = norm(l.contact_name);
  if (c && n) return `${c} — ${n}`;
  if (c || n) return c || n;
  const em = norm(l.email);
  if (em) return em;
  return l.id != null ? String(l.id) : "";
}

function formatChfMonthly(value) {
  const n = Number(value);
  if (Number.isNaN(n)) return "—";
  return `CHF ${n.toLocaleString("de-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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

function AdminPropertyManagerDetailPage() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [pm, setPm] = useState(null);
  /** undefined = not loaded yet; null = missing / not found */
  const [landlordRow, setLandlordRow] = useState(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [units, setUnits] = useState([]);
  const [unitsLoading, setUnitsLoading] = useState(true);
  const [unitsError, setUnitsError] = useState(null);
  const [occupancyRooms, setOccupancyRooms] = useState([]);
  const [occupancyTenancies, setOccupancyTenancies] = useState(undefined);
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
    let cancelled = false;
    setOccupancyRooms([]);
    setOccupancyTenancies(undefined);
    Promise.all([
      fetchAdminRooms().catch(() => null),
      fetchAdminTenanciesAll().catch(() => null),
    ]).then(([roomsData, tenData]) => {
      if (cancelled) return;
      setOccupancyRooms(
        Array.isArray(roomsData) ? roomsData.map((r) => normalizeRoom(r)) : []
      );
      setOccupancyTenancies(Array.isArray(tenData) ? tenData : null);
    });
    return () => {
      cancelled = true;
    };
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

  const pmTh = useMemo(() => {
    const D = isDark;
    return {
      page: D
        ? "min-h-screen max-w-3xl bg-[#07090f] px-2 py-6 text-[#eef2ff] [color-scheme:dark]"
        : "min-h-screen max-w-3xl bg-[#f8fafc] px-2 py-6 text-[#0f172a] [color-scheme:light]",
      loadingText: D
        ? "min-h-[40vh] bg-[#07090f] px-2 py-8 text-[#6b7a9a] [color-scheme:dark]"
        : "min-h-[40vh] bg-[#f8fafc] px-2 py-8 text-[#64748b] [color-scheme:light]",
      errorWrap: D
        ? "max-w-3xl bg-[#07090f] px-2 py-6 text-[#eef2ff] [color-scheme:dark]"
        : "max-w-3xl bg-[#f8fafc] px-2 py-6 text-[#0f172a] [color-scheme:light]",
      btnGhost: D
        ? "rounded-[8px] border border-white/[0.1] bg-transparent px-4 py-2 text-sm font-semibold text-[#8090b0] hover:bg-white/[0.04]"
        : "rounded-[8px] border border-black/10 bg-transparent px-4 py-2 text-sm font-semibold text-[#64748b] hover:bg-black/[0.03]",
      section: D
        ? "mb-4 rounded-[14px] border border-white/[0.07] bg-[#141824] p-5 md:p-6"
        : "mb-4 rounded-[14px] border border-black/10 bg-white p-5 md:p-6",
      sectionTitle: D
        ? "mb-4 text-[9px] font-bold uppercase tracking-[1px] text-[#6b7a9a]"
        : "mb-4 text-[9px] font-bold uppercase tracking-[1px] text-[#64748b]",
      labelMuted: D
        ? "text-[10px] text-[#6b7a9a]"
        : "text-[10px] text-[#64748b]",
      pMuted: D ? "text-sm text-[#6b7a9a]" : "text-sm text-[#64748b]",
      metaXs: D ? "mt-2 text-xs text-[#6b7a9a]" : "mt-2 text-xs text-[#64748b]",
      auditMeta: D ? "mt-0.5 text-xs text-[#6b7a9a]" : "mt-0.5 text-xs text-[#64748b]",
      mutedInline: D ? "text-[#6b7a9a]" : "text-[#64748b]",
      body: D ? "text-[#eef2ff]" : "text-[#0f172a]",
      subLead: D ? "mt-1 text-[12px] text-[#6b7a9a]" : "mt-1 text-[12px] text-[#64748b]",
      h1: D ? "text-[22px] font-bold tracking-tight text-[#eef2ff]" : "text-[22px] font-bold tracking-tight text-[#0f172a]",
      btnToolbar: D
        ? "inline-flex items-center rounded-[8px] border border-white/[0.1] bg-transparent px-3 py-2 text-sm font-semibold text-[#8090b0] hover:bg-white/[0.04]"
        : "inline-flex items-center rounded-[8px] border border-black/10 bg-transparent px-3 py-2 text-sm font-semibold text-[#64748b] hover:bg-slate-100",
      borderT: D ? "border-t border-white/[0.05] pt-5" : "border-t border-black/10 pt-5",
      borderB: D ? "border-b border-white/[0.05]" : "border-b border-black/10",
      noteBox: D ? "rounded-[10px] bg-[#111520] p-3" : "rounded-[10px] bg-slate-100 p-3",
      textarea: D
        ? "w-full rounded-[8px] border border-white/[0.08] bg-[#111520] px-3 py-2 text-sm text-[#eef2ff] placeholder:text-[#6b7a9a]/70 focus:outline-none focus:ring-2 focus:ring-[#7aaeff]/30 disabled:opacity-60"
        : "w-full rounded-[8px] border border-black/10 bg-white px-3 py-2 text-sm text-[#0f172a] placeholder:text-[#64748b]/70 focus:outline-none focus:ring-2 focus:ring-[#7aaeff]/30 disabled:opacity-60",
      auditBorder: D
        ? "ml-1 space-y-4 border-l-2 border-white/[0.08] pl-4"
        : "ml-1 space-y-4 border-l-2 border-black/10 pl-4",
      emptyBox: D
        ? "rounded-[10px] border border-dashed border-white/[0.07] bg-[#111520] px-5 py-8 text-center"
        : "rounded-[10px] border border-dashed border-black/10 bg-slate-100 px-5 py-8 text-center",
      pulse1: D
        ? "h-2 w-full max-w-xs animate-pulse rounded bg-[#111520]"
        : "h-2 w-full max-w-xs animate-pulse rounded bg-slate-200",
      pulse2: D
        ? "h-2 w-full max-w-[14rem] animate-pulse rounded bg-[#111520]"
        : "h-2 w-full max-w-[14rem] animate-pulse rounded bg-slate-200",
      unitRow: D
        ? "rounded-[14px] border border-white/[0.07] bg-[#111520] p-4 transition-shadow hover:shadow-lg md:p-5"
        : "rounded-[14px] border border-black/10 bg-slate-100 p-4 transition-shadow hover:shadow-lg md:p-5",
      unitFooter: D ? "mt-3 border-t border-white/[0.05] pt-3" : "mt-3 border-t border-black/10 pt-3",
      link: D
        ? "text-sm font-semibold text-blue-400 hover:underline"
        : "text-sm font-semibold text-blue-700 hover:underline",
      linkMd: D
        ? "text-sm font-medium text-blue-400 underline-offset-2 hover:underline"
        : "text-sm font-medium text-blue-700 underline-offset-2 hover:underline",
      linkUnit: D
        ? "rounded-sm text-base font-semibold text-blue-400 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7aaeff]/40"
        : "rounded-sm text-base font-semibold text-blue-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/40",
      modalShell: D
        ? "max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[14px] border border-white/[0.07] bg-[#141824] p-6 shadow-lg"
        : "max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[14px] border border-black/10 bg-white p-6 shadow-lg",
      modalTitle: D ? "mb-4 text-lg font-semibold text-[#eef2ff]" : "mb-4 text-lg font-semibold text-[#0f172a]",
      field: D
        ? "w-full rounded-[8px] border border-white/[0.08] bg-[#111520] px-3 py-2 text-sm text-[#eef2ff] placeholder:text-[#6b7a9a] disabled:opacity-60"
        : "w-full rounded-[8px] border border-black/10 bg-white px-3 py-2 text-sm text-[#0f172a] placeholder:text-[#64748b] disabled:opacity-60",
      btnCancelModal: D
        ? "rounded-[8px] border border-white/[0.1] bg-transparent px-3 py-2 text-sm font-semibold text-[#8090b0] hover:bg-white/[0.04]"
        : "rounded-[8px] border border-black/10 bg-transparent px-3 py-2 text-sm font-semibold text-[#64748b] hover:bg-slate-100",
      pmChipActive: D
        ? "inline-flex items-center rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-400"
        : "inline-flex items-center rounded-full border border-emerald-300 bg-emerald-100 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-700",
      pmChipInactive: D
        ? "inline-flex items-center rounded-full border border-white/[0.08] bg-white/[0.05] px-2.5 py-0.5 text-[10px] font-semibold text-[#6b7a9a]"
        : "inline-flex items-center rounded-full border border-black/10 bg-slate-100 px-2.5 py-0.5 text-[10px] font-semibold text-[#64748b]",
      rentStrong: D
        ? "font-semibold tabular-nums text-emerald-400"
        : "font-semibold tabular-nums text-emerald-600",
      occBadgeWrap: D
        ? "inline-flex max-w-full flex-wrap items-center rounded-full border border-white/[0.08] px-2.5 py-0.5 text-[10px] font-semibold"
        : "inline-flex max-w-full flex-wrap items-center rounded-full border border-black/10 px-2.5 py-0.5 text-[10px] font-semibold",
      occBadgeUnknown: D
        ? "inline-flex items-center rounded-full border border-white/[0.08] bg-white/[0.05] px-2.5 py-0.5 text-[10px] font-semibold text-[#6b7a9a]"
        : "inline-flex items-center rounded-full border border-black/10 bg-slate-100 px-2.5 py-0.5 text-[10px] font-semibold text-[#64748b]",
    };
  }, [isDark]);

  if (loading) {
    return (
      <p className="min-h-[40vh] bg-[#080a0f] px-6 py-8 text-[#4a5070]">Lade Bewirtschafter …</p>
    );
  }

  if (error || !pm) {
    return (
      <div className="min-h-screen bg-[#080a0f] px-6 py-8 text-[#edf0f7]">
        <p className="mb-3 text-[14px] text-[#ff5f6d]">{error || "Nicht gefunden."}</p>
        <button
          type="button"
          onClick={() => navigate("/admin/bewirtschafter")}
          className="rounded-[6px] border border-[#252a3a] bg-[#141720] px-[12px] py-[4px] text-[11px] text-[#8892b0] hover:text-[#edf0f7]"
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

  const nameRawForInitials = String(pm.name || "").trim();
  const namePartsForInitials = nameRawForInitials.split(/\s+/).filter(Boolean);
  let stammInitials = "?";
  if (namePartsForInitials.length >= 2) {
    const a = namePartsForInitials[0][0] || "";
    const b = namePartsForInitials[namePartsForInitials.length - 1][0] || "";
    stammInitials = `${a}${b}`.toUpperCase() || "?";
  } else if (nameRawForInitials) {
    stammInitials = nameRawForInitials.slice(0, 2).toUpperCase();
  }

  return (
    <div className="-m-6 min-h-screen bg-[#080a0f]">
      <div className="sticky top-0 z-30 flex h-[50px] items-center justify-between border-b border-[#1c2035] bg-[#0c0e15] px-6 backdrop-blur-md">
        <div className="flex min-w-0 flex-1 items-center gap-[12px]">
          <Link
            to="/admin/bewirtschafter"
            className="shrink-0 rounded-[6px] border border-[#252a3a] bg-[#141720] px-[10px] py-[4px] text-[11px] text-[#4a5070] no-underline hover:text-[#edf0f7]"
          >
            ← Bewirtschafter
          </Link>
          <div className="h-[20px] w-px shrink-0 bg-[#1c2035]" aria-hidden />
          <div className="flex min-w-0 flex-wrap items-center gap-x-[8px] gap-y-1">
            <span className="shrink-0 text-[10px] text-[#4a5070]">Bewirtschafter</span>
            <span className="shrink-0 text-[#1c2035]">/</span>
            <span className="truncate text-[14px] font-medium text-[#edf0f7]">{displayName}</span>
            {isPmActive ? (
              <span className="inline-flex shrink-0 items-center rounded-full border border-[rgba(61,220,132,0.2)] bg-[rgba(61,220,132,0.1)] px-[8px] py-[1px] text-[10px] font-semibold text-[#3ddc84]">
                Aktiv
              </span>
            ) : (
              <span className="inline-flex shrink-0 items-center rounded-full border border-[rgba(245,166,35,0.2)] bg-[rgba(245,166,35,0.1)] px-[8px] py-[1px] text-[10px] font-semibold text-[#f5a623]">
                Inaktiv
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-[8px]">
          <button
            type="button"
            onClick={openEditModal}
            className="rounded-[6px] border border-[#252a3a] bg-[#141720] px-[12px] py-[4px] text-[11px] text-[#8892b0] hover:text-[#edf0f7]"
          >
            Bearbeiten
          </button>
          <button
            type="button"
            disabled={statusSaving}
            onClick={handleToggleStatus}
            className={
              isPmActive
                ? "rounded-[6px] border border-[rgba(245,166,35,0.25)] bg-transparent px-[12px] py-[4px] text-[11px] text-[#f5a623] hover:bg-[rgba(245,166,35,0.08)] disabled:cursor-not-allowed disabled:opacity-60"
                : "rounded-[6px] border border-[rgba(61,220,132,0.25)] bg-transparent px-[12px] py-[4px] text-[11px] text-[#3ddc84] hover:bg-[rgba(61,220,132,0.08)] disabled:cursor-not-allowed disabled:opacity-60"
            }
          >
            {statusSaving ? "…" : isPmActive ? "Als inaktiv markieren" : "Aktivieren"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-[16px] px-[24px] py-[20px] lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="flex min-w-0 flex-col gap-[12px]">
          <div className="overflow-hidden rounded-[12px] border border-[#1c2035] bg-[#10121a]">
            <div className="flex items-center justify-between border-b border-[#1c2035] px-[16px] py-[12px]">
              <span className="text-[11px] font-medium uppercase tracking-[0.5px] text-[#edf0f7]">
                Stammdaten
              </span>
            </div>
            <div className="px-[16px] py-[14px]">
              <div className="mb-[14px] flex items-center gap-[12px]">
                <div className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-[10px] border border-[rgba(91,156,246,0.2)] bg-[rgba(91,156,246,0.1)] text-[14px] font-semibold text-[#5b9cf6]">
                  {stammInitials}
                </div>
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold text-[#edf0f7]">{displayName}</p>
                  <p className="mt-[2px] text-[10px] text-[#4a5070]">Bewirtschafter / Property Manager</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-[12px]">
                <div className="flex flex-col gap-[3px]">
                  <span className="text-[9px] font-medium uppercase tracking-[0.5px] text-[#4a5070]">Name</span>
                  <span className="text-[12px] font-medium text-[#edf0f7]">{displayName}</span>
                </div>
                <div className="flex flex-col gap-[3px]">
                  <span className="text-[9px] font-medium uppercase tracking-[0.5px] text-[#4a5070]">E-Mail</span>
                  {pm.email?.trim() ? (
                    <span className="text-[11px] text-[#5b9cf6]">{pm.email.trim()}</span>
                  ) : (
                    <span className="text-[12px] font-medium text-[#4a5070]">—</span>
                  )}
                </div>
                <div className="flex flex-col gap-[3px]">
                  <span className="text-[9px] font-medium uppercase tracking-[0.5px] text-[#4a5070]">Telefon</span>
                  {pm.phone?.trim() ? (
                    <span className="font-mono text-[11px] text-[#edf0f7]">{pm.phone.trim()}</span>
                  ) : (
                    <span className="text-[12px] font-medium text-[#4a5070]">—</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-[12px] border border-[#1c2035] bg-[#10121a]">
            <div className="flex items-center justify-between border-b border-[#1c2035] px-[16px] py-[12px]">
              <span className="text-[11px] font-medium uppercase tracking-[0.5px] text-[#edf0f7]">Notizen</span>
            </div>
            <div className="px-[16px] py-[14px]">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  saveNewNote();
                }}
              >
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
                  className="min-h-[70px] w-full resize-y rounded-[7px] border border-[#1c2035] bg-[#141720] px-[12px] py-[10px] font-['DM_Sans'] text-[12px] text-[#edf0f7] outline-none placeholder:text-[#4a5070] focus:border-[#242840] disabled:opacity-60"
                />
                {newNoteErr ? <p className="mt-2 text-[12px] text-[#ff5f6d]">{newNoteErr}</p> : null}
                {newNoteSubmitErr ? (
                  <p className="mt-2 text-[12px] text-[#ff5f6d]">{newNoteSubmitErr}</p>
                ) : null}
                <button
                  type="submit"
                  disabled={newNoteSaving}
                  className="mt-[8px] rounded-[6px] border border-[rgba(91,156,246,0.28)] bg-[rgba(91,156,246,0.1)] px-[14px] py-[5px] text-[11px] font-medium text-[#5b9cf6] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {newNoteSaving ? "Speichern …" : "Notiz speichern"}
                </button>
              </form>
              <div className="mt-[12px] border-t border-[#1c2035] pt-[12px]">
                {notesLoading ? (
                  <p className="text-[12px] text-[#4a5070]">Lade Notizen …</p>
                ) : !notes.length ? (
                  <p className="text-[12px] text-[#4a5070]">Noch keine Notizen vorhanden.</p>
                ) : (
                  <ul className="m-0 list-none p-0">
                    {notes.map((n, ni) => (
                      <li
                        key={n.id}
                        className={`py-[10px] ${ni < notes.length - 1 ? "border-b border-[#1c2035]" : ""}`}
                      >
                        <p className="mb-[3px] whitespace-pre-wrap text-[12px] text-[#edf0f7]">{n.content}</p>
                        <p className="text-[10px] text-[#4a5070]">
                          {formatDateTime(n.created_at)} · {n.author_name || "—"}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-[12px] border border-[#1c2035] bg-[#10121a]">
            <div className="flex items-center justify-between border-b border-[#1c2035] px-[16px] py-[12px]">
              <span className="text-[11px] font-medium uppercase tracking-[0.5px] text-[#edf0f7]">
                Historia · Änderungsprotokoll
              </span>
              <span className="text-[10px] text-[#4a5070]">
                {auditLoading ? "…" : `${auditLogs.length} Einträge`}
              </span>
            </div>
            <div className="px-[16px] py-[14px]">
              {auditLoading ? (
                <p className="text-[12px] text-[#4a5070]">Lade Verlauf …</p>
              ) : auditError ? (
                <p className="text-[12px] text-[#ff5f6d]">{auditError}</p>
              ) : auditLogs.length === 0 ? (
                <p className="text-[12px] text-[#4a5070]">Noch keine Einträge im Audit-Protokoll.</p>
              ) : (
                <ul className="m-0 list-none p-0">
                  {auditLogs.map((log, li) => {
                    const { summary, changes } = formatAuditLog(log, {
                      entityType: "property_manager",
                      landlordNameById,
                    });
                    const actorLine = auditActorDisplay(log);
                    return (
                      <li
                        key={log.id}
                        className={`py-[12px] ${li < auditLogs.length - 1 ? "border-b border-[#1c2035]" : ""}`}
                      >
                        <p className="mb-[4px] text-[11px] font-medium text-[#edf0f7]">{summary}</p>
                        <p className="mb-[8px] text-[10px] text-[#4a5070]">
                          <span>{formatDateTime(log.created_at)}</span>
                          {log.action != null && String(log.action) !== "" ? (
                            <>
                              <span> · </span>
                              <span>{auditActionLabel(log.action)}</span>
                            </>
                          ) : null}
                          {actorLine ? (
                            <>
                              <span> · </span>
                              <span className="text-[#f5a623]">{actorLine}</span>
                            </>
                          ) : null}
                        </p>
                        {changes && changes.length > 0 ? (
                          <div className="flex flex-col gap-[8px]">
                            {changes.map((c, ci) => {
                              const oldDisp = c.old == null || c.old === "" ? "—" : String(c.old);
                              const isNarr =
                                (c.label === "Ereignis" || c.label === "Details") &&
                                (oldDisp === "—" || oldDisp === "");
                              return (
                                <div key={`${log.id}-${ci}`}>
                                  {isNarr ? (
                                    <div className="rounded-[6px] border border-[#1c2035] bg-[#141720] px-[10px] py-[6px] text-[12px] text-[#edf0f7]">
                                      {c.new == null || c.new === "" ? "—" : String(c.new)}
                                    </div>
                                  ) : (
                                    <div>
                                      <div className="mb-[4px] text-[10px] font-medium text-[#8892b0]">{c.label}</div>
                                      <div className="grid grid-cols-2 gap-[6px]">
                                        <div className="rounded-[6px] bg-[#141720] px-[10px] py-[6px]">
                                          <div className="mb-[3px] text-[8px] uppercase tracking-[0.5px] text-[#4a5070]">
                                            Alt
                                          </div>
                                          <div className="break-words font-mono text-[10px] text-[#ff5f6d]">
                                            {oldDisp}
                                          </div>
                                        </div>
                                        <div className="rounded-[6px] bg-[#141720] px-[10px] py-[6px]">
                                          <div className="mb-[3px] text-[8px] uppercase tracking-[0.5px] text-[#4a5070]">
                                            Neu
                                          </div>
                                          <div className="break-words font-mono text-[10px] text-[#3ddc84]">
                                            {c.new == null || c.new === "" ? "—" : String(c.new)}
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>

        <aside className="flex min-w-0 flex-col gap-[12px]">
          <div className="overflow-hidden rounded-[12px] border border-[#1c2035] bg-[#10121a]">
            <div className="border-b border-[#1c2035] px-[16px] py-[12px]">
              <span className="text-[11px] font-medium uppercase tracking-[0.5px] text-[#edf0f7]">
                Zugeordnete Verwaltung
              </span>
            </div>
            <div className="px-[16px] py-[12px]">
              {!pm.landlord_id ? (
                <p className="text-[12px] text-[#4a5070]">Keine Verwaltung zugeordnet</p>
              ) : landlordRow === undefined ? (
                <p className="text-[12px] text-[#4a5070]">Lade Verwaltung …</p>
              ) : landlordRow ? (
                <Link
                  to={`/admin/landlords/${encodeURIComponent(pm.landlord_id)}`}
                  className="text-[12px] font-medium text-[#5b9cf6] no-underline hover:underline"
                >
                  {landlordDisplayLabel(landlordRow) || landlordLabel(landlordRow)}
                </Link>
              ) : (
                <p className="text-[12px] text-[#4a5070]">Die zugeordnete Verwaltung konnte nicht geladen werden.</p>
              )}
            </div>
          </div>

          <div className="overflow-hidden rounded-[12px] border border-[#1c2035] bg-[#10121a]">
            <div className="flex items-center justify-between border-b border-[#1c2035] px-[16px] py-[12px]">
              <span className="text-[11px] font-medium uppercase tracking-[0.5px] text-[#edf0f7]">
                Zugeordnete Units
              </span>
              <span className="text-[10px] text-[#4a5070]">{units.length} Units</span>
            </div>
            <div className="px-[12px] py-[10px]">
              {unitsLoading ? (
                <div className="space-y-2" aria-busy="true">
                  <p className="text-[12px] text-[#4a5070]">Lade Units …</p>
                  <div className="h-2 w-full max-w-xs animate-pulse rounded bg-[#141720]" />
                  <div className="h-2 w-full max-w-[14rem] animate-pulse rounded bg-[#141720]" />
                </div>
              ) : unitsError ? (
                <p className="text-[12px] text-[#ff5f6d]">{unitsError}</p>
              ) : units.length === 0 ? (
                <div className="rounded-[9px] border border-dashed border-[#1c2035] bg-[#141720] px-[14px] py-[12px] text-center">
                  <p className="text-[12px] font-medium text-[#edf0f7]">Keine Units zugeordnet</p>
                  <p className="mx-auto mt-[6px] max-w-none text-[11px] text-[#4a5070]">
                    Diesem Bewirtschafter sind aktuell keine Units als Ansprechpartner zugewiesen.
                  </p>
                </div>
              ) : (
                <ul className="m-0 list-none p-0">
                  {units.map((u, ui) => {
                    const uid = u.unitId ?? u.id;
                    const title = (u.title || u.name || "").trim() || "—";
                    const typeLabel = normalizeUnitTypeLabel(u.type) || String(u.type || "").trim() || "—";
                    const rawType = String(u.type ?? "").trim();
                    const addr = String(u.address || "").trim();
                    const zip = String(u.zip ?? "").trim();
                    const city = String(u.city || "").trim();
                    const zipCity = [zip, city].filter(Boolean).join(" ");
                    const occKey = getUnitOccupancyStatus(u, occupancyRooms, occupancyTenancies);
                    const colivingMetrics = getCoLivingMetrics(u, occupancyRooms, occupancyTenancies);
                    const coLivingRatio =
                      typeLabel === "Co-Living" &&
                      colivingMetrics.totalRooms > 0 &&
                      occKey != null
                        ? ` · ${colivingMetrics.occupiedCount}/${colivingMetrics.totalRooms} Zimmer`
                        : "";
                    const rentSum = sumActiveTenancyMonthlyRentForUnit(u, occupancyTenancies ?? []);
                    const typeBadgeCls =
                      typeLabel === "Co-Living"
                        ? "rounded-full border border-[rgba(91,156,246,0.2)] bg-[rgba(91,156,246,0.1)] px-[6px] py-[1px] text-[9px] font-semibold text-[#5b9cf6]"
                        : rawType === "Business Apartment"
                          ? "rounded-full border border-[rgba(157,124,244,0.2)] bg-[rgba(157,124,244,0.1)] px-[6px] py-[1px] text-[9px] font-semibold text-[#9d7cf4]"
                          : "rounded-full border border-[#1c2035] bg-[#191c28] px-[6px] py-[1px] text-[9px] font-semibold text-[#8892b0]";
                    const occBadgeCls =
                      occKey === "belegt"
                        ? "rounded-full border border-[rgba(61,220,132,0.2)] bg-[rgba(61,220,132,0.1)] px-[6px] py-[1px] text-[9px] font-semibold text-[#3ddc84]"
                        : occKey === "frei"
                          ? "rounded-full border border-[rgba(255,95,109,0.2)] bg-[rgba(255,95,109,0.1)] px-[6px] py-[1px] text-[9px] font-semibold text-[#ff5f6d]"
                          : occKey === "reserviert"
                            ? "rounded-full border border-[rgba(91,156,246,0.2)] bg-[rgba(91,156,246,0.1)] px-[6px] py-[1px] text-[9px] font-semibold text-[#5b9cf6]"
                            : occKey === "teilbelegt"
                              ? "rounded-full border border-[rgba(245,166,35,0.2)] bg-[rgba(245,166,35,0.1)] px-[6px] py-[1px] text-[9px] font-semibold text-[#f5a623]"
                              : "rounded-full border border-[#1c2035] bg-[#191c28] px-[6px] py-[1px] text-[9px] font-semibold text-[#4a5070]";
                    return (
                      <li key={String(uid)} className={ui < units.length - 1 ? "mb-[8px]" : ""}>
                        <Link
                          to={`/admin/units/${encodeURIComponent(uid)}`}
                          className="block cursor-pointer rounded-[9px] border border-[#1c2035] bg-[#141720] px-[14px] py-[12px] transition-colors hover:border-[#242840]"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="min-w-0 truncate text-[12px] font-medium text-[#5b9cf6]">{title}</span>
                            <div className="flex shrink-0 flex-wrap justify-end gap-[4px]">
                              <span className={`inline-flex items-center ${typeBadgeCls}`}>{typeLabel}</span>
                              {occKey == null ? (
                                <span className="inline-flex items-center rounded-full border border-[#1c2035] bg-[#191c28] px-[6px] py-[1px] text-[9px] font-semibold text-[#4a5070]">
                                  —
                                </span>
                              ) : (
                                <span className={`inline-flex items-center ${occBadgeCls}`}>
                                  {formatOccupancyStatusDe(occKey)}
                                  {coLivingRatio}
                                </span>
                              )}
                            </div>
                          </div>
                          {addr || zipCity ? (
                            <p className="mb-[5px] mt-[3px] text-[10px] text-[#4a5070]">
                              {[addr, zipCity].filter(Boolean).join(", ")}
                            </p>
                          ) : null}
                          <p className="text-[11px] text-[#8892b0]">
                            <span>Miete (Mieter): </span>
                            <span
                              className={
                                rentSum > 0
                                  ? "font-mono font-medium text-[#3ddc84]"
                                  : "font-mono text-[#4a5070]"
                              }
                            >
                              {formatChfMonthly(rentSum)}
                            </span>
                          </p>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          <div className="overflow-hidden rounded-[12px] border border-[#1c2035] bg-[#10121a]">
            <div className="border-b border-[#1c2035] px-[16px] py-[12px]">
              <span className="text-[11px] font-medium uppercase tracking-[0.5px] text-[#edf0f7]">Schnellinfo</span>
            </div>
            <div className="divide-y divide-[#1c2035]">
              <div className="flex items-center justify-between px-[16px] py-[9px]">
                <span className="text-[11px] text-[#4a5070]">Status</span>
                <span className="text-[12px] font-medium text-[#edf0f7]">
                  {isPmActive ? (
                    <span className="inline-flex items-center rounded-full border border-[rgba(61,220,132,0.2)] bg-[rgba(61,220,132,0.1)] px-2 py-[1px] text-[10px] font-semibold text-[#3ddc84]">
                      Aktiv
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full border border-[rgba(245,166,35,0.2)] bg-[rgba(245,166,35,0.1)] px-2 py-[1px] text-[10px] font-semibold text-[#f5a623]">
                      Inaktiv
                    </span>
                  )}
                </span>
              </div>
              <div className="flex items-center justify-between px-[16px] py-[9px]">
                <span className="text-[11px] text-[#4a5070]">ID</span>
                <span className="break-all text-right text-[12px] font-medium text-[#edf0f7]">{String(pm.id)}</span>
              </div>
              <div className="flex items-center justify-between px-[16px] py-[9px]">
                <span className="text-[11px] text-[#4a5070]">E-Mail</span>
                <span className="max-w-[60%] break-all text-right text-[12px] font-medium text-[#edf0f7]">
                  {pm.email?.trim() || "—"}
                </span>
              </div>
              <div className="flex items-center justify-between px-[16px] py-[9px]">
                <span className="text-[11px] text-[#4a5070]">Telefon</span>
                <span className="text-right font-mono text-[12px] font-medium text-[#edf0f7]">
                  {pm.phone?.trim() || "—"}
                </span>
              </div>
              {pm.created_at ? (
                <div className="flex items-center justify-between px-[16px] py-[9px]">
                  <span className="text-[11px] text-[#4a5070]">Erfasst</span>
                  <span className="text-right text-[12px] font-medium text-[#edf0f7]">
                    {formatDateTime(pm.created_at)}
                  </span>
                </div>
              ) : null}
              {pm.updated_at ? (
                <div className="flex items-center justify-between px-[16px] py-[9px]">
                  <span className="text-[11px] text-[#4a5070]">Aktualisiert</span>
                  <span className="text-right text-[12px] font-medium text-[#edf0f7]">
                    {formatDateTime(pm.updated_at)}
                  </span>
                </div>
              ) : null}
            </div>
          </div>
        </aside>
      </div>

      {editOpen && (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 p-4"
          onClick={() => !editSaving && setEditOpen(false)}
          role="presentation"
        >
          <div
            className={pmTh.modalShell}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="pm-edit-title"
          >
            <h2 id="pm-edit-title" className={pmTh.modalTitle}>
              Bewirtschafter bearbeiten
            </h2>
            {landlordsEditLoading ? (
              <p className={`mb-4 text-sm ${pmTh.mutedInline}`}>Lade Verwaltungen …</p>
            ) : null}
            <div className="space-y-4">
              <div>
                <label htmlFor="pm-edit-name" className={`mb-1 block ${pmTh.labelMuted}`}>
                  Name *
                </label>
                <input
                  id="pm-edit-name"
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                  disabled={editSaving}
                  className={pmTh.field}
                />
              </div>
              <div>
                <label htmlFor="pm-edit-email" className={`mb-1 block ${pmTh.labelMuted}`}>
                  E-Mail
                </label>
                <input
                  id="pm-edit-email"
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                  disabled={editSaving}
                  className={pmTh.field}
                />
              </div>
              <div>
                <label htmlFor="pm-edit-phone" className={`mb-1 block ${pmTh.labelMuted}`}>
                  Telefon
                </label>
                <input
                  id="pm-edit-phone"
                  type="text"
                  value={editForm.phone}
                  onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                  disabled={editSaving}
                  className={pmTh.field}
                />
              </div>
              <div>
                <label htmlFor="pm-edit-landlord" className={`mb-1 block ${pmTh.labelMuted}`}>
                  Verwaltung
                </label>
                <select
                  id="pm-edit-landlord"
                  value={editForm.landlord_id}
                  onChange={(e) => setEditForm((f) => ({ ...f, landlord_id: e.target.value }))}
                  disabled={editSaving || landlordsEditLoading}
                  className={pmTh.field}
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
                <label htmlFor="pm-edit-status" className={`mb-1 block ${pmTh.labelMuted}`}>
                  Status
                </label>
                <select
                  id="pm-edit-status"
                  value={editForm.status}
                  onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value }))}
                  disabled={editSaving}
                  className={pmTh.field}
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
                  className={pmTh.btnCancelModal}
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
