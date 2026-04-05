import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import {
  fetchAdminUnits,
  fetchAdminRooms,
  fetchAdminTenants,
  fetchAdminTenancies,
  fetchAdminInvoices,
  deleteAdminTenant,
  normalizeUnit,
  normalizeRoom,
} from "../../api/adminData";
import TenantCreateModal from "../../components/admin/tenants/TenantCreateModal";
import { tenantDisplayName } from "../../utils/tenantDisplayName";
import {
  deriveTenantOperationalStatus,
  getTodayIsoForOccupancy,
  isTenancyActiveByDates,
  isTenancyFuture,
  isTenancyReservedSlot,
} from "../../utils/unitOccupancyStatus";

function formatCurrency(value) {
  const amount = Number(value || 0);
  return `CHF ${amount.toLocaleString("de-CH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function formatDate(dateString) {
  if (!dateString) return "-";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;

  return date.toLocaleDateString("de-CH", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function getStatusMeta(status) {
  const normalized = String(status || "").toLowerCase();
  const aktiv =
    "inline-flex items-center rounded-full border border-[rgba(61,220,132,0.2)] bg-[rgba(61,220,132,0.1)] px-2 py-[2px] text-[9px] font-semibold text-[#3ddc84]";
  const reserviert =
    "inline-flex items-center rounded-full border border-[rgba(245,166,35,0.2)] bg-[rgba(245,166,35,0.1)] px-2 py-[2px] text-[9px] font-semibold text-[#f5a623]";
  const ausgezogen =
    "inline-flex items-center rounded-full border border-[#1c2035] bg-[#191c28] px-2 py-[2px] text-[9px] font-semibold text-[#4a5070]";
  const neutral =
    "inline-flex items-center rounded-full border border-[#1c2035] bg-[#191c28] px-2 py-[2px] text-[9px] font-semibold text-[#8892b0]";

  if (
    normalized === "active" ||
    normalized === "aktiv" ||
    normalized === "belegt"
  ) {
    return { label: "Aktiv", pillClass: aktiv };
  }

  if (normalized === "reserved" || normalized === "reserviert") {
    return { label: "Reserviert", pillClass: reserviert };
  }

  if (
    normalized === "ended" ||
    normalized === "beendet" ||
    normalized === "move_out" ||
    normalized === "ausgezogen"
  ) {
    return { label: "Ausgezogen", pillClass: ausgezogen };
  }

  if (normalized === "inactive" || normalized === "inaktiv") {
    return { label: "Inaktiv", pillClass: neutral };
  }

  return {
    label: status || "Offen",
    pillClass: neutral,
  };
}

const AVATAR_PALETTES = [
  "border border-[rgba(91,156,246,0.2)] bg-[rgba(91,156,246,0.1)] text-[#5b9cf6]",
  "border border-[rgba(157,124,244,0.2)] bg-[rgba(157,124,244,0.1)] text-[#9d7cf4]",
  "border border-[rgba(61,220,132,0.2)] bg-[rgba(61,220,132,0.1)] text-[#3ddc84]",
  "border border-[rgba(245,166,35,0.2)] bg-[rgba(245,166,35,0.1)] text-[#f5a623]",
];

function initialsFromDisplayName(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[parts.length - 1][0] || ""}`.toUpperCase();
}

function roleBadgeClass(label) {
  if (label === "Hauptmieter") {
    return "inline-flex rounded-full border border-[rgba(91,156,246,0.2)] bg-[rgba(91,156,246,0.1)] px-[6px] py-[1px] text-[9px] font-semibold text-[#5b9cf6]";
  }
  return "inline-flex rounded-full border border-[#1c2035] bg-[#191c28] px-[6px] py-[1px] text-[9px] font-semibold text-[#8892b0]";
}

