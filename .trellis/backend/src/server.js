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
const financeEntries = [];
const dailyCloseRecords = [];
const customerAccounts = new Map(
  mockCustomers.map((x) => [
    x.id,
    {
      customerId: x.id,
      owedAmount: 0,
      owedEmptyCount: 0,
      collectionStatus: "none",
      collectionNote: "",
      updatedAt: Date.now(),
      lastCollectionAt: 0,
    },
  ])
);

function ensureCustomerAccount(customerId) {
  if (!customerAccounts.has(customerId)) {
    customerAccounts.set(customerId, {
      customerId,
      owedAmount: 0,
      owedEmptyCount: 0,
      collectionStatus: "none",
      collectionNote: "",
      updatedAt: Date.now(),
      lastCollectionAt: 0,
    });
  }
  return customerAccounts.get(customerId);
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
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
  const completedOrders = quickOrders.filter((x) => x.orderStatus === "completed");
  const receivedToday = completedOrders.reduce((sum, x) => sum + Number(x.receivedAmount || 0), 0);
  const pendingToday = completedOrders.reduce((sum, x) => sum + Math.max(0, Number(x.amount || 0) - Number(x.receivedAmount || 0)), 0);
  const nextPending = quickOrders.find((x) => x.orderStatus === "pending_delivery");
  return {
    finance: {
      receivedToday: Number(receivedToday.toFixed(2)),
      pendingToday: Number(pendingToday.toFixed(2)),
      currency: "CNY",
    },
    nextDelivery: nextPending
      ? {
          orderId: nextPending.orderId,
          customerName: nextPending.customerName,
          address: nextPending.address,
          scheduleAt: nextPending.scheduleAt || "尽快配送",
          orderStatus: "pending_delivery",
        }
      : {
          orderId: "暂无",
          customerName: "暂无待配送订单",
          address: "可先从快速开单创建稍后配送订单",
          scheduleAt: "待创建",
          orderStatus: "pending_delivery",
        },
    sync: {
      syncStatus: "pending",
      pendingCount: quickOrders.filter((x) => x.syncStatus !== "completed").length,
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

function startOfTodayMs() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

function isSameFinanceDay(ts) {
  return Number(ts || 0) >= startOfTodayMs();
}

function appendFinanceEntry(order, source) {
  const receivedAmount = Number(order.receivedAmount || 0);
  const amount = Number(order.amount || 0);
  const pendingAmount = Number(Math.max(0, amount - receivedAmount).toFixed(2));
  const entry = {
    entryId: `FE-${Date.now()}-${financeEntries.length + 1}`,
    orderId: order.orderId,
    customerId: order.customerId,
    customerName: order.customerName,
    source,
    amount,
    receivedAmount,
    pendingAmount,
    paymentMethod: order.paymentMethod || "",
    postedAt: Date.now(),
    status: "posted",
  };
  financeEntries.push(entry);
  return entry;
}

function voidLastFinanceEntry(orderId) {
  for (let i = financeEntries.length - 1; i >= 0; i -= 1) {
    const item = financeEntries[i];
    if (item.orderId === orderId && item.status === "posted") {
      item.status = "voided";
      item.voidedAt = Date.now();
      return item;
    }
  }
  return null;
}

function getTodayFinanceEntries() {
  return financeEntries
    .filter((x) => isSameFinanceDay(x.postedAt))
    .sort((a, b) => b.postedAt - a.postedAt);
}

function getLatestDailyClose() {
  if (!dailyCloseRecords.length) return null;
  return dailyCloseRecords[dailyCloseRecords.length - 1];
}

function buildTodayFinanceSummary() {
  const todayPosted = getTodayFinanceEntries().filter((x) => x.status === "posted");
  const receivedToday = todayPosted.reduce((sum, x) => sum + Number(x.receivedAmount || 0), 0);
  const pendingToday = todayPosted.reduce((sum, x) => sum + Number(x.pendingAmount || 0), 0);
  const latestClose = getLatestDailyClose();
  const closeStatus =
    latestClose && isSameFinanceDay(latestClose.closedAt) ? "closed" : "open";
  return {
    date: new Date(startOfTodayMs()).toISOString().slice(0, 10),
    receivedToday: Number(receivedToday.toFixed(2)),
    pendingToday: Number(pendingToday.toFixed(2)),
    entryCount: todayPosted.length,
    closeStatus,
    latestClose,
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
  if (!Number.isFinite(unitPrice) || unitPrice < 0) {
    throw new Error("单价不合法，请输入大于等于 0 的金额");
  }
  const amount = Number((unitPrice * quantity).toFixed(2));
  const orderType = payload.orderType === "immediate_complete" ? "immediate_complete" : "later_delivery";
  const orderStatus = orderType === "immediate_complete" ? "completed" : "pending_delivery";
  const paymentMethod = String(payload.paymentMethod || "").trim();
  const receivedAmount = Number(payload.receivedAmount || 0);
  if (orderType === "immediate_complete") {
    if (!["cash", "wechat", "alipay", "transfer"].includes(paymentMethod)) {
      throw new Error("收款方式不合法，请重新选择");
    }
    if (!Number.isFinite(receivedAmount) || receivedAmount < 0) {
      throw new Error("实收金额不合法，请输入有效金额");
    }
    if (receivedAmount < amount) {
      throw new Error("实收金额不能小于应收金额，请确认后再提交");
    }
  }
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
    paymentStatus: orderType === "immediate_complete" ? "paid" : "unpaid",
    paymentMethod: orderType === "immediate_complete" ? paymentMethod : "",
    receivedAmount: orderType === "immediate_complete" ? receivedAmount : 0,
    recycledEmptyCount: 0,
    owedEmptyCount: 0,
    syncStatus: "pending",
    lastAction: "",
    lastActionUndoUntil: 0,
    canModifyUntil: Date.now() + 24 * 60 * 60 * 1000,
    address: customer.address,
    scheduleAt: payload.scheduleAt || "尽快配送",
    createdAt: Date.now(),
  });
  if (orderStatus === "completed") {
    const createdOrder = quickOrders[quickOrders.length - 1];
    appendFinanceEntry(createdOrder, "quick_order_immediate_complete");
  }

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
      paymentMethod: orderType === "immediate_complete" ? paymentMethod : "",
      receivedAmount: orderType === "immediate_complete" ? receivedAmount : 0,
      inventoryAfter: {
        spec,
        available: inventoryBySpec[spec],
      },
    },
  };
}

