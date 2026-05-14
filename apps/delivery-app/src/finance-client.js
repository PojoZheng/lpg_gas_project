import { authFetchJson } from "./auth-client.js";
import { API_BASE_URL } from "./api-base.js";

const CATEGORY_META = {
  gas: { label: "气款", key: "gas" },
  deposit: { label: "押金", key: "deposit" },
  residual: { label: "残液", key: "residual" },
  other: { label: "其他", key: "other" },
};

function fmtDateText(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function dayStartMs(dateText) {
  return new Date(`${dateText}T00:00:00`).getTime();
}

function dayEndMs(dateText) {
  return new Date(`${dateText}T23:59:59.999`).getTime();
}

function safeNumber(v) {
  const n = Number(v || 0);
  return Number.isFinite(n) ? n : 0;
}

function mapPaymentText(method) {
  const key = String(method || "").toLowerCase();
  if (key === "cash") return "现金";
  if (key === "wechat") return "微信";
  if (key === "alipay") return "支付宝";
  if (key === "credit") return "记账";
  if (key === "transfer") return "转账";
  return "其他";
}

function mapCategoryKey(raw) {
  const value = String(raw || "").toLowerCase();
  if (!value) return "gas";
  if (value.includes("deposit") || value.includes("押金")) return "deposit";
  if (value.includes("residual") || value.includes("残液")) return "residual";
  if (value.includes("gas") || value.includes("气款") || value.includes("delivery")) return "gas";
  return "other";
}

function normalizeIncomeItem(item) {
  const postedAt = Number(item.postedAt || item.timestamp || Date.now());
  const signedAmount = safeNumber(item.amount !== undefined ? item.amount : item.receivedAmount);
  const signedReceivedAmount = safeNumber(
    item.receivedAmount !== undefined ? item.receivedAmount : item.amount
  );
  const amount = Math.abs(signedAmount);
  const categoryKey = mapCategoryKey(item.category || item.source || item.type);
  const paymentMethod = String(item.paymentMethod || item.payment_method || "").toLowerCase();
  const type = String(item.type || "").toLowerCase() === "expense" || signedAmount < 0 ? "expense" : "income";
  return {
    id: String(item.entryId || item.id || item.orderId || `FI-${postedAt}`),
    orderId: item.orderId || "",
    customerName: item.customerName || item.customer_name || "未知客户",
    type,
    categoryKey,
    categoryLabel: CATEGORY_META[categoryKey].label,
    amount,
    signedAmount: type === "expense" ? -amount : amount,
    receivedAmount: Math.abs(signedReceivedAmount),
    signedReceivedAmount: type === "expense" ? -Math.abs(signedReceivedAmount) : Math.abs(signedReceivedAmount),
    paymentMethod,
    paymentText: mapPaymentText(paymentMethod),
    time: postedAt,
    timeText: new Date(postedAt).toLocaleString("zh-CN"),
    source: item.source || item.description || "",
    description: String(item.description || "").trim(),
    status: String(item.status || "posted"),
  };
}

function buildSummary(items) {
  const totals = { gas: 0, deposit: 0, residual: 0, other: 0 };
  const incomeItems = items.filter((it) => it.type === "income");
  incomeItems.forEach((it) => {
    totals[it.categoryKey] += safeNumber(it.amount);
  });
  const total = Object.values(totals).reduce((sum, n) => sum + n, 0);
  const refund = Number(
    items
      .filter((it) => it.type === "expense")
      .reduce((sum, it) => sum + safeNumber(it.amount), 0)
      .toFixed(2)
  );
  const byCategory = Object.keys(CATEGORY_META).map((key) => {
    const amount = Number(totals[key].toFixed(2));
    const ratio = total > 0 ? Number(((amount / total) * 100).toFixed(1)) : 0;
    return {
      key,
      label: CATEGORY_META[key].label,
      amount,
      ratio,
    };
  });
  return {
    total: Number(total.toFixed(2)),
    refund,
    net: Number((total - refund).toFixed(2)),
    byCategory,
  };
}

async function fetchIncomeByNewApi(startDate, endDate) {
  const query = new URLSearchParams({ startDate, endDate }).toString();
  return authFetchJson(`${API_BASE_URL}/finance/income?${query}`, { method: "GET" });
}

async function fetchEntriesFallback() {
  return authFetchJson(`${API_BASE_URL}/finance/entries?today=0`, { method: "GET" });
}

function filterByDateRange(items, startDate, endDate) {
  const start = dayStartMs(startDate);
  const end = dayEndMs(endDate);
  return items.filter((it) => it.time >= start && it.time <= end);
}

export function getDateRangeForPreset(preset, custom = {}) {
  const now = new Date();
  const today = fmtDateText(now);
  if (preset === "today") {
    return { startDate: today, endDate: today, label: "今日" };
  }
  if (preset === "week") {
    const d = new Date(now);
    const weekOffset = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - weekOffset);
    return { startDate: fmtDateText(d), endDate: today, label: "本周" };
  }
  if (preset === "month") {
    const d = new Date(now.getFullYear(), now.getMonth(), 1);
    return { startDate: fmtDateText(d), endDate: today, label: "本月" };
  }
  const startDate = String(custom.startDate || today);
  const endDate = String(custom.endDate || today);
  return { startDate, endDate, label: "自定义" };
}

