import { authFetchJson } from "./auth-client";

const API_BASE_URL = "http://localhost:3100";

/**
 * 获取今日财务汇总
 * @returns {Promise<{success: boolean, data?: object, error?: string}>}
 */
export async function fetchTodayFinanceSummary() {
  return authFetchJson(`${API_BASE_URL}/finance/today-summary`, {
    method: "GET",
  });
}

/**
 * 获取今日财务流水明细
 * @returns {Promise<{success: boolean, data?: array, error?: string}>}
 */
export async function fetchTodayFinanceEntries() {
  return authFetchJson(`${API_BASE_URL}/finance/entries?today=1`, {
    method: "GET",
  });
}

/**
 * 获取今日支出汇总
 * @returns {Promise<{success: boolean, data?: object, error?: string}>}
 */
export async function fetchTodayExpenseSummary() {
  return authFetchJson(`${API_BASE_URL}/finance/today-expense`, {
    method: "GET",
  });
}

/**
 * 确认日结对账
 * POST /finance/daily-close
 * @param {object} payload - 对账数据
 * @param {string[]} payload.checkedItems - 已核对的项目列表
 * @param {string} payload.closeTime - 对账时间 ISO 格式
 * @param {string} [payload.note] - 备注（可选）
 * @returns {Promise<{success: boolean, data?: object, error?: string}>}
 */
export async function confirmDailyClose(payload) {
  return authFetchJson(`${API_BASE_URL}/finance/daily-close`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload || {}),
  });
}

/**
 * 获取日结历史记录
 * @param {object} params - 查询参数
 * @param {string} [params.month] - 月份，格式 YYYY-MM
 * @returns {Promise<{success: boolean, data?: array, error?: string}>}
 */
export async function fetchDailyCloseHistory(params = {}) {
  const query = params.month ? `?month=${encodeURIComponent(params.month)}` : "";
  return authFetchJson(`${API_BASE_URL}/finance/daily-close/history${query}`, {
    method: "GET",
  });
}

/**
 * 获取指定日期的对账详情
 * @param {string} date - 日期，格式 YYYY-MM-DD
 * @returns {Promise<{success: boolean, data?: object, error?: string}>}
 */
export async function fetchDailyCloseDetail(date) {
  return authFetchJson(`${API_BASE_URL}/finance/daily-close/${date}`, {
    method: "GET",
  });
}