function getPendingOrders() {
  return quickOrders
    .filter((x) => x.orderStatus === "pending_delivery")
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((x) => ({
      orderId: x.orderId,
      customerId: x.customerId,
      customerName: x.customerName,
      address: x.address,
      scheduleAt: x.scheduleAt,
      spec: x.spec,
      quantity: x.quantity,
      amount: x.amount,
      orderStatus: x.orderStatus,
      paymentStatus: x.paymentStatus,
    }));
}

function getOrderById(orderId) {
  const order = quickOrders.find((x) => x.orderId === orderId);
  if (!order) throw new Error("订单不存在，请刷新后重试");
  return order;
}

function buildCustomerAccountSummary(customerId) {
  const account = ensureCustomerAccount(customerId);
  const orders = quickOrders.filter((x) => x.customerId === customerId);
  const completed = orders.filter((x) => x.orderStatus === "completed");
  const lastOrderAt = orders.length ? Math.max(...orders.map((x) => Number(x.createdAt || 0))) : 0;
  return {
    customerId,
    owedAmount: Number(Number(account.owedAmount || 0).toFixed(2)),
    owedEmptyCount: Number(account.owedEmptyCount || 0),
    collectionStatus: account.collectionStatus || "none",
    collectionNote: account.collectionNote || "",
    updatedAt: Number(account.updatedAt || 0),
    lastCollectionAt: Number(account.lastCollectionAt || 0),
    totalOrders: orders.length,
    completedOrders: completed.length,
    lastOrderAt,
  };
}

function adjustCustomerDebt(order, owedAmount, owedEmptyCount) {
  const account = ensureCustomerAccount(order.customerId);
  account.owedAmount = Number((Number(account.owedAmount || 0) + Number(owedAmount || 0)).toFixed(2));
  account.owedEmptyCount = Math.max(0, Number(account.owedEmptyCount || 0) + Number(owedEmptyCount || 0));
  account.updatedAt = Date.now();
}

