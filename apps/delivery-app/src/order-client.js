const API_BASE = "http://localhost:3100";

// 本地库存状态（模拟）
const inventoryState = {
  "10kg": { heavy: 6, empty: 3 },
  "15kg": { heavy: 10, empty: 5 },
  "50kg": { heavy: 2, empty: 1 },
};

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
  
  const result = await res.json();
  
  // 模拟库存联动：旧规格重瓶+1，新规格重瓶-1
  if (result.success) {
    const { originalSpec, newSpec, newQuantity } = payload;
    
    // 旧规格重瓶 +1（退回）
    if (originalSpec && inventoryState[originalSpec]) {
      inventoryState[originalSpec].heavy += 1;
    }
    
    // 新规格重瓶 -newQuantity（出库）
    if (newSpec && inventoryState[newSpec]) {
      inventoryState[newSpec].heavy = Math.max(0, inventoryState[newSpec].heavy - (newQuantity || 1));
    }
    
    // 将更新后的库存信息附加到结果中
    result.inventoryUpdated = true;
    result.inventoryChanges = {
      [originalSpec]: { heavyDelta: +1 },
      [newSpec]: { heavyDelta: -(newQuantity || 1) },
    };
  }
  
  return result;
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

// 获取当前库存状态（供页面展示）
export function getInventoryState() {
  return { ...inventoryState };
}

// 检查指定规格重瓶库存
export function checkHeavyInventory(spec) {
  return inventoryState[spec]?.heavy || 0;
}
