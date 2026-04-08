const http = require("http");
const {
  issueCode,
  login,
  refresh,
  listDevices,
  logoutSession,
} = require("./auth-service");

const PORT = 3100;
const mockCustomers = [
  { id: "CUST-001", name: "城南餐馆", phone: "13800000001", address: "城南路 18 号" },
  { id: "CUST-002", name: "向阳便利店", phone: "13800000002", address: "向阳街 66 号" },
  { id: "CUST-003", name: "东港小区李阿姨", phone: "13800000003", address: "东港小区 2 栋 301" },
];
const inventoryBySpec = {
  "10kg": 8,
  "15kg": 12,
  "50kg": 3,
};
const quickOrders = [];

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

function buildWorkbenchOverview() {
  return {
    finance: {
      receivedToday: 1680,
      pendingToday: 520,
      currency: "CNY",
    },
    nextDelivery: {
      orderId: "ORD-20260408-001",
      customerName: "城北五金店",
      address: "城北大道 88 号",
      scheduleAt: "今天 15:30",
      orderStatus: "pending_delivery",
    },
    sync: {
      syncStatus: "pending",
      pendingCount: 3,
      lastSyncAt: Date.now() - 2 * 60 * 1000,
    },
    quickActions: [
      {
        id: "quick_order",
        label: "快速开单",
        route: "/orders/quick-create",
      },
    ],
  };
}

function createQuickOrder(payload) {
  const customer = mockCustomers.find((x) => x.id === payload.customerId);
  if (!customer) {
    throw new Error("客户不存在，请重新选择");
  }

  const spec = payload.spec || "15kg";
  const quantity = Number(payload.quantity || 1);
  if (!["10kg", "15kg", "50kg"].includes(spec)) {
    throw new Error("气瓶规格不支持");
  }
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new Error("数量必须为正整数");
  }

  const available = Number(inventoryBySpec[spec] || 0);
  if (available < quantity) {
    return {
      success: false,
      error: `库存不足：${spec} 可用 ${available} 瓶`,
      inventory: { spec, available, requested: quantity },
    };
  }

  const unitPrice = Number(payload.unitPrice || 0);
  const amount = Number((unitPrice * quantity).toFixed(2));
  const orderType = payload.orderType === "immediate_complete" ? "immediate_complete" : "later_delivery";
  const orderStatus = orderType === "immediate_complete" ? "completed" : "pending_delivery";
  const orderId = `ORD-${Date.now()}`;

  inventoryBySpec[spec] = available - quantity;
  quickOrders.push({
    orderId,
    customerId: customer.id,
    customerName: customer.name,
    orderType,
    orderStatus,
    spec,
    quantity,
    unitPrice,
    amount,
    createdAt: Date.now(),
  });

  return {
    success: true,
    data: {
      orderId,
      customer,
      orderType,
      orderStatus,
      spec,
      quantity,
      amount,
      inventoryAfter: {
        spec,
        available: inventoryBySpec[spec],
      },
    },
  };
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

    if (req.method === "GET" && req.url === "/workbench/overview") {
      const accessToken = readAccessToken(req);
      listDevices(accessToken);
      return sendJson(res, 200, { success: true, data: buildWorkbenchOverview() });
    }

    if (req.method === "GET" && req.url === "/customers/quick-select") {
      const accessToken = readAccessToken(req);
      listDevices(accessToken);
      return sendJson(res, 200, { success: true, data: mockCustomers });
    }

    if (req.method === "POST" && req.url === "/inventory/check") {
      const accessToken = readAccessToken(req);
      listDevices(accessToken);
      const { spec, quantity } = await readBody(req);
      const available = Number(inventoryBySpec[spec] || 0);
      const requested = Number(quantity || 0);
      return sendJson(res, 200, {
        success: true,
        data: {
          spec,
          available,
          requested,
          canCreate: available >= requested,
        },
      });
    }

    if (req.method === "POST" && req.url === "/orders/quick-create") {
      const accessToken = readAccessToken(req);
      listDevices(accessToken);
      const payload = await readBody(req);
      const result = createQuickOrder(payload);
      if (!result.success) {
        return sendJson(res, 400, { success: false, error: result.error, data: result.inventory });
      }
      return sendJson(res, 200, result);
    }

    return sendJson(res, 404, { success: false, error: "接口不存在" });
  } catch (err) {
    return sendJson(res, 400, { success: false, error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`认证服务已启动：http://localhost:${PORT}`);
});
