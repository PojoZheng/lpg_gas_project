import { authFetchJson } from "./auth-client.js";

const API_BASE_URL = "http://localhost:3100";

function authHeaders() {
  return {
    "Content-Type": "application/json",
  };
}

async function requestJson(url, options = {}) {
  return authFetchJson(url, options);
}

export async function fetchTodayFinanceSummary() {
  return requestJson(`${API_BASE_URL}/finance/today-summary`, {
    headers: authHeaders(),
  });
}

export async function fetchTodayFinanceEntries() {
  return requestJson(`${API_BASE_URL}/finance/entries?today=1`, {
    headers: authHeaders(),
  });
}

export async function confirmDailyClose(payload) {
  return requestJson(`${API_BASE_URL}/finance/daily-close`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload || {}),
  });
}
