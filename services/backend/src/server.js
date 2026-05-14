const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const {
  hasCustomerLedger,
  replaceCustomerLedger,
  loadCustomerLedger,
  hasRuntimeState,
  saveRuntimeState,
  loadRuntimeState,
  hasRuntimeCollections,
  replaceRuntimeCollections,
  loadRuntimeCollections,
  hasRows,
  replaceOrders,
  loadOrders,
  findOrderById,
  listOrders,
  replaceFinanceEntries,
  loadFinanceEntries,
  listFinanceEntriesInRange,
  replaceSafetyRecords,
  loadSafetyRecords,
  listSafetyRecords,
  findSafetyByOrderId,
  findSafetyById,
  replaceOfflineQueue,
  loadOfflineQueue,
  listOfflineQueueItems,
  DB_PATH,
} = require("./db");
const {
  authByAccessToken,
  issueCode,
  login,
  refresh,
  listDevices,
  logoutSession,
} = require("./auth-service");

const PORT = Number(process.env.PORT || 3100);
const HOST = String(process.env.HOST || "0.0.0.0").trim() || "0.0.0.0";
const SAFETY_REPORT_MODE = String(process.env.SAFETY_REPORT_MODE || "mock").trim().toLowerCase();
const SAFETY_REPORT_ENDPOINT = String(process.env.SAFETY_REPORT_ENDPOINT || "").trim();
const SAFETY_REPORT_TIMEOUT_MS = Math.max(
  1000,
  Math.min(60000, Number(process.env.SAFETY_REPORT_TIMEOUT_MS || 8000))
);
const SAFETY_REPORT_AUTH_TOKEN = String(process.env.SAFETY_REPORT_AUTH_TOKEN || "").trim();
const CUSTOMER_LEDGER_PATH =
  process.env.TRELLIS_CUSTOMER_LEDGER_PATH ||
  path.join(__dirname, "..", "data", "customer-ledger.json");
const RUNTIME_STATE_PATH =
  process.env.TRELLIS_RUNTIME_STATE_PATH ||
  path.join(__dirname, "..", "data", "runtime-state.json");
const CORS_ALLOW_ORIGIN = String(process.env.CORS_ALLOW_ORIGIN || "*").trim() || "*";
const mockCustomers = [
  { id: "CUST-001", name: "城南餐馆", phone: "13800000001", address: "城南路 18 号", tags: ["VIP", "大客户"] },
  { id: "CUST-002", name: "向阳便利店", phone: "13800000002", address: "向阳街 66 号", tags: ["免押金"] },
  { id: "CUST-003", name: "东港小区李阿姨", phone: "13800000003", address: "东港小区 2 栋 301", tags: [] },
];
const inventoryBySpec = {
  "10kg": { onHand: 8, emptyOnHand: 3, locked: 0, pendingInspection: 0 },
  "15kg": { onHand: 12, emptyOnHand: 6, locked: 0, pendingInspection: 0 },
  "50kg": { onHand: 3, emptyOnHand: 1, locked: 0, pendingInspection: 0 },
};
const quickOrders = [];
const inventoryLogs = [];
const safetyRecords = [];
const offlineQueue = [];
const policyVersions = [
  {
    version: "v1.0.0",
    scopeType: "region",
    scopeValue: "CN-DEFAULT",
    scopeLabel: "全国默认区域",
    regionCode: "CN-DEFAULT",
    content: {
      regionName: "全国默认区域",
      template: "standard",
      safetyCheckRequired: true,
      maxRetry: 3,
      syncBatchSize: 20,
      scan: {
        enabled: true,
        required: false,
        mode: "qr_code",
        scenes: ["delivery", "recovery"],
      },
      inspection: {
        delivery: {
          enabled: true,
          mode: "manual",
          aiItems: ["cylinder", "hose"],
          requiredPhotos: ["cylinder", "environment"],
        },
        periodic: {
          enabled: true,
          cycleDays: 90,
          autoTask: true,
        },
        aiEnabled: false,
      },
      reporting: {
        mode: "hybrid",
        batchInterval: "24h",
        retryCount: 3,
        syncBatchSize: 20,
      },
    },
    status: "active",
    publishedAt: Date.now() - 24 * 60 * 60 * 1000,
    publishedBy: "system",
    rolledBackFrom: "",
  },
];
const policyAuditLogs = [];
const REGION_NAME_MAP = {
  "CN-DEFAULT": "全国默认区域",
  "CN-GD-SZ": "广东省 深圳市",
};
const DEFAULT_BUSINESS_RULES = {
  orderPricing: {
    kg15: 120,
    kg10: 100,
    kg50: 300,
  },
  deposit: {
    kg15: 150,
    kg10: 100,
    kg50: 400,
  },
  rent: {
    monthly: 5,
    yearly: 50,
  },
  residual: {
    enabled: true,
    price: 5,
    defaultMode: "deduct", // deduct | separate | ignore
  },
  owedBottle: {
    enabled: true,
    remindDays: [7, 15, 30],
    maxDays: 60,
    overdueAction: "convert", // convert | continue
  },
  debt: {
    enabled: true,
    maxAmount: 1000,
    maxDays: 30,
    remindDays: [7, 15, 25],
  },
  inventoryWarning: {
    enabled: true,
    heavy: { kg15: 5, kg10: 3, kg50: 2 },
    empty: { kg15: 3, kg10: 2, kg50: 1 },
    lockDays: 3,
    expireDays: 30,
  },
  notification: {
    enabled: true,
    startTime: "08:00",
    endTime: "20:00",
    types: {
      inventoryLow: true,
      owedBottleOverdue: true,
      debtOverdue: true,
      dailyClose: true,
      safetyDue: false,
    },
  },
  updatedAt: Date.now(),
};
const businessRulesStore = new Map();

function deepClone(v) {
  return JSON.parse(JSON.stringify(v));
}

function normalizeRuleDays(v, fallback) {
  const source = Array.isArray(v) ? v : fallback;
  const seen = new Set();
  const out = [];
  source.forEach((x) => {
    const n = Number(x);
    if (Number.isInteger(n) && n >= 1 && n <= 365 && !seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  });
  if (!out.length) return [...fallback];
  return out.sort((a, b) => a - b).slice(0, 6);
}

function normalizeBusinessRules(payload = {}, base = DEFAULT_BUSINESS_RULES) {
  const src = payload || {};
  const out = deepClone(base);
  if (!out.orderPricing || typeof out.orderPricing !== "object") {
    out.orderPricing = deepClone(DEFAULT_BUSINESS_RULES.orderPricing);
  }
  if (!out.notification || typeof out.notification !== "object") {
    out.notification = deepClone(DEFAULT_BUSINESS_RULES.notification);
  }
  if (!out.notification.types || typeof out.notification.types !== "object") {
    out.notification.types = deepClone(DEFAULT_BUSINESS_RULES.notification.types);
  }
  if (!out.inventoryWarning || typeof out.inventoryWarning !== "object") {
    out.inventoryWarning = deepClone(DEFAULT_BUSINESS_RULES.inventoryWarning);
  }
  if (!out.inventoryWarning.heavy || typeof out.inventoryWarning.heavy !== "object") {
    out.inventoryWarning.heavy = deepClone(DEFAULT_BUSINESS_RULES.inventoryWarning.heavy);
  }
  if (!out.inventoryWarning.empty || typeof out.inventoryWarning.empty !== "object") {
    out.inventoryWarning.empty = deepClone(DEFAULT_BUSINESS_RULES.inventoryWarning.empty);
  }
  const toNum = (value, fallback, min, max) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, Number(n.toFixed(2))));
  };
  const toInt = (value, fallback, min, max) => {
    const n = Number(value);
    if (!Number.isInteger(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  };
  const toTime = (value, fallback) => {
    const text = String(value || "").trim();
    if (!text) return fallback;
    if (!/^\d{2}:\d{2}$/.test(text)) return fallback;
    const [h, m] = text.split(":").map((x) => Number(x));
    if (!Number.isInteger(h) || !Number.isInteger(m)) return fallback;
    if (h < 0 || h > 23 || m < 0 || m > 59) return fallback;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  };

  out.orderPricing.kg15 = toNum(src.orderPricing?.kg15, out.orderPricing.kg15, 0, 2000);
  out.orderPricing.kg10 = toNum(src.orderPricing?.kg10, out.orderPricing.kg10, 0, 2000);
  out.orderPricing.kg50 = toNum(src.orderPricing?.kg50, out.orderPricing.kg50, 0, 5000);

  out.deposit.kg15 = toNum(src.deposit?.kg15, out.deposit.kg15, 0, 1000);
  out.deposit.kg10 = toNum(src.deposit?.kg10, out.deposit.kg10, 0, 1000);
  out.deposit.kg50 = toNum(src.deposit?.kg50, out.deposit.kg50, 0, 2000);
  out.rent.monthly = toNum(src.rent?.monthly, out.rent.monthly, 0, 100);
  out.rent.yearly = toNum(src.rent?.yearly, out.rent.yearly, 0, 1000);

  out.residual.enabled = src.residual?.enabled === undefined ? out.residual.enabled : Boolean(src.residual.enabled);
  out.residual.price = toNum(src.residual?.price, out.residual.price, 0, 20);
  const residualMode = String(src.residual?.defaultMode || out.residual.defaultMode);
  out.residual.defaultMode = ["deduct", "separate", "ignore"].includes(residualMode) ? residualMode : out.residual.defaultMode;

  out.owedBottle.enabled =
    src.owedBottle?.enabled === undefined ? out.owedBottle.enabled : Boolean(src.owedBottle.enabled);
  out.owedBottle.remindDays = normalizeRuleDays(src.owedBottle?.remindDays, out.owedBottle.remindDays);
  out.owedBottle.maxDays = toInt(src.owedBottle?.maxDays, out.owedBottle.maxDays, 7, 180);
  const overdueAction = String(src.owedBottle?.overdueAction || out.owedBottle.overdueAction);
  out.owedBottle.overdueAction = ["convert", "continue"].includes(overdueAction)
    ? overdueAction
    : out.owedBottle.overdueAction;

  out.debt.enabled = src.debt?.enabled === undefined ? out.debt.enabled : Boolean(src.debt.enabled);
  out.debt.maxAmount = toNum(src.debt?.maxAmount, out.debt.maxAmount, 0, 10000);
  out.debt.maxDays = toInt(src.debt?.maxDays, out.debt.maxDays, 7, 180);
  out.debt.remindDays = normalizeRuleDays(src.debt?.remindDays, out.debt.remindDays);

  out.inventoryWarning.enabled =
    src.inventoryWarning?.enabled === undefined ? out.inventoryWarning.enabled : Boolean(src.inventoryWarning.enabled);
  out.inventoryWarning.heavy.kg15 = toInt(src.inventoryWarning?.heavy?.kg15, out.inventoryWarning.heavy.kg15, 0, 200);
  out.inventoryWarning.heavy.kg10 = toInt(src.inventoryWarning?.heavy?.kg10, out.inventoryWarning.heavy.kg10, 0, 200);
  out.inventoryWarning.heavy.kg50 = toInt(src.inventoryWarning?.heavy?.kg50, out.inventoryWarning.heavy.kg50, 0, 200);
  out.inventoryWarning.empty.kg15 = toInt(src.inventoryWarning?.empty?.kg15, out.inventoryWarning.empty.kg15, 0, 200);
  out.inventoryWarning.empty.kg10 = toInt(src.inventoryWarning?.empty?.kg10, out.inventoryWarning.empty.kg10, 0, 200);
  out.inventoryWarning.empty.kg50 = toInt(src.inventoryWarning?.empty?.kg50, out.inventoryWarning.empty.kg50, 0, 200);
  out.inventoryWarning.lockDays = toInt(src.inventoryWarning?.lockDays, out.inventoryWarning.lockDays, 1, 30);
  // 气瓶超期预警暂时下线：保持已有值，不再接受前端更新。

  out.notification.enabled =
    src.notification?.enabled === undefined ? out.notification.enabled : Boolean(src.notification.enabled);
  out.notification.startTime = toTime(src.notification?.startTime, out.notification.startTime || "08:00");
  out.notification.endTime = toTime(src.notification?.endTime, out.notification.endTime || "20:00");
  out.notification.types.inventoryLow =
    src.notification?.types?.inventoryLow === undefined
      ? out.notification.types.inventoryLow
      : Boolean(src.notification.types.inventoryLow);
  out.notification.types.owedBottleOverdue =
    src.notification?.types?.owedBottleOverdue === undefined
      ? out.notification.types.owedBottleOverdue
      : Boolean(src.notification.types.owedBottleOverdue);
  out.notification.types.debtOverdue =
    src.notification?.types?.debtOverdue === undefined
      ? out.notification.types.debtOverdue
      : Boolean(src.notification.types.debtOverdue);
  out.notification.types.dailyClose =
    src.notification?.types?.dailyClose === undefined
      ? out.notification.types.dailyClose
      : Boolean(src.notification.types.dailyClose);
  out.notification.types.safetyDue =
    src.notification?.types?.safetyDue === undefined
      ? out.notification.types.safetyDue
      : Boolean(src.notification.types.safetyDue);
  out.updatedAt = Date.now();
  return out;
}

function getBusinessRules(dealerId = "default") {
  if (!businessRulesStore.has(dealerId)) {
    businessRulesStore.set(dealerId, deepClone(DEFAULT_BUSINESS_RULES));
  }
  return deepClone(businessRulesStore.get(dealerId));
}

function saveBusinessRules(payload, dealerId = "default") {
  const merged = normalizeBusinessRules(payload, getBusinessRules(dealerId));
  businessRulesStore.set(dealerId, merged);
  return deepClone(merged);
}

function resetBusinessRules(dealerId = "default") {
  const next = deepClone(DEFAULT_BUSINESS_RULES);
  next.updatedAt = Date.now();
  businessRulesStore.set(dealerId, next);
  return deepClone(next);
}

function getInventoryState(spec) {
  if (!inventoryBySpec[spec]) throw new Error("气瓶规格不支持");
  const onHand = Number(inventoryBySpec[spec].onHand || 0);
  const emptyOnHand = Number(inventoryBySpec[spec].emptyOnHand || 0);
  const locked = Number(inventoryBySpec[spec].locked || 0);
  const pendingInspection = Number(inventoryBySpec[spec].pendingInspection || 0);
  const available = Math.max(0, onHand - locked);
  return { spec, onHand, emptyOnHand, locked, pendingInspection, available };
}

function moveToPendingInspection(spec, quantity, orderId) {
  const state = getInventoryState(spec);
  inventoryBySpec[spec].pendingInspection = state.pendingInspection + quantity;
  pushInventoryLog("to_inspection", spec, 0, 0, orderId);
  return getInventoryState(spec);
}

function pushInventoryLog(type, spec, deltaOnHand, deltaLocked, orderId, extra = {}) {
  inventoryLogs.unshift({
    id: `INV-LOG-${Date.now()}`,
    type,
    spec,
    deltaOnHand,
    deltaEmptyOnHand: Number(extra.deltaEmptyOnHand || 0),
    deltaLocked,
    orderId,
    createdAt: Date.now(),
    ...extra,
  });
  if (inventoryLogs.length > 200) inventoryLogs.pop();
}

function normalizeInventorySpec(value) {
  const spec = String(value || "").trim();
  if (!inventoryBySpec[spec]) {
    throw new Error("气瓶规格不支持");
  }
  return spec;
}

function normalizePositiveInt(value, fieldName = "数量", max = 2000) {
  const num = Number(value);
  if (!Number.isInteger(num) || num <= 0) {
    throw new Error(`${fieldName}必须为正整数`);
  }
  return Math.min(max, num);
}

function normalizeNonNegativeInt(value, fieldName = "数量", max = 5000) {
  const num = Number(value);
  if (!Number.isInteger(num) || num < 0) {
    throw new Error(`${fieldName}必须为非负整数`);
  }
  return Math.min(max, num);
}

function buildInventoryAlertSnapshot() {
  const rules = getBusinessRules("default");
  const warningEnabled = Boolean(rules?.inventoryWarning?.enabled);
  const thresholds = {
    "15kg": {
      heavy: Number(rules?.inventoryWarning?.heavy?.kg15 || 0),
      empty: Number(rules?.inventoryWarning?.empty?.kg15 || 0),
    },
    "10kg": {
      heavy: Number(rules?.inventoryWarning?.heavy?.kg10 || 0),
      empty: Number(rules?.inventoryWarning?.empty?.kg10 || 0),
    },
    "50kg": {
      heavy: Number(rules?.inventoryWarning?.heavy?.kg50 || 0),
      empty: Number(rules?.inventoryWarning?.empty?.kg50 || 0),
    },
  };
  const items = Object.keys(inventoryBySpec).map((spec) => {
    const state = getInventoryState(spec);
    const heavyThreshold = Math.max(0, Number(thresholds[spec]?.heavy || 0));
    const emptyThreshold = Math.max(0, Number(thresholds[spec]?.empty || 0));
    const heavyLow = warningEnabled && heavyThreshold > 0 && state.available < heavyThreshold;
    const emptyLow = warningEnabled && emptyThreshold > 0 && state.emptyOnHand < emptyThreshold;
    const warnings = [];
    if (heavyLow) warnings.push(`重瓶可用${state.available}（阈值${heavyThreshold}）`);
    if (emptyLow) warnings.push(`空瓶${state.emptyOnHand}（阈值${emptyThreshold}）`);
    return {
      spec,
      onHand: state.onHand,
      emptyOnHand: state.emptyOnHand,
      locked: state.locked,
      pendingInspection: state.pendingInspection,
      available: state.available,
      heavyThreshold,
      emptyThreshold,
      heavyLow,
      emptyLow,
      isLow: heavyLow || emptyLow,
      warningText: warnings.join("；"),
    };
  });
  const lowItems = items.filter((x) => x.isLow);
  return {
    enabled: warningEnabled,
    lowCount: lowItems.length,
    items,
    lowItems,
    message: lowItems.length
      ? `低库存预警：${lowItems
          .map((x) => `${x.spec}${x.warningText}`)
          .join("；")}`
      : "当前无低库存预警",
  };
}

function applyInventoryPurchase(payload) {
  const spec = normalizeInventorySpec(payload?.spec);
  const quantity = normalizePositiveInt(payload?.quantity, "采购数量");
  const state = getInventoryState(spec);
  inventoryBySpec[spec].onHand = state.onHand + quantity;
  pushInventoryLog("purchase_in", spec, quantity, 0, String(payload?.refId || ""), {
    note: String(payload?.note || "").trim().slice(0, 120),
  });
  return getInventoryState(spec);
}

function applyInventoryRefill(payload) {
  const spec = normalizeInventorySpec(payload?.spec);
  const quantity = normalizePositiveInt(payload?.quantity, "充装数量");
  const refillWeightRaw = Number(payload?.refillWeightKg);
  if (!Number.isFinite(refillWeightRaw) || refillWeightRaw <= 0) {
    throw new Error("充装重量必须为正数");
  }
  const refillWeightKg = Number(refillWeightRaw.toFixed(2));
  const state = getInventoryState(spec);
  if (state.emptyOnHand < quantity) {
    throw new Error(`空瓶不足：${spec} 当前空瓶 ${state.emptyOnHand} 瓶`);
  }
  inventoryBySpec[spec].onHand = state.onHand + quantity;
  inventoryBySpec[spec].emptyOnHand = state.emptyOnHand - quantity;
  pushInventoryLog("refill_in", spec, quantity, 0, String(payload?.refId || ""), {
    deltaEmptyOnHand: -quantity,
    note: String(payload?.note || "").trim().slice(0, 120),
    refillWeightKg,
  });
  return {
    ...getInventoryState(spec),
    refillWeightKg,
  };
}

function applyInventoryStocktake(payload) {
  const spec = normalizeInventorySpec(payload?.spec);
  const countedOnHand = normalizeNonNegativeInt(payload?.countedOnHand, "盘点数量", 5000);
  const state = getInventoryState(spec);
  const stockType = String(payload?.stockType || "heavy").trim() === "empty" ? "empty" : "heavy";
  const before = stockType === "empty" ? state.emptyOnHand : state.onHand;
  const delta = countedOnHand - before;
  if (stockType === "empty") {
    inventoryBySpec[spec].emptyOnHand = countedOnHand;
  } else {
    inventoryBySpec[spec].onHand = countedOnHand;
  }
  pushInventoryLog("stocktake_adjust", spec, stockType === "heavy" ? delta : 0, 0, String(payload?.refId || ""), {
    deltaEmptyOnHand: stockType === "empty" ? delta : 0,
    stockType,
    note: String(payload?.note || "").trim().slice(0, 120),
  });
  return getInventoryState(spec);
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

function returnEmptyInventoryToOnHand(spec, quantity, orderId, type = "empty_return") {
  const qty = Number(quantity || 0);
  if (!Number.isInteger(qty) || qty <= 0) return getInventoryState(spec);
  const state = getInventoryState(spec);
  inventoryBySpec[spec].emptyOnHand = state.emptyOnHand + qty;
  pushInventoryLog(type, spec, 0, 0, orderId, { deltaEmptyOnHand: qty });
  return getInventoryState(spec);
}

function validateOrderEmptyCounts(quantity, recycledEmptyCount, owedEmptyCount) {
  const orderQuantity = Number(quantity || 0);
  const recycled = Number(recycledEmptyCount || 0);
  const owed = Number(owedEmptyCount || 0);
  if (orderQuantity > 0 && recycled + owed > orderQuantity) {
    throw new Error(`回收空瓶与欠瓶合计不能超过配送数量（${orderQuantity} 瓶）`);
  }
}

function normalizeResidualWeight(value) {
  const text = String(value ?? "").trim();
  if (!text) return 0;
  const num = Number(text);
  if (!Number.isFinite(num) || num < 0) {
    throw new Error("残液重量必须为大于等于 0 的数字");
  }
  return Number(num.toFixed(2));
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

  const { reason, reasonDetail, bottleReturned, bottleBarcode, refundAmount, refundMethod, note } = payload;
  const quantity = normalizePositiveInt(payload?.quantity ?? order.quantity, "退货数量", 2000);
  if (!reason) throw new Error("请选择退货原因");
  if (!bottleReturned) throw new Error("请确认已收回气瓶");
  if (quantity !== Number(order.quantity || 0)) throw new Error("当前仅支持整单退货，请按原单数量退回");
  if (!Number.isFinite(refundAmount) || refundAmount < 0) throw new Error("退款金额不合法");
  if (!["cash", "original", "wechat", "alipay"].includes(refundMethod)) throw new Error("退款方式不合法");

  const recordId = `RET-${Date.now()}`;
  const returnRecord = {
    id: recordId,
    orderId,
    customerId: order.customerId,
    customerName: order.customerName,
    spec: order.spec,
    quantity,
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

  returnInventoryToOnHand(order.spec, quantity, orderId);
  pushInventoryLog("order_return", order.spec, quantity, 0, orderId);

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
        delta: quantity,
      },
    },
  };
}

