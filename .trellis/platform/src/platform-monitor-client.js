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
