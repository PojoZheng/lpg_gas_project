import { authFetchJson, getCurrentSession, redirectToLogin } from "./auth-client.js";
import { API_BASE_URL } from "./api-base.js";

export async function fetchOfflineQueue() {
  const session = getCurrentSession();
  if (!session?.accessToken) {
    redirectToLogin();
    return { success: false, error: "", errorType: "auth" };
  }
  try {
    const data = await authFetchJson(`${API_BASE_URL}/sync/queue`);
    if (!data.success) {
      return { success: false, error: data.error?.message || "离线队列读取失败" };
    }
    const payload = data.data || {};
    return {
      success: true,
      data: {
        stats: payload.stats || {},
        items: Array.isArray(payload.items) ? payload.items : [],
      },
    };
  } catch (_err) {
    return { success: false, error: "离线队列读取失败，请稍后重试" };
  }
}

export async function submitOfflineQueueBatch(offlineIds = []) {
  const session = getCurrentSession();
  if (!session?.accessToken) {
    redirectToLogin();
    return { success: false, error: "", errorType: "auth" };
  }
  try {
    const body = Array.isArray(offlineIds) && offlineIds.length ? { offlineIds } : {};
    const data = await authFetchJson(`${API_BASE_URL}/sync/queue/batch-submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!data.success) {
      return { success: false, error: data.error?.message || "手动提交失败" };
    }
    return { success: true, data: data.data || {} };
  } catch (_err) {
    return { success: false, error: "手动提交失败，请稍后重试" };
  }
}

export async function enqueueOfflineChange(payload) {
  const session = getCurrentSession();
  if (!session?.accessToken) {
    redirectToLogin();
    return { success: false, error: "", errorType: "auth" };
  }
  try {
    const data = await authFetchJson(`${API_BASE_URL}/sync/queue/enqueue`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {}),
    });
    if (!data.success) {
      return { success: false, error: data.error?.message || "加入离线队列失败" };
    }
    return { success: true, data: data.data || {} };
  } catch (_err) {
    return { success: false, error: "加入离线队列失败，请稍后重试" };
  }
}
