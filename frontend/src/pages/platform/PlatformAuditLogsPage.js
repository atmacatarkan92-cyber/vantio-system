import React, { useEffect, useState } from "react";
import { fetchPlatformAuditLogs } from "../../api/adminData";
import { getDeviceLabelFromUserAgent } from "../../utils/userAgentLabel";

const METADATA_MAX_LEN = 240;

function formatMetadata(meta) {
  if (meta == null) return "—";
  try {
    const s = JSON.stringify(meta);
    return s.length > METADATA_MAX_LEN ? `${s.slice(0, METADATA_MAX_LEN)}…` : s;
  } catch {
    return "—";
  }
}

/** List column: readable device + IP for login; otherwise JSON summary. */
function formatMetadataListCell(row) {
  const meta = row.metadata;
  if (row.action === "login" && meta && typeof meta === "object") {
    const label = getDeviceLabelFromUserAgent(meta.user_agent);
    const ip = meta.ip_address != null && meta.ip_address !== "" ? String(meta.ip_address) : null;
    const parts = [label];
    if (ip) parts.push(ip);
    return parts.join(" · ");
  }
  return formatMetadata(meta);
}

function formatJsonField(value) {
  if (value == null) return "—";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "—";
  }
}

/**
 * Platform admin: last 50 audit log rows (cross-tenant).
 */
function PlatformAuditLogsPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedLog, setSelectedLog] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    fetchPlatformAuditLogs()
      .then((data) => {
        if (!cancelled) setRows(Array.isArray(data) ? data : []);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || "Laden fehlgeschlagen.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const detailTextClass = "mt-1 text-[13px] text-[#0f172a] dark:text-[#e2e8f0]";
  const detailJsonClass =
    "mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-[8px] border border-black/[0.08] bg-[#f8fafc] p-2 font-mono text-[11px] leading-relaxed text-[#0f172a] dark:border-white/[0.08] dark:bg-[#0c1018] dark:text-[#e2e8f0]";

  return (
    <div className="mx-auto max-w-6xl bg-[#f8fafc] px-4 py-6 text-[#0f172a] [color-scheme:light] dark:bg-[#07090f] dark:text-[#eef2ff] dark:[color-scheme:dark]">
      {selectedLog ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="audit-log-detail-title"
          onClick={() => setSelectedLog(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[12px] border border-black/10 bg-white p-4 shadow-lg dark:border-white/[0.12] dark:bg-[#141824]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <h2 id="audit-log-detail-title" className="text-[16px] font-bold">
                Eintrag
              </h2>
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="shrink-0 rounded-[8px] border border-black/10 bg-[#f8fafc] px-3 py-1.5 text-[12px] font-semibold text-[#0f172a] hover:bg-black/[0.04] dark:border-white/[0.12] dark:bg-[#0c1018] dark:text-[#eef2ff] dark:hover:bg-white/[0.06]"
              >
                Schliessen
              </button>
            </div>
            <dl className="space-y-3 text-[13px]">
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-[#64748b] dark:text-[#94a3b8]">
                  Zeit
                </dt>
                <dd className={detailTextClass}>
                  {selectedLog.created_at
                    ? new Date(selectedLog.created_at).toLocaleString()
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-[#64748b] dark:text-[#94a3b8]">
                  Akteur
                </dt>
                <dd className={detailTextClass}>
                  {selectedLog.actor_email || selectedLog.actor_user_id || "—"}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-[#64748b] dark:text-[#94a3b8]">
                  Aktion
                </dt>
                <dd className={detailTextClass}>{selectedLog.action || "—"}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-[#64748b] dark:text-[#94a3b8]">
                  Organisation
                </dt>
                <dd className={detailTextClass}>
                  {selectedLog.organization_name || selectedLog.organization_id || "—"}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-[#64748b] dark:text-[#94a3b8]">
                  entity_type
                </dt>
                <dd className={detailTextClass}>
                  {selectedLog.target_type != null && selectedLog.target_type !== ""
                    ? selectedLog.target_type
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-[#64748b] dark:text-[#94a3b8]">
                  entity_id
                </dt>
                <dd className={detailTextClass}>
                  {selectedLog.target_id != null && selectedLog.target_id !== ""
                    ? selectedLog.target_id
                    : "—"}
                </dd>
              </div>
              {selectedLog.action === "login" &&
              selectedLog.metadata &&
              typeof selectedLog.metadata === "object" ? (
                <>
                  <div>
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-[#64748b] dark:text-[#94a3b8]">
                      Gerät
                    </dt>
                    <dd className={detailTextClass}>
                      {getDeviceLabelFromUserAgent(selectedLog.metadata.user_agent)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-[#64748b] dark:text-[#94a3b8]">
                      User-Agent roh
                    </dt>
                    <dd className={detailJsonClass}>
                      {selectedLog.metadata.user_agent != null &&
                      String(selectedLog.metadata.user_agent) !== ""
                        ? String(selectedLog.metadata.user_agent)
                        : "—"}
                    </dd>
                  </div>
                </>
              ) : null}
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-[#64748b] dark:text-[#94a3b8]">
                  metadata
                </dt>
                <dd className={detailJsonClass}>{formatJsonField(selectedLog.metadata)}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-[#64748b] dark:text-[#94a3b8]">
                  old_values
                </dt>
                <dd className={detailJsonClass}>{formatJsonField(selectedLog.old_values)}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-[#64748b] dark:text-[#94a3b8]">
                  new_values
                </dt>
                <dd className={detailJsonClass}>{formatJsonField(selectedLog.new_values)}</dd>
              </div>
            </dl>
          </div>
        </div>
      ) : null}

      <div className="mb-6">
        <div className="mb-2 text-[12px] font-bold uppercase tracking-wide text-[#fb923c]">
          Vantio Platform
        </div>
        <h1 className="text-[22px] font-bold tracking-[-0.02em]">Audit-Protokoll</h1>
        <p className="mt-2 text-[13px] text-[#64748b] dark:text-[#6b7a9a]">
          Letzte 50 Einträge (plattformweit).
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-[10px] border border-red-500/20 bg-red-500/10 px-4 py-3 text-[14px] text-[#f87171]">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-[13px] text-[#64748b] dark:text-[#6b7a9a]">Lade …</p>
      ) : (
        <div className="overflow-x-auto rounded-[12px] border border-black/10 bg-white dark:border-white/[0.07] dark:bg-[#141824]">
          <table className="w-full min-w-[720px] border-collapse text-left text-[12px]">
            <thead>
              <tr className="border-b border-black/10 dark:border-white/[0.08]">
                <th className="px-3 py-2.5 font-semibold text-[#64748b] dark:text-[#94a3b8]">
                  Zeit
                </th>
                <th className="px-3 py-2.5 font-semibold text-[#64748b] dark:text-[#94a3b8]">
                  Akteur
                </th>
                <th className="px-3 py-2.5 font-semibold text-[#64748b] dark:text-[#94a3b8]">
                  Aktion
                </th>
                <th className="px-3 py-2.5 font-semibold text-[#64748b] dark:text-[#94a3b8]">
                  Organisation
                </th>
                <th className="px-3 py-2.5 font-semibold text-[#64748b] dark:text-[#94a3b8]">
                  Metadaten
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-[#64748b] dark:text-[#6b7a9a]">
                    Keine Einträge.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr
                    key={row.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedLog(row)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelectedLog(row);
                      }
                    }}
                    className="cursor-pointer border-b border-black/[0.06] hover:bg-black/[0.03] dark:border-white/[0.05] dark:hover:bg-white/[0.04]"
                  >
                    <td className="whitespace-nowrap px-3 py-2 align-top text-[11px] text-[#64748b] dark:text-[#94a3b8]">
                      {row.created_at ? new Date(row.created_at).toLocaleString() : "—"}
                    </td>
                    <td className="max-w-[180px] px-3 py-2 align-top break-all">
                      {row.actor_email || row.actor_user_id || "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 align-top font-medium">{row.action}</td>
                    <td className="max-w-[200px] px-3 py-2 align-top break-all">
                      {row.organization_name || row.organization_id || "—"}
                    </td>
                    <td className="max-w-[240px] px-3 py-2 align-top text-[11px] text-[#64748b] dark:text-[#94a3b8]">
                      {formatMetadataListCell(row)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default PlatformAuditLogsPage;