function completeDeliveryOrder(order, payload) {
  if (order.orderStatus !== "pending_delivery") {
    throw new Error("仅待配送订单可执行完单");
  }
  const receivedAmount = Number(payload.receivedAmount);
  if (!Number.isFinite(receivedAmount) || receivedAmount < 0) {
    throw new Error("实收金额必须为大于等于 0 的数字");
  }
  const paymentMethod = String(payload.paymentMethod || "").trim();
  if (!["wechat", "cash", "credit"].includes(paymentMethod)) {
    throw new Error("请选择有效收款方式");
  }
  const recycledEmptyCount = Number(payload.recycledEmptyCount || 0);
  const owedEmptyCount = Number(payload.owedEmptyCount || 0);
  if (!Number.isInteger(recycledEmptyCount) || recycledEmptyCount < 0) {
    throw new Error("回收空瓶数量必须为非负整数");
  }
  if (!Number.isInteger(owedEmptyCount) || owedEmptyCount < 0) {
    throw new Error("欠瓶数量必须为非负整数");
  }

  const prev = { orderStatus: order.orderStatus, paymentStatus: order.paymentStatus };
  order.orderStatus = "completed";
  order.receivedAmount = Number(receivedAmount.toFixed(2));
  order.paymentMethod = paymentMethod;
  order.recycledEmptyCount = recycledEmptyCount;
  order.owedEmptyCount = owedEmptyCount;
  order.paymentStatus =
    receivedAmount <= 0 ? "unpaid" : receivedAmount < order.amount ? "partial_paid" : "paid";
  order.debtRecordedAmount = Number(Math.max(0, order.amount - receivedAmount).toFixed(2));
  order.debtRecordedEmptyCount = owedEmptyCount;
  order.completedAt = Date.now();
  order.syncStatus = "pending";
  order.lastAction = "complete";
  order.lastActionUndoUntil = Date.now() + 5000;
  order.lastActionSnapshot = prev;
  adjustCustomerDebt(order, order.debtRecordedAmount, order.debtRecordedEmptyCount);
  appendFinanceEntry(order, "delivery_complete");

  return {
    orderId: order.orderId,
    orderStatus: order.orderStatus,
    paymentStatus: order.paymentStatus,
    amount: order.amount,
    receivedAmount: order.receivedAmount,
    owedAmount: order.debtRecordedAmount,
    owedEmptyCount: order.debtRecordedEmptyCount,
    undoAvailableUntil: order.lastActionUndoUntil,
  };
}

function cancelDeliveryOrder(order) {
  if (order.orderStatus !== "pending_delivery") {
    throw new Error("仅待配送订单可取消");
  }
  order.orderStatus = "cancelled";
  order.syncStatus = "pending";
  const available = Number(inventoryBySpec[order.spec] || 0);
  inventoryBySpec[order.spec] = available + Number(order.quantity || 0);
  order.lastAction = "cancel";
  order.lastActionUndoUntil = Date.now() + 5000;
  return {
    orderId: order.orderId,
    orderStatus: order.orderStatus,
    inventoryRollback: { spec: order.spec, available: inventoryBySpec[order.spec] },
    undoAvailableUntil: order.lastActionUndoUntil,
  };
}

function basicUpdateOrder(order, payload) {
  if (order.orderStatus === "cancelled") {
    throw new Error("已取消订单不允许修改");
  }
  if (Date.now() > Number(order.canModifyUntil || 0)) {
    throw new Error("订单已超过 24 小时可修改时限");
  }

  if (payload.scheduleAt !== undefined) {
    const scheduleAt = String(payload.scheduleAt || "").trim();
    if (!scheduleAt) throw new Error("配送时间不能为空");
    order.scheduleAt = scheduleAt;
  }
  if (payload.address !== undefined) {
    const address = String(payload.address || "").trim();
    if (!address) throw new Error("配送地址不能为空");
    order.address = address;
  }

  const hasQuantity = payload.quantity !== undefined;
  const hasUnitPrice = payload.unitPrice !== undefined;
  if (hasQuantity) {
    const quantity = Number(payload.quantity);
    if (!Number.isInteger(quantity) || quantity <= 0) throw new Error("数量必须为正整数");
    order.quantity = quantity;
  }
  if (hasUnitPrice) {
    const unitPrice = Number(payload.unitPrice);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) throw new Error("单价不能为负数");
    order.unitPrice = unitPrice;
  }
  if (hasQuantity || hasUnitPrice) {
    order.amount = Number((Number(order.unitPrice || 0) * Number(order.quantity || 0)).toFixed(2));
  }

  order.syncStatus = "pending";
  return {
    orderId: order.orderId,
    scheduleAt: order.scheduleAt,
    address: order.address,
    quantity: order.quantity,
    unitPrice: order.unitPrice,
    amount: order.amount,
  };
}

