import { authFetchJson } from "./auth-client.js";
import { API_BASE_URL } from "./api-base.js";

function authHeaders() {
  return {
    "Content-Type": "application/json",
  };
}

export async function fetchQuickCustomers() {
  try {
    const data = await authFetchJson(`${API_BASE_URL}/customers/quick-select`, {
      headers: authHeaders(),
    });
    if (data.success) return data;
    if (data.errorType === "auth") return data;
    return { success: false, error: data?.error || "客户加载失败，请稍后重试" };
  } catch (_err) {
    return { success: false, error: "客户加载失败，请检查网络后重试" };
  }
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
    const data = await authFetchJson(`${API_BASE_URL}/customers`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(payload),
    });
    if (data.success) return data;
    if (data.errorType === "auth") return data;
    return { success: false, error: data?.error || "客户创建失败，请稍后重试" };
  } catch (_err) {
    return { success: false, error: "客户创建失败，请检查网络后重试" };
  }
}

export async function checkInventory(spec, quantity) {
  try {
    const data = await authFetchJson(`${API_BASE_URL}/inventory/check`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ spec, quantity }),
    });
    if (data.success) return data;
    if (data.errorType === "auth") return data;
    return { success: false, error: data?.error || "库存校验失败，请稍后重试" };
  } catch (_err) {
    return { success: false, error: "库存校验失败，请检查网络后重试" };
  }
}

export async function quickCreateOrder(payload) {
  try {
    const data = await authFetchJson(`${API_BASE_URL}/orders/quick-create`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(payload),
    });
    if (data.success) return data;
    if (data.errorType === "auth") {
      return data;
    }
    const errorCode = data?.error?.code || data?.error_code || "";
    const errorMessage = data?.error?.message || data?.error || "";
    if (errorCode === "VALIDATION_400") {
      return {
        success: false,
        error: `参数失败：${errorMessage || "请检查客户、规格、数量与金额"}`,
        errorType: "validation",
      };
    }
    if (errorCode === "INVENTORY_409_STOCK") {
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
