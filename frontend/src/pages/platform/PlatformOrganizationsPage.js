import React, { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "../../contexts/AuthContext";
import { createPlatformOrganization, fetchPlatformOrganizations } from "../../api/adminData";
import { formatPlatformDateTime } from "../../utils/platformDateTime";

const inputClass =
  "w-full rounded-[8px] border border-black/10 bg-slate-100 px-3 py-2.5 text-[14px] text-[#0f172a] dark:border-white/[0.08] dark:bg-[#111520] dark:text-[#eef2ff]";

function PlatformOrganizationsPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading, isPlatformAdminAuthenticated } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    organization_name: "",
    organization_slug: "",
    admin_email: "",
    admin_password: "",
    admin_password_confirm: "",
  });

  const load = (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    setError("");
    fetchPlatformOrganizations()
      .then((data) => setItems(Array.isArray(data) ? data : []))
      .catch((e) => {
        setError(e.message || "Fehler beim Laden.");
        setItems([]);
      })
      .finally(() => {
        if (showSpinner) setLoading(false);
      });
  };

  useEffect(() => {
    load(true);
  }, []);

  const openCreate = () => {
    setError("");
    setForm({
      organization_name: "",
      organization_slug: "",
      admin_email: "",
      admin_password: "",
      admin_password_confirm: "",
    });
    setFormOpen(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.organization_name.trim()) {
      setError("Organisationsname ist erforderlich.");
      return;
    }
    const em = form.admin_email.trim();
    const pw = form.admin_password;
    if (!em) {
      setError("Admin-E-Mail ist erforderlich.");
      return;
    }
    if (!pw || !String(pw).trim()) {
      setError("Admin-Passwort ist erforderlich.");
      return;
    }
    if (String(form.admin_password) !== String(form.admin_password_confirm)) {
      setError("Passwörter stimmen nicht überein.");
      return;
    }

    setSaving(true);
    setError("");
    const body = {
      organization_name: form.organization_name.trim(),
      organization_slug: form.organization_slug.trim() || null,
      admin_email: em,
      admin_password: String(pw),
    };

    createPlatformOrganization(body)
      .then((data) => {
        setFormOpen(false);
        toast.success("Organisation erstellt.");
        if (data?.organization?.id) {
          const o = data.organization;
          setItems((prev) => {
            if (prev.some((row) => row.id === o.id)) {
              return prev.map((row) => (row.id === o.id ? { ...row, ...o } : row));
            }
            return [o, ...prev];
          });
        }
        load(false);
      })
      .catch((err) => {
        setError(err?.message || "Speichern fehlgeschlagen.");
      })
      .finally(() => setSaving(false));
  };

  if (authLoading) {
    return (
      <div className="min-h-[40vh] bg-[#f8fafc] px-4 py-8 text-[#64748b] [color-scheme:light] dark:bg-[#07090f] dark:text-[#6b7a9a] dark:[color-scheme:dark]">
        Lade …
      </div>
    );
  }

  if (!user || !isPlatformAdminAuthenticated) {
    return <Navigate to="/admin" replace />;
  }

  if (loading) {
    return (
      <div className="min-h-[40vh] bg-[#f8fafc] px-4 py-8 text-[#64748b] [color-scheme:light] dark:bg-[#07090f] dark:text-[#6b7a9a] dark:[color-scheme:dark]">
        Lade Organisationen …
      </div>
    );
  }

  return (
    <div className="grid min-h-screen gap-6 bg-[#f8fafc] px-4 py-6 text-[#0f172a] [color-scheme:light] dark:bg-[#07090f] dark:text-[#eef2ff] dark:[color-scheme:dark]">
      <div>
        <div className="mb-2 text-[12px] font-bold uppercase tracking-wide text-[#fb923c]">
          Vantio Platform
        </div>
        <h2 className="text-[22px] font-bold">Organisationen</h2>
        <p className="mt-2 text-[12px] text-[#64748b] dark:text-[#6b7a9a]">
          Mandantenübersicht (Plattform-Admin).
        </p>
      </div>

      {error && (
        <div className="rounded-[10px] border border-red-500/20 bg-red-500/10 px-4 py-3 text-[14px] text-[#f87171]">
          {error}
        </div>
      )}

      <div className="rounded-[14px] border border-black/10 bg-white p-5 dark:border-white/[0.07] dark:bg-[#141824]">
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "16px",
            alignItems: "flex-end",
            justifyContent: "space-between",
          }}
        >
          <h3 className="text-[16px] font-bold text-[#0f172a] dark:text-[#eef2ff]">Alle Organisationen</h3>
          <button
            type="button"
            onClick={openCreate}
            className="h-[44px] cursor-pointer rounded-[8px] border-none bg-gradient-to-r from-[#5b8cff] to-[#7c5cfc] px-[18px] text-[14px] font-semibold text-white hover:opacity-95"
          >
            Neue Organisation
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-[14px] border border-black/10 bg-white p-5 dark:border-white/[0.07] dark:bg-[#141824]">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-[16px] font-bold text-[#0f172a] dark:text-[#eef2ff]">Übersicht</h3>
          <div className="text-[13px] text-[#64748b] dark:text-[#6b7a9a]">{items.length} Einträge</div>
        </div>

        {items.length === 0 ? (
          <p className="text-[#64748b] dark:text-[#6b7a9a]">Keine Organisationen.</p>
        ) : (
          <table className="w-full border-collapse text-[14px]">
            <thead>
              <tr className="border-b border-black/10 bg-slate-100 text-left text-[9px] font-bold uppercase tracking-[0.8px] text-[#64748b] dark:border-white/[0.05] dark:bg-[#111520] dark:text-[#6b7a9a]">
                <th className="px-3 py-3">Name</th>
                <th className="px-3 py-3">Slug</th>
                <th className="px-3 py-3">Erstellt</th>
                <th className="px-3 py-3 text-right">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr
                  key={row.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/platform/organizations/${encodeURIComponent(row.id)}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      navigate(`/platform/organizations/${encodeURIComponent(row.id)}`);
                    }
                  }}
                  className="cursor-pointer border-b border-black/5 transition-colors duration-150 hover:bg-black/[0.07] dark:border-white/[0.04] dark:hover:bg-white/[0.08]"
                >
                  <td className="px-3 py-3 font-medium text-[#0f172a] dark:text-[#eef2ff]">
                    {row.name || "—"}
                  </td>
                  <td className="px-3 py-3 text-[#64748b] dark:text-[#94a3b8]">
                    {row.slug != null && row.slug !== "" ? row.slug : "—"}
                  </td>
                  <td className="px-3 py-3 text-[#64748b] dark:text-[#94a3b8]">
                    {formatPlatformDateTime(row.created_at)}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <button
                      type="button"
                      className="inline-flex h-8 cursor-pointer items-center justify-center rounded-[8px] border border-black/10 bg-white px-3 text-[12px] font-semibold text-[#0f172a] transition-colors hover:bg-black/[0.05] dark:border-white/[0.12] dark:bg-[#111520] dark:text-[#eef2ff] dark:hover:bg-white/[0.06]"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/platform/organizations/${encodeURIComponent(row.id)}`);
                      }}
                    >
                      Öffnen
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {formOpen && (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 p-4"
          onClick={() => !saving && setFormOpen(false)}
        >
          <div
            className="w-full max-w-[440px] rounded-[14px] border border-black/10 bg-white p-6 [color-scheme:light] dark:border-white/[0.07] dark:bg-[#141824] dark:[color-scheme:dark]"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-4 text-[18px] font-bold text-[#0f172a] dark:text-[#eef2ff]">
              Neue Organisation
            </h3>
            <form onSubmit={handleSubmit} className="grid gap-3.5">
              <div>
                <label className="mb-1.5 block text-[10px] text-[#64748b] dark:text-[#6b7a9a]">
                  Organisationsname *
                </label>
                <input
                  type="text"
                  value={form.organization_name}
                  onChange={(e) => setForm((f) => ({ ...f, organization_name: e.target.value }))}
                  required
                  className={inputClass}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[10px] text-[#64748b] dark:text-[#6b7a9a]">
                  Slug (optional)
                </label>
                <input
                  type="text"
                  value={form.organization_slug}
                  onChange={(e) => setForm((f) => ({ ...f, organization_slug: e.target.value }))}
                  className={inputClass}
                  placeholder="z. B. acme-corp"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[10px] text-[#64748b] dark:text-[#6b7a9a]">
                  Admin-E-Mail *
                </label>
                <input
                  type="email"
                  autoComplete="off"
                  value={form.admin_email}
                  onChange={(e) => setForm((f) => ({ ...f, admin_email: e.target.value }))}
                  required
                  className={inputClass}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[10px] text-[#64748b] dark:text-[#6b7a9a]">
                  Admin-Passwort *
                </label>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={form.admin_password}
                  onChange={(e) => setForm((f) => ({ ...f, admin_password: e.target.value }))}
                  required
                  className={inputClass}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[10px] text-[#64748b] dark:text-[#6b7a9a]">
                  Passwort bestätigen
                </label>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={form.admin_password_confirm}
                  onChange={(e) => setForm((f) => ({ ...f, admin_password_confirm: e.target.value }))}
                  required
                  className={inputClass}
                />
              </div>
              <div className="mt-2 flex gap-2.5">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 cursor-pointer rounded-[8px] border-none bg-gradient-to-r from-[#5b8cff] to-[#7c5cfc] py-3 font-semibold text-white hover:opacity-95 disabled:cursor-wait disabled:opacity-70"
                >
                  {saving ? "Speichern…" : "Erstellen"}
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setFormOpen(false)}
                  className="rounded-[8px] border border-black/10 bg-transparent px-4 py-3 font-semibold text-[#64748b] hover:bg-black/[0.03] dark:border-white/[0.1] dark:text-[#8090b0] dark:hover:bg-white/[0.04]"
                >
                  Abbrechen
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default PlatformOrganizationsPage;
