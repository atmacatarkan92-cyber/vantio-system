import React from "react";
import PortfolioMapSection from "../../components/admin/PortfolioMapSection";

/**
 * Dedicated admin page for the global portfolio map (full filters, clustering, popups).
 */
export default function AdminPortfolioMapPage() {
  return (
    <div className="mx-auto max-w-[min(1400px,100%)] pb-8">
      <header className="mb-6">
        <h1 className="m-0 text-[22px] font-bold text-[#0f172a] dark:text-[#eef2ff]">Portfolio-Karte</h1>
        <p className="mt-2 max-w-[720px] text-sm leading-relaxed text-[#64748b] dark:text-[#6b7a9a]">
          Zentrale Übersicht über Standorte, Status und Portfolio-Verteilung.
        </p>
      </header>
      <PortfolioMapSection hideSectionHeader />
    </div>
  );
}
