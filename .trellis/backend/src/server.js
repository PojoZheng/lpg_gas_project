const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const {
  issueCode,
  login,
  refresh,
  listDevices,
  logoutSession,
} = require("./auth-service");

const PORT = Number(process.env.PORT || 3100);
const CUSTOMER_LEDGER_PATH =
  process.env.TRELLIS_CUSTOMER_LEDGER_PATH ||
  path.join(__dirname, "..", "data", "customer-ledger.json");
const mockCustomers = [
  { id: "CUST-001", name: "城南餐馆", phone: "13800000001", address: "城南路 18 号", tags: ["VIP", "大客户"] },
  { id: "CUST-002", name: "向阳便利店", phone: "13800000002", address: "向阳街 66 号", tags: ["免押金"] },
  { id: "CUST-003", name: "东港小区李阿姨", phone: "13800000003", address: "东港小区 2 栋 301", tags: [] },
];
const inventoryBySpec = {
  "10kg": { onHand: 8, locked: 0, pendingInspection: 0 },
  "15kg": { onHand: 12, locked: 0, pendingInspection: 0 },
  "50kg": { onHand: 3, locked: 0, pendingInspection: 0 },
};
const quickOrders = [];
const inventoryLogs = [];
const safetyRecords = [];
const offlineQueue = [];
const policyVersions = [
  {
    version: "v1.0.0",
    regionCode: "CN-DEFAULT",
    content: {
      safetyCheckRequired: true,
      maxRetry: 3,
      syncBatchSize: 20,
    },
    status: "active",
    publishedAt: Date.now() - 24 * 60 * 60 * 1000,
    publishedBy: "system",
    rolledBackFrom: "",
  },
];
const policyAuditLogs = [];

function getInventoryState(spec) {
  if (!inventoryBySpec[spec]) throw new Error("气瓶规格不支持");
  const onHand = Number(inventoryBySpec[spec].onHand || 0);
  const locked = Number(inventoryBySpec[spec].locked || 0);
  const pendingInspection = Number(inventoryBySpec[spec].pendingInspection || 0);
  const available = Math.max(0, onHand - locked);
  return { spec, onHand, locked, pendingInspection, available };
}

function moveToPendingInspection(spec, quantity, orderId) {
  const state = getInventoryState(spec);
  inventoryBySpec[spec].pendingInspection = state.pendingInspection + quantity;
  pushInventoryLog("to_inspection", spec, 0, 0, orderId);
  return getInventoryState(spec);
}

function pushInventoryLog(type, spec, deltaOnHand, deltaLocked, orderId) {
  inventoryLogs.unshift({
    id: `INV-LOG-${Date.now()}`,
    type,
    spec,
    deltaOnHand,
    deltaLocked,
    orderId,
    createdAt: Date.now(),
  });
  if (inventoryLogs.length > 200) inventoryLogs.pop();
}

function lockInventory(spec, quantity, orderId) {
  const state = getInventoryState(spec);
  if (state.available < quantity) {
    return {
      success: false,
      error: `库存不足：${spec} 可用 ${state.available} 瓶`,
      inventory: { spec, available: state.available, requested: quantity, locked: state.locked, onHand: state.onHand },
    };
  }
  inventoryBySpec[spec].locked = state.locked + quantity;
  pushInventoryLog("lock", spec, 0, quantity, orderId);
  return { success: true, inventoryAfter: getInventoryState(spec) };
}

function releaseLockedInventory(spec, quantity, orderId) {
  const state = getInventoryState(spec);
  if (state.locked < quantity) throw new Error(`锁定库存异常：${spec} 锁定量不足，需人工处理`);
  inventoryBySpec[spec].locked = state.locked - quantity;
  pushInventoryLog("release", spec, 0, -quantity, orderId);
  return getInventoryState(spec);
}

function consumeInventoryFromLock(spec, quantity, orderId) {
  const released = releaseLockedInventory(spec, quantity, orderId);
  if (released.onHand < quantity) throw new Error(`库存冲突：${spec} 在途扣减失败，需人工处理`);
  inventoryBySpec[spec].onHand = released.onHand - quantity;
  pushInventoryLog("consume", spec, -quantity, 0, orderId);
  return getInventoryState(spec);
}

function directConsumeInventory(spec, quantity, orderId) {
  const state = getInventoryState(spec);
  if (state.available < quantity) {
    return {
      success: false,
      error: `库存不足：${spec} 可用 ${state.available} 瓶`,
      inventory: { spec, available: state.available, requested: quantity, locked: state.locked, onHand: state.onHand },
    };
  }
  inventoryBySpec[spec].onHand = state.onHand - quantity;
  pushInventoryLog("direct_consume", spec, -quantity, 0, orderId);
  return { success: true, inventoryAfter: getInventoryState(spec) };
}

function returnInventoryToOnHand(spec, quantity, orderId) {
  const state = getInventoryState(spec);
  inventoryBySpec[spec].onHand = state.onHand + quantity;
  pushInventoryLog("modify_return", spec, quantity, 0, orderId);
  return getInventoryState(spec);
}

function appendOrderModifyLog(order, changes) {
  if (!changes || !Object.keys(changes).length) return;
  if (!Array.isArray(order.modifyLogs)) order.modifyLogs = [];
  order.modifyLogs.push({ at: Date.now(), changes });
  if (order.modifyLogs.length > 120) {
    order.modifyLogs.splice(0, order.modifyLogs.length - 120);
  }
}

function processOrderReturn(orderId, payload) {
  const order = quickOrders.find((x) => x.orderId === orderId);
  if (!order) throw new Error("订单不存在");
  if (order.orderStatus !== "completed") throw new Error("只有已完成订单可申请退货");
  
  const completedAt = Number(order.completedAt || order.createdAt || 0);
  const hoursSinceComplete = (Date.now() - completedAt) / (60 * 60 * 1000);
  if (hoursSinceComplete > 24) throw new Error("订单完成超过24小时，无法退货");

  const { reason, reasonDetail, bottleReturned, bottleBarcode, refundAmount, refundMethod, note } = payload;
  if (!reason) throw new Error("请选择退货原因");
  if (!bottleReturned) throw new Error("请确认已收回气瓶");
  if (!Number.isFinite(refundAmount) || refundAmount < 0) throw new Error("退款金额不合法");
  if (!["cash", "original", "wechat", "alipay"].includes(refundMethod)) throw new Error("退款方式不合法");

  const recordId = `RET-${Date.now()}`;
  const returnRecord = {
    id: recordId,
    orderId,
    customerId: order.customerId,
    customerName: order.customerName,
    spec: order.spec,
    quantity: order.quantity,
    reason: reason || "",
    reasonDetail: reasonDetail || "",
    bottleReturned: Boolean(bottleReturned),
    bottleBarcode: bottleBarcode || "",
    refundAmount: Number(refundAmount) || 0,
    refundMethod: refundMethod || "cash",
    note: note || "",
    originalAmount: order.receivedAmount || order.amount || 0,
    createdAt: Date.now(),
  };
  returnRecords.unshift(returnRecord);
  if (returnRecords.length > 200) returnRecords.pop();

  order.orderStatus = "returned";
  order.returnedAt = Date.now();
  order.returnRecordId = recordId;

  returnInventoryToOnHand(order.spec, order.quantity, orderId);
  pushInventoryLog("order_return", order.spec, order.quantity, 0, orderId);

  const originalReceived = Number(order.receivedAmount || 0);
  if (originalReceived > 0) {
    const reversalEntry = {
      id: `FIN-RET-${Date.now()}`,
      type: "return_reversal",
      orderId,
      amount: -Math.min(refundAmount, originalReceived),
      method: refundMethod,
      createdAt: Date.now(),
      note: `退货退款：${reason}${note ? " - " + note : ""}`,
    };
    financeEntries.unshift(reversalEntry);
    if (financeEntries.length > 500) financeEntries.pop();
  }

  return {
    success: true,
    data: {
      order: {
        orderId: order.orderId,
        orderStatus: order.orderStatus,
        returnedAt: order.returnedAt,
      },
      returnRecord: {
        id: returnRecord.id,
        refundAmount: returnRecord.refundAmount,
        refundMethod: returnRecord.refundMethod,
      },
      inventoryChange: {
        spec: order.spec,
        delta: order.quantity,
      },
    },
  };
}

