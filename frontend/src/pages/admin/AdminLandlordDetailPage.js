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
  normalizeUnit,
  restoreAdminLandlord,
  updateAdminLandlord,
  updateAdminLandlordNote,
  uploadAdminLandlordDocument,
  verifyAdminAddress,
} from "../../api/adminData";
import { SWISS_CANTON_CODES } from "../../constants/swissCantons";
import { lookupSwissPlz } from "../../data/swissPlzLookup";
import { COMMON_AUDIT_FIELD_LABELS } from "../../utils/auditFieldLabels";
import { resolveAuditFkDisplay } from "../../utils/auditFkDisplay";
import { buildGoogleMapsSearchUrl } from "../../utils/googleMapsUrl";
import { normalizeUnitTypeLabel } from "../../utils/unitDisplayId";

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

const LANDLORD_FIELD_LABELS = {
  ...COMMON_AUDIT_FIELD_LABELS,
  user_id: "Portal-Benutzer",
  company_name: "Firmenname",
  contact_name: "Kontaktperson",
  website: "Website",
  deleted_at: "Archivierung",
};

/** Display label for a landlord row (matches list/get shape). */
function landlordRowLabelForUser(ll) {
  if (!ll) return "";
  const c = String(ll.company_name || "").trim();
  const n = String(ll.contact_name || "").trim();
  if (c && n) return `${c} — ${n}`;
  return c || n || String(ll.email || "").trim() || ll.id;
}

function formatLandlordAuditDisplayValue(field, value, userNameById) {
  if (field === "deleted_at") {
    return value == null || value === "" ? "Aktiv" : "Archiviert";
  }
  if (field === "status") {
    if (value == null || value === "") return "—";
    const s = String(value).toLowerCase();
    return s === "inactive" ? "Inaktiv" : "Aktiv";
  }
  if (field === "user_id") {
    return resolveAuditFkDisplay(value, userNameById);
  }
  if (value == null || value === "") return "—";
  return String(value);
}

const thCell = {
  textAlign: "left",
  padding: "10px 12px",
  borderBottom: "1px solid rgba(255,255,255,0.05)",
  background: "#111520",
  color: "#6b7a9a",
  fontSize: "9px",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.8px",
};

const tdCell = {
  padding: "10px 12px",
  borderBottom: "1px solid rgba(255,255,255,0.05)",
  verticalAlign: "top",
  color: "#eef2ff",
};

const sectionCard = {
  background: "#141824",
  border: "1px solid rgba(255,255,255,0.07)",
  borderRadius: "14px",
  padding: "16px",
  marginBottom: "12px",
};

