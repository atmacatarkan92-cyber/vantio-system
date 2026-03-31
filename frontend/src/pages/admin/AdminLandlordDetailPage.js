import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  createAdminLandlordNote,
  deleteAdminLandlord,
  deleteAdminLandlordDocument,
  fetchAdminLandlord,
  fetchAdminLandlordDocumentDownloadUrl,
  fetchAdminLandlordDocuments,
  fetchAdminLandlordNotes,
  fetchAdminLandlordPropertyManagers,
  fetchAdminLandlordUnits,
  normalizeUnit,
  restoreAdminLandlord,
  updateAdminLandlordNote,
  uploadAdminLandlordDocument,
} from "../../api/adminData";
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
    return "border-sky-200 bg-sky-50 text-sky-800";
  }
  if (raw === "Business Apartment") {
    return "border-violet-200 bg-violet-50 text-violet-800";
  }
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function unitStatusBadgeClasses(status) {
  const s = String(status ?? "").trim().toLowerCase();
  if (s === "frei" || s === "") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (s === "belegt" || s === "occupied") return "border-blue-200 bg-blue-50 text-blue-800";
  if (s === "reserviert" || s === "reserved") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-slate-200 bg-slate-50 text-slate-700";
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

const thCell = {
  textAlign: "left",
  padding: "10px 12px",
  borderBottom: "1px solid #E5E7EB",
  color: "#64748B",
  fontWeight: 600,
};

const tdCell = {
  padding: "10px 12px",
  borderBottom: "1px solid #F1F5F9",
  verticalAlign: "top",
};

const sectionCard = {
  background: "#FFFFFF",
  border: "1px solid #E5E7EB",
  borderRadius: "14px",
  padding: "16px",
  marginBottom: "12px",
};

const sectionTitle = {
  fontSize: "11px",
  fontWeight: 700,
  color: "#f97316",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  margin: "0 0 10px 0",
};

function AdminLandlordDetailPage() {
  const { id } = useParams();
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
  }, [id]);

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

  if (loading) {
    return <p className="px-2 text-slate-500">Lade Verwaltung …</p>;
  }

  if (error || !row) {
    return (
      <div className="px-2">
        <p className="text-red-700 mb-3">{error || "Nicht gefunden."}</p>
        <button
          type="button"
          onClick={() => navigate("/admin/landlords")}
          className="px-4 py-2 rounded-lg bg-slate-900 text-white font-semibold text-sm hover:bg-slate-800"
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

  return (
    <div className="px-2 max-w-3xl">
      <p className="mb-4">
        <Link to="/admin/landlords" className="text-sm font-semibold text-slate-900 hover:underline">
          ← Verwaltungen
        </Link>
      </p>

      <header className="mb-8 pb-2 border-b border-slate-200/80">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1 pr-4">
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-slate-900 leading-tight">
              {title}
            </h1>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3 shrink-0">
            {isArchived ? (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-slate-200 text-slate-700">
                Archiviert
              </span>
            ) : null}
            <span
              className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${
                isInactive ? "bg-slate-100 text-slate-600" : "bg-emerald-100 text-emerald-800"
              }`}
            >
              {statusLabel}
            </span>
            {!isArchived ? (
              <button
                type="button"
                onClick={() => navigate(`/admin/landlords?edit=${encodeURIComponent(id)}`)}
                className="inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-semibold border border-slate-200 bg-white text-slate-900 hover:bg-slate-50 transition-colors"
              >
                Bearbeiten
              </button>
            ) : null}
            {isArchived ? (
              <button
                type="button"
                onClick={() => setRestoreModalOpen(true)}
                className="inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-semibold border border-emerald-200 bg-white text-emerald-800 hover:bg-emerald-50 transition-colors"
              >
                Reaktivieren
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setArchiveModalOpen(true)}
                className="inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-semibold border border-red-200 bg-white text-red-700 hover:bg-red-50 transition-colors"
              >
                Archivieren
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="space-y-6">
        <section className="rounded-xl border border-slate-200 shadow-sm bg-white p-5 md:p-6">
          <h2 className="text-sm font-semibold text-slate-900 mb-4">Kontakt</h2>
          <div className="space-y-4">
            <div>
              <p className="text-xs font-medium text-slate-500">Kontaktperson</p>
              <p className="text-sm font-medium text-slate-900 mt-1">{dash(row.contact_name)}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">E-Mail</p>
              <p className="text-sm font-medium text-slate-900 mt-1">{dash(row.email)}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">Telefon</p>
              <p className="text-sm font-medium text-slate-900 mt-1">{dash(row.phone)}</p>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 shadow-sm bg-white p-5 md:p-6">
          <h2 className="text-sm font-semibold text-slate-900 mb-4">Adresse</h2>
          <div className="flex items-start gap-2">
            <div className="text-sm font-medium text-slate-900 space-y-1 flex-1 min-w-0">
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
                className="shrink-0 p-1 rounded-md text-slate-500 hover:text-slate-800 hover:bg-slate-100 inline-flex items-center justify-center"
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

        <section className="rounded-xl border border-slate-200 shadow-sm bg-white p-5 md:p-6">
          <h2 className="text-sm font-semibold text-slate-900 mb-4">Weitere Angaben</h2>
          <div className="space-y-4">
            <div>
              <p className="text-xs font-medium text-slate-500">Website</p>
              <div className="text-sm font-medium text-slate-900 mt-1">
                {row.website?.trim() ? (
                  <a
                    href={
                      /^https?:\/\//i.test(row.website.trim())
                        ? row.website.trim()
                        : `https://${row.website.trim()}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    {row.website.trim()}
                  </a>
                ) : (
                  "—"
                )}
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">Allgemeine Notizen</p>
              <p className="text-sm font-medium text-slate-900 mt-1 whitespace-pre-wrap">{dash(row.notes)}</p>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 shadow-sm bg-white p-5 md:p-6">
          <h2 className="text-sm font-semibold text-slate-900 mb-4">Notizen</h2>
          {!isArchived ? (
            <form
              className="mb-6"
              onSubmit={(e) => {
                e.preventDefault();
                saveNewNote();
              }}
            >
              <label htmlFor="landlord-new-note" className="text-xs font-medium text-slate-500 block mb-1.5">
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
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300 disabled:opacity-60"
              />
              {newNoteErr ? (
                <p className="mt-2 text-sm text-red-700">{newNoteErr}</p>
              ) : null}
              {newNoteSubmitErr ? (
                <p className="mt-2 text-sm text-red-700">{newNoteSubmitErr}</p>
              ) : null}
              <div className="mt-3">
                <button
                  type="submit"
                  disabled={newNoteSaving}
                  className="inline-flex items-center rounded-lg bg-orange-500 px-3.5 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  {newNoteSaving ? "Speichern …" : "Notiz speichern"}
                </button>
              </div>
            </form>
          ) : null}
          <div className={!isArchived ? "border-t border-slate-100 pt-5" : ""}>
            <p className="text-xs font-medium text-slate-500 mb-3">Alle Notizen</p>
            {!notes.length ? (
              <p className="text-sm text-slate-500">Noch keine Notizen</p>
            ) : (
              <ul className="space-y-4">
                {notes.map((n) => (
                  <li key={n.id} className="border-b border-slate-100 pb-4 last:border-0 last:pb-0">
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
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300 disabled:opacity-60"
                        />
                        {editErr ? <p className="mt-2 text-sm text-red-700">{editErr}</p> : null}
                        <div className="mt-2 flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={editSaving}
                            onClick={saveEditNote}
                            className="rounded-lg bg-orange-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-slate-400"
                          >
                            {editSaving ? "Speichern …" : "Speichern"}
                          </button>
                          <button
                            type="button"
                            disabled={editSaving}
                            onClick={cancelEditNote}
                            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
                          >
                            Abbrechen
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <p className="text-sm text-slate-900 whitespace-pre-wrap">{n.content}</p>
                        <p className="mt-2 text-xs text-slate-500">
                          {formatDateTime(n.created_at)} · {n.author_name || "—"}
                        </p>
                        {n.updated_at ? (
                          <p className="mt-1 text-xs text-slate-500">
                            Bearbeitet {formatDateTime(n.updated_at)} · {n.editor_name || "—"}
                          </p>
                        ) : null}
                        {!isArchived ? (
                          <button
                            type="button"
                            onClick={() => startEditNote(n)}
                            className="mt-2 text-sm font-semibold text-slate-700 hover:text-slate-900 underline-offset-2 hover:underline"
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
                  fontSize: "13px",
                  color: "#64748B",
                }}
              >
                <span>Kategorie</span>
                <select
                  value={landlordDocCategory}
                  onChange={(e) => setLandlordDocCategory(e.target.value)}
                  disabled={landlordDocUploading || !id}
                  style={{
                    fontSize: "13px",
                    border: "1px solid #CBD5E1",
                    borderRadius: "8px",
                    padding: "6px 8px",
                    color: "#0F172A",
                    background: landlordDocUploading || !id ? "#F1F5F9" : "#FFFFFF",
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
                  border: "1px solid #CBD5E1",
                  background: landlordDocUploading || !id ? "#F1F5F9" : "#FFFFFF",
                  color: "#334155",
                  padding: "8px 12px",
                  borderRadius: "8px",
                  fontWeight: 600,
                  cursor: landlordDocUploading || !id ? "not-allowed" : "pointer",
                }}
              >
                {landlordDocUploading ? "Wird hochgeladen …" : "Hochladen"}
              </button>
            </div>
          </div>
          {landlordDocUploadError ? (
            <p style={{ margin: "0 0 8px 0", fontSize: "13px", color: "#DC2626" }}>
              {landlordDocUploadError}
            </p>
          ) : null}
          {landlordDocsLoading ? (
            <p style={{ margin: 0, fontSize: "0.875rem", color: "#64748B" }}>Lade Dokumente …</p>
          ) : landlordDocuments.length === 0 ? (
            <p style={{ margin: 0, fontSize: "0.875rem", color: "#64748B" }}>
              Keine Dokumente vorhanden
            </p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: "14px",
                  color: "#0F172A",
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
                      <td style={{ ...tdCell, color: "#64748B" }}>{formatLandlordDocumentType(doc)}</td>
                      <td style={{ ...tdCell, color: "#64748B" }}>
                        {formatLandlordDocumentCategoryLabel(doc.category)}
                      </td>
                      <td style={{ ...tdCell, color: "#64748B" }}>
                        {formatLandlordDocumentDate(doc.created_at)}
                      </td>
                      <td style={{ ...tdCell, color: "#64748B" }}>
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
                              color: "#EA580C",
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
                              color: "#64748B",
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

        <section className="rounded-xl border border-slate-200 shadow-sm bg-white p-5 md:p-6">
          <h2 className="text-sm font-semibold text-slate-900 mb-4">Zugeordnete Units</h2>
          {assignedUnitsLoading ? (
            <div className="space-y-2" aria-busy="true">
              <p className="text-sm text-slate-500">Lade Units …</p>
              <div className="h-2 w-full max-w-xs rounded bg-slate-100 animate-pulse" />
              <div className="h-2 w-full max-w-[14rem] rounded bg-slate-100 animate-pulse" />
            </div>
          ) : assignedUnitsError ? (
            <p className="text-sm text-red-700">{assignedUnitsError}</p>
          ) : assignedUnits.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-5 py-8 text-center">
              <p className="text-sm font-semibold text-slate-900">Keine Units zugeordnet</p>
              <p className="text-sm text-slate-500 mt-2 max-w-md mx-auto">
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
                    className="rounded-2xl border border-slate-200 bg-white shadow-sm p-4 md:p-5 transition-shadow hover:shadow-md"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <Link
                          to={`/admin/units/${encodeURIComponent(uid)}`}
                          className="text-base font-semibold text-slate-900 hover:text-orange-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2 rounded-sm"
                        >
                          {title}
                        </Link>
                        {propTitle ? (
                          <p className="text-xs text-slate-500 mt-1">Liegenschaft: {propTitle}</p>
                        ) : null}
                        {addr ? <p className="text-sm text-slate-600 mt-2">{addr}</p> : null}
                        {zipCity ? (
                          <p className="text-sm text-slate-600">{zipCity}</p>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <span
                          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${unitTypeBadgeClasses(u.type)}`}
                        >
                          {typeLabel}
                        </span>
                        <span
                          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${unitStatusBadgeClasses(u.status)}`}
                        >
                          {u.status || "—"}
                        </span>
                      </div>
                    </div>
                    <p className="text-sm text-slate-700 mt-3 pt-3 border-t border-slate-100">
                      <span className="text-slate-500">Miete (Mieter): </span>
                      <span className="font-semibold tabular-nums text-slate-900">
                        {formatChfMonthly(u.tenantPriceMonthly)}
                      </span>
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 shadow-sm bg-white p-5 md:p-6">
          <h2 className="text-sm font-semibold text-slate-900 mb-4">Bewirtschafter</h2>
          {propertyManagersLoading ? (
            <div className="space-y-2" aria-busy="true">
              <p className="text-sm text-slate-500">Lade Bewirtschafter …</p>
              <div className="h-2 w-full max-w-xs rounded bg-slate-100 animate-pulse" />
              <div className="h-2 w-full max-w-[14rem] rounded bg-slate-100 animate-pulse" />
            </div>
          ) : propertyManagersError ? (
            <p className="text-sm text-red-700">{propertyManagersError}</p>
          ) : sortedPropertyManagers.length === 0 ? (
            <div className="space-y-3">
              <p className="text-sm text-slate-500">Kein Bewirtschafter zugeordnet</p>
              <Link
                to="/admin/bewirtschafter"
                className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
              >
                Bewirtschafter zuweisen
              </Link>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 border border-slate-100 rounded-lg overflow-hidden">
              {sortedPropertyManagers.map((pm) => (
                <li key={pm.id} className="px-4 py-3 bg-slate-50/50">
                  <Link
                    to={`/admin/bewirtschafter?edit=${encodeURIComponent(pm.id)}`}
                    className="text-sm font-semibold text-blue-600 hover:text-blue-800 hover:underline underline-offset-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 rounded-sm"
                  >
                    {propertyManagerDisplayName(pm)}
                  </Link>
                  {pm.email != null && String(pm.email).trim() !== "" ? (
                    <p className="text-xs text-slate-600 mt-1">{String(pm.email).trim()}</p>
                  ) : null}
                  {pm.phone != null && String(pm.phone).trim() !== "" ? (
                    <p className="text-xs text-slate-600 mt-0.5">{String(pm.phone).trim()}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 shadow-sm bg-white p-5 md:p-6">
          <h2 className="text-sm font-semibold text-slate-900 mb-4">Historie</h2>
          <p className="text-xs text-slate-500 mb-3">
            Basierend auf gespeicherten Stammdaten (kein vollständiges Audit-Protokoll).
          </p>
          <ul className="space-y-3 border-l-2 border-slate-200 pl-4 ml-1">
            <li>
              <p className="text-xs font-medium text-slate-500">Erstellt am</p>
              <p className="text-sm font-medium text-slate-900 mt-0.5">{formatDateTime(row.created_at)}</p>
            </li>
            <li>
              <p className="text-xs font-medium text-slate-500">Zuletzt aktualisiert</p>
              <p className="text-sm font-medium text-slate-900 mt-0.5">{formatDateTime(row.updated_at)}</p>
            </li>
            {row.deleted_at ? (
              <li>
                <p className="text-xs font-medium text-slate-500">Archiviert am</p>
                <p className="text-sm font-medium text-slate-900 mt-0.5">{formatDateTime(row.deleted_at)}</p>
              </li>
            ) : null}
            <li>
              <p className="text-xs font-medium text-slate-500">Status</p>
              <p className="text-sm font-medium text-slate-900 mt-0.5">{isArchived ? "Archiviert" : "Aktiv"}</p>
            </li>
          </ul>
        </section>
      </div>

      {restoreModalOpen && (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/30 p-4"
          onClick={() => !restoring && setRestoreModalOpen(false)}
          role="presentation"
        >
          <div
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="restore-landlord-title"
          >
            <h2 id="restore-landlord-title" className="text-lg font-semibold text-slate-900 mb-3">
              Verwaltung reaktivieren?
            </h2>
            <p className="text-sm text-slate-600 mb-6">
              Die Verwaltung wird wieder aktiv und erscheint in der normalen Verwaltungsliste unter «Aktiv».
            </p>
            <div className="flex flex-wrap gap-2 justify-end">
              <button
                type="button"
                disabled={restoring}
                onClick={() => setRestoreModalOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-200 bg-slate-50 text-slate-800 text-sm font-semibold hover:bg-slate-100 disabled:opacity-50"
              >
                Abbrechen
              </button>
              <button
                type="button"
                disabled={restoring}
                onClick={() => {
                  setRestoring(true);
                  restoreAdminLandlord(id)
                    .then((data) => {
                      toast.success("Verwaltung wurde reaktiviert.");
                      setRestoreModalOpen(false);
                      setRow(data);
                    })
                    .catch((e) => {
                      toast.error(e.message || "Reaktivieren fehlgeschlagen.");
                    })
                    .finally(() => setRestoring(false));
                }}
                className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50"
              >
                {restoring ? "…" : "Jetzt reaktivieren"}
              </button>
            </div>
          </div>
        </div>
      )}

      {archiveModalOpen && (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/30 p-4"
          onClick={() => !archiving && setArchiveModalOpen(false)}
          role="presentation"
        >
          <div
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="archive-landlord-title"
          >
            <h2 id="archive-landlord-title" className="text-lg font-semibold text-slate-900 mb-3">
              Verwaltung archivieren?
            </h2>
            <p className="text-sm text-slate-600 mb-6">
              Die Verwaltung wird archiviert. Sie erscheint nicht mehr in der normalen Verwaltungsliste.
            </p>
            <div className="flex flex-wrap gap-2 justify-end">
              <button
                type="button"
                disabled={archiving}
                onClick={() => setArchiveModalOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-200 bg-slate-50 text-slate-800 text-sm font-semibold hover:bg-slate-100 disabled:opacity-50"
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
                className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50"
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
