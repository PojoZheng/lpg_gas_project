import { getCurrentSession } from "./platform-auth.js";

const API_BASE_URL = "http://localhost:3100";

function authHeaders() {
  const session = getCurrentSession();
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${session?.accessToken || ""}`,
  };
}

async function requestJson(url, options = {}) {
  try {
    const res = await fetch(url, options);
    let data = null;
    try {
      data = await res.json();
    } catch (_err) {
      data = null;
    }
    if (data && typeof data === "object") return data;
    if (!res.ok) return { success: false, error: `请求失败（HTTP ${res.status}）` };
    return { success: false, error: "服务返回格式异常，请稍后重试" };
  } catch (_err) {
    return { success: false, error: "网络异常，请检查连接后重试" };
  }
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
