import React from "react";
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

function PlatformSidebar() {
  const navigate = useNavigate();
  const { logout, user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navLinkClass = createNavLinkClass(theme);

  const handleLogout = () => {
    logout().then(() => navigate("/admin/login", { replace: true }));
  };

  const sidebarShell =
    theme === "light"
      ? "box-border flex min-h-screen w-[280px] flex-col border-r border-black/[0.08] bg-white px-4 pb-4 pt-6 text-[#0f172a]"
      : "box-border flex min-h-screen w-[280px] flex-col border-r border-white/[0.07] bg-[#0c1018] px-4 pb-4 pt-6 text-[#eef2ff]";

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
        <h2 className="m-0 text-[18px] font-extrabold leading-tight tracking-[-0.02em]">
          <span className={logoLight}>Van</span>
          <span className="text-[#7aaeff]">tio</span>
          <span className={`ml-1.5 text-[13px] font-bold ${logoLight}`}>Platform</span>
        </h2>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span
            className={
              theme === "light"
                ? "inline-flex rounded-md border border-blue-500/20 bg-blue-500/[0.08] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-blue-800"
                : "inline-flex rounded-md border border-blue-400/20 bg-blue-500/[0.12] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#93b4ff]"
            }
          >
            Superadmin
          </span>
          <p
            className={
              theme === "light"
                ? "m-0 text-[10px] font-semibold uppercase tracking-wide text-[#64748b]"
                : "m-0 text-[10px] font-semibold uppercase tracking-wide text-[#6b7a9a]"
            }
          >
            Control Plane
          </p>
        </div>
      </div>

      <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
        <p
          className={
            theme === "light"
              ? "mb-1 px-1 text-[10px] font-black uppercase tracking-[1.2px] text-[#1e293b]"
              : "mb-1 px-1 text-[10px] font-black uppercase tracking-[1.2px] text-[#cbd5e1]"
          }
        >
          Navigation
        </p>
        <NavLink to="/platform" end className={navLinkClass}>
          📊 Übersicht
        </NavLink>
        <NavLink to="/platform/organizations" className={navLinkClass}>
          🏢 Organisationen
        </NavLink>
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
        <button type="button" onClick={toggleTheme} className={`mb-2 ${secondaryBtn}`}>
          {theme === "dark" ? "☀️ Hell" : "🌙 Dunkel"}
        </button>
        <button type="button" onClick={handleLogout} className={secondaryBtn}>
          Abmelden
        </button>
      </div>
    </div>
  );
}

export default PlatformSidebar;
