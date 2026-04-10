const API_BASE_URL = "http://localhost:3100";

const storage = {
  setSession(data) {
    localStorage.setItem("auth_session", JSON.stringify(data));
  },
  getSession() {
    const raw = localStorage.getItem("auth_session");
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (_err) {
      // Corrupted session payload should not crash page bootstrap.
      localStorage.removeItem("auth_session");
      return null;
    }
  },
  clearSession() {
    localStorage.removeItem("auth_session");
  },
};

export function getCurrentSession() {
  return storage.getSession();
}

export function clearCurrentSession() {
  storage.clearSession();
}

function buildLoginUrl(message) {
  const url = new URL("./login.html", window.location.href);
  if (message) url.searchParams.set("from", message);
  return url.toString();
}

export function redirectToLogin(message = "登录态已失效，请重新登录") {
  window.location.href = buildLoginUrl(message);
}

export function ensureAuthenticatedPage() {
  const session = getCurrentSession();
  if (!session?.accessToken) {
    redirectToLogin("请先登录后再继续操作");
    return false;
  }
  return true;
}

function isUnauthorizedPayload(res, data) {
  const code = String(data?.error?.code || data?.error_code || "");
  if (res.status === 401) return true;
  return code === "AUTH_401";
}

async function parseJsonSafe(res) {
  try {
    return await res.json();
  } catch (_err) {
    return { success: false, error: "服务响应异常，请稍后重试" };
  }
}

export async function authFetchJson(url, options = {}) {
  const session = getCurrentSession();
  if (!session?.accessToken) {
    return { success: false, error: "未登录，请先登录", errorType: "auth" };
  }
  const mergedHeaders = {
    ...(options.headers || {}),
    Authorization: `Bearer ${session.accessToken}`,
  };
  const res = await fetch(url, { ...options, headers: mergedHeaders });
  const data = normalizeApiResult(await parseJsonSafe(res));
  if (isUnauthorizedPayload(res, data)) {
    clearCurrentSession();
    redirectToLogin("登录态已失效，请重新登录");
    return { success: false, error: "登录态已失效，请重新登录", errorType: "auth" };
  }
  return data;
}

function normalizeApiResult(payload) {
  if (!payload || typeof payload !== "object") return payload;
  if (payload.success && payload.error === null) {
    return payload;
  }
  if (payload.error && typeof payload.error === "object") {
    return {
      ...payload,
      error: payload.error.message || "请求失败，请稍后重试",
      error_code: payload.error.code || "",
    };
  }
  return payload;
}

export async function sendCode(phone) {
  const res = await fetch(`${API_BASE_URL}/auth/send-code`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone }),
  });
  return normalizeApiResult(await res.json());
}

export async function loginByCode(phone, code) {
  const res = await fetch(`${API_BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      phone,
      code,
      deviceName: "配送员端-Web原型",
    }),
  });
  const data = normalizeApiResult(await res.json());
  if (data.success) storage.setSession(data.data);
  return data;
}

export async function logoutCurrentSession() {
  clearCurrentSession();
  return { success: true };
}

export async function refreshTokenIfNeeded() {
  const session = storage.getSession();
  if (!session) return { success: false, error: "未登录" };
  if (Date.now() < session.accessExpiresAt - 15 * 1000) return { success: true };
  const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken: session.refreshToken }),
  });
  const data = normalizeApiResult(await res.json());
  if (data.success) {
    storage.setSession({ ...session, ...data.data });
  }
  return data;
}

export async function listDevices() {
  return authFetchJson(`${API_BASE_URL}/auth/devices`);
}
