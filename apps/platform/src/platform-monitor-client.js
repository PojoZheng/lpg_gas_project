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

export async function fetchBusinessMetrics() {
  return requestJson(`${API_BASE_URL}/platform/monitor/business-metrics`, {
    headers: authHeaders(),
  });
}

export async function fetchComplianceMetrics() {
  return requestJson(`${API_BASE_URL}/platform/monitor/compliance-metrics`, {
    headers: authHeaders(),
  });
}

export async function retrySafetyById(safetyId) {
  return requestJson(`${API_BASE_URL}/safety/${encodeURIComponent(safetyId)}/retry`, {
    method: "POST",
    headers: authHeaders(),
  });
}
