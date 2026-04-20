const FLOW_KEY = "delivery_flow_state_v1";

function readRaw() {
  try {
    return JSON.parse(sessionStorage.getItem(FLOW_KEY) || "{}");
  } catch (_err) {
    return {};
  }
}

function writeRaw(next) {
  sessionStorage.setItem(FLOW_KEY, JSON.stringify(next || {}));
}

export function getFlowState() {
  return readRaw();
}

export function patchFlowState(patch) {
  const next = { ...readRaw(), ...(patch || {}) };
  writeRaw(next);
  return next;
}

export function clearFlowState() {
  sessionStorage.removeItem(FLOW_KEY);
}

export function setSelectedOrder(order) {
  if (!order?.orderId) return;
  patchFlowState({
    selectedOrderId: order.orderId,
    selectedOrder: {
      orderId: order.orderId,
      customerId: order.customerId,
      customerName: order.customerName,
      address: order.address,
      scheduleAt: order.scheduleAt,
      spec: order.spec,
      quantity: Number(order.quantity || 0),
      amount: Number(order.amount || 0),
    },
  });
}

export function setSettlementDraft(draft) {
  patchFlowState({ settlementDraft: { ...(draft || {}) } });
}

export function getSettlementDraft() {
  return readRaw().settlementDraft || {};
}

export function setPolicySafetyRequired(required) {
  patchFlowState({ safetyRequired: Boolean(required), safetyRequiredResolvedAt: Date.now() });
}

export function setCompleteResult(result) {
  patchFlowState({
    lastComplete: {
      orderId: result?.orderId || "",
      owedAmount: Number(result?.owedAmount || 0),
      owedEmptyCount: Number(result?.owedEmptyCount || 0),
      completedAt: Date.now(),
    },
  });
}
