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
import { COMMON_AUDIT_FIELD_LABELS } from "../../utils/auditFieldLabels";
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

const OWNER_FIELD_LABELS = {
  ...COMMON_AUDIT_FIELD_LABELS,
};

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

function formatOwnerAuditDisplayValue(field, value) {
  if (value == null || value === "") return "—";
  if (field === "status") {
    const s = String(value).toLowerCase();
    return s === "inactive" ? "Inaktiv" : "Aktiv";
  }
  return String(value);
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
      <p className="min-h-[40vh] bg-[#07090f] px-2 py-8 text-[#6b7a9a]">Lade Eigentümer …</p>
    );
  }

  if (error || !owner) {
    return (
      <div className="max-w-3xl bg-[#07090f] px-2 py-6 text-[#eef2ff]">
        <p className="mb-3 text-[#f87171]">{error || "Nicht gefunden."}</p>
        <button
          type="button"
          onClick={() => navigate("/admin/owners")}
          className="rounded-[8px] border border-white/[0.1] bg-transparent px-4 py-2 text-sm font-semibold text-[#8090b0] hover:bg-white/[0.04]"
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
    <div className="min-h-screen max-w-3xl bg-[#07090f] px-2 py-6 text-[#eef2ff]">
      <p className="mb-4">
        <Link
          to="/admin/owners"
          className="text-sm font-semibold text-[#7aaeff] hover:underline"
        >
          ← Eigentümer
        </Link>
      </p>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 gap-y-2">
            <h1 className="text-[22px] font-bold tracking-tight text-[#eef2ff]">{displayName}</h1>
            <span
              className={
                isOwnerActive
                  ? "inline-flex items-center rounded-full border border-green-500/20 bg-green-500/10 px-2.5 py-0.5 text-[10px] font-bold text-green-400"
                  : "inline-flex items-center rounded-full border border-white/[0.08] bg-white/[0.05] px-2.5 py-0.5 text-[10px] font-bold text-[#6b7a9a]"
              }
            >
              {isOwnerActive ? "Aktiv" : "Inaktiv"}
            </span>
          </div>
          <p className="mt-1 text-[12px] text-[#6b7a9a]">Eigentümer / Owner</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={openEdit}
            className="inline-flex items-center rounded-[8px] border border-white/[0.1] bg-transparent px-3 py-2 text-sm font-semibold text-[#8090b0] hover:bg-white/[0.04]"
          >
            Bearbeiten
          </button>
          <button
            type="button"
            disabled={statusSaving}
            onClick={handleToggleStatus}
            className={
              isOwnerActive
                ? "inline-flex items-center rounded-[8px] border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm font-semibold text-[#f87171] hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-60"
                : "inline-flex items-center rounded-[8px] border-none bg-gradient-to-r from-[#5b8cff] to-[#7c5cfc] px-3 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
            }
          >
            {statusSaving
              ? "…"
              : isOwnerActive
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
            <p className="mt-1 text-[13px] font-medium text-[#eef2ff]">{owner.email?.trim() || "—"}</p>
          </div>
          <div>
            <p className="text-[10px] text-[#6b7a9a]">Telefonnummer</p>
            <p className="mt-1 text-[13px] font-medium text-[#eef2ff]">{owner.phone?.trim() || "—"}</p>
          </div>
        </div>
      </section>

      <section className="mb-4 rounded-[14px] border border-white/[0.07] bg-[#141824] p-5 md:p-6">
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
                  buildGoogleMapsSearchUrl(owner.address_line1, owner.postal_code, owner.city),
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
                value={ownerDocCategory}
                onChange={(e) => setOwnerDocCategory(e.target.value)}
                disabled={ownerDocUploading || !id}
                style={{
                  fontSize: "13px",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: "8px",
                  padding: "6px 8px",
                  color: "#eef2ff",
                  background: ownerDocUploading || !id ? "#0d1118" : "#111520",
                  opacity: ownerDocUploading || !id ? 0.7 : 1,
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
              ref={ownerDocFileInputRef}
              type="file"
              style={{ display: "none" }}
              onChange={handleOwnerDocSelected}
            />
            <button
              type="button"
              onClick={handleOwnerDocPick}
              disabled={ownerDocUploading || !id}
              style={{
                fontSize: "13px",
                border: "1px solid rgba(255,255,255,0.1)",
                background: "transparent",
                color: "#8090b0",
                padding: "8px 12px",
                borderRadius: "8px",
                fontWeight: 600,
                cursor: ownerDocUploading || !id ? "not-allowed" : "pointer",
                opacity: ownerDocUploading || !id ? 0.7 : 1,
              }}
            >
              {ownerDocUploading ? "Wird hochgeladen …" : "Hochladen"}
            </button>
          </div>
        </div>
        {ownerDocUploadError ? (
          <p style={{ margin: "0 0 8px 0", fontSize: "13px", color: "#f87171" }}>{ownerDocUploadError}</p>
        ) : null}
        {ownerDocsLoading ? (
          <p style={{ margin: 0, fontSize: "0.875rem", color: "#6b7a9a" }}>Lade Dokumente …</p>
        ) : ownerDocuments.length === 0 ? (
          <p style={{ margin: 0, fontSize: "0.875rem", color: "#6b7a9a" }}>Keine Dokumente vorhanden</p>
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
                {ownerDocuments.map((doc) => (
                  <tr key={String(doc.id)}>
                    <td style={{ ...tdCell, fontWeight: 600 }}>{doc.file_name || "—"}</td>
                    <td style={{ ...tdCell, color: "#6b7a9a" }}>{formatOwnerDocumentType(doc)}</td>
                    <td style={{ ...tdCell, color: "#6b7a9a" }}>
                      {formatOwnerDocumentCategoryLabel(doc.category)}
                    </td>
                    <td style={{ ...tdCell, color: "#6b7a9a" }}>
                      {formatOwnerDocumentDate(doc.created_at)}
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
                          onClick={() => handleOpenOwnerDocument(doc.id)}
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
                          onClick={() => handleDeleteOwnerDocument(doc.id)}
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
          <p className="text-sm text-[#6b7a9a]">Keine Units zugeordnet</p>
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
                    <p className="text-sm font-medium text-[#eef2ff]">Eigentümer angelegt</p>
                    <p className="mt-0.5 text-xs text-[#6b7a9a]">
                      {formatDateTime(log.created_at)}
                      {actorSuffix}
                    </p>
                  </li>
                );
              }

              const ov = log.old_values && typeof log.old_values === "object" ? log.old_values : {};
              const nv = log.new_values && typeof log.new_values === "object" ? log.new_values : {};
              if (
                nv.document_uploaded != null &&
                String(nv.document_uploaded).trim() !== ""
              ) {
                return (
                  <li key={log.id}>
                    <p className="text-sm font-medium text-[#eef2ff]">
                      Dokument hochgeladen: {String(nv.document_uploaded)}
                    </p>
                    <p className="mt-0.5 text-xs text-[#6b7a9a]">
                      {formatDateTime(log.created_at)}
                      {actorSuffix}
                    </p>
                  </li>
                );
              }
              if (
                ov.document_deleted != null &&
                String(ov.document_deleted).trim() !== ""
              ) {
                return (
                  <li key={log.id}>
                    <p className="text-sm font-medium text-[#eef2ff]">
                      Dokument gelöscht: {String(ov.document_deleted)}
                    </p>
                    <p className="mt-0.5 text-xs text-[#6b7a9a]">
                      {formatDateTime(log.created_at)}
                      {actorSuffix}
                    </p>
                  </li>
                );
              }
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
              const label = OWNER_FIELD_LABELS[field] || field;
              const oldD = formatOwnerAuditDisplayValue(field, ov[field]);
              const newD = formatOwnerAuditDisplayValue(field, nv[field]);
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
            aria-labelledby="owner-edit-title"
          >
            <h2 id="owner-edit-title" className="mb-4 text-lg font-semibold text-[#eef2ff]">
              Eigentümer bearbeiten
            </h2>
            <div className="space-y-4">
              <div>
                <label htmlFor="owner-edit-name" className="mb-1 block text-[10px] text-[#6b7a9a]">
                  Name *
                </label>
                <input
                  id="owner-edit-name"
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                  disabled={editSaving}
                  className="w-full rounded-[8px] border border-white/[0.08] bg-[#111520] px-3 py-2 text-sm text-[#eef2ff] disabled:opacity-60"
                />
              </div>
              <div>
                <label htmlFor="owner-edit-email" className="mb-1 block text-[10px] text-[#6b7a9a]">
                  E-Mail
                </label>
                <input
                  id="owner-edit-email"
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                  disabled={editSaving}
                  className="w-full rounded-[8px] border border-white/[0.08] bg-[#111520] px-3 py-2 text-sm text-[#eef2ff] disabled:opacity-60"
                />
              </div>
              <div>
                <label htmlFor="owner-edit-phone" className="mb-1 block text-[10px] text-[#6b7a9a]">
                  Telefon
                </label>
                <input
                  id="owner-edit-phone"
                  type="text"
                  value={editForm.phone}
                  onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                  disabled={editSaving}
                  className="w-full rounded-[8px] border border-white/[0.08] bg-[#111520] px-3 py-2 text-sm text-[#eef2ff] disabled:opacity-60"
                />
              </div>
              <div>
                <label htmlFor="owner-edit-addr" className="mb-1 block text-[10px] text-[#6b7a9a]">
                  Adresse *
                </label>
                <input
                  id="owner-edit-addr"
                  type="text"
                  value={editForm.address_line1}
                  onChange={(e) => setEditForm((f) => ({ ...f, address_line1: e.target.value }))}
                  disabled={editSaving}
                  placeholder="Strasse Nr."
                  className="w-full rounded-[8px] border border-white/[0.08] bg-[#111520] px-3 py-2 text-sm text-[#eef2ff] disabled:opacity-60"
                />
              </div>
              <div>
                <label htmlFor="owner-edit-plz" className="mb-1 block text-[10px] text-[#6b7a9a]">
                  PLZ *
                </label>
                <input
                  id="owner-edit-plz"
                  type="text"
                  value={editForm.postal_code}
                  onChange={handleEditPostalCodeChange}
                  disabled={editSaving}
                  className="w-full rounded-[8px] border border-white/[0.08] bg-[#111520] px-3 py-2 text-sm text-[#eef2ff] disabled:opacity-60"
                />
                {editPlzNotFound ? (
                  <p className="mt-1 text-xs text-[#6b7a9a]">PLZ nicht gefunden</p>
                ) : null}
              </div>
              <div>
                <label htmlFor="owner-edit-city" className="mb-1 block text-[10px] text-[#6b7a9a]">
                  Ort *
                </label>
                <input
                  id="owner-edit-city"
                  type="text"
                  value={editForm.city}
                  onChange={(e) => setEditForm((f) => ({ ...f, city: e.target.value }))}
                  disabled={editSaving}
                  className="w-full rounded-[8px] border border-white/[0.08] bg-[#111520] px-3 py-2 text-sm text-[#eef2ff] disabled:opacity-60"
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
                  className="self-start rounded-[8px] border border-white/[0.1] bg-transparent px-3 py-2 text-xs font-semibold text-[#8090b0] hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {editAddressCheckBusy ? "…" : "Adresse prüfen"}
                </button>
                <p className="text-xs text-[#6b7a9a]">
                  Öffnet Google Maps in einem neuen Tab. Der Kanton wird im Hintergrund ergänzt, wenn die
                  Abfrage einen Wert liefert.
                </p>
                {editCantonHint ? <p className="text-xs text-[#6b7a9a]">{editCantonHint}</p> : null}
              </div>
              <div>
                <label htmlFor="owner-edit-canton" className="mb-1 block text-[10px] text-[#6b7a9a]">
                  Kanton
                </label>
                <p className="mb-1 text-xs text-[#6b7a9a]">
                  Optional — oft nach «Adresse prüfen» gesetzt; manuelle Auswahl möglich.
                </p>
                <select
                  id="owner-edit-canton"
                  value={editForm.canton || ""}
                  onChange={(e) => setEditForm((f) => ({ ...f, canton: e.target.value }))}
                  disabled={editSaving || editCantonLockedByPlz}
                  className="w-full rounded-[8px] border border-white/[0.08] bg-[#111520] px-3 py-2 text-sm text-[#eef2ff] disabled:opacity-60"
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
                <label htmlFor="owner-edit-status" className="mb-1 block text-[10px] text-[#6b7a9a]">
                  Status
                </label>
                <select
                  id="owner-edit-status"
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
                  disabled={editSaving}
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

export default AdminOwnerDetailPage;
