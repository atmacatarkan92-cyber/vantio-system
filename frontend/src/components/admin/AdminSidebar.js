import React, { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { useTheme } from "../../contexts/ThemeContext";

function createNavLinkClass(theme) {
  return function navLinkClass({ isActive }) {
    const base =
      "block rounded-[8px] px-[9px] py-[7px] text-[11px] no-underline transition-colors";
    if (theme === "light") {
      if (isActive) {
        return `${base} border border-blue-500/25 bg-blue-500/10 font-semibold text-blue-800`;
      }
      return `${base} font-medium text-[#64748b] hover:bg-black/[0.05]`;
    }
    if (isActive) {
      return `${base} border border-blue-500/[0.15] bg-blue-500/[0.12] font-semibold text-[#8fb3ff]`;
    }
    return `${base} font-medium text-[#6b7a9a] hover:bg-white/[0.04]`;
  };
}

function createNavSubLinkClass(theme) {
  const inner = createNavLinkClass(theme);
  return function navSubLinkClass(args) {
    return `${inner(args)} ml-2`;
  };
}

function Bereich({ title, children, defaultOpen = true, theme }) {
  const [open, setOpen] = useState(defaultOpen);
  const titleClass =
    theme === "light"
      ? "text-[9px] font-bold uppercase tracking-[1.5px] text-[#64748b]"
      : "text-[9px] font-bold uppercase tracking-[1.5px] text-[#4a5680]";
  const chevronClass =
    theme === "light" ? "text-[11px] text-[#64748b]" : "text-[11px] text-[#6b7a9a]";

  return (
    <div className="mb-2">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between bg-transparent px-2 pb-1 pt-3 text-left"
        style={{ cursor: "pointer" }}
      >
        <span className={titleClass}>{title}</span>
        <span className={chevronClass}>{open ? "−" : "+"}</span>
      </button>

      {open && <div className="mt-1 grid gap-0.5">{children}</div>}
    </div>
  );
}

function userInitials(user) {
  if (!user) return "?";
  const n = String(user.full_name || "").trim();
  if (n) {
    const parts = n.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0][0] || ""}${parts[parts.length - 1][0] || ""}`.toUpperCase();
    }
    return n.slice(0, 2).toUpperCase();
  }
  const e = String(user.email || "").trim();
  return e.slice(0, 2).toUpperCase() || "?";
}

function AdminSidebar() {
  const navigate = useNavigate();
  const { logout, user } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const navLinkClass = createNavLinkClass(theme);
  const navSubLinkClass = createNavSubLinkClass(theme);

  const handleLogout = () => {
    logout().then(() => navigate("/admin/login", { replace: true }));
  };

  const sidebarShell =
    theme === "light"
      ? "box-border flex min-h-screen w-[280px] flex-col border-r border-black/[0.08] bg-white px-4 pb-4 pt-6 text-[#0f172a]"
      : "box-border flex min-h-screen w-[280px] flex-col border-r border-white/[0.07] bg-[#0c1018] px-4 pb-4 pt-6 text-[#eef2ff]";

  const orgPillClass =
    theme === "light"
      ? "mt-3 flex max-w-full items-center gap-2 rounded-full border border-blue-500/25 bg-blue-500/10 px-2.5 py-1 text-[10px] font-semibold text-blue-800"
      : "mt-3 flex max-w-full items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/10 px-2.5 py-1 text-[10px] font-semibold text-[#8fb3ff]";

  const footerBorder =
    theme === "light" ? "border-t border-black/[0.08]" : "border-t border-white/[0.07]";

  const secondaryBtn =
    theme === "light"
      ? "w-full cursor-pointer rounded-[8px] border border-black/[0.1] bg-transparent px-3 py-2 text-[13px] font-semibold text-[#64748b] hover:bg-black/[0.04]"
      : "w-full cursor-pointer rounded-[8px] border border-white/[0.1] bg-transparent px-3 py-2 text-[13px] font-semibold text-[#8090b0] hover:bg-white/[0.04]";

  const logoLight = theme === "light" ? "text-[#0f172a]" : "text-[#eef2ff]";

  return (
    <div className={sidebarShell}>
      <div className="mb-6 shrink-0">
        <h2 className="m-0 text-[20px] font-extrabold tracking-[-0.02em]">
          <span className={logoLight}>Van</span>
          <span className="text-[#7aaeff]">tio</span>
        </h2>
        {user ? (
          <div className={orgPillClass} title={user.organization_id}>
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-green-400" aria-hidden />
            <span className="min-w-0 truncate font-mono text-[10px]">{user.organization_id}</span>
          </div>
        ) : null}
      </div>

      <nav className="flex min-h-0 flex-1 flex-col gap-0 overflow-y-auto">
        <Bereich title="Dashboard" defaultOpen={true} theme={theme}>
          <NavLink to="/admin" end className={navLinkClass}>
            📊 Unternehmensübersicht
          </NavLink>

          <NavLink to="/admin/operations" className={navSubLinkClass}>
            🏠 Co-Living-Dashboard
          </NavLink>

          <NavLink to="/admin/business-apartments-dashboard" className={navSubLinkClass}>
            🏢 Business-Apartment-Dashboard
          </NavLink>
        </Bereich>

        <Bereich title="Betrieb" defaultOpen={true} theme={theme}>
          <NavLink to="/admin/objekte-dashboard" className={navLinkClass}>
            🗂️ Objekte-Dashboard
          </NavLink>

          <NavLink to="/admin/properties" className={navSubLinkClass}>
            🚪 Liegenschaften
          </NavLink>

          <NavLink to="/admin/apartments" className={navSubLinkClass}>
            🚪 Apartments / Units
          </NavLink>

          <NavLink to="/admin/rooms" className={navSubLinkClass}>
            🛏️ Co-Living-Zimmer
          </NavLink>

          <NavLink to="/admin/occupancy" className={navSubLinkClass}>
            📅 Belegung
          </NavLink>

          <NavLink to="/admin/listings" className={navSubLinkClass}>
            🌐 Website Listings
          </NavLink>
        </Bereich>

        <Bereich title="Finanzen" defaultOpen={true} theme={theme}>
          <NavLink to="/admin/invoices" className={navLinkClass}>
            🧾 Rechnungen
          </NavLink>

          <NavLink to="/admin/revenue" className={navSubLinkClass}>
            💰 Einnahmen
          </NavLink>

          <NavLink to="/admin/ausgaben" className={navSubLinkClass}>
            💸 Ausgaben
          </NavLink>
        </Bereich>

        <Bereich title="Analyse" defaultOpen={false} theme={theme}>
          <NavLink to="/admin/performance" className={navLinkClass}>
            📈 Performance
          </NavLink>

          <NavLink to="/admin/break-even" className={navSubLinkClass}>
            ⚖️ Break-Even
          </NavLink>

          <NavLink to="/admin/prognose" className={navSubLinkClass}>
            🔮 Prognose
          </NavLink>
        </Bereich>

        <Bereich title="CRM" defaultOpen={false} theme={theme}>
          <NavLink to="/admin/tenants" className={navLinkClass}>
            👥 Mieter
          </NavLink>

          <NavLink to="/admin/users" className={navSubLinkClass}>
            👤 Users
          </NavLink>

          <NavLink to="/admin/landlords" className={navSubLinkClass}>
            🏦 Verwaltungen
          </NavLink>

          <NavLink to="/admin/bewirtschafter" className={navSubLinkClass}>
            👔 Bewirtschafter
          </NavLink>

          <NavLink to="/admin/owners" className={navSubLinkClass}>
            🔑 Eigentümer
          </NavLink>

          <NavLink to="/admin/leads" className={navSubLinkClass}>
            🎯 Leads
          </NavLink>
        </Bereich>
      </nav>

      <div className={`mt-auto shrink-0 pt-4 ${footerBorder}`}>
        {user ? (
          <div className="mb-3 flex items-center gap-3 px-1">
            <div
              className={
                theme === "light"
                  ? "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-black/[0.1] bg-[#f1f5f9] text-[11px] font-bold text-[#0f172a]"
                  : "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/[0.1] bg-white/[0.06] text-[11px] font-bold text-[#eef2ff]"
              }
              aria-hidden
            >
              {userInitials(user)}
            </div>
            <div className="min-w-0 flex-1">
              <div
                className={
                  theme === "light"
                    ? "truncate text-[12px] font-semibold text-[#0f172a]"
                    : "truncate text-[12px] font-semibold text-[#eef2ff]"
                }
              >
                {user.full_name || "—"}
              </div>
              <div
                className={
                  theme === "light"
                    ? "truncate text-[10px] text-[#64748b]"
                    : "truncate text-[10px] text-[#6b7a9a]"
                }
              >
                {user.email}
              </div>
            </div>
          </div>
        ) : null}
        <button
          type="button"
          onClick={toggleTheme}
          className={`mb-2 ${secondaryBtn}`}
        >
          {theme === "dark" ? "☀️ Hell" : "🌙 Dunkel"}
        </button>
        <button
          type="button"
          onClick={handleLogout}
          className={secondaryBtn}
        >
          Abmelden
        </button>
      </div>
    </div>
  );
}

export default AdminSidebar;