function undoOrderAction(order) {
  if (!order.lastAction || Date.now() > Number(order.lastActionUndoUntil || 0)) {
    throw new Error("已超过 5 秒撤销时限，请按修改流程处理");
  }
  if (order.lastAction === "complete") {
    if (!order.lastActionSnapshot) throw new Error("撤销失败，请稍后重试");
    order.orderStatus = order.lastActionSnapshot.orderStatus;
    order.paymentStatus = order.lastActionSnapshot.paymentStatus;
    order.receivedAmount = 0;
    order.paymentMethod = "";
    order.completedAt = 0;
    adjustCustomerDebt(
      order,
      -Number(order.debtRecordedAmount || 0),
      -Number(order.debtRecordedEmptyCount || 0)
    );
    voidLastFinanceEntry(order.orderId);
    order.debtRecordedAmount = 0;
    order.debtRecordedEmptyCount = 0;
  } else if (order.lastAction === "cancel") {
    order.orderStatus = "pending_delivery";
    const available = Number(inventoryBySpec[order.spec] || 0);
    inventoryBySpec[order.spec] = Math.max(0, available - Number(order.quantity || 0));
  }
  order.syncStatus = "pending";
  order.lastAction = "";
  order.lastActionUndoUntil = 0;
  return { orderId: order.orderId, orderStatus: order.orderStatus, paymentStatus: order.paymentStatus };
}

function getCustomerDetail(customerId) {
  const customer = mockCustomers.find((x) => x.id === customerId);
  if (!customer) throw new Error("客户不存在，请刷新后重试");
  return {
    ...customer,
    account: buildCustomerAccountSummary(customerId),
  };
}

function updateCollectionStatus(customerId, payload) {
  const account = ensureCustomerAccount(customerId);
  const status = String(payload.status || "").trim();
  if (!["none", "pending", "contacted", "promised", "resolved"].includes(status)) {
    throw new Error("催收状态不合法，请重新选择");
  }
  account.collectionStatus = status;
  account.collectionNote = String(payload.note || "").trim();
  account.lastCollectionAt = Date.now();
  account.updatedAt = Date.now();
  return buildCustomerAccountSummary(customerId);
}

function createDailyClose(payload) {
  const summary = buildTodayFinanceSummary();
  if (summary.closeStatus === "closed") {
    throw new Error("今日已完成日结，请勿重复提交");
  }
  const note = String(payload.note || "").trim();
  const record = {
    closeId: `DC-${Date.now()}`,
    date: summary.date,
    receivedToday: summary.receivedToday,
    pendingToday: summary.pendingToday,
    entryCount: summary.entryCount,
    note,
    status: "closed",
    closedAt: Date.now(),
  };
  dailyCloseRecords.push(record);
  return record;
}

