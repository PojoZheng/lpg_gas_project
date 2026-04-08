const http = require("http");
const {
  issueCode,
  login,
  refresh,
  listDevices,
  logoutSession,
} = require("./auth-service");

const PORT = 3100;

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (err) {
        reject(new Error("请求体不是合法 JSON"));
      }
    });
  });
}

function readAccessToken(req) {
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) return "";
  return auth.slice(7);
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") return sendJson(res, 200, { ok: true });

  try {
    if (req.method === "POST" && req.url === "/auth/send-code") {
      const { phone } = await readBody(req);
      if (!/^1\d{10}$/.test(phone || "")) {
        return sendJson(res, 400, { success: false, error: "手机号格式不正确" });
      }
      const code = issueCode(phone);
      return sendJson(res, 200, {
        success: true,
        data: { message: "验证码已发送", dev_code: code },
      });
    }

    if (req.method === "POST" && req.url === "/auth/login") {
      const { phone, code, deviceName } = await readBody(req);
      const result = login(phone, code, deviceName || "网页端");
      return sendJson(res, 200, {
        success: true,
        data: {
          user: {
            id: result.user.id,
            phone: result.user.phone,
            nickname: result.user.nickname,
          },
          sessionId: result.sessionId,
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          accessExpiresAt: result.accessExpiresAt,
          refreshExpiresAt: result.refreshExpiresAt,
        },
      });
    }

    if (req.method === "POST" && req.url === "/auth/refresh") {
      const { refreshToken } = await readBody(req);
      const result = refresh(refreshToken);
      return sendJson(res, 200, { success: true, data: result });
    }

    if (req.method === "GET" && req.url === "/auth/devices") {
      const accessToken = readAccessToken(req);
      const devices = listDevices(accessToken);
      return sendJson(res, 200, { success: true, data: devices });
    }

    if (req.method === "POST" && req.url === "/auth/devices/logout") {
      const accessToken = readAccessToken(req);
      const { sessionId } = await readBody(req);
      const result = logoutSession(accessToken, sessionId);
      return sendJson(res, 200, { success: true, data: result });
    }

    return sendJson(res, 404, { success: false, error: "接口不存在" });
  } catch (err) {
    return sendJson(res, 400, { success: false, error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`认证服务已启动：http://localhost:${PORT}`);
});
