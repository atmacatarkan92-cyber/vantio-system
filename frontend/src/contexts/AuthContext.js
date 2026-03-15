/**
 * Auth state for admin: token (in-memory), user, isAuthenticated, loading.
 * Phase 2: Session restore via POST /auth/refresh (HttpOnly cookie); no primary use of localStorage.
 * Only admin and manager roles are considered authenticated for the admin area.
 */
import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { ADMIN_TOKEN_KEY } from "../config";
import { getMe, refresh, logout as apiLogout } from "../api/auth";
import { getAccessToken } from "../authStore";

const AuthContext = createContext(null);

const ALLOWED_ADMIN_ROLES = ["admin", "manager"];
const TENANT_ROLE = "tenant";

export function AuthProvider({ children }) {
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const isAuthenticated = !!(token && user && ALLOWED_ADMIN_ROLES.includes(user.role));
  const isTenantAuthenticated = !!(token && user && user.role === TENANT_ROLE);

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
      if (typeof localStorage !== "undefined") {
        localStorage.removeItem(ADMIN_TOKEN_KEY);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  const login = useCallback((accessToken) => {
    setToken(accessToken);
    setLoading(true);
    getMe()
      .then((me) => {
        setUser(me || null);
        if (!me) setToken(null);
      })
      .catch(() => {
        setToken(null);
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiLogout();
    } finally {
      setToken(null);
      setUser(null);
      if (typeof localStorage !== "undefined") {
        localStorage.removeItem(ADMIN_TOKEN_KEY);
      }
    }
  }, []);

  const value = {
    token,
    user,
    isAuthenticated,
    isTenantAuthenticated,
    loading,
    login,
    logout,
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
