const API_BASE = "http://localhost:3100";

function getAccessToken() {
  const session = JSON.parse(localStorage.getItem("driver_session") || "{}");
  return session.accessToken || "";
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