const exchangeRecords = [];

function processOrderExchange(orderId, payload) {
  const order = quickOrders.find((x) => x.orderId === orderId);
  if (!order) throw new Error("订单不存在");
  if (order.orderStatus !== "completed") throw new Error("只有已完成订单可申请换货");

  const { reason, bottleReturned, newQuantity, priceDiff, diffHandling, note } = payload;
  const newSpec = normalizeInventorySpec(payload?.newSpec || order.spec);
  const newUnitPriceRaw = Number(payload?.newUnitPrice ?? order.unitPrice ?? 0);
  if (!reason) throw new Error("请选择换货原因");
  if (!bottleReturned) throw new Error("请确认已收回气瓶");
  if (!Number.isInteger(newQuantity) || newQuantity < 1) throw new Error("新单数量必须为正整数");
  if (!Number.isFinite(priceDiff)) throw new Error("差价金额不合法");
  if (!Number.isFinite(newUnitPriceRaw) || newUnitPriceRaw < 0) throw new Error("新单价不合法");
  if (!["no_diff", "customer_pays", "refund_customer"].includes(diffHandling)) {
    throw new Error("差价处理方式不合法");
  }
  const newUnitPrice = Number(newUnitPriceRaw.toFixed(2));

  const exchangeId = `EXC-${Date.now()}`;
  const now = Date.now();

  const exchangeRecord = {
    id: exchangeId,
    originalOrderId: orderId,
    customerId: order.customerId,
    customerName: order.customerName,
    originalSpec: order.spec,
    originalQuantity: order.quantity,
    newSpec,
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
  const newAmount = Number((newUnitPrice * newQuantity).toFixed(2));
  
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
    spec: newSpec,
    quantity: newQuantity,
    unitPrice: newUnitPrice,
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

  const inventoryResult = directConsumeInventory(newSpec, newQuantity, newOrderId);
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
        spec: newOrder.spec,
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
        originalSpec: order.spec,
        originalToInspection: order.quantity,
        newSpec,
        newConsumed: newQuantity,
      },
    },
  };
}
const financeEntries = [];
const returnRecords = [];
const dailyCloseRecords = [];
const debtReminderRecords = [];
const debtRepaymentRecords = [];
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
      debtSinceAt: 0,
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
    debtSinceAt: Number(raw?.debtSinceAt || 0),
    lastCollectionAt: Number(raw?.lastCollectionAt || 0),
    collectionHistory,
  };
}

function persistCustomerLedger() {
  const accounts = Array.from(customerAccounts.entries()).map(([id, row]) => [
    id,
    {
      customerId: id,
      owedAmount: row.owedAmount,
      owedEmptyCount: row.owedEmptyCount,
      collectionStatus: row.collectionStatus,
      collectionNote: row.collectionNote,
      updatedAt: row.updatedAt,
      debtSinceAt: row.debtSinceAt,
      lastCollectionAt: row.lastCollectionAt,
      collectionHistory: Array.isArray(row.collectionHistory) ? row.collectionHistory : [],
    },
  ]);
  replaceCustomerLedger(accounts);
}

function restoreCustomerLedger() {
  let accounts = [];
  if (hasCustomerLedger()) {
    accounts = loadCustomerLedger();
  } else if (fs.existsSync(CUSTOMER_LEDGER_PATH)) {
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(CUSTOMER_LEDGER_PATH, "utf-8"));
    } catch (_err) {
      return;
    }
    if (!parsed || !Array.isArray(parsed.accounts)) return;
    accounts = parsed.accounts;
    replaceCustomerLedger(accounts);
  } else {
    return;
  }
  for (const entry of accounts) {
    if (!Array.isArray(entry) || entry.length < 2) continue;
    const customerId = String(entry[0] || "").trim();
    if (!customerId) continue;
    customerAccounts.set(customerId, normalizeCustomerAccountRecord(customerId, entry[1]));
  }
}

function replaceArray(target, incoming) {
  target.splice(0, target.length, ...(Array.isArray(incoming) ? incoming : []));
}

function replaceObject(target, incoming) {
  Object.keys(target).forEach((key) => {
    delete target[key];
  });
  const source = incoming && typeof incoming === "object" ? incoming : {};
  Object.assign(target, source);
}

function buildRuntimeStateSnapshot() {
  return {
    savedAt: Date.now(),
    version: 1,
    mockCustomers: deepClone(mockCustomers),
    inventoryBySpec: deepClone(inventoryBySpec),
    quickOrders: deepClone(quickOrders),
    inventoryLogs: deepClone(inventoryLogs),
    safetyRecords: deepClone(safetyRecords),
    offlineQueue: deepClone(offlineQueue),
    policyVersions: deepClone(policyVersions),
    policyAuditLogs: deepClone(policyAuditLogs),
    businessRulesEntries: Array.from(businessRulesStore.entries()),
    exchangeRecords: deepClone(exchangeRecords),
    financeEntries: deepClone(financeEntries),
    returnRecords: deepClone(returnRecords),
    dailyCloseRecords: deepClone(dailyCloseRecords),
    debtReminderRecords: deepClone(debtReminderRecords),
    debtRepaymentRecords: deepClone(debtRepaymentRecords),
  };
}

function persistRuntimeState() {
  const snapshot = buildRuntimeStateSnapshot();
  replaceOrders(snapshot.quickOrders || []);
  replaceFinanceEntries(snapshot.financeEntries || []);
  replaceSafetyRecords(snapshot.safetyRecords || []);
  replaceOfflineQueue(snapshot.offlineQueue || []);
  replaceRuntimeCollections(snapshot);
  saveRuntimeState("main", snapshot);
}

function persistRuntimeStateSafe() {
  try {
    persistRuntimeState();
  } catch (err) {
    console.error(`[runtime-state] 持久化失败: ${String(err?.message || err)}`);
  }
}

function restoreRuntimeState() {
  let parsed = null;
  const hasOrders = hasRows("orders");
  const hasFinanceEntries = hasRows("finance_entries");
  const hasSafetyRecords = hasRows("safety_records");
  const hasOfflineQueueItems = hasRows("offline_queue_items");
  const hasDedicatedRuntime = hasOrders || hasFinanceEntries || hasSafetyRecords || hasOfflineQueueItems;
  if (hasDedicatedRuntime || hasRuntimeCollections()) {
    parsed = loadRuntimeCollections();
    const blobSnapshot = hasRuntimeState("main") ? loadRuntimeState("main") : null;
    if (hasOrders) {
      parsed.quickOrders = loadOrders();
    } else if (blobSnapshot?.quickOrders) {
      parsed.quickOrders = Array.isArray(blobSnapshot.quickOrders) ? blobSnapshot.quickOrders : [];
      replaceOrders(parsed.quickOrders);
    } else {
      parsed.quickOrders = [];
    }
    if (hasFinanceEntries) {
      parsed.financeEntries = loadFinanceEntries();
    } else if (blobSnapshot?.financeEntries) {
      parsed.financeEntries = Array.isArray(blobSnapshot.financeEntries) ? blobSnapshot.financeEntries : [];
      replaceFinanceEntries(parsed.financeEntries);
    } else {
      parsed.financeEntries = [];
    }
    if (hasSafetyRecords) {
      parsed.safetyRecords = loadSafetyRecords();
    } else if (blobSnapshot?.safetyRecords) {
      parsed.safetyRecords = Array.isArray(blobSnapshot.safetyRecords) ? blobSnapshot.safetyRecords : [];
      replaceSafetyRecords(parsed.safetyRecords);
    } else {
      parsed.safetyRecords = [];
    }
    if (hasOfflineQueueItems) {
      parsed.offlineQueue = loadOfflineQueue();
    } else if (blobSnapshot?.offlineQueue) {
      parsed.offlineQueue = Array.isArray(blobSnapshot.offlineQueue) ? blobSnapshot.offlineQueue : [];
      replaceOfflineQueue(parsed.offlineQueue);
    } else {
      parsed.offlineQueue = [];
    }
  } else if (hasRuntimeState("main")) {
    parsed = loadRuntimeState("main");
    if (parsed && typeof parsed === "object") {
      replaceOrders(parsed.quickOrders || []);
      replaceFinanceEntries(parsed.financeEntries || []);
      replaceSafetyRecords(parsed.safetyRecords || []);
      replaceOfflineQueue(parsed.offlineQueue || []);
      replaceRuntimeCollections(parsed);
    }
  } else if (fs.existsSync(RUNTIME_STATE_PATH)) {
    try {
      parsed = JSON.parse(fs.readFileSync(RUNTIME_STATE_PATH, "utf-8"));
    } catch (_err) {
      return;
    }
    if (parsed && typeof parsed === "object") {
      replaceOrders(parsed.quickOrders || []);
      replaceFinanceEntries(parsed.financeEntries || []);
      replaceSafetyRecords(parsed.safetyRecords || []);
      replaceOfflineQueue(parsed.offlineQueue || []);
      replaceRuntimeCollections(parsed);
      saveRuntimeState("main", parsed);
    }
  }
  if (!parsed || typeof parsed !== "object") return;

  replaceArray(mockCustomers, parsed.mockCustomers);
  replaceObject(inventoryBySpec, parsed.inventoryBySpec);
  replaceArray(quickOrders, parsed.quickOrders);
  replaceArray(inventoryLogs, parsed.inventoryLogs);
  replaceArray(safetyRecords, parsed.safetyRecords);
  replaceArray(offlineQueue, parsed.offlineQueue);
  replaceArray(policyVersions, parsed.policyVersions);
  replaceArray(policyAuditLogs, parsed.policyAuditLogs);
  businessRulesStore.clear();
  if (Array.isArray(parsed.businessRulesEntries)) {
    parsed.businessRulesEntries.forEach((entry) => {
      if (!Array.isArray(entry) || entry.length < 2) return;
      const dealerId = String(entry[0] || "").trim();
      if (!dealerId) return;
      businessRulesStore.set(dealerId, normalizeBusinessRules(entry[1], DEFAULT_BUSINESS_RULES));
    });
  }
  replaceArray(exchangeRecords, parsed.exchangeRecords);
  replaceArray(financeEntries, parsed.financeEntries);
  replaceArray(returnRecords, parsed.returnRecords);
  replaceArray(dailyCloseRecords, parsed.dailyCloseRecords);
  replaceArray(debtReminderRecords, parsed.debtReminderRecords);
  replaceArray(debtRepaymentRecords, parsed.debtRepaymentRecords);
}

