/**
 * Platform-local session read (same key/shape as delivery-app auth-client.js).
 * Do not import app scripts via absolute URL — platform runs on a different static port.
 *
 * Note: localStorage is per-origin. Login on :5174 does not populate session on :5175;
 * use platform pages after logging in on the same origin, or log in from a future shared entry.
 */
export function getCurrentSession() {
  const raw = localStorage.getItem("auth_session");
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (_err) {
    localStorage.removeItem("auth_session");
    return null;
  }
}
