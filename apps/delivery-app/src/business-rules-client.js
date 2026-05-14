import { authFetchJson } from "./auth-client.js";
import { API_BASE_URL } from "./api-base.js";

function authHeaders() {
  return {
    "Content-Type": "application/json",
  };
}

export async function fetchBusinessRules() {
  return authFetchJson(`${API_BASE_URL}/settings/business`, {
    headers: authHeaders(),
  });
}

export async function saveBusinessRules(payload) {
  return authFetchJson(`${API_BASE_URL}/settings/business`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export async function resetBusinessRules() {
  return authFetchJson(`${API_BASE_URL}/settings/business/reset`, {
    method: "POST",
    headers: authHeaders(),
  });
}
