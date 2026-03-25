import React, { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";

function hauptLinkStyle({ isActive }) {
  return {
    display: "block",
    padding: "10px 12px",
    borderRadius: "12px",
    textDecoration: "none",
    fontSize: "14px",
    fontWeight: isActive ? 700 : 500,
    color: "#FFFFFF",
    background: isActive ? "rgba(255,255,255,0.12)" : "transparent",
  };
}

function unterLinkStyle({ isActive }) {
  return {
    display: "block",
    padding: "8px 12px",
    borderRadius: "10px",
    textDecoration: "none",
    fontSize: "13px",
    fontWeight: isActive ? 700 : 500,
    color: isActive ? "#FFFFFF" : "rgba(255,255,255,0.78)",
    background: isActive ? "rgba(255,255,255,0.10)" : "transparent",
    marginLeft: "8px",
  };
}

function Bereich({ title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div style={{ marginBottom: "14px" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "transparent",
          border: "none",
          color: "#FFFFFF",
          padding: "10px 12px",
          borderRadius: "12px",
          cursor: "pointer",
          fontSize: "15px",
          fontWeight: 700,
          textAlign: "left",
        }}
      >
        <span>{title}</span>
        <span style={{ opacity: 0.8 }}>{open ? "−" : "+"}</span>
      </button>

      {open && (
        <div style={{ display: "grid", gap: "6px", marginTop: "4px" }}>
          {children}
        </div>
      )}
    </div>
  );
}

function AdminSidebar() {
  const navigate = useNavigate();
  const { logout } = useAuth();

  const handleLogout = () => {
    logout().then(() => navigate("/admin/login", { replace: true }));
  };

  return (
    <div
      style={{
        width: "280px",
        minHeight: "100vh",
        background: "#071633",
        color: "#FFFFFF",
        padding: "24px 16px",
        boxSizing: "border-box",
        borderRight: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <div style={{ marginBottom: "28px" }}>
        <h2
          style={{
            fontSize: "20px",
            fontWeight: 800,
            margin: 0,
            letterSpacing: "-0.02em",
          }}
        >
          FeelAtHomeNow
        </h2>
      </div>

      <nav style={{ display: "grid", gap: "6px" }}>
        <Bereich title="Dashboard" defaultOpen={true}>
          <NavLink to="/admin" end style={hauptLinkStyle}>
            Unternehmensübersicht
          </NavLink>

          <NavLink to="/admin/operations" style={unterLinkStyle}>
            Co-Living-Dashboard
          </NavLink>

          <NavLink to="/admin/business-apartments-dashboard" style={unterLinkStyle}>
            Business-Apartment-Dashboard
          </NavLink>
        </Bereich>

        <Bereich title="Betrieb" defaultOpen={true}>
          <NavLink to="/admin/objekte-dashboard" style={hauptLinkStyle}>
            Objekte-Dashboard
          </NavLink>

          <NavLink to="/admin/properties" style={unterLinkStyle}>
            Liegenschaften
          </NavLink>

          <NavLink to="/admin/apartments" style={unterLinkStyle}>
            Apartments / Units
          </NavLink>

          <NavLink to="/admin/rooms" style={unterLinkStyle}>
            Zimmer
          </NavLink>

          <NavLink to="/admin/occupancy" style={unterLinkStyle}>
            Belegung
          </NavLink>

          <NavLink to="/admin/listings" style={unterLinkStyle}>
            Website Listings
          </NavLink>
        </Bereich>

        <Bereich title="Finanzen" defaultOpen={true}>
          <NavLink to="/admin/invoices" style={hauptLinkStyle}>
            Rechnungen
          </NavLink>

          <NavLink to="/admin/revenue" style={unterLinkStyle}>
            Einnahmen
          </NavLink>

          <NavLink to="/admin/ausgaben" style={unterLinkStyle}>
            Ausgaben
          </NavLink>
        </Bereich>

        <Bereich title="Analyse" defaultOpen={false}>
          <NavLink to="/admin/performance" style={hauptLinkStyle}>
            Performance
          </NavLink>

          <NavLink to="/admin/break-even" style={unterLinkStyle}>
            Break-Even
          </NavLink>

          <NavLink to="/admin/prognose" style={unterLinkStyle}>
            Prognose
          </NavLink>
        </Bereich>

        <Bereich title="CRM" defaultOpen={false}>
          <NavLink to="/admin/tenants" style={hauptLinkStyle}>
            Mieter
          </NavLink>

          <NavLink to="/admin/users" style={unterLinkStyle}>
            Users
          </NavLink>

          <NavLink to="/admin/landlords" style={unterLinkStyle}>
            Verwaltungen
          </NavLink>

          <NavLink to="/admin/bewirtschafter" style={unterLinkStyle}>
            Bewirtschafter
          </NavLink>

          <NavLink to="/admin/leads" style={unterLinkStyle}>
            Leads
          </NavLink>
        </Bereich>

        <div style={{ marginTop: "24px", paddingTop: "16px", borderTop: "1px solid rgba(255,255,255,0.12)" }}>
          <button
            type="button"
            onClick={handleLogout}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: "12px",
              border: "1px solid rgba(255,255,255,0.2)",
              background: "transparent",
              color: "#FFFFFF",
              fontSize: "14px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Abmelden
          </button>
        </div>
      </nav>
    </div>
  );
}

export default AdminSidebar;