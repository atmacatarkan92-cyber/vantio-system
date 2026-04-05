/**
 * Global portfolio map: all unit types, property coordinates only, client-side filters.
 */
import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import L from "leaflet";
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Popup,
  useMap,
} from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-markercluster";
import "leaflet/dist/leaflet.css";
import "react-leaflet-markercluster/styles";

import { fetchAdminPortfolioMap, sanitizeClientErrorMessage } from "../../api/adminData";
import { normalizeUnitTypeLabel } from "../../utils/unitDisplayId";

/** Portfolio map filter query keys (namespaced; avoids clashes on Unternehmensübersicht). */
const PM_QS_TYPE = "pm_type";
const PM_QS_STATUS = "pm_status";
const PM_QS_CITY = "pm_city";

const PM_VALID_TYPES = new Set(["all", "apartments", "coliving"]);
const PM_VALID_STATUSES = new Set([
  "all",
  "occupied",
  "vacant",
  "notice",
  "landlord_ended",
]);

/**
 * Cluster list sort: operational priority (backend map_status today: vacant | notice | occupied | landlord_ended).
 * "reserved" ranked for forward compatibility if ever added to map payloads.
 */
const PORTFOLIO_MAP_STATUS_SORT_RANK = {
  vacant: 0,
  notice: 1,
  reserved: 2,
  occupied: 3,
  landlord_ended: 4,
};

function portfolioMapClusterSortUnits(a, b) {
  const ra = PORTFOLIO_MAP_STATUS_SORT_RANK[a.map_status] ?? 99;
  const rb = PORTFOLIO_MAP_STATUS_SORT_RANK[b.map_status] ?? 99;
  if (ra !== rb) return ra - rb;
  const sa = String(a.short_unit_id || a.unit_id || "");
  const sb = String(b.short_unit_id || b.unit_id || "");
  return sa.localeCompare(sb, "de-CH");
}

