/**
 * Auth state for admin: token (in-memory), user, isAuthenticated, loading.
 * Phase 2: Session restore via POST /auth/refresh (HttpOnly cookie); no primary use of localStorage.
 * Customer /admin: admin + manager only. Platform /platform: platform_admin only (separate layout).
 */
import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { getMe, refresh, logout as apiLogout } from "../api/auth";
import { setAccessToken, clearAccessToken } from "../authStore";

const AuthContext = createContext(null);

const CUSTOMER_ADMIN_ROLES = ["admin", "manager"];
const PLATFORM_ADMIN_ROLE = "platform_admin";
const TENANT_ROLE = "tenant";
const LANDLORD_ROLE = "landlord";

export function AuthProvider({ children }) {
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  /** Customer-org admin shell (/admin) — admin or manager only. */
  const isAuthenticated = !!(
    token &&
    user &&
    CUSTOMER_ADMIN_ROLES.includes(user.role)
  );
  /** Platform control plane (/platform) — platform operators only. */
  const isPlatformAdminAuthenticated = !!(
    token &&
    user &&
    user.role === PLATFORM_ADMIN_ROLE
  );
  const isTenantAuthenticated = !!(token && user && user.role === TENANT_ROLE);
  const isLandlordAuthenticated = !!(token && user && user.role === LANDLORD_ROLE);

  const loadSession = useCallback(async () => {
    setToken(null);
    setUser(null);
    try {
      const data = await refresh();
      const accessToken = data.access_token;
      if (accessToken) {
        setToken(accessToken);
        const me = await getMe();
        if (me) setUser(me);
        else setToken(null);
      }
    } catch {
      setToken(null);
      setUser(null);
      clearAccessToken();
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  const login = useCallback((accessToken) => {
    setToken(accessToken);
    if (accessToken) {
      setAccessToken(accessToken);
    }
    setLoading(true);
    return getMe()
      .then((me) => {
        setUser(me || null);
        if (!me) setToken(null);
        return me;
      })
      .catch(() => {
        setToken(null);
        setUser(null);
        return null;
      })
      .finally(() => setLoading(false));
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiLogout();
    } finally {
      setToken(null);
      setUser(null);
      clearAccessToken();
    }
  }, []);

  /** Exit platform support-mode impersonation: new access token from refresh cookie (DB role). */
  const exitImpersonation = useCallback(async () => {
    setLoading(true);
    try {
      const data = await refresh();
      if (data?.access_token) {
        setToken(data.access_token);
        setAccessToken(data.access_token);
      }
      const me = await getMe();
      setUser(me || null);
      if (!me) {
        setToken(null);
      }
    } catch {
      setToken(null);
      setUser(null);
      clearAccessToken();
    } finally {
      setLoading(false);
    }
  }, []);

  const isImpersonating = !!(user && user.is_impersonating);
  const impersonatedOrganizationName = user?.impersonated_organization_name ?? null;

  const value = {
    token,
    user,
    isAuthenticated,
    isPlatformAdminAuthenticated,
    isTenantAuthenticated,
    isLandlordAuthenticated,
    isImpersonating,
    impersonatedOrganizationName,
    loading,
    login,
    logout,
    exitImpersonation,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
