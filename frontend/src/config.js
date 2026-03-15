/**
 * Central API configuration. Use for all backend requests.
 * Set REACT_APP_BACKEND_URL in .env (e.g. http://localhost:8000 for dev).
 * Set REACT_APP_ADMIN_API_KEY in .env when backend uses ADMIN_API_KEY (production).
 */
import { getAccessToken } from "./authStore";

const API_BASE_URL =
  process.env.REACT_APP_BACKEND_URL || "http://127.0.0.1:8000";

/**
 * localStorage key for admin JWT. Phase 2: primary token is in-memory (authStore);
 * localStorage used only as transitional fallback if refresh not yet run.
 */
export const ADMIN_TOKEN_KEY = "fah_admin_token";

/**
 * Headers for admin/protected API calls. Uses in-memory access token first (Auth Phase 2),
 * then localStorage fallback (transitional), then X-API-Key if set.
 */
export function getApiHeaders() {
  const headers = { "Content-Type": "application/json" };
  let token = getAccessToken();
  if (!token && typeof localStorage !== "undefined") {
    token = localStorage.getItem(ADMIN_TOKEN_KEY);
  }
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  } else {
    const key = process.env.REACT_APP_ADMIN_API_KEY;
    if (key) headers["X-API-Key"] = key;
  }
  return headers;
}

export { API_BASE_URL };
export default API_BASE_URL;