const sectionTitle = {
  fontSize: "9px",
  fontWeight: 700,
  color: "#6b7a9a",
  textTransform: "uppercase",
  letterSpacing: "1px",
  margin: "0 0 10px 0",
};

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
      <p className="min-h-[40vh] bg-[#07090f] px-2 py-8 text-[#6b7a9a]">Lade Verwaltung …</p>
    );
  }

  if (error || !row) {
    return (
      <div className="bg-[#07090f] px-2 py-6 text-[#eef2ff]">
        <p className="mb-3 text-[#f87171]">{error || "Nicht gefunden."}</p>
        <button
          type="button"
          onClick={() => navigate("/admin/landlords")}
          className="rounded-[8px] border border-white/[0.1] bg-transparent px-4 py-2 text-sm font-semibold text-[#8090b0] hover:bg-white/[0.04]"
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
    <div className="min-h-screen max-w-3xl bg-[#07090f] px-2 py-6 text-[#eef2ff]">
      <p className="mb-4">
        <Link
          to="/admin/landlords"
          className="text-sm font-semibold text-[#7aaeff] hover:underline"
        >
          ← Verwaltungen
        </Link>
      </p>

      <header className="mb-8 border-b border-white/[0.05] pb-2">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1 pr-4">
            <h1 className="text-[22px] font-bold leading-tight tracking-tight text-[#eef2ff] md:text-2xl">
              {title}
            </h1>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-3">
            {isArchived ? (
              <span className="inline-flex items-center rounded-full border border-white/[0.08] bg-white/[0.05] px-3 py-1 text-xs font-bold text-[#6b7a9a]">
                Archiviert
              </span>
            ) : null}
            <span
              className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold ${
                isInactive
                  ? "border border-white/[0.08] bg-white/[0.05] text-[#6b7a9a]"
                  : "border border-green-500/20 bg-green-500/10 text-green-400"
              }`}
            >
              {statusLabel}
            </span>
            {!isArchived ? (
              <button
                type="button"
                onClick={openLandlordEditModal}
                className="inline-flex items-center rounded-[8px] border border-white/[0.1] bg-transparent px-3 py-1.5 text-sm font-semibold text-[#8090b0] transition-colors hover:bg-white/[0.04]"
              >
                Bearbeiten
              </button>
            ) : null}
            {isArchived ? (
              <button
                type="button"
                onClick={() => setRestoreModalOpen(true)}
                className="inline-flex items-center rounded-[8px] border border-green-500/20 bg-green-500/10 px-3 py-1.5 text-sm font-semibold text-green-400 transition-colors hover:bg-green-500/15"
              >
                Reaktivieren
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setArchiveModalOpen(true)}
                className="inline-flex items-center rounded-[8px] border border-red-500/20 bg-red-500/10 px-3 py-1.5 text-sm font-semibold text-[#f87171] transition-colors hover:bg-red-500/15"
              >
                Archivieren
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="space-y-6">
        <section className="rounded-[14px] border border-white/[0.07] bg-[#141824] p-5 md:p-6">
          <h2 className="mb-4 text-[9px] font-bold uppercase tracking-[1px] text-[#6b7a9a]">Kontakt</h2>
          <div className="space-y-4">
            <div>
              <p className="text-[10px] text-[#6b7a9a]">Kontaktperson</p>
              <p className="mt-1 text-[13px] font-medium text-[#eef2ff]">{dash(row.contact_name)}</p>
            </div>
            <div>
              <p className="text-[10px] text-[#6b7a9a]">E-Mail</p>
              <p className="mt-1 text-[13px] font-medium text-[#eef2ff]">{dash(row.email)}</p>
            </div>
            <div>
              <p className="text-[10px] text-[#6b7a9a]">Telefon</p>
              <p className="mt-1 text-[13px] font-medium text-[#eef2ff]">{dash(row.phone)}</p>
            </div>
          </div>
        </section>

        <section className="rounded-[14px] border border-white/[0.07] bg-[#141824] p-5 md:p-6">
          <h2 className="mb-4 text-[9px] font-bold uppercase tracking-[1px] text-[#6b7a9a]">Adresse</h2>
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1 space-y-1 text-[13px] font-medium text-[#eef2ff]">
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
                className="inline-flex shrink-0 items-center justify-center rounded-[8px] border border-white/[0.1] bg-transparent p-1 text-[#8090b0] hover:bg-white/[0.04] hover:text-[#eef2ff]"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
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
        </section>

        <section className="rounded-[14px] border border-white/[0.07] bg-[#141824] p-5 md:p-6">
          <h2 className="mb-4 text-[9px] font-bold uppercase tracking-[1px] text-[#6b7a9a]">
            Weitere Angaben
          </h2>
          <div className="space-y-4">
            <div>
              <p className="text-[10px] text-[#6b7a9a]">Website</p>
              <div className="mt-1 text-[13px] font-medium text-[#eef2ff]">
                {row.website?.trim() ? (
                  <a
                    href={
                      /^https?:\/\//i.test(row.website.trim())
                        ? row.website.trim()
                        : `https://${row.website.trim()}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#7aaeff] hover:underline"
                  >
                    {row.website.trim()}
                  </a>
                ) : (
                  "—"
                )}
              </div>
            </div>
            <div>
              <p className="text-[10px] text-[#6b7a9a]">Allgemeine Notizen</p>
              <p className="mt-1 whitespace-pre-wrap text-[13px] font-medium text-[#eef2ff]">
                {dash(row.notes)}
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-[14px] border border-white/[0.07] bg-[#141824] p-5 md:p-6">
          <h2 className="mb-4 text-[9px] font-bold uppercase tracking-[1px] text-[#6b7a9a]">Notizen</h2>
          {!isArchived ? (
            <form
              className="mb-6"
              onSubmit={(e) => {
                e.preventDefault();
                saveNewNote();
              }}
            >
              <label
                htmlFor="landlord-new-note"
                className="mb-1.5 block text-[10px] text-[#6b7a9a]"
              >
                Neue Notiz
              </label>
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
                className="w-full rounded-[8px] border border-white/[0.08] bg-[#111520] px-3 py-2 text-sm text-[#eef2ff] placeholder:text-[#6b7a9a]/70 focus:outline-none focus:ring-2 focus:ring-[#7aaeff]/30 disabled:opacity-60"
              />
              {newNoteErr ? (
                <p className="mt-2 text-sm text-[#f87171]">{newNoteErr}</p>
              ) : null}
              {newNoteSubmitErr ? (
                <p className="mt-2 text-sm text-[#f87171]">{newNoteSubmitErr}</p>
              ) : null}
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
          ) : null}
          <div className={!isArchived ? "border-t border-white/[0.05] pt-5" : ""}>
            <p className="mb-3 text-[10px] text-[#6b7a9a]">Alle Notizen</p>
            {!notes.length ? (
              <p className="text-sm text-[#6b7a9a]">Noch keine Notizen</p>
            ) : (
              <ul className="space-y-4">
                {notes.map((n) => (
                  <li
                    key={n.id}
                    className="border-b border-white/[0.05] pb-4 last:border-0 last:pb-0"
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
                          className="w-full rounded-[8px] border border-white/[0.08] bg-[#111520] px-3 py-2 text-sm text-[#eef2ff] focus:outline-none focus:ring-2 focus:ring-[#7aaeff]/30 disabled:opacity-60"
                        />
                        {editErr ? <p className="mt-2 text-sm text-[#f87171]">{editErr}</p> : null}
                        <div className="mt-2 flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={editSaving}
                            onClick={saveEditNote}
                            className="rounded-[8px] border-none bg-gradient-to-r from-[#5b8cff] to-[#7c5cfc] px-3 py-1.5 text-sm font-semibold text-white hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-70"
                          >
                            {editSaving ? "Speichern …" : "Speichern"}
                          </button>
                          <button
                            type="button"
                            disabled={editSaving}
                            onClick={cancelEditNote}
                            className="rounded-[8px] border border-white/[0.1] bg-transparent px-3 py-1.5 text-sm font-semibold text-[#8090b0] hover:bg-white/[0.04] disabled:opacity-60"
                          >
                            Abbrechen
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-[10px] bg-[#111520] p-3">
                        <p className="whitespace-pre-wrap text-sm text-[#eef2ff]">{n.content}</p>
                        <p className="mt-2 text-xs text-[#6b7a9a]">
                          {formatDateTime(n.created_at)} · {n.author_name || "—"}
                        </p>
                        {n.updated_at ? (
                          <p className="mt-1 text-xs text-[#6b7a9a]">
                            Bearbeitet {formatDateTime(n.updated_at)} · {n.editor_name || "—"}
                          </p>
                        ) : null}
                        {!isArchived ? (
                          <button
                            type="button"
                            onClick={() => startEditNote(n)}
                            className="mt-2 text-sm font-semibold text-[#7aaeff] underline-offset-2 hover:underline"
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
        </section>

        <div style={sectionCard}>
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: "12px",
              marginBottom: "10px",
            }}
          >
            <div style={sectionTitle}>Dokumente</div>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: "10px",
                justifyContent: "flex-end",
              }}
            >
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  fontSize: "10px",
                  color: "#6b7a9a",
                }}
              >
                <span>Kategorie</span>
                <select
                  value={landlordDocCategory}
                  onChange={(e) => setLandlordDocCategory(e.target.value)}
                  disabled={landlordDocUploading || !id}
                  style={{
                    fontSize: "13px",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: "8px",
                    padding: "6px 8px",
                    color: "#eef2ff",
                    background: landlordDocUploading || !id ? "#0d1118" : "#111520",
                    opacity: landlordDocUploading || !id ? 0.7 : 1,
                  }}
                >
                  <option value="">—</option>
                  <option value="rent_contract">Mietvertrag</option>
                  <option value="id_document">Ausweis</option>
                  <option value="debt_register">Betreibungsregister</option>
                  <option value="insurance">Versicherung</option>
                  <option value="other">Sonstiges</option>
                </select>
              </label>
              <input
                ref={landlordDocFileInputRef}
                type="file"
                style={{ display: "none" }}
                onChange={handleLandlordDocSelected}
              />
              <button
                type="button"
                onClick={handleLandlordDocPick}
                disabled={landlordDocUploading || !id}
                style={{
                  fontSize: "13px",
                  border: "1px solid rgba(255,255,255,0.1)",
                  background: "transparent",
                  color: "#8090b0",
                  padding: "8px 12px",
                  borderRadius: "8px",
                  fontWeight: 600,
                  cursor: landlordDocUploading || !id ? "not-allowed" : "pointer",
                  opacity: landlordDocUploading || !id ? 0.7 : 1,
                }}
              >
                {landlordDocUploading ? "Wird hochgeladen …" : "Hochladen"}
              </button>
            </div>
          </div>
          {landlordDocUploadError ? (
            <p style={{ margin: "0 0 8px 0", fontSize: "13px", color: "#f87171" }}>
              {landlordDocUploadError}
            </p>
          ) : null}
          {landlordDocsLoading ? (
            <p style={{ margin: 0, fontSize: "0.875rem", color: "#6b7a9a" }}>Lade Dokumente …</p>
          ) : landlordDocuments.length === 0 ? (
            <p style={{ margin: 0, fontSize: "0.875rem", color: "#6b7a9a" }}>
              Keine Dokumente vorhanden
            </p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: "14px",
                  color: "#eef2ff",
                }}
              >
                <thead>
                  <tr>
                    <th style={thCell}>Datei</th>
                    <th style={thCell}>Typ</th>
                    <th style={thCell}>Kategorie</th>
                    <th style={thCell}>Datum</th>
                    <th style={thCell}>Von</th>
                    <th style={thCell}>Aktionen</th>
                  </tr>
                </thead>
                <tbody>
                  {landlordDocuments.map((doc) => (
                    <tr key={String(doc.id)}>
                      <td style={{ ...tdCell, fontWeight: 600 }}>{doc.file_name || "—"}</td>
                      <td style={{ ...tdCell, color: "#6b7a9a" }}>{formatLandlordDocumentType(doc)}</td>
                      <td style={{ ...tdCell, color: "#6b7a9a" }}>
                        {formatLandlordDocumentCategoryLabel(doc.category)}
                      </td>
                      <td style={{ ...tdCell, color: "#6b7a9a" }}>
                        {formatLandlordDocumentDate(doc.created_at)}
                      </td>
                      <td style={{ ...tdCell, color: "#6b7a9a" }}>
                        {doc.uploaded_by_name != null && doc.uploaded_by_name !== ""
                          ? doc.uploaded_by_name
                          : "—"}
                      </td>
                      <td style={tdCell}>
                        <div
                          style={{
                            display: "flex",
                            flexWrap: "wrap",
                            alignItems: "center",
                            gap: "12px",
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => handleOpenLandlordDocument(doc.id)}
                            style={{
                              background: "none",
                              border: "none",
                              padding: 0,
                              color: "#7aaeff",
                              fontWeight: 600,
                              cursor: "pointer",
                              textDecoration: "underline",
                            }}
                          >
                            Öffnen
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteLandlordDocument(doc.id)}
                            style={{
                              background: "none",
                              border: "none",
                              padding: 0,
                              color: "#f87171",
                              fontSize: "13px",
                              cursor: "pointer",
                              textDecoration: "underline",
                            }}
                          >
                            Löschen
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <section className="rounded-[14px] border border-white/[0.07] bg-[#141824] p-5 md:p-6">
          <h2 className="mb-4 text-[9px] font-bold uppercase tracking-[1px] text-[#6b7a9a]">
            Zugeordnete Units
          </h2>
          {assignedUnitsLoading ? (
            <div className="space-y-2" aria-busy="true">
              <p className="text-sm text-[#6b7a9a]">Lade Units …</p>
              <div className="h-2 w-full max-w-xs animate-pulse rounded bg-[#111520]" />
              <div className="h-2 w-full max-w-[14rem] animate-pulse rounded bg-[#111520]" />
            </div>
          ) : assignedUnitsError ? (
            <p className="text-sm text-[#f87171]">{assignedUnitsError}</p>
          ) : assignedUnits.length === 0 ? (
            <div className="rounded-[10px] border border-dashed border-white/[0.07] bg-[#111520] px-5 py-8 text-center">
              <p className="text-sm font-semibold text-[#eef2ff]">Keine Units zugeordnet</p>
              <p className="mx-auto mt-2 max-w-md text-sm text-[#6b7a9a]">
                Dieser Verwaltung sind aktuell noch keine Units zugewiesen.
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {assignedUnits.map((u) => {
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
                        {zipCity ? (
                          <p className="text-sm text-[#eef2ff]">{zipCity}</p>
                        ) : null}
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

        <section className="rounded-[14px] border border-white/[0.07] bg-[#141824] p-5 md:p-6">
          <h2 className="mb-4 text-[9px] font-bold uppercase tracking-[1px] text-[#6b7a9a]">
            Bewirtschafter
          </h2>
          {propertyManagersLoading ? (
            <div className="space-y-2" aria-busy="true">
              <p className="text-sm text-[#6b7a9a]">Lade Bewirtschafter …</p>
              <div className="h-2 w-full max-w-xs animate-pulse rounded bg-[#111520]" />
              <div className="h-2 w-full max-w-[14rem] animate-pulse rounded bg-[#111520]" />
            </div>
          ) : propertyManagersError ? (
            <p className="text-sm text-[#f87171]">{propertyManagersError}</p>
          ) : sortedPropertyManagers.length === 0 ? (
            <div className="space-y-3">
              <p className="text-sm text-[#6b7a9a]">Kein Bewirtschafter zugeordnet</p>
              <Link
                to="/admin/bewirtschafter"
                className="inline-flex items-center rounded-[8px] border border-white/[0.1] bg-transparent px-3 py-1.5 text-sm font-semibold text-[#8090b0] hover:bg-white/[0.04]"
              >
                Bewirtschafter zuweisen
              </Link>
            </div>
          ) : (
            <ul className="divide-y divide-white/[0.05] overflow-hidden rounded-[10px] border border-white/[0.05]">
              {sortedPropertyManagers.map((pm) => (
                <li key={pm.id} className="bg-[#111520] px-4 py-3">
                  <Link
                    to={`/admin/bewirtschafter/${encodeURIComponent(pm.id)}`}
                    className="text-sm font-semibold text-[#7aaeff] underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7aaeff]/40"
                  >
                    {propertyManagerDisplayName(pm)}
                  </Link>
                  {pm.email != null && String(pm.email).trim() !== "" ? (
                    <p className="mt-1 text-xs text-[#6b7a9a]">{String(pm.email).trim()}</p>
                  ) : null}
                  {pm.phone != null && String(pm.phone).trim() !== "" ? (
                    <p className="mt-0.5 text-xs text-[#6b7a9a]">{String(pm.phone).trim()}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-[14px] border border-white/[0.07] bg-[#141824] p-5 md:p-6">
          <h2 className="mb-4 text-[9px] font-bold uppercase tracking-[1px] text-[#6b7a9a]">
            Historie
          </h2>
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
                      <p className="text-sm font-medium text-[#eef2ff]">Verwaltung angelegt</p>
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
                const label = LANDLORD_FIELD_LABELS[field] || field;
                const oldD = formatLandlordAuditDisplayValue(field, ov[field], userNameById);
                const newD = formatLandlordAuditDisplayValue(field, nv[field], userNameById);
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
      </div>

      {landlordEditOpen && (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 p-4"
          onClick={() => !landlordEditSaving && setLandlordEditOpen(false)}
          role="presentation"
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[14px] border border-white/[0.07] bg-[#141824] p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="landlord-edit-title"
          >
            <h2 id="landlord-edit-title" className="mb-4 text-lg font-semibold text-[#eef2ff]">
              Verwaltung bearbeiten
            </h2>
            <div className="space-y-4">
              <div>
                <label htmlFor="ll-edit-company" className="mb-1 block text-[10px] text-[#6b7a9a]">
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
                  className="w-full rounded-[8px] border border-white/[0.08] bg-[#111520] px-3 py-2 text-sm text-[#eef2ff] disabled:opacity-60"
                />
              </div>
              <div>
                <label htmlFor="ll-edit-contact" className="mb-1 block text-[10px] text-[#6b7a9a]">
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
                  className="w-full rounded-[8px] border border-white/[0.08] bg-[#111520] px-3 py-2 text-sm text-[#eef2ff] disabled:opacity-60"
                />
              </div>
              <div>
                <label htmlFor="ll-edit-email" className="mb-1 block text-[10px] text-[#6b7a9a]">
                  E-Mail *
                </label>
                <input
                  id="ll-edit-email"
                  type="email"
                  value={landlordEditForm.email}
                  onChange={(e) => setLandlordEditForm((f) => ({ ...f, email: e.target.value }))}
                  disabled={landlordEditSaving}
                  className="w-full rounded-[8px] border border-white/[0.08] bg-[#111520] px-3 py-2 text-sm text-[#eef2ff] disabled:opacity-60"
                />
              </div>
              <div>
                <label htmlFor="ll-edit-phone" className="mb-1 block text-[10px] text-[#6b7a9a]">
                  Telefon (optional)
                </label>
                <input
                  id="ll-edit-phone"
                  type="text"
                  value={landlordEditForm.phone}
                  onChange={(e) => setLandlordEditForm((f) => ({ ...f, phone: e.target.value }))}
                  disabled={landlordEditSaving}
                  className="w-full rounded-[8px] border border-white/[0.08] bg-[#111520] px-3 py-2 text-sm text-[#eef2ff] disabled:opacity-60"
                />
              </div>
              <div>
                <label htmlFor="ll-edit-addr" className="mb-1 block text-[10px] text-[#6b7a9a]">
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
                  className="w-full rounded-[8px] border border-white/[0.08] bg-[#111520] px-3 py-2 text-sm text-[#eef2ff] disabled:opacity-60"
                />
              </div>
              <div>
                <label htmlFor="ll-edit-plz" className="mb-1 block text-[10px] text-[#6b7a9a]">
                  PLZ *
                </label>
                <input
                  id="ll-edit-plz"
                  type="text"
                  value={landlordEditForm.postal_code}
                  onChange={handleLandlordEditPostalCodeChange}
                  disabled={landlordEditSaving}
                  className="w-full rounded-[8px] border border-white/[0.08] bg-[#111520] px-3 py-2 text-sm text-[#eef2ff] disabled:opacity-60"
                />
                {landlordEditPlzNotFound ? (
                  <p className="mt-1 text-xs text-[#6b7a9a]">PLZ nicht gefunden</p>
                ) : null}
              </div>
              <div>
                <label htmlFor="ll-edit-city" className="mb-1 block text-[10px] text-[#6b7a9a]">
                  Ort *
                </label>
                <input
                  id="ll-edit-city"
                  type="text"
                  value={landlordEditForm.city}
                  onChange={(e) => setLandlordEditForm((f) => ({ ...f, city: e.target.value }))}
                  disabled={landlordEditSaving}
                  className="w-full rounded-[8px] border border-white/[0.08] bg-[#111520] px-3 py-2 text-sm text-[#eef2ff] disabled:opacity-60"
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
                  className="self-start rounded-[8px] border border-white/[0.1] bg-transparent px-3 py-2 text-xs font-semibold text-[#8090b0] hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {landlordEditAddrBusy ? "…" : "Adresse prüfen"}
                </button>
                <p className="text-xs text-[#6b7a9a]">
                  Öffnet Google Maps in einem neuen Tab. Der Kanton wird im Hintergrund ergänzt, wenn die
                  Abfrage einen Wert liefert.
                </p>
                {landlordEditCantonHint ? (
                  <p className="text-xs text-[#6b7a9a]">{landlordEditCantonHint}</p>
                ) : null}
              </div>
              <div>
                <label htmlFor="ll-edit-canton" className="mb-1 block text-[10px] text-[#6b7a9a]">
                  Kanton
                </label>
                <p className="mb-1 text-xs text-[#6b7a9a]">
                  Optional — oft nach «Adresse prüfen» gesetzt; manuelle Auswahl möglich.
                </p>
                <select
                  id="ll-edit-canton"
                  value={landlordEditForm.canton || ""}
                  onChange={(e) =>
                    setLandlordEditForm((f) => ({ ...f, canton: e.target.value }))
                  }
                  disabled={landlordEditSaving || landlordEditCantonLockedByPlz}
                  className="w-full rounded-[8px] border border-white/[0.08] bg-[#111520] px-3 py-2 text-sm text-[#eef2ff] disabled:opacity-60"
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
                <label htmlFor="ll-edit-website" className="mb-1 block text-[10px] text-[#6b7a9a]">
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
                  className="w-full rounded-[8px] border border-white/[0.08] bg-[#111520] px-3 py-2 text-sm text-[#eef2ff] disabled:opacity-60"
                />
              </div>
              <div>
                <label htmlFor="ll-edit-notes" className="mb-1 block text-[10px] text-[#6b7a9a]">
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
                  className="w-full rounded-[8px] border border-white/[0.08] bg-[#111520] px-3 py-2 text-sm text-[#eef2ff] disabled:opacity-60"
                />
              </div>
              <div>
                <label htmlFor="ll-edit-status" className="mb-1 block text-[10px] text-[#6b7a9a]">
                  Status
                </label>
                <select
                  id="ll-edit-status"
                  value={landlordEditForm.status}
                  onChange={(e) =>
                    setLandlordEditForm((f) => ({ ...f, status: e.target.value }))
                  }
                  disabled={landlordEditSaving}
                  className="w-full rounded-[8px] border border-white/[0.08] bg-[#111520] px-3 py-2 text-sm text-[#eef2ff] disabled:opacity-60"
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
                  className="rounded-[8px] border border-white/[0.1] bg-transparent px-3 py-2 text-sm font-semibold text-[#8090b0] hover:bg-white/[0.04]"
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
            className="w-full max-w-md rounded-[14px] border border-white/[0.07] bg-[#141824] p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="restore-landlord-title"
          >
            <h2 id="restore-landlord-title" className="mb-3 text-lg font-semibold text-[#eef2ff]">
              Verwaltung reaktivieren?
            </h2>
            <p className="mb-6 text-sm text-[#6b7a9a]">
              Die Verwaltung wird wieder aktiv und erscheint in der normalen Verwaltungsliste unter «Aktiv».
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={restoring}
                onClick={() => setRestoreModalOpen(false)}
                className="rounded-[8px] border border-white/[0.1] bg-transparent px-4 py-2 text-sm font-semibold text-[#8090b0] hover:bg-white/[0.04] disabled:opacity-50"
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
                className="rounded-[8px] border border-green-500/20 bg-green-500/10 px-4 py-2 text-sm font-semibold text-green-400 hover:bg-green-500/15 disabled:opacity-50"
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
            className="w-full max-w-md rounded-[14px] border border-white/[0.07] bg-[#141824] p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="archive-landlord-title"
          >
            <h2 id="archive-landlord-title" className="mb-3 text-lg font-semibold text-[#eef2ff]">
              Verwaltung archivieren?
            </h2>
            <p className="mb-6 text-sm text-[#6b7a9a]">
              Die Verwaltung wird archiviert. Sie erscheint nicht mehr in der normalen Verwaltungsliste.
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={archiving}
                onClick={() => setArchiveModalOpen(false)}
                className="rounded-[8px] border border-white/[0.1] bg-transparent px-4 py-2 text-sm font-semibold text-[#8090b0] hover:bg-white/[0.04] disabled:opacity-50"
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
                className="rounded-[8px] border border-red-500/20 bg-red-500/10 px-4 py-2 text-sm font-semibold text-[#f87171] hover:bg-red-500/15 disabled:opacity-50"
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
