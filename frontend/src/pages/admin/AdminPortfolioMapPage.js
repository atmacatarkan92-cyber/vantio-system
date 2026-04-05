import React from "react";
import PortfolioMapSection from "../../components/admin/PortfolioMapSection";

/**
 * Dedicated admin page for the global portfolio map (full filters, clustering, popups).
 */
export default function AdminPortfolioMapPage() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0d0f14]">
      <header className="flex h-14 shrink-0 items-center border-b border-slate-200 bg-white px-4 sm:px-6 dark:border-[#1e2130] dark:bg-[#11131a]">
        <h1 className="m-0 text-base font-semibold text-slate-900 dark:text-[#c5cbe0]">Portfolio-Karte</h1>
      </header>
      <div className="mx-auto max-w-[min(1400px,100%)] px-4 pb-8 pt-5 sm:px-6">
        <p className="mb-6 max-w-[720px] text-sm leading-relaxed text-slate-600 dark:text-[#6b7a9a]">
          Zentrale Übersicht über Standorte, Status und Portfolio-Verteilung.
        </p>
        <PortfolioMapSection hideSectionHeader />
      </div>
    </div>
  );
}