function createCustomer(payload) {
  const name = String(payload.name || "").trim();
  const phone = String(payload.phone || "").trim();
  const address = String(payload.address || "").trim();
  if (!name) throw new Error("客户姓名不能为空");
  if (!/^1\d{10}$/.test(phone)) throw new Error("手机号格式不正确");
  if (!address) throw new Error("地址不能为空");
  if (mockCustomers.some((x) => x.phone === phone)) {
    throw new Error("该手机号已存在客户");
  }
  const customer = {
    id: `CUST-${String(mockCustomers.length + 1).padStart(3, "0")}`,
    name,
    phone,
    address,
  };
  mockCustomers.unshift(customer);
  ensureCustomerAccount(customer.id);
  return customer;
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") return sendJson(res, 200, { ok: true });
  const reqUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = reqUrl.pathname;

  try {
    if (req.method === "POST" && pathname === "/auth/send-code") {
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

    if (req.method === "POST" && pathname === "/auth/login") {
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

    if (req.method === "POST" && pathname === "/auth/refresh") {
      const { refreshToken } = await readBody(req);
      const result = refresh(refreshToken);
      return sendJson(res, 200, { success: true, data: result });
    }

    if (req.method === "GET" && pathname === "/auth/devices") {
      const accessToken = readAccessToken(req);
      const devices = listDevices(accessToken);
      return sendJson(res, 200, { success: true, data: devices });
    }

    if (req.method === "POST" && pathname === "/auth/devices/logout") {
      const accessToken = readAccessToken(req);
      const { sessionId } = await readBody(req);
      const result = logoutSession(accessToken, sessionId);
      return sendJson(res, 200, { success: true, data: result });
    }

    if (req.method === "GET" && pathname === "/workbench/overview") {
      const accessToken = readAccessToken(req);
      listDevices(accessToken);
      return sendJson(res, 200, { success: true, data: buildWorkbenchOverview() });
    }

    if (req.method === "GET" && pathname === "/customers/quick-select") {
      const accessToken = readAccessToken(req);
      listDevices(accessToken);
      return sendJson(res, 200, { success: true, data: mockCustomers });
    }

    if (req.method === "POST" && pathname === "/customers") {
      const accessToken = readAccessToken(req);
      listDevices(accessToken);
      const payload = await readBody(req);
      const customer = createCustomer(payload);
      return sendJson(res, 200, { success: true, data: customer });
    }

    if (req.method === "GET" && pathname.startsWith("/customers/") && pathname.endsWith("/detail")) {
      const accessToken = readAccessToken(req);
      listDevices(accessToken);
      const customerId = decodeURIComponent(pathname.replace("/customers/", "").replace("/detail", ""));
      return sendJson(res, 200, { success: true, data: getCustomerDetail(customerId) });
    }

    if (req.method === "PATCH" && pathname.startsWith("/customers/") && pathname.endsWith("/collection-status")) {
      const accessToken = readAccessToken(req);
      listDevices(accessToken);
      const customerId = decodeURIComponent(
        pathname.replace("/customers/", "").replace("/collection-status", "")
      );
      const payload = await readBody(req);
      return sendJson(res, 200, { success: true, data: updateCollectionStatus(customerId, payload) });
    }

    if (req.method === "POST" && pathname === "/inventory/check") {
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

    if (req.method === "POST" && pathname === "/orders/quick-create") {
      const accessToken = readAccessToken(req);
      listDevices(accessToken);
      const payload = await readBody(req);
      const result = createQuickOrder(payload);
      if (!result.success) {
        return sendJson(res, 400, { success: false, error: result.error, data: result.inventory });
      }
      return sendJson(res, 200, result);
    }

    if (req.method === "GET" && pathname === "/finance/today-summary") {
      const accessToken = readAccessToken(req);
      listDevices(accessToken);
      return sendJson(res, 200, { success: true, data: buildTodayFinanceSummary() });
    }

    if (req.method === "GET" && pathname === "/finance/entries") {
      const accessToken = readAccessToken(req);
      listDevices(accessToken);
      const onlyToday = reqUrl.searchParams.get("today") !== "0";
      const list = onlyToday
        ? getTodayFinanceEntries()
        : [...financeEntries].sort((a, b) => b.postedAt - a.postedAt);
      return sendJson(res, 200, { success: true, data: list });
    }

    if (req.method === "POST" && pathname === "/finance/daily-close") {
      const accessToken = readAccessToken(req);
      listDevices(accessToken);
      const payload = await readBody(req);
      return sendJson(res, 200, { success: true, data: createDailyClose(payload) });
    }

    if (req.method === "GET" && pathname === "/orders/pending-delivery") {
      const accessToken = readAccessToken(req);
      listDevices(accessToken);
      return sendJson(res, 200, { success: true, data: getPendingOrders() });
    }

    if (req.method === "GET" && pathname.startsWith("/orders/")) {
      const accessToken = readAccessToken(req);
      listDevices(accessToken);
      const orderId = decodeURIComponent(pathname.replace("/orders/", ""));
      if (!orderId || orderId.includes("/")) return sendJson(res, 404, { success: false, error: "接口不存在" });
      const order = getOrderById(orderId);
      return sendJson(res, 200, { success: true, data: order });
    }

    if (req.method === "POST" && pathname.endsWith("/complete")) {
      const accessToken = readAccessToken(req);
      listDevices(accessToken);
      const orderId = decodeURIComponent(pathname.replace("/orders/", "").replace("/complete", ""));
      const order = getOrderById(orderId);
      const payload = await readBody(req);
      return sendJson(res, 200, { success: true, data: completeDeliveryOrder(order, payload) });
    }

    if (req.method === "POST" && pathname.endsWith("/cancel")) {
      const accessToken = readAccessToken(req);
      listDevices(accessToken);
      const orderId = decodeURIComponent(pathname.replace("/orders/", "").replace("/cancel", ""));
      const order = getOrderById(orderId);
      return sendJson(res, 200, { success: true, data: cancelDeliveryOrder(order) });
    }

    if (req.method === "PATCH" && pathname.endsWith("/basic-update")) {
      const accessToken = readAccessToken(req);
      listDevices(accessToken);
      const orderId = decodeURIComponent(pathname.replace("/orders/", "").replace("/basic-update", ""));
      const order = getOrderById(orderId);
      const payload = await readBody(req);
      return sendJson(res, 200, { success: true, data: basicUpdateOrder(order, payload) });
    }

    if (req.method === "POST" && pathname.endsWith("/undo")) {
      const accessToken = readAccessToken(req);
      listDevices(accessToken);
      const orderId = decodeURIComponent(pathname.replace("/orders/", "").replace("/undo", ""));
      const order = getOrderById(orderId);
      return sendJson(res, 200, { success: true, data: undoOrderAction(order) });
    }

    return sendJson(res, 404, { success: false, error: "接口不存在" });
  } catch (err) {
    return sendJson(res, 400, { success: false, error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`认证服务已启动：http://localhost:${PORT}`);
});
