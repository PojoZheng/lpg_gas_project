import { getCurrentSession } from "./platform-auth.js";
import { API_BASE_URL } from "./api-base.js";

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

export async function fetchCurrentPolicy() {
  return requestJson(`${API_BASE_URL}/platform/policies/current`, {
    headers: authHeaders(),
  });
}

export async function fetchPolicyVersions() {
  return requestJson(`${API_BASE_URL}/platform/policies/versions`, {
    headers: authHeaders(),
  });
}

export async function fetchPolicyAuditLogs() {
  return requestJson(`${API_BASE_URL}/platform/policies/audit-logs`, {
    headers: authHeaders(),
  });
}

export async function editPolicyDraft(payload) {
  return requestJson(`${API_BASE_URL}/platform/policies/edit`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export async function publishPolicyVersion(payload) {
  return requestJson(`${API_BASE_URL}/platform/policies/publish`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export async function rollbackPolicyVersion(payload) {
  return requestJson(`${API_BASE_URL}/platform/policies/rollback`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}
