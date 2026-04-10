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

export async function fetchPendingDeliveryOrders() {
  return requestJson(`${API_BASE_URL}/orders/pending-delivery`, {
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
