import { getCurrentSession } from "./auth-client.js";

const API_BASE_URL = "http://localhost:3100";

function buildMockOverview() {
  return {
    finance: {
      receivedToday: 1680,
      pendingToday: 520,
      currency: "CNY",
    },
    nextDelivery: {
      orderId: "MOCK-ORDER-001",
      customerName: "城西便利店",
      address: "东环路 102 号",
      scheduleAt: "今天 16:20",
      orderStatus: "pending_delivery",
    },
    sync: {
      syncStatus: "failed",
      pendingCount: 4,
      lastSyncAt: Date.now() - 8 * 60 * 1000,
    },
    quickActions: [{ id: "quick_order", label: "快速开单", route: "/orders/quick-create" }],
  };
}

export async function fetchWorkbenchOverview() {
  const session = getCurrentSession();
  if (!session?.accessToken) {
    return { success: false, error: "未登录，请先登录" };
  }

  try {
    const res = await fetch(`${API_BASE_URL}/workbench/overview`, {
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
      },
    });
    const data = await res.json();
    if (data.success) return data;
    return { success: true, data: buildMockOverview(), fromMock: true };
  } catch (_err) {
    return { success: true, data: buildMockOverview(), fromMock: true };
  }
}

export async function fetchSyncQueueOverview() {
  const session = getCurrentSession();
  if (!session?.accessToken) {
    return { success: false, error: "未登录，请先登录" };
  }
  try {
    const res = await fetch(`${API_BASE_URL}/sync/queue`, {
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
      },
    });
    const data = await res.json();
    if (!data.success) {
      return { success: false, error: data.error?.message || "同步队列读取失败" };
    }
    const items = Array.isArray(data.data) ? data.data : [];
    const pending = items.filter((item) => item.status === "pending").length;
    const failed = items.filter((item) => item.status === "failed").length;
    const retryWaiting = items.filter((item) => item.status === "retry_waiting").length;
    return {
      success: true,
      data: {
        pending,
        failed,
        retryWaiting,
        total: items.length,
      },
    };
  } catch (_err) {
    return { success: false, error: "同步队列读取失败，请稍后重试" };
  }
}

export async function batchSyncNow() {
  const session = getCurrentSession();
  if (!session?.accessToken) {
    return { success: false, error: "未登录，请先登录" };
  }
  try {
    const res = await fetch(`${API_BASE_URL}/sync/queue/batch-submit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.accessToken}`,
      },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    if (!data.success) {
      return { success: false, error: data.error?.message || "同步执行失败" };
    }
    return { success: true, data: data.data || {} };
  } catch (_err) {
    return { success: false, error: "同步执行失败，请检查网络后重试" };
  }
}