function SectionCard({ title, subtitle, children, rightSlot = null }) {
  return (
    <div className="rounded-[14px] border border-black/10 bg-white p-5 dark:border-white/[0.07] dark:bg-[#141824]">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-[#0f172a] dark:text-[#eef2ff]">{title}</h3>
          {subtitle ? (
            <p className="mt-1 text-sm text-[#64748b] dark:text-[#6b7a9a]">{subtitle}</p>
          ) : null}
        </div>
        {rightSlot}
      </div>
      {children}
    </div>
  );
}

function portfolioMapCircleStyle(mapStatus) {
  switch (mapStatus) {
    case "occupied":
      return { color: "#166534", fillColor: "#22c55e" };
    case "vacant":
      return { color: "#b91c1c", fillColor: "#ef4444" };
    case "notice":
      return { color: "#a16207", fillColor: "#eab308" };
    case "landlord_ended":
      return { color: "#475569", fillColor: "#94a3b8" };
    default:
      return { color: "#64748b", fillColor: "#cbd5e1" };
  }
}

function portfolioMapStatusEmoji(mapStatus) {
  switch (mapStatus) {
    case "occupied":
      return "🟢";
    case "vacant":
      return "🔴";
    case "notice":
      return "🟡";
    case "landlord_ended":
      return "⚫";
    default:
      return "•";
  }
}

function portfolioMapTypeLabel(apiType) {
  const t = String(apiType || "").trim();
  if (t === "Business Apartment") return "Business Apartment";
  if (t === "Apartment") return "Apartment";
  const n = normalizeUnitTypeLabel(t);
  if (n === "Co-Living") return "Co-Living";
  return t || "—";
}

function isApartmentFamilyType(apiType) {
  const t = String(apiType || "").trim();
  return t === "Apartment" || t === "Business Apartment";
}

function isCoLivingType(apiType) {
  return normalizeUnitTypeLabel(apiType) === "Co-Living";
}

function portfolioMapCoLivingOccSummary(it) {
  if (!isCoLivingType(it.type)) return null;
  const rooms = Number(it.rooms);
  if (!(rooms > 0)) return null;
  const occ = Number(it.occupied_rooms ?? 0);
  return `${occ} / ${rooms} belegt`;
}

function portfolioMapLocationHint(it) {
  const a = String(it.address || "").trim();
  if (a) return a;
  const city = String(it.city || "").trim();
  const postal = String(it.postal_code || "").trim();
  const pc = [postal, city].filter(Boolean).join(" ");
  return pc || "";
}

function portfolioMapClusterSecondaryLine(it) {
  const occ = portfolioMapCoLivingOccSummary(it);
  if (occ) return occ;
  return String(it.map_status_label || "").trim() || "—";
}

function portfolioMapClusterIconCreate(cluster) {
  const count = cluster.getChildCount();
  return L.divIcon({
    html: `<div class="portfolio-map-cb"><span>${count}</span></div>`,
    className: "portfolio-map-cm",
    iconSize: L.point(38, 38),
  });
}

function PortfolioMapUnitTypeBadge({ apiType }) {
  const label = portfolioMapTypeLabel(apiType);
  return (
    <span className="inline-flex max-w-full shrink-0 items-center rounded-md border border-slate-200/90 bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-slate-700 dark:border-white/[0.12] dark:bg-white/[0.08] dark:text-[#c8d4f0]">
      {label}
    </span>
  );
}

function PortfolioClusterListContent({ units, onOpenUnit }) {
  return (
    <div className="max-h-[min(280px,60vh)] overflow-y-auto pr-0.5 text-[13px] leading-snug text-[#0f172a] dark:text-[#eef2ff]">
      <p className="mb-2 text-[12px] font-semibold text-slate-700 dark:text-[#c8d4f0]">
        {units.length} Einheiten an diesem Standort
      </p>
      <ul className="space-y-2">
        {units.map((it) => {
          const loc = portfolioMapLocationHint(it);
          const shortId = String(it.short_unit_id || it.unit_id || "").trim() || "—";
          return (
            <li
              key={it.unit_id}
              data-portfolio-map-unit={it.unit_id}
              className="rounded-lg border border-black/[0.08] bg-white/70 p-2 transition-colors hover:border-sky-500/35 hover:bg-slate-50 hover:shadow-sm dark:border-white/[0.08] dark:bg-[#141824]/90 dark:hover:border-sky-400/30 dark:hover:bg-white/[0.07]"
            >
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-semibold">{shortId}</span>
                <span className="text-slate-400 dark:text-[#5c6b88]" aria-hidden>
                  ·
                </span>
                <span className="text-[12px] font-medium text-slate-800 dark:text-[#dbe4fb]">
                  {portfolioMapClusterSecondaryLine(it)}
                </span>
                <PortfolioMapUnitTypeBadge apiType={it.type} />
              </div>
              {loc ? (
                <p className="mt-1 text-[11px] text-slate-500 dark:text-[#8b9ab8]">{loc}</p>
              ) : null}
              <button
                type="button"
                className="mt-1.5 text-left text-[12px] font-medium text-sky-600 underline decoration-sky-600/40 underline-offset-2 hover:text-sky-700 dark:text-sky-400 dark:hover:text-sky-300"
                onClick={() => onOpenUnit(it.unit_id)}
              >
                Einheit öffnen
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function PortfolioMapClusteredMarkers({
  plottedItems,
  activeUnitId,
  onUnitMarkerClick,
  onSinglePopupClose,
}) {
  const navigate = useNavigate();
  const [clusterListHoverUnitId, setClusterListHoverUnitId] = useState(null);

  return (
    <MarkerClusterGroup
      showCoverageOnHover={false}
      zoomToBoundsOnClick={false}
      spiderfyOnMaxZoom
      maxClusterRadius={76}
      iconCreateFunction={portfolioMapClusterIconCreate}
      onClick={(e) => {
        const cluster = e.layer;
        const markers = cluster.getAllChildMarkers();
        const units = markers.map((m) => m?.options?.portfolioUnit).filter(Boolean);
        if (units.length === 0) return;

        const sorted = [...units].sort(portfolioMapClusterSortUnits);

        const container = document.createElement("div");
        cluster.bindPopup(container, {
          maxWidth: 320,
          minWidth: 260,
          className: "portfolio-map-cluster-popup",
          autoPanPadding: [12, 12],
        });

        const onContainerMouseOver = (ev) => {
          const el = ev.target.closest?.("[data-portfolio-map-unit]");
          if (el?.dataset?.portfolioMapUnit) {
            setClusterListHoverUnitId(el.dataset.portfolioMapUnit);
          }
        };
        const onContainerMouseLeave = () => setClusterListHoverUnitId(null);

        container.addEventListener("mouseover", onContainerMouseOver);
        container.addEventListener("mouseleave", onContainerMouseLeave);

        const root = createRoot(container);
        root.render(
          <PortfolioClusterListContent
            units={sorted}
            onOpenUnit={(unitId) => {
              cluster.closePopup();
              navigate(`/admin/units/${encodeURIComponent(unitId)}`);
            }}
          />
        );

        cluster.openPopup();
        const popup = cluster.getPopup();
        if (popup) {
          popup.once("remove", () => {
            setClusterListHoverUnitId(null);
            container.removeEventListener("mouseover", onContainerMouseOver);
            container.removeEventListener("mouseleave", onContainerMouseLeave);
            queueMicrotask(() => {
              try {
                root.unmount();
              } catch {
                /* ignore */
              }
            });
          });
        }
      }}
    >
      {plottedItems.map((it) => {
        const style = portfolioMapCircleStyle(it.map_status);
        const isActive = activeUnitId === it.unit_id;
        const isClusterListHover = clusterListHoverUnitId === it.unit_id;
        return (
          <CircleMarker
            key={it.unit_id}
            center={[Number(it.latitude), Number(it.longitude)]}
            radius={isActive ? 13 : isClusterListHover ? 12 : 10}
            pathOptions={{
              ...style,
              fillOpacity: isActive ? 1 : isClusterListHover ? 0.95 : 0.88,
              weight: isActive ? 3 : isClusterListHover ? 3 : 2,
            }}
            portfolioUnit={it}
            eventHandlers={{
              click: () => onUnitMarkerClick(it.unit_id),
            }}
          >
            <Popup
              eventHandlers={{
                remove: () => onSinglePopupClose(),
              }}
            >
              <PortfolioMapPopupBody it={it} />
            </Popup>
          </CircleMarker>
        );
      })}
    </MarkerClusterGroup>
  );
}

function PortfolioMapFitBounds({ items }) {
  const map = useMap();
  useEffect(() => {
    if (!items?.length) return;
    if (items.length === 1) {
      const it = items[0];
      map.setView([Number(it.latitude), Number(it.longitude)], 14, {
        animate: false,
      });
      return;
    }
    const b = L.latLngBounds(
      items.map((it) => [Number(it.latitude), Number(it.longitude)])
    );
    map.fitBounds(b, { padding: [36, 36], maxZoom: 15, animate: false });
  }, [map, items]);
  return null;
}

function PortfolioMapPopupBody({ it }) {
  const shortId = String(it.short_unit_id || it.unit_id || "").trim() || "—";
  const city = String(it.city || "").trim();
  const line1 =
    shortId !== "—" && city
      ? `${shortId} · ${city}`
      : shortId !== "—"
        ? shortId
        : city || "—";

  const coLivingExtra = portfolioMapCoLivingOccSummary(it);

  const addressLine = String(it.address || "").trim();
  const postal = String(it.postal_code || "").trim();
  const postalCity = [postal, city].filter(Boolean).join(" ");

  return (
    <div className="min-w-[200px] max-w-[260px] space-y-1.5 text-[13px] leading-snug text-[#0f172a] dark:text-[#eef2ff]">
      <p className="font-semibold text-slate-900 dark:text-[#f1f5ff]">{line1}</p>
      <div className="flex flex-wrap items-center gap-1.5">
        <PortfolioMapUnitTypeBadge apiType={it.type} />
      </div>
      {coLivingExtra ? (
        <p className="text-[12px] text-slate-600 dark:text-[#9aaccc]">{coLivingExtra}</p>
      ) : null}
      <div className="flex items-center gap-1.5 pt-0.5">
        <span className="text-[15px] leading-none" aria-hidden>
          {portfolioMapStatusEmoji(it.map_status)}
        </span>
        <span className="font-medium text-slate-800 dark:text-[#dbe4fb]">{it.map_status_label}</span>
      </div>
      {addressLine ? (
        <p className="pt-0.5 text-slate-600 dark:text-[#b6c4e3]">{addressLine}</p>
      ) : null}
      {postalCity ? (
        <p className="text-[12px] text-slate-500 dark:text-[#8b9ab8]">{postalCity}</p>
      ) : null}
      <Link
        to={`/admin/units/${encodeURIComponent(it.unit_id)}`}
        className="inline-block pt-1 text-sky-600 underline decoration-sky-600/40 underline-offset-2 hover:text-sky-700 dark:text-sky-400 dark:hover:text-sky-300"
      >
        Einheit öffnen
      </Link>
    </div>
  );
}

function filterMapItems(items, filterType, filterStatus, filterCity) {
  if (!Array.isArray(items)) return [];
  return items.filter((it) => {
    if (!it) return false;
    const t = String(it.type || "").trim();
    if (filterType === "apartments") {
      if (!isApartmentFamilyType(t)) return false;
    } else if (filterType === "coliving") {
      if (!isCoLivingType(t)) return false;
    }
    if (filterStatus !== "all" && it.map_status !== filterStatus) {
      return false;
    }
    if (filterCity !== "all") {
      const c = String(it.city || "").trim();
      if (c !== filterCity) return false;
    }
    return true;
  });
}

export default function PortfolioMapSection() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeUnitId, setActiveUnitId] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    fetchAdminPortfolioMap()
      .then((d) => {
        setData(d);
        setError("");
      })
      .catch((e) => {
        setData(null);
        setError(
          sanitizeClientErrorMessage(
            e?.message,
            "Portfolio-Karte konnte nicht geladen werden."
          )
        );
      })
      .finally(() => setLoading(false));
  }, []);

  const items = data?.items;

  const cityOptions = useMemo(() => {
    if (!Array.isArray(items)) return [];
    const s = new Set();
    for (const it of items) {
      const c = String(it?.city || "").trim();
      if (c) s.add(c);
    }
    return [...s].sort((a, b) => a.localeCompare(b, "de-CH"));
  }, [items]);

  const filterType = useMemo(() => {
    const v = searchParams.get(PM_QS_TYPE);
    return PM_VALID_TYPES.has(v) ? v : "all";
  }, [searchParams]);

  const filterStatus = useMemo(() => {
    const v = searchParams.get(PM_QS_STATUS);
    return PM_VALID_STATUSES.has(v) ? v : "all";
  }, [searchParams]);

  const filterCityParam = searchParams.get(PM_QS_CITY);

  const filterCity = useMemo(() => {
    if (!filterCityParam || filterCityParam === "all") return "all";
    if (cityOptions.length === 0) return filterCityParam;
    return cityOptions.includes(filterCityParam) ? filterCityParam : "all";
  }, [filterCityParam, cityOptions]);

  useEffect(() => {
    if (!filterCityParam || filterCityParam === "all") return;
    if (cityOptions.length === 0) return;
    if (!cityOptions.includes(filterCityParam)) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete(PM_QS_CITY);
          return next;
        },
        { replace: true }
      );
    }
  }, [filterCityParam, cityOptions, setSearchParams]);

  const filteredItems = useMemo(
    () => filterMapItems(items, filterType, filterStatus, filterCity),
    [items, filterType, filterStatus, filterCity]
  );

  const plottedItems = useMemo(() => {
    return filteredItems.filter(
      (it) =>
        it &&
        it.has_coordinates &&
        it.latitude != null &&
        it.longitude != null
    );
  }, [filteredItems]);

  const hasActiveFilters =
    filterType !== "all" || filterStatus !== "all" || filterCity !== "all";

  const defaultMapCenter = [46.8, 8.2];
  const defaultMapZoom = 7;

  if (loading) {
    return (
      <SectionCard
        title="Portfolio-Karte"
        subtitle="Globale Übersicht aller Einheiten · Standorte aus Liegenschaftskoordinaten"
      >
        <p className="py-8 text-sm text-[#64748b] dark:text-[#6b7a9a]">Karte wird geladen…</p>
      </SectionCard>
    );
  }

  if (error) {
    return (
      <SectionCard
        title="Portfolio-Karte"
        subtitle="Globale Übersicht aller Einheiten · Standorte aus Liegenschaftskoordinaten"
      >
        <p className="py-4 text-sm text-[#f87171]">{error}</p>
      </SectionCard>
    );
  }

  const summary = data?.summary || {};
  const total = Number(summary.total_units) || 0;
  const plotted = Number(summary.plotted_units) || 0;
  const missing = Number(summary.missing_coordinates) || 0;

  return (
    <SectionCard
      title="Portfolio-Karte"
      subtitle="Alle Einheitstypen · Statusfarben · nur Marker mit Koordinaten an der Liegenschaft"
    >
      <p className="mb-4 text-sm font-medium text-[#0f172a] dark:text-[#eef2ff]">
        {total} Einheiten · {plotted} auf Karte · {missing} ohne Koordinaten
      </p>

      {hasActiveFilters && (
        <p className="mb-3 text-xs text-[#64748b] dark:text-[#6b7a9a]">
          Nach Filter: {filteredItems.length} Einheiten · {plottedItems.length} Marker
        </p>
      )}

      <div className="mb-4 flex flex-wrap gap-3">
        <div className="min-w-[140px] flex-1">
          <label className="mb-1 block text-[11px] font-medium text-[#64748b] dark:text-[#6b7a9a]">
            Typ
          </label>
          <select
            value={filterType}
            onChange={(e) => {
              const v = e.target.value;
              setSearchParams(
                (prev) => {
                  const next = new URLSearchParams(prev);
                  if (v === "all") next.delete(PM_QS_TYPE);
                  else next.set(PM_QS_TYPE, v);
                  return next;
                },
                { replace: true }
              );
            }}
            className="w-full rounded-lg border border-black/10 bg-slate-100 px-3 py-2 text-sm text-[#0f172a] outline-none dark:border-white/[0.08] dark:bg-[#111520] dark:text-[#eef2ff]"
          >
            <option value="all">Alle</option>
            <option value="apartments">Apartments</option>
            <option value="coliving">Co-Living</option>
          </select>
        </div>
        <div className="min-w-[140px] flex-1">
          <label className="mb-1 block text-[11px] font-medium text-[#64748b] dark:text-[#6b7a9a]">
            Status
          </label>
          <select
            value={filterStatus}
            onChange={(e) => {
              const v = e.target.value;
              setSearchParams(
                (prev) => {
                  const next = new URLSearchParams(prev);
                  if (v === "all") next.delete(PM_QS_STATUS);
                  else next.set(PM_QS_STATUS, v);
                  return next;
                },
                { replace: true }
              );
            }}
            className="w-full rounded-lg border border-black/10 bg-slate-100 px-3 py-2 text-sm text-[#0f172a] outline-none dark:border-white/[0.08] dark:bg-[#111520] dark:text-[#eef2ff]"
          >
            <option value="all">Alle</option>
            <option value="occupied">Belegt</option>
            <option value="vacant">Leerstand</option>
            <option value="notice">Gekündigt</option>
            <option value="landlord_ended">Vertrag beendet</option>
          </select>
        </div>
        <div className="min-w-[160px] flex-1">
          <label className="mb-1 block text-[11px] font-medium text-[#64748b] dark:text-[#6b7a9a]">
            Ort
          </label>
          <select
            value={filterCity}
            onChange={(e) => {
              const v = e.target.value;
              setSearchParams(
                (prev) => {
                  const next = new URLSearchParams(prev);
                  if (v === "all") next.delete(PM_QS_CITY);
                  else next.set(PM_QS_CITY, v);
                  return next;
                },
                { replace: true }
              );
            }}
            className="w-full rounded-lg border border-black/10 bg-slate-100 px-3 py-2 text-sm text-[#0f172a] outline-none dark:border-white/[0.08] dark:bg-[#111520] dark:text-[#eef2ff]"
          >
            <option value="all">Alle</option>
            {cityOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      {total === 0 ? (
        <p className="rounded-[10px] border border-black/10 bg-slate-100 px-4 py-6 text-sm text-[#64748b] dark:border-white/[0.08] dark:bg-[#111520] dark:text-[#6b7a9a]">
          Keine Einheiten vorhanden.
        </p>
      ) : plotted === 0 ? (
        <p className="rounded-[10px] border border-black/10 bg-slate-100 px-4 py-6 text-sm text-[#64748b] dark:border-white/[0.08] dark:bg-[#111520] dark:text-[#6b7a9a]">
          Für diese Einheiten sind noch keine Koordinaten vorhanden. Bitte pflegen Sie die
          Koordinaten an der zugehörigen Liegenschaft (Admin → Liegenschaften).
        </p>
      ) : plottedItems.length === 0 && hasActiveFilters ? (
        <p className="rounded-[10px] border border-black/10 bg-slate-100 px-4 py-6 text-sm text-[#64748b] dark:border-white/[0.08] dark:bg-[#111520] dark:text-[#6b7a9a]">
          Keine Marker passen zu den aktuellen Filtern.
        </p>
      ) : (
        <>
          {missing > 0 && !hasActiveFilters ? (
            <p className="mb-3 text-sm text-[#64748b] dark:text-[#6b7a9a]">
              {missing} Einheiten haben noch keine Koordinaten und werden derzeit nicht auf der
              Karte angezeigt.
            </p>
          ) : null}
          <div
            className="overflow-hidden rounded-[12px] border border-black/10 dark:border-white/[0.08] [&_.leaflet-container]:bg-slate-200 [&_.leaflet-container]:dark:bg-[#0f1219] [&_.leaflet-popup-content-wrapper]:rounded-xl [&_.leaflet-popup-content-wrapper]:border [&_.leaflet-popup-content-wrapper]:border-black/10 [&_.leaflet-popup-content-wrapper]:bg-white dark:[&_.leaflet-popup-content-wrapper]:border-white/[0.08] dark:[&_.leaflet-popup-content-wrapper]:bg-[#1a2030] [&_.leaflet-popup-tip]:bg-white dark:[&_.leaflet-popup-tip]:bg-[#1a2030] dark:[&_.leaflet-popup-tip]:border-white/[0.08] [&_.portfolio-map-cm]:flex [&_.portfolio-map-cm]:items-center [&_.portfolio-map-cm]:justify-center [&_.portfolio-map-cm]:rounded-[19px] [&_.portfolio-map-cm]:border [&_.portfolio-map-cm]:border-slate-400/55 [&_.portfolio-map-cm]:bg-white/95 [&_.portfolio-map-cm]:shadow-sm dark:[&_.portfolio-map-cm]:border-slate-500/55 dark:[&_.portfolio-map-cm]:bg-slate-800/95 [&_.portfolio-map-cb]:flex [&_.portfolio-map-cb]:h-[30px] [&_.portfolio-map-cb]:min-w-[30px] [&_.portfolio-map-cb]:items-center [&_.portfolio-map-cb]:justify-center [&_.portfolio-map-cb]:rounded-[15px] [&_.portfolio-map-cb]:bg-slate-100 [&_.portfolio-map-cb]:px-1.5 [&_.portfolio-map-cb]:text-[12px] [&_.portfolio-map-cb]:font-semibold [&_.portfolio-map-cb]:text-slate-800 dark:[&_.portfolio-map-cb]:bg-slate-900/90 dark:[&_.portfolio-map-cb]:text-[#e8ecff]"
            style={{ height: 380 }}
          >
            <MapContainer
              center={defaultMapCenter}
              zoom={defaultMapZoom}
              style={{ height: "100%", width: "100%" }}
              scrollWheelZoom={false}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <PortfolioMapFitBounds items={plottedItems} />
              <PortfolioMapClusteredMarkers
                plottedItems={plottedItems}
                activeUnitId={activeUnitId}
                onUnitMarkerClick={setActiveUnitId}
                onSinglePopupClose={() => setActiveUnitId(null)}
              />
            </MapContainer>
          </div>
        </>
      )}
    </SectionCard>
  );
}
