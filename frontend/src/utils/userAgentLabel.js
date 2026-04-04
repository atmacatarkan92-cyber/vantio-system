/**
 * Rule-based user-agent → human-readable device label (German).
 * Reusable for audit UI and future “new device” heuristics (compare with stored raw UA).
 *
 * @param {string|null|undefined} userAgent
 * @returns {string}
 */
export function getDeviceLabelFromUserAgent(userAgent) {
  if (userAgent == null || String(userAgent).trim() === "") {
    return "Unbekanntes Gerät";
  }
  const s = String(userAgent);

  let browser = "Unbekannter Browser";
  if (/Edg\//i.test(s)) {
    browser = "Edge";
  } else if (/OPR\/|Opera\//i.test(s)) {
    browser = "Opera";
  } else if (/Firefox\//i.test(s)) {
    browser = "Firefox";
  } else if (/CriOS\//i.test(s)) {
    browser = "Chrome";
  } else if (/Chrome\//i.test(s) || /Chromium\//i.test(s)) {
    browser = "Chrome";
  } else if (/Safari\//i.test(s)) {
    browser = "Safari";
  }

  let os = "Unbekanntes System";
  if (/CrOS/i.test(s)) {
    os = "Chrome OS";
  } else if (/iPhone/i.test(s)) {
    os = "iPhone";
  } else if (/iPad/i.test(s)) {
    os = "iPad";
  } else if (/Android/i.test(s)) {
    os = "Android";
  } else if (/Windows NT/i.test(s)) {
    os = "Windows";
  } else if (/Mac OS X|Macintosh/i.test(s)) {
    os = "macOS";
  } else if (/Linux/i.test(s)) {
    os = "Linux";
  }

  return `${browser} auf ${os}`;
}
