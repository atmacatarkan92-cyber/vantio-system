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
  const pillBase =
    "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-bold";

  if (
    normalized === "active" ||
    normalized === "aktiv" ||
    normalized === "belegt"
  ) {
    return {
      label: "Aktiv",
      pillClass:
        "inline-flex items-center rounded-full border border-emerald-300 bg-emerald-100 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:border-emerald-500/20 dark:text-emerald-400",
    };
  }

  if (
    normalized === "reserved" ||
    normalized === "reserviert"
  ) {
    return {
      label: "Reserviert",
      pillClass: `${pillBase} border-amber-500/20 bg-amber-500/10 text-amber-400`,
    };
  }

  if (
    normalized === "ended" ||
    normalized === "beendet" ||
    normalized === "move_out" ||
    normalized === "ausgezogen"
  ) {
    return {
      label: "Ausgezogen",
      pillClass: `${pillBase} border-red-500/20 bg-red-500/10 text-red-400`,
    };
  }

  if (normalized === "inactive" || normalized === "inaktiv") {
    return {
      label: "Inaktiv",
      pillClass: `${pillBase} border-black/10 dark:border-white/[0.1] bg-slate-100 dark:bg-white/[0.06] text-[#64748b] dark:text-[#6b7a9a]`,
    };
  }

  return {
    label: status || "Offen",
    pillClass: `${pillBase} border-black/10 dark:border-white/[0.1] bg-slate-100 dark:bg-white/[0.06] text-[#64748b] dark:text-[#6b7a9a]`,
  };
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
      <div className="min-h-screen bg-[#f8fafc] p-6 text-[#64748b] [color-scheme:light] dark:bg-[#07090f] dark:text-[#6b7a9a] dark:[color-scheme:dark]">
        Lade Mieter, Zimmer, Mietverhältnisse und Rechnungen …
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-[#f8fafc] p-6 text-[#0f172a] [color-scheme:light] dark:bg-[#07090f] dark:text-[#eef2ff] dark:[color-scheme:dark]">
        <div className="rounded-[14px] border border-red-500/20 bg-red-500/10 px-4 py-3 text-[14px] text-[#f87171]">
          <strong className="font-semibold text-[#f87171]">Fehler beim Laden:</strong> {loadError}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] text-[#0f172a] [color-scheme:light] dark:bg-[#07090f] dark:text-[#eef2ff] dark:[color-scheme:dark]">
      <div className="mx-auto grid max-w-[min(1400px,100%)] gap-6 p-6">
        <TenantCreateModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            reloadData();
          }}
        />
        <div>
          <div className="mb-2 text-[9px] font-bold uppercase tracking-[1px] text-[#64748b] dark:text-[#6b7a9a]">Vantio</div>

          {deleteError ? (
            <div className="mb-4 rounded-[10px] border border-red-500/20 bg-red-500/10 px-4 py-3 text-[14px] text-[#f87171]">
              {deleteError}
            </div>
          ) : null}

          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="m-0 text-[22px] font-bold text-[#0f172a] dark:text-[#eef2ff]">Mieter</h2>
              <p className="mt-2 max-w-[560px] text-[12px] text-[#64748b] dark:text-[#6b7a9a]">
                CRM-Übersicht: Mieter durchsuchen, anlegen und bearbeiten. Mietverhältnisse
                und weitere Module folgen.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="cursor-pointer rounded-[8px] border-none bg-gradient-to-r from-[#5b8cff] to-[#7c5cfc] px-[18px] py-3 text-[15px] font-semibold text-white"
            >
              Neuer Mieter
            </button>
          </div>
        </div>

        <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
          <div className="rounded-[14px] border border-black/10 border-t-4 dark:border-white/[0.07] border-t-slate-500 bg-white dark:bg-[#141824] p-5">
            <div className="mb-2 text-[9px] font-bold uppercase tracking-[1px] text-[#64748b] dark:text-[#6b7a9a]">
              Mieter gesamt
            </div>
            <div className="text-[24px] font-bold text-[#0f172a] dark:text-[#eef2ff]">{summary.totalCount}</div>
            <div className="mt-2 text-[11px] text-[#64748b] dark:text-[#6b7a9a]">Alle erfassten Mieter</div>
          </div>

          <div className="rounded-[14px] border border-black/10 border-t-4 dark:border-white/[0.07] border-t-green-500 bg-white dark:bg-[#141824] p-5">
            <div className="mb-2 text-[9px] font-bold uppercase tracking-[1px] text-[#64748b] dark:text-[#6b7a9a]">
              Aktive Mieter
            </div>
            <div className="text-[24px] font-bold text-[#0f172a] dark:text-[#eef2ff]">{summary.activeCount}</div>
            <div className="mt-2 text-[11px] text-[#64748b] dark:text-[#6b7a9a]">Aktuell laufende Mietverhältnisse</div>
          </div>

          <div className="rounded-[14px] border border-black/10 border-t-4 dark:border-white/[0.07] border-t-amber-500 bg-white dark:bg-[#141824] p-5">
            <div className="mb-2 text-[9px] font-bold uppercase tracking-[1px] text-[#64748b] dark:text-[#6b7a9a]">
              Reserviert
            </div>
            <div className="text-[24px] font-bold text-[#0f172a] dark:text-[#eef2ff]">{summary.reservedCount}</div>
            <div className="mt-2 text-[11px] text-[#64748b] dark:text-[#6b7a9a]">Einzug geplant</div>
          </div>

          <div className="rounded-[14px] border border-black/10 border-t-4 dark:border-white/[0.07] border-t-red-500 bg-white dark:bg-[#141824] p-5">
            <div className="mb-2 text-[9px] font-bold uppercase tracking-[1px] text-[#64748b] dark:text-[#6b7a9a]">
              Offene Rechnungen
            </div>
            <div className="text-[24px] font-bold text-[#0f172a] dark:text-[#eef2ff]">{summary.totalOpenInvoices}</div>
            <div className="mt-2 text-[11px] text-[#64748b] dark:text-[#6b7a9a]">{formatCurrency(summary.totalOpenAmount)}</div>
          </div>
        </div>

        <div className="overflow-x-auto rounded-[14px] border border-black/10 dark:border-white/[0.07] bg-white dark:bg-[#141824] p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h3 className="m-0 text-[16px] font-bold text-[#0f172a] dark:text-[#eef2ff]">Mieterübersicht</h3>

            <div className="flex flex-wrap items-center gap-2.5">
              <input
                type="search"
                placeholder="Suche: Name, E-Mail, Telefon …"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="min-w-[200px] rounded-[8px] border border-black/10 dark:border-white/[0.08] bg-slate-100 dark:bg-[#111520] px-3 py-2.5 text-[13px] text-[#0f172a] dark:text-[#eef2ff] placeholder:text-[#64748b] dark:placeholder:text-[#6b7a9a]"
                aria-label="Mieter suchen"
              />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-[8px] border border-black/10 dark:border-white/[0.08] bg-slate-100 dark:bg-[#111520] px-3 py-2.5 text-[13px] text-[#0f172a] dark:text-[#eef2ff]"
                aria-label="Status filtern"
              >
                <option value="all">Alle Status</option>
                <option value="active">Aktiv</option>
                <option value="reserved">Reserviert</option>
                <option value="ended">Ausgezogen</option>
                <option value="open">Offen / Sonstige</option>
              </select>
            </div>
          </div>

          <div className="mb-3 text-[13px] text-[#64748b] dark:text-[#6b7a9a]">
            {filteredRows.length === rows.length
              ? `${rows.length} Einträge`
              : `${filteredRows.length} von ${rows.length} Einträgen (gefiltert)`}
          </div>

          {rows.length === 0 ? (
            <p className="text-[13px] text-[#64748b] dark:text-[#6b7a9a]">Keine Mieter erfasst.</p>
          ) : filteredRows.length === 0 ? (
            <p className="text-[13px] text-[#64748b] dark:text-[#6b7a9a]">Keine Mieter für diese Filter.</p>
          ) : (
            <table className="w-full border-collapse text-[13px] text-[#0f172a] dark:text-[#eef2ff]">
              <thead className="bg-slate-100 dark:bg-[#111520]">
                <tr className="text-left">
                  <th className="px-3 py-3 text-[9px] font-bold uppercase tracking-[0.8px] text-[#64748b] dark:text-[#6b7a9a]">
                    Mieter
                  </th>
                  <th className="px-3 py-3 text-[9px] font-bold uppercase tracking-[0.8px] text-[#64748b] dark:text-[#6b7a9a]">
                    Kontakt
                  </th>
                  <th className="px-3 py-3 text-[9px] font-bold uppercase tracking-[0.8px] text-[#64748b] dark:text-[#6b7a9a]">
                    Unit
                  </th>
                  <th className="px-3 py-3 text-[9px] font-bold uppercase tracking-[0.8px] text-[#64748b] dark:text-[#6b7a9a]">
                    Zimmer
                  </th>
                  <th className="px-3 py-3 text-[9px] font-bold uppercase tracking-[0.8px] text-[#64748b] dark:text-[#6b7a9a]">
                    Start
                  </th>
                  <th className="px-3 py-3 text-[9px] font-bold uppercase tracking-[0.8px] text-[#64748b] dark:text-[#6b7a9a]">
                    Ende
                  </th>
                  <th className="px-3 py-3 text-[9px] font-bold uppercase tracking-[0.8px] text-[#64748b] dark:text-[#6b7a9a]">
                    Einnahmen / Monat (Äquivalent)
                  </th>
                  <th className="px-3 py-3 text-[9px] font-bold uppercase tracking-[0.8px] text-[#64748b] dark:text-[#6b7a9a]">
                    Rechnungen offen
                  </th>
                  <th className="px-3 py-3 text-[9px] font-bold uppercase tracking-[0.8px] text-[#64748b] dark:text-[#6b7a9a]">
                    Offener Betrag
                  </th>
                  <th className="px-3 py-3 text-[9px] font-bold uppercase tracking-[0.8px] text-[#64748b] dark:text-[#6b7a9a]">
                    Status
                  </th>
                  <th className="min-w-[180px] px-3 py-3 text-[9px] font-bold uppercase tracking-[0.8px] text-[#64748b] dark:text-[#6b7a9a]">
                    Aktion
                  </th>
                </tr>
              </thead>

              <tbody>
                {filteredRows.map((row) => {
                  const statusMeta = getStatusMeta(row.status);

                  return (
                    <tr
                      key={row.id}
                      className="cursor-pointer border-b border-black/10 dark:border-white/[0.05]"
                      onClick={() => navigate(`/admin/tenants/${row.id}`)}
                    >
                      <td className="px-3 py-3 align-top">
                        <div className="text-[13px] font-medium text-[#0f172a] dark:text-[#eef2ff]">{row.fullName}</div>
                        {row.tenancyRoleLabel ? (
                          <div className="mt-1">
                            <span className="inline-flex items-center rounded-full border border-slate-300/80 bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:border-white/[0.12] dark:bg-white/[0.06] dark:text-[#94a3b8]">
                              {row.tenancyRoleLabel}
                            </span>
                          </div>
                        ) : null}
                        {row.notes ? (
                          <div className="mt-1 text-[12px] text-[#64748b] dark:text-[#6b7a9a]">{row.notes}</div>
                        ) : null}
                      </td>

                      <td className="px-3 py-3 align-top">
                        <div className="text-[13px] font-medium text-[#0f172a] dark:text-[#eef2ff]">{row.email}</div>
                        <div className="mt-1 text-[12px] text-[#64748b] dark:text-[#6b7a9a]">{row.phone}</div>
                      </td>

                      <td className="px-3 py-3 align-top">
                        {row.unitId && row.unitId !== "—" ? (
                          <Link
                            to={`/admin/units/${encodeURIComponent(row.unitId)}`}
                            onClick={(e) => e.stopPropagation()}
                            className="text-blue-700 dark:text-blue-400 font-medium hover:underline text-[13px]"
                          >
                            {row.unitAddress}
                          </Link>
                        ) : (
                          <div className="text-[13px] font-medium text-[#0f172a] dark:text-[#eef2ff]">
                            {row.unitAddress}
                          </div>
                        )}
                        <div className="mt-0.5 text-[10px] text-[#64748b] dark:text-[#6b7a9a]">{row.unitId}</div>
                      </td>

                      <td className="px-3 py-3 align-top text-[13px] font-medium text-[#0f172a] dark:text-[#eef2ff]">
                        {row.roomName}
                      </td>
                      <td className="px-3 py-3 align-top text-[13px] font-medium text-[#0f172a] dark:text-[#eef2ff]">
                        {formatDate(row.startDate)}
                      </td>
                      <td className="px-3 py-3 align-top text-[13px] font-medium text-[#0f172a] dark:text-[#eef2ff]">
                        {formatDate(row.endDate)}
                      </td>
                      <td
                        className={`px-3 py-3 align-top text-[13px] font-semibold ${
                          row.monthlyRent == null
                            ? "text-[#64748b] dark:text-[#6b7a9a]"
                            : "text-emerald-600 dark:text-emerald-400"
                        }`}
                      >
                        {row.monthlyRent == null ? "—" : formatCurrency(row.monthlyRent)}
                      </td>
                      <td className="px-3 py-3 align-top text-[13px] font-medium text-[#0f172a] dark:text-[#eef2ff]">
                        {row.openInvoicesCount}
                      </td>
                      <td className="px-3 py-3 align-top text-[13px] font-medium text-[#0f172a] dark:text-[#eef2ff]">
                        {formatCurrency(row.totalOpenAmount)}
                      </td>
                      <td className="px-3 py-3 align-top">
                        <span className={statusMeta.pillClass}>{statusMeta.label}</span>
                      </td>
                      <td className="px-3 py-3 align-top">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/admin/tenants/${row.id}`);
                            }}
                            className="rounded-[8px] border border-black/10 bg-transparent px-3 py-1.5 text-[13px] font-semibold text-[#64748b] hover:bg-slate-100 dark:border-white/[0.1] dark:text-[#8090b0] dark:hover:bg-white/[0.04]"
                          >
                            Öffnen
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleDeleteTenant(e, row.id)}
                            className="rounded-[8px] border border-red-300 bg-red-50 px-3 py-1.5 text-[13px] font-semibold text-red-700 hover:bg-red-100 dark:border-red-500/20 dark:bg-red-500/10 dark:text-[#f87171] dark:hover:bg-red-500/15"
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
          )}
        </div>

        <div className="rounded-[10px] border border-blue-500/[0.12] bg-blue-500/[0.06] px-5 py-4 text-[14px] font-medium text-[#7aaeff]">
          Mieter, Zimmer, Mietverhältnisse und Rechnungen werden aus der Backend-API geladen.
        </div>
      </div>
    </div>
  );
}

export default AdminTenantsPage;
