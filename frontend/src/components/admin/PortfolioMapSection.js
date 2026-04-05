/**
 * Global portfolio map: all unit types, unit-first / property-fallback coordinates, client-side filters.
 * Renders with Google Maps (@vis.gl/react-google-maps + @googlemaps/markerclusterer).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { MarkerClusterer } from "@googlemaps/markerclusterer";
import {
  APIProvider,
  ColorScheme,
  InfoWindow,
  Map,
  useApiIsLoaded,
  useMap,
} from "@vis.gl/react-google-maps";

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

const DEFAULT_CENTER = { lat: 46.8, lng: 8.2 };
const DEFAULT_ZOOM = 7;

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

/** Marker fill colors (Google circle symbols). */
function portfolioMapMarkerFill(mapStatus) {
  switch (mapStatus) {
    case "occupied":
      return "#22c55e";
    case "vacant":
      return "#ef4444";
    case "notice":
      return "#f59e0b";
    case "landlord_ended":
      return "#6b7280";
    default:
      return "#94a3b8";
  }
}

function SectionCard({ title, subtitle, children, rightSlot = null, hideHeader = false }) {
  return (
    <div className="rounded-[14px] border border-black/10 bg-white p-5 dark:border-white/[0.07] dark:bg-[#141824]">
      {!hideHeader ? (
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-[#0f172a] dark:text-[#eef2ff]">{title}</h3>
            {subtitle ? (
              <p className="mt-1 text-sm text-[#64748b] dark:text-[#6b7a9a]">{subtitle}</p>
            ) : null}
          </div>
          {rightSlot}
        </div>
      ) : null}
      {children}
    </div>
  );
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

function PortfolioMapUnitTypeBadge({ apiType }) {
  const label = portfolioMapTypeLabel(apiType);
  return (
    <span className="inline-flex max-w-full shrink-0 items-center rounded-md border border-slate-200/90 bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-slate-700 dark:border-white/[0.12] dark:bg-white/[0.08] dark:text-[#c8d4f0]">
      {label}
    </span>
  );
}

function PortfolioClusterListContent({ units, onOpenUnit, onHoverUnit }) {
  return (
    <div className="pointer-events-auto max-w-[min(340px,92vw)] select-text text-[13px] leading-snug text-[#0f172a] dark:text-[#f1f5ff]">
      <div className="mb-3 rounded-lg border border-slate-200/95 bg-white px-3 py-2.5 shadow-sm dark:border-white/[0.16] dark:bg-[#0f172a]">
        <p className="text-[13px] font-bold leading-tight tracking-tight text-slate-950 dark:text-white">
          {units.length} Einheiten an diesem Standort
        </p>
      </div>
      <div className="max-h-[min(260px,55vh)] overflow-y-auto overscroll-contain pr-0.5">
        <ul className="space-y-2.5">
          {units.map((it) => {
            const loc = portfolioMapLocationHint(it);
            const shortId = String(it.short_unit_id || it.unit_id || "").trim() || "—";
            return (
              <li
                key={it.unit_id}
                data-portfolio-map-unit={it.unit_id}
                className="rounded-lg border border-slate-200/90 bg-slate-50/95 p-2.5 shadow-sm transition-colors hover:border-sky-400/50 hover:bg-white dark:border-white/[0.12] dark:bg-[#141b2a] dark:hover:border-sky-400/40 dark:hover:bg-[#1a2235]"
                onMouseEnter={() => onHoverUnit?.(it.unit_id)}
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-semibold text-slate-900 dark:text-[#f1f5ff]">{shortId}</span>
                  <span className="text-slate-400 dark:text-[#7c8aad]" aria-hidden>
                    ·
                  </span>
                  <span className="text-[12px] font-medium text-slate-800 dark:text-[#e2e8fb]">
                    {portfolioMapClusterSecondaryLine(it)}
                  </span>
                  <PortfolioMapUnitTypeBadge apiType={it.type} />
                </div>
                {loc ? (
                  <p className="mt-1 text-[11px] text-slate-600 dark:text-[#a8b8d8]">{loc}</p>
                ) : null}
                <button
                  type="button"
                  className="mt-2 w-full cursor-pointer rounded-md border border-transparent px-2 py-1.5 text-left text-[12px] font-semibold text-sky-700 transition-colors hover:border-sky-300/80 hover:bg-sky-50 dark:text-sky-300 dark:hover:border-sky-500/50 dark:hover:bg-sky-950/40"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenUnit(it.unit_id);
                  }}
                >
                  Einheit öffnen
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/** Custom cluster marker: high-contrast count bubble (reads well on light/neutral maps). */
const portfolioMapClusterRenderer = {
  render(cluster, _stats, _map) {
    const count = cluster.count;
    const position = cluster.position;
    const fid = `pmc_${count}_${Math.round(position.lat() * 1e5)}_${Math.round(position.lng() * 1e5)}`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 84 84" width="84" height="84">
      <defs>
        <filter id="${fid}" x="-35%" y="-35%" width="170%" height="170%">
          <feDropShadow dx="0" dy="2" stdDeviation="2.5" flood-color="#0f172a" flood-opacity="0.32"/>
        </filter>
      </defs>
      <circle cx="42" cy="42" r="22" fill="#ffffff" stroke="#0f172a" stroke-width="2.75" filter="url(#${fid})"/>
      <text x="42" y="48" text-anchor="middle" font-size="15" font-weight="700" fill="#0f172a" font-family="system-ui,-apple-system,sans-serif">${count}</text>
    </svg>`;
    return new globalThis.google.maps.Marker({
      position,
      cursor: "pointer",
      icon: {
        url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
        scaledSize: new globalThis.google.maps.Size(44, 44),
        anchor: new globalThis.google.maps.Point(22, 22),
      },
      zIndex: Number(globalThis.google.maps.Marker.MAX_ZINDEX) + count,
      title: `${count} Einheiten`,
    });
  },
};

/** SVG circle markers: white ring + soft shadow; active state adds a subtle outer ring. */
function buildUnitMarkerIcon(it, activeUnitId, hoverUnitId) {
  const fill = portfolioMapMarkerFill(it.map_status);
  const uid = it.unit_id;
  const active = activeUnitId === uid;
  const hover = hoverUnitId === uid;
  const rid = `pum_${String(uid).replace(/\W/g, "_").slice(0, 48)}`;
  const rInner = active ? 12.75 : hover ? 11.5 : 10.25;
  const sw = active ? 3.5 : hover ? 3.15 : 2.85;
  const ring = active
    ? `<circle cx="28" cy="28" r="17.5" fill="none" stroke="#0f172a" stroke-width="2" stroke-opacity="0.22"/>`
    : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 56 56" width="56" height="56">
      <defs>
        <filter id="${rid}_sh" x="-40%" y="-40%" width="180%" height="180%">
          <feDropShadow dx="0" dy="1.5" stdDeviation="2.25" flood-color="#0f172a" flood-opacity="0.3"/>
        </filter>
      </defs>
      ${ring}
      <circle cx="28" cy="28" r="${rInner}" fill="${fill}" stroke="#ffffff" stroke-width="${sw}" filter="url(#${rid}_sh)"/>
    </svg>`;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new globalThis.google.maps.Size(36, 36),
    anchor: new globalThis.google.maps.Point(18, 18),
  };
}

function PortfolioMapMarkersAndCluster({
  plottedItems,
  plottedItemsKey,
  preview,
  activeUnitId,
  clusterListHoverUnitId,
  onUnitMarkerClick,
  onSinglePopupClose,
  onClusterPopupClose,
  onHoverUnit,
  onHoverClear,
}) {
  const map = useMap();
  const loaded = useApiIsLoaded();
  const clustererRef = useRef(null);
  const markersRef = useRef([]);
  const navigate = useNavigate();

  const [singleInfo, setSingleInfo] = useState(null);
  const [clusterInfo, setClusterInfo] = useState(null);

  const clearPopups = useCallback(() => {
    setSingleInfo(null);
    setClusterInfo(null);
    onSinglePopupClose();
    onClusterPopupClose();
  }, [onSinglePopupClose, onClusterPopupClose]);

  const closeSinglePopup = useCallback(() => {
    setSingleInfo(null);
    onSinglePopupClose();
  }, [onSinglePopupClose]);

  const closeClusterPopup = useCallback(() => {
    setClusterInfo(null);
    onClusterPopupClose();
  }, [onClusterPopupClose]);

  useEffect(() => {
    clearPopups();
    onHoverClear();
  }, [plottedItemsKey, clearPopups, onHoverClear]);

  useEffect(() => {
    if (!loaded || !map || !globalThis.google?.maps) return;

    markersRef.current.forEach((m) => {
      globalThis.google.maps.event.clearInstanceListeners(m);
      m.setMap(null);
    });
    markersRef.current = [];
    if (clustererRef.current) {
      clustererRef.current.setMap(null);
      clustererRef.current = null;
    }

    if (!plottedItems.length) return;

    const markers = plottedItems.map((it) => {
      const marker = new globalThis.google.maps.Marker({
        position: {
          lat: Number(it.latitude),
          lng: Number(it.longitude),
        },
        map: null,
        icon: buildUnitMarkerIcon(it, null, null),
        cursor: preview ? undefined : "pointer",
        zIndex: 1,
      });
      marker.set("portfolioUnit", it);
      if (!preview) {
        marker.addListener("click", () => {
          const pos = marker.getPosition();
          if (!pos) return;
          setClusterInfo(null);
          onClusterPopupClose();
          onUnitMarkerClick(it.unit_id);
          setSingleInfo({
            unit: it,
            position: { lat: pos.lat(), lng: pos.lng() },
          });
        });
      }
      return marker;
    });
    markersRef.current = markers;

    const clusterer = new MarkerClusterer({
      map,
      markers,
      renderer: portfolioMapClusterRenderer,
      onClusterClick: preview
        ? () => {}
        : (_event, c) => {
            setSingleInfo(null);
            onSinglePopupClose();
            onHoverClear();
            const units = c.markers
              .map((m) => m.get("portfolioUnit"))
              .filter(Boolean);
            const sorted = [...units].sort(portfolioMapClusterSortUnits);
            const p = c.position;
            setClusterInfo({
              position: { lat: p.lat(), lng: p.lng() },
              units: sorted,
            });
          },
    });
    clustererRef.current = clusterer;

    return () => {
      if (clustererRef.current) {
        clustererRef.current.clearMarkers();
        clustererRef.current.setMap(null);
        clustererRef.current = null;
      }
      markersRef.current.forEach((m) => {
        globalThis.google.maps.event.clearInstanceListeners(m);
        m.setMap(null);
      });
      markersRef.current = [];
    };
  }, [
    loaded,
    map,
    plottedItems,
    plottedItemsKey,
    preview,
    onUnitMarkerClick,
    onSinglePopupClose,
    onClusterPopupClose,
    onHoverClear,
  ]);

  useEffect(() => {
    if (!loaded || !globalThis.google?.maps) return;
    markersRef.current.forEach((m) => {
      const it = m.get("portfolioUnit");
      if (!it) return;
      m.setIcon(buildUnitMarkerIcon(it, activeUnitId, clusterListHoverUnitId));
      m.setZIndex(
        activeUnitId === it.unit_id ? 200 : clusterListHoverUnitId === it.unit_id ? 80 : 1
      );
    });
  }, [loaded, activeUnitId, clusterListHoverUnitId]);

  useEffect(() => {
    if (!loaded || !map || !plottedItems.length) return;
    if (plottedItems.length === 1) {
      const it = plottedItems[0];
      map.setCenter({
        lat: Number(it.latitude),
        lng: Number(it.longitude),
      });
      map.setZoom(14);
      return;
    }
    const bounds = new globalThis.google.maps.LatLngBounds();
    plottedItems.forEach((it) => {
      bounds.extend({
        lat: Number(it.latitude),
        lng: Number(it.longitude),
      });
    });
    map.fitBounds(bounds, { top: 48, right: 48, bottom: 48, left: 48 });
    globalThis.google.maps.event.addListenerOnce(map, "bounds_changed", () => {
      const z = map.getZoom();
      if (z != null && z > 15) map.setZoom(15);
    });
  }, [loaded, map, plottedItems]);

  return (
    <>
      {!preview && singleInfo ? (
        <InfoWindow
          position={singleInfo.position}
          shouldFocus={false}
          disableAutoPan
          pixelOffset={[0, -12]}
          className="portfolio-map-iw"
          style={{ padding: 14, maxWidth: 288 }}
          onClose={closeSinglePopup}
          onCloseClick={closeSinglePopup}
        >
          <PortfolioMapPopupBody it={singleInfo.unit} />
        </InfoWindow>
      ) : null}
      {!preview && clusterInfo ? (
        <InfoWindow
          position={clusterInfo.position}
          shouldFocus={false}
          disableAutoPan
          pixelOffset={[0, -12]}
          className="portfolio-map-iw"
          style={{ padding: 14, maxWidth: 368 }}
          onClose={closeClusterPopup}
          onCloseClick={closeClusterPopup}
        >
          <PortfolioClusterListContent
            units={clusterInfo.units}
            onOpenUnit={(unitId) => {
              setClusterInfo(null);
              onClusterPopupClose();
              navigate(`/admin/units/${encodeURIComponent(unitId)}`);
            }}
            onHoverUnit={onHoverUnit}
          />
        </InfoWindow>
      ) : null}
    </>
  );
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
    <div className="pointer-events-auto min-w-[200px] max-w-[260px] select-text space-y-1.5 text-[13px] leading-snug text-[#0f172a] dark:text-[#f1f5ff]">
      <p className="font-semibold text-slate-950 dark:text-white">{line1}</p>
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
        className="mt-1 inline-flex w-full cursor-pointer items-center rounded-md border border-transparent px-2 py-1.5 text-[12px] font-semibold text-sky-700 transition-colors hover:border-sky-300/80 hover:bg-sky-50 dark:text-sky-300 dark:hover:border-sky-500/50 dark:hover:bg-sky-950/40"
        onClick={(e) => e.stopPropagation()}
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

function PortfolioMapGoogleInner({
  plottedItems,
  plottedItemsKey,
  preview,
  activeUnitId,
  clusterListHoverUnitId,
  setActiveUnitId,
  setClusterListHoverUnitId,
}) {
  const mapId = (process.env.REACT_APP_GOOGLE_MAPS_MAP_ID || "").trim() || undefined;

  const onSinglePopupClose = useCallback(() => {
    setActiveUnitId(null);
  }, [setActiveUnitId]);

  const onClusterPopupClose = useCallback(() => {
    setClusterListHoverUnitId(null);
  }, [setClusterListHoverUnitId]);

  const onHoverClear = useCallback(() => {
    setClusterListHoverUnitId(null);
  }, [setClusterListHoverUnitId]);

  return (
    <Map
      id="portfolio-map-google"
      mapId={mapId}
      defaultCenter={DEFAULT_CENTER}
      defaultZoom={DEFAULT_ZOOM}
      gestureHandling={preview ? "none" : "greedy"}
      colorScheme={ColorScheme.LIGHT}
      renderingType="VECTOR"
      style={{ width: "100%", height: "100%" }}
      disableDefaultUI={preview}
      mapTypeControl={false}
      scrollwheel={!preview}
    >
      <PortfolioMapMarkersAndCluster
        plottedItems={plottedItems}
        plottedItemsKey={plottedItemsKey}
        preview={preview}
        activeUnitId={activeUnitId}
        clusterListHoverUnitId={clusterListHoverUnitId}
        onUnitMarkerClick={setActiveUnitId}
        onSinglePopupClose={onSinglePopupClose}
        onClusterPopupClose={onClusterPopupClose}
        onHoverUnit={setClusterListHoverUnitId}
        onHoverClear={onHoverClear}
      />
    </Map>
  );
}

export default function PortfolioMapSection({
  preview = false,
  hideSectionHeader = false,
}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeUnitId, setActiveUnitId] = useState(null);
  const [clusterListHoverUnitId, setClusterListHoverUnitId] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();

  const apiKey = (process.env.REACT_APP_GOOGLE_MAPS_API_KEY || "").trim();

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
    if (preview) return "all";
    const v = searchParams.get(PM_QS_TYPE);
    return PM_VALID_TYPES.has(v) ? v : "all";
  }, [preview, searchParams]);

  const filterStatus = useMemo(() => {
    if (preview) return "all";
    const v = searchParams.get(PM_QS_STATUS);
    return PM_VALID_STATUSES.has(v) ? v : "all";
  }, [preview, searchParams]);

  const filterCityParam = preview ? null : searchParams.get(PM_QS_CITY);

  const filterCity = useMemo(() => {
    if (preview) return "all";
    if (!filterCityParam || filterCityParam === "all") return "all";
    if (cityOptions.length === 0) return filterCityParam;
    return cityOptions.includes(filterCityParam) ? filterCityParam : "all";
  }, [preview, filterCityParam, cityOptions]);

  useEffect(() => {
    if (preview) return;
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
  }, [preview, filterCityParam, cityOptions, setSearchParams]);

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

  const plottedItemsKey = useMemo(
    () => plottedItems.map((x) => x.unit_id).join("|"),
    [plottedItems]
  );

  const hasActiveFilters =
    filterType !== "all" || filterStatus !== "all" || filterCity !== "all";

  const mapHeightPx = preview ? 200 : 380;
  const sectionHideHeader = hideSectionHeader && !preview;

  if (loading) {
    return (
      <SectionCard
        hideHeader={sectionHideHeader}
        title="Portfolio-Karte"
        subtitle={
          preview
            ? "Vorschau · Klicken Sie für die interaktive Karte"
            : "Globale Übersicht aller Einheiten · Standorte aus Liegenschaftskoordinaten"
        }
      >
        <p className="py-8 text-sm text-[#64748b] dark:text-[#6b7a9a]">Karte wird geladen…</p>
      </SectionCard>
    );
  }

  if (error) {
    return (
      <SectionCard
        hideHeader={sectionHideHeader}
        title="Portfolio-Karte"
        subtitle={
          preview
            ? "Vorschau · Klicken Sie für die interaktive Karte"
            : "Globale Übersicht aller Einheiten · Standorte aus Liegenschaftskoordinaten"
        }
      >
        <p className="py-4 text-sm text-[#f87171]">{error}</p>
        {preview ? (
          <Link
            to="/admin/portfolio-map"
            className="mt-3 inline-flex rounded-lg border border-black/10 bg-slate-100 px-4 py-2 text-sm font-semibold text-[#0f172a] no-underline transition-colors hover:bg-slate-200 dark:border-white/[0.1] dark:bg-[#111520] dark:text-[#eef2ff] dark:hover:bg-white/[0.08]"
          >
            Portfolio-Karte öffnen
          </Link>
        ) : null}
      </SectionCard>
    );
  }

  const summary = data?.summary || {};
  const total = Number(summary.total_units) || 0;
  const plotted = Number(summary.plotted_units) || 0;
  const missing = Number(summary.missing_coordinates) || 0;

  const mapShellClass =
    "overflow-hidden rounded-[12px] border border-slate-200/90 bg-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] ring-1 ring-slate-900/[0.06] dark:border-white/[0.12] dark:bg-[#1a1f2c] dark:shadow-none dark:ring-white/[0.06]";

  const mapBlock = (
    <div
      className={preview ? `${mapShellClass} pointer-events-none` : mapShellClass}
      style={{ height: mapHeightPx }}
    >
      {!apiKey ? (
        <div className="flex h-full items-center justify-center px-4 text-center text-sm text-amber-900 dark:text-amber-100">
          <div className="max-w-md rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
            <p className="font-semibold">Kartenansicht nicht verfügbar</p>
            <p className="mt-2 text-[13px] leading-relaxed opacity-95">
              Für die Karte wird <code className="rounded bg-black/10 px-1">REACT_APP_GOOGLE_MAPS_API_KEY</code> in der
              Frontend-Konfiguration benötigt (Maps JavaScript API). Bitte Schlüssel setzen und Anwendung neu starten.
            </p>
          </div>
        </div>
      ) : (
        <APIProvider apiKey={apiKey} language="de" region="CH">
          <PortfolioMapGoogleInner
            plottedItems={plottedItems}
            plottedItemsKey={plottedItemsKey}
            preview={preview}
            activeUnitId={activeUnitId}
            clusterListHoverUnitId={clusterListHoverUnitId}
            setActiveUnitId={setActiveUnitId}
            setClusterListHoverUnitId={setClusterListHoverUnitId}
          />
        </APIProvider>
      )}
    </div>
  );

  return (
    <SectionCard
      hideHeader={sectionHideHeader}
      title="Portfolio-Karte"
      subtitle={
        preview
          ? "Vorschau · Klicken Sie für die interaktive Karte mit Filtern"
          : "Alle Einheitstypen · Statusfarben · nur Marker mit Koordinaten an der Liegenschaft"
      }
    >
      <p className="mb-4 text-sm font-medium text-[#0f172a] dark:text-[#eef2ff]">
        {total} Einheiten · {plotted} auf Karte · {missing} ohne Koordinaten
      </p>

      {!preview && hasActiveFilters && (
        <p className="mb-3 text-xs text-[#64748b] dark:text-[#6b7a9a]">
          Nach Filter: {filteredItems.length} Einheiten · {plottedItems.length} Marker
        </p>
      )}

      {!preview ? (
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
      ) : null}

      {total === 0 ? (
        <>
          <p className="rounded-[10px] border border-black/10 bg-slate-100 px-4 py-6 text-sm text-[#64748b] dark:border-white/[0.08] dark:bg-[#111520] dark:text-[#6b7a9a]">
            Keine Einheiten vorhanden.
          </p>
          {preview ? (
            <Link
              to="/admin/portfolio-map"
              className="mt-3 inline-flex rounded-lg border border-black/10 bg-slate-100 px-4 py-2 text-sm font-semibold text-[#0f172a] no-underline transition-colors hover:bg-slate-200 dark:border-white/[0.1] dark:bg-[#111520] dark:text-[#eef2ff] dark:hover:bg-white/[0.08]"
            >
              Portfolio-Karte öffnen
            </Link>
          ) : null}
        </>
      ) : plotted === 0 ? (
        <>
          <p className="rounded-[10px] border border-black/10 bg-slate-100 px-4 py-6 text-sm text-[#64748b] dark:border-white/[0.08] dark:bg-[#111520] dark:text-[#6b7a9a]">
            {preview
              ? "Noch keine Koordinaten an den Liegenschaften — Details und Pflege auf der Portfolio-Karte."
              : "Für diese Einheiten sind noch keine Koordinaten vorhanden. Bitte pflegen Sie die Koordinaten an der zugehörigen Liegenschaft (Admin → Liegenschaften)."}
          </p>
          {preview ? (
            <Link
              to="/admin/portfolio-map"
              className="mt-3 inline-flex rounded-lg border border-black/10 bg-slate-100 px-4 py-2 text-sm font-semibold text-[#0f172a] no-underline transition-colors hover:bg-slate-200 dark:border-white/[0.1] dark:bg-[#111520] dark:text-[#eef2ff] dark:hover:bg-white/[0.08]"
            >
              Portfolio-Karte öffnen
            </Link>
          ) : null}
        </>
      ) : plottedItems.length === 0 && hasActiveFilters ? (
        <p className="rounded-[10px] border border-black/10 bg-slate-100 px-4 py-6 text-sm text-[#64748b] dark:border-white/[0.08] dark:bg-[#111520] dark:text-[#6b7a9a]">
          Keine Marker passen zu den aktuellen Filtern.
        </p>
      ) : (
        <>
          {missing > 0 && !hasActiveFilters && !preview ? (
            <p className="mb-3 text-sm text-[#64748b] dark:text-[#6b7a9a]">
              {missing} Einheiten haben noch keine Koordinaten und werden derzeit nicht auf der
              Karte angezeigt.
            </p>
          ) : null}
          {missing > 0 && !hasActiveFilters && preview ? (
            <p className="mb-3 text-[11px] text-[#64748b] dark:text-[#6b7a9a]">
              {missing} ohne Koordinaten (nicht in der Vorschau).
            </p>
          ) : null}
          {preview ? (
            <>
              <Link
                to="/admin/portfolio-map"
                className="group block rounded-[12px] no-underline outline-none ring-offset-2 ring-offset-white transition-shadow focus-visible:ring-2 focus-visible:ring-sky-500/60 dark:ring-offset-[#141824]"
                aria-label="Zur vollständigen Portfolio-Karte mit Filtern"
              >
                {mapBlock}
              </Link>
              <Link
                to="/admin/portfolio-map"
                className="mt-3 inline-flex rounded-lg border border-black/10 bg-slate-100 px-4 py-2 text-sm font-semibold text-[#0f172a] no-underline transition-colors hover:bg-slate-200 dark:border-white/[0.1] dark:bg-[#111520] dark:text-[#eef2ff] dark:hover:bg-white/[0.08]"
              >
                Portfolio-Karte öffnen
              </Link>
            </>
          ) : (
            mapBlock
          )}
        </>
      )}
    </SectionCard>
  );
}
