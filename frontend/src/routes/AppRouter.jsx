import React, { lazy, Suspense } from "react";
import { Routes, Route, useLocation, Navigate } from "react-router-dom";
import { Toaster } from "../components/ui/sonner";
import Header from "../components/Header";
import Footer from "../components/Footer";
import ChatWidget from "../components/ChatWidget";
import AdminLayout from "../components/admin/AdminLayout";
import PlatformLayout from "../components/platform/PlatformLayout";
import { AuthProvider } from "../contexts/AuthContext";

import AdminUebersichtPage from "../pages/admin/AdminUebersichtPage";
import AdminCoLivingDashboardPage from "../pages/admin/AdminCoLivingDashboardPage";
import AdminApartmentsPage from "../pages/admin/AdminApartmentsPage";
import AdminLeadsPage from "../pages/admin/AdminLeadsPage";
import AdminTenantsPage from "../pages/admin/AdminTenantsPage";
import AdminTenantDetailPage from "../pages/admin/AdminTenantDetailPage";
import AdminLandlordsPage from "../pages/admin/AdminLandlordsPage";
import AdminLandlordDetailPage from "../pages/admin/AdminLandlordDetailPage";
import AdminUnitDetailPage from "../pages/admin/AdminUnitDetailPage";
import AdminInvoicesPage from "../pages/admin/AdminInvoicesPage";
import AdminInvoiceDetailPage from "../pages/admin/AdminInvoiceDetailPage";
import AdminBusinessApartmentsDashboardPage from "../pages/admin/AdminBusinessApartmentsDashboardPage";
import AdminPortfolioMapPage from "../pages/admin/AdminPortfolioMapPage";
import AdminInventoryPage from "../pages/admin/AdminInventoryPage";
import AdminInventoryDetailPage from "../pages/admin/AdminInventoryDetailPage";
import AdminObjektePage from "../pages/admin/AdminObjektePage";
import AdminRoomsPage from "../pages/admin/AdminRoomsPage";
import AdminOccupancyPage from "../pages/admin/AdminOccupancyPage";
import AdminRevenuePage from "../pages/admin/AdminRevenuePage";
import AdminExpensesPage from "../pages/admin/AdminExpensesPage";
import AdminPerformancePage from "../pages/admin/AdminPerformancePage";
import AdminBreakEvenPage from "../pages/admin/AdminBreakEvenPage";
import AdminForecastPage from "../pages/admin/AdminForecastPage";
import AdminPropertyManagersPage from "../pages/admin/AdminPropertyManagersPage";
import AdminPropertyManagerDetailPage from "../pages/admin/AdminPropertyManagerDetailPage";
import AdminOwnersPage from "../pages/admin/AdminOwnersPage";
import AdminOwnerDetailPage from "../pages/admin/AdminOwnerDetailPage";
import AdminListingsPage from "../pages/admin/AdminListingsPage";
import AdminPropertiesPage from "../pages/admin/AdminPropertiesPage";
import AdminUsersPage from "../pages/admin/AdminUsersPage";
import AdminUserDetailPage from "../pages/admin/AdminUserDetailPage";
import PlatformDashboardPage from "../pages/platform/PlatformDashboardPage";
import PlatformOrganizationsPage from "../pages/platform/PlatformOrganizationsPage";
import PlatformOrganizationDetailPage from "../pages/platform/PlatformOrganizationDetailPage";
import PlatformAuditLogsPage from "../pages/platform/PlatformAuditLogsPage";
import AdminLoginPage from "../pages/admin/AdminLoginPage";
import TenantLayout from "../components/tenant/TenantLayout";
import TenantLoginPage from "../pages/tenant/TenantLoginPage";
import TenantOverviewPage from "../pages/tenant/TenantOverviewPage";
import TenantTenanciesPage from "../pages/tenant/TenantTenanciesPage";
import TenantInvoicesPage from "../pages/tenant/TenantInvoicesPage";
import ResetPasswordPage from "../pages/ResetPasswordPage";
import ForgotPasswordPage from "../pages/ForgotPasswordPage";
import VerifyEmailPage from "../pages/VerifyEmailPage";
import LandlordLayout from "../components/landlord/LandlordLayout";
import LandlordLoginPage from "../pages/landlord/LandlordLoginPage";
import LandlordOverviewPage from "../pages/landlord/LandlordOverviewPage";
import LandlordPropertiesPage from "../pages/landlord/LandlordPropertiesPage";
import LandlordUnitsPage from "../pages/landlord/LandlordUnitsPage";
import LandlordTenanciesPage from "../pages/landlord/LandlordTenanciesPage";
import LandlordInvoicesPage from "../pages/landlord/LandlordInvoicesPage";

const HomePage = lazy(() => import("../pages/HomePage"));
const ApartmentsPage = lazy(() => import("../pages/ApartmentsPage"));
const ApartmentDetailPage = lazy(() => import("../pages/ApartmentDetailPage"));
const ForCompaniesPage = lazy(() => import("../pages/ForCompaniesPage"));
const ForPropertyManagersPage = lazy(() => import("../pages/ForPropertyManagersPage"));
const AboutPage = lazy(() => import("../pages/AboutPage"));
const ContactPage = lazy(() => import("../pages/ContactPage"));

