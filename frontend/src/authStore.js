/**
 * In-memory access token store for Auth Phase 2.
 * Access token is kept in memory only; refresh token is in HttpOnly cookie.
 * Used by getApiHeaders() so API calls send the current access token.
 */
let _accessToken = null;

export function getAccessToken() {
  return _accessToken;
}

export function setAccessToken(token) {
  _accessToken = token;
}

export function clearAccessToken() {
  _accessToken = null;
}
