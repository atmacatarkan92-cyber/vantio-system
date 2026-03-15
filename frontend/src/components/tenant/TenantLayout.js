import React from "react";
import { Outlet, useLocation, Navigate, Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";

const navStyle = {
  display: "flex",
  gap: "16px",
  marginBottom: "24px",
  padding: "12px 0",
  borderBottom: "1px solid #E5E7EB",
};

const linkStyle = (active) => ({
  color: active ? "#EA580C" : "#475569",
  fontWeight: active ? 700 : 500,
  textDecoration: "none",
});

function TenantLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const isLoginPage = location.pathname === "/tenant/login";
  const { isTenantAuthenticated, loading, logout } = useAuth();

  if (isLoginPage) {
    return (
      <div style={{ minHeight: "100vh", padding: "24px" }}>
        <Outlet />
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p>Lade …</p>
      </div>
    );
  }

  if (!isTenantAuthenticated) {
    return <Navigate to="/tenant/login" replace />;
  }

  const handleLogout = () => {
    logout().then(() => navigate("/tenant/login", { replace: true }));
  };

  return (
    <div style={{ minHeight: "100vh", padding: "24px", maxWidth: "900px", margin: "0 auto" }}>
      <nav style={navStyle}>
        <Link to="/tenant" style={linkStyle(location.pathname === "/tenant" || location.pathname === "/tenant/")}>
          Übersicht
        </Link>
        <Link to="/tenant/tenancies" style={linkStyle(location.pathname === "/tenant/tenancies")}>
          Mietverhältnisse
        </Link>
        <Link to="/tenant/invoices" style={linkStyle(location.pathname === "/tenant/invoices")}>
          Rechnungen
        </Link>
        <button
          type="button"
          onClick={handleLogout}
          style={{ marginLeft: "auto", padding: "6px 12px", cursor: "pointer", color: "#64748B" }}
        >
          Abmelden
        </button>
      </nav>
      <Outlet />
    </div>
  );
}

export default TenantLayout;