const exchangeRecords = [];

function processOrderExchange(orderId, payload) {
  const order = quickOrders.find((x) => x.orderId === orderId);
  if (!order) throw new Error("订单不存在");
  if (order.orderStatus !== "completed") throw new Error("只有已完成订单可申请换货");
  
  const completedAt = Number(order.completedAt || order.createdAt || 0);
  const minutesSinceComplete = (Date.now() - completedAt) / (60 * 1000);
  if (minutesSinceComplete > 5) throw new Error("订单完成超过5分钟，无法快捷换货");

  const { reason, bottleReturned, newQuantity, priceDiff, diffHandling, note } = payload;
  if (!reason) throw new Error("请选择换货原因");
  if (!bottleReturned) throw new Error("请确认已收回气瓶");
  if (!Number.isInteger(newQuantity) || newQuantity < 1) throw new Error("新单数量必须为正整数");
  if (!Number.isFinite(priceDiff)) throw new Error("差价金额不合法");
  if (!["no_diff", "customer_pays", "refund_customer"].includes(diffHandling)) {
    throw new Error("差价处理方式不合法");
  }

  const exchangeId = `EXC-${Date.now()}`;
  const now = Date.now();

  const exchangeRecord = {
    id: exchangeId,
    originalOrderId: orderId,
    customerId: order.customerId,
    customerName: order.customerName,
    originalSpec: order.spec,
    originalQuantity: order.quantity,
    newQuantity,
    reason: reason || "",
    bottleReturned: Boolean(bottleReturned),
    priceDiff: Number(priceDiff) || 0,
    diffHandling,
    note: note || "",
    createdAt: now,
  };
  exchangeRecords.unshift(exchangeRecord);
  if (exchangeRecords.length > 200) exchangeRecords.pop();

  order.orderStatus = "exchanged";
  order.exchangedAt = now;
  order.exchangeRecordId = exchangeId;

  moveToPendingInspection(order.spec, order.quantity, orderId);

  const newOrderId = `ORD-${now + 1}`;
  const unitPrice = Number(order.unitPrice || 0);
  const newAmount = Number((unitPrice * newQuantity).toFixed(2));
  
  let actualReceivedAmount = 0;
  let paymentMethod = "";
  if (diffHandling === "customer_pays" && priceDiff > 0) {
    actualReceivedAmount = priceDiff;
    paymentMethod = "cash";
  } else if (diffHandling === "refund_customer" && priceDiff < 0) {
    actualReceivedAmount = 0;
  }

  const newOrder = {
    orderId: newOrderId,
    customerId: order.customerId,
    customerName: order.customerName,
    orderType: "immediate_complete",
    orderStatus: "completed",
    spec: order.spec,
    quantity: newQuantity,
    unitPrice: unitPrice,
    amount: newAmount,
    paymentStatus: actualReceivedAmount >= newAmount ? "paid" : (actualReceivedAmount > 0 ? "partial_paid" : "unpaid"),
    paymentMethod: paymentMethod,
    receivedAmount: actualReceivedAmount,
    recycledEmptyCount: 0,
    owedEmptyCount: 0,
    syncStatus: "pending",
    lastAction: "",
    lastActionUndoUntil: 0,
    canModifyUntil: now + 24 * 60 * 60 * 1000,
    address: order.address,
    scheduleAt: "当场完成",
    inventoryStage: "consumed",
    createdAt: now,
    completedAt: now,
    modifyLogs: [],
    driverNote: `换货新单，关联原单：${orderId}${note ? "，备注：" + note : ""}`,
    originalOrderId: orderId,
    exchangeId: exchangeId,
  };

  const inventoryResult = directConsumeInventory(order.spec, newQuantity, newOrderId);
  if (!inventoryResult.success) {
    throw new Error(inventoryResult.error || "库存不足");
  }

  quickOrders.push(newOrder);

  if (actualReceivedAmount > 0) {
    appendFinanceEntry(newOrder, "exchange_new_order");
  }

  if (diffHandling === "refund_customer" && priceDiff < 0) {
    const refundEntry = {
      id: `FIN-EXC-REF-${now}`,
      type: "exchange_refund",
      orderId: newOrderId,
      amount: priceDiff,
      method: "cash",
      createdAt: now,
      note: `换货退差：原单${orderId} -> 新单${newOrderId}`,
    };
    financeEntries.unshift(refundEntry);
    if (financeEntries.length > 500) financeEntries.pop();
  }

  return {
    success: true,
    data: {
      originalOrder: {
        orderId: order.orderId,
        orderStatus: order.orderStatus,
        exchangedAt: order.exchangedAt,
      },
      newOrder: {
        orderId: newOrder.orderId,
        quantity: newOrder.quantity,
        amount: newOrder.amount,
        receivedAmount: newOrder.receivedAmount,
      },
      exchangeRecord: {
        id: exchangeRecord.id,
        priceDiff: exchangeRecord.priceDiff,
        diffHandling: exchangeRecord.diffHandling,
      },
      inventoryChange: {
        spec: order.spec,
        originalToInspection: order.quantity,
        newConsumed: newQuantity,
      },
    },
  };
}
const financeEntries = [];
const returnRecords = [];
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
      collectionHistory: [],
    },
  ])
);

const COLLECTION_STATUS_SET = new Set(["none", "pending", "contacted", "promised", "resolved"]);

function normalizeCustomerAccountRecord(customerId, raw) {
  const collectionHistory = Array.isArray(raw?.collectionHistory)
    ? raw.collectionHistory
        .map((e) => ({
          changedAt: Number(e?.changedAt || 0),
          status: COLLECTION_STATUS_SET.has(String(e?.status || "").trim())
            ? String(e.status).trim()
            : "none",
          note: String(e?.note || "").trim().slice(0, 500),
        }))
        .filter((e) => e.changedAt > 0)
        .slice(-200)
    : [];
  const st = String(raw?.collectionStatus || "").trim();
  return {
    customerId,
    owedAmount: Number(Number(raw?.owedAmount ?? 0).toFixed(2)),
    owedEmptyCount: Math.max(0, Number(raw?.owedEmptyCount ?? 0)),
    collectionStatus: COLLECTION_STATUS_SET.has(st) ? st : "none",
    collectionNote: String(raw?.collectionNote || "").trim().slice(0, 500),
    updatedAt: Number(raw?.updatedAt || 0) || Date.now(),
    lastCollectionAt: Number(raw?.lastCollectionAt || 0),
    collectionHistory,
  };
}

