import { getCurrentSession } from "/delivery-app/src/auth-client.js";

const API_BASE_URL = "http://localhost:3100";

function authHeaders() {
  const session = getCurrentSession();
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${session?.accessToken || ""}`,
  };
}

async function requestJson(url, options = {}) {
  const res = await fetch(url, options);
  return res.json();
}

export async function fetchSyncQueue(params = {}) {
  const query = new URLSearchParams();
  const entries = Object.entries(params);
  entries.forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    const text = String(value).trim();
    if (!text) return;
    query.set(key, text);
  });
  const suffix = query.size ? `?${query.toString()}` : "";
  return requestJson(`${API_BASE_URL}/sync/queue${suffix}`, { headers: authHeaders() });
}

export async function enqueueSyncItem(payload) {
  return requestJson(`${API_BASE_URL}/sync/queue/enqueue`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export async function batchSubmitSync(payload = {}) {
  return requestJson(`${API_BASE_URL}/sync/queue/batch-submit`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export async function retrySyncItem(offlineId) {
  return requestJson(`${API_BASE_URL}/sync/queue/${encodeURIComponent(offlineId)}/retry`, {
    method: "POST",
    headers: authHeaders(),
  });
}

export async function markSyncManual(offlineId) {
  return requestJson(`${API_BASE_URL}/sync/queue/${encodeURIComponent(offlineId)}/manual`, {
    method: "POST",
    headers: authHeaders(),
  });
}
