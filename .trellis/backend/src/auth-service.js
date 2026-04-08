const crypto = require("crypto");

const codes = new Map();
const users = new Map();
const accessTokens = new Map();
const refreshTokens = new Map();

const ACCESS_TTL_MS = 2 * 60 * 60 * 1000;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function now() {
  return Date.now();
}

function cleanupExpired() {
  const ts = now();
  for (const [token, info] of accessTokens) {
    if (info.expiresAt <= ts) accessTokens.delete(token);
  }
  for (const [token, info] of refreshTokens) {
    if (info.expiresAt <= ts) refreshTokens.delete(token);
  }
}

function issueCode(phone) {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  codes.set(phone, { code, expiresAt: now() + 5 * 60 * 1000 });
  return code;
}

function verifyCode(phone, code) {
  const record = codes.get(phone);
  if (!record) return false;
  if (record.expiresAt < now()) return false;
  return record.code === code;
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
  if (!verifyCode(phone, code)) {
    throw new Error("验证码无效或已过期");
  }
  return createSession(phone, deviceName);
}

function refresh(refreshToken) {
  cleanupExpired();
  const tokenInfo = refreshTokens.get(refreshToken);
  if (!tokenInfo) throw new Error("刷新令牌无效或已过期");
  const user = users.get(tokenInfo.phone);
  if (!user) throw new Error("用户不存在");

  const newAccessToken = crypto.randomUUID();
  const newRefreshToken = crypto.randomUUID();
  const ts = now();

  accessTokens.delete(
    user.sessions.find((x) => x.sessionId === tokenInfo.sessionId)?.accessToken
  );
  refreshTokens.delete(refreshToken);

  const session = user.sessions.find((x) => x.sessionId === tokenInfo.sessionId);
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

  return {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
    accessExpiresAt: ts + ACCESS_TTL_MS,
    refreshExpiresAt: ts + REFRESH_TTL_MS,
  };
}

function authByAccessToken(accessToken) {
  cleanupExpired();
  const tokenInfo = accessTokens.get(accessToken);
  if (!tokenInfo) throw new Error("登录态已失效");
  const user = users.get(tokenInfo.phone);
  if (!user) throw new Error("用户不存在");
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
  const { user } = authByAccessToken(accessToken);
  const session = user.sessions.find((x) => x.sessionId === sessionId);
  if (!session) return { ok: true };
  accessTokens.delete(session.accessToken);
  refreshTokens.delete(session.refreshToken);
  user.sessions = user.sessions.filter((x) => x.sessionId !== sessionId);
  return { ok: true };
}

module.exports = {
  issueCode,
  login,
  refresh,
  listDevices,
  logoutSession,
};
