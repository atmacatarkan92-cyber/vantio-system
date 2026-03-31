import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  createAdminPropertyManagerNote,
  fetchAdminLandlord,
  fetchAdminPropertyManager,
  fetchAdminPropertyManagerNotes,
  fetchAdminPropertyManagerUnits,
  normalizeUnit,
  patchAdminPropertyManager,
} from "../../api/adminData";
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

function AdminPropertyManagerDetailPage() {
  const { id } = useParams();
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
  }, [id]);

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
    return <p className="px-2 text-slate-500">Lade Bewirtschafter …</p>;
  }

  if (error || !pm) {
    return (
      <div className="px-2 max-w-3xl">
        <p className="text-red-700 mb-3">{error || "Nicht gefunden."}</p>
        <button
          type="button"
          onClick={() => navigate("/admin/bewirtschafter")}
          className="px-4 py-2 rounded-lg bg-slate-900 text-white font-semibold text-sm hover:bg-slate-800"
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
      .then((row) => setPm(row))
      .catch((e) => {
        window.alert(e?.message || "Status konnte nicht geändert werden.");
      })
      .finally(() => setStatusSaving(false));
  };

  return (
    <div className="px-2 max-w-3xl">
      <p className="mb-4">
        <Link
          to="/admin/bewirtschafter"
          className="text-sm font-semibold text-slate-900 hover:underline"
        >
          ← Bewirtschafter
        </Link>
      </p>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 gap-y-2">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">{displayName}</h1>
            <span
              className={
                isPmActive
                  ? "inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800"
                  : "inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600"
              }
            >
              {isPmActive ? "Aktiv" : "Inaktiv"}
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">Bewirtschafter / Property Manager</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => navigate(`/admin/bewirtschafter?edit=${encodeURIComponent(id)}`)}
            className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            Bearbeiten
          </button>
          <button
            type="button"
            disabled={statusSaving}
            onClick={handleToggleStatus}
            className="inline-flex items-center rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {statusSaving
              ? "…"
              : isPmActive
                ? "Als inaktiv markieren"
                : "Aktivieren"}
          </button>
        </div>
      </div>

      <section className="rounded-xl border border-slate-200 shadow-sm bg-white p-5 md:p-6 mb-4">
        <h2 className="text-sm font-semibold text-slate-900 mb-4">Stammdaten</h2>
        <div className="space-y-4">
          <div>
            <p className="text-xs font-medium text-slate-500">Name</p>
            <p className="text-sm font-medium text-slate-900 mt-1">{displayName}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">E-Mail</p>
            <p className="text-sm font-medium text-slate-900 mt-1">{pm.email?.trim() || "—"}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Telefonnummer</p>
            <p className="text-sm font-medium text-slate-900 mt-1">{pm.phone?.trim() || "—"}</p>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 shadow-sm bg-white p-5 md:p-6 mb-4">
        <h2 className="text-sm font-semibold text-slate-900 mb-4">Zugeordnete Verwaltung</h2>
        {!pm.landlord_id ? (
          <p className="text-sm text-slate-500">Keine Verwaltung zugeordnet</p>
        ) : landlordRow === undefined ? (
          <p className="text-sm text-slate-500">Lade Verwaltung …</p>
        ) : landlordRow ? (
          <div>
            <Link
              to={`/admin/landlords/${encodeURIComponent(pm.landlord_id)}`}
              className="text-sm font-semibold text-blue-600 hover:text-blue-800 hover:underline underline-offset-2"
            >
              {landlordLabel(landlordRow)}
            </Link>
          </div>
        ) : (
          <p className="text-sm text-slate-600">
            Die zugeordnete Verwaltung konnte nicht geladen werden.
          </p>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 shadow-sm bg-white p-5 md:p-6 mb-4">
        <h2 className="text-sm font-semibold text-slate-900 mb-4">Notizen</h2>
        <form
          className="mb-6"
          onSubmit={(e) => {
            e.preventDefault();
            saveNewNote();
          }}
        >
          <label htmlFor="pm-new-note" className="text-xs font-medium text-slate-500 block mb-1.5">
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
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300 disabled:opacity-60"
          />
          {newNoteErr ? <p className="mt-2 text-sm text-red-700">{newNoteErr}</p> : null}
          {newNoteSubmitErr ? <p className="mt-2 text-sm text-red-700">{newNoteSubmitErr}</p> : null}
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
        <div className="border-t border-slate-100 pt-5">
          <p className="text-xs font-medium text-slate-500 mb-3">Alle Notizen</p>
          {notesLoading ? (
            <p className="text-sm text-slate-500">Lade Notizen …</p>
          ) : !notes.length ? (
            <p className="text-sm text-slate-500">Noch keine Notizen vorhanden.</p>
          ) : (
            <ul className="space-y-4">
              {notes.map((n) => (
                <li key={n.id} className="border-b border-slate-100 pb-4 last:border-0 last:pb-0">
                  <p className="text-sm text-slate-900 whitespace-pre-wrap">{n.content}</p>
                  <p className="mt-2 text-xs text-slate-500">
                    {formatDateTime(n.created_at)} · {n.author_name || "—"}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 shadow-sm bg-white p-5 md:p-6 mb-4">
        <h2 className="text-sm font-semibold text-slate-900 mb-4">Historie</h2>
        <p className="text-xs text-slate-500 mb-3">
          Basierend auf gespeicherten Stammdaten (kein vollständiges Audit-Protokoll).
        </p>
        <ul className="space-y-3 border-l-2 border-slate-200 pl-4 ml-1">
          <li>
            <p className="text-xs font-medium text-slate-500">Erstellt am</p>
            <p className="text-sm font-medium text-slate-900 mt-0.5">{formatDateTime(pm.created_at)}</p>
          </li>
          <li>
            <p className="text-xs font-medium text-slate-500">Zuletzt aktualisiert</p>
            <p className="text-sm font-medium text-slate-900 mt-0.5">
              {formatDateTime(pm.updated_at)}
            </p>
          </li>
          <li>
            <p className="text-xs font-medium text-slate-500">Status</p>
            <p className="text-sm font-medium text-slate-900 mt-0.5">
              {isPmActive ? "Aktiv" : "Inaktiv"}
            </p>
          </li>
        </ul>
      </section>

      <section className="rounded-xl border border-slate-200 shadow-sm bg-white p-5 md:p-6 mb-4">
        <h2 className="text-sm font-semibold text-slate-900 mb-4">Zugeordnete Units</h2>
        {unitsLoading ? (
          <div className="space-y-2" aria-busy="true">
            <p className="text-sm text-slate-500">Lade Units …</p>
            <div className="h-2 w-full max-w-xs rounded bg-slate-100 animate-pulse" />
            <div className="h-2 w-full max-w-[14rem] rounded bg-slate-100 animate-pulse" />
          </div>
        ) : unitsError ? (
          <p className="text-sm text-red-700">{unitsError}</p>
        ) : units.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-5 py-8 text-center">
            <p className="text-sm font-semibold text-slate-900">Keine Units zugeordnet</p>
            <p className="text-sm text-slate-500 mt-2 max-w-md mx-auto">
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
                      {zipCity ? <p className="text-sm text-slate-600">{zipCity}</p> : null}
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
    </div>
  );
}

export default AdminPropertyManagerDetailPage;
