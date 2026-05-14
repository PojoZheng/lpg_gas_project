import { authFetchJson } from "./auth-client.js";
import { API_BASE_URL } from "./api-base.js";

export function fetchDebtOverview() {
  return authFetchJson(`${API_BASE_URL}/debts/overview`, { method: "GET" });
}

export function fetchDebtList(params = {}) {
  const query = new URLSearchParams();
  query.set("filter", params.filter || "all");
  query.set("page", String(params.page || 1));
  query.set("size", String(params.size || 20));
  return authFetchJson(`${API_BASE_URL}/debts/list?${query.toString()}`, { method: "GET" });
}

export function fetchDebtCustomerDetail(customerId) {
  return authFetchJson(`${API_BASE_URL}/debts/customer/${encodeURIComponent(customerId)}`, {
    method: "GET",
  });
}

export function submitDebtReminder(payload) {
  return authFetchJson(`${API_BASE_URL}/debts/reminder`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {}),
  });
}

export function submitDebtRepayment(payload) {
  return authFetchJson(`${API_BASE_URL}/debts/repayment`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {}),
  });
}
