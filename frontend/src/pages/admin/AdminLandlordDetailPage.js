import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  createAdminLandlordNote,
  deleteAdminLandlord,
  deleteAdminLandlordDocument,
  fetchAdminAuditLogs,
  fetchAdminLandlord,
  fetchAdminLandlords,
  fetchAdminLandlordDocumentDownloadUrl,
  fetchAdminLandlordDocuments,
  fetchAdminLandlordNotes,
  fetchAdminLandlordPropertyManagers,
  fetchAdminLandlordUnits,
  fetchAdminRooms,
  fetchAdminTenanciesAll,
  normalizeUnit,
  normalizeRoom,
  restoreAdminLandlord,
  updateAdminLandlord,
  updateAdminLandlordNote,
  uploadAdminLandlordDocument,
  verifyAdminAddress,
} from "../../api/adminData";
import { SWISS_CANTON_CODES } from "../../constants/swissCantons";
import { lookupSwissPlz } from "../../data/swissPlzLookup";
import {
  formatAuditLog,
  auditActorDisplay,
  formatAuditTimestamp,
  auditActionLabel,
} from "../../utils/auditDisplay";
import { buildGoogleMapsSearchUrl } from "../../utils/googleMapsUrl";
import { normalizeUnitTypeLabel } from "../../utils/unitDisplayId";
import {
  formatOccupancyStatusDe,
  getUnitOccupancyStatus,
  sumActiveTenancyMonthlyRentForUnit,
} from "../../utils/unitOccupancyStatus";

function dash(s) {
  const t = s != null ? String(s).trim() : "";
  return t || "—";
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
    return "border border-[rgba(91,156,246,0.2)] bg-[rgba(91,156,246,0.1)] text-[#5b9cf6]";
  }
  if (raw === "Business Apartment") {
    return "border border-[rgba(157,124,244,0.2)] bg-[rgba(157,124,244,0.1)] text-[#9d7cf4]";
  }
  return "border border-[#1c2035] bg-[#191c28] text-[#8892b0]";
}

