import { getCurrentSession } from "./auth-client.js";

const API_BASE_URL = "http://localhost:3100";

const mockCustomers = [
  { id: "MC-001", name: "北城早餐店", phone: "13900000001", address: "北城路 22 号" },
  { id: "MC-002", name: "万家超市", phone: "13900000002", address: "河西大道 199 号" },
];

const mockInventory = {
  "10kg": { onHand: 6, locked: 0 },
  "15kg": { onHand: 10, locked: 0 },
  "50kg": { onHand: 2, locked: 0 },
};

function getMockInventoryState(spec) {
  const onHand = Number(mockInventory[spec]?.onHand || 0);
  const locked = Number(mockInventory[spec]?.locked || 0);
  return { onHand, locked, available: Math.max(0, onHand - locked) };
}

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
  const state = getMockInventoryState(spec);
  return {
    success: true,
    data: {
      spec,
      available: state.available,
      onHand: state.onHand,
      locked: state.locked,
      requested: Number(quantity || 0),
      canCreate: state.available >= Number(quantity || 0),
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
    const errorCode = data?.error?.code || "";
    const errorMessage = data?.error?.message || data?.error || "";
    if (res.status === 401 || errorCode === "AUTH_401") {
      return {
        success: false,
        error: "鉴权失败：登录态已失效，请重新登录后再提交",
        errorType: "auth",
      };
    }
    if (res.status === 400 || errorCode === "VALIDATION_400") {
      return {
        success: false,
        error: `参数失败：${errorMessage || "请检查客户、规格、数量与金额"}`,
        errorType: "validation",
      };
    }
    if (res.status === 409 || errorCode === "INVENTORY_409_STOCK") {
      return {
        success: false,
        error: `参数失败：${errorMessage || "库存不足或冲突，请调整后重试"}`,
        errorType: "validation",
      };
    }
    return {
      success: false,
      error: `提交失败：${errorMessage || "服务暂不可用，请稍后重试"}`,
      errorType: "server",
    };
  } catch (_err) {
    return {
      success: false,
      error: "网络失败：无法连接开单接口，请检查网络后重试",
      errorType: "network",
    };
  }
}
