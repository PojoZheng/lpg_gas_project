const API_BASE = "http://localhost:3100";

function getAccessToken() {
  const authSession = JSON.parse(localStorage.getItem("auth_session") || "{}");
  if (authSession.accessToken) return authSession.accessToken;
  const legacySession = JSON.parse(localStorage.getItem("driver_session") || "{}");
  return legacySession.accessToken || "";
}

export async function fetchOrderList() {
  const res = await fetch(`${API_BASE}/orders`, {
    headers: { Authorization: `Bearer ${getAccessToken()}` },
  });
  return res.json();
}

export async function fetchOrderDetail(orderId) {
  const res = await fetch(`${API_BASE}/orders/${encodeURIComponent(orderId)}`, {
    headers: { Authorization: `Bearer ${getAccessToken()}` },
  });
  return res.json();
}

export async function submitOrderReturn(orderId, payload) {
  const res = await fetch(`${API_BASE}/orders/${encodeURIComponent(orderId)}/return`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getAccessToken()}`,
    },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function submitOrderExchange(orderId, payload) {
  const res = await fetch(`${API_BASE}/orders/${encodeURIComponent(orderId)}/exchange`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getAccessToken()}`,
    },
    body: JSON.stringify(payload),
  });
  
  return res.json();
}

export async function updateOrderBasic(orderId, payload) {
  const res = await fetch(`${API_BASE}/orders/${encodeURIComponent(orderId)}/basic-update`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getAccessToken()}`,
    },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function checkHeavyInventory(spec) {
  const res = await fetch(`${API_BASE}/inventory/snapshot`, {
    headers: { Authorization: `Bearer ${getAccessToken()}` },
  });
  const result = await res.json();
  if (!result?.success) return 0;
  const row = (Array.isArray(result.data) ? result.data : []).find((item) => item.spec === spec);
  return Number(row?.available || 0);
}
