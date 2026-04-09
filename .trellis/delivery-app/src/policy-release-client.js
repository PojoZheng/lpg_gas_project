import { getCurrentSession } from "./auth-client.js";

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
