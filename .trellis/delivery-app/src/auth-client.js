const API_BASE_URL = "http://localhost:3100";

const storage = {
  setSession(data) {
    localStorage.setItem("auth_session", JSON.stringify(data));
  },
  getSession() {
    const raw = localStorage.getItem("auth_session");
    return raw ? JSON.parse(raw) : null;
  },
};

export function getCurrentSession() {
  return storage.getSession();
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
  const session = storage.getSession();
  const res = await fetch(`${API_BASE_URL}/auth/devices`, {
    headers: {
      Authorization: `Bearer ${session?.accessToken || ""}`,
    },
  });
  return normalizeApiResult(await res.json());
}