function companyInitialsFromCompanyName(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[parts.length - 1][0] || ""}`.toUpperCase();
}

function landlordUnitOccBadgeClass(key) {
  const k = String(key || "");
  if (k === "belegt") {
    return "border border-[rgba(61,220,132,0.2)] bg-[rgba(61,220,132,0.1)] text-[#3ddc84]";
  }
  if (k === "teilbelegt") {
    return "border border-[rgba(245,166,35,0.2)] bg-[rgba(245,166,35,0.1)] text-[#f5a623]";
  }
  if (k === "frei") {
    return "border border-[rgba(255,95,109,0.2)] bg-[rgba(255,95,109,0.1)] text-[#ff5f6d]";
  }
  if (k === "reserviert") {
    return "border border-[rgba(91,156,246,0.2)] bg-[rgba(91,156,246,0.1)] text-[#5b9cf6]";
  }
  return "border border-[#1c2035] bg-[#191c28] text-[#8892b0]";
}

function auditDisplayCell(v) {
  if (v == null || v === "") return "—";
  return String(v);
}

function auditNarrativeOnlyChange(c) {
  const o = auditDisplayCell(c.old);
  return (c.label === "Ereignis" || c.label === "Details") && (o === "—" || o === "");
}

const cardBase = "overflow-hidden rounded-[12px] border border-[#1c2035] bg-[#10121a]";
const cardHead = "flex items-center justify-between border-b border-[#1c2035] px-[16px] py-[12px]";
const cardTitle = "text-[11px] font-medium uppercase tracking-[0.5px] text-[#edf0f7]";
const cardBody = "px-[16px] py-[14px]";
const labelSm = "text-[9px] font-medium uppercase tracking-[0.5px] text-[#4a5070]";

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

function propertyManagerDisplayName(pm) {
  const n = pm != null ? String(pm.name ?? "").trim() : "";
  return n || "Unbenannter Bewirtschafter";
}

function formatLandlordDocumentDate(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString("de-CH", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function formatLandlordDocumentType(doc) {
  const mime = String(doc.mime_type || "").toLowerCase();
  const name = String(doc.file_name || "");
  const ext = name.includes(".") ? (name.split(".").pop() || "").toLowerCase() : "";

  if (mime.includes("pdf") || ext === "pdf") return "PDF";
  if (mime.includes("jpeg") || mime.includes("jpg") || ext === "jpg" || ext === "jpeg") return "JPG";
  if (mime.includes("png") || ext === "png") return "PNG";
  if (
    mime.includes("wordprocessingml") ||
    mime.includes("msword") ||
    ext === "docx" ||
    ext === "doc"
  ) {
    return "DOCX";
  }
  if (ext && /^[a-z0-9]+$/i.test(ext)) return ext.toUpperCase();
  return "Datei";
}

const LANDLORD_DOCUMENT_CATEGORY_LABELS = {
  rent_contract: "Mietvertrag",
  id_document: "Ausweis",
  debt_register: "Betreibungsregister",
  insurance: "Versicherung",
  other: "Sonstiges",
};

function formatLandlordDocumentCategoryLabel(category) {
  if (category == null || String(category).trim() === "") return "—";
  const k = String(category).trim();
  return LANDLORD_DOCUMENT_CATEGORY_LABELS[k] || k;
}

/** Display label for a landlord row (matches list/get shape). */
function landlordRowLabelForUser(ll) {
  if (!ll) return "";
  const c = String(ll.company_name || "").trim();
  const n = String(ll.contact_name || "").trim();
  if (c && n) return `${c} — ${n}`;
  return c || n || String(ll.email || "").trim() || ll.id;
}

function AdminLandlordDetailPage() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [row, setRow] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [archiveModalOpen, setArchiveModalOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [restoreModalOpen, setRestoreModalOpen] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [assignedUnits, setAssignedUnits] = useState([]);
  const [assignedUnitsLoading, setAssignedUnitsLoading] = useState(true);
  const [assignedUnitsError, setAssignedUnitsError] = useState(null);
  const [occupancyRooms, setOccupancyRooms] = useState([]);
  const [occupancyTenancies, setOccupancyTenancies] = useState(undefined);
  const [propertyManagers, setPropertyManagers] = useState([]);
  const [propertyManagersLoading, setPropertyManagersLoading] = useState(true);
  const [propertyManagersError, setPropertyManagersError] = useState(null);
  const [notes, setNotes] = useState([]);
  const [newNoteDraft, setNewNoteDraft] = useState("");
  const [newNoteSaving, setNewNoteSaving] = useState(false);
  const [newNoteErr, setNewNoteErr] = useState(null);
  const [newNoteSubmitErr, setNewNoteSubmitErr] = useState(null);
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [editDraft, setEditDraft] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editErr, setEditErr] = useState(null);
  const [landlordDocuments, setLandlordDocuments] = useState([]);
  const [landlordDocsLoading, setLandlordDocsLoading] = useState(true);
  const [landlordDocUploading, setLandlordDocUploading] = useState(false);
  const [landlordDocUploadError, setLandlordDocUploadError] = useState("");
  const [landlordDocCategory, setLandlordDocCategory] = useState("");
  const landlordDocFileInputRef = useRef(null);
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditLoading, setAuditLoading] = useState(true);
  const [auditError, setAuditError] = useState(null);
  /** user id -> label (from org landlords linked to that portal user) */
  const [userNameById, setUserNameById] = useState({});
  const userIdLookupFetchedRef = useRef(false);

  const [landlordEditOpen, setLandlordEditOpen] = useState(false);
  const [landlordEditSaving, setLandlordEditSaving] = useState(false);
  const [landlordEditErr, setLandlordEditErr] = useState(null);
  const [landlordEditForm, setLandlordEditForm] = useState({
    company_name: "",
    contact_name: "",
    email: "",
    phone: "",
    address_line1: "",
    postal_code: "",
    city: "",
    canton: "",
    website: "",
    notes: "",
    status: "active",
  });
  const [landlordEditAddrBusy, setLandlordEditAddrBusy] = useState(false);
  const [landlordEditCantonHint, setLandlordEditCantonHint] = useState("");
  const [landlordEditCantonLockedByPlz, setLandlordEditCantonLockedByPlz] = useState(false);
  const [landlordEditPlzNotFound, setLandlordEditPlzNotFound] = useState(false);

  const loadAuditLogs = useCallback(
    (opts = {}) => {
      const silent = opts.silent === true;
      if (!id) return Promise.resolve();
      if (!silent) {
        setAuditLoading(true);
        setAuditError(null);
      }
      return fetchAdminAuditLogs({ entity_type: "landlord", entity_id: id })
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
    const needs =
      auditLogs.some((log) => {
        if (log.action !== "update") return false;
        const ov = log.old_values && typeof log.old_values === "object" ? log.old_values : {};
        const nv = log.new_values && typeof log.new_values === "object" ? log.new_values : {};
        return (
          Object.prototype.hasOwnProperty.call(ov, "user_id") ||
          Object.prototype.hasOwnProperty.call(nv, "user_id")
        );
      }) || (row?.user_id && String(row.user_id).trim());
    if (!needs) return;
    if (userIdLookupFetchedRef.current) return;
    userIdLookupFetchedRef.current = true;
    let cancelled = false;
    fetchAdminLandlords("all")
      .then((list) => {
        if (cancelled || !Array.isArray(list)) return;
        const map = {};
        for (const ll of list) {
          const uid = ll.user_id;
          if (uid == null || String(uid).trim() === "") continue;
          const label = landlordRowLabelForUser(ll);
          if (label) map[String(uid)] = label;
        }
        setUserNameById(map);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [auditLogs, row?.user_id]);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError("");
    fetchAdminLandlord(id)
      .then((r) => {
        if (!r) {
          setError("Verwaltung nicht gefunden.");
          setRow(null);
        } else {
          setRow(r);
        }
      })
      .catch(() => setError("Verwaltung konnte nicht geladen werden."))
      .finally(() => setLoading(false));
  }, [id, location.key]);

  useEffect(() => {
    if (!id) return;
    setAssignedUnitsLoading(true);
    setAssignedUnitsError(null);
    fetchAdminLandlordUnits(id)
      .then((data) => {
        const arr = Array.isArray(data) ? data : [];
        setAssignedUnits(arr.map((u) => normalizeUnit(u)));
      })
      .catch((e) => {
        setAssignedUnits([]);
        setAssignedUnitsError(e?.message?.trim() || "Units konnten nicht geladen werden.");
      })
      .finally(() => setAssignedUnitsLoading(false));
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
    setPropertyManagersLoading(true);
    setPropertyManagersError(null);
    fetchAdminLandlordPropertyManagers(id)
      .then((data) => {
        setPropertyManagers(Array.isArray(data) ? data : []);
        setPropertyManagersError(null);
      })
      .catch((e) => {
        setPropertyManagers([]);
        setPropertyManagersError(
          e?.message?.trim() || "Bewirtschafter konnten nicht geladen werden."
        );
      })
      .finally(() => setPropertyManagersLoading(false));
  }, [id]);

  const sortedPropertyManagers = useMemo(() => {
    const arr = Array.isArray(propertyManagers) ? [...propertyManagers] : [];
    arr.sort((a, b) =>
      propertyManagerDisplayName(a).localeCompare(propertyManagerDisplayName(b), "de-CH", {
        sensitivity: "base",
      })
    );
    return arr;
  }, [propertyManagers]);

  useEffect(() => {
    if (!id) return;
    setEditingNoteId(null);
    setEditDraft("");
    setEditErr(null);
    setNewNoteDraft("");
    setNewNoteErr(null);
    setNewNoteSubmitErr(null);
    fetchAdminLandlordNotes(id)
      .then((d) => setNotes(d?.items || []))
      .catch(() => setNotes([]));
  }, [id]);

  useEffect(() => {
    if (!id) return;
    setLandlordDocsLoading(true);
    fetchAdminLandlordDocuments(id)
      .then((items) => setLandlordDocuments(Array.isArray(items) ? items : []))
      .catch(() => setLandlordDocuments([]))
      .finally(() => setLandlordDocsLoading(false));
  }, [id]);

  useEffect(() => {
    setLandlordEditCantonHint("");
  }, [landlordEditForm.address_line1, landlordEditForm.postal_code, landlordEditForm.city]);

  if (loading) {
    return (
      <p className="min-h-screen bg-[#080a0f] px-6 py-8 text-[#4a5070]">Lade Verwaltung …</p>
    );
  }

  if (error || !row) {
    return (
      <div className="min-h-screen bg-[#080a0f] px-6 py-6 text-[#edf0f7]">
        <p className="mb-3 text-[#ff5f6d]">{error || "Nicht gefunden."}</p>
        <button
          type="button"
          onClick={() => navigate("/admin/landlords")}
          className="rounded-[6px] border border-[#252a3a] bg-[#141720] px-[12px] py-[4px] text-[11px] text-[#8892b0] hover:border-[#242840] hover:text-[#edf0f7]"
        >
          Zurück zur Liste
        </button>
      </div>
    );
  }

  const title = row.company_name?.trim() || row.contact_name?.trim() || "Verwaltung";
  const isInactive = row.status === "inactive";
  const statusLabel = isInactive ? "Inaktiv" : "Aktiv";
  const isArchived = !!row.deleted_at;

  const addrLine1 = row.address_line1?.trim() || "";
  const plz = row.postal_code?.trim() || "";
  const city = row.city?.trim() || "";
  const addrLine2 = [plz, city].filter(Boolean).join(" ");
  const addrLine3 = row.canton?.trim() || "";

  const saveNewNote = () => {
    const text = newNoteDraft.trim();
    if (!text) {
      setNewNoteErr("Bitte eine Notiz eingeben.");
      return;
    }
    setNewNoteErr(null);
    setNewNoteSubmitErr(null);
    setNewNoteSaving(true);
    createAdminLandlordNote(id, text)
      .then(() => fetchAdminLandlordNotes(id))
      .then((d) => {
        setNotes(d?.items || []);
        setNewNoteDraft("");
      })
      .catch((err) => {
        setNewNoteSubmitErr(err?.message || "Notiz konnte nicht gespeichert werden.");
      })
      .finally(() => setNewNoteSaving(false));
  };

  const startEditNote = (n) => {
    setEditingNoteId(n.id);
    setEditDraft(n.content || "");
    setEditErr(null);
  };

  const cancelEditNote = () => {
    setEditingNoteId(null);
    setEditDraft("");
    setEditErr(null);
  };

  const saveEditNote = () => {
    const text = editDraft.trim();
    if (!text) {
      setEditErr("Bitte eine Notiz eingeben.");
      return;
    }
    if (!editingNoteId) return;
    setEditErr(null);
    setEditSaving(true);
    updateAdminLandlordNote(id, editingNoteId, text)
      .then(() => fetchAdminLandlordNotes(id))
      .then((d) => {
        setNotes(d?.items || []);
        setEditingNoteId(null);
        setEditDraft("");
      })
      .catch((err) => {
        setEditErr(err?.message || "Speichern fehlgeschlagen.");
      })
      .finally(() => setEditSaving(false));
  };

  function handleLandlordDocPick() {
    landlordDocFileInputRef.current?.click();
  }

  async function handleLandlordDocSelected(e) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f || !id) return;
    setLandlordDocUploading(true);
    setLandlordDocUploadError("");
    try {
      await uploadAdminLandlordDocument(id, f, {
        category: landlordDocCategory.trim() || undefined,
      });
      setLandlordDocCategory("");
      const items = await fetchAdminLandlordDocuments(id);
      setLandlordDocuments(Array.isArray(items) ? items : []);
    } catch (err) {
      setLandlordDocUploadError(err.message || "Upload fehlgeschlagen.");
    } finally {
      setLandlordDocUploading(false);
    }
  }

  async function handleOpenLandlordDocument(docId) {
    try {
      const data = await fetchAdminLandlordDocumentDownloadUrl(docId);
      if (data?.url) window.open(data.url, "_blank", "noopener,noreferrer");
    } catch (err) {
      window.alert(err.message || "Download konnte nicht gestartet werden.");
    }
  }

  async function handleDeleteLandlordDocument(docId) {
    if (!window.confirm("Dokument wirklich löschen?")) return;
    try {
      await deleteAdminLandlordDocument(docId);
      const items = await fetchAdminLandlordDocuments(id);
      setLandlordDocuments(Array.isArray(items) ? items : []);
    } catch (err) {
      window.alert(err.message || "Löschen fehlgeschlagen.");
    }
  }

  const openLandlordEditModal = () => {
    if (!row) return;
    setLandlordEditErr(null);
    setLandlordEditCantonLockedByPlz(false);
    setLandlordEditPlzNotFound(false);
    setLandlordEditForm({
      company_name: row.company_name || "",
      contact_name: row.contact_name || "",
      email: row.email || "",
      phone: row.phone || "",
      address_line1: row.address_line1 || "",
      postal_code: row.postal_code || "",
      city: row.city || "",
      canton: row.canton || "",
      website: row.website || "",
      notes: row.notes || "",
      status: String(row.status || "active").toLowerCase() === "inactive" ? "inactive" : "active",
    });
    setLandlordEditOpen(true);
  };

  const handleLandlordEditPostalCodeChange = (e) => {
    const next = e.target.value;
    const plz = next.trim();
    if (!/^\d{4}$/.test(plz)) {
      setLandlordEditCantonLockedByPlz(false);
      setLandlordEditPlzNotFound(false);
      setLandlordEditForm((f) => ({ ...f, postal_code: next }));
      return;
    }
    const hit = lookupSwissPlz(plz);
    if (hit) {
      setLandlordEditForm((f) => ({
        ...f,
        postal_code: next,
        city: hit.city,
        canton: hit.canton,
      }));
      setLandlordEditCantonLockedByPlz(true);
      setLandlordEditPlzNotFound(false);
    } else {
      setLandlordEditForm((f) => ({ ...f, postal_code: next }));
      setLandlordEditCantonLockedByPlz(false);
      setLandlordEditPlzNotFound(true);
    }
  };

  const submitLandlordEdit = () => {
    if (!id || !row) return;
    const addr1 = landlordEditForm.address_line1.trim();
    const plz = landlordEditForm.postal_code.trim();
    const ort = landlordEditForm.city.trim();
    if (!addr1 || !plz || !ort) {
      setLandlordEditErr("Bitte Adresse, PLZ und Ort ausfüllen.");
      return;
    }
    if (!landlordEditForm.email.trim()) {
      setLandlordEditErr("E-Mail ist erforderlich.");
      return;
    }
    setLandlordEditSaving(true);
    setLandlordEditErr(null);
    updateAdminLandlord(id, {
      company_name: landlordEditForm.company_name.trim() || null,
      contact_name: landlordEditForm.contact_name.trim() || "—",
      email: landlordEditForm.email.trim(),
      phone: landlordEditForm.phone.trim() || null,
      address_line1: addr1,
      postal_code: plz,
      city: ort,
      canton: landlordEditForm.canton.trim() || null,
      website: landlordEditForm.website.trim() || null,
      notes: landlordEditForm.notes.trim() || null,
      status: landlordEditForm.status === "inactive" ? "inactive" : "active",
    })
      .then(() => fetchAdminLandlord(id))
      .then((data) => {
        if (data) setRow(data);
      })
      .then(() => loadAuditLogs({ silent: true }))
      .then(() => setLandlordEditOpen(false))
      .catch((e) => setLandlordEditErr(e?.message || "Speichern fehlgeschlagen."))
      .finally(() => setLandlordEditSaving(false));
  };

  return (
    <div className="-m-6 min-h-screen bg-[#080a0f] text-[#edf0f7]">
      <div className="sticky top-0 z-30 flex h-[50px] items-center border-b border-[#1c2035] bg-[#0c0e15] px-6 backdrop-blur-md">
        <div className="flex min-w-0 flex-1 items-center gap-[12px]">
          <Link
            to="/admin/landlords"
            className="shrink-0 rounded-[6px] border border-[#252a3a] bg-[#141720] px-[10px] py-[4px] text-[11px] text-[#4a5070] transition-colors hover:border-[#242840] hover:text-[#edf0f7]"
          >
            ← Verwaltungen
          </Link>
          <div className="h-5 w-px shrink-0 bg-[#1c2035]" aria-hidden />
          <span className="shrink-0 text-[10px] text-[#4a5070]">Verwaltung</span>
          <span className="shrink-0 text-[#1c2035]">/</span>
          <span className="min-w-0 truncate text-[14px] font-medium text-[#edf0f7]">{title}</span>
          {isArchived ? (
            <span className="inline-flex shrink-0 items-center rounded-full border border-[#1c2035] bg-[#191c28] px-2 py-[2px] text-[9px] font-semibold text-[#8892b0]">
              Archiviert
            </span>
          ) : null}
          {!isArchived ? (
            <span
              className={`inline-flex shrink-0 items-center rounded-full px-2 py-[2px] text-[9px] font-semibold ${
                isInactive
                  ? "border border-[#1c2035] bg-[#191c28] text-[#4a5070]"
                  : "border border-[rgba(61,220,132,0.2)] bg-[rgba(61,220,132,0.1)] text-[#3ddc84]"
              }`}
            >
              {statusLabel}
            </span>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-[8px]">
          {!isArchived ? (
            <button
              type="button"
              onClick={openLandlordEditModal}
              className="rounded-[6px] border border-[#252a3a] bg-[#141720] px-[12px] py-[4px] text-[11px] text-[#8892b0] transition-colors hover:border-[#242840] hover:text-[#edf0f7]"
            >
              Bearbeiten
            </button>
          ) : null}
          {isArchived ? (
            <button
              type="button"
              onClick={() => setRestoreModalOpen(true)}
              className="rounded-[6px] border border-[rgba(61,220,132,0.25)] bg-[rgba(61,220,132,0.1)] px-[12px] py-[4px] text-[11px] font-medium text-[#3ddc84] hover:bg-[rgba(61,220,132,0.15)]"
            >
              Reaktivieren
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setArchiveModalOpen(true)}
              className="rounded-[6px] border border-[rgba(245,166,35,0.25)] bg-transparent px-[12px] py-[4px] text-[11px] text-[#f5a623] transition-colors hover:bg-[rgba(245,166,35,0.08)]"
            >
              Archivieren
            </button>
          )}
        </div>
      </div>

      <div className="mx-auto grid max-w-[min(1400px,100%)] grid-cols-1 gap-[16px] px-[24px] py-[20px] lg:grid-cols-[1fr_300px] lg:items-start">
        <div className="flex flex-col gap-[12px]">
        <div className={cardBase}>
          <div className={cardHead}>
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-[10px] border border-[rgba(91,156,246,0.2)] bg-[rgba(91,156,246,0.1)] text-[14px] font-semibold text-[#5b9cf6]">
                {companyInitialsFromCompanyName(row.company_name?.trim() || title)}
              </div>
              <div className="min-w-0">
                <div className="text-[15px] font-semibold text-[#edf0f7]">{title}</div>
                <p className="mt-[2px] text-[10px] text-[#4a5070]">Verwaltung / Vermieter</p>
              </div>
            </div>
          </div>
          <div className={cardBody}>
            <div className="grid grid-cols-2 gap-[12px]">
              <div className="flex flex-col gap-[3px]">
                <span className={labelSm}>Firma</span>
                <span className="text-[12px] font-medium text-[#edf0f7]">{dash(row.company_name)}</span>
              </div>
              <div className="flex flex-col gap-[3px]">
                <span className={labelSm}>Kontaktperson</span>
                <span className="text-[12px] font-medium text-[#edf0f7]">{dash(row.contact_name)}</span>
              </div>
              <div className="flex flex-col gap-[3px]">
                <span className={labelSm}>E-Mail</span>
                <span className="text-[11px] font-medium text-[#5b9cf6]">{dash(row.email)}</span>
              </div>
              <div className="flex flex-col gap-[3px]">
                <span className={labelSm}>Telefon</span>
                <span className="font-mono text-[11px] font-medium text-[#edf0f7]">{dash(row.phone)}</span>
              </div>
            </div>
            <div className="my-3 h-px bg-[#1c2035]" />
            <div className="flex flex-col gap-[3px]">
              <span className={labelSm}>Adresse</span>
              <div className="flex items-start gap-2">
                <span className="text-[9px] text-[#4a5070]" aria-hidden>
                  📍
                </span>
                <div className="min-w-0 flex-1 space-y-1 text-[11px] font-medium text-[#5b9cf6]">
                  <p>{addrLine1 ? addrLine1 : "—"}</p>
                  <p>{addrLine2 ? addrLine2 : "—"}</p>
                  <p>{addrLine3 ? addrLine3 : "—"}</p>
                </div>
                {addrLine1 || plz || city ? (
                  <button
                    type="button"
                    title="In Google Maps öffnen"
                    aria-label="In Google Maps öffnen"
                    onClick={() =>
                      window.open(
                        buildGoogleMapsSearchUrl(row.address_line1, row.postal_code, row.city),
                        "_blank",
                        "noopener,noreferrer"
                      )
                    }
                    className="inline-flex shrink-0 items-center justify-center rounded-[6px] border border-[#1c2035] bg-transparent p-1 text-[#4a5070] hover:border-[#242840] hover:text-[#8892b0]"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                  </button>
                ) : null}
              </div>
            </div>
            <div className="my-3 h-px bg-[#1c2035]" />
            <div className="grid grid-cols-2 gap-[12px]">
              <div className="col-span-2 flex flex-col gap-[3px]">
                <span className={labelSm}>Website</span>
                <div className="text-[12px] font-medium">
                  {row.website?.trim() ? (
                    <a
                      href={
                        /^https?:\/\//i.test(row.website.trim())
                          ? row.website.trim()
                          : `https://${row.website.trim()}`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#5b9cf6] hover:underline"
                    >
                      {row.website.trim()}
                    </a>
                  ) : (
                    <span className="font-normal text-[#4a5070]">—</span>
                  )}
                </div>
              </div>
              <div className="col-span-2 flex flex-col gap-[3px]">
                <span className={labelSm}>Allgemeine Notizen</span>
                <p
                  className={`whitespace-pre-wrap text-[12px] ${
                    row.notes?.trim() ? "font-medium text-[#edf0f7]" : "font-normal text-[#4a5070]"
                  }`}
                >
                  {dash(row.notes)}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className={cardBase}>
          <div className={`${cardHead} flex-wrap gap-2`}>
            <div className={cardTitle}>Dokumente</div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={landlordDocCategory}
                onChange={(e) => setLandlordDocCategory(e.target.value)}
                disabled={landlordDocUploading || !id}
                className="cursor-pointer appearance-none rounded-[6px] border border-[#1c2035] bg-[#141720] px-[8px] py-[4px] font-['DM_Sans'] text-[11px] text-[#8892b0] disabled:opacity-70"
              >
                <option value="">—</option>
                <option value="rent_contract">Mietvertrag</option>
                <option value="id_document">Ausweis</option>
                <option value="debt_register">Betreibungsregister</option>
                <option value="insurance">Versicherung</option>
                <option value="other">Sonstiges</option>
              </select>
              <input
                ref={landlordDocFileInputRef}
                type="file"
                className="hidden"
                onChange={handleLandlordDocSelected}
              />
              <button
                type="button"
                onClick={handleLandlordDocPick}
                disabled={landlordDocUploading || !id}
                className="rounded-[6px] border border-[rgba(91,156,246,0.28)] bg-[rgba(91,156,246,0.1)] px-[12px] py-[3px] text-[10px] font-medium text-[#5b9cf6] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {landlordDocUploading ? "Wird hochgeladen …" : "Hochladen"}
              </button>
            </div>
          </div>
          <div className={cardBody}>
            {landlordDocUploadError ? (
              <p className="mb-2 text-[13px] text-[#ff5f6d]">{landlordDocUploadError}</p>
            ) : null}
            {landlordDocsLoading ? (
              <p className="m-0 text-[12px] text-[#4a5070]">Lade Dokumente …</p>
            ) : landlordDocuments.length === 0 ? (
              <p className="m-0 text-[12px] text-[#4a5070]">Keine Dokumente vorhanden</p>
            ) : (
              <div className="flex flex-col">
                {landlordDocuments.map((doc) => (
                  <div
                    key={String(doc.id)}
                    className="flex items-center gap-[10px] border-b border-[#1c2035] py-[9px] last:border-b-0"
                  >
                    <div className="flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-[6px] border border-[rgba(255,95,109,0.2)] bg-[rgba(255,95,109,0.1)] text-[9px] font-bold text-[#ff5f6d]">
                      {formatLandlordDocumentType(doc)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] font-medium text-[#edf0f7]">{doc.file_name || "—"}</div>
                      <div className="text-[10px] text-[#4a5070]">
                        {formatLandlordDocumentType(doc)} · {formatLandlordDocumentCategoryLabel(doc.category)} ·{" "}
                        {formatLandlordDocumentDate(doc.created_at)} ·{" "}
                        {doc.uploaded_by_name != null && doc.uploaded_by_name !== ""
                          ? doc.uploaded_by_name
                          : "—"}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleOpenLandlordDocument(doc.id)}
                      className="shrink-0 rounded-[6px] border border-[#252a3a] bg-[#141720] px-[10px] py-[3px] text-[10px] text-[#8892b0] transition-colors hover:border-[#242840] hover:text-[#edf0f7]"
                    >
                      Öffnen →
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteLandlordDocument(doc.id)}
                      className="shrink-0 rounded-[6px] border border-[#1c2035] bg-transparent px-[10px] py-[3px] text-[10px] text-[#4a5070] transition-colors hover:border-[rgba(255,95,109,0.2)] hover:bg-[rgba(255,95,109,0.1)] hover:text-[#ff5f6d]"
                    >
                      Löschen
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className={cardBase}>
          <div className={cardHead}>
            <div className={cardTitle}>Notizen</div>
          </div>
          <div className={cardBody}>
            {!isArchived ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  saveNewNote();
                }}
              >
                <textarea
                  id="landlord-new-note"
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
                {newNoteErr ? (
                  <p className="mt-2 text-sm text-[#ff5f6d]">{newNoteErr}</p>
                ) : null}
                {newNoteSubmitErr ? (
                  <p className="mt-2 text-sm text-[#ff5f6d]">{newNoteSubmitErr}</p>
                ) : null}
                <button
                  type="submit"
                  disabled={newNoteSaving}
                  className="mt-[8px] rounded-[6px] border border-[rgba(91,156,246,0.28)] bg-[rgba(91,156,246,0.1)] px-[14px] py-[5px] text-[11px] font-medium text-[#5b9cf6] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {newNoteSaving ? "Speichern …" : "Notiz speichern"}
                </button>
              </form>
            ) : null}
            <div
              className={
                !isArchived ? "mt-[12px] border-t border-[#1c2035] pt-[12px]" : "mt-0 border-t border-[#1c2035] pt-[12px]"
              }
            >
              {!notes.length ? (
                <p className="text-[12px] text-[#4a5070]">Noch keine Notizen</p>
              ) : (
                <ul className="m-0 list-none p-0">
                  {notes.map((n) => (
                    <li
                      key={n.id}
                      className="border-b border-[#1c2035] py-[10px] last:border-b-0"
                    >
                      {editingNoteId === n.id ? (
                        <div>
                          <textarea
                            value={editDraft}
                            onChange={(e) => {
                              setEditDraft(e.target.value);
                              setEditErr(null);
                            }}
                            disabled={editSaving}
                            rows={4}
                            className="min-h-[70px] w-full resize-y rounded-[7px] border border-[#1c2035] bg-[#141720] px-[12px] py-[10px] font-['DM_Sans'] text-[12px] text-[#edf0f7] outline-none focus:border-[#242840] disabled:opacity-60"
                          />
                          {editErr ? <p className="mt-2 text-sm text-[#ff5f6d]">{editErr}</p> : null}
                          <div className="mt-2 flex flex-wrap gap-2">
                            <button
                              type="button"
                              disabled={editSaving}
                              onClick={saveEditNote}
                              className="rounded-[6px] border border-[rgba(91,156,246,0.28)] bg-[rgba(91,156,246,0.1)] px-[12px] py-[5px] text-[11px] font-medium text-[#5b9cf6] disabled:cursor-not-allowed disabled:opacity-70"
                            >
                              {editSaving ? "Speichern …" : "Speichern"}
                            </button>
                            <button
                              type="button"
                              disabled={editSaving}
                              onClick={cancelEditNote}
                              className="rounded-[6px] border border-[#252a3a] bg-[#141720] px-[12px] py-[5px] text-[11px] text-[#8892b0] hover:border-[#242840] hover:text-[#edf0f7] disabled:opacity-60"
                            >
                              Abbrechen
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <p className="mb-[4px] whitespace-pre-wrap text-[12px] text-[#edf0f7]">{n.content}</p>
                          <p className="text-[10px] text-[#4a5070]">
                            {formatDateTime(n.created_at)} · {n.author_name || "—"}
                          </p>
                          {n.updated_at ? (
                            <p className="mt-1 text-[10px] text-[#4a5070]">
                              Bearbeitet {formatDateTime(n.updated_at)} · {n.editor_name || "—"}
                            </p>
                          ) : null}
                          {!isArchived ? (
                            <button
                              type="button"
                              onClick={() => startEditNote(n)}
                              className="mt-[3px] cursor-pointer border-none bg-transparent p-0 text-[10px] text-[#5b9cf6]"
                            >
                              Bearbeiten
                            </button>
                          ) : null}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        <div className={cardBase}>
          <div className={cardHead}>
            <div className={cardTitle}>Historia · Änderungsprotokoll</div>
            <span className="text-[10px] text-[#4a5070]">{auditLogs.length}</span>
          </div>
          <div className={cardBody}>
            {auditLoading ? (
              <p className="m-0 text-[12px] text-[#4a5070]">Lade Verlauf …</p>
            ) : auditError ? (
              <p className="m-0 text-[12px] text-[#ff5f6d]">{auditError}</p>
            ) : auditLogs.length === 0 ? (
              <p className="m-0 text-[12px] text-[#4a5070]">Noch keine Einträge im Audit-Protokoll.</p>
            ) : (
              <ul className="m-0 list-none p-0">
                {auditLogs.map((log) => {
                  const { summary, changes } = formatAuditLog(log, {
                    entityType: "landlord",
                    userNameById,
                  });
                  const actor = auditActorDisplay(log);
                  return (
                    <li key={log.id} className="border-b border-[#1c2035] py-[12px] last:border-b-0">
                      <div className="mb-[4px] text-[11px] font-medium text-[#edf0f7]">{summary}</div>
                      <div className="mb-[8px] text-[10px] text-[#4a5070]">
                        {formatAuditTimestamp(log.created_at)}
                        {log.action ? ` · ${auditActionLabel(log.action)}` : ""}
                        {" · "}
                        <span className="text-[#f5a623]">{actor}</span>
                      </div>
                      {changes && changes.length > 0
                        ? changes.map((c, idx) => {
                            if (auditNarrativeOnlyChange(c)) {
                              return (
                                <div
                                  key={idx}
                                  className="mb-2 rounded-[6px] bg-[#141720] p-2 text-[10px] text-[#edf0f7]"
                                >
                                  {auditDisplayCell(c.new)}
                                </div>
                              );
                            }
                            return (
                              <div key={idx} className="mb-2">
                                <div className="mb-1 text-[10px] text-[#8892b0]">{c.label}</div>
                                <div className="grid grid-cols-2 gap-[6px]">
                                  <div className="rounded-[6px] bg-[#141720] px-[10px] py-[6px]">
                                    <div className="mb-[3px] text-[8px] uppercase tracking-[0.5px] text-[#4a5070]">
                                      Alt
                                    </div>
                                    <div className="break-words font-mono text-[10px] text-[#ff5f6d]">
                                      {auditDisplayCell(c.old)}
                                    </div>
                                  </div>
                                  <div className="rounded-[6px] bg-[#141720] px-[10px] py-[6px]">
                                    <div className="mb-[3px] text-[8px] uppercase tracking-[0.5px] text-[#4a5070]">
                                      Neu
                                    </div>
                                    <div className="break-words font-mono text-[10px] text-[#3ddc84]">
                                      {auditDisplayCell(c.new)}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })
                        : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
        </div>

        <aside className="flex flex-col gap-[12px] lg:max-w-[300px]">
          <div className={cardBase}>
            <div className={cardHead}>
              <div className={cardTitle}>Zugeordnete Units</div>
              <span className="text-[10px] text-[#4a5070]">{assignedUnits.length}</span>
            </div>
            <div className={cardBody}>
          {assignedUnitsLoading ? (
            <div className="space-y-2" aria-busy="true">
              <p className="text-[12px] text-[#4a5070]">Lade Units …</p>
              <div className="h-2 w-full max-w-xs animate-pulse rounded bg-[#141720]" />
              <div className="h-2 w-full max-w-[14rem] animate-pulse rounded bg-[#141720]" />
            </div>
          ) : assignedUnitsError ? (
            <p className="text-[12px] text-[#ff5f6d]">{assignedUnitsError}</p>
          ) : assignedUnits.length === 0 ? (
            <div className="rounded-[9px] border border-dashed border-[#1c2035] bg-[#141720] px-5 py-8 text-center">
              <p className="text-[12px] font-medium text-[#edf0f7]">Keine Units zugeordnet</p>
              <p className="mx-auto mt-2 max-w-md text-[11px] text-[#4a5070]">
                Dieser Verwaltung sind aktuell noch keine Units zugewiesen.
              </p>
            </div>
          ) : (
            <ul className="m-0 list-none p-0">
              {assignedUnits.map((u) => {
                const uid = u.unitId ?? u.id;
                const title = (u.title || u.name || "").trim() || "—";
                const typeLabel = normalizeUnitTypeLabel(u.type) || String(u.type || "").trim() || "—";
                const addr = String(u.address || "").trim();
                const zip = String(u.zip ?? "").trim();
                const city = String(u.city || "").trim();
                const zipCity = [zip, city].filter(Boolean).join(" ");
                const propTitle = String(u.property_title || "").trim();
                const occKey = getUnitOccupancyStatus(u, occupancyRooms, occupancyTenancies);
                const rentRaw = sumActiveTenancyMonthlyRentForUnit(u, occupancyTenancies ?? []);
                const rentN = Number(rentRaw);
                const rentStr = formatChfMonthly(rentRaw);
                const addrLine = [addr, zipCity].filter(Boolean).join(", ");
                return (
                  <li key={String(uid)} className="mb-[8px] last:mb-0">
                    <Link
                      to={`/admin/units/${encodeURIComponent(uid)}`}
                      className="block cursor-pointer rounded-[9px] border border-[#1c2035] bg-[#141720] px-[14px] py-[12px] transition-colors hover:border-[#242840]"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate text-[12px] font-medium text-[#5b9cf6]">{title}</span>
                        <div className="flex shrink-0 gap-[4px]">
                          <span
                            className={`inline-flex items-center rounded-full px-[6px] py-[1px] text-[9px] font-semibold ${unitTypeBadgeClasses(u.type)}`}
                          >
                            {typeLabel}
                          </span>
                          {occKey == null ? (
                            <span className="inline-flex items-center rounded-full border border-[#1c2035] bg-[#191c28] px-[6px] py-[1px] text-[9px] font-semibold text-[#4a5070]">
                              —
                            </span>
                          ) : (
                            <span
                              className={`inline-flex items-center rounded-full px-[6px] py-[1px] text-[9px] font-semibold ${landlordUnitOccBadgeClass(occKey)}`}
                            >
                              {formatOccupancyStatusDe(occKey)}
                            </span>
                          )}
                        </div>
                      </div>
                      {addrLine ? (
                        <div className="mb-[6px] mt-[3px] text-[11px] text-[#4a5070]">
                          {propTitle ? `${propTitle} · ` : ""}
                          {addrLine}
                        </div>
                      ) : propTitle ? (
                        <div className="mb-[6px] mt-[3px] text-[11px] text-[#4a5070]">{propTitle}</div>
                      ) : null}
                      <p className="text-[11px] text-[#8892b0]">
                        Miete (Mieter):{" "}
                        <span
                          className={
                            rentN > 0 && !Number.isNaN(rentN) ? "font-mono text-[#3ddc84]" : "text-[#4a5070]"
                          }
                        >
                          {rentStr}
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

        <div className={cardBase}>
          <div className={cardHead}>
            <div className={cardTitle}>Bewirtschafter</div>
            <span className="text-[10px] text-[#4a5070]">{sortedPropertyManagers.length}</span>
          </div>
          <div className={cardBody}>
            {propertyManagersLoading ? (
              <div className="space-y-2" aria-busy="true">
                <p className="text-[12px] text-[#4a5070]">Lade Bewirtschafter …</p>
                <div className="h-2 w-full max-w-xs animate-pulse rounded bg-[#141720]" />
                <div className="h-2 w-full max-w-[14rem] animate-pulse rounded bg-[#141720]" />
              </div>
            ) : propertyManagersError ? (
              <p className="text-[12px] text-[#ff5f6d]">{propertyManagersError}</p>
            ) : sortedPropertyManagers.length === 0 ? (
              <div className="space-y-3">
                <p className="text-[12px] text-[#4a5070]">Kein Bewirtschafter zugeordnet</p>
                <Link
                  to="/admin/bewirtschafter"
                  className="inline-flex items-center rounded-[6px] border border-[#252a3a] bg-[#141720] px-[12px] py-[4px] text-[11px] font-medium text-[#8892b0] hover:border-[#242840] hover:text-[#edf0f7]"
                >
                  Bewirtschafter zuweisen
                </Link>
              </div>
            ) : (
              <ul className="m-0 list-none p-0">
                {sortedPropertyManagers.map((pm) => (
                  <li
                    key={pm.id}
                    className="mb-[6px] rounded-[8px] border border-[#1c2035] bg-[#141720] px-[12px] py-[10px] last:mb-0"
                  >
                    <Link
                      to={`/admin/bewirtschafter/${encodeURIComponent(pm.id)}`}
                      className="block text-[12px] font-medium text-[#5b9cf6] hover:underline"
                    >
                      {propertyManagerDisplayName(pm)}
                    </Link>
                    {pm.email != null && String(pm.email).trim() !== "" ? (
                      <p className="mt-[3px] text-[10px] text-[#4a5070]">{String(pm.email).trim()}</p>
                    ) : null}
                    {pm.phone != null && String(pm.phone).trim() !== "" ? (
                      <p className="mt-0.5 text-[10px] text-[#4a5070]">{String(pm.phone).trim()}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className={cardBase}>
          <div className={cardHead}>
            <div className={cardTitle}>Schnellinfo</div>
          </div>
          <div className="divide-y divide-[#1c2035] p-0">
            <div className="flex items-center justify-between px-[16px] py-[9px]">
              <span className="text-[11px] text-[#4a5070]">Status</span>
              <span className="text-[12px] font-medium text-[#edf0f7]">
                {isArchived ? (
                  <span className="inline-flex items-center rounded-full border border-[#1c2035] bg-[#191c28] px-2 py-[1px] text-[10px] font-semibold text-[#8892b0]">
                    Archiviert
                  </span>
                ) : isInactive ? (
                  <span className="inline-flex items-center rounded-full border border-[#1c2035] bg-[#191c28] px-2 py-[1px] text-[10px] font-semibold text-[#4a5070]">
                    Inaktiv
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full border border-[rgba(61,220,132,0.2)] bg-[rgba(61,220,132,0.1)] px-2 py-[1px] text-[10px] font-semibold text-[#3ddc84]">
                    Aktiv
                  </span>
                )}
              </span>
            </div>
            <div className="flex items-center justify-between px-[16px] py-[9px]">
              <span className="text-[11px] text-[#4a5070]">ID</span>
              <span className="break-all text-right text-[12px] font-medium text-[#edf0f7]">{String(row.id)}</span>
            </div>
            <div className="flex items-center justify-between px-[16px] py-[9px]">
              <span className="text-[11px] text-[#4a5070]">E-Mail</span>
              <span className="max-w-[60%] break-all text-right text-[12px] font-medium text-[#edf0f7]">
                {dash(row.email)}
              </span>
            </div>
            <div className="flex items-center justify-between px-[16px] py-[9px]">
              <span className="text-[11px] text-[#4a5070]">Telefon</span>
              <span className="text-right font-mono text-[12px] font-medium text-[#edf0f7]">{dash(row.phone)}</span>
            </div>
            {row.created_at ? (
              <div className="flex items-center justify-between px-[16px] py-[9px]">
                <span className="text-[11px] text-[#4a5070]">Erfasst</span>
                <span className="text-right text-[12px] font-medium text-[#edf0f7]">
                  {formatDateTime(row.created_at)}
                </span>
              </div>
            ) : null}
            {row.updated_at ? (
              <div className="flex items-center justify-between px-[16px] py-[9px]">
                <span className="text-[11px] text-[#4a5070]">Aktualisiert</span>
                <span className="text-right text-[12px] font-medium text-[#edf0f7]">
                  {formatDateTime(row.updated_at)}
                </span>
              </div>
            ) : null}
          </div>
        </div>
        </aside>
      </div>

      {landlordEditOpen && (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 p-4"
          onClick={() => !landlordEditSaving && setLandlordEditOpen(false)}
          role="presentation"
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[14px] border border-black/10 bg-white p-6 shadow-lg dark:border-white/[0.07] dark:bg-[#141824]"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="landlord-edit-title"
          >
            <h2 id="landlord-edit-title" className="mb-4 text-lg font-semibold text-[#0f172a] dark:text-[#eef2ff]">
              Verwaltung bearbeiten
            </h2>
            <div className="space-y-4">
              <div>
                <label htmlFor="ll-edit-company" className="mb-1 block text-[10px] text-[#64748b] dark:text-[#6b7a9a]">
                  Firma (optional)
                </label>
                <input
                  id="ll-edit-company"
                  type="text"
                  value={landlordEditForm.company_name}
                  onChange={(e) =>
                    setLandlordEditForm((f) => ({ ...f, company_name: e.target.value }))
                  }
                  disabled={landlordEditSaving}
                  className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2 text-sm text-[#0f172a] placeholder:text-[#64748b] disabled:opacity-60 dark:border-white/[0.08] dark:bg-[#111520] dark:text-[#eef2ff] dark:placeholder:text-[#6b7a9a]"
                />
              </div>
              <div>
                <label htmlFor="ll-edit-contact" className="mb-1 block text-[10px] text-[#64748b] dark:text-[#6b7a9a]">
                  Kontaktperson (optional)
                </label>
                <input
                  id="ll-edit-contact"
                  type="text"
                  value={landlordEditForm.contact_name}
                  onChange={(e) =>
                    setLandlordEditForm((f) => ({ ...f, contact_name: e.target.value }))
                  }
                  disabled={landlordEditSaving}
                  className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2 text-sm text-[#0f172a] placeholder:text-[#64748b] disabled:opacity-60 dark:border-white/[0.08] dark:bg-[#111520] dark:text-[#eef2ff] dark:placeholder:text-[#6b7a9a]"
                />
              </div>
              <div>
                <label htmlFor="ll-edit-email" className="mb-1 block text-[10px] text-[#64748b] dark:text-[#6b7a9a]">
                  E-Mail *
                </label>
                <input
                  id="ll-edit-email"
                  type="email"
                  value={landlordEditForm.email}
                  onChange={(e) => setLandlordEditForm((f) => ({ ...f, email: e.target.value }))}
                  disabled={landlordEditSaving}
                  className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2 text-sm text-[#0f172a] placeholder:text-[#64748b] disabled:opacity-60 dark:border-white/[0.08] dark:bg-[#111520] dark:text-[#eef2ff] dark:placeholder:text-[#6b7a9a]"
                />
              </div>
              <div>
                <label htmlFor="ll-edit-phone" className="mb-1 block text-[10px] text-[#64748b] dark:text-[#6b7a9a]">
                  Telefon (optional)
                </label>
                <input
                  id="ll-edit-phone"
                  type="text"
                  value={landlordEditForm.phone}
                  onChange={(e) => setLandlordEditForm((f) => ({ ...f, phone: e.target.value }))}
                  disabled={landlordEditSaving}
                  className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2 text-sm text-[#0f172a] placeholder:text-[#64748b] disabled:opacity-60 dark:border-white/[0.08] dark:bg-[#111520] dark:text-[#eef2ff] dark:placeholder:text-[#6b7a9a]"
                />
              </div>
              <div>
                <label htmlFor="ll-edit-addr" className="mb-1 block text-[10px] text-[#64748b] dark:text-[#6b7a9a]">
                  Adresse *
                </label>
                <input
                  id="ll-edit-addr"
                  type="text"
                  value={landlordEditForm.address_line1}
                  onChange={(e) =>
                    setLandlordEditForm((f) => ({ ...f, address_line1: e.target.value }))
                  }
                  disabled={landlordEditSaving}
                  placeholder="Strasse Nr."
                  className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2 text-sm text-[#0f172a] placeholder:text-[#64748b] disabled:opacity-60 dark:border-white/[0.08] dark:bg-[#111520] dark:text-[#eef2ff] dark:placeholder:text-[#6b7a9a]"
                />
              </div>
              <div>
                <label htmlFor="ll-edit-plz" className="mb-1 block text-[10px] text-[#64748b] dark:text-[#6b7a9a]">
                  PLZ *
                </label>
                <input
                  id="ll-edit-plz"
                  type="text"
                  value={landlordEditForm.postal_code}
                  onChange={handleLandlordEditPostalCodeChange}
                  disabled={landlordEditSaving}
                  className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2 text-sm text-[#0f172a] placeholder:text-[#64748b] disabled:opacity-60 dark:border-white/[0.08] dark:bg-[#111520] dark:text-[#eef2ff] dark:placeholder:text-[#6b7a9a]"
                />
                {landlordEditPlzNotFound ? (
                  <p className="mt-1 text-xs text-[#64748b] dark:text-[#6b7a9a]">PLZ nicht gefunden</p>
                ) : null}
              </div>
              <div>
                <label htmlFor="ll-edit-city" className="mb-1 block text-[10px] text-[#64748b] dark:text-[#6b7a9a]">
                  Ort *
                </label>
                <input
                  id="ll-edit-city"
                  type="text"
                  value={landlordEditForm.city}
                  onChange={(e) => setLandlordEditForm((f) => ({ ...f, city: e.target.value }))}
                  disabled={landlordEditSaving}
                  className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2 text-sm text-[#0f172a] placeholder:text-[#64748b] disabled:opacity-60 dark:border-white/[0.08] dark:bg-[#111520] dark:text-[#eef2ff] dark:placeholder:text-[#6b7a9a]"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    window.open(
                      buildGoogleMapsSearchUrl(
                        landlordEditForm.address_line1,
                        landlordEditForm.postal_code,
                        landlordEditForm.city
                      ),
                      "_blank",
                      "noopener,noreferrer"
                    );
                    setLandlordEditAddrBusy(true);
                    setLandlordEditCantonHint("Kanton wird ermittelt …");
                    verifyAdminAddress({
                      address_line1: landlordEditForm.address_line1,
                      postal_code: landlordEditForm.postal_code,
                      city: landlordEditForm.city,
                    })
                      .then((res) => {
                        const c = res?.normalized?.canton;
                        if (res?.valid && c != null && String(c).trim() !== "") {
                          const code = String(c).trim().toUpperCase();
                          setLandlordEditForm((f) => ({ ...f, canton: code }));
                          setLandlordEditCantonHint("Kanton automatisch erkannt.");
                        } else {
                          setLandlordEditCantonHint(
                            "Kein Kanton automatisch ermittelbar. Bitte bei Bedarf manuell wählen."
                          );
                        }
                      })
                      .catch(() =>
                        setLandlordEditCantonHint("Kanton konnte nicht automatisch ermittelt werden.")
                      )
                      .finally(() => setLandlordEditAddrBusy(false));
                  }}
                  disabled={
                    landlordEditSaving ||
                    landlordEditAddrBusy ||
                    !(landlordEditForm.address_line1 || "").trim() ||
                    !(landlordEditForm.postal_code || "").trim() ||
                    !(landlordEditForm.city || "").trim()
                  }
                  className="self-start rounded-[8px] border border-black/10 bg-transparent px-3 py-2 text-xs font-semibold text-[#64748b] hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/[0.1] dark:text-[#8090b0] dark:hover:bg-white/[0.04]"
                >
                  {landlordEditAddrBusy ? "…" : "Adresse prüfen"}
                </button>
                <p className="text-xs text-[#64748b] dark:text-[#6b7a9a]">
                  Öffnet Google Maps in einem neuen Tab. Der Kanton wird im Hintergrund ergänzt, wenn die
                  Abfrage einen Wert liefert.
                </p>
                {landlordEditCantonHint ? (
                  <p className="text-xs text-[#64748b] dark:text-[#6b7a9a]">{landlordEditCantonHint}</p>
                ) : null}
              </div>
              <div>
                <label htmlFor="ll-edit-canton" className="mb-1 block text-[10px] text-[#64748b] dark:text-[#6b7a9a]">
                  Kanton
                </label>
                <p className="mb-1 text-xs text-[#64748b] dark:text-[#6b7a9a]">
                  Optional — oft nach «Adresse prüfen» gesetzt; manuelle Auswahl möglich.
                </p>
                <select
                  id="ll-edit-canton"
                  value={landlordEditForm.canton || ""}
                  onChange={(e) =>
                    setLandlordEditForm((f) => ({ ...f, canton: e.target.value }))
                  }
                  disabled={landlordEditSaving || landlordEditCantonLockedByPlz}
                  className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2 text-sm text-[#0f172a] placeholder:text-[#64748b] disabled:opacity-60 dark:border-white/[0.08] dark:bg-[#111520] dark:text-[#eef2ff] dark:placeholder:text-[#6b7a9a]"
                >
                  <option value="">—</option>
                  {landlordEditForm.canton && !SWISS_CANTON_CODES.includes(landlordEditForm.canton) ? (
                    <option value={landlordEditForm.canton}>{landlordEditForm.canton}</option>
                  ) : null}
                  {SWISS_CANTON_CODES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="ll-edit-website" className="mb-1 block text-[10px] text-[#64748b] dark:text-[#6b7a9a]">
                  Website (optional)
                </label>
                <input
                  id="ll-edit-website"
                  type="text"
                  value={landlordEditForm.website}
                  onChange={(e) =>
                    setLandlordEditForm((f) => ({ ...f, website: e.target.value }))
                  }
                  disabled={landlordEditSaving}
                  className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2 text-sm text-[#0f172a] placeholder:text-[#64748b] disabled:opacity-60 dark:border-white/[0.08] dark:bg-[#111520] dark:text-[#eef2ff] dark:placeholder:text-[#6b7a9a]"
                />
              </div>
              <div>
                <label htmlFor="ll-edit-notes" className="mb-1 block text-[10px] text-[#64748b] dark:text-[#6b7a9a]">
                  Allgemeine Notizen (optional)
                </label>
                <textarea
                  id="ll-edit-notes"
                  value={landlordEditForm.notes}
                  onChange={(e) =>
                    setLandlordEditForm((f) => ({ ...f, notes: e.target.value }))
                  }
                  disabled={landlordEditSaving}
                  rows={3}
                  className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2 text-sm text-[#0f172a] placeholder:text-[#64748b] disabled:opacity-60 dark:border-white/[0.08] dark:bg-[#111520] dark:text-[#eef2ff] dark:placeholder:text-[#6b7a9a]"
                />
              </div>
              <div>
                <label htmlFor="ll-edit-status" className="mb-1 block text-[10px] text-[#64748b] dark:text-[#6b7a9a]">
                  Status
                </label>
                <select
                  id="ll-edit-status"
                  value={landlordEditForm.status}
                  onChange={(e) =>
                    setLandlordEditForm((f) => ({ ...f, status: e.target.value }))
                  }
                  disabled={landlordEditSaving}
                  className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2 text-sm text-[#0f172a] placeholder:text-[#64748b] disabled:opacity-60 dark:border-white/[0.08] dark:bg-[#111520] dark:text-[#eef2ff] dark:placeholder:text-[#6b7a9a]"
                >
                  <option value="active">Aktiv</option>
                  <option value="inactive">Inaktiv</option>
                </select>
              </div>
              {landlordEditErr ? <p className="text-sm text-[#f87171]">{landlordEditErr}</p> : null}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={submitLandlordEdit}
                  disabled={landlordEditSaving}
                  className="flex-1 rounded-[8px] border-none bg-gradient-to-r from-[#5b8cff] to-[#7c5cfc] px-3 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
                >
                  {landlordEditSaving ? "Speichern …" : "Speichern"}
                </button>
                <button
                  type="button"
                  disabled={landlordEditSaving}
                  onClick={() => setLandlordEditOpen(false)}
                  className="rounded-[8px] border border-black/10 bg-transparent px-3 py-2 text-sm font-semibold text-[#64748b] hover:bg-slate-100 dark:border-white/[0.1] dark:text-[#8090b0] dark:hover:bg-white/[0.04]"
                >
                  Abbrechen
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {restoreModalOpen && (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 p-4"
          onClick={() => !restoring && setRestoreModalOpen(false)}
          role="presentation"
        >
          <div
            className="w-full max-w-md rounded-[14px] border border-black/10 bg-white p-6 shadow-lg dark:border-white/[0.07] dark:bg-[#141824]"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="restore-landlord-title"
          >
            <h2 id="restore-landlord-title" className="mb-3 text-lg font-semibold text-[#0f172a] dark:text-[#eef2ff]">
              Verwaltung reaktivieren?
            </h2>
            <p className="mb-6 text-sm text-[#64748b] dark:text-[#6b7a9a]">
              Die Verwaltung wird wieder aktiv und erscheint in der normalen Verwaltungsliste unter «Aktiv».
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={restoring}
                onClick={() => setRestoreModalOpen(false)}
                className="rounded-[8px] border border-black/10 bg-transparent px-4 py-2 text-sm font-semibold text-[#64748b] hover:bg-slate-100 disabled:opacity-50 dark:border-white/[0.1] dark:text-[#8090b0] dark:hover:bg-white/[0.04]"
              >
                Abbrechen
              </button>
              <button
                type="button"
                disabled={restoring}
                onClick={() => {
                  setRestoring(true);
                  restoreAdminLandlord(id)
                    .then(() => fetchAdminLandlord(id))
                    .then((data) => {
                      toast.success("Verwaltung wurde reaktiviert.");
                      setRestoreModalOpen(false);
                      if (data) setRow(data);
                    })
                    .then(() => loadAuditLogs({ silent: true }))
                    .catch((e) => {
                      toast.error(e.message || "Reaktivieren fehlgeschlagen.");
                    })
                    .finally(() => setRestoring(false));
                }}
                className="rounded-[8px] border border-emerald-300 bg-emerald-100 px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-200/80 disabled:opacity-50 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400 dark:hover:bg-emerald-500/15"
              >
                {restoring ? "…" : "Jetzt reaktivieren"}
              </button>
            </div>
          </div>
        </div>
      )}

      {archiveModalOpen && (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 p-4"
          onClick={() => !archiving && setArchiveModalOpen(false)}
          role="presentation"
        >
          <div
            className="w-full max-w-md rounded-[14px] border border-black/10 bg-white p-6 shadow-lg dark:border-white/[0.07] dark:bg-[#141824]"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="archive-landlord-title"
          >
            <h2 id="archive-landlord-title" className="mb-3 text-lg font-semibold text-[#0f172a] dark:text-[#eef2ff]">
              Verwaltung archivieren?
            </h2>
            <p className="mb-6 text-sm text-[#64748b] dark:text-[#6b7a9a]">
              Die Verwaltung wird archiviert. Sie erscheint nicht mehr in der normalen Verwaltungsliste.
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={archiving}
                onClick={() => setArchiveModalOpen(false)}
                className="rounded-[8px] border border-black/10 bg-transparent px-4 py-2 text-sm font-semibold text-[#64748b] hover:bg-slate-100 disabled:opacity-50 dark:border-white/[0.1] dark:text-[#8090b0] dark:hover:bg-white/[0.04]"
              >
                Abbrechen
              </button>
              <button
                type="button"
                disabled={archiving}
                onClick={() => {
                  setArchiving(true);
                  deleteAdminLandlord(id)
                    .then(() => {
                      toast.success("Verwaltung wurde archiviert.");
                      setArchiveModalOpen(false);
                      navigate("/admin/landlords", { replace: true });
                    })
                    .catch((e) => {
                      toast.error(e.message || "Archivieren fehlgeschlagen.");
                    })
                    .finally(() => setArchiving(false));
                }}
                className="rounded-[8px] border border-red-300 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50 dark:border-red-500/20 dark:bg-red-500/10 dark:text-[#f87171] dark:hover:bg-red-500/15"
              >
                {archiving ? "…" : "Jetzt archivieren"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminLandlordDetailPage;