function ScrollToTop() {
  const { pathname } = useLocation();
  React.useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export default function AppRouter() {
  const location = useLocation();
  const isAdminRoute = location.pathname.startsWith("/admin");
  const isPlatformRoute = location.pathname.startsWith("/platform");
  const isTenantRoute = location.pathname.startsWith("/tenant");
  const isLandlordRoute = location.pathname.startsWith("/landlord");
  const showPublicUI =
    !isAdminRoute && !isPlatformRoute && !isTenantRoute && !isLandlordRoute;

  return (
    <div className="App">
      <ScrollToTop />
      {showPublicUI && <Header />}
      <main>
        <AuthProvider>
          <Suspense fallback={<div className="text-center py-20">Loading...</div>}>
            <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/verify-email" element={<VerifyEmailPage />} />
            <Route path="/apartments" element={<ApartmentsPage />} />
            <Route path="/wohnungen/:city" element={<ApartmentsPage />} />
            <Route path="/apartments/:id" element={<ApartmentDetailPage />} />
            <Route path="/for-companies" element={<ForCompaniesPage />} />
            <Route path="/for-property-managers" element={<ForPropertyManagersPage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/contact" element={<ContactPage />} />

            <Route path="/admin" element={<AdminLayout />}>
              <Route path="login" element={<AdminLoginPage />} />
              <Route index element={<AdminUebersichtPage />} />
              <Route path="dashboard" element={<AdminUebersichtPage />} />
              <Route path="operations" element={<AdminCoLivingDashboardPage />} />
              <Route path="business-apartments-dashboard" element={<AdminBusinessApartmentsDashboardPage />} />
              <Route path="portfolio-map" element={<AdminPortfolioMapPage />} />
              <Route path="objekte-dashboard" element={<AdminObjektePage />} />
              <Route path="rechnungen-dashboard" element={<AdminInvoicesPage />} />
              <Route path="apartments" element={<AdminApartmentsPage />} />
              <Route path="listings" element={<AdminListingsPage />} />
              <Route path="leads" element={<AdminLeadsPage />} />
              <Route path="tenants/:tenantId" element={<AdminTenantDetailPage />} />
              <Route path="tenants" element={<AdminTenantsPage />} />
              <Route path="landlords/:id" element={<AdminLandlordDetailPage />} />
              <Route path="landlords" element={<AdminLandlordsPage />} />
            <Route path="users/:userId" element={<AdminUserDetailPage />} />
            <Route path="users" element={<AdminUsersPage />} />
              <Route
                path="organizations"
                element={<Navigate to="/platform/organizations" replace />}
              />
              <Route path="properties" element={<AdminPropertiesPage />} />
              <Route path="bewirtschafter/:id" element={<AdminPropertyManagerDetailPage />} />
              <Route path="bewirtschafter" element={<AdminPropertyManagersPage />} />
              <Route path="owners/:id" element={<AdminOwnerDetailPage />} />
              <Route path="owners" element={<AdminOwnersPage />} />
              <Route path="invoices" element={<AdminInvoicesPage />} />
              <Route path="invoices/:id" element={<AdminInvoiceDetailPage />} />
              <Route path="revenue" element={<AdminRevenuePage />} />
              <Route path="ausgaben" element={<AdminExpensesPage />} />
              <Route path="performance" element={<AdminPerformancePage />} />
              <Route path="break-even" element={<AdminBreakEvenPage />} />
              <Route path="prognose" element={<AdminForecastPage />} />
              <Route path="units/:unitId" element={<AdminUnitDetailPage />} />
              <Route path="invoices/open" element={<AdminInvoicesPage />} />
              <Route path="invoices/paid" element={<AdminInvoicesPage />} />
              <Route path="invoices/overdue" element={<AdminInvoicesPage />} />
              <Route path="units" element={<Navigate to="/admin/apartments" replace />} />
              <Route path="rooms" element={<AdminRoomsPage />} />
              <Route path="occupancy" element={<AdminOccupancyPage />} />
              <Route path="inventory/:itemId" element={<AdminInventoryDetailPage />} />
              <Route path="inventory" element={<AdminInventoryPage />} />
              <Route path="tenants/active" element={<AdminTenantsPage />} />
              <Route path="tenants/move-outs" element={<AdminTenantsPage />} />
              <Route path="contracts" element={<AdminLandlordsPage />} />
              <Route path="leads/inquiries" element={<AdminLeadsPage />} />
              <Route path="leads/followups" element={<AdminLeadsPage />} />
            </Route>

            <Route path="/platform" element={<PlatformLayout />}>
              <Route index element={<PlatformDashboardPage />} />
              <Route path="audit-logs" element={<PlatformAuditLogsPage />} />
              <Route
                path="organizations/:organizationId"
                element={<PlatformOrganizationDetailPage />}
              />
              <Route path="organizations" element={<PlatformOrganizationsPage />} />
            </Route>

            <Route path="/tenant" element={<TenantLayout />}>
              <Route path="login" element={<TenantLoginPage />} />
              <Route index element={<TenantOverviewPage />} />
              <Route path="tenancies" element={<TenantTenanciesPage />} />
              <Route path="invoices" element={<TenantInvoicesPage />} />
            </Route>

            <Route path="/landlord" element={<LandlordLayout />}>
              <Route path="login" element={<LandlordLoginPage />} />
              <Route index element={<LandlordOverviewPage />} />
              <Route path="properties" element={<LandlordPropertiesPage />} />
              <Route path="units" element={<LandlordUnitsPage />} />
              <Route path="tenancies" element={<LandlordTenanciesPage />} />
              <Route path="invoices" element={<LandlordInvoicesPage />} />
            </Route>
            </Routes>
          </Suspense>
        </AuthProvider>
      </main>
      {showPublicUI && <Footer />}
      <Toaster position="top-center" />
      {showPublicUI && <ChatWidget />}
    </div>
  );
}
