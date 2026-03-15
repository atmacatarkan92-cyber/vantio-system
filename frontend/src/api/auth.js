/**
 * Auth API client: login, refresh, logout, getMe.
 * Phase 2: login/refresh set access token in authStore; refresh token in HttpOnly cookie.
 * Use credentials: "include" so cookies are sent and received.
 */
import { API_BASE_URL, getApiHeaders } from "../config";
import { setAccessToken, clearAccessToken } from "../authStore";

const CREDENTIALS = "include";

export async function login(email, password) {
  const res = await fetch(`${API_BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: email.trim(), password }),
    credentials: CREDENTIALS,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const message =
      data.detail != null
        ? typeof data.detail === "string"
          ? data.detail
          : JSON.stringify(data.detail)
        : `Fehler ${res.status}`;
    throw new Error(message);
  }
  if (data.access_token) {
    setAccessToken(data.access_token);
  }
  return data;
}

/**
 * Exchange refresh token (from HttpOnly cookie) for a new access token.
 * Call with credentials: "include" so the cookie is sent.
 * On success, sets new access token in authStore and returns it.
 */
export async function refresh() {
  const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
    method: "POST",
    credentials: CREDENTIALS,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    clearAccessToken();
    throw new Error(data.detail || "Refresh fehlgeschlagen.");
  }
  if (data.access_token) {
    setAccessToken(data.access_token);
  }
  return data;
}

/**
 * Revoke refresh token on server and clear cookie. Clears in-memory access token.
 */
export async function logout() {
  try {
    await fetch(`${API_BASE_URL}/auth/logout`, {
      method: "POST",
      credentials: CREDENTIALS,
    });
  } finally {
    clearAccessToken();
  }
}

export async function getMe() {
  const res = await fetch(`${API_BASE_URL}/auth/me`, {
    headers: getApiHeaders(),
    credentials: CREDENTIALS,
  });
  if (res.status === 401) {
    return null;
  }
  if (!res.ok) {
    throw new Error("Session konnte nicht geladen werden.");
  }
  return res.json();
}
