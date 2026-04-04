import React from "react";
import { Outlet, useLocation, Navigate, useNavigate } from "react-router-dom";
import AdminSidebar from "./AdminSidebar";
import { useAuth } from "../../contexts/AuthContext";
import { useTheme } from "../../contexts/ThemeContext";
import { getTokenPayload } from "../../authStore";

function AdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const isLoginPage = location.pathname === "/admin/login";
  const { isAuthenticated, loading, user, isImpersonating, impersonatedOrganizationName, exitImpersonation } =
    useAuth();
  const { theme } = useTheme();

  const isDark = theme === "dark";
  const shellClass = isDark
    ? "relative z-[1] bg-[#060b14] text-[#f8fafc]"
    : "relative z-[1] bg-[#f8fafc] text-[#0f172a]";
  const mainClass = isDark ? "bg-[#060b14]" : "bg-[#f8fafc]";
  const topBarClass = isDark
    ? "sticky top-0 z-10 shrink-0 border-b border-white/[0.08] bg-[#0b1220]"
    : "sticky top-0 z-10 shrink-0 border-b border-slate-200/80 bg-white";
  const scrollbarStyle = isDark
    ? { scrollbarColor: "rgba(255,255,255,0.12) #060b14" }
    : { scrollbarColor: "rgba(15,23,42,0.2) #f8fafc" };
  const loadingTextClass = isDark ? "text-[#93a4bf]" : "text-[#64748b]";

  const payload = getTokenPayload();
  const isImpersonatingFromToken = !!payload?.impersonated_by;

  const supportBanner =
    isImpersonating && !isLoginPage ? (
      <div
        className={
          isDark
            ? "border-b border-amber-500/25 bg-amber-500/[0.12] px-4 py-2.5 text-[13px] text-[#fde68a]"
            : "border-b border-amber-400/30 bg-amber-50 px-4 py-2.5 text-[13px] text-amber-950"
        }
      >
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <span className="flex min-w-0 flex-col gap-0.5">
            <span>
              🛠 Support-Modus
              {isImpersonatingFromToken && payload?.impersonator_email
                ? ` — von ${payload.impersonator_email}`
                : null}
            </span>
            <span
              className={
                isDark ? "text-[11px] text-[#fde68a]/80" : "text-[11px] text-amber-950/80"
              }
            >
              Organisation: <strong>{impersonatedOrganizationName || "—"}</strong>
            </span>
          </span>
          <button
            type="button"
            onClick={() =>
              exitImpersonation().then(() => navigate("/platform/organizations", { replace: true }))
            }
            className={
              isDark
                ? "shrink-0 rounded-[8px] border border-amber-400/35 bg-[#0b1220] px-3 py-1.5 text-[12px] font-semibold text-[#fde68a] hover:bg-[#111a2e]"
                : "shrink-0 rounded-[8px] border border-amber-600/25 bg-white px-3 py-1.5 text-[12px] font-semibold text-amber-950 hover:bg-amber-100/80"
            }
          >
            Zurück zur Plattform
          </button>
        </div>
      </div>
    ) : null;

  if (isLoginPage) {
    return (
      <div className={`flex min-h-screen ${shellClass}`}>
        <AdminSidebar />
        <div
          className={`flex min-h-screen flex-1 flex-col overflow-auto ${mainClass}`}
          style={scrollbarStyle}
        >
          {supportBanner}
          <header className={`${topBarClass} h-14`} aria-hidden />
          <div className="p-4 md:p-10">
            <Outlet />
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div
        className={`flex min-h-screen items-center justify-center ${shellClass} ${loadingTextClass}`}
      >
        <p>Lade …</p>
      </div>
    );
  }

  if (user && user.role === "platform_admin") {
    return <Navigate to="/platform" replace />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/admin/login" replace />;
  }

  return (
    <div className={`flex min-h-screen ${shellClass}`}>
      <AdminSidebar />
      <div
        className={`flex min-h-screen flex-1 flex-col overflow-auto ${mainClass}`}
        style={scrollbarStyle}
      >
        {supportBanner}
        <header className={`${topBarClass} h-14`} aria-hidden />
        <div className="p-4 md:p-10">
          <Outlet />
        </div>
      </div>
    </div>
  );
}

export default AdminLayout;
