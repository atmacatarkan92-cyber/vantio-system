import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  deleteAdminLandlord,
  fetchAdminLandlord,
  fetchAdminLandlordProperties,
  restoreAdminLandlord,
} from "../../api/adminData";

function dash(s) {
  const t = s != null ? String(s).trim() : "";
  return t || "—";
}

function propertyStatusLabel(status) {
  const s = (status || "").toLowerCase();
  if (s === "inactive") return "Inaktiv";
  if (s === "active" || !s) return "Aktiv";
  return status;
}

function formatPropertyStreet(p) {
  const parts = [p.street, p.house_number].filter((x) => x != null && String(x).trim() !== "");
  return parts.length ? parts.join(" ") : "";
}

function formatPropertyCityLine(p) {
  const parts = [p.zip_code, p.city].filter((x) => x != null && String(x).trim() !== "");
  return parts.length ? parts.join(" ") : "";
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
  const [linkedProperties, setLinkedProperties] = useState([]);

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
    fetchAdminLandlordProperties(id)
      .then(setLinkedProperties)
      .catch(() => setLinkedProperties([]));
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
          <div className="text-sm font-medium text-slate-900 space-y-1">
            <p>{addrLine1 ? addrLine1 : "—"}</p>
            <p>{addrLine2 ? addrLine2 : "—"}</p>
            <p>{addrLine3 ? addrLine3 : "—"}</p>
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
              <p className="text-xs font-medium text-slate-500">Notizen</p>
              <p className="text-sm font-medium text-slate-900 mt-1 whitespace-pre-wrap">{dash(row.notes)}</p>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 shadow-sm bg-white p-5 md:p-6">
          <h2 className="text-sm font-semibold text-slate-900 mb-4">Zugeordnete Liegenschaften</h2>
          {linkedProperties.length === 0 ? (
            <p className="text-sm text-slate-500">Keine Liegenschaften zugeordnet</p>
          ) : (
            <ul className="divide-y divide-slate-100 border border-slate-100 rounded-lg overflow-hidden">
              {linkedProperties.map((p) => {
                const streetLine = formatPropertyStreet(p);
                const cityLine = formatPropertyCityLine(p);
                const sub = [streetLine, cityLine].filter(Boolean).join(" · ");
                return (
                  <li key={p.id} className="px-4 py-3 bg-slate-50/50">
                    <p className="text-sm font-medium text-slate-900">{p.title?.trim() || "—"}</p>
                    {sub ? <p className="text-xs text-slate-600 mt-0.5">{sub}</p> : null}
                    <p className="text-xs text-slate-500 mt-1">Status: {propertyStatusLabel(p.status)}</p>
                  </li>
                );
              })}
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
