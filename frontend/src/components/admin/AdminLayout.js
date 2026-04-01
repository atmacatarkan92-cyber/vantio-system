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
      <div className="flex min-h-screen bg-[#07090f] text-[#eef2ff]">
        <AdminSidebar />
        <div
          className="flex min-h-screen flex-1 flex-col overflow-auto bg-[#07090f] p-4 md:p-10"
          style={{ scrollbarColor: "rgba(255,255,255,0.12) #07090f" }}
        >
          <Outlet />
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#07090f] text-[#6b7a9a]">
        <p>Lade …</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/admin/login" replace />;
  }

  return (
    <div className="flex min-h-screen bg-[#07090f] text-[#eef2ff]">
      <AdminSidebar />
      <div
        className="flex min-h-screen flex-1 flex-col overflow-auto bg-[#07090f] p-4 md:p-10"
        style={{ scrollbarColor: "rgba(255,255,255,0.12) #07090f" }}
      >
        <Outlet />
      </div>
    </div>
  );
}

export default AdminLayout;