function persistCustomerLedger() {
  const dir = path.dirname(CUSTOMER_LEDGER_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const accounts = Array.from(customerAccounts.entries()).map(([id, row]) => [
    id,
    {
      customerId: id,
      owedAmount: row.owedAmount,
      owedEmptyCount: row.owedEmptyCount,
      collectionStatus: row.collectionStatus,
      collectionNote: row.collectionNote,
      updatedAt: row.updatedAt,
      lastCollectionAt: row.lastCollectionAt,
      collectionHistory: Array.isArray(row.collectionHistory) ? row.collectionHistory : [],
    },
  ]);
  fs.writeFileSync(
    CUSTOMER_LEDGER_PATH,
    JSON.stringify({ savedAt: Date.now(), accounts }, null, 2),
    "utf-8"
  );
}

function restoreCustomerLedger() {
  if (!fs.existsSync(CUSTOMER_LEDGER_PATH)) return;
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(CUSTOMER_LEDGER_PATH, "utf-8"));
  } catch (_err) {
    return;
  }
  if (!parsed || !Array.isArray(parsed.accounts)) return;
  for (const entry of parsed.accounts) {
    if (!Array.isArray(entry) || entry.length < 2) continue;
    const customerId = String(entry[0] || "").trim();
    if (!customerId) continue;
    customerAccounts.set(customerId, normalizeCustomerAccountRecord(customerId, entry[1]));
  }
}

restoreCustomerLedger();

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
      collectionHistory: [],
    });
  }
  const row = customerAccounts.get(customerId);
  if (!Array.isArray(row.collectionHistory)) row.collectionHistory = [];
  return row;
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

function sendContractSuccess(res, statusCode, data, requestId) {
  return sendJson(res, statusCode, {
    success: true,
    data,
    error: null,
    request_id: requestId,
  });
}

function sendContractError(res, statusCode, code, message, requestId) {
  return sendJson(res, statusCode, {
    success: false,
    data: null,
    error: { code, message },
    request_id: requestId,
  });
}

function mapAuthError(err, pathname) {
  const message = String(err?.message || "请求失败，请稍后重试");
  if (err?.code === "AUTH_401") {
    return { statusCode: Number(err.statusCode || 401), code: "AUTH_401", message: "登录态无效或已过期，请重新登录" };
  }
  if (err?.code === "VALIDATION_400") {
    return { statusCode: 400, code: "VALIDATION_400", message };
  }
  if (message.includes("登录态已失效") || message.includes("刷新令牌无效")) {
    return { statusCode: 401, code: "AUTH_401", message: "登录态无效或已过期，请重新登录" };
  }
  if (pathname === "/auth/login" && message.includes("验证码无效或已过期")) {
    return { statusCode: 400, code: "VALIDATION_400", message: "验证码无效或已过期，请重新获取" };
  }
  if (pathname === "/auth/send-code" && message.includes("手机号")) {
    return { statusCode: 400, code: "VALIDATION_400", message: "手机号格式不正确" };
  }
  return { statusCode: 400, code: "VALIDATION_400", message };
}

function mapOrderError(err) {
  const message = String(err?.message || "订单请求失败，请稍后重试");
  if (err?.code === "AUTH_401") {
    return { statusCode: Number(err.statusCode || 401), code: "AUTH_401", message: "登录态无效或已过期，请重新登录" };
  }
  if (message.includes("库存不足") || message.includes("库存冲突")) {
    return { statusCode: 409, code: "INVENTORY_409_STOCK", message };
  }
  return { statusCode: 400, code: "VALIDATION_400", message };
}

function hasConcreteSchedule(scheduleAt) {
  const t = String(scheduleAt || "").trim();
  if (!t || t === "尽快配送" || t === "待创建") return false;
  return true;
}

function getNextWorkbenchDeliveryOrder() {
  const pending = quickOrders.filter((x) => x.orderStatus === "pending_delivery");
  if (!pending.length) return null;
  pending.sort((a, b) => {
    const ar = hasConcreteSchedule(a.scheduleAt) ? 0 : 1;
    const br = hasConcreteSchedule(b.scheduleAt) ? 0 : 1;
    if (ar !== br) return ar - br;
    if (ar === 0) {
      const c = String(a.scheduleAt || "").localeCompare(String(b.scheduleAt || ""), "zh-CN");
      if (c !== 0) return c;
    }
    return (a.createdAt || 0) - (b.createdAt || 0);
  });
  return pending[0];
}

function buildNextDeliveryPayload(order) {
  if (!order) {
    return {
      orderId: null,
      customerName: null,
      customerTags: [],
      address: null,
      spec: null,
      quantity: null,
      amount: null,
      scheduleAt: null,
      owedEmptyCount: null,
      owedAmount: null,
      orderStatus: null,
    };
  }
  const customer = mockCustomers.find((c) => c.id === order.customerId);
  const tags = Array.isArray(customer?.tags) ? customer.tags : [];
  const account = order.customerId ? buildCustomerAccountSummary(order.customerId) : {};
  return {
    orderId: order.orderId,
    customerName: order.customerName,
    customerTags: tags,
    address: order.address,
    spec: order.spec,
    quantity: order.quantity,
    amount: Number(Number(order.amount || 0).toFixed(2)),
    scheduleAt: order.scheduleAt || "尽快配送",
    owedEmptyCount: Number(account.owedEmptyCount || 0),
    owedAmount: Number(Number(account.owedAmount || 0).toFixed(2)),
    orderStatus: "pending_delivery",
  };
}