export async function listIncomeOverview({ preset = "today", startDate = "", endDate = "" } = {}) {
  const range = getDateRangeForPreset(preset, { startDate, endDate });
  try {
    const primary = await fetchIncomeByNewApi(range.startDate, range.endDate);
    if (primary?.success && Array.isArray(primary.data?.items)) {
      const normalized = primary.data.items
        .map(normalizeIncomeItem)
        .filter((it) => it.status !== "voided")
        .sort((a, b) => b.time - a.time);
      const summary = {
        total: safeNumber(primary.data?.summary?.totalIncome),
        refund: safeNumber(primary.data?.summary?.refundExpense),
        net: safeNumber(primary.data?.summary?.netIncome),
        byCategory: Object.keys(CATEGORY_META).map((key) => {
          const amount = safeNumber(primary.data?.summary?.[key]);
          const total = safeNumber(primary.data?.summary?.totalIncome);
          const ratio = total > 0 ? Number(((amount / total) * 100).toFixed(1)) : 0;
          return { key, label: CATEGORY_META[key].label, amount, ratio };
        }),
      };
      return {
        success: true,
        data: {
          range,
          summary,
          list: normalized,
        },
      };
    }

    const fallback = await fetchEntriesFallback();
    if (!fallback?.success || !Array.isArray(fallback.data)) {
      return { success: false, error: fallback?.error || primary?.error || "收入数据加载失败" };
    }
    const normalized = fallback.data
      .map(normalizeIncomeItem)
      .filter((it) => it.status !== "voided");
    const ranged = filterByDateRange(normalized, range.startDate, range.endDate).sort(
      (a, b) => b.time - a.time
    );
    return {
      success: true,
      data: {
        range,
        summary: buildSummary(ranged),
        list: ranged,
      },
    };
  } catch (err) {
    return { success: false, error: err.message || "收入数据加载失败" };
  }
}

function buildPaymentStats(items) {
  const stats = { cash: 0, wechat: 0, alipay: 0, credit: 0, other: 0 };
  items.forEach((it) => {
    const key = Object.prototype.hasOwnProperty.call(stats, it.paymentMethod) ? it.paymentMethod : "other";
    stats[key] += safeNumber(it.signedReceivedAmount ?? it.signedAmount);
  });
  return {
    cash: Number(stats.cash.toFixed(2)),
    wechat: Number(stats.wechat.toFixed(2)),
    alipay: Number(stats.alipay.toFixed(2)),
    credit: Number(stats.credit.toFixed(2)),
    other: Number(stats.other.toFixed(2)),
  };
}

