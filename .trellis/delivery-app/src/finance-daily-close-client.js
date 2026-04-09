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
