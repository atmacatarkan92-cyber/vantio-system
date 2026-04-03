import React from "react";
import { Link } from "react-router-dom";

/**
 * Platform landing / control-plane home. No KPIs or analytics — navigation and context only.
 */
function PlatformDashboardPage() {
  return (
    <div className="mx-auto grid max-w-5xl gap-8 bg-[#f8fafc] px-4 py-6 text-[#0f172a] [color-scheme:light] dark:bg-[#07090f] dark:text-[#eef2ff] dark:[color-scheme:dark]">
      <div>
        <div className="mb-2 text-[12px] font-bold uppercase tracking-wide text-[#fb923c]">
          Vantio Platform
        </div>
        <h1 className="text-[26px] font-bold tracking-[-0.02em]">Vantio Platform</h1>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-[#64748b] dark:text-[#6b7a9a]">
          Zentrale Steuerung der Organisationen und Plattformfunktionen.
        </p>
      </div>

      <div
        className="rounded-[12px] border border-blue-500/15 bg-blue-500/[0.06] px-4 py-3 text-[13px] text-[#0f172a] dark:border-blue-400/20 dark:bg-blue-500/[0.08] dark:text-[#c7d7ff]"
        role="status"
      >
        Platform Control Plane aktiv
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col rounded-[14px] border border-black/10 bg-white p-6 dark:border-white/[0.07] dark:bg-[#141824]">
          <h2 className="text-[16px] font-bold text-[#0f172a] dark:text-[#eef2ff]">
            Organisationen verwalten
          </h2>
          <p className="mt-2 flex-1 text-[13px] leading-relaxed text-[#64748b] dark:text-[#6b7a9a]">
            Mandanten anlegen und die Liste aller Organisationen einsehen.
          </p>
          <Link
            to="/platform/organizations"
            className="mt-5 inline-flex w-fit items-center justify-center rounded-[8px] border-none bg-gradient-to-r from-[#5b8cff] to-[#7c5cfc] px-4 py-2.5 text-[13px] font-semibold text-white no-underline hover:opacity-95"
          >
            Zu den Organisationen
          </Link>
        </div>

        <div className="flex flex-col rounded-[14px] border border-black/10 bg-white p-6 dark:border-white/[0.07] dark:bg-[#141824]">
          <h2 className="text-[16px] font-bold text-[#0f172a] dark:text-[#eef2ff]">
            Plattformbereich
          </h2>
          <p className="mt-2 text-[13px] leading-relaxed text-[#64748b] dark:text-[#6b7a9a]">
            Dieser Bereich ist ausschliesslich für Plattform-Administratoren bestimmt.
          </p>
        </div>
      </div>
    </div>
  );
}

export default PlatformDashboardPage;
