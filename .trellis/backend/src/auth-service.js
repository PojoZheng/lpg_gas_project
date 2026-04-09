const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const codes = new Map();
const users = new Map();
const accessTokens = new Map();
const refreshTokens = new Map();
const sendCodeStats = new Map();
const loginFailureStats = new Map();

const AUTH_STATE_PATH = path.join(__dirname, "..", "data", "auth-state.json");

const ACCESS_TTL_MS = 2 * 60 * 60 * 1000;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SEND_CODE_WINDOW_MS = 10 * 60 * 1000;
const SEND_CODE_MAX_PER_WINDOW = 5;
const SEND_CODE_MIN_INTERVAL_MS = 60 * 1000;
const SEND_CODE_COOLDOWN_MS = 30 * 60 * 1000;
const LOGIN_FAIL_MAX = 5;
const LOGIN_FAIL_COOLDOWN_MS = 10 * 60 * 1000;

function now() {
  return Date.now();
}

function mapToEntries(map) {
  return Array.from(map.entries());
}

function createAuthError(code, message, statusCode = 400) {
  const err = new Error(message);
  err.code = code;
  err.statusCode = statusCode;
  return err;
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || "")
  );
}

function persistState() {
  const dir = path.dirname(AUTH_STATE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const payload = {
    savedAt: now(),
    codes: mapToEntries(codes),
    users: mapToEntries(users),
    accessTokens: mapToEntries(accessTokens),
    refreshTokens: mapToEntries(refreshTokens),
    sendCodeStats: mapToEntries(sendCodeStats),
    loginFailureStats: mapToEntries(loginFailureStats),
  };
  fs.writeFileSync(AUTH_STATE_PATH, JSON.stringify(payload, null, 2), "utf-8");
}

function restoreState() {
  if (!fs.existsSync(AUTH_STATE_PATH)) return;
  const raw = fs.readFileSync(AUTH_STATE_PATH, "utf-8");
  if (!raw.trim()) return;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (_err) {
    return;
  }
  const applyEntries = (targetMap, entries) => {
    targetMap.clear();
    if (!Array.isArray(entries)) return;
    entries.forEach((item) => {
      if (!Array.isArray(item) || item.length < 2) return;
      targetMap.set(item[0], item[1]);
    });
  };
  applyEntries(codes, parsed.codes);
  applyEntries(users, parsed.users);
  applyEntries(accessTokens, parsed.accessTokens);
  applyEntries(refreshTokens, parsed.refreshTokens);
  applyEntries(sendCodeStats, parsed.sendCodeStats);
  applyEntries(loginFailureStats, parsed.loginFailureStats);
  cleanupExpired();
}

function cleanupExpired() {
  const ts = now();
  for (const [token, info] of accessTokens) {
    if (info.expiresAt <= ts) accessTokens.delete(token);
  }
  for (const [token, info] of refreshTokens) {
    if (info.expiresAt <= ts) refreshTokens.delete(token);
  }
  for (const [phone, info] of codes) {
    if (info.expiresAt <= ts) codes.delete(phone);
  }
  for (const [phone, info] of sendCodeStats) {
    if (Number(info.cooldownUntil || 0) <= ts && Number(info.windowStart || 0) + SEND_CODE_WINDOW_MS <= ts) {
      sendCodeStats.delete(phone);
    }
  }
  for (const [phone, info] of loginFailureStats) {
    if (Number(info.cooldownUntil || 0) <= ts && Number(info.lastFailedAt || 0) + LOGIN_FAIL_COOLDOWN_MS <= ts) {
      loginFailureStats.delete(phone);
    }
  }
  persistState();
}

function checkSendCodeRate(phone) {
  const ts = now();
  const info = sendCodeStats.get(phone) || {
    windowStart: ts,
    count: 0,
    lastSentAt: 0,
    cooldownUntil: 0,
  };
  if (info.cooldownUntil > ts) {
    throw createAuthError("VALIDATION_400", "验证码发送过于频繁，请稍后再试");
  }
  if (info.lastSentAt && ts - info.lastSentAt < SEND_CODE_MIN_INTERVAL_MS) {
    throw createAuthError("VALIDATION_400", "验证码发送间隔过短，请稍后再试");
  }
  if (ts - info.windowStart > SEND_CODE_WINDOW_MS) {
    info.windowStart = ts;
    info.count = 0;
  }
  info.count += 1;
  info.lastSentAt = ts;
  if (info.count > SEND_CODE_MAX_PER_WINDOW) {
    info.cooldownUntil = ts + SEND_CODE_COOLDOWN_MS;
    sendCodeStats.set(phone, info);
    persistState();
    throw createAuthError("VALIDATION_400", "验证码发送次数过多，请 30 分钟后重试");
  }
  sendCodeStats.set(phone, info);
}

function issueCode(phone) {
  checkSendCodeRate(phone);
  const code = String(Math.floor(100000 + Math.random() * 900000));
  codes.set(phone, { code, expiresAt: now() + 5 * 60 * 1000 });
  persistState();
  return code;
}

function verifyCode(phone, code) {
  const record = codes.get(phone);
  if (!record) return false;
  if (record.expiresAt < now()) return false;
  const ok = record.code === code;
  if (ok) {
    codes.delete(phone);
    persistState();
  }
  return ok;
}

function createOrGetUser(phone) {
  if (!users.has(phone)) {
    users.set(phone, {
      id: crypto.randomUUID(),
      phone,
      nickname: `配送员${phone.slice(0, 3)}****${phone.slice(-4)}`,
      sessions: [],
    });
  }
  return users.get(phone);
}

function createSession(phone, deviceName = "未知设备") {
  cleanupExpired();
  const user = createOrGetUser(phone);
  const sessionId = crypto.randomUUID();
  const accessToken = crypto.randomUUID();
  const refreshToken = crypto.randomUUID();
  const createdAt = now();
  const session = {
    sessionId,
    deviceName,
    createdAt,
    accessToken,
    refreshToken,
  };
  user.sessions.push(session);
  accessTokens.set(accessToken, {
    userId: user.id,
    phone,
    sessionId,
    expiresAt: createdAt + ACCESS_TTL_MS,
  });
  refreshTokens.set(refreshToken, {
    userId: user.id,
    phone,
    sessionId,
    expiresAt: createdAt + REFRESH_TTL_MS,
  });
  persistState();
  return {
    user,
    sessionId,
    accessToken,
    refreshToken,
    accessExpiresAt: createdAt + ACCESS_TTL_MS,
    refreshExpiresAt: createdAt + REFRESH_TTL_MS,
  };
}

function login(phone, code, deviceName) {
  const ts = now();
  const failInfo = loginFailureStats.get(phone);
  if (failInfo && Number(failInfo.cooldownUntil || 0) > ts) {
    throw createAuthError("VALIDATION_400", "验证码校验失败次数过多，请稍后再试");
  }
  if (!verifyCode(phone, code)) {
    const nextFail = {
      failedCount: Number(failInfo?.failedCount || 0) + 1,
      lastFailedAt: ts,
      cooldownUntil: 0,
    };
    if (nextFail.failedCount >= LOGIN_FAIL_MAX) {
      nextFail.cooldownUntil = ts + LOGIN_FAIL_COOLDOWN_MS;
      nextFail.failedCount = 0;
    }
    loginFailureStats.set(phone, nextFail);
    persistState();
    throw createAuthError("VALIDATION_400", "验证码无效或已过期，请重新获取");
  }
  loginFailureStats.delete(phone);
  persistState();
  return createSession(phone, deviceName);
}

function refresh(refreshToken) {
  cleanupExpired();
  if (!isUuid(refreshToken)) {
    throw createAuthError("AUTH_401", "登录态无效或已过期，请重新登录", 401);
  }
  const tokenInfo = refreshTokens.get(refreshToken);
  if (!tokenInfo) throw createAuthError("AUTH_401", "登录态无效或已过期，请重新登录", 401);
  const user = users.get(tokenInfo.phone);
  if (!user) throw createAuthError("AUTH_401", "登录态无效或已过期，请重新登录", 401);

  const newAccessToken = crypto.randomUUID();
  const newRefreshToken = crypto.randomUUID();
  const ts = now();

  accessTokens.delete(
    user.sessions.find((x) => x.sessionId === tokenInfo.sessionId)?.accessToken
  );
  refreshTokens.delete(refreshToken);

  const session = user.sessions.find((x) => x.sessionId === tokenInfo.sessionId);
  if (!session || session.refreshToken !== refreshToken) {
    throw createAuthError("AUTH_401", "登录态无效或已过期，请重新登录", 401);
  }
  session.accessToken = newAccessToken;
  session.refreshToken = newRefreshToken;

  accessTokens.set(newAccessToken, {
    userId: user.id,
    phone: tokenInfo.phone,
    sessionId: tokenInfo.sessionId,
    expiresAt: ts + ACCESS_TTL_MS,
  });
  refreshTokens.set(newRefreshToken, {
    userId: user.id,
    phone: tokenInfo.phone,
    sessionId: tokenInfo.sessionId,
    expiresAt: ts + REFRESH_TTL_MS,
  });
  persistState();

  return {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
    accessExpiresAt: ts + ACCESS_TTL_MS,
    refreshExpiresAt: ts + REFRESH_TTL_MS,
  };
}

function authByAccessToken(accessToken) {
  cleanupExpired();
  if (!isUuid(accessToken)) {
    throw createAuthError("AUTH_401", "登录态无效或已过期，请重新登录", 401);
  }
  const tokenInfo = accessTokens.get(accessToken);
  if (!tokenInfo) throw createAuthError("AUTH_401", "登录态无效或已过期，请重新登录", 401);
  const user = users.get(tokenInfo.phone);
  if (!user) throw createAuthError("AUTH_401", "登录态无效或已过期，请重新登录", 401);
  return { user, tokenInfo };
}

function listDevices(accessToken) {
  const { user } = authByAccessToken(accessToken);
  return user.sessions.map((s) => ({
    sessionId: s.sessionId,
    deviceName: s.deviceName,
    createdAt: s.createdAt,
  }));
}

function logoutSession(accessToken, sessionId) {
  const { user, tokenInfo } = authByAccessToken(accessToken);
  if (!isUuid(sessionId)) {
    throw createAuthError("VALIDATION_400", "设备会话标识不合法");
  }
  if (tokenInfo.sessionId === sessionId) {
    throw createAuthError("VALIDATION_400", "当前会话不支持在本设备下线");
  }
  const session = user.sessions.find((x) => x.sessionId === sessionId);
  if (!session) {
    throw createAuthError("VALIDATION_400", "设备会话不存在或已下线");
  }
  accessTokens.delete(session.accessToken);
  refreshTokens.delete(session.refreshToken);
  user.sessions = user.sessions.filter((x) => x.sessionId !== sessionId);
  persistState();
  return { ok: true };
}

restoreState();

module.exports = {
  issueCode,
  login,
  refresh,
  listDevices,
  logoutSession,
};
