function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function isLocalHost(hostname) {
  return (
    hostname === "127.0.0.1" ||
    hostname === "localhost" ||
    hostname === "::1" ||
    hostname === "[::1]"
  );
}

function resolveOverride() {
  try {
    const params = new URLSearchParams(window.location.search);
    const fromQuery = trimTrailingSlash(params.get("apiBase"));
    if (fromQuery) return fromQuery;
  } catch (_err) {
    // Ignore URL parsing issues and fall back to other sources.
  }

  try {
    const fromStorage = trimTrailingSlash(window.localStorage.getItem("lpg_api_base_url"));
    if (fromStorage) return fromStorage;
  } catch (_err) {
    // Ignore storage access issues in restricted environments.
  }

  const fromGlobal = trimTrailingSlash(window.__LPG_API_BASE_URL__);
  if (fromGlobal) return fromGlobal;

  return "";
}

export function resolveApiBaseUrl() {
  const override = resolveOverride();
  if (override) return override;

  if (window.location.protocol === "http:" || window.location.protocol === "https:") {
    if (isLocalHost(window.location.hostname)) {
      return `${window.location.protocol}//${window.location.hostname}:3100`;
    }
  }

  return "http://127.0.0.1:3100";
}

export const API_BASE_URL = resolveApiBaseUrl();