function buildWorkbenchOverview() {
  const completedOrders = quickOrders.filter((x) => x.orderStatus === "completed");
  const receivedToday = completedOrders.reduce((sum, x) => sum + Number(x.receivedAmount || 0), 0);
  const pendingToday = completedOrders.reduce((sum, x) => sum + Math.max(0, Number(x.amount || 0) - Number(x.receivedAmount || 0)), 0);
  const nextPending = getNextWorkbenchDeliveryOrder();
  return {
    finance: {
      receivedToday: Number(receivedToday.toFixed(2)),
      pendingToday: Number(pendingToday.toFixed(2)),
      currency: "CNY",
    },
    nextDelivery: buildNextDeliveryPayload(nextPending),
    sync: {
      syncStatus: offlineQueue.some((x) => x.syncStatus === "failed")
        ? "failed"
        : offlineQueue.some((x) => x.syncStatus === "syncing")
          ? "syncing"
          : offlineQueue.some((x) => x.syncStatus === "pending")
            ? "pending"
            : "completed",
      pendingCount: offlineQueue.filter((x) => x.syncStatus !== "completed").length,
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

  let inventoryResult;
  if (orderType === "later_delivery") {
    inventoryResult = lockInventory(spec, quantity, orderId);
    if (!inventoryResult.success) return inventoryResult;
  } else {
    inventoryResult = directConsumeInventory(spec, quantity, orderId);
    if (!inventoryResult.success) return inventoryResult;
  }
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
    inventoryStage: orderType === "later_delivery" ? "locked" : "consumed",
    createdAt: Date.now(),
    modifyLogs: [],
    driverNote: "",
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
        available: inventoryResult.inventoryAfter.available,
        onHand: inventoryResult.inventoryAfter.onHand,
        locked: inventoryResult.inventoryAfter.locked,
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
      inventoryStage: x.inventoryStage,
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
  persistCustomerLedger();
}

function getSafetyByOrderId(orderId) {
  return safetyRecords.find((x) => x.orderId === orderId);
}

function getSafetyById(safetyId) {
  const record = safetyRecords.find((x) => x.safetyId === safetyId);
  if (!record) throw new Error("安检记录不存在，请刷新后重试");
  return record;
}

function ensureSafetyTriggered(order) {
  let record = getSafetyByOrderId(order.orderId);
  if (record) return record;
  record = {
    safetyId: `SAFE-${Date.now()}`,
    orderId: order.orderId,
    customerName: order.customerName,
    status: "pending", // pending -> completed / failed
    checkItems: [],
    photoUrls: [],
    hasAbnormal: false,
    hazardNote: "",
    reportAttempts: 0,
    reportLogs: [],
    lastError: "",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  safetyRecords.unshift(record);
  return record;
}

function normalizeSafetyItems(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((x) => String(x || "").trim())
    .filter(Boolean)
    .slice(0, 20);
}

function normalizePhotoUrls(photoUrls) {
  if (!Array.isArray(photoUrls)) return [];
  return photoUrls
    .map((x) => String(x || "").trim())
    .filter(Boolean)
    .slice(0, 10);
}

function runSafetyReport(record) {
  record.reportAttempts += 1;
  const shouldFail = record.reportAttempts === 1 && record.hasAbnormal;
  if (shouldFail) {
    record.status = "failed";
    record.lastError = "监管上报超时，请点击重试";
    record.reportLogs.unshift({
      at: Date.now(),
      status: "failed",
      summary: record.lastError,
    });
    return;
  }
  record.status = "completed";
  record.lastError = "";
  record.reportLogs.unshift({
    at: Date.now(),
    status: "completed",
    summary: "监管上报成功",
  });
}

function submitSafetyRecord(orderId, payload) {
  const order = getOrderById(orderId);
  const record = ensureSafetyTriggered(order);
  const checkItems = normalizeSafetyItems(payload.checkItems);
  const photoUrls = normalizePhotoUrls(payload.photoUrls);
  if (!checkItems.length) throw new Error("请至少选择 1 项安检检查项");
  if (!photoUrls.length) throw new Error("请至少上传 1 张安检照片");
  const hasAbnormal = Boolean(payload.hasAbnormal);
  const hazardNote = String(payload.hazardNote || "").trim();
  if (hasAbnormal && !hazardNote) {
    throw new Error("异常安检必须补充隐患说明");
  }

  record.checkItems = checkItems;
  record.photoUrls = photoUrls;
  record.hasAbnormal = hasAbnormal;
  record.hazardNote = hazardNote;
  record.updatedAt = Date.now();
  runSafetyReport(record);

  return {
    safetyId: record.safetyId,
    orderId: record.orderId,
    status: record.status,
    reportAttempts: record.reportAttempts,
    lastError: record.lastError,
    updatedAt: record.updatedAt,
  };
}

function retrySafetyReport(safetyId) {
  const record = getSafetyById(safetyId);
  if (!record.checkItems.length || !record.photoUrls.length) {
    throw new Error("安检信息不完整，请先提交检查项与照片");
  }
  runSafetyReport(record);
  record.updatedAt = Date.now();
  return {
    safetyId: record.safetyId,
    orderId: record.orderId,
    status: record.status,
    reportAttempts: record.reportAttempts,
    lastError: record.lastError,
    updatedAt: record.updatedAt,
  };
}

function enqueueOfflineChange(payload) {
  const entityType = String(payload.entityType || "").trim();
  const action = String(payload.action || "").trim();
  const changePayload = payload.payload || {};
  if (!["order", "inventory", "customer"].includes(entityType)) {
    throw new Error("同步实体类型不支持");
  }
  if (!action) {
    throw new Error("同步动作不能为空");
  }
  const offlineId = String(payload.offlineId || `OFF-${Date.now()}`);
  if (offlineQueue.some((x) => x.offlineId === offlineId)) {
    return offlineQueue.find((x) => x.offlineId === offlineId);
  }
  const item = {
    offlineId,
    entityType,
    action,
    payload: changePayload,
    syncStatus: "pending",
    retryCount: 0,
    manualRequired: false,
    conflictType: "",
    lastError: "",
    resultSummary: "",
    nextRetryAt: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  offlineQueue.unshift(item);
  return item;
}

function detectSyncConflict(item) {
  if (item.entityType === "order") {
    const orderId = String(item.payload.orderId || "");
    const localStatus = String(item.payload.orderStatus || "");
    const serverOrder = quickOrders.find((x) => x.orderId === orderId);
    if (serverOrder && localStatus && localStatus !== serverOrder.orderStatus) {
      return {
        conflictType: "order_status_conflict",
        message: `订单状态冲突：服务端为 ${serverOrder.orderStatus}，本地为 ${localStatus}`,
      };
    }
  }
  if (item.entityType === "inventory") {
    const spec = String(item.payload.spec || "");
    const baseOnHand = Number(item.payload.baseOnHand);
    if (spec && Number.isFinite(baseOnHand) && inventoryBySpec[spec]) {
      const serverOnHand = getInventoryState(spec).onHand;
      if (serverOnHand !== baseOnHand) {
        return {
          conflictType: "inventory_baseline_conflict",
          message: `库存基线冲突：服务端 ${serverOnHand}，本地基线 ${baseOnHand}`,
        };
      }
    }
  }
  return null;
}

function syncOneOfflineItem(item) {
  if (item.nextRetryAt && Date.now() < Number(item.nextRetryAt)) {
    return {
      offlineId: item.offlineId,
      syncStatus: item.syncStatus,
      conflictType: item.conflictType,
      manualRequired: item.manualRequired,
      message: "未到重试时间，请稍后再试",
      nextRetryAt: item.nextRetryAt,
    };
  }
  item.syncStatus = "syncing";
  item.updatedAt = Date.now();
  const conflict = detectSyncConflict(item);
  if (conflict) {
    item.retryCount += 1;
    item.syncStatus = "failed";
    item.conflictType = conflict.conflictType;
    item.lastError = conflict.message;
    item.resultSummary = "检测到冲突，待处理";
    if (item.retryCount >= 3) {
      item.manualRequired = true;
      item.resultSummary = "重试已达上限，需人工处理";
      item.nextRetryAt = 0;
    } else {
      // 指数退避：2s, 4s, 8s
      item.nextRetryAt = Date.now() + 1000 * Math.pow(2, item.retryCount);
    }
    item.updatedAt = Date.now();
    return {
      offlineId: item.offlineId,
      syncStatus: item.syncStatus,
      conflictType: item.conflictType,
      manualRequired: item.manualRequired,
      message: item.lastError,
      nextRetryAt: item.nextRetryAt,
    };
  }
  item.syncStatus = "completed";
  item.conflictType = "";
  item.lastError = "";
  item.resultSummary = "同步成功";
  item.nextRetryAt = 0;
  item.updatedAt = Date.now();
  return {
    offlineId: item.offlineId,
    syncStatus: item.syncStatus,
    conflictType: "",
    manualRequired: false,
    message: "同步成功",
    nextRetryAt: 0,
  };
}

function batchSyncOfflineQueue(payload) {
  const inputIds = Array.isArray(payload.offlineIds) ? payload.offlineIds : [];
  const idSet = new Set(inputIds.map((x) => String(x)));
  const targets = offlineQueue.filter((x) => {
    if (idSet.size > 0 && !idSet.has(x.offlineId)) return false;
    if (x.syncStatus === "completed") return false;
    if (x.nextRetryAt && Date.now() < Number(x.nextRetryAt)) return false;
    return !x.manualRequired;
  });
  const results = targets.map((x) => syncOneOfflineItem(x));
  return {
    total: results.length,
    completed: results.filter((x) => x.syncStatus === "completed").length,
    failed: results.filter((x) => x.syncStatus === "failed").length,
    manualRequired: results.filter((x) => x.manualRequired).length,
    results,
  };
}

function retryOfflineItem(offlineId) {
  const item = offlineQueue.find((x) => x.offlineId === offlineId);
  if (!item) throw new Error("离线队列记录不存在");
  if (item.manualRequired) throw new Error("该记录已进入人工处理，请先人工确认");
  if (item.nextRetryAt && Date.now() < Number(item.nextRetryAt)) {
    throw new Error("未到重试时间，请稍后再试");
  }
  return syncOneOfflineItem(item);
}

function markOfflineManual(offlineId) {
  const item = offlineQueue.find((x) => x.offlineId === offlineId);
  if (!item) throw new Error("离线队列记录不存在");
  item.manualRequired = true;
  item.syncStatus = "failed";
  item.resultSummary = "已转人工处理";
  item.nextRetryAt = 0;
  item.updatedAt = Date.now();
  return {
    offlineId: item.offlineId,
    syncStatus: item.syncStatus,
    manualRequired: item.manualRequired,
    message: "已转人工处理",
  };
}

function getActivePolicy() {
  return policyVersions.find((x) => x.status === "active") || null;
}

function addPolicyAudit(action, operator, detail) {
  policyAuditLogs.unshift({
    id: `AUD-${Date.now()}`,
    action,
    operator: operator || "unknown",
    detail,
    createdAt: Date.now(),
  });
  if (policyAuditLogs.length > 200) policyAuditLogs.pop();
}

function savePolicyDraft(payload) {
  const regionCode = String(payload.regionCode || "CN-DEFAULT").trim();
  const content = payload.content && typeof payload.content === "object" ? payload.content : {};
  const draftVersion = `v${new Date().toISOString().slice(0, 19).replace(/[-T:]/g, ".")}`;
  const draft = {
    version: draftVersion,
    regionCode,
    content,
    status: "draft",
    publishedAt: 0,
    publishedBy: "",
    rolledBackFrom: "",
  };
  policyVersions.unshift(draft);
  addPolicyAudit("edit", payload.operator, `编辑策略草稿 ${draftVersion}`);
  return draft;
}

function publishPolicy(payload) {
  const version = String(payload.version || "").trim();
  const operator = String(payload.operator || "unknown").trim();
  const target = policyVersions.find((x) => x.version === version);
  if (!target) throw new Error("目标策略版本不存在");
  policyVersions.forEach((x) => {
    if (x.status === "active") x.status = "history";
  });
  target.status = "active";
  target.publishedAt = Date.now();
  target.publishedBy = operator;
  addPolicyAudit("publish", operator, `发布策略 ${version}`);
  return target;
}

function rollbackPolicy(payload) {
  const toVersion = String(payload.toVersion || "").trim();
  const operator = String(payload.operator || "unknown").trim();
  const target = policyVersions.find((x) => x.version === toVersion);
  if (!target) throw new Error("回滚目标版本不存在");
  const current = getActivePolicy();
  policyVersions.forEach((x) => {
    if (x.status === "active") x.status = "history";
  });
  target.status = "active";
  target.rolledBackFrom = current ? current.version : "";
  target.publishedAt = Date.now();
  target.publishedBy = operator;
  addPolicyAudit("rollback", operator, `回滚到策略 ${toVersion}`);
  return target;
}

function buildBusinessMetrics() {
  const completed = quickOrders.filter((x) => x.orderStatus === "completed");
  const pendingDelivery = quickOrders.filter((x) => x.orderStatus === "pending_delivery");
  const failedSync = offlineQueue.filter((x) => x.syncStatus === "failed");
  const totalRevenue = completed.reduce((sum, x) => sum + Number(x.receivedAmount || 0), 0);
  const pendingReceivable = completed.reduce(
    (sum, x) => sum + Math.max(0, Number(x.amount || 0) - Number(x.receivedAmount || 0)),
    0
  );
  return {
    order: {
      totalOrders: quickOrders.length,
      completedOrders: completed.length,
      pendingDeliveryOrders: pendingDelivery.length,
    },
    finance: {
      totalRevenue: Number(totalRevenue.toFixed(2)),
      pendingReceivable: Number(pendingReceivable.toFixed(2)),
    },
    inventory: Object.keys(inventoryBySpec).map((spec) => getInventoryState(spec)),
    sync: {
      failedCount: failedSync.length,
      manualRequiredCount: offlineQueue.filter((x) => x.manualRequired).length,
    },
  };
}

function buildComplianceMetrics() {
  const total = safetyRecords.length;
  const completed = safetyRecords.filter((x) => x.status === "completed").length;
  const failed = safetyRecords.filter((x) => x.status === "failed").length;
  const pending = safetyRecords.filter((x) => x.status === "pending").length;
  const abnormal = safetyRecords.filter((x) => x.hasAbnormal).length;
  return {
    summary: { total, completed, failed, pending, abnormal },
    failedList: safetyRecords
      .filter((x) => x.status === "failed")
      .slice(0, 50)
      .map((x) => ({
        safetyId: x.safetyId,
        orderId: x.orderId,
        customerName: x.customerName,
        reportAttempts: x.reportAttempts,
        lastError: x.lastError,
        updatedAt: x.updatedAt,
      })),
  };
}

function getOfflineQueueStats(items) {
  const list = Array.isArray(items) ? items : [];
  return {
    pending: list.filter((x) => x.syncStatus === "pending").length,
    syncing: list.filter((x) => x.syncStatus === "syncing").length,
    failed: list.filter((x) => x.syncStatus === "failed").length,
    completed: list.filter((x) => x.syncStatus === "completed").length,
    manualRequired: list.filter((x) => x.manualRequired).length,
    conflict: list.filter((x) => Boolean(x.conflictType)).length,
  };
}

function listOfflineQueue(filters) {
  const status = String(filters.status || "all").trim();
  const entityType = String(filters.entityType || "all").trim();
  const keyword = String(filters.keyword || "").trim().toLowerCase();
  const manualOnly = String(filters.manualOnly || "0").trim() === "1";
  const conflictOnly = String(filters.conflictOnly || "0").trim() === "1";
  const items = offlineQueue.filter((x) => {
    if (status !== "all" && x.syncStatus !== status) return false;
    if (entityType !== "all" && x.entityType !== entityType) return false;
    if (manualOnly && !x.manualRequired) return false;
    if (conflictOnly && !x.conflictType) return false;
    if (keyword) {
      const haystack = [
        x.offlineId,
        x.entityType,
        x.action,
        x.conflictType,
        x.lastError,
        x.resultSummary,
        JSON.stringify(x.payload || {}),
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(keyword)) return false;
    }
    return true;
  });
  return {
    items: items.slice(0, 100),
    stats: getOfflineQueueStats(offlineQueue),
    filteredStats: getOfflineQueueStats(items),
  };
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
  const inventoryAfter = consumeInventoryFromLock(order.spec, Number(order.quantity || 0), order.orderId);
  order.debtRecordedAmount = Number(Math.max(0, order.amount - receivedAmount).toFixed(2));
  order.debtRecordedEmptyCount = owedEmptyCount;
  order.completedAt = Date.now();
  order.syncStatus = "pending";
  order.inventoryStage = "consumed";
  order.lastAction = "complete";
  order.lastActionUndoUntil = Date.now() + 5000;
  order.lastActionSnapshot = prev;
  order.canModifyUntil = Date.now() + 24 * 60 * 60 * 1000;
  adjustCustomerDebt(order, order.debtRecordedAmount, order.debtRecordedEmptyCount);
  const safetyRecord = ensureSafetyTriggered(order);
  appendFinanceEntry(order, "delivery_complete");

  return {
    orderId: order.orderId,
    orderStatus: order.orderStatus,
    paymentStatus: order.paymentStatus,
    amount: order.amount,
    receivedAmount: order.receivedAmount,
    inventoryAfter,
    owedAmount: order.debtRecordedAmount,
    owedEmptyCount: order.debtRecordedEmptyCount,
    safety: {
      safetyId: safetyRecord.safetyId,
      status: safetyRecord.status,
    },
    undoAvailableUntil: order.lastActionUndoUntil,
  };
}

function cancelDeliveryOrder(order) {
  if (order.orderStatus !== "pending_delivery") {
    throw new Error("仅待配送订单可取消");
  }
  const inventoryAfter = releaseLockedInventory(order.spec, Number(order.quantity || 0), order.orderId);
  order.orderStatus = "cancelled";
  order.syncStatus = "pending";
  order.inventoryStage = "released";
  order.lastAction = "cancel";
  order.lastActionUndoUntil = Date.now() + 5000;
  return {
    orderId: order.orderId,
    orderStatus: order.orderStatus,
    inventoryRollback: inventoryAfter,
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

  const changes = {};
  const snapDebtRecorded = Number(order.debtRecordedAmount || 0);
  const wasCompleted = order.orderStatus === "completed";

  if (payload.scheduleAt !== undefined) {
    const scheduleAt = String(payload.scheduleAt || "").trim();
    if (!scheduleAt) throw new Error("配送时间不能为空");
    if (order.scheduleAt !== scheduleAt) changes.scheduleAt = { before: order.scheduleAt, after: scheduleAt };
    order.scheduleAt = scheduleAt;
  }
  if (payload.address !== undefined) {
    const address = String(payload.address || "").trim();
    if (!address) throw new Error("配送地址不能为空");
    if (order.address !== address) changes.address = { before: order.address, after: address };
    order.address = address;
  }

  const hasQuantity = payload.quantity !== undefined;
  const hasUnitPrice = payload.unitPrice !== undefined;

  if (hasQuantity) {
    const nextQuantity = Number(payload.quantity);
    if (!Number.isInteger(nextQuantity) || nextQuantity <= 0) throw new Error("数量必须为正整数");
    const delta = nextQuantity - Number(order.quantity || 0);
    if (order.orderStatus === "pending_delivery") {
      if (delta > 0) {
        const lockResult = lockInventory(order.spec, delta, order.orderId);
        if (!lockResult.success) throw new Error(lockResult.error);
      } else if (delta < 0) {
        releaseLockedInventory(order.spec, Math.abs(delta), order.orderId);
      }
    } else if (order.orderStatus === "completed" && delta !== 0) {
      if (delta > 0) {
        const inv = directConsumeInventory(order.spec, delta, order.orderId);
        if (!inv.success) throw new Error(inv.error);
      } else {
        returnInventoryToOnHand(order.spec, Math.abs(delta), order.orderId);
      }
    }
    if (Number(order.quantity) !== nextQuantity) {
      changes.quantity = { before: order.quantity, after: nextQuantity };
    }
    order.quantity = nextQuantity;
  }

  if (hasUnitPrice) {
    const unitPrice = Number(payload.unitPrice);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) throw new Error("单价不能为负数");
    if (Number(order.unitPrice) !== unitPrice) {
      changes.unitPrice = { before: order.unitPrice, after: unitPrice };
    }
    order.unitPrice = unitPrice;
  }
  if (hasQuantity || hasUnitPrice) {
    const nextAmount = Number((Number(order.unitPrice || 0) * Number(order.quantity || 0)).toFixed(2));
    if (Number(order.amount) !== nextAmount) {
      changes.amount = { before: order.amount, after: nextAmount };
    }
    order.amount = nextAmount;
  }

  let touchedReceipt = false;
  if (payload.receivedAmount !== undefined && wasCompleted) {
    const nextReceived = Number(Number(payload.receivedAmount).toFixed(2));
    if (!Number.isFinite(nextReceived) || nextReceived < 0) throw new Error("实收金额不合法");
    if (Number(order.receivedAmount) !== nextReceived) {
      changes.receivedAmount = { before: order.receivedAmount, after: nextReceived };
      order.receivedAmount = nextReceived;
      touchedReceipt = true;
    }
  }

  if (payload.driverNote !== undefined) {
    const note = String(payload.driverNote || "").trim().slice(0, 500);
    const prevNote = String(order.driverNote || "");
    if (prevNote !== note) {
      changes.driverNote = { before: prevNote, after: note };
      order.driverNote = note;
    }
  }

  if (wasCompleted && order.orderStatus === "completed") {
    const amt = Number(order.amount || 0);
    const rec = Number(order.receivedAmount || 0);
    order.paymentStatus = rec <= 0 ? "unpaid" : rec < amt ? "partial_paid" : "paid";
    const newDebt = Number(Math.max(0, amt - rec).toFixed(2));
    if (newDebt !== snapDebtRecorded || touchedReceipt || hasQuantity || hasUnitPrice) {
      adjustCustomerDebt(order, newDebt - snapDebtRecorded, 0);
      order.debtRecordedAmount = newDebt;
    }
  }

  order.syncStatus = "pending";
  appendOrderModifyLog(order, changes);

  return {
    orderId: order.orderId,
    scheduleAt: order.scheduleAt,
    address: order.address,
    quantity: order.quantity,
    unitPrice: order.unitPrice,
    amount: order.amount,
    receivedAmount: order.receivedAmount,
    paymentStatus: order.paymentStatus,
    debtRecordedAmount: order.debtRecordedAmount,
    driverNote: order.driverNote || "",
    canModifyUntil: order.canModifyUntil,
    modifyLogs: Array.isArray(order.modifyLogs) ? order.modifyLogs.slice(-20) : [],
  };
}

function undoOrderAction(order) {
  if (!order.lastAction || Date.now() > Number(order.lastActionUndoUntil || 0)) {
    throw new Error("已超过 5 秒撤销时限，请按修改流程处理");
  }
  if (order.lastAction === "complete") {
    if (!order.lastActionSnapshot) throw new Error("撤销失败，请稍后重试");
    const state = getInventoryState(order.spec);
    inventoryBySpec[order.spec].onHand = state.onHand + Number(order.quantity || 0);
    inventoryBySpec[order.spec].locked = state.locked + Number(order.quantity || 0);
    pushInventoryLog("undo_complete", order.spec, Number(order.quantity || 0), Number(order.quantity || 0), order.orderId);
    order.orderStatus = order.lastActionSnapshot.orderStatus;
    order.paymentStatus = order.lastActionSnapshot.paymentStatus;
    order.receivedAmount = 0;
    order.paymentMethod = "";
    order.completedAt = 0;
    order.inventoryStage = "locked";
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
    const state = getInventoryState(order.spec);
    if (state.available < Number(order.quantity || 0)) {
      throw new Error("撤销失败：可用库存不足，需人工处理");
    }
    inventoryBySpec[order.spec].locked = state.locked + Number(order.quantity || 0);
    pushInventoryLog("undo_cancel", order.spec, 0, Number(order.quantity || 0), order.orderId);
    order.inventoryStage = "locked";
  }
  order.syncStatus = "pending";
  order.lastAction = "";
  order.lastActionUndoUntil = 0;
  return { orderId: order.orderId, orderStatus: order.orderStatus, paymentStatus: order.paymentStatus };
}

function getRecentCollectionHistoryEntries(rawAccount, limit) {
  const list = Array.isArray(rawAccount.collectionHistory) ? [...rawAccount.collectionHistory] : [];
  return list.slice(-limit).reverse();
}

function buildAccountSummaryConsistency(summary, rawAccount) {
  const history = Array.isArray(rawAccount.collectionHistory) ? rawAccount.collectionHistory : [];
  if (!history.length) {
    return { ok: true, message: "暂无催收变更记录；摘要与台账字段一致。" };
  }
  const last = history[history.length - 1];
  const statusOk = String(last.status || "") === String(summary.collectionStatus || "");
  const noteOk = String(last.note || "") === String(summary.collectionNote || "");
  const timeOk = Number(last.changedAt || 0) === Number(summary.lastCollectionAt || 0);
  if (statusOk && noteOk && timeOk) {
    return { ok: true, message: "最近一条催收记录与当前摘要一致。" };
  }
  return {
    ok: false,
    message: "最近一条催收记录与摘要存在差异，请刷新后重试。",
    checks: { statusMatch: statusOk, noteMatch: noteOk, lastActionTimeMatch: timeOk },
  };
}

function getCustomerDetail(customerId) {
  const customer = mockCustomers.find((x) => x.id === customerId);
  if (!customer) throw new Error("客户不存在，请刷新后重试");
  const rawAccount = ensureCustomerAccount(customerId);
  const account = buildCustomerAccountSummary(customerId);
  return {
    ...customer,
    account,
    collectionHistory: getRecentCollectionHistoryEntries(rawAccount, 20),
    accountSummaryConsistency: buildAccountSummaryConsistency(account, rawAccount),
  };
}

function updateCollectionStatus(customerId, payload) {
  const account = ensureCustomerAccount(customerId);
  const status = String(payload.status || "").trim();
  if (!COLLECTION_STATUS_SET.has(status)) {
    throw new Error("催收状态不合法，请重新选择");
  }
  const newNote = String(payload.note || "").trim().slice(0, 500);
  const prevStatus = account.collectionStatus;
  const prevNote = String(account.collectionNote || "").trim();
  const changed = prevStatus !== status || prevNote !== newNote;
  account.collectionStatus = status;
  account.collectionNote = newNote;
  const ts = Date.now();
  account.lastCollectionAt = ts;
  account.updatedAt = ts;
  if (changed) {
    account.collectionHistory.push({ changedAt: ts, status, note: newNote });
    if (account.collectionHistory.length > 200) {
      account.collectionHistory.splice(0, account.collectionHistory.length - 200);
    }
  }
  persistCustomerLedger();
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
  const tagList = Array.isArray(payload.tags)
    ? payload.tags.map((t) => String(t || "").trim()).filter(Boolean).slice(0, 12)
    : [];
  const customer = {
    id: `CUST-${String(mockCustomers.length + 1).padStart(3, "0")}`,
    name,
    phone,
    address,
    tags: tagList,
  };
  mockCustomers.unshift(customer);
  ensureCustomerAccount(customer.id);
  persistCustomerLedger();
  return customer;
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") return sendJson(res, 200, { ok: true });
  const reqUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = reqUrl.pathname;
  const requestId = crypto.randomUUID();

  try {
    if (req.method === "POST" && pathname === "/auth/send-code") {
      const { phone } = await readBody(req);
      if (!/^1\d{10}$/.test(phone || "")) {
        return sendContractError(res, 400, "VALIDATION_400", "手机号格式不正确", requestId);
      }
      const code = issueCode(phone);
      return sendContractSuccess(res, 200, { message: "验证码已发送", dev_code: code }, requestId);
    }

    if (req.method === "POST" && pathname === "/auth/login") {
      const { phone, code, deviceName } = await readBody(req);
      const result = login(phone, code, deviceName || "网页端");
      return sendContractSuccess(
        res,
        200,
        {
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
        requestId
      );
    }

    if (req.method === "POST" && pathname === "/auth/refresh") {
      const { refreshToken } = await readBody(req);
      const result = refresh(refreshToken);
      return sendContractSuccess(res, 200, result, requestId);
    }

    if (req.method === "GET" && pathname === "/auth/devices") {
      const accessToken = readAccessToken(req);
      const devices = listDevices(accessToken);
      return sendContractSuccess(res, 200, devices, requestId);
    }

    if (req.method === "POST" && pathname === "/auth/devices/logout") {
      const accessToken = readAccessToken(req);
      const { sessionId } = await readBody(req);
      const result = logoutSession(accessToken, sessionId);
      return sendContractSuccess(res, 200, result, requestId);
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
      const state = getInventoryState(spec);
      const requested = Number(quantity || 0);
      return sendJson(res, 200, {
        success: true,
        data: {
          spec,
          available: state.available,
          onHand: state.onHand,
          locked: state.locked,
          requested,
          canCreate: state.available >= requested,
        },
      });
    }

    if (req.method === "GET" && pathname === "/inventory/snapshot") {
      const accessToken = readAccessToken(req);
      listDevices(accessToken);
      const data = Object.keys(inventoryBySpec).map((spec) => getInventoryState(spec));
      return sendJson(res, 200, { success: true, data, logs: inventoryLogs.slice(0, 20) });
    }

    if (req.method === "POST" && pathname === "/orders/quick-create") {
      try {
        const accessToken = readAccessToken(req);
        listDevices(accessToken);
        const payload = await readBody(req);
        const result = createQuickOrder(payload);
        if (!result.success) {
          return sendContractError(res, 409, "INVENTORY_409_STOCK", result.error, requestId);
        }
        return sendContractSuccess(res, 200, result.data, requestId);
      } catch (orderErr) {
        const mapped = mapOrderError(orderErr);
        return sendContractError(res, mapped.statusCode, mapped.code, mapped.message, requestId);
      }
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

    if (req.method === "GET" && pathname === "/orders") {
      const accessToken = readAccessToken(req);
      listDevices(accessToken);
      
      // 解析分页参数
      const page = Math.max(1, parseInt(reqUrl.searchParams.get("page") || "1", 10));
      const size = Math.min(100, Math.max(1, parseInt(reqUrl.searchParams.get("size") || "20", 10)));
      
      // 解析筛选参数
      const status = reqUrl.searchParams.get("status") || "all";
      const keyword = (reqUrl.searchParams.get("keyword") || "").trim().toLowerCase();
      
      // 筛选订单
      let filteredOrders = quickOrders;
      
      // 状态筛选
      if (status !== "all") {
        filteredOrders = filteredOrders.filter(order => order.orderStatus === status);
      }
      
      // 关键词搜索（客户姓名、地址、订单号模糊匹配）
      if (keyword) {
        filteredOrders = filteredOrders.filter(order => {
          const matchOrderId = order.orderId.toLowerCase().includes(keyword);
          const matchCustomerName = order.customerName.toLowerCase().includes(keyword);
          const matchAddress = (order.address || "").toLowerCase().includes(keyword);
          return matchOrderId || matchCustomerName || matchAddress;
        });
      }
      
      // 排序：按创建时间倒序（最新的在前）
      filteredOrders.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      
      // 分页
      const total = filteredOrders.length;
      const start = (page - 1) * size;
      const end = start + size;
      const list = filteredOrders.slice(start, end).map(order => ({
        id: order.orderId,
        customer_id: order.customerId,
        customer_name: order.customerName,
        address: order.address,
        status: order.orderStatus,
        cylinders: [{ spec: order.spec, quantity: order.quantity }],
        total_amount: order.amount,
        created_at: order.createdAt,
        appointment_time: order.scheduleAt || null
      }));
      
      return sendJson(res, 200, { 
        success: true, 
        data: {
          total,
          page,
          size,
          list
        }
      });
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

    if (req.method === "POST" && pathname.endsWith("/return")) {
      const accessToken = readAccessToken(req);
      listDevices(accessToken);
      const orderId = decodeURIComponent(pathname.replace("/orders/", "").replace("/return", ""));
      const payload = await readBody(req);
      const result = processOrderReturn(orderId, payload);
      return sendJson(res, 200, result);
    }

    if (req.method === "POST" && pathname.endsWith("/exchange")) {
      const accessToken = readAccessToken(req);
      listDevices(accessToken);
      const orderId = decodeURIComponent(pathname.replace("/orders/", "").replace("/exchange", ""));
      const payload = await readBody(req);
      const result = processOrderExchange(orderId, payload);
      return sendJson(res, 200, result);
    }

    if (req.method === "GET" && pathname.startsWith("/safety/by-order/")) {
      const accessToken = readAccessToken(req);
      listDevices(accessToken);
      const orderId = decodeURIComponent(pathname.replace("/safety/by-order/", ""));
      const record = getSafetyByOrderId(orderId);
      if (!record) {
        return sendJson(res, 200, { success: true, data: null });
      }
      return sendJson(res, 200, {
        success: true,
        data: {
          safetyId: record.safetyId,
          orderId: record.orderId,
          status: record.status,
          checkItems: record.checkItems,
          photoUrls: record.photoUrls,
          hasAbnormal: record.hasAbnormal,
          hazardNote: record.hazardNote,
          reportAttempts: record.reportAttempts,
          lastError: record.lastError,
          reportLogs: record.reportLogs.slice(0, 5),
          updatedAt: record.updatedAt,
        },
      });
    }

    if (req.method === "POST" && pathname.startsWith("/safety/by-order/")) {
      const accessToken = readAccessToken(req);
      listDevices(accessToken);
      const orderId = decodeURIComponent(pathname.replace("/safety/by-order/", ""));
      const payload = await readBody(req);
      const data = submitSafetyRecord(orderId, payload);
      return sendJson(res, 200, { success: true, data });
    }

    if (req.method === "POST" && pathname.startsWith("/safety/") && pathname.endsWith("/retry")) {
      const accessToken = readAccessToken(req);
      listDevices(accessToken);
      const safetyId = decodeURIComponent(pathname.replace("/safety/", "").replace("/retry", ""));
      const data = retrySafetyReport(safetyId);
      return sendJson(res, 200, { success: true, data });
    }

    if (req.method === "GET" && pathname === "/sync/queue") {
      const accessToken = readAccessToken(req);
      listDevices(accessToken);
      const filters = {
        status: reqUrl.searchParams.get("status") || "all",
        entityType: reqUrl.searchParams.get("entityType") || "all",
        keyword: reqUrl.searchParams.get("keyword") || "",
        manualOnly: reqUrl.searchParams.get("manualOnly") || "0",
        conflictOnly: reqUrl.searchParams.get("conflictOnly") || "0",
      };
      const queueView = listOfflineQueue(filters);
      return sendJson(res, 200, {
        success: true,
        data: {
          stats: {
            ...queueView.stats,
            waitingRetry:
              queueView.stats?.waitingRetry ??
              offlineQueue.filter((x) => x.nextRetryAt && Date.now() < Number(x.nextRetryAt)).length,
          },
          filteredStats: queueView.filteredStats,
          items: queueView.items,
          filters,
        },
      });
    }

    if (req.method === "POST" && pathname === "/sync/queue/enqueue") {
      const accessToken = readAccessToken(req);
      listDevices(accessToken);
      const payload = await readBody(req);
      const data = enqueueOfflineChange(payload);
      return sendJson(res, 200, { success: true, data });
    }

    if (req.method === "POST" && pathname === "/sync/queue/batch-submit") {
      const accessToken = readAccessToken(req);
      listDevices(accessToken);
      const payload = await readBody(req);
      const data = batchSyncOfflineQueue(payload);
      return sendJson(res, 200, { success: true, data });
    }

    if (req.method === "POST" && pathname.startsWith("/sync/queue/") && pathname.endsWith("/retry")) {
      const accessToken = readAccessToken(req);
      listDevices(accessToken);
      const offlineId = decodeURIComponent(pathname.replace("/sync/queue/", "").replace("/retry", ""));
      const data = retryOfflineItem(offlineId);
      return sendJson(res, 200, { success: true, data });
    }

    if (req.method === "POST" && pathname.startsWith("/sync/queue/") && pathname.endsWith("/manual")) {
      const accessToken = readAccessToken(req);
      listDevices(accessToken);
      const offlineId = decodeURIComponent(pathname.replace("/sync/queue/", "").replace("/manual", ""));
      const data = markOfflineManual(offlineId);
      return sendJson(res, 200, { success: true, data });
    }

    if (req.method === "GET" && pathname === "/platform/policies/current") {
      const accessToken = readAccessToken(req);
      listDevices(accessToken);
      return sendJson(res, 200, {
        success: true,
        data: getActivePolicy(),
      });
    }

    if (req.method === "GET" && pathname === "/platform/policies/versions") {
      const accessToken = readAccessToken(req);
      listDevices(accessToken);
      return sendJson(res, 200, {
        success: true,
        data: policyVersions,
      });
    }

    if (req.method === "POST" && pathname === "/platform/policies/edit") {
      const accessToken = readAccessToken(req);
      listDevices(accessToken);
      const payload = await readBody(req);
      const data = savePolicyDraft(payload);
      return sendJson(res, 200, { success: true, data });
    }

    if (req.method === "POST" && pathname === "/platform/policies/publish") {
      const accessToken = readAccessToken(req);
      listDevices(accessToken);
      const payload = await readBody(req);
      const data = publishPolicy(payload);
      return sendJson(res, 200, { success: true, data });
    }

    if (req.method === "POST" && pathname === "/platform/policies/rollback") {
      const accessToken = readAccessToken(req);
      listDevices(accessToken);
      const payload = await readBody(req);
      const data = rollbackPolicy(payload);
      return sendJson(res, 200, { success: true, data });
    }

    if (req.method === "GET" && pathname === "/platform/policies/audit-logs") {
      const accessToken = readAccessToken(req);
      listDevices(accessToken);
      return sendJson(res, 200, {
        success: true,
        data: policyAuditLogs,
      });
    }

    if (req.method === "GET" && pathname === "/platform/monitor/business-metrics") {
      const accessToken = readAccessToken(req);
      listDevices(accessToken);
      return sendJson(res, 200, {
        success: true,
        data: buildBusinessMetrics(),
      });
    }

    if (req.method === "GET" && pathname === "/platform/monitor/compliance-metrics") {
      const accessToken = readAccessToken(req);
      listDevices(accessToken);
      return sendJson(res, 200, {
        success: true,
        data: buildComplianceMetrics(),
      });
    }

    return sendJson(res, 404, { success: false, error: "接口不存在" });
  } catch (err) {
    if (pathname.startsWith("/auth/")) {
      const mapped = mapAuthError(err, pathname);
      return sendContractError(res, mapped.statusCode, mapped.code, mapped.message, requestId);
    }
    return sendJson(res, 400, { success: false, error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`认证服务已启动：http://localhost:${PORT}`);
});
