import { getCurrentSession } from "./auth-client.js";

const API_BASE_URL = "http://localhost:3100";

const mockCustomers = [
  { id: "MC-001", name: "北城早餐店", phone: "13900000001", address: "北城路 22 号" },
  { id: "MC-002", name: "万家超市", phone: "13900000002", address: "河西大道 199 号" },
];

const mockInventory = {
  "10kg": 6,
  "15kg": 10,
  "50kg": 2,
};

function authHeaders() {
  const session = getCurrentSession();
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${session?.accessToken || ""}`,
  };
}

export async function fetchQuickCustomers() {
  try {
    const res = await fetch(`${API_BASE_URL}/customers/quick-select`, {
      headers: authHeaders(),
    });
    const data = await res.json();
    if (data.success) return data;
  } catch (_err) {}
  return { success: true, data: mockCustomers, fromMock: true };
}

export function filterQuickCustomers(customers, keyword) {
  const key = String(keyword || "").trim();
  if (!key) return customers;
  return customers.filter(
    (x) => x.name.includes(key) || x.phone.includes(key) || x.address.includes(key)
  );
}

export async function createQuickCustomer(payload) {
  try {
    const res = await fetch(`${API_BASE_URL}/customers`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.success) return data;
    return data;
  } catch (_err) {
    const name = String(payload.name || "").trim();
    const phone = String(payload.phone || "").trim();
    const address = String(payload.address || "").trim();
    if (!name) return { success: false, error: "客户姓名不能为空" };
    if (!/^1\d{10}$/.test(phone)) return { success: false, error: "手机号格式不正确" };
    if (!address) return { success: false, error: "地址不能为空" };
    if (mockCustomers.some((x) => x.phone === phone)) {
      return { success: false, error: "该手机号已存在客户" };
    }
    const customer = {
      id: `MC-${String(mockCustomers.length + 1).padStart(3, "0")}`,
      name,
      phone,
      address,
    };
    mockCustomers.unshift(customer);
    return { success: true, data: customer, fromMock: true };
  }
}

export async function checkInventory(spec, quantity) {
  try {
    const res = await fetch(`${API_BASE_URL}/inventory/check`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ spec, quantity }),
    });
    const data = await res.json();
    if (data.success) return data;
  } catch (_err) {}
  const available = Number(mockInventory[spec] || 0);
  return {
    success: true,
    data: {
      spec,
      available,
      requested: Number(quantity || 0),
      canCreate: available >= Number(quantity || 0),
    },
    fromMock: true,
  };
}

export async function quickCreateOrder(payload) {
  try {
    const res = await fetch(`${API_BASE_URL}/orders/quick-create`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.success) return data;
    return data;
  } catch (_err) {
    const available = Number(mockInventory[payload.spec] || 0);
    if (available < Number(payload.quantity || 0)) {
      return {
        success: false,
        error: `库存不足：${payload.spec} 可用 ${available} 瓶`,
      };
    }
    mockInventory[payload.spec] = available - Number(payload.quantity || 0);
    return {
      success: true,
      data: {
        orderId: `MOCK-${Date.now()}`,
        orderType: payload.orderType,
        orderStatus: payload.orderType === "immediate_complete" ? "completed" : "pending_delivery",
        amount: Number((Number(payload.unitPrice || 0) * Number(payload.quantity || 0)).toFixed(2)),
      },
      fromMock: true,
    };
  }
}
