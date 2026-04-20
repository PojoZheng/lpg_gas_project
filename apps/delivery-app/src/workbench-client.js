import { authFetchJson, getCurrentSession, redirectToLogin } from "./auth-client.js";

const API_BASE_URL = "http://localhost:3100";

function buildMockOverview() {
  return {
    finance: {
      receivedToday: 1680,
      pendingToday: 520,
      grossProfitToday: 1530,
      grossTrend7d: [
        { date: "2026-04-14", label: "04-14", income: 980, expense: 40, grossProfit: 940 },
        { date: "2026-04-15", label: "04-15", income: 1160, expense: 80, grossProfit: 1080 },
        { date: "2026-04-16", label: "04-16", income: 860, expense: 30, grossProfit: 830 },
        { date: "2026-04-17", label: "04-17", income: 1420, expense: 0, grossProfit: 1420 },
        { date: "2026-04-18", label: "04-18", income: 1290, expense: 120, grossProfit: 1170 },
        { date: "2026-04-19", label: "04-19", income: 1680, expense: 50, grossProfit: 1630 },
        { date: "2026-04-20", label: "04-20", income: 1590, expense: 60, grossProfit: 1530 },
      ],
      currency: "CNY",
    },
    nextDelivery: {
      orderId: "MOCK-ORDER-001",
      customerName: "城西便利店",
      customerTags: ["VIP", "大客户"],
      address: "东环路 102 号",
      spec: "15kg",
      quantity: 2,
      amount: 270,
      scheduleAt: "今天 16:20",
      owedEmptyCount: 1,
      owedAmount: 120.5,
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
    redirectToLogin();
    return { success: false, error: "", errorType: "auth" };
  }

  try {
    const data = await authFetchJson(`${API_BASE_URL}/workbench/overview`);
    if (data.success) return data;
    return data;
  } catch (_err) {
    return { success: true, data: buildMockOverview(), fromMock: true };
  }
}

export async function fetchSyncQueueOverview() {
  const session = getCurrentSession();
  if (!session?.accessToken) {
    redirectToLogin();
    return { success: false, error: "", errorType: "auth" };
  }
  try {
    const data = await authFetchJson(`${API_BASE_URL}/sync/queue`);
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
    redirectToLogin();
    return { success: false, error: "", errorType: "auth" };
  }
  try {
    const data = await authFetchJson(`${API_BASE_URL}/sync/queue/batch-submit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });
    if (!data.success) {
      return { success: false, error: data.error?.message || "同步执行失败" };
    }
    return { success: true, data: data.data || {} };
  } catch (_err) {
    return { success: false, error: "同步执行失败，请检查网络后重试" };
  }
}