restoreCustomerLedger();
seedDebtDemoData();
restoreRuntimeState();

function ensureCustomerAccount(customerId) {
  if (!customerAccounts.has(customerId)) {
    customerAccounts.set(customerId, {
      customerId,
      owedAmount: 0,
      owedEmptyCount: 0,
      collectionStatus: "none",
      collectionNote: "",
      updatedAt: Date.now(),
      debtSinceAt: 0,
      lastCollectionAt: 0,
      collectionHistory: [],
    });
  }
  const row = customerAccounts.get(customerId);
  if (!Array.isArray(row.collectionHistory)) row.collectionHistory = [];
  return row;
}

function buildCorsHeaders(req) {
  const origin = String(req?.headers?.origin || "").trim();
  const allowOrigin = CORS_ALLOW_ORIGIN === "*" ? "*" : origin || CORS_ALLOW_ORIGIN;
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, OPTIONS",
    Vary: "Origin",
  };
}

function sendJson(req, res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    ...buildCorsHeaders(req),
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

function sendContractSuccess(req, res, statusCode, data, requestId) {
  return sendJson(req, res, statusCode, {
    success: true,
    data,
    error: null,
    request_id: requestId,
  });
}

function sendContractError(req, res, statusCode, code, message, requestId) {
  return sendJson(req, res, statusCode, {
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
  if (err?.code === "ORDER_409_STATUS") {
    return { statusCode: 409, code: "ORDER_409_STATUS", message };
  }
  if (err?.code === "VALIDATION_400") {
    return { statusCode: 400, code: "VALIDATION_400", message };
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
  const pending = readOrdersSnapshot({ status: "pending_delivery" }).filter((x) => x.orderStatus === "pending_delivery");
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
  const orders = readOrdersSnapshot();
  const queueItems = readOfflineQueueSnapshot();
  const completedOrders = orders.filter((x) => x.orderStatus === "completed");
  const receivedToday = completedOrders.reduce((sum, x) => sum + Number(x.receivedAmount || 0), 0);
  const pendingToday = completedOrders.reduce((sum, x) => sum + Math.max(0, Number(x.amount || 0) - Number(x.receivedAmount || 0)), 0);
  const dayMs = 24 * 60 * 60 * 1000;
  const todayStart = startOfTodayMs();
  const todayFinanceEntries = getFinanceEntriesInRange(todayStart, todayStart + dayMs);
  const incomeToday = Number(buildFinanceIncomeSummary(todayFinanceEntries).totalIncome || 0);
  const expenseToday = Number(buildFinanceExpenseSummary(todayFinanceEntries).totalExpense || 0);
  const grossProfitToday = Number((incomeToday - expenseToday).toFixed(2));
  const grossTrend7d = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const dayStart = todayStart - offset * dayMs;
    const dayEntries = getFinanceEntriesInRange(dayStart, dayStart + dayMs);
    const incomeSummary = buildFinanceIncomeSummary(dayEntries);
    const expenseSummary = buildFinanceExpenseSummary(dayEntries);
    const dayIncome = Number(incomeSummary.totalIncome || 0);
    const dayExpense = Number(expenseSummary.totalExpense || 0);
    const dayDate = formatLocalDateKey(dayStart);
    grossTrend7d.push({
      date: dayDate,
      label: dayDate.slice(5),
      income: Number(dayIncome.toFixed(2)),
      expense: Number(dayExpense.toFixed(2)),
      grossProfit: Number((dayIncome - dayExpense).toFixed(2)),
    });
  }
  const nextPending = getNextWorkbenchDeliveryOrder();
  return {
    finance: {
      receivedToday: Number(receivedToday.toFixed(2)),
      pendingToday: Number(pendingToday.toFixed(2)),
      grossProfitToday,
      grossTrend7d,
      currency: "CNY",
    },
    nextDelivery: buildNextDeliveryPayload(nextPending),
    sync: {
      syncStatus: queueItems.some((x) => x.syncStatus === "failed")
        ? "failed"
        : queueItems.some((x) => x.syncStatus === "syncing")
          ? "syncing"
          : queueItems.some((x) => x.syncStatus === "pending")
            ? "pending"
            : "completed",
      pendingCount: queueItems.filter((x) => x.syncStatus !== "completed").length,
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

function formatLocalDateKey(input) {
  const date = input instanceof Date ? input : new Date(input);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateInput(value) {
  if (!value) return null;
  const text = String(value).trim();
  const m = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isSameFinanceDay(ts) {
  return Number(ts || 0) >= startOfTodayMs();
}

function readOrdersSnapshot(filters = {}) {
  const rows = listOrders(filters);
  return rows.length ? rows : [...quickOrders];
}

function readFinanceEntriesSnapshotInRange(startAt, endAt) {
  const rows = listFinanceEntriesInRange(startAt, endAt);
  return rows.length ? rows : financeEntries.filter((entry) => {
    const ts = Number(entry?.postedAt || entry?.createdAt || 0);
    return ts >= startAt && ts < endAt;
  });
}

function readSafetyRecordsSnapshot() {
  const rows = listSafetyRecords();
  return rows.length ? rows : [...safetyRecords];
}

function readOfflineQueueSnapshot() {
  const rows = listOfflineQueueItems();
  return rows.length ? rows : [...offlineQueue];
}

function appendFinanceEntry(order, source, overrides = {}) {
  const receivedAmount = Number(overrides.receivedAmount ?? order.receivedAmount ?? 0);
  const amount = Number(overrides.amount ?? order.amount ?? 0);
  const pendingAmount = Number(
    overrides.pendingAmount ?? Math.max(0, amount - receivedAmount).toFixed(2)
  );
  const entry = {
    entryId: `FE-${Date.now()}-${financeEntries.length + 1}`,
    orderId: order.orderId,
    customerId: order.customerId,
    customerName: order.customerName,
    source,
    categoryKey: overrides.categoryKey || "",
    amount,
    receivedAmount,
    pendingAmount,
    paymentMethod: overrides.paymentMethod ?? order.paymentMethod ?? "",
    postedAt: Date.now(),
    status: "posted",
    note: String(overrides.note || "").trim(),
  };
  financeEntries.push(entry);
  return entry;
}

function voidFinanceEntriesByOrder(orderId) {
  let changed = false;
  for (let i = financeEntries.length - 1; i >= 0; i -= 1) {
    const item = financeEntries[i];
    if (item.orderId === orderId && item.status === "posted") {
      item.status = "voided";
      item.voidedAt = Date.now();
      changed = true;
    }
  }
  return changed;
}

function appendDeliveryFinanceEntries(order) {
  const totalReceived = Number(order.receivedAmount || 0);
  const gasAmount = Number(order.amount || 0);
  const residualAmount = Number(order.residualAmount || 0);
  const gasReceived = Number(Math.min(totalReceived, gasAmount).toFixed(2));
  const residualReceived = Number(
    Math.min(Math.max(totalReceived - gasReceived, 0), residualAmount).toFixed(2)
  );
  if (gasAmount > 0) {
    appendFinanceEntry(order, "delivery_complete", {
      categoryKey: "gas",
      amount: gasAmount,
      receivedAmount: gasReceived,
      pendingAmount: Number(Math.max(0, gasAmount - gasReceived).toFixed(2)),
    });
  }
  if (residualAmount > 0) {
    appendFinanceEntry(order, "delivery_residual", {
      categoryKey: "residual",
      amount: residualAmount,
      receivedAmount: residualReceived,
      pendingAmount: Number(Math.max(0, residualAmount - residualReceived).toFixed(2)),
      note: `回收残液 ${Number(order.residualWeight || 0).toFixed(2)}kg`,
    });
  }
}

function getTodayFinanceEntries() {
  return readFinanceEntriesSnapshotInRange(startOfTodayMs(), Date.now() + 1)
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
    date: formatLocalDateKey(startOfTodayMs()),
    receivedToday: Number(receivedToday.toFixed(2)),
    pendingToday: Number(pendingToday.toFixed(2)),
    entryCount: todayPosted.length,
    closeStatus,
    latestClose,
  };
}

function getDateRangeBounds(startInput, endInput) {
  const defaultStart = startOfTodayMs();
  const defaultEnd = defaultStart + 24 * 60 * 60 * 1000;
  const startDate = startInput ? parseDateInput(startInput) : new Date(defaultStart);
  if (!startDate) {
    return { startAt: defaultStart, endAt: defaultEnd };
  }
  let endAt;
  if (endInput) {
    const endDate = parseDateInput(endInput);
    if (endDate) {
      endAt = new Date(
        endDate.getFullYear(),
        endDate.getMonth(),
        endDate.getDate() + 1
      ).getTime();
    }
  }
  const startAt = new Date(
    startDate.getFullYear(),
    startDate.getMonth(),
    startDate.getDate()
  ).getTime();
  if (!endAt) {
    endAt = new Date(
      startDate.getFullYear(),
      startDate.getMonth(),
      startDate.getDate() + 1
    ).getTime();
  }
  if (endAt <= startAt) {
    return { startAt, endAt: startAt + 24 * 60 * 60 * 1000 };
  }
  return { startAt, endAt };
}

function resolveFinanceRange(searchParams) {
  const preset = String(searchParams.get("preset") || searchParams.get("range") || "today").trim();
  if (searchParams.get("start") || searchParams.get("end")) {
    const custom = getDateRangeBounds(searchParams.get("start"), searchParams.get("end"));
    return { ...custom, preset: "custom" };
  }
  const now = new Date();
  if (preset === "week") {
    const day = now.getDay() || 7;
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (day - 1)).getTime();
    return { startAt: start, endAt: Date.now() + 1, preset };
  }
  if (preset === "month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    return { startAt: start, endAt: Date.now() + 1, preset };
  }
  return { startAt: startOfTodayMs(), endAt: Date.now() + 1, preset: "today" };
}

function getFinanceEntryTimestamp(entry) {
  return Number(entry?.postedAt || entry?.createdAt || 0);
}

function resolveFinanceCategoryKey(entry) {
  const source = String(entry?.source || entry?.type || "").trim().toLowerCase();
  const rawCategory = String(entry?.categoryKey || entry?.category || "").trim().toLowerCase();
  const hint = [source, rawCategory, String(entry?.note || "").trim().toLowerCase()].join(" ");
  if (source === "debt_repayment") return "other";
  if (source === "delivery_residual") return "residual";
  if (hint.includes("deposit") || hint.includes("押金")) return "deposit";
  if (hint.includes("residual") || hint.includes("残液")) return "residual";
  if (hint.includes("gas") || hint.includes("气款") || hint.includes("delivery")) return "gas";
  return "gas";
}

function normalizeFinanceEntry(entry) {
  const source = String(entry?.source || entry?.type || "").trim();
  const rawAmount = Number(entry?.amount ?? entry?.receivedAmount ?? 0);
  const rawReceivedAmount = Number(entry?.receivedAmount ?? entry?.amount ?? 0);
  const negativeSource = ["return_reversal", "exchange_refund"].includes(source);
  const categoryKey = resolveFinanceCategoryKey(entry);
  const categoryLabelMap = {
    gas: "气款",
    deposit: "押金",
    residual: "残液",
    other: "其他",
  };
  return {
    id: String(entry?.entryId || entry?.id || ""),
    orderId: String(entry?.orderId || ""),
    customerId: String(entry?.customerId || ""),
    customerName: String(entry?.customerName || ""),
    type: negativeSource ? "expense" : "income",
    categoryKey,
    category: categoryLabelMap[categoryKey] || "其他",
    amount: negativeSource ? -Math.abs(rawAmount) : Number(rawAmount.toFixed(2)),
    receivedAmount: negativeSource
      ? -Math.abs(rawReceivedAmount)
      : Number(rawReceivedAmount.toFixed(2)),
    paymentMethod: String(entry?.paymentMethod || entry?.method || ""),
    postedAt: getFinanceEntryTimestamp(entry),
    status: String(entry?.status || "posted"),
    description:
      String(entry?.note || "").trim() ||
      (source === "debt_repayment"
        ? "客户还款入账"
        : negativeSource
          ? "订单退款冲销"
          : "订单收款入账"),
    source,
  };
}

function getFinanceEntriesInRange(startAt, endAt) {
  return readFinanceEntriesSnapshotInRange(startAt, endAt)
    .map((entry) => normalizeFinanceEntry(entry))
    .filter((entry) => entry.postedAt >= startAt && entry.postedAt < endAt)
    .sort((a, b) => b.postedAt - a.postedAt);
}

function buildFinanceIncomeSummary(entries) {
  const positiveEntries = entries.filter((entry) => entry.type === "income" && entry.status === "posted");
  const summary = {
    gas: 0,
    deposit: 0,
    residual: 0,
    other: 0,
    totalIncome: 0,
  };
  for (const item of positiveEntries) {
    const key = summary[item.categoryKey] !== undefined ? item.categoryKey : "other";
    summary[key] += Number(item.amount || 0);
    summary.totalIncome += Number(item.amount || 0);
  }
  return Object.fromEntries(
    Object.entries(summary).map(([key, value]) => [key, Number(value.toFixed(2))])
  );
}

function buildFinanceExpenseSummary(entries) {
  const summary = {
    purchaseExpense: 0,
    refundExpense: 0,
    totalExpense: 0,
  };
  for (const item of entries) {
    if (item.type !== "expense" || item.status !== "posted") continue;
    const amount = Math.abs(Number(item.amount || 0));
    summary.refundExpense += amount;
    summary.totalExpense += amount;
  }
  return Object.fromEntries(
    Object.entries(summary).map(([key, value]) => [key, Number(value.toFixed(2))])
  );
}

function buildPaymentSummary(entries, orders) {
  const base = {
    cashAmount: 0,
    wechatAmount: 0,
    alipayAmount: 0,
    transferAmount: 0,
    creditAmount: 0,
  };
  for (const entry of entries) {
    if (entry.status !== "posted") continue;
    const method = String(entry.paymentMethod || "").trim();
    const signedAmount =
      entry.type === "expense"
        ? -Math.abs(Number(entry.receivedAmount ?? entry.amount ?? 0))
        : Number(entry.receivedAmount ?? entry.amount ?? 0);
    if (method === "cash") base.cashAmount += signedAmount;
    if (method === "wechat") base.wechatAmount += signedAmount;
    if (method === "alipay") base.alipayAmount += signedAmount;
    if (method === "transfer") base.transferAmount += signedAmount;
  }
  for (const order of orders) {
    const receivedAmount = Number(order.receivedAmount || 0);
    base.creditAmount += Math.max(0, Number(order.amount || 0) - receivedAmount);
  }
  return Object.fromEntries(
    Object.entries(base).map(([key, value]) => [key, Number(value.toFixed(2))])
  );
}

function getOrdersInRange(startAt, endAt) {
  return readOrdersSnapshot().filter((order) => {
    const ts = Number(order.completedAt || order.createdAt || 0);
    return ts >= startAt && ts < endAt;
  });
}

function formatFinanceEntryTime(ts) {
  if (!ts) return "";
  return new Date(ts).toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildFinanceIncomeResponse(range) {
  const entries = getFinanceEntriesInRange(range.startAt, range.endAt);
  const summary = buildFinanceIncomeSummary(entries);
  const expenseSummary = buildFinanceExpenseSummary(entries);
  return {
    range: {
      preset: range.preset,
      start: formatLocalDateKey(range.startAt),
      end: formatLocalDateKey(range.endAt - 1),
    },
    summary: {
      ...summary,
      refundExpense: expenseSummary.refundExpense,
      totalExpense: expenseSummary.totalExpense,
      netIncome: Number((summary.totalIncome - expenseSummary.totalExpense).toFixed(2)),
    },
    items: entries.map((entry) => ({
      id: entry.id,
      orderId: entry.orderId,
      customerId: entry.customerId,
      customerName: entry.customerName,
      type: entry.type,
      category: entry.category,
      categoryKey: entry.categoryKey,
      amount: entry.amount,
      paymentMethod: entry.paymentMethod,
      description: entry.description,
      time: formatFinanceEntryTime(entry.postedAt),
      postedAt: entry.postedAt,
      status: entry.status,
    })),
  };
}

function buildDailyClosePayload(dateValue) {
  const { startAt, endAt } = getDateRangeBounds(dateValue, dateValue);
  const orders = getOrdersInRange(startAt, endAt).filter((order) => order.orderStatus === "completed");
  const entries = getFinanceEntriesInRange(startAt, endAt);
  const incomeSummary = buildFinanceIncomeSummary(entries);
  const expenseSummary = buildFinanceExpenseSummary(entries);
  const paymentSummary = buildPaymentSummary(entries, orders);
  const date = formatLocalDateKey(startAt);
  const latestClose =
    [...dailyCloseRecords].reverse().find((record) => record.date === date) || null;
  return {
    date,
    closeStatus: latestClose ? "closed" : "open",
    isClosed: Boolean(latestClose),
    closedAt: Number(latestClose?.closedAt || 0),
    latestClose,
    orderCount: orders.length,
    deliveryCylinders: orders.reduce((sum, order) => sum + Number(order.quantity || 0), 0),
    returnCylinders: orders.reduce((sum, order) => sum + Number(order.recycledEmptyCount || 0), 0),
    totalIncome: incomeSummary.totalIncome,
    totalExpense: expenseSummary.totalExpense,
    gasIncome: incomeSummary.gas,
    depositIncome: incomeSummary.deposit,
    residualIncome: incomeSummary.residual,
    rentIncome: incomeSummary.other,
    receivedToday: Number((incomeSummary.totalIncome - expenseSummary.totalExpense).toFixed(2)),
    pendingToday: paymentSummary.creditAmount,
    entryCount: entries.filter((entry) => entry.status === "posted").length,
    entries: entries.map((entry) => ({
      id: entry.id,
      category: entry.category,
      amount: entry.amount,
      customerName: entry.customerName,
      description: entry.description,
      paymentMethod: entry.paymentMethod,
      time: formatFinanceEntryTime(entry.postedAt),
      postedAt: entry.postedAt,
      type: entry.type,
    })),
    ...paymentSummary,
    ...expenseSummary,
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
    completedAt: orderType === "immediate_complete" ? Date.now() : 0,
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
  return readOrdersSnapshot({ status: "pending_delivery" })
    .filter((x) => x.orderStatus === "pending_delivery")
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((x) => mapOrderContract(x));
}

function getOrderById(orderId) {
  let order = quickOrders.find((x) => x.orderId === orderId);
  if (!order) {
    const dbOrder = findOrderById(orderId);
    if (dbOrder) {
      quickOrders.push(dbOrder);
      order = quickOrders.find((x) => x.orderId === orderId) || dbOrder;
    }
  }
  if (!order) throw new Error("订单不存在，请刷新后重试");
  return order;
}

function buildCustomerAccountSummary(customerId) {
  const account = ensureCustomerAccount(customerId);
  const orders = readOrdersSnapshot({ customerId });
  const completed = orders.filter((x) => x.orderStatus === "completed");
  const lastOrderAt = orders.length ? Math.max(...orders.map((x) => Number(x.createdAt || 0))) : 0;
  return {
    customerId,
    owedAmount: Number(Number(account.owedAmount || 0).toFixed(2)),
    owedEmptyCount: Number(account.owedEmptyCount || 0),
    collectionStatus: account.collectionStatus || "none",
    collectionNote: account.collectionNote || "",
    updatedAt: Number(account.updatedAt || 0),
    debtSinceAt: Number(account.debtSinceAt || 0),
    lastCollectionAt: Number(account.lastCollectionAt || 0),
    totalOrders: orders.length,
    completedOrders: completed.length,
    lastOrderAt,
  };
}

function adjustCustomerDebt(order, owedAmount, owedEmptyCount) {
  const account = ensureCustomerAccount(order.customerId);
  const prevOwedAmount = Number(account.owedAmount || 0);
  account.owedAmount = Number((Number(account.owedAmount || 0) + Number(owedAmount || 0)).toFixed(2));
  account.owedEmptyCount = Math.max(0, Number(account.owedEmptyCount || 0) + Number(owedEmptyCount || 0));
  account.updatedAt = Date.now();
  if (prevOwedAmount <= 0 && account.owedAmount > 0) {
    account.debtSinceAt = Date.now();
  }
  if (account.owedAmount <= 0) {
    account.debtSinceAt = 0;
  }
  persistCustomerLedger();
}

function getCustomerById(customerId) {
  return mockCustomers.find((x) => x.id === customerId) || null;
}

function mapOrderContract(order) {
  return {
    orderId: order.orderId,
    customerId: order.customerId,
    customerName: order.customerName,
    address: order.address,
    orderType: order.orderType,
    orderStatus: order.orderStatus,
    spec: order.spec,
    quantity: Number(order.quantity || 0),
    unitPrice: Number(Number(order.unitPrice || 0).toFixed(2)),
    amount: Number(Number(order.amount || 0).toFixed(2)),
    receivedAmount: Number(Number(order.receivedAmount || 0).toFixed(2)),
    paymentStatus: order.paymentStatus || "unpaid",
    paymentMethod: order.paymentMethod || "",
    recycledEmptyCount: Number(order.recycledEmptyCount || 0),
    recycledEmptySpec: String(order.recycledEmptySpec || order.spec || ""),
    owedEmptyCount: Number(order.owedEmptyCount || 0),
    residualWeight: Number(Number(order.residualWeight || 0).toFixed(2)),
    residualAmount: Number(Number(order.residualAmount || 0).toFixed(2)),
    scheduleAt: order.scheduleAt || null,
    inventoryStage: order.inventoryStage || "",
    createdAt: Number(order.createdAt || 0),
    completedAt: Number(order.completedAt || 0),
  };
}

function getCustomerDisplayPhone(customerId) {
  return String(getCustomerById(customerId)?.phone || "");
}

function getDebtDays(account) {
  const base = Number(account.debtSinceAt || account.updatedAt || 0);
  if (!base || Number(account.owedAmount || 0) <= 0) return 0;
  return Math.max(0, Math.floor((startOfTodayMs() - base) / (24 * 60 * 60 * 1000)));
}

function getDebtRiskLevel(debtDays) {
  if (debtDays > 15) return "overdue";
  if (debtDays > 7) return "warning";
  return "normal";
}

function shouldRemindToday(account) {
  if (Number(account.owedAmount || 0) <= 0) return false;
  const debtDays = getDebtDays(account);
  if (debtDays === 8) return true;
  const customerId = String(account.customerId || "");
  const lastReminder = debtReminderRecords.find((x) => x.customerId === customerId);
  if (!lastReminder) return debtDays >= 8;
  const lastReminderDay = Math.floor(Number(lastReminder.createdAt || 0) / (24 * 60 * 60 * 1000));
  const yesterdayDay = Math.floor(startOfTodayMs() / (24 * 60 * 60 * 1000)) - 1;
  return lastReminderDay === yesterdayDay;
}

function buildDebtReminderScript(customerName, amount) {
  return `${customerName}您好，您还有¥${Number(amount || 0).toFixed(2)}气款未结，方便的时候结一下，谢谢！\n-- 多立恒燃气配送`;
}

function getCustomerReminderHistory(customerId, limit = 20) {
  return debtReminderRecords.filter((x) => x.customerId === customerId).slice(0, limit);
}

function getCustomerRepaymentHistory(customerId, limit = 20) {
  return debtRepaymentRecords.filter((x) => x.customerId === customerId).slice(0, limit);
}

function buildDebtCustomerItem(customerId) {
  const customer = getCustomerById(customerId);
  if (!customer) return null;
  const account = ensureCustomerAccount(customerId);
  const debtAmount = Number(Number(account.owedAmount || 0).toFixed(2));
  if (debtAmount <= 0) return null;
  const debtDays = getDebtDays(account);
  const reminderHistory = getCustomerReminderHistory(customerId, 5);
  const repaymentHistory = getCustomerRepaymentHistory(customerId, 5);
  return {
    customerId,
    customerName: customer.name,
    phone: customer.phone,
    address: customer.address,
    debtAmount,
    debtDays,
    status: getDebtRiskLevel(debtDays),
    lastReminderAt: Number(reminderHistory[0]?.createdAt || account.lastCollectionAt || 0),
    debtSinceAt: Number(account.debtSinceAt || account.updatedAt || 0),
    collectionStatus: account.collectionStatus || "none",
    collectionNote: account.collectionNote || "",
    reminderTemplate: buildDebtReminderScript(customer.name, debtAmount),
    reminderHistory,
    repaymentHistory,
  };
}

function listDebtCustomers(filter = "all") {
  return Array.from(customerAccounts.keys())
    .map((customerId) => buildDebtCustomerItem(customerId))
    .filter(Boolean)
    .filter((item) => {
      if (filter === "overdue") return item.debtDays > 7;
      if (filter === "today") return shouldRemindToday(ensureCustomerAccount(item.customerId));
      return true;
    })
    .sort((a, b) => {
      if (b.debtDays !== a.debtDays) return b.debtDays - a.debtDays;
      return Number(b.debtAmount || 0) - Number(a.debtAmount || 0);
    });
}

function buildDebtOverview() {
  const debtItems = listDebtCustomers("all");
  const overdueItems = debtItems.filter((item) => item.debtDays > 7);
  return {
    totalDebt: {
      amount: Number(debtItems.reduce((sum, item) => sum + Number(item.debtAmount || 0), 0).toFixed(2)),
      customerCount: debtItems.length,
    },
    overdueDebt: {
      amount: Number(overdueItems.reduce((sum, item) => sum + Number(item.debtAmount || 0), 0).toFixed(2)),
      customerCount: overdueItems.length,
      thresholdDays: 7,
    },
    recentChanges: {
      newToday: debtItems.filter((item) => item.debtDays === 0).length,
      repaidToday: debtRepaymentRecords.filter((item) => isSameFinanceDay(item.createdAt)).length,
    },
  };
}

function buildDebtCustomerMutationResult(customerId) {
  const customer = getCustomerById(customerId);
  if (!customer) throw new Error("客户不存在");
  const account = ensureCustomerAccount(customerId);
  const debtAmount = Number(Number(account.owedAmount || 0).toFixed(2));
  const debtDays = getDebtDays(account);
  return {
    customerId,
    customerName: customer.name,
    phone: customer.phone,
    address: customer.address,
    debtAmount,
    debtDays,
    settled: debtAmount <= 0,
    status: debtAmount <= 0 ? "resolved" : getDebtRiskLevel(debtDays),
    collectionStatus: account.collectionStatus || "none",
    collectionNote: account.collectionNote || "",
    lastReminderAt: Number(account.lastCollectionAt || 0),
    debtSinceAt: Number(account.debtSinceAt || account.updatedAt || 0),
  };
}

function getDebtCustomerDetail(customerId) {
  const item = buildDebtCustomerItem(customerId);
  if (!item) throw new Error("当前客户无欠款记录");
  return item;
}

function recordDebtReminder(payload) {
  const customerId = String(payload.customerId || "").trim();
  const customer = getCustomerById(customerId);
  if (!customer) throw new Error("客户不存在");
  const type = String(payload.type || "").trim();
  if (!["call", "sms", "wechat", "visit"].includes(type)) {
    throw new Error("催款类型不合法");
  }
  const result = String(payload.result || "unreachable").trim();
  if (!["promised", "unreachable", "refused", "no_answer"].includes(result)) {
    throw new Error("催款结果不合法");
  }
  const account = ensureCustomerAccount(customerId);
  const content = String(payload.content || buildDebtReminderScript(customer.name, account.owedAmount)).trim().slice(0, 500);
  const promisedAt = String(payload.promisedAt || "").trim();
  const createdAt = Date.now();
  const record = {
    reminderId: `DR-${createdAt}-${debtReminderRecords.length + 1}`,
    customerId,
    customerName: customer.name,
    type,
    content,
    result,
    promisedAt,
    createdAt,
  };
  debtReminderRecords.unshift(record);
  if (debtReminderRecords.length > 300) debtReminderRecords.pop();

  const nextStatus = result === "promised" ? "promised" : "contacted";
  const note = promisedAt ? `承诺还款时间：${promisedAt}` : `${type}催款`;
  updateCollectionStatus(customerId, { status: nextStatus, note });
  return {
    reminder: record,
    customer: buildDebtCustomerMutationResult(customerId),
  };
}

function recordDebtRepayment(payload) {
  const customerId = String(payload.customerId || "").trim();
  const customer = getCustomerById(customerId);
  if (!customer) throw new Error("客户不存在");
  const amount = Number(payload.amount || 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("还款金额不合法");
  }
  const method = String(payload.method || "").trim();
  if (!["cash", "wechat", "alipay", "transfer"].includes(method)) {
    throw new Error("还款方式不合法");
  }
  const note = String(payload.note || "").trim().slice(0, 200);
  const account = ensureCustomerAccount(customerId);
  const beforeAmount = Number(Number(account.owedAmount || 0).toFixed(2));
  const afterAmount = Number(Math.max(0, beforeAmount - amount).toFixed(2));
  const overpaidAmount = Number(Math.max(0, amount - beforeAmount).toFixed(2));
  account.owedAmount = afterAmount;
  account.updatedAt = Date.now();
  if (afterAmount <= 0) {
    account.collectionStatus = "resolved";
    account.collectionNote = overpaidAmount > 0 ? `超额还款 ¥${overpaidAmount.toFixed(2)}` : "本期欠款已还清";
    account.debtSinceAt = 0;
  } else {
    account.collectionStatus = "pending";
    account.collectionNote = `最近还款 ¥${amount.toFixed(2)}`;
  }
  account.lastCollectionAt = Date.now();
  account.collectionHistory.push({
    changedAt: account.lastCollectionAt,
    status: account.collectionStatus,
    note: account.collectionNote,
  });
  if (account.collectionHistory.length > 200) {
    account.collectionHistory.splice(0, account.collectionHistory.length - 200);
  }
  persistCustomerLedger();

  const record = {
    repaymentId: `DP-${Date.now()}-${debtRepaymentRecords.length + 1}`,
    customerId,
    customerName: customer.name,
    amount: Number(amount.toFixed(2)),
    method,
    note,
    beforeAmount,
    afterAmount,
    overpaidAmount,
    createdAt: Date.now(),
  };
  debtRepaymentRecords.unshift(record);
  if (debtRepaymentRecords.length > 300) debtRepaymentRecords.pop();

  financeEntries.push({
    entryId: `FE-DEBT-${record.createdAt}-${financeEntries.length + 1}`,
    orderId: "",
    customerId,
    customerName: customer.name,
    source: "debt_repayment",
    amount: Number(amount.toFixed(2)),
    receivedAmount: Number(amount.toFixed(2)),
    pendingAmount: 0,
    paymentMethod: method,
    postedAt: record.createdAt,
    status: "posted",
    note: note || "客户还款入账",
  });
  if (financeEntries.length > 500) financeEntries.shift();

  return {
    repayment: record,
    customer: buildDebtCustomerMutationResult(customerId),
  };
}

function seedDebtDemoData() {
  const hasExistingDebt = Array.from(customerAccounts.values()).some((x) => Number(x.owedAmount || 0) > 0);
  if (hasExistingDebt || debtReminderRecords.length || debtRepaymentRecords.length) return;
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const seeds = [
    {
      customerId: "CUST-001",
      owedAmount: 480,
      debtDays: 15,
      collectionStatus: "contacted",
      collectionNote: "电话催款后未还",
      reminders: [
        { type: "call", result: "no_answer", daysAgo: 2, content: "电话催款未接通" },
        { type: "sms", result: "unreachable", daysAgo: 7, content: "短信催款未回复" },
      ],
      repayments: [{ amount: 200, method: "cash", daysAgo: 28, note: "上月先还部分" }],
    },
    {
      customerId: "CUST-002",
      owedAmount: 260,
      debtDays: 8,
      collectionStatus: "promised",
      collectionNote: "承诺本周结清",
      reminders: [{ type: "call", result: "promised", daysAgo: 1, promisedAt: "2026-04-15", content: "客户承诺两天内还款" }],
      repayments: [],
    },
    {
      customerId: "CUST-003",
      owedAmount: 100,
      debtDays: 0,
      collectionStatus: "pending",
      collectionNote: "今日记账",
      reminders: [],
      repayments: [],
    },
  ];

  for (const seed of seeds) {
    const account = ensureCustomerAccount(seed.customerId);
    const debtSinceAt = now - seed.debtDays * day;
    account.owedAmount = seed.owedAmount;
    account.collectionStatus = seed.collectionStatus;
    account.collectionNote = seed.collectionNote;
    account.updatedAt = debtSinceAt;
    account.debtSinceAt = debtSinceAt;
    account.lastCollectionAt = seed.reminders[0] ? now - seed.reminders[0].daysAgo * day : 0;
    account.collectionHistory = [];
    for (const reminder of seed.reminders) {
      const createdAt = now - reminder.daysAgo * day;
      debtReminderRecords.push({
        reminderId: `DR-SEED-${seed.customerId}-${createdAt}`,
        customerId: seed.customerId,
        customerName: getCustomerById(seed.customerId)?.name || "",
        type: reminder.type,
        content: reminder.content,
        result: reminder.result,
        promisedAt: reminder.promisedAt || "",
        createdAt,
      });
      account.collectionHistory.push({
        changedAt: createdAt,
        status: reminder.result === "promised" ? "promised" : "contacted",
        note: reminder.promisedAt ? `承诺还款时间：${reminder.promisedAt}` : reminder.content,
      });
    }
    for (const repayment of seed.repayments) {
      const createdAt = now - repayment.daysAgo * day;
      debtRepaymentRecords.push({
        repaymentId: `DP-SEED-${seed.customerId}-${createdAt}`,
        customerId: seed.customerId,
        customerName: getCustomerById(seed.customerId)?.name || "",
        amount: repayment.amount,
        method: repayment.method,
        note: repayment.note,
        beforeAmount: seed.owedAmount + repayment.amount,
        afterAmount: seed.owedAmount,
        overpaidAmount: 0,
        createdAt,
      });
    }
  }
  debtReminderRecords.sort((a, b) => b.createdAt - a.createdAt);
  debtRepaymentRecords.sort((a, b) => b.createdAt - a.createdAt);
  persistCustomerLedger();
}

function getSafetyByOrderId(orderId) {
  let record = safetyRecords.find((x) => x.orderId === orderId);
  if (!record) {
    const dbRecord = findSafetyByOrderId(orderId);
    if (dbRecord) {
      safetyRecords.unshift(dbRecord);
      record = safetyRecords.find((x) => x.orderId === orderId) || dbRecord;
    }
  }
  return record;
}

function getSafetyById(safetyId) {
  let record = safetyRecords.find((x) => x.safetyId === safetyId);
  if (!record) {
    const dbRecord = findSafetyById(safetyId);
    if (dbRecord) {
      safetyRecords.unshift(dbRecord);
      record = safetyRecords.find((x) => x.safetyId === safetyId) || dbRecord;
    }
  }
  if (!record) throw new Error("安检记录不存在，请刷新后重试");
  return record;
}

function getRegionName(regionCode = "") {
  const code = String(regionCode || "CN-DEFAULT").trim() || "CN-DEFAULT";
  return REGION_NAME_MAP[code] || code;
}

function buildSafetyOperatorMeta(input = {}) {
  const regionCode = String(input.regionCode || "CN-DEFAULT").trim() || "CN-DEFAULT";
  const companyName = String(input.companyName || "").trim() || "多立恒默认燃气公司";
  const driverName = String(input.driverName || input.nickname || "").trim() || "未识别配送员";
  return {
    userId: String(input.userId || "").trim(),
    dealerId: String(input.dealerId || "").trim(),
    driverName,
    companyId: String(input.companyId || "").trim(),
    companyName,
    regionCode,
    regionName: String(input.regionName || "").trim() || getRegionName(regionCode),
  };
}

function getSafetyPolicySnapshot(meta = {}) {
  const context = {
    dealerId: String(meta.dealerId || "").trim(),
    companyId: String(meta.companyId || "").trim(),
    companyName: String(meta.companyName || "").trim(),
    regionCode: String(meta.regionCode || "CN-DEFAULT").trim() || "CN-DEFAULT",
  };
  const policy = getActivePolicy(context);
  const reportingMode = String(policy?.content?.reporting?.mode || "company_first").trim();
  let reportTargetName = "燃气公司监管接口";
  if (reportingMode === "direct") {
    reportTargetName = "监管平台接口";
  } else if (reportingMode === "hybrid") {
    reportTargetName = context.companyName ? `${context.companyName} / 监管平台` : "燃气公司 / 监管平台";
  } else if (context.companyName) {
    reportTargetName = `${context.companyName} 监管接口`;
  }
  return {
    reportingMode,
    reportTargetName,
  };
}

function buildSafetyBusinessSummary(record = {}, queueItem = null) {
  const order = record.orderId ? findOrderById(record.orderId) || quickOrders.find((item) => item.orderId === record.orderId) : null;
  const queueOperator = queueItem?.operator || {};
  const operator = buildSafetyOperatorMeta({
    regionCode: record.regionCode || queueOperator.regionCode,
    regionName: record.regionName || queueOperator.regionName,
    companyId: record.companyId || queueOperator.companyId,
    companyName: record.companyName || queueOperator.companyName,
    dealerId: record.dealerId || queueOperator.dealerId,
    driverName: record.driverName || queueOperator.driverName,
    userId: record.userId || queueOperator.userId,
  });
  const reportTargetName =
    String(record.reportTargetName || "").trim() ||
    getSafetyPolicySnapshot(operator).reportTargetName;
  return {
    safetyId: String(record.safetyId || queueItem?.payload?.safetyId || queueItem?.offlineId || ""),
    orderId: String(record.orderId || queueItem?.payload?.orderId || queueItem?.payload?.submitPayload?.orderId || ""),
    customerName: String(record.customerName || order?.customerName || "").trim() || "未识别客户",
    address: String(record.address || order?.address || "").trim() || "待补充地址",
    regionCode: operator.regionCode,
    regionName: operator.regionName,
    companyName: operator.companyName,
    driverName: operator.driverName,
    checkedAt: Number(record.checkedAt || record.updatedAt || record.createdAt || queueItem?.updatedAt || 0),
    reportTargetName,
    checkItems: Array.isArray(record.checkItems) ? record.checkItems : [],
    photoCount: Array.isArray(record.photoUrls) ? record.photoUrls.length : 0,
    hasAbnormal: Boolean(record.hasAbnormal),
    hazardNote: String(record.hazardNote || "").trim(),
    reportAttempts: Number(record.reportAttempts || 0),
    lastError: String(record.lastError || queueItem?.lastError || "").trim(),
    reportLogs: Array.isArray(record.reportLogs) ? record.reportLogs.slice(0, 5) : [],
  };
}

function ensureSafetyTriggered(order) {
  let record = getSafetyByOrderId(order.orderId);
  if (record) return record;
  record = {
    safetyId: `SAFE-${Date.now()}`,
    orderId: order.orderId,
    customerId: order.customerId,
    customerName: order.customerName,
    address: order.address || "",
    regionCode: "CN-DEFAULT",
    regionName: getRegionName("CN-DEFAULT"),
    companyId: "",
    companyName: "",
    dealerId: "",
    userId: "",
    driverName: "",
    checkedAt: 0,
    reportTargetName: "",
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

function buildSafetyReportPayload(record) {
  return {
    safetyId: String(record.safetyId || ""),
    orderId: String(record.orderId || ""),
    customerId: String(record.customerId || ""),
    customerName: String(record.customerName || ""),
    address: String(record.address || ""),
    regionCode: String(record.regionCode || "CN-DEFAULT"),
    regionName: String(record.regionName || ""),
    companyId: String(record.companyId || ""),
    companyName: String(record.companyName || ""),
    dealerId: String(record.dealerId || ""),
    userId: String(record.userId || ""),
    driverName: String(record.driverName || ""),
    checkedAt: Number(record.checkedAt || Date.now()),
    reportTargetName: String(record.reportTargetName || ""),
    checkItems: Array.isArray(record.checkItems) ? record.checkItems : [],
    photoUrls: Array.isArray(record.photoUrls) ? record.photoUrls : [],
    hasAbnormal: Boolean(record.hasAbnormal),
    hazardNote: String(record.hazardNote || ""),
  };
}

async function submitSafetyToRegulator(reportPayload) {
  if (SAFETY_REPORT_MODE !== "external") {
    return {
      success: true,
      summary: "mock 模式：本地直接标记上报成功",
      targetName: "mock-regulator",
    };
  }
  if (!SAFETY_REPORT_ENDPOINT) {
    return {
      success: false,
      message: "未配置 SAFETY_REPORT_ENDPOINT，无法执行外部监管上报",
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SAFETY_REPORT_TIMEOUT_MS);
  try {
    const headers = {
      "Content-Type": "application/json",
    };
    if (SAFETY_REPORT_AUTH_TOKEN) {
      headers.Authorization = `Bearer ${SAFETY_REPORT_AUTH_TOKEN}`;
    }
    const res = await fetch(SAFETY_REPORT_ENDPOINT, {
      method: "POST",
      headers,
      body: JSON.stringify(reportPayload),
      signal: controller.signal,
    });
    let responseText = "";
    try {
      responseText = await res.text();
    } catch (_err) {
      responseText = "";
    }
    if (!res.ok) {
      return {
        success: false,
        message: `监管上报失败（HTTP ${res.status}）${responseText ? `：${responseText.slice(0, 160)}` : ""}`,
      };
    }
    return {
      success: true,
      summary: "监管上报成功",
      targetName: SAFETY_REPORT_ENDPOINT,
      response: responseText ? responseText.slice(0, 200) : "",
    };
  } catch (err) {
    if (err?.name === "AbortError") {
      return {
        success: false,
        message: `监管上报超时（>${SAFETY_REPORT_TIMEOUT_MS}ms）`,
      };
    }
    return {
      success: false,
      message: `监管上报异常：${String(err?.message || "未知错误")}`,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function runSafetyReport(record) {
  record.reportAttempts += 1;
  const reportPayload = buildSafetyReportPayload(record);
  const reportResult = await submitSafetyToRegulator(reportPayload);
  if (reportResult.success) {
    record.status = "completed";
    record.lastError = "";
    record.reportLogs.unshift({
      at: Date.now(),
      status: "completed",
      summary: reportResult.summary || "监管上报成功",
      target: reportResult.targetName || "",
    });
    return;
  }
  record.status = "failed";
  record.lastError = reportResult.message || "监管上报失败";
  record.reportLogs.unshift({
    at: Date.now(),
    status: "failed",
    summary: record.lastError,
  });
}

async function submitSafetyRecord(orderId, payload, meta = {}) {
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

  const operator = buildSafetyOperatorMeta(meta);
  const policySnapshot = getSafetyPolicySnapshot(operator);
  record.checkItems = checkItems;
  record.photoUrls = photoUrls;
  record.hasAbnormal = hasAbnormal;
  record.hazardNote = hazardNote;
  record.customerId = order.customerId;
  record.address = order.address || "";
  record.regionCode = operator.regionCode;
  record.regionName = operator.regionName;
  record.companyId = operator.companyId;
  record.companyName = operator.companyName;
  record.dealerId = operator.dealerId;
  record.userId = operator.userId;
  record.driverName = operator.driverName;
  record.checkedAt = Date.now();
  record.reportTargetName = policySnapshot.reportTargetName;
  record.updatedAt = Date.now();
  await runSafetyReport(record);

  return {
    safetyId: record.safetyId,
    orderId: record.orderId,
    status: record.status,
    reportAttempts: record.reportAttempts,
    lastError: record.lastError,
    updatedAt: record.updatedAt,
  };
}

async function retrySafetyReport(safetyId) {
  const record = getSafetyById(safetyId);
  if (!record.checkItems.length || !record.photoUrls.length) {
    throw new Error("安检信息不完整，请先提交检查项与照片");
  }
  await runSafetyReport(record);
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

async function syncSafetyOfflinePayload(payload = {}, meta = {}) {
  const mode = String(payload.mode || "").trim();
  if (mode === "retry" && payload.safetyId) {
    return await retrySafetyReport(String(payload.safetyId));
  }
  if (mode === "submit" && payload.orderId) {
    return await submitSafetyRecord(String(payload.orderId), payload.submitPayload || {}, meta);
  }
  throw new Error("安检离线同步数据不完整");
}

function enqueueOfflineChange(payload, operator = {}) {
  const entityType = String(payload.entityType || "").trim();
  const action = String(payload.action || "").trim();
  const changePayload = payload.payload || {};
  if (!["order", "inventory", "customer", "safety"].includes(entityType)) {
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
    operator: buildSafetyOperatorMeta(operator),
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
    const serverOrder = findOrderById(orderId) || quickOrders.find((x) => x.orderId === orderId);
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

async function syncOneOfflineItem(item) {
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
  if (item.entityType === "safety") {
    try {
      const result = await syncSafetyOfflinePayload(item.payload || {}, item.operator || {});
      if (String(result?.status || "") !== "completed") {
        item.retryCount += 1;
        item.syncStatus = "failed";
        item.conflictType = "safety_sync_failed";
        item.lastError = String(result?.lastError || "安检补传失败");
        item.resultSummary = "安检补传失败";
        if (item.retryCount >= 3) {
          item.manualRequired = true;
          item.resultSummary = "安检补传失败，需人工处理";
          item.nextRetryAt = 0;
        } else {
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
      item.resultSummary = "安检补传成功";
      item.nextRetryAt = 0;
      item.updatedAt = Date.now();
      return {
        offlineId: item.offlineId,
        syncStatus: item.syncStatus,
        conflictType: "",
        manualRequired: false,
        message: item.resultSummary,
        nextRetryAt: 0,
      };
    } catch (err) {
      item.retryCount += 1;
      item.syncStatus = "failed";
      item.conflictType = "safety_sync_failed";
      item.lastError = err.message || "安检补传失败";
      item.resultSummary = "安检补传失败";
      if (item.retryCount >= 3) {
        item.manualRequired = true;
        item.resultSummary = "安检补传失败，需人工处理";
        item.nextRetryAt = 0;
      } else {
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

async function batchSyncOfflineQueue(payload) {
  const inputIds = Array.isArray(payload.offlineIds) ? payload.offlineIds : [];
  const idSet = new Set(inputIds.map((x) => String(x)));
  const targets = offlineQueue.filter((x) => {
    if (idSet.size > 0 && !idSet.has(x.offlineId)) return false;
    if (x.syncStatus === "completed") return false;
    if (x.nextRetryAt && Date.now() < Number(x.nextRetryAt)) return false;
    return !x.manualRequired;
  });
  const results = [];
  for (const item of targets) {
    const result = await syncOneOfflineItem(item);
    results.push(result);
  }
  return {
    total: results.length,
    completed: results.filter((x) => x.syncStatus === "completed").length,
    failed: results.filter((x) => x.syncStatus === "failed").length,
    manualRequired: results.filter((x) => x.manualRequired).length,
    results,
  };
}

async function retryOfflineItem(offlineId) {
  const item = offlineQueue.find((x) => x.offlineId === offlineId);
  if (!item) throw new Error("离线队列记录不存在");
  if (item.manualRequired) throw new Error("该记录已进入人工处理，请先人工确认");
  if (item.nextRetryAt && Date.now() < Number(item.nextRetryAt)) {
    throw new Error("未到重试时间，请稍后再试");
  }
  return await syncOneOfflineItem(item);
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

function normalizePolicyScope(payload = {}) {
  const scopeType = ["account", "company", "region"].includes(String(payload.scopeType || "").trim())
    ? String(payload.scopeType || "").trim()
    : "region";
  const fallbackValue = scopeType === "company" ? "COMP-DEFAULT" : scopeType === "account" ? "DEALER-DEFAULT" : "CN-DEFAULT";
  const scopeValue = String(payload.scopeValue || payload.regionCode || fallbackValue).trim() || fallbackValue;
  const scopeLabel = String(
    payload.scopeLabel ||
      payload.regionName ||
      (scopeType === "company" ? payload.companyName : "") ||
      (scopeType === "account" ? payload.dealerName : "") ||
      scopeValue
  ).trim() || scopeValue;
  const regionCode =
    scopeType === "region"
      ? scopeValue
      : String(payload.regionCode || payload.content?.regionCode || "CN-DEFAULT").trim() || "CN-DEFAULT";
  return { scopeType, scopeValue, scopeLabel, regionCode };
}

function buildPolicyScopeKey(policy = {}) {
  const normalized = normalizePolicyScope(policy);
  return `${normalized.scopeType}:${normalized.scopeValue}`;
}

function getPolicyContext(accessToken = "") {
  try {
    const auth = authByAccessToken(accessToken);
    return {
      userId: String(auth?.user?.id || "").trim(),
      dealerId: String(auth?.user?.dealerId || "").trim(),
      companyId: String(auth?.user?.companyId || "").trim(),
      companyName: String(auth?.user?.companyName || "").trim(),
      regionCode: String(auth?.user?.regionCode || "CN-DEFAULT").trim() || "CN-DEFAULT",
    };
  } catch (_err) {
    return {
      userId: "",
      dealerId: "",
      companyId: "",
      companyName: "",
      regionCode: "CN-DEFAULT",
    };
  }
}

function matchesPolicyScope(policy = {}, context = {}) {
  const normalized = normalizePolicyScope(policy);
  if (normalized.scopeType === "account") {
    return normalized.scopeValue === String(context.dealerId || "").trim();
  }
  if (normalized.scopeType === "company") {
    return normalized.scopeValue === String(context.companyId || "").trim();
  }
  return normalized.scopeValue === String(context.regionCode || "CN-DEFAULT").trim();
}

function getActivePolicy(context = {}) {
  const activePolicies = policyVersions.filter((x) => x.status === "active");
  if (context.dealerId) {
    const dealerHit = activePolicies.find((x) => normalizePolicyScope(x).scopeType === "account" && matchesPolicyScope(x, context));
    if (dealerHit) return dealerHit;
  }
  if (context.companyId) {
    const companyHit = activePolicies.find((x) => normalizePolicyScope(x).scopeType === "company" && matchesPolicyScope(x, context));
    if (companyHit) return companyHit;
  }
  if (context.regionCode) {
    const regionHit = activePolicies.find((x) => normalizePolicyScope(x).scopeType === "region" && matchesPolicyScope(x, context));
    if (regionHit) return regionHit;
  }
  return activePolicies.find((x) => buildPolicyScopeKey(x) === "region:CN-DEFAULT") || activePolicies[0] || null;
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
  const scope = normalizePolicyScope(payload);
  const content = payload.content && typeof payload.content === "object" ? payload.content : {};
  const draftVersion = `v${new Date().toISOString().slice(0, 19).replace(/[-T:]/g, ".")}`;
  const draft = {
    version: draftVersion,
    scopeType: scope.scopeType,
    scopeValue: scope.scopeValue,
    scopeLabel: scope.scopeLabel,
    regionCode: scope.regionCode,
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
  const targetScopeKey = buildPolicyScopeKey(target);
  policyVersions.forEach((x) => {
    if (x.status === "active" && buildPolicyScopeKey(x) === targetScopeKey) x.status = "history";
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
  const targetScopeKey = buildPolicyScopeKey(target);
  const current = policyVersions.find((x) => x.status === "active" && buildPolicyScopeKey(x) === targetScopeKey) || null;
  policyVersions.forEach((x) => {
    if (x.status === "active" && buildPolicyScopeKey(x) === targetScopeKey) x.status = "history";
  });
  target.status = "active";
  target.rolledBackFrom = current ? current.version : "";
  target.publishedAt = Date.now();
  target.publishedBy = operator;
  addPolicyAudit("rollback", operator, `回滚到策略 ${toVersion}`);
  return target;
}

function buildBusinessMetrics() {
  const orders = readOrdersSnapshot();
  const queueItems = readOfflineQueueSnapshot();
  const completed = orders.filter((x) => x.orderStatus === "completed");
  const pendingDelivery = orders.filter((x) => x.orderStatus === "pending_delivery");
  const failedSync = queueItems.filter((x) => x.syncStatus === "failed");
  const totalRevenue = completed.reduce((sum, x) => sum + Number(x.receivedAmount || 0), 0);
  const pendingReceivable = completed.reduce(
    (sum, x) => sum + Math.max(0, Number(x.amount || 0) - Number(x.receivedAmount || 0)),
    0
  );
  return {
    order: {
      totalOrders: orders.length,
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
      manualRequiredCount: queueItems.filter((x) => x.manualRequired).length,
    },
  };
}

function buildComplianceMetrics() {
  const records = readSafetyRecordsSnapshot();
  const total = records.length;
  const completed = records.filter((x) => x.status === "completed").length;
  const failed = records.filter((x) => x.status === "failed").length;
  const pending = records.filter((x) => x.status === "pending").length;
  const abnormal = records.filter((x) => x.hasAbnormal).length;
  return {
    summary: { total, completed, failed, pending, abnormal },
    failedList: records
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
  const queueItems = readOfflineQueueSnapshot();
  const items = queueItems.filter((x) => {
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
    items: items.slice(0, 100).map((item) => {
      if (item.entityType !== "safety") return item;
      const safetyId = String(item.payload?.safetyId || "").trim();
      const orderId = String(item.payload?.orderId || item.payload?.submitPayload?.orderId || "").trim();
      const record =
        (safetyId && (findSafetyById(safetyId) || safetyRecords.find((entry) => entry.safetyId === safetyId))) ||
        (orderId && getSafetyByOrderId(orderId)) ||
        null;
      return {
        ...item,
        business: buildSafetyBusinessSummary(record || { orderId }, item),
      };
    }),
    stats: getOfflineQueueStats(queueItems),
    filteredStats: getOfflineQueueStats(items),
  };
}

function completeDeliveryOrder(order, payload) {
  if (order.orderStatus !== "pending_delivery") {
    const err = new Error("仅待配送订单可执行完单");
    err.code = "ORDER_409_STATUS";
    throw err;
  }
  const receivedRaw = String(payload.receivedAmount ?? "").trim();
  const receivedAmount = Number(receivedRaw);
  if (!/^\d+(\.\d{1,2})?$/.test(receivedRaw) || !Number.isFinite(receivedAmount) || receivedAmount < 0) {
    const err = new Error("实收金额格式不正确，请输入最多两位小数且不小于 0 的数字");
    err.code = "VALIDATION_400";
    throw err;
  }
  const paymentMethod = String(payload.paymentMethod || "").trim();
  if (!["wechat", "cash", "credit"].includes(paymentMethod)) {
    const err = new Error("请选择有效收款方式（微信、现金、记账）");
    err.code = "VALIDATION_400";
    throw err;
  }
  const recycledEmptyCount = Number(payload.recycledEmptyCount || 0);
  const owedEmptyCount = Number(payload.owedEmptyCount || 0);
  const recycledEmptySpec = String(payload.recycledEmptySpec || order.spec || "").trim();
  const residualWeight = normalizeResidualWeight(payload.residualWeight);
  const businessRules = getBusinessRules();
  const residualEnabled = Boolean(businessRules?.residual?.enabled);
  const residualPrice = Number(businessRules?.residual?.price || 0);
  const residualMode = String(businessRules?.residual?.defaultMode || "deduct").trim();
  const residualAmount =
    residualEnabled && residualMode !== "ignore"
      ? Number((residualWeight * residualPrice).toFixed(2))
      : 0;
  if (!Number.isInteger(recycledEmptyCount) || recycledEmptyCount < 0) {
    const err = new Error("回收空瓶数量必须为非负整数");
    err.code = "VALIDATION_400";
    throw err;
  }
  if (!Number.isInteger(owedEmptyCount) || owedEmptyCount < 0) {
    const err = new Error("欠瓶数量必须为非负整数");
    err.code = "VALIDATION_400";
    throw err;
  }
  if (!["10kg", "15kg", "50kg"].includes(recycledEmptySpec)) {
    const err = new Error("回收气瓶规格不合法");
    err.code = "VALIDATION_400";
    throw err;
  }
  if (residualWeight > 0 && recycledEmptyCount <= 0) {
    const err = new Error("录入残液前，请先填写回收空瓶数量");
    err.code = "VALIDATION_400";
    throw err;
  }
  try {
    validateOrderEmptyCounts(order.quantity, recycledEmptyCount, owedEmptyCount);
  } catch (validationErr) {
    const err = new Error(validationErr.message);
    err.code = "VALIDATION_400";
    throw err;
  }
  const totalReceivable = Number((Number(order.amount || 0) + residualAmount).toFixed(2));
  if (paymentMethod === "credit" && receivedAmount !== 0) {
    const err = new Error("选择记账时，实收金额必须为 0");
    err.code = "VALIDATION_400";
    throw err;
  }
  if (paymentMethod !== "credit" && receivedAmount <= 0) {
    const err = new Error("现金/微信收款时，实收金额必须大于 0；全额赊账请改选“记账”");
    err.code = "VALIDATION_400";
    throw err;
  }

  const prev = { orderStatus: order.orderStatus, paymentStatus: order.paymentStatus };
  order.orderStatus = "completed";
  order.receivedAmount = Number(receivedAmount.toFixed(2));
  order.paymentMethod = paymentMethod;
  order.recycledEmptyCount = recycledEmptyCount;
  order.recycledEmptySpec = recycledEmptySpec;
  order.owedEmptyCount = owedEmptyCount;
  order.residualWeight = residualWeight;
  order.residualAmount = residualAmount;
  order.paymentStatus =
    receivedAmount <= 0 ? "unpaid" : receivedAmount < totalReceivable ? "partial_paid" : "paid";
  consumeInventoryFromLock(order.spec, Number(order.quantity || 0), order.orderId);
  if (recycledEmptyCount > 0) {
    returnEmptyInventoryToOnHand(recycledEmptySpec, recycledEmptyCount, order.orderId, "delivery_empty_return");
  }
  const inventoryAfter = getInventoryState(order.spec);
  order.debtRecordedAmount = Number(Math.max(0, totalReceivable - receivedAmount).toFixed(2));
  order.debtRecordedEmptyCount = owedEmptyCount;
  order.completedAt = Date.now();
  order.syncStatus = "pending";
  order.inventoryStage = "consumed";
  order.lastAction = "complete";
  order.lastActionUndoUntil = 0;
  order.lastActionSnapshot = prev;
  order.canModifyUntil = 0;
  adjustCustomerDebt(order, order.debtRecordedAmount, order.debtRecordedEmptyCount);
  const safetyRecord = ensureSafetyTriggered(order);
  appendDeliveryFinanceEntries(order);

  return {
    orderId: order.orderId,
    orderStatus: order.orderStatus,
    paymentStatus: order.paymentStatus,
    amount: order.amount,
    receivedAmount: order.receivedAmount,
    residualAmount: order.residualAmount,
    residualWeight: order.residualWeight,
    inventoryAfter,
    owedAmount: order.debtRecordedAmount,
    owedEmptyCount: order.debtRecordedEmptyCount,
    safety: {
      safetyId: safetyRecord.safetyId,
      status: safetyRecord.status,
    },
    undoAvailableUntil: null,
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
  order.lastActionUndoUntil = 0;
  return {
    orderId: order.orderId,
    orderStatus: order.orderStatus,
    inventoryRollback: inventoryAfter,
    undoAvailableUntil: null,
  };
}

function basicUpdateOrder(order, payload) {
  if (order.orderStatus === "cancelled") {
    throw new Error("已取消订单不允许修改");
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
    validateOrderEmptyCounts(nextQuantity, order.recycledEmptyCount, order.owedEmptyCount);
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
    const amt = Number(order.amount || 0) + Number(order.residualAmount || 0);
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
  if (!order.lastAction) {
    throw new Error("当前订单没有可撤销的最近操作");
  }
  if (order.lastAction === "complete") {
    if (!order.lastActionSnapshot) throw new Error("撤销失败，请稍后重试");
    const state = getInventoryState(order.spec);
    inventoryBySpec[order.spec].onHand = state.onHand + Number(order.quantity || 0);
    inventoryBySpec[order.spec].locked = state.locked + Number(order.quantity || 0);
    const recycledEmptyCount = Number(order.recycledEmptyCount || 0);
    const recycledEmptySpec = String(order.recycledEmptySpec || order.spec || "");
    if (recycledEmptyCount > 0) {
      const emptyState = getInventoryState(recycledEmptySpec);
      if (emptyState.emptyOnHand < recycledEmptyCount) {
        throw new Error("撤销失败：空瓶库存不足，需人工处理");
      }
      inventoryBySpec[recycledEmptySpec].emptyOnHand = emptyState.emptyOnHand - recycledEmptyCount;
    }
    pushInventoryLog("undo_complete", order.spec, Number(order.quantity || 0), Number(order.quantity || 0), order.orderId);
    if (recycledEmptyCount > 0) {
      pushInventoryLog("undo_empty_return", recycledEmptySpec, 0, 0, order.orderId, {
        deltaEmptyOnHand: -recycledEmptyCount,
      });
    }
    order.orderStatus = order.lastActionSnapshot.orderStatus;
    order.paymentStatus = order.lastActionSnapshot.paymentStatus;
    order.receivedAmount = 0;
    order.paymentMethod = "";
    order.completedAt = 0;
    order.inventoryStage = "locked";
    order.recycledEmptyCount = 0;
    order.recycledEmptySpec = order.spec || "";
    order.owedEmptyCount = 0;
    order.residualWeight = 0;
    order.residualAmount = 0;
    adjustCustomerDebt(
      order,
      -Number(order.debtRecordedAmount || 0),
      -Number(order.debtRecordedEmptyCount || 0)
    );
    voidFinanceEntriesByOrder(order.orderId);
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
  const orders = readOrdersSnapshot({ customerId })
    .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
  return {
    ...customer,
    account,
    summary: {
      owedAmount: account.owedAmount,
      owedEmptyCount: account.owedEmptyCount,
      totalOrders: account.totalOrders,
      completedOrders: account.completedOrders,
      lastOrderAt: account.lastOrderAt,
      riskLevel:
        account.owedAmount > 0
          ? getDebtRiskLevel(getDebtDays(rawAccount))
          : account.owedEmptyCount > 0
            ? "attention"
            : "normal",
    },
    recentOrders: orders.slice(0, 10).map((order) => mapOrderContract(order)),
    collectionHistory: getRecentCollectionHistoryEntries(rawAccount, 20),
    accountSummaryConsistency: buildAccountSummaryConsistency(account, rawAccount),
  };
}

function listCustomers(params) {
  const page = Math.max(1, Number(params.page || 1));
  const size = Math.min(100, Math.max(1, Number(params.size || 20)));
  const keyword = String(params.keyword || "").trim().toLowerCase();
  const filter = String(params.filter || "all").trim();

  let items = mockCustomers.map((customer) => {
    const account = buildCustomerAccountSummary(customer.id);
    return {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      address: customer.address,
      tags: Array.isArray(customer.tags) ? customer.tags : [],
      owed_amount: account.owedAmount,
      owed_empty_count: account.owedEmptyCount,
      order_count: account.totalOrders,
      completed_order_count: account.completedOrders,
      last_order_at: account.lastOrderAt,
      collection_status: account.collectionStatus,
      collection_note: account.collectionNote,
      updated_at: account.updatedAt,
      risk_level:
        account.owedAmount > 0
          ? getDebtRiskLevel(getDebtDays(ensureCustomerAccount(customer.id)))
          : account.owedEmptyCount > 0
            ? "attention"
            : "normal",
    };
  });

  if (keyword) {
    items = items.filter((item) => {
      const haystack = [item.id, item.name, item.phone, item.address, ...(item.tags || [])]
        .join(" ")
        .toLowerCase();
      return haystack.includes(keyword);
    });
  }

  if (filter === "debt") {
    items = items.filter((item) => Number(item.owed_amount || 0) > 0);
  } else if (filter === "bottle") {
    items = items.filter((item) => Number(item.owed_empty_count || 0) > 0);
  } else if (filter === "vip") {
    items = items.filter((item) => (item.tags || []).includes("VIP"));
  }

  const riskWeight = { overdue: 3, warning: 2, attention: 1, normal: 0 };
  items.sort((a, b) => {
    const riskDelta = (riskWeight[b.risk_level] || 0) - (riskWeight[a.risk_level] || 0);
    if (riskDelta !== 0) return riskDelta;
    return Number(b.last_order_at || 0) - Number(a.last_order_at || 0);
  });

  const total = items.length;
  const start = (page - 1) * size;
  return {
    total,
    page,
    size,
    list: items.slice(start, start + size),
  };
}

function listCustomerOrders(customerId, params) {
  if (!getCustomerById(customerId)) throw new Error("客户不存在，请刷新后重试");
  const page = Math.max(1, Number(params.page || 1));
  const size = Math.min(100, Math.max(1, Number(params.size || 20)));
  const orders = readOrdersSnapshot({ customerId })
    .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
  const total = orders.length;
  const start = (page - 1) * size;
  return {
    total,
    page,
    size,
    list: orders.slice(start, start + size).map((order) => mapOrderContract(order)),
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
  const date = String(payload.date || formatLocalDateKey(startOfTodayMs())).trim();
  const summary = buildDailyClosePayload(date);
  if (summary.closeStatus === "closed") {
    throw new Error("今日已完成日结，请勿重复提交");
  }
  const note = String(payload.note || "").trim();
  const record = {
    closeId: `DC-${Date.now()}`,
    date: summary.date,
    receivedToday: summary.receivedToday,
    pendingToday: summary.pendingToday,
    totalExpense: summary.totalExpense,
    entryCount: summary.entryCount,
    checkedItems: Array.isArray(payload.checkedItems)
      ? payload.checkedItems.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 20)
      : [],
    note,
    status: "closed",
    closedAt: Date.now(),
    snapshot: {
      orderCount: summary.orderCount,
      deliveryCylinders: summary.deliveryCylinders,
      returnCylinders: summary.returnCylinders,
      cashAmount: summary.cashAmount,
      wechatAmount: summary.wechatAmount,
      alipayAmount: summary.alipayAmount,
      transferAmount: summary.transferAmount,
      creditAmount: summary.creditAmount,
    },
  };
  dailyCloseRecords.push(record);
  return record;
}

function buildVirtualCustomerPhone() {
  const existing = new Set(mockCustomers.map((x) => String(x.phone || "").trim()).filter(Boolean));
  for (let i = 0; i < 30; i += 1) {
    const seed = String(Date.now() + i).slice(-8);
    const candidate = `199${seed}`;
    if (!existing.has(candidate)) return candidate;
  }
  return `199${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
}

function createCustomer(payload) {
  const name = String(payload.name || "").trim();
  const rawPhone = String(payload.phone || "").trim();
  const rawAddress = String(payload.address || "").trim();
  if (!name) throw new Error("客户姓名不能为空");
  const phone = rawPhone || buildVirtualCustomerPhone();
  const address = rawAddress || "待补充地址";
  if (!/^1\d{10}$/.test(phone)) throw new Error("手机号格式不正确");
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
    note: String(payload.note || "").trim().slice(0, 500),
  };
  mockCustomers.unshift(customer);
  ensureCustomerAccount(customer.id);
  persistCustomerLedger();
  return customer;
}

function updateCustomer(customerId, payload) {
  const customer = mockCustomers.find((x) => x.id === customerId);
  if (!customer) throw new Error("客户不存在，请刷新后重试");
  const nextName = String(payload?.name ?? customer.name).trim();
  const nextPhone = String(payload?.phone ?? customer.phone).trim();
  const nextAddress = String(payload?.address ?? customer.address).trim();
  if (!nextName) throw new Error("客户姓名不能为空");
  if (!/^1\d{10}$/.test(nextPhone)) throw new Error("手机号格式不正确");
  if (!nextAddress) throw new Error("地址不能为空");
  if (
    mockCustomers.some((x) => x.id !== customerId && String(x.phone || "").trim() === nextPhone)
  ) {
    throw new Error("该手机号已存在客户");
  }
  const tagList = Array.isArray(payload?.tags)
    ? payload.tags.map((t) => String(t || "").trim()).filter(Boolean).slice(0, 12)
    : Array.isArray(customer.tags)
      ? customer.tags
      : [];
  customer.name = nextName;
  customer.phone = nextPhone;
  customer.address = nextAddress;
  customer.tags = tagList;
  customer.note = String(payload?.note ?? customer.note ?? "").trim().slice(0, 500);
  return customer;
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") return sendJson(req, res, 200, { ok: true });
  const reqUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = reqUrl.pathname;
  const requestId = crypto.randomUUID();

  try {
    if (req.method === "GET" && pathname === "/health") {
      return sendJson(req, res, 200, {
        success: true,
        data: {
          status: "ok",
          now: Date.now(),
          port: PORT,
          dbPath: DB_PATH,
        },
      });
    }

    if (req.method === "POST" && pathname === "/auth/send-code") {
      const { phone } = await readBody(req);
      if (!/^1\d{10}$/.test(phone || "")) {
        return sendContractError(req, res, 400, "VALIDATION_400", "手机号格式不正确", requestId);
      }
      const code = issueCode(phone);
      return sendContractSuccess(req, res, 200, { message: "验证码已发送", dev_code: code }, requestId);
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
            dealerId: result.user.dealerId,
            regionCode: result.user.regionCode,
            companyId: result.user.companyId,
            companyName: result.user.companyName,
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
      return sendContractSuccess(req, res, 200, result, requestId);
    }

    if (req.method === "GET" && pathname === "/auth/devices") {
      const accessToken = readAccessToken(req);
      const devices = listDevices(accessToken);
      return sendContractSuccess(req, res, 200, devices, requestId);
    }

    if (req.method === "POST" && pathname === "/auth/devices/logout") {
      const accessToken = readAccessToken(req);
      const { sessionId } = await readBody(req);
      const result = logoutSession(accessToken, sessionId);
      return sendContractSuccess(req, res, 200, result, requestId);
    }

    if (req.method === "GET" && pathname === "/workbench/overview") {
      const accessToken = readAccessToken(req);
      listDevices(accessToken);
      return sendJson(req, res, 200, { success: true, data: buildWorkbenchOverview() });
    }

    if (req.method === "GET" && pathname === "/customers") {
      const accessToken = readAccessToken(req);
      listDevices(accessToken);
      return sendJson(req, res, 200, {
        success: true,
        data: listCustomers({
          page: reqUrl.searchParams.get("page"),
          size: reqUrl.searchParams.get("size"),
          keyword: reqUrl.searchParams.get("keyword") || reqUrl.searchParams.get("search"),
          filter: reqUrl.searchParams.get("filter"),
        }),
      });
    }

    if (req.method === "GET" && pathname === "/customers/quick-select") {
      const accessToken = readAccessToken(req);
      listDevices(accessToken);
      return sendJson(req, res, 200, { success: true, data: mockCustomers });
    }

    if (req.method === "POST" && pathname === "/customers") {
      const accessToken = readAccessToken(req);
      listDevices(accessToken);
      const payload = await readBody(req);
      const customer = createCustomer(payload);
      return sendJson(req, res, 200, { success: true, data: customer });
    }

    if (req.method === "PATCH" && pathname.startsWith("/customers/") && !pathname.endsWith("/collection-status")) {
      const accessToken = readAccessToken(req);
      listDevices(accessToken);
      const customerId = decodeURIComponent(pathname.replace("/customers/", ""));
      if (!customerId || customerId.includes("/")) {
        return sendJson(req, res, 404, { success: false, error: "接口不存在" });
      }
      const payload = await readBody(req);
      const updated = updateCustomer(customerId, payload);
      return sendJson(req, res, 200, { success: true, data: updated });
    }

    if (req.method === "GET" && pathname.startsWith("/customers/") && pathname.endsWith("/detail")) {
      const accessToken = readAccessToken(req);
      listDevices(accessToken);
      const customerId = decodeURIComponent(pathname.replace("/customers/", "").replace("/detail", ""));
      return sendJson(req, res, 200, { success: true, data: getCustomerDetail(customerId) });
    }

    if (req.method === "GET" && pathname.startsWith("/customers/") && pathname.endsWith("/orders")) {
      const accessToken = readAccessToken(req);
      listDevices(accessToken);
      const customerId = decodeURIComponent(pathname.replace("/customers/", "").replace("/orders", ""));
      return sendJson(req, res, 200, {
        success: true,
        data: listCustomerOrders(customerId, {
          page: reqUrl.searchParams.get("page"),
          size: reqUrl.searchParams.get("size"),
        }),
      });
    }

    if (req.method === "GET" && pathname.startsWith("/customers/")) {
      const accessToken = readAccessToken(req);
      listDevices(accessToken);
      const customerId = decodeURIComponent(pathname.replace("/customers/", ""));
      if (!customerId || customerId.includes("/")) {
        return sendJson(req, res, 404, { success: false, error: "接口不存在" });
      }
      return sendJson(req, res, 200, { success: true, data: getCustomerDetail(customerId) });
    }

    if (req.method === "PATCH" && pathname.startsWith("/customers/") && pathname.endsWith("/collection-status")) {
      const accessToken = readAccessToken(req);
      listDevices(accessToken);
      const customerId = decodeURIComponent(
        pathname.replace("/customers/", "").replace("/collection-status", "")
      );
      const payload = await readBody(req);
      return sendJson(req, res, 200, { success: true, data: updateCollectionStatus(customerId, payload) });
    }

    if (req.method === "POST" && pathname === "/inventory/check") {
      const accessToken = readAccessToken(req);
      listDevices(accessToken);
      const { spec, quantity } = await readBody(req);
      const state = getInventoryState(spec);
      const requested = Number(quantity || 0);
      return sendJson(req, res, 200, {
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
      return sendJson(req, res, 200, { success: true, data, logs: inventoryLogs.slice(0, 20) });
    }

    if (req.method === "GET" && pathname === "/inventory/alerts") {
      const accessToken = readAccessToken(req);
      listDevices(accessToken);
      return sendJson(req, res, 200, { success: true, data: buildInventoryAlertSnapshot() });
    }

    if (req.method === "POST" && pathname === "/inventory/purchase") {
      const accessToken = readAccessToken(req);
      listDevices(accessToken);
      const payload = await readBody(req);
      const state = applyInventoryPurchase(payload);
      return sendJson(req, res, 200, { success: true, data: state });
    }

    if (req.method === "POST" && pathname === "/inventory/refill") {
      const accessToken = readAccessToken(req);
      listDevices(accessToken);
      const payload = await readBody(req);
      const state = applyInventoryRefill(payload);
      return sendJson(req, res, 200, { success: true, data: state });
    }

    if (req.method === "POST" && pathname === "/inventory/stocktake") {
      const accessToken = readAccessToken(req);
      listDevices(accessToken);
      const payload = await readBody(req);
      const state = applyInventoryStocktake(payload);
      return sendJson(req, res, 200, { success: true, data: state });
    }

    if (req.method === "POST" && pathname === "/orders/quick-create") {
      try {
        const accessToken = readAccessToken(req);
        listDevices(accessToken);
        const payload = await readBody(req);
        const result = createQuickOrder(payload);
        if (!result.success) {
          return sendContractError(req, res, 409, "INVENTORY_409_STOCK", result.error, requestId);
        }
        return sendContractSuccess(req, res, 200, result.data, requestId);
      } catch (orderErr) {
        const mapped = mapOrderError(orderErr);
        return sendContractError(req, res, mapped.statusCode, mapped.code, mapped.message, requestId);
      }
    }

    if (req.method === "GET" && pathname === "/finance/today-summary") {
      const accessToken = readAccessToken(req);
      listDevices(accessToken);
      return sendJson(req, res, 200, { success: true, data: buildTodayFinanceSummary() });
    }

    if (req.method === "GET" && pathname === "/finance/income") {
      const accessToken = readAccessToken(req);
      listDevices(accessToken);
      const range = resolveFinanceRange(reqUrl.searchParams);
      return sendJson(req, res, 200, { success: true, data: buildFinanceIncomeResponse(range) });
    }

    if (req.method === "GET" && pathname === "/finance/entries") {
      const accessToken = readAccessToken(req);
      listDevices(accessToken);
      const onlyToday = reqUrl.searchParams.get("today") !== "0";
      const list = onlyToday
        ? getFinanceEntriesInRange(startOfTodayMs(), Date.now() + 1)
        : getFinanceEntriesInRange(0, Number.MAX_SAFE_INTEGER);
      return sendJson(req, res, 200, { success: true, data: list });
    }

    if (req.method === "GET" && pathname === "/finance/today-expense") {
      const accessToken = readAccessToken(req);
      listDevices(accessToken);
      const entries = getFinanceEntriesInRange(startOfTodayMs(), Date.now() + 1);
      return sendJson(req, res, 200, { success: true, data: buildFinanceExpenseSummary(entries) });
    }

    if (req.method === "GET" && pathname === "/finance/daily-close") {
      const accessToken = readAccessToken(req);
      listDevices(accessToken);
      const date = reqUrl.searchParams.get("date") || formatLocalDateKey(startOfTodayMs());
      return sendJson(req, res, 200, { success: true, data: buildDailyClosePayload(date) });
    }

    if (req.method === "GET" && pathname === "/finance/daily-close/history") {
      const accessToken = readAccessToken(req);
      listDevices(accessToken);
      const month = String(reqUrl.searchParams.get("month") || "").trim();
      const list = dailyCloseRecords
        .filter((record) => !month || String(record.date || "").startsWith(month))
        .sort((a, b) => Number(b.closedAt || 0) - Number(a.closedAt || 0));
      return sendJson(req, res, 200, { success: true, data: list });
    }

    if (req.method === "GET" && pathname.startsWith("/finance/daily-close/")) {
      const accessToken = readAccessToken(req);
      listDevices(accessToken);
      const date = decodeURIComponent(pathname.replace("/finance/daily-close/", ""));
      return sendJson(req, res, 200, { success: true, data: buildDailyClosePayload(date) });
    }

    if (req.method === "GET" && pathname === "/debts/overview") {
      const accessToken = readAccessToken(req);
      listDevices(accessToken);
      return sendJson(req, res, 200, { success: true, data: buildDebtOverview() });
    }

    if (req.method === "GET" && pathname === "/debts/list") {
      const accessToken = readAccessToken(req);
      listDevices(accessToken);
      const filter = String(reqUrl.searchParams.get("filter") || "all");
      const page = Math.max(1, parseInt(reqUrl.searchParams.get("page") || "1", 10));
      const size = Math.min(50, Math.max(1, parseInt(reqUrl.searchParams.get("size") || "20", 10)));
      const items = listDebtCustomers(filter);
      const start = (page - 1) * size;
      return sendJson(req, res, 200, {
        success: true,
        data: {
          total: items.length,
          page,
          size,
          items: items.slice(start, start + size),
        },
      });
    }

    if (req.method === "GET" && pathname.startsWith("/debts/customer/")) {
      const accessToken = readAccessToken(req);
      listDevices(accessToken);
      const customerId = decodeURIComponent(pathname.replace("/debts/customer/", ""));
      return sendJson(req, res, 200, { success: true, data: getDebtCustomerDetail(customerId) });
    }

    if (req.method === "POST" && pathname === "/debts/reminder") {
      const accessToken = readAccessToken(req);
      listDevices(accessToken);
      const payload = await readBody(req);
      return sendJson(req, res, 200, { success: true, data: recordDebtReminder(payload) });
    }

    if (req.method === "POST" && pathname === "/debts/repayment") {
      const accessToken = readAccessToken(req);
      listDevices(accessToken);
      const payload = await readBody(req);
      return sendJson(req, res, 200, { success: true, data: recordDebtRepayment(payload) });
    }

    if (req.method === "POST" && pathname === "/finance/daily-close") {
      const accessToken = readAccessToken(req);
      listDevices(accessToken);
      const payload = await readBody(req);
      return sendJson(req, res, 200, { success: true, data: createDailyClose(payload) });
    }

    if (req.method === "POST" && pathname === "/finance/daily-close/confirm") {
      const accessToken = readAccessToken(req);
      listDevices(accessToken);
      const payload = await readBody(req);
      return sendJson(req, res, 200, { success: true, data: createDailyClose(payload) });
    }

    if (req.method === "GET" && pathname === "/orders") {
      const accessToken = readAccessToken(req);
      listDevices(accessToken);

      const page = Math.max(1, parseInt(reqUrl.searchParams.get("page") || "1", 10));
      const size = Math.min(100, Math.max(1, parseInt(reqUrl.searchParams.get("size") || "20", 10)));
      const status = reqUrl.searchParams.get("status") || "all";
      const keyword = (reqUrl.searchParams.get("keyword") || "").trim().toLowerCase();
      const customerId = String(reqUrl.searchParams.get("customerId") || "").trim();

      const filteredOrders = readOrdersSnapshot({ status, keyword, customerId }).sort(
        (a, b) => (b.createdAt || 0) - (a.createdAt || 0)
      );
      const total = filteredOrders.length;
      const start = (page - 1) * size;
      const end = start + size;
      const list = filteredOrders.slice(start, end).map((order) => mapOrderContract(order));

      return sendJson(req, res, 200, {
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
      return sendJson(req, res, 200, { success: true, data: getPendingOrders() });
    }

    if (req.method === "GET" && pathname.startsWith("/orders/")) {
      const accessToken = readAccessToken(req);
      listDevices(accessToken);
      const orderId = decodeURIComponent(pathname.replace("/orders/", ""));
      if (!orderId || orderId.includes("/")) return sendJson(req, res, 404, { success: false, error: "接口不存在" });
      const order = getOrderById(orderId);
      return sendJson(req, res, 200, { success: true, data: mapOrderContract(order) });
    }

    if (req.method === "POST" && pathname.endsWith("/complete")) {
      const accessToken = readAccessToken(req);
      listDevices(accessToken);
      const orderId = decodeURIComponent(pathname.replace("/orders/", "").replace("/complete", ""));
      const order = getOrderById(orderId);
      const payload = await readBody(req);
      return sendJson(req, res, 200, { success: true, data: completeDeliveryOrder(order, payload) });
    }

    if (req.method === "POST" && pathname.endsWith("/cancel")) {
      const accessToken = readAccessToken(req);
      listDevices(accessToken);
      const orderId = decodeURIComponent(pathname.replace("/orders/", "").replace("/cancel", ""));
      const order = getOrderById(orderId);
      return sendJson(req, res, 200, { success: true, data: cancelDeliveryOrder(order) });
    }

    if (req.method === "PATCH" && pathname.endsWith("/basic-update")) {
      const accessToken = readAccessToken(req);
      listDevices(accessToken);
      const orderId = decodeURIComponent(pathname.replace("/orders/", "").replace("/basic-update", ""));
      const order = getOrderById(orderId);
      const payload = await readBody(req);
      return sendJson(req, res, 200, { success: true, data: basicUpdateOrder(order, payload) });
    }

    if (req.method === "POST" && pathname.endsWith("/undo")) {
      const accessToken = readAccessToken(req);
      listDevices(accessToken);
      const orderId = decodeURIComponent(pathname.replace("/orders/", "").replace("/undo", ""));
      const order = getOrderById(orderId);
      return sendJson(req, res, 200, { success: true, data: undoOrderAction(order) });
    }

    if (req.method === "POST" && pathname.endsWith("/return")) {
      const accessToken = readAccessToken(req);
      listDevices(accessToken);
      const orderId = decodeURIComponent(pathname.replace("/orders/", "").replace("/return", ""));
      const payload = await readBody(req);
      const result = processOrderReturn(orderId, payload);
      return sendJson(req, res, 200, result);
    }

    if (req.method === "POST" && pathname.endsWith("/exchange")) {
      const accessToken = readAccessToken(req);
      listDevices(accessToken);
      const orderId = decodeURIComponent(pathname.replace("/orders/", "").replace("/exchange", ""));
      const payload = await readBody(req);
      const result = processOrderExchange(orderId, payload);
      return sendJson(req, res, 200, result);
    }

    if (req.method === "GET" && pathname.startsWith("/safety/by-order/")) {
      const accessToken = readAccessToken(req);
      listDevices(accessToken);
      const orderId = decodeURIComponent(pathname.replace("/safety/by-order/", ""));
      const record = getSafetyByOrderId(orderId);
      if (!record) {
        return sendJson(req, res, 200, { success: true, data: null });
      }
      return sendJson(req, res, 200, {
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
      const { user } = authByAccessToken(accessToken);
      const orderId = decodeURIComponent(pathname.replace("/safety/by-order/", ""));
      const payload = await readBody(req);
      const data = await submitSafetyRecord(orderId, payload, {
        userId: user.id,
        dealerId: user.dealerId,
        driverName: user.nickname,
        companyId: user.companyId,
        companyName: user.companyName,
        regionCode: user.regionCode,
      });
      return sendJson(req, res, 200, { success: true, data });
    }

    if (req.method === "POST" && pathname.startsWith("/safety/") && pathname.endsWith("/retry")) {
      const accessToken = readAccessToken(req);
      listDevices(accessToken);
      const safetyId = decodeURIComponent(pathname.replace("/safety/", "").replace("/retry", ""));
      const data = await retrySafetyReport(safetyId);
      return sendJson(req, res, 200, { success: true, data });
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
      return sendJson(req, res, 200, {
        success: true,
        data: {
          stats: {
            ...queueView.stats,
            waitingRetry:
              queueView.stats?.waitingRetry ??
              readOfflineQueueSnapshot().filter((x) => x.nextRetryAt && Date.now() < Number(x.nextRetryAt)).length,
          },
          filteredStats: queueView.filteredStats,
          items: queueView.items,
          filters,
        },
      });
    }

    if (req.method === "POST" && pathname === "/sync/queue/enqueue") {
      const accessToken = readAccessToken(req);
      const { user } = authByAccessToken(accessToken);
      const payload = await readBody(req);
      const data = enqueueOfflineChange(payload, {
        userId: user.id,
        dealerId: user.dealerId,
        driverName: user.nickname,
        companyId: user.companyId,
        companyName: user.companyName,
        regionCode: user.regionCode,
      });
      return sendJson(req, res, 200, { success: true, data });
    }

    if (req.method === "POST" && pathname === "/sync/queue/batch-submit") {
      const accessToken = readAccessToken(req);
      listDevices(accessToken);
      const payload = await readBody(req);
      const data = await batchSyncOfflineQueue(payload);
      return sendJson(req, res, 200, { success: true, data });
    }

    if (req.method === "POST" && pathname.startsWith("/sync/queue/") && pathname.endsWith("/retry")) {
      const accessToken = readAccessToken(req);
      listDevices(accessToken);
      const offlineId = decodeURIComponent(pathname.replace("/sync/queue/", "").replace("/retry", ""));
      const data = await retryOfflineItem(offlineId);
      return sendJson(req, res, 200, { success: true, data });
    }

    if (req.method === "POST" && pathname.startsWith("/sync/queue/") && pathname.endsWith("/manual")) {
      const accessToken = readAccessToken(req);
      listDevices(accessToken);
      const offlineId = decodeURIComponent(pathname.replace("/sync/queue/", "").replace("/manual", ""));
      const data = markOfflineManual(offlineId);
      return sendJson(req, res, 200, { success: true, data });
    }

    if (req.method === "GET" && pathname === "/platform/policies/current") {
      const accessToken = readAccessToken(req);
      listDevices(accessToken);
      const context = getPolicyContext(accessToken);
      return sendJson(req, res, 200, {
        success: true,
        data: getActivePolicy(context),
      });
    }

    if (req.method === "GET" && pathname === "/platform/policies/versions") {
      const accessToken = readAccessToken(req);
      listDevices(accessToken);
      return sendJson(req, res, 200, {
        success: true,
        data: policyVersions,
      });
    }

    if (req.method === "POST" && pathname === "/platform/policies/edit") {
      const accessToken = readAccessToken(req);
      listDevices(accessToken);
      const payload = await readBody(req);
      const data = savePolicyDraft(payload);
      return sendJson(req, res, 200, { success: true, data });
    }

    if (req.method === "POST" && pathname === "/platform/policies/publish") {
      const accessToken = readAccessToken(req);
      listDevices(accessToken);
      const payload = await readBody(req);
      const data = publishPolicy(payload);
      return sendJson(req, res, 200, { success: true, data });
    }

    if (req.method === "POST" && pathname === "/platform/policies/rollback") {
      const accessToken = readAccessToken(req);
      listDevices(accessToken);
      const payload = await readBody(req);
      const data = rollbackPolicy(payload);
      return sendJson(req, res, 200, { success: true, data });
    }

    if (req.method === "GET" && pathname === "/platform/policies/audit-logs") {
      const accessToken = readAccessToken(req);
      listDevices(accessToken);
      return sendJson(req, res, 200, {
        success: true,
        data: policyAuditLogs,
      });
    }

    if (req.method === "GET" && pathname === "/platform/monitor/business-metrics") {
      const accessToken = readAccessToken(req);
      listDevices(accessToken);
      return sendJson(req, res, 200, {
        success: true,
        data: buildBusinessMetrics(),
      });
    }

    if (req.method === "GET" && pathname === "/platform/monitor/compliance-metrics") {
      const accessToken = readAccessToken(req);
      listDevices(accessToken);
      return sendJson(req, res, 200, {
        success: true,
        data: buildComplianceMetrics(),
      });
    }

    if (req.method === "GET" && pathname === "/settings/business") {
      const accessToken = readAccessToken(req);
      listDevices(accessToken);
      return sendJson(req, res, 200, {
        success: true,
        data: getBusinessRules("default"),
      });
    }

    if (req.method === "PUT" && pathname === "/settings/business") {
      const accessToken = readAccessToken(req);
      listDevices(accessToken);
      const payload = await readBody(req);
      return sendJson(req, res, 200, {
        success: true,
        data: saveBusinessRules(payload, "default"),
      });
    }

    if (req.method === "POST" && pathname === "/settings/business/reset") {
      const accessToken = readAccessToken(req);
      listDevices(accessToken);
      return sendJson(req, res, 200, {
        success: true,
        data: resetBusinessRules("default"),
      });
    }

    return sendJson(req, res, 404, { success: false, error: "接口不存在" });
  } catch (err) {
    if (pathname.startsWith("/auth/")) {
      const mapped = mapAuthError(err, pathname);
      return sendContractError(req, res, mapped.statusCode, mapped.code, mapped.message, requestId);
    }
    if (pathname === "/orders" || pathname.startsWith("/orders/")) {
      const mapped = mapOrderError(err);
      return sendContractError(req, res, mapped.statusCode, mapped.code, mapped.message, requestId);
    }
    return sendJson(req, res, 400, { success: false, error: err.message });
  } finally {
    if (req.method !== "GET" && req.method !== "OPTIONS") {
      persistRuntimeStateSafe();
    }
  }
});

server.listen(PORT, HOST, () => {
  console.log(`认证服务已启动：http://${HOST}:${PORT} (SQLite: ${DB_PATH})`);
});
