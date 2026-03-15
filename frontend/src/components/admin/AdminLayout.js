import React from "react";
import { Outlet, useLocation, Navigate } from "react-router-dom";
import AdminSidebar from "./AdminSidebar";
import { useAuth } from "../../contexts/AuthContext";

function AdminLayout() {
  const location = useLocation();
  const isLoginPage = location.pathname === "/admin/login";
  const { isAuthenticated, loading } = useAuth();

  if (isLoginPage) {
    return (
      <div style={{ display: "flex", minHeight: "100vh" }}>
        <AdminSidebar />
        <div style={{ flex: 1, padding: "40px" }}>
          <h1>FeelAtHomeNow Admin</h1>
          <Outlet />
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center" }}>
        <p>Lade …</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/admin/login" replace />;
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <AdminSidebar />
      <div style={{ flex: 1, padding: "40px" }}>
        <h1>FeelAtHomeNow Admin</h1>
        <Outlet />
      </div>
    </div>
  );
}

export default AdminLayout;