/** Tenancies where this tenant is primary (tenant_id) or listed in participants. */
function tenanciesForTenant(tenancies, tenantId) {
  const tid = String(tenantId);
  const seen = new Set();
  const out = [];
  for (const tenancy of tenancies || []) {
    const id = tenancy?.id != null ? String(tenancy.id) : "";
    if (!id || seen.has(id)) continue;
    if (String(tenancy.tenant_id) === tid) {
      seen.add(id);
      out.push(tenancy);
      continue;
    }
    const parts = tenancy?.participants;
    if (!Array.isArray(parts)) continue;
    if (parts.some((p) => p && String(p.tenant_id) === tid)) {
      seen.add(id);
      out.push(tenancy);
    }
  }
  return out;
}

/**
 * German role label for shared contracts. Co-/Solidarhafter always; Hauptmieter only when
 * multiple participants (avoids clutter on single-person rows).
 */
function tenancyParticipantRoleLabelDe(tenancy, tenantId) {
  const parts = tenancy?.participants;
  if (!Array.isArray(parts) || parts.length === 0) return null;
  const p = parts.find((x) => x && String(x.tenant_id) === String(tenantId));
  if (!p?.role) return null;
  if (p.role === "co_tenant") return "Co-Mieter";
  if (p.role === "solidarhafter") return "Solidarhafter";
  if (p.role === "primary_tenant" && parts.length > 1) return "Hauptmieter";
  return null;
}

function rowMatchesStatusFilter(row, filterKey) {
  if (!filterKey || filterKey === "all") return true;
  const s = String(row.status || "").toLowerCase();
  if (filterKey === "active") {
    return s === "active" || s === "aktiv" || s === "belegt";
  }
  if (filterKey === "reserved") {
    return s === "reserved" || s === "reserviert";
  }
  if (filterKey === "ended") {
    return (
      s === "ended" ||
      s === "beendet" ||
      s === "move_out" ||
      s === "ausgezogen"
    );
  }
  if (filterKey === "open") {
    if (rowMatchesStatusFilter(row, "active")) return false;
    if (rowMatchesStatusFilter(row, "reserved")) return false;
    if (rowMatchesStatusFilter(row, "ended")) return false;
    return true;
  }
  return true;
}

function buildTenantRows(tenants, tenancies, rooms, units, invoices) {
  const todayIso = getTodayIsoForOccupancy();
  return tenants.map((tenant) => {
    const tenantTenancies = tenanciesForTenant(tenancies, tenant.id);

    const activeTenancy = tenantTenancies.find((t) =>
      isTenancyActiveByDates(t, todayIso)
    );
    const reservedTenancy = tenantTenancies.find(
      (t) =>
        isTenancyReservedSlot(t, todayIso) || isTenancyFuture(t, todayIso)
    );
    const currentTenancy = activeTenancy || reservedTenancy || null;

    const rowStatus = deriveTenantOperationalStatus(tenantTenancies, todayIso);

    const room = currentTenancy
      ? rooms.find((item) => String(item.id) === String(currentTenancy.room_id))
      : null;

    const unit = room
      ? units.find(
          (item) =>
            String(item.id) === String(room.unit_id) ||
            String(item.unitId) === String(room.unit_id)
        )
      : null;

    const tenantInvoices = invoices.filter(
      (invoice) =>
        String(invoice.tenant_id || "") === String(tenant.id) ||
        String(invoice.tenancy_id || "") === String(currentTenancy?.id || "")
    );

    const openInvoices = tenantInvoices.filter((invoice) => {
      const status = String(invoice.status || "").toLowerCase();
      return status === "open" || status === "unpaid" || status === "overdue";
    });

    const paidInvoices = tenantInvoices.filter((invoice) => {
      const status = String(invoice.status || "").toLowerCase();
      return status === "paid";
    });

    const totalOpenAmount = openInvoices.reduce(
      (sum, invoice) => sum + Number(invoice.amount || 0),
      0
    );

    const totalPaidAmount = paidInvoices.reduce(
      (sum, invoice) => sum + Number(invoice.amount || 0),
      0
    );

    const tenancyRoleLabel = currentTenancy
      ? tenancyParticipantRoleLabelDe(currentTenancy, tenant.id)
      : null;

    return {
      id: tenant.id,
      fullName: tenantDisplayName(tenant) || `Mieter ${tenant.id}`,
      email: tenant.email || "-",
      phone: tenant.phone || tenant.mobile || "-",
      status: rowStatus,
      tenancyRoleLabel,
      unitId: currentTenancy ? unit?.unitId || unit?.unit_id || "—" : "—",
      unitAddress: currentTenancy ? unit?.address || "—" : "—",
      roomName: currentTenancy
        ? room?.roomName || room?.name || room?.room_number || "—"
        : "—",
      startDate: currentTenancy
        ? currentTenancy.move_in_date || currentTenancy.start_date || null
        : null,
      endDate: currentTenancy
        ? currentTenancy.move_out_date || currentTenancy.end_date || null
        : null,
      monthlyRent:
        currentTenancy != null
          ? Number(
              currentTenancy.monthly_revenue_equivalent ?? 0
            )
          : null,
      depositAmount:
        currentTenancy?.deposit_chf ??
        currentTenancy?.deposit_amount ??
        tenant.deposit_amount ??
        0,
      billingCycle: currentTenancy?.billing_cycle || "-",
      openInvoicesCount: openInvoices.length,
      paidInvoicesCount: paidInvoices.length,
      totalOpenAmount,
      totalPaidAmount,
      notes: currentTenancy?.notes || tenant.notes || "",
    };
  });
}

function AdminTenantsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [units, setUnits] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [tenancies, setTenancies] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  const reloadData = useCallback(() => {
    setLoadError(null);
    return Promise.all([
      fetchAdminUnits(),
      fetchAdminRooms(),
      fetchAdminTenants({ limit: 200 }),
      fetchAdminTenancies({ limit: 200 }),
      fetchAdminInvoices(),
    ])
      .then(([unitsData, roomsData, tenantsData, tenanciesData, invoicesData]) => {
        setUnits(unitsData.map(normalizeUnit));
        setRooms(roomsData.map(normalizeRoom));
        setTenants(tenantsData);
        setTenancies(tenanciesData);
        setInvoices(invoicesData);
      })
      .catch((e) => {
        setLoadError(e?.message ?? "Fehler beim Laden.");
      });
  }, []);

  useEffect(() => {
    setLoading(true);
    reloadData().finally(() => setLoading(false));
  }, [reloadData]);

  useEffect(() => {
    if (!location.state?.refreshTenants) return;
    setLoading(true);
    reloadData().finally(() => setLoading(false));
    navigate(location.pathname, { replace: true, state: {} });
  }, [location.state?.refreshTenants, navigate, reloadData, location.pathname]);

  const rows = useMemo(() => {
    return buildTenantRows(tenants, tenancies, rooms, units, invoices);
  }, [tenants, tenancies, rooms, units, invoices]);

  const filteredRows = useMemo(() => {
    let list = rows;
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((row) => {
        const name = String(row.fullName || "").toLowerCase();
        const email = String(row.email || "").toLowerCase();
        const phone = String(row.phone || "").toLowerCase();
        return name.includes(q) || email.includes(q) || phone.includes(q);
      });
    }
    if (statusFilter && statusFilter !== "all") {
      list = list.filter((row) => rowMatchesStatusFilter(row, statusFilter));
    }
    return list;
  }, [rows, searchQuery, statusFilter]);

  const summary = useMemo(() => {
    const activeCount = rows.filter((row) => {
      const status = String(row.status || "").toLowerCase();
      return status === "active" || status === "aktiv" || status === "belegt";
    }).length;

    const reservedCount = rows.filter((row) => {
      const status = String(row.status || "").toLowerCase();
      return status === "reserviert" || status === "reserved";
    }).length;

    const movedOutCount = rows.filter((row) => {
      const status = String(row.status || "").toLowerCase();
      return (
        status === "ended" ||
        status === "beendet" ||
        status === "ausgezogen"
      );
    }).length;

    const totalMonthlyRent = rows.reduce(
      (sum, row) =>
        sum + (row.monthlyRent == null ? 0 : Number(row.monthlyRent)),
      0
    );

    const totalOpenInvoices = rows.reduce(
      (sum, row) => sum + Number(row.openInvoicesCount || 0),
      0
    );

    const totalOpenAmount = rows.reduce(
      (sum, row) => sum + Number(row.totalOpenAmount || 0),
      0
    );

    return {
      totalCount: rows.length,
      activeCount,
      reservedCount,
      movedOutCount,
      totalMonthlyRent,
      totalOpenInvoices,
      totalOpenAmount,
    };
  }, [rows]);

  const handleDeleteTenant = useCallback(
    (e, tenantId) => {
      e.stopPropagation();
      if (!window.confirm("Diesen Mieter wirklich unwiderruflich löschen?")) return;
      setDeleteError(null);
      deleteAdminTenant(tenantId)
        .then(() => reloadData())
        .catch((err) => {
          setDeleteError(
            (err && typeof err.message === "string" && err.message) ||
              String(err || "") ||
              "Löschen fehlgeschlagen."
          );
        });
    },
    [reloadData]
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-[#080a0f] p-6 text-[#4a5070]">
        Lade Mieter, Zimmer, Mietverhältnisse und Rechnungen …
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-[#080a0f] p-6 text-[#edf0f7]">
        <div className="rounded-[12px] border border-[rgba(255,95,109,0.25)] bg-[rgba(255,95,109,0.08)] px-4 py-3 text-[14px] text-[#ff5f6d]">
          <strong className="font-semibold">Fehler beim Laden:</strong> {loadError}
        </div>
      </div>
    );
  }

  return (
    <div className="-m-6 min-h-screen bg-[#080a0f]">
      <TenantCreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          reloadData();
        }}
      />

      <div className="sticky top-0 z-30 flex h-[50px] items-center justify-end border-b border-[#1c2035] bg-[#0c0e15] px-6 backdrop-blur-md">
        <div className="mr-auto flex items-center gap-3">
          <span className="font-semibold text-[#edf0f7]">
            Van<span className="text-[#5b9cf6]">tio</span>
          </span>
          <span className="text-[#4a5070]">·</span>
          <span className="text-[14px] font-medium text-[#edf0f7]">Mieter</span>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="rounded-[6px] border border-[rgba(91,156,246,0.28)] bg-[rgba(91,156,246,0.1)] px-[14px] py-[5px] text-[11px] font-medium text-[#5b9cf6]"
        >
          + Neuer Mieter
        </button>
      </div>

      <div className="mx-auto flex max-w-[min(1400px,100%)] flex-col gap-4 px-6 py-5">
        {deleteError ? (
          <div className="rounded-[10px] border border-[rgba(255,95,109,0.25)] bg-[rgba(255,95,109,0.08)] px-4 py-3 text-[14px] text-[#ff5f6d]">
            {deleteError}
          </div>
        ) : null}

        <div>
          <div className="mb-[10px] flex items-center gap-2">
            <span className="text-[10px] font-medium uppercase tracking-[0.8px] text-[#4a5070]">
              Übersicht · Live
            </span>
            <div className="h-px flex-1 bg-[#1c2035]" />
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <div className="relative overflow-hidden rounded-[10px] border border-[#1c2035] bg-[#10121a] p-[13px_15px] transition-colors hover:border-[#242840]">
              <div className="absolute left-0 right-0 top-0 h-[2px] rounded-t-[10px] bg-[#5b9cf6]" />
              <p className="mb-[4px] text-[9px] font-medium uppercase tracking-[0.5px] text-[#4a5070]">
                Mieter gesamt
              </p>
              <p className="mb-[4px] font-mono text-[22px] font-medium leading-none text-[#5b9cf6]">
                {summary.totalCount}
              </p>
              <p className="text-[10px] leading-[1.4] text-[#4a5070]">Alle erfassten Mieter</p>
            </div>
            <div className="relative overflow-hidden rounded-[10px] border border-[#1c2035] bg-[#10121a] p-[13px_15px] transition-colors hover:border-[#242840]">
              <div className="absolute left-0 right-0 top-0 h-[2px] rounded-t-[10px] bg-[#3ddc84]" />
              <p className="mb-[4px] text-[9px] font-medium uppercase tracking-[0.5px] text-[#4a5070]">
                Aktive Mieter
              </p>
              <p className="mb-[4px] font-mono text-[22px] font-medium leading-none text-[#3ddc84]">
                {summary.activeCount}
              </p>
              <p className="text-[10px] leading-[1.4] text-[#4a5070]">Aktuell laufende Mietverhältnisse</p>
            </div>
            <div className="relative overflow-hidden rounded-[10px] border border-[#1c2035] bg-[#10121a] p-[13px_15px] transition-colors hover:border-[#242840]">
              <div className="absolute left-0 right-0 top-0 h-[2px] rounded-t-[10px] bg-[#f5a623]" />
              <p className="mb-[4px] text-[9px] font-medium uppercase tracking-[0.5px] text-[#4a5070]">Reserviert</p>
              <p className="mb-[4px] font-mono text-[22px] font-medium leading-none text-[#f5a623]">
                {summary.reservedCount}
              </p>
              <p className="text-[10px] leading-[1.4] text-[#4a5070]">Einzug geplant</p>
            </div>
            <div className="relative overflow-hidden rounded-[10px] border border-[#1c2035] bg-[#10121a] p-[13px_15px] transition-colors hover:border-[#242840]">
              <div className="absolute left-0 right-0 top-0 h-[2px] rounded-t-[10px] bg-[#ff5f6d]" />
              <p className="mb-[4px] text-[9px] font-medium uppercase tracking-[0.5px] text-[#4a5070]">
                Offene Rechnungen
              </p>
              <p className="mb-[4px] font-mono text-[22px] font-medium leading-none text-[#ff5f6d]">
                {summary.totalOpenInvoices}
              </p>
              <p className="text-[10px] leading-[1.4] text-[#4a5070]">{formatCurrency(summary.totalOpenAmount)}</p>
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-[12px] border border-[#1c2035] bg-[#10121a]">
          <div className="flex flex-col gap-3 border-b border-[#1c2035] px-[18px] py-[13px] sm:flex-row sm:items-center sm:justify-between">
            <h3 className="m-0 text-[13px] font-medium text-[#edf0f7]">Mieterübersicht</h3>
            <div className="flex flex-wrap items-center gap-[8px]">
              <input
                type="search"
                placeholder="Suche: Name, E-Mail, Telefon …"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-[220px] rounded-[6px] border border-[#1c2035] bg-[#141720] px-[10px] py-[5px] font-['DM_Sans'] text-[12px] text-[#edf0f7] outline-none placeholder:text-[#4a5070]"
                aria-label="Mieter suchen"
              />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="cursor-pointer appearance-none rounded-[6px] border border-[#1c2035] bg-[#141720] px-[10px] py-[5px] font-['DM_Sans'] text-[12px] text-[#8892b0]"
                aria-label="Status filtern"
              >
                <option value="all">Alle Status</option>
                <option value="active">Aktiv</option>
                <option value="reserved">Reserviert</option>
                <option value="ended">Ausgezogen</option>
                <option value="open">Offen / Sonstige</option>
              </select>
              <span className="rounded-[6px] border border-[#1c2035] bg-[#141720] px-[10px] py-[3px] text-[10px] text-[#4a5070]">
                {filteredRows.length === rows.length
                  ? `${rows.length} Einträge`
                  : `${filteredRows.length} / ${rows.length}`}
              </span>
            </div>
          </div>

          {rows.length === 0 ? (
            <p className="px-[18px] py-[16px] text-[12px] text-[#4a5070]">Keine Mieter erfasst.</p>
          ) : filteredRows.length === 0 ? (
            <p className="px-[18px] py-[16px] text-[12px] text-[#4a5070]">Keine Mieter für diese Filter.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr>
                    <th className="whitespace-nowrap border-b border-[#1c2035] px-[14px] py-[8px] text-left text-[9px] font-medium uppercase tracking-[0.6px] text-[#4a5070]">
                      Mieter
                    </th>
                    <th className="whitespace-nowrap border-b border-[#1c2035] px-[14px] py-[8px] text-left text-[9px] font-medium uppercase tracking-[0.6px] text-[#4a5070]">
                      Kontakt
                    </th>
                    <th className="whitespace-nowrap border-b border-[#1c2035] px-[14px] py-[8px] text-left text-[9px] font-medium uppercase tracking-[0.6px] text-[#4a5070]">
                      Unit
                    </th>
                    <th className="whitespace-nowrap border-b border-[#1c2035] px-[14px] py-[8px] text-left text-[9px] font-medium uppercase tracking-[0.6px] text-[#4a5070]">
                      Zimmer
                    </th>
                    <th className="whitespace-nowrap border-b border-[#1c2035] px-[14px] py-[8px] text-left text-[9px] font-medium uppercase tracking-[0.6px] text-[#4a5070]">
                      Start
                    </th>
                    <th className="whitespace-nowrap border-b border-[#1c2035] px-[14px] py-[8px] text-left text-[9px] font-medium uppercase tracking-[0.6px] text-[#4a5070]">
                      Ende
                    </th>
                    <th className="whitespace-nowrap border-b border-[#1c2035] px-[14px] py-[8px] text-left text-[9px] font-medium uppercase tracking-[0.6px] text-[#4a5070]">
                      Einnahmen / Monat (Äquivalent)
                    </th>
                    <th className="whitespace-nowrap border-b border-[#1c2035] px-[14px] py-[8px] text-left text-[9px] font-medium uppercase tracking-[0.6px] text-[#4a5070]">
                      Rechnungen offen
                    </th>
                    <th className="whitespace-nowrap border-b border-[#1c2035] px-[14px] py-[8px] text-left text-[9px] font-medium uppercase tracking-[0.6px] text-[#4a5070]">
                      Offener Betrag
                    </th>
                    <th className="whitespace-nowrap border-b border-[#1c2035] px-[14px] py-[8px] text-left text-[9px] font-medium uppercase tracking-[0.6px] text-[#4a5070]">
                      Status
                    </th>
                    <th className="min-w-[180px] whitespace-nowrap border-b border-[#1c2035] px-[14px] py-[8px] text-left text-[9px] font-medium uppercase tracking-[0.6px] text-[#4a5070]">
                      Aktion
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {filteredRows.map((row, rowIdx) => {
                    const statusMeta = getStatusMeta(row.status);
                    const av = AVATAR_PALETTES[rowIdx % AVATAR_PALETTES.length];
                    const openCnt = row.openInvoicesCount ?? 0;

                    return (
                      <tr
                        key={row.id}
                        className={`cursor-pointer border-b border-[#1c2035] text-[11px] text-[#8892b0] transition-colors hover:bg-[#141720] ${
                          rowIdx === filteredRows.length - 1 ? "border-b-0" : ""
                        }`}
                        onClick={() => navigate(`/admin/tenants/${row.id}`)}
                      >
                        <td className="align-middle px-[14px] py-[10px]">
                          <div className="flex items-center gap-[9px]">
                            <span
                              className={`flex h-[32px] w-[32px] flex-shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${av}`}
                            >
                              {initialsFromDisplayName(row.fullName)}
                            </span>
                            <div>
                              <div className="font-medium text-[12px] text-[#edf0f7]">{row.fullName}</div>
                              {row.tenancyRoleLabel ? (
                                <div className="mt-[3px]">
                                  <span className={roleBadgeClass(row.tenancyRoleLabel)}>
                                    {row.tenancyRoleLabel}
                                  </span>
                                </div>
                              ) : null}
                              {row.notes ? (
                                <div className="mt-1 text-[10px] text-[#4a5070]">{row.notes}</div>
                              ) : null}
                            </div>
                          </div>
                        </td>

                        <td className="align-middle px-[14px] py-[10px]">
                          <div className="text-[11px] text-[#8892b0]">{row.email}</div>
                          <div className="mt-[1px] font-mono text-[10px] text-[#4a5070]">{row.phone}</div>
                        </td>

                        <td className="align-middle px-[14px] py-[10px]">
                          {row.unitId && row.unitId !== "—" ? (
                            <Link
                              to={`/admin/units/${encodeURIComponent(row.unitId)}`}
                              onClick={(e) => e.stopPropagation()}
                              className="text-[11px] font-medium text-[#5b9cf6] hover:underline"
                            >
                              {row.unitAddress}
                            </Link>
                          ) : (
                            <div className="text-[11px] text-[#8892b0]">{row.unitAddress}</div>
                          )}
                          <div className="mt-[1px] max-w-[120px] truncate font-mono text-[8px] text-[#4a5070]">
                            {row.unitId}
                          </div>
                        </td>

                        <td className="align-middle px-[14px] py-[10px] text-[11px] text-[#8892b0]">
                          {row.roomName}
                        </td>
                        <td className="align-middle px-[14px] py-[10px] font-mono text-[10px] text-[#4a5070]">
                          {formatDate(row.startDate)}
                        </td>
                        <td className="align-middle px-[14px] py-[10px] font-mono text-[10px] text-[#4a5070]">
                          {formatDate(row.endDate)}
                        </td>
                        <td
                          className={`align-middle px-[14px] py-[10px] font-mono text-[11px] font-medium ${
                            row.monthlyRent == null ? "text-[#4a5070]" : "text-[#3ddc84]"
                          }`}
                        >
                          {row.monthlyRent == null ? "—" : formatCurrency(row.monthlyRent)}
                        </td>
                        <td className="align-middle px-[14px] py-[10px] text-right">
                          <span
                            className={`inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full px-1 font-mono text-[10px] font-semibold ${
                              openCnt > 0
                                ? "border border-[rgba(245,166,35,0.2)] bg-[rgba(245,166,35,0.1)] text-[#f5a623]"
                                : "border border-[#1c2035] bg-[#191c28] text-[#4a5070]"
                            }`}
                          >
                            {openCnt}
                          </span>
                        </td>
                        <td className="align-middle px-[14px] py-[10px] font-mono text-[11px] text-[#4a5070]">
                          {formatCurrency(row.totalOpenAmount)}
                        </td>
                        <td className="align-middle px-[14px] py-[10px]">
                          <span className={statusMeta.pillClass}>{statusMeta.label}</span>
                        </td>
                        <td className="align-middle px-[14px] py-[10px]">
                          <div className="flex items-center gap-[5px]">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/admin/tenants/${row.id}`);
                              }}
                              className="rounded-[6px] border border-[#252a3a] bg-[#141720] px-[10px] py-[3px] text-[10px] text-[#8892b0] transition-all hover:border-[#242840] hover:text-[#edf0f7]"
                            >
                              Öffnen →
                            </button>
                            <button
                              type="button"
                              onClick={(e) => handleDeleteTenant(e, row.id)}
                              className="rounded-[6px] border border-[#1c2035] bg-transparent px-[10px] py-[3px] text-[10px] text-[#4a5070] transition-all hover:border-[rgba(255,95,109,0.2)] hover:bg-[rgba(255,95,109,0.1)] hover:text-[#ff5f6d]"
                            >
                              Löschen
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="rounded-[8px] border border-[rgba(91,156,246,0.2)] bg-[rgba(91,156,246,0.08)] px-[16px] py-[10px] text-[11px] text-[#5b9cf6]">
          Mieter, Zimmer, Mietverhältnisse und Rechnungen werden aus der Backend-API geladen.
        </div>
      </div>
    </div>
  );
}

export default AdminTenantsPage;
