import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  deleteAdminOwnerDocument,
  fetchAdminAuditLogs,
  fetchAdminOwner,
  fetchAdminOwnerDocumentDownloadUrl,
  fetchAdminOwnerDocuments,
  fetchAdminOwnerUnits,
  normalizeUnit,
  patchAdminOwner,
  uploadAdminOwnerDocument,
  verifyAdminAddress,
} from "../../api/adminData";
import { SWISS_CANTON_CODES } from "../../constants/swissCantons";
import { lookupSwissPlz } from "../../data/swissPlzLookup";
import { buildGoogleMapsSearchUrl } from "../../utils/googleMapsUrl";
import {
  formatAuditLog,
  auditActorDisplay,
  auditActionLabel,
  formatAuditTimestamp,
} from "../../utils/auditDisplay";
import { normalizeUnitTypeLabel } from "../../utils/unitDisplayId";

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

function ownerUnitStatusBadgeClass(status) {
  const s = String(status ?? "").trim().toLowerCase();
  if (s === "frei" || s === "") {
    return "border border-[rgba(255,95,109,0.2)] bg-[rgba(255,95,109,0.1)] text-[#ff5f6d]";
  }
  if (s === "belegt" || s === "occupied") {
    return "border border-[rgba(61,220,132,0.2)] bg-[rgba(61,220,132,0.1)] text-[#3ddc84]";
  }
  if (s === "reserviert" || s === "reserved") {
    return "border border-[rgba(91,156,246,0.2)] bg-[rgba(91,156,246,0.1)] text-[#5b9cf6]";
  }
  if (s === "teilbelegt") {
    return "border border-[rgba(245,166,35,0.2)] bg-[rgba(245,166,35,0.1)] text-[#f5a623]";
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

function formatOwnerDocumentDate(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString("de-CH", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function formatOwnerDocumentType(doc) {
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

const OWNER_DOCUMENT_CATEGORY_LABELS = {
  rent_contract: "Mietvertrag",
  id_document: "Ausweis",
  debt_register: "Betreibungsregister",
  insurance: "Versicherung",
  other: "Sonstiges",
};

function formatOwnerDocumentCategoryLabel(category) {
  if (category == null || String(category).trim() === "") return "—";
  const k = String(category).trim();
  return OWNER_DOCUMENT_CATEGORY_LABELS[k] || k;
}

function AdminOwnerDetailPage() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [owner, setOwner] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [units, setUnits] = useState([]);
  const [unitsLoading, setUnitsLoading] = useState(true);
  const [unitsError, setUnitsError] = useState(null);
  const [statusSaving, setStatusSaving] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editErr, setEditErr] = useState(null);
  const [editForm, setEditForm] = useState({
    name: "",
    email: "",
    phone: "",
    address_line1: "",
    postal_code: "",
    city: "",
    canton: "",
    status: "active",
  });
  const [editAddressCheckBusy, setEditAddressCheckBusy] = useState(false);
  const [editCantonHint, setEditCantonHint] = useState("");
  const [editCantonLockedByPlz, setEditCantonLockedByPlz] = useState(false);
  const [editPlzNotFound, setEditPlzNotFound] = useState(false);
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditLoading, setAuditLoading] = useState(true);
  const [auditError, setAuditError] = useState(null);
  const [ownerDocuments, setOwnerDocuments] = useState([]);
  const [ownerDocsLoading, setOwnerDocsLoading] = useState(true);
  const [ownerDocUploading, setOwnerDocUploading] = useState(false);
  const [ownerDocUploadError, setOwnerDocUploadError] = useState("");
  const [ownerDocCategory, setOwnerDocCategory] = useState("");
  const ownerDocFileInputRef = useRef(null);

  const loadAuditLogs = useCallback(
    (opts = {}) => {
      const silent = opts.silent === true;
      if (!id) return Promise.resolve();
      if (!silent) {
        setAuditLoading(true);
        setAuditError(null);
      }
      return fetchAdminAuditLogs({ entity_type: "owner", entity_id: id })
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
    if (!id) return;
    setLoading(true);
    setError("");
    fetchAdminOwner(id)
      .then((row) => {
        if (!row) {
          setError("Eigentümer nicht gefunden.");
          setOwner(null);
          return;
        }
        setOwner(row);
      })
      .catch(() => {
        setError("Eigentümer konnte nicht geladen werden.");
        setOwner(null);
      })
      .finally(() => setLoading(false));
  }, [id, location.key]);

  useEffect(() => {
    loadAuditLogs();
  }, [loadAuditLogs]);

  useEffect(() => {
    if (!id) return;
    setOwnerDocsLoading(true);
    fetchAdminOwnerDocuments(id)
      .then((items) => setOwnerDocuments(Array.isArray(items) ? items : []))
      .catch(() => setOwnerDocuments([]))
      .finally(() => setOwnerDocsLoading(false));
  }, [id]);

  useEffect(() => {
    if (!id) return;
    setUnitsLoading(true);
    setUnitsError(null);
    fetchAdminOwnerUnits(id)
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
    setEditCantonHint("");
  }, [editForm.address_line1, editForm.postal_code, editForm.city]);

  const handleEditPostalCodeChange = (e) => {
    const next = e.target.value;
    const plz = next.trim();
    if (!/^\d{4}$/.test(plz)) {
      setEditCantonLockedByPlz(false);
      setEditPlzNotFound(false);
      setEditForm((f) => ({ ...f, postal_code: next }));
      return;
    }
    const hit = lookupSwissPlz(plz);
    if (hit) {
      setEditForm((f) => ({
        ...f,
        postal_code: next,
        city: hit.city,
        canton: hit.canton,
      }));
      setEditCantonLockedByPlz(true);
      setEditPlzNotFound(false);
    } else {
      setEditForm((f) => ({ ...f, postal_code: next }));
      setEditCantonLockedByPlz(false);
      setEditPlzNotFound(true);
    }
  };

  const openEdit = () => {
    if (!owner) return;
    setEditErr(null);
    setEditCantonLockedByPlz(false);
    setEditPlzNotFound(false);
    setEditForm({
      name: owner.name || "",
      email: owner.email || "",
      phone: owner.phone || "",
      address_line1: owner.address_line1 || "",
      postal_code: owner.postal_code || "",
      city: owner.city || "",
      canton: owner.canton || "",
      status: String(owner.status || "active").toLowerCase() === "inactive" ? "inactive" : "active",
    });
    setEditOpen(true);
  };

  const submitEdit = () => {
    if (!id) return;
    if (!editForm.name.trim()) {
      setEditErr("Name ist erforderlich.");
      return;
    }
    const addr1 = editForm.address_line1.trim();
    const plz = editForm.postal_code.trim();
    const ort = editForm.city.trim();
    setEditSaving(true);
    setEditErr(null);
    patchAdminOwner(id, {
      name: editForm.name.trim(),
      email: editForm.email.trim() || null,
      phone: editForm.phone.trim() || null,
      address_line1: addr1 || null,
      postal_code: plz || null,
      city: ort || null,
      canton: editForm.canton.trim() || null,
      status: editForm.status === "inactive" ? "inactive" : "active",
    })
      .then(() => fetchAdminOwner(id))
      .then((row) => {
        if (!row) return;
        setOwner(row);
        setEditOpen(false);
      })
      .then(() => loadAuditLogs({ silent: true }))
      .catch((err) => setEditErr(err?.message || "Speichern fehlgeschlagen."))
      .finally(() => setEditSaving(false));
  };

  if (loading) {
    return (
      <p className="min-h-[40vh] bg-[#080a0f] px-6 py-8 text-[#4a5070]">Lade Eigentümer …</p>
    );
  }

  if (error || !owner) {
    return (
      <div className="min-h-screen bg-[#080a0f] px-6 py-8 text-[#edf0f7]">
        <p className="mb-3 text-[14px] text-[#ff5f6d]">{error || "Nicht gefunden."}</p>
        <button
          type="button"
          onClick={() => navigate("/admin/owners")}
          className="rounded-[6px] border border-[#252a3a] bg-[#141720] px-[12px] py-[4px] text-[11px] text-[#8892b0] hover:text-[#edf0f7]"
        >
          Zurück zur Liste
        </button>
      </div>
    );
  }

  const displayName = String(owner.name || "").trim() || "Eigentümer";
  const isOwnerActive = String(owner.status || "active").toLowerCase() !== "inactive";

  const addrLine1 = owner.address_line1?.trim() || "";
  const plz = owner.postal_code?.trim() || "";
  const city = owner.city?.trim() || "";
  const addrLine2 = [plz, city].filter(Boolean).join(" ");
  const addrLine3 = owner.canton?.trim() || "";
  const nameRawForInitials = String(owner.name || "").trim();
  const namePartsForInitials = nameRawForInitials.split(/\s+/).filter(Boolean);
  let stammInitials = "?";
  if (namePartsForInitials.length >= 2) {
    const a = namePartsForInitials[0][0] || "";
    const b = namePartsForInitials[namePartsForInitials.length - 1][0] || "";
    stammInitials = `${a}${b}`.toUpperCase() || "?";
  } else if (nameRawForInitials) {
    stammInitials = nameRawForInitials.slice(0, 2).toUpperCase();
  }
  const addrCombinedBlue = [addrLine1, addrLine2, addrLine3].filter(Boolean).join(", ") || null;

  function handleOwnerDocPick() {
    ownerDocFileInputRef.current?.click();
  }

  async function handleOwnerDocSelected(e) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f || !id) return;
    setOwnerDocUploading(true);
    setOwnerDocUploadError("");
    try {
      await uploadAdminOwnerDocument(id, f, {
        category: ownerDocCategory.trim() || undefined,
      });
      setOwnerDocCategory("");
      const items = await fetchAdminOwnerDocuments(id);
      setOwnerDocuments(Array.isArray(items) ? items : []);
      await loadAuditLogs({ silent: true });
    } catch (err) {
      setOwnerDocUploadError(err.message || "Upload fehlgeschlagen.");
    } finally {
      setOwnerDocUploading(false);
    }
  }

  async function handleOpenOwnerDocument(docId) {
    try {
      const data = await fetchAdminOwnerDocumentDownloadUrl(docId);
      if (data?.url) window.open(data.url, "_blank", "noopener,noreferrer");
    } catch (err) {
      window.alert(err.message || "Download konnte nicht gestartet werden.");
    }
  }

  async function handleDeleteOwnerDocument(docId) {
    if (!window.confirm("Dokument wirklich löschen?")) return;
    try {
      await deleteAdminOwnerDocument(docId);
      const items = await fetchAdminOwnerDocuments(id);
      setOwnerDocuments(Array.isArray(items) ? items : []);
      await loadAuditLogs({ silent: true });
    } catch (err) {
      window.alert(err.message || "Löschen fehlgeschlagen.");
    }
  }

  const handleToggleStatus = () => {
    if (!id) return;
    const next = isOwnerActive ? "inactive" : "active";
    const msg =
      next === "inactive"
        ? "Diesen Eigentümer wirklich als inaktiv markieren?"
        : "Diesen Eigentümer wieder aktivieren?";
    if (!window.confirm(msg)) return;
    setStatusSaving(true);
    patchAdminOwner(id, { status: next })
      .then(() => fetchAdminOwner(id))
      .then((row) => {
        if (row) setOwner(row);
      })
      .then(() => loadAuditLogs({ silent: true }))
      .catch((e) => {
        window.alert(e?.message || "Status konnte nicht geändert werden.");
      })
      .finally(() => setStatusSaving(false));
  };

  return (
    <div className="-m-6 min-h-screen bg-[#080a0f]">
      <div className="sticky top-0 z-30 flex h-[50px] items-center justify-between border-b border-[#1c2035] bg-[#0c0e15] px-6 backdrop-blur-md">
        <div className="flex min-w-0 flex-1 items-center gap-[12px]">
          <Link
            to="/admin/owners"
            className="shrink-0 rounded-[6px] border border-[#252a3a] bg-[#141720] px-[10px] py-[4px] text-[11px] text-[#4a5070] no-underline hover:text-[#edf0f7]"
          >
            ← Eigentümer
          </Link>
          <div className="h-[20px] w-px shrink-0 bg-[#1c2035]" aria-hidden />
          <div className="flex min-w-0 flex-wrap items-center gap-x-[8px] gap-y-1">
            <span className="shrink-0 text-[10px] text-[#4a5070]">Eigentümer</span>
            <span className="shrink-0 text-[#1c2035]">/</span>
            <span className="truncate text-[14px] font-medium text-[#edf0f7]">{displayName}</span>
            {isOwnerActive ? (
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
            onClick={openEdit}
            className="rounded-[6px] border border-[#252a3a] bg-[#141720] px-[12px] py-[4px] text-[11px] text-[#8892b0] hover:text-[#edf0f7]"
          >
            Bearbeiten
          </button>
          <button
            type="button"
            disabled={statusSaving}
            onClick={handleToggleStatus}
            className={
              isOwnerActive
                ? "rounded-[6px] border border-[rgba(245,166,35,0.25)] bg-transparent px-[12px] py-[4px] text-[11px] text-[#f5a623] hover:bg-[rgba(245,166,35,0.08)] disabled:cursor-not-allowed disabled:opacity-60"
                : "rounded-[6px] border border-[rgba(61,220,132,0.25)] bg-transparent px-[12px] py-[4px] text-[11px] text-[#3ddc84] hover:bg-[rgba(61,220,132,0.08)] disabled:cursor-not-allowed disabled:opacity-60"
            }
          >
            {statusSaving ? "…" : isOwnerActive ? "Als inaktiv markieren" : "Aktivieren"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-[16px] px-[24px] py-[20px] lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="flex min-w-0 flex-col gap-[12px]">
          <div className="overflow-hidden rounded-[12px] border border-[#1c2035] bg-[#10121a]">
            <div className="flex items-center justify-between border-b border-[#1c2035] px-[16px] py-[12px]">
              <span className="text-[11px] font-medium uppercase tracking-[0.5px] text-[#edf0f7]">Stammdaten</span>
            </div>
            <div className="px-[16px] py-[14px]">
              <div className="mb-[14px] flex items-center gap-[12px]">
                <div className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-[10px] border border-[rgba(61,220,132,0.2)] bg-[rgba(61,220,132,0.1)] text-[14px] font-semibold text-[#3ddc84]">
                  {stammInitials}
                </div>
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold text-[#edf0f7]">{displayName}</p>
                  <p className="mt-[2px] text-[10px] text-[#4a5070]">Eigentümer / Owner</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-[12px]">
                <div className="flex flex-col gap-[3px]">
                  <span className="text-[9px] font-medium uppercase tracking-[0.5px] text-[#4a5070]">Name</span>
                  <span className="text-[12px] font-medium text-[#edf0f7]">{displayName}</span>
                </div>
                <div className="flex flex-col gap-[3px]">
                  <span className="text-[9px] font-medium uppercase tracking-[0.5px] text-[#4a5070]">E-Mail</span>
                  {owner.email?.trim() ? (
                    <span className="text-[11px] text-[#5b9cf6]">{owner.email.trim()}</span>
                  ) : (
                    <span className="text-[12px] font-medium text-[#4a5070]">—</span>
                  )}
                </div>
                <div className="flex flex-col gap-[3px]">
                  <span className="text-[9px] font-medium uppercase tracking-[0.5px] text-[#4a5070]">Telefon</span>
                  {owner.phone?.trim() ? (
                    <span className="font-mono text-[11px] text-[#edf0f7]">{owner.phone.trim()}</span>
                  ) : (
                    <span className="text-[12px] font-medium text-[#4a5070]">—</span>
                  )}
                </div>
              </div>
              <div className="my-[12px] h-px bg-[#1c2035]" />
              <div className="grid grid-cols-3 gap-[12px]">
                <div className="col-span-2 flex min-w-0 flex-wrap items-center gap-[8px]">
                  <span className="min-w-0 text-[11px] text-[#5b9cf6]">
                    📍 {addrCombinedBlue || "—"}
                  </span>
                  {addrLine1 || plz || city ? (
                    <button
                      type="button"
                      title="In Google Maps öffnen"
                      aria-label="In Google Maps öffnen"
                      onClick={() =>
                        window.open(
                          buildGoogleMapsSearchUrl(owner.address_line1, owner.postal_code, owner.city),
                          "_blank",
                          "noopener,noreferrer"
                        )
                      }
                      className="inline-flex shrink-0 cursor-pointer items-center justify-center rounded-[6px] border border-[#252a3a] bg-[#141720] p-0.5 text-[#8892b0] transition-colors hover:border-[#3b5fcf] hover:text-[#edf0f7]"
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
            </div>
          </div>

          <div className="overflow-hidden rounded-[12px] border border-[#1c2035] bg-[#10121a]">
            <div className={`flex flex-wrap items-center justify-between gap-2 border-b border-[#1c2035] px-[16px] py-[12px]`}>
              <span className="text-[11px] font-medium uppercase tracking-[0.5px] text-[#edf0f7]">Dokumente</span>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={ownerDocCategory}
                  onChange={(e) => setOwnerDocCategory(e.target.value)}
                  disabled={ownerDocUploading || !id}
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
                  ref={ownerDocFileInputRef}
                  type="file"
                  className="hidden"
                  onChange={handleOwnerDocSelected}
                />
                <button
                  type="button"
                  onClick={handleOwnerDocPick}
                  disabled={ownerDocUploading || !id}
                  className="rounded-[6px] border border-[rgba(91,156,246,0.28)] bg-[rgba(91,156,246,0.1)] px-[12px] py-[3px] text-[10px] font-medium text-[#5b9cf6] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {ownerDocUploading ? "Wird hochgeladen …" : "↑ Hochladen"}
                </button>
              </div>
            </div>
            <div className="px-[16px] py-[14px]">
              {ownerDocUploadError ? (
                <p className="mb-2 text-[13px] text-[#ff5f6d]">{ownerDocUploadError}</p>
              ) : null}
              {ownerDocsLoading ? (
                <p className="m-0 text-[12px] text-[#4a5070]">Lade Dokumente …</p>
              ) : ownerDocuments.length === 0 ? (
                <p className="m-0 text-[11px] italic text-[#4a5070]">Keine Dokumente vorhanden</p>
              ) : (
                <div className="flex flex-col">
                  {ownerDocuments.map((doc) => (
                    <div
                      key={String(doc.id)}
                      className="flex items-center gap-[10px] border-b border-[#1c2035] py-[9px] last:border-b-0"
                    >
                      <div className="flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-[6px] border border-[rgba(255,95,109,0.2)] bg-[rgba(255,95,109,0.1)] text-[9px] font-bold text-[#ff5f6d]">
                        {formatOwnerDocumentType(doc)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] font-medium text-[#edf0f7]">{doc.file_name || "—"}</div>
                        <div className="text-[10px] text-[#4a5070]">
                          {formatOwnerDocumentType(doc)} · {formatOwnerDocumentCategoryLabel(doc.category)} ·{" "}
                          {formatOwnerDocumentDate(doc.created_at)} ·{" "}
                          {doc.uploaded_by_name != null && doc.uploaded_by_name !== ""
                            ? doc.uploaded_by_name
                            : "—"}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleOpenOwnerDocument(doc.id)}
                        className="shrink-0 rounded-[6px] border border-[#252a3a] bg-[#141720] px-[10px] py-[3px] text-[10px] text-[#8892b0] transition-colors hover:border-[#242840] hover:text-[#edf0f7]"
                      >
                        Öffnen →
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteOwnerDocument(doc.id)}
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
                <p className="m-0 text-[12px] text-[#4a5070]">Lade Verlauf …</p>
              ) : auditError ? (
                <p className="m-0 text-[12px] text-[#ff5f6d]">{auditError}</p>
              ) : auditLogs.length === 0 ? (
                <p className="m-0 text-[12px] text-[#4a5070]">Noch keine Einträge im Audit-Protokoll.</p>
              ) : (
                <ul className="m-0 list-none p-0">
                  {auditLogs.map((log, li) => {
                    const { summary, changes } = formatAuditLog(log, { entityType: "owner" });
                    const actorLine = auditActorDisplay(log);
                    return (
                      <li
                        key={log.id}
                        className={`py-[12px] ${li < auditLogs.length - 1 ? "border-b border-[#1c2035]" : ""}`}
                      >
                        <p className="mb-[4px] text-[11px] font-medium text-[#edf0f7]">{summary}</p>
                        <p className="mb-[8px] text-[10px] text-[#4a5070]">
                          <span>{formatAuditTimestamp(log.created_at)}</span>
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
                        {changes && changes.length > 0
                          ? changes.map((c, ci) => {
                              if (auditNarrativeOnlyChange(c)) {
                                return (
                                  <div
                                    key={`${log.id}-${ci}`}
                                    className="mb-2 rounded-[6px] bg-[#141720] px-[10px] py-[6px] text-[12px] text-[#edf0f7]"
                                  >
                                    {auditDisplayCell(c.new)}
                                  </div>
                                );
                              }
                              return (
                                <div key={`${log.id}-${ci}`} className="mb-2">
                                  <div className="mb-[4px] text-[10px] font-medium text-[#8892b0]">{c.label}</div>
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

        <aside className="flex min-w-0 flex-col gap-[12px]">
          <div className="overflow-hidden rounded-[12px] border border-[#1c2035] bg-[#10121a]">
            <div className="border-b border-[#1c2035] px-[16px] py-[12px]">
              <span className="text-[11px] font-medium uppercase tracking-[0.5px] text-[#edf0f7]">Schnellinfo</span>
            </div>
            <div className="divide-y divide-[#1c2035]">
              <div className="flex items-center justify-between px-[16px] py-[9px]">
                <span className="text-[11px] text-[#4a5070]">Status</span>
                <span className="text-[12px] font-medium text-[#edf0f7]">
                  {isOwnerActive ? (
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
                <span className="text-[11px] text-[#4a5070]">Units zugeordnet</span>
                <span className="text-[12px] font-medium text-[#edf0f7]">{units.length}</span>
              </div>
              <div className="flex items-center justify-between px-[16px] py-[9px]">
                <span className="text-[11px] text-[#4a5070]">Dokumente</span>
                <span className="text-[12px] font-medium text-[#edf0f7]">{ownerDocuments.length}</span>
              </div>
              <div className="flex items-center justify-between px-[16px] py-[9px]">
                <span className="text-[11px] text-[#4a5070]">Änderungen</span>
                <span className="text-[12px] font-medium text-[#edf0f7]">{auditLogs.length}</span>
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-[12px] border border-[#1c2035] bg-[#10121a]">
            <div className="flex items-center justify-between border-b border-[#1c2035] px-[16px] py-[12px]">
              <span className="text-[11px] font-medium uppercase tracking-[0.5px] text-[#edf0f7]">
                Zugeordnete Units
              </span>
              <span className="text-[10px] text-[#4a5070]">{units.length}</span>
            </div>
            <div className="px-[16px] py-[14px]">
              {unitsLoading ? (
                <div className="space-y-2" aria-busy="true">
                  <p className="text-[12px] text-[#4a5070]">Lade Units …</p>
                  <div className="h-2 w-full max-w-xs animate-pulse rounded bg-[#141720]" />
                  <div className="h-2 w-full max-w-[14rem] animate-pulse rounded bg-[#141720]" />
                </div>
              ) : unitsError ? (
                <p className="text-[12px] text-[#ff5f6d]">{unitsError}</p>
              ) : units.length === 0 ? (
                <p className="m-0 text-[11px] italic text-[#4a5070]">Keine Units zugeordnet</p>
              ) : (
                <ul className="m-0 list-none p-0">
                  {units.map((u, ui) => {
                    const uid = u.unitId ?? u.id;
                    const title = (u.title || u.name || "").trim() || "—";
                    const typeLabel = normalizeUnitTypeLabel(u.type) || String(u.type || "").trim() || "—";
                    const addr = String(u.address || "").trim();
                    const zip = String(u.zip ?? "").trim();
                    const city = String(u.city || "").trim();
                    const zipCity = [zip, city].filter(Boolean).join(" ");
                    const propTitle = String(u.property_title || "").trim();
                    const addrLine = [addr, zipCity].filter(Boolean).join(", ");
                    const rentRaw = u.tenantPriceMonthly;
                    const rentN = Number(rentRaw);
                    const rentStr = formatChfMonthly(rentRaw);
                    return (
                      <li key={String(uid)} className={ui < units.length - 1 ? "mb-[8px]" : ""}>
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
                              <span
                                className={`inline-flex items-center rounded-full px-[6px] py-[1px] text-[9px] font-semibold ${ownerUnitStatusBadgeClass(u.status)}`}
                              >
                                {u.status || "—"}
                              </span>
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
                                rentN > 0 && !Number.isNaN(rentN) ? "font-mono font-medium text-[#3ddc84]" : "text-[#4a5070]"
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
        </aside>
      </div>

      {editOpen && (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 p-4"
          onClick={() => !editSaving && setEditOpen(false)}
          role="presentation"
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[14px] border border-black/10 dark:border-white/[0.07] bg-white p-6 shadow-lg [color-scheme:light] dark:bg-[#141824] dark:[color-scheme:dark]"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="owner-edit-title"
          >
            <h2 id="owner-edit-title" className="mb-4 text-lg font-semibold text-[#0f172a] dark:text-[#eef2ff]">
              Eigentümer bearbeiten
            </h2>
            <div className="space-y-4">
              <div>
                <label htmlFor="owner-edit-name" className="mb-1 block text-[10px] text-[#64748b] dark:text-[#6b7a9a]">
                  Name *
                </label>
                <input
                  id="owner-edit-name"
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                  disabled={editSaving}
                  className="w-full rounded-[8px] border border-black/10 dark:border-white/[0.08] bg-slate-100 dark:bg-[#111520] px-3 py-2 text-sm text-[#0f172a] dark:text-[#eef2ff] disabled:opacity-60"
                />
              </div>
              <div>
                <label htmlFor="owner-edit-email" className="mb-1 block text-[10px] text-[#64748b] dark:text-[#6b7a9a]">
                  E-Mail
                </label>
                <input
                  id="owner-edit-email"
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                  disabled={editSaving}
                  className="w-full rounded-[8px] border border-black/10 dark:border-white/[0.08] bg-slate-100 dark:bg-[#111520] px-3 py-2 text-sm text-[#0f172a] dark:text-[#eef2ff] disabled:opacity-60"
                />
              </div>
              <div>
                <label htmlFor="owner-edit-phone" className="mb-1 block text-[10px] text-[#64748b] dark:text-[#6b7a9a]">
                  Telefon
                </label>
                <input
                  id="owner-edit-phone"
                  type="text"
                  value={editForm.phone}
                  onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                  disabled={editSaving}
                  className="w-full rounded-[8px] border border-black/10 dark:border-white/[0.08] bg-slate-100 dark:bg-[#111520] px-3 py-2 text-sm text-[#0f172a] dark:text-[#eef2ff] disabled:opacity-60"
                />
              </div>
              <div>
                <label htmlFor="owner-edit-addr" className="mb-1 block text-[10px] text-[#64748b] dark:text-[#6b7a9a]">
                  Adresse *
                </label>
                <input
                  id="owner-edit-addr"
                  type="text"
                  value={editForm.address_line1}
                  onChange={(e) => setEditForm((f) => ({ ...f, address_line1: e.target.value }))}
                  disabled={editSaving}
                  placeholder="Strasse Nr."
                  className="w-full rounded-[8px] border border-black/10 dark:border-white/[0.08] bg-slate-100 dark:bg-[#111520] px-3 py-2 text-sm text-[#0f172a] dark:text-[#eef2ff] disabled:opacity-60"
                />
              </div>
              <div>
                <label htmlFor="owner-edit-plz" className="mb-1 block text-[10px] text-[#64748b] dark:text-[#6b7a9a]">
                  PLZ *
                </label>
                <input
                  id="owner-edit-plz"
                  type="text"
                  value={editForm.postal_code}
                  onChange={handleEditPostalCodeChange}
                  disabled={editSaving}
                  className="w-full rounded-[8px] border border-black/10 dark:border-white/[0.08] bg-slate-100 dark:bg-[#111520] px-3 py-2 text-sm text-[#0f172a] dark:text-[#eef2ff] disabled:opacity-60"
                />
                {editPlzNotFound ? (
                  <p className="mt-1 text-xs text-[#64748b] dark:text-[#6b7a9a]">PLZ nicht gefunden</p>
                ) : null}
              </div>
              <div>
                <label htmlFor="owner-edit-city" className="mb-1 block text-[10px] text-[#64748b] dark:text-[#6b7a9a]">
                  Ort *
                </label>
                <input
                  id="owner-edit-city"
                  type="text"
                  value={editForm.city}
                  onChange={(e) => setEditForm((f) => ({ ...f, city: e.target.value }))}
                  disabled={editSaving}
                  className="w-full rounded-[8px] border border-black/10 dark:border-white/[0.08] bg-slate-100 dark:bg-[#111520] px-3 py-2 text-sm text-[#0f172a] dark:text-[#eef2ff] disabled:opacity-60"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    window.open(
                      buildGoogleMapsSearchUrl(
                        editForm.address_line1,
                        editForm.postal_code,
                        editForm.city
                      ),
                      "_blank",
                      "noopener,noreferrer"
                    );
                    setEditAddressCheckBusy(true);
                    setEditCantonHint("Kanton wird ermittelt …");
                    verifyAdminAddress({
                      address_line1: editForm.address_line1,
                      postal_code: editForm.postal_code,
                      city: editForm.city,
                    })
                      .then((res) => {
                        const c = res?.normalized?.canton;
                        if (res?.valid && c != null && String(c).trim() !== "") {
                          const code = String(c).trim().toUpperCase();
                          setEditForm((f) => ({ ...f, canton: code }));
                          setEditCantonHint("Kanton automatisch erkannt.");
                        } else {
                          setEditCantonHint(
                            "Kein Kanton automatisch ermittelbar. Bitte bei Bedarf manuell wählen."
                          );
                        }
                      })
                      .catch(() =>
                        setEditCantonHint("Kanton konnte nicht automatisch ermittelt werden.")
                      )
                      .finally(() => setEditAddressCheckBusy(false));
                  }}
                  disabled={
                    editSaving ||
                    editAddressCheckBusy ||
                    !(editForm.address_line1 || "").trim() ||
                    !(editForm.postal_code || "").trim() ||
                    !(editForm.city || "").trim()
                  }
                  className="self-start rounded-[8px] border border-black/10 dark:border-white/[0.1] bg-transparent px-3 py-2 text-xs font-semibold text-[#8090b0] hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {editAddressCheckBusy ? "…" : "Adresse prüfen"}
                </button>
                <p className="text-xs text-[#64748b] dark:text-[#6b7a9a]">
                  Öffnet Google Maps in einem neuen Tab. Der Kanton wird im Hintergrund ergänzt, wenn die
                  Abfrage einen Wert liefert.
                </p>
                {editCantonHint ? <p className="text-xs text-[#64748b] dark:text-[#6b7a9a]">{editCantonHint}</p> : null}
              </div>
              <div>
                <label htmlFor="owner-edit-canton" className="mb-1 block text-[10px] text-[#64748b] dark:text-[#6b7a9a]">
                  Kanton
                </label>
                <p className="mb-1 text-xs text-[#64748b] dark:text-[#6b7a9a]">
                  Optional — oft nach «Adresse prüfen» gesetzt; manuelle Auswahl möglich.
                </p>
                <select
                  id="owner-edit-canton"
                  value={editForm.canton || ""}
                  onChange={(e) => setEditForm((f) => ({ ...f, canton: e.target.value }))}
                  disabled={editSaving || editCantonLockedByPlz}
                  className="w-full rounded-[8px] border border-black/10 dark:border-white/[0.08] bg-slate-100 dark:bg-[#111520] px-3 py-2 text-sm text-[#0f172a] dark:text-[#eef2ff] disabled:opacity-60"
                >
                  <option value="">—</option>
                  {editForm.canton && !SWISS_CANTON_CODES.includes(editForm.canton) ? (
                    <option value={editForm.canton}>{editForm.canton}</option>
                  ) : null}
                  {SWISS_CANTON_CODES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="owner-edit-status" className="mb-1 block text-[10px] text-[#64748b] dark:text-[#6b7a9a]">
                  Status
                </label>
                <select
                  id="owner-edit-status"
                  value={editForm.status}
                  onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value }))}
                  disabled={editSaving}
                  className="w-full rounded-[8px] border border-black/10 dark:border-white/[0.08] bg-slate-100 dark:bg-[#111520] px-3 py-2 text-sm text-[#0f172a] dark:text-[#eef2ff] disabled:opacity-60"
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
                  disabled={editSaving}
                  className="flex-1 rounded-[8px] border-none bg-gradient-to-r from-[#5b8cff] to-[#7c5cfc] px-3 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
                >
                  {editSaving ? "Speichern …" : "Speichern"}
                </button>
                <button
                  type="button"
                  disabled={editSaving}
                  onClick={() => setEditOpen(false)}
                  className="rounded-[8px] border border-black/10 dark:border-white/[0.1] bg-transparent px-3 py-2 text-sm font-semibold text-[#8090b0] hover:bg-white/[0.04]"
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

export default AdminOwnerDetailPage;
