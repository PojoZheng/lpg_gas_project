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

export async function fetchPendingDeliveryOrders() {
  return requestJson(`${API_BASE_URL}/orders/pending-delivery`, {
    headers: authHeaders(),
  });
}

export async function fetchOrderById(orderId) {
  return requestJson(`${API_BASE_URL}/orders/${encodeURIComponent(orderId)}`, {
    headers: authHeaders(),
  });
}

export async function completeOrder(orderId, payload) {
  return requestJson(`${API_BASE_URL}/orders/${encodeURIComponent(orderId)}/complete`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export async function cancelOrder(orderId) {
  return requestJson(`${API_BASE_URL}/orders/${encodeURIComponent(orderId)}/cancel`, {
    method: "POST",
    headers: authHeaders(),
  });
}

export async function updateOrder(orderId, payload) {
  return requestJson(`${API_BASE_URL}/orders/${encodeURIComponent(orderId)}/basic-update`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export async function undoOrderAction(orderId) {
  return requestJson(`${API_BASE_URL}/orders/${encodeURIComponent(orderId)}/undo`, {
    method: "POST",
    headers: authHeaders(),
  });
}

export async function fetchInventorySnapshot() {
  return requestJson(`${API_BASE_URL}/inventory/snapshot`, {
    headers: authHeaders(),
  });
}

export async function fetchCustomerDetail(customerId) {
  return requestJson(`${API_BASE_URL}/customers/${encodeURIComponent(customerId)}/detail`, {
    headers: authHeaders(),
  });
}

export async function updateCollectionStatus(customerId, payload) {
  return requestJson(
    `${API_BASE_URL}/customers/${encodeURIComponent(customerId)}/collection-status`,
    {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify(payload),
    }
  );
}

export async function fetchSafetyByOrder(orderId) {
  return requestJson(`${API_BASE_URL}/safety/by-order/${encodeURIComponent(orderId)}`, {
    headers: authHeaders(),
  });
}

export async function submitSafetyByOrder(orderId, payload) {
  return requestJson(`${API_BASE_URL}/safety/by-order/${encodeURIComponent(orderId)}`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export async function retrySafetyReport(safetyId) {
  return requestJson(`${API_BASE_URL}/safety/${encodeURIComponent(safetyId)}/retry`, {
    method: "POST",
    headers: authHeaders(),
  });
}
