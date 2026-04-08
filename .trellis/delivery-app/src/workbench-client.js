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
