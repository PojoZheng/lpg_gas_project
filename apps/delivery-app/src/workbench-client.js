import { authFetchJson, getCurrentSession, redirectToLogin } from "./auth-client.js";
import { API_BASE_URL } from "./api-base.js";

export async function fetchWorkbenchOverview() {
  const session = getCurrentSession();
  if (!session?.accessToken) {
    redirectToLogin();
    return { success: false, error: "", errorType: "auth" };
  }

  try {
    const data = await authFetchJson(`${API_BASE_URL}/workbench/overview`);
    if (data.success) return data;
    return { success: false, error: data?.error || "工作台加载失败，请稍后重试" };
  } catch (_err) {
    return { success: false, error: "工作台加载失败，请检查网络后重试" };
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
