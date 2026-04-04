/**
 * Stable device fingerprint for login audit comparison (user_agent + ip_address).
 * Reusable for UI, future alerts, and suspicious-login heuristics.
 *
 * Returns null if either part is missing — callers should treat as "incomplete" for
 * new/known device detection.
 *
 * @param {string|null|undefined} userAgent
 * @param {string|null|undefined} ipAddress
 * @returns {string|null}
 */
export function computeDeviceFingerprint(userAgent, ipAddress) {
  const ua = userAgent != null ? String(userAgent).trim() : "";
  const ip = ipAddress != null ? String(ipAddress).trim() : "";
  if (!ua || !ip) {
    return null;
  }
  return `${ua}\u001f${ip}`;
}