function buildDailyCloseView(summaryPayload, entriesPayload) {
  const list = Array.isArray(entriesPayload?.data)
    ? entriesPayload.data
        .map(normalizeIncomeItem)
        .filter((it) => it.status !== "voided")
        .sort((a, b) => b.time - a.time)
    : [];
  const incomeSummary = buildSummary(list);
  const paymentSummary = buildPaymentStats(list);
  const uniqueOrderCount = new Set(list.map((it) => it.orderId).filter(Boolean)).size;
  const raw = summaryPayload?.data || {};
  const latestClose = raw.latestClose || null;
  const closeStatus = String(raw.closeStatus || "").trim() || "open";
  return {
    date: raw.date || fmtDateText(new Date()),
    closeStatus,
    closedAt: latestClose?.closedAt || null,
    income: {
      total: safeNumber(raw.totalIncome || raw.receivedToday || incomeSummary.total),
      gas: incomeSummary.byCategory.find((x) => x.key === "gas")?.amount || 0,
      deposit: incomeSummary.byCategory.find((x) => x.key === "deposit")?.amount || 0,
      residual: incomeSummary.byCategory.find((x) => x.key === "residual")?.amount || 0,
      other: incomeSummary.byCategory.find((x) => x.key === "other")?.amount || 0,
    },
    expense: {
      total: safeNumber(raw.totalExpense),
      purchase: safeNumber(raw.purchaseExpense),
      refund: safeNumber(raw.refundExpense),
      other: 0,
    },
    orders: {
      count: safeNumber(raw.orderCount || raw.entryCount || uniqueOrderCount),
      deliveryCylinders: "--",
      returnCylinders: "--",
    },
    payments: paymentSummary,
    pendingToday: safeNumber(raw.pendingToday),
    entries: list,
  };
}

function normalizeDailyCloseDirectPayload(rawPayload = {}) {
  const raw = rawPayload || {};
  const list = Array.isArray(raw.entries)
    ? raw.entries
        .map(normalizeIncomeItem)
        .filter((it) => it.status !== "voided")
        .sort((a, b) => b.time - a.time)
    : [];
  const incomeSummary = buildSummary(list);
  return {
    date: raw.date || fmtDateText(new Date()),
    closeStatus: String(raw.closeStatus || "").trim() || "open",
    closedAt: safeNumber(raw.closedAt || raw.latestClose?.closedAt || 0) || null,
    income: {
      total: safeNumber(raw.totalIncome || raw.receivedToday || incomeSummary.total),
      gas: safeNumber(raw.gasIncome ?? incomeSummary.byCategory.find((x) => x.key === "gas")?.amount),
      deposit: safeNumber(raw.depositIncome ?? incomeSummary.byCategory.find((x) => x.key === "deposit")?.amount),
      residual: safeNumber(raw.residualIncome ?? incomeSummary.byCategory.find((x) => x.key === "residual")?.amount),
      other: safeNumber(raw.rentIncome ?? incomeSummary.byCategory.find((x) => x.key === "other")?.amount),
    },
    expense: {
      total: safeNumber(raw.totalExpense),
      purchase: safeNumber(raw.purchaseExpense),
      refund: safeNumber(raw.refundExpense),
      other: 0,
    },
    orders: {
      count: safeNumber(raw.orderCount || raw.entryCount),
      deliveryCylinders:
        raw.deliveryCylinders !== undefined ? String(raw.deliveryCylinders) : "--",
      returnCylinders:
        raw.returnCylinders !== undefined ? String(raw.returnCylinders) : "--",
    },
    payments: {
      cash: safeNumber(raw.cashAmount),
      wechat: safeNumber(raw.wechatAmount),
      alipay: safeNumber(raw.alipayAmount),
      credit: safeNumber(raw.creditAmount),
      other: safeNumber(raw.transferAmount),
    },
    pendingToday: safeNumber(raw.pendingToday),
    entries: list,
  };
}

export async function fetchDailyCloseData() {
  try {
    const direct = await authFetchJson(`${API_BASE_URL}/finance/daily-close`, { method: "GET" });
    if (direct?.success && direct.data) {
      return { success: true, data: normalizeDailyCloseDirectPayload(direct.data) };
    }
    const [summaryRes, entriesRes] = await Promise.all([
      authFetchJson(`${API_BASE_URL}/finance/today-summary`, { method: "GET" }),
      authFetchJson(`${API_BASE_URL}/finance/entries?today=1`, { method: "GET" }),
    ]);
    if (!summaryRes?.success) {
      return { success: false, error: summaryRes?.error || "日结数据加载失败" };
    }
    return { success: true, data: buildDailyCloseView(summaryRes, entriesRes) };
  } catch (err) {
    return { success: false, error: err.message || "日结数据加载失败" };
  }
}

export async function confirmDailyClose(payload = {}) {
  try {
    const primary = await authFetchJson(`${API_BASE_URL}/finance/daily-close/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (primary?.success) return primary;
    return authFetchJson(`${API_BASE_URL}/finance/daily-close`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    return { success: false, error: err.message || "确认日结失败" };
  }
}
