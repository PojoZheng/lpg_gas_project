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
  "10kg": { onHand: 8, locked: 0 },
  "15kg": { onHand: 12, locked: 0 },
  "50kg": { onHand: 3, locked: 0 },
};
const quickOrders = [];
const inventoryLogs = [];
const safetyRecords = [];
const offlineQueue = [];

function getInventoryState(spec) {
  if (!inventoryBySpec[spec]) throw new Error("气瓶规格不支持");
  const onHand = Number(inventoryBySpec[spec].onHand || 0);
  const locked = Number(inventoryBySpec[spec].locked || 0);
  const available = Math.max(0, onHand - locked);
  return { spec, onHand, locked, available };
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
  order.completedAt = Date.now();
  order.syncStatus = "pending";
  order.inventoryStage = "consumed";
  order.lastAction = "complete";
  order.lastActionUndoUntil = Date.now() + 5000;
  order.lastActionSnapshot = prev;
  const safetyRecord = ensureSafetyTriggered(order);

  return {
    orderId: order.orderId,
    orderStatus: order.orderStatus,
    paymentStatus: order.paymentStatus,
    amount: order.amount,
    receivedAmount: order.receivedAmount,
    inventoryAfter,
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
  if (hasQuantity && order.orderStatus === "pending_delivery") {
    const nextQuantity = Number(payload.quantity);
    const delta = nextQuantity - Number(order.quantity || 0);
    if (delta > 0) {
      const lockResult = lockInventory(order.spec, delta, order.orderId);
      if (!lockResult.success) throw new Error(lockResult.error);
    } else if (delta < 0) {
      releaseLockedInventory(order.spec, Math.abs(delta), order.orderId);
    }
  }

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
      const accessToken = readAccessToken(req);
      listDevices(accessToken);
      const payload = await readBody(req);
      const result = createQuickOrder(payload);
      if (!result.success) {
        return sendJson(res, 400, { success: false, error: result.error, data: result.inventory });
      }
      return sendJson(res, 200, result);
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
      return sendJson(res, 200, {
        success: true,
        data: {
          stats: {
            pending: offlineQueue.filter((x) => x.syncStatus === "pending").length,
            syncing: offlineQueue.filter((x) => x.syncStatus === "syncing").length,
            failed: offlineQueue.filter((x) => x.syncStatus === "failed").length,
            completed: offlineQueue.filter((x) => x.syncStatus === "completed").length,
            manualRequired: offlineQueue.filter((x) => x.manualRequired).length,
            waitingRetry: offlineQueue.filter((x) => x.nextRetryAt && Date.now() < Number(x.nextRetryAt)).length,
          },
          items: offlineQueue.slice(0, 100),
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

    return sendJson(res, 404, { success: false, error: "接口不存在" });
  } catch (err) {
    return sendJson(res, 400, { success: false, error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`认证服务已启动：http://localhost:${PORT}`);
});
