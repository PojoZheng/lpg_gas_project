import { authFetchJson } from "./auth-client.js";
import { API_BASE_URL } from "./api-base.js";

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toTimestamp(value) {
  if (!value) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? ts : 0;
}

function trimText(value) {
  return String(value || "").trim();
}

function normalizeTags(value) {
  if (!Array.isArray(value)) return [];
  return value.map((x) => trimText(x)).filter(Boolean);
}

function normalizeCustomerItem(raw) {
  const account = raw?.account || {};
  const stats = raw?.stats || {};
  const owedAmount = Number(
    toNumber(raw?.owedAmount, toNumber(raw?.owed_money, toNumber(account.owedAmount, 0))).toFixed(2)
  );
  const owedEmptyCount = Math.max(
    0,
    toNumber(raw?.owedEmptyCount, toNumber(raw?.owedBottles, toNumber(account.owedEmptyCount, 0)))
  );
  return {
    id: trimText(raw?.id || raw?.customerId || raw?.customer_id),
    name: trimText(raw?.name || raw?.customerName || raw?.customer_name),
    phone: trimText(raw?.phone),
    address: trimText(raw?.address),
    tags: normalizeTags(raw?.tags),
    owedAmount,
    owedEmptyCount,
    lastOrderAt: toTimestamp(raw?.lastOrderAt || stats?.lastOrderAt),
    stats: {
      totalOrders: Math.max(0, toNumber(raw?.totalOrders, toNumber(stats?.totalOrders, 0))),
      totalAmount: Number(toNumber(raw?.totalAmount, toNumber(stats?.totalAmount, 0)).toFixed(2)),
    },
  };
}

function normalizePagination(rawPagination, page, size, totalFallback) {
  const total = Math.max(0, toNumber(rawPagination?.total, totalFallback));
  return {
    page: Math.max(1, toNumber(rawPagination?.page, page)),
    size: Math.max(1, toNumber(rawPagination?.size, size)),
    total,
  };
}

function matchKeyword(item, keyword) {
  const key = trimText(keyword).toLowerCase();
  if (!key) return true;
  const haystack = `${item.name} ${item.phone} ${item.address}`.toLowerCase();
  return haystack.includes(key);
}

function matchFilter(item, filter) {
  switch (filter) {
    case "owed_bottle":
      return item.owedEmptyCount > 0;
    case "owed_money":
      return item.owedAmount > 0;
    case "vip":
      return item.tags.some((x) => x.toUpperCase() === "VIP");
    default:
      return true;
  }
}

function sortCustomers(items) {
  return [...items].sort((a, b) => {
    const aRisk = a.owedAmount > 0 || a.owedEmptyCount > 0 ? 1 : 0;
    const bRisk = b.owedAmount > 0 || b.owedEmptyCount > 0 ? 1 : 0;
    if (aRisk !== bRisk) return bRisk - aRisk;
    if (a.lastOrderAt !== b.lastOrderAt) return b.lastOrderAt - a.lastOrderAt;
    return a.name.localeCompare(b.name, "zh-Hans-CN-u-co-pinyin");
  });
}

function mapUiFilterToApi(filter) {
  if (filter === "bottle") return "owed_bottle";
  if (filter === "debt") return "owed_money";
  if (filter === "vip") return "vip";
  return "all";
}

function normalizeOrderItem(raw) {
  const amount = Number(
    toNumber(raw?.amount, toNumber(raw?.total_amount, toNumber(raw?.receivedAmount, 0))).toFixed(2)
  );
  const quantityFromCylinders = Array.isArray(raw?.cylinders)
    ? raw.cylinders.reduce((sum, x) => sum + Math.max(0, toNumber(x?.quantity, 0)), 0)
    : 0;
  return {
    id: trimText(raw?.id || raw?.orderId || raw?.order_id),
    customerId: trimText(raw?.customerId || raw?.customer_id),
    customerName: trimText(raw?.customerName || raw?.customer_name),
    status: trimText(raw?.status || raw?.orderStatus || "pending_delivery"),
    spec: trimText(raw?.spec || raw?.cylinders?.[0]?.spec),
    quantity: quantityFromCylinders || Math.max(0, toNumber(raw?.quantity, 0)),
    amount,
    createdAt: toTimestamp(raw?.createdAt || raw?.created_at),
  };
}

async function listCustomersLegacy(keyword, filter, page, size) {
  const quick = await authFetchJson(`${API_BASE_URL}/customers/quick-select`);
  if (!quick?.success) {
    return quick || { success: false, error: "客户列表加载失败" };
  }
  const baseItems = Array.isArray(quick.data) ? quick.data : [];
  const detailList = await Promise.all(
    baseItems.map(async (item) => {
      const id = trimText(item?.id);
      if (!id) return normalizeCustomerItem(item);
      const detail = await authFetchJson(`${API_BASE_URL}/customers/${encodeURIComponent(id)}/detail`);
      if (!detail?.success) return normalizeCustomerItem(item);
      return normalizeCustomerItem({ ...item, ...detail.data });
    })
  );
  const filtered = sortCustomers(
    detailList.filter((item) => matchKeyword(item, keyword) && matchFilter(item, filter))
  );
  const start = (page - 1) * size;
  return {
    success: true,
    data: {
      items: filtered.slice(start, start + size),
      pagination: {
        page,
        size,
        total: filtered.length,
      },
    },
    source: "legacy",
  };
}

export async function listCustomers({ keyword = "", filter = "all", page = 1, size = 20 } = {}) {
  const apiFilter = mapUiFilterToApi(filter);
  const params = new URLSearchParams();
  params.set("page", String(Math.max(1, toNumber(page, 1))));
  params.set("size", String(Math.max(1, toNumber(size, 20))));
  if (trimText(keyword)) params.set("keyword", trimText(keyword));
  if (apiFilter !== "all") params.set("filter", apiFilter);

  const direct = await authFetchJson(`${API_BASE_URL}/customers?${params.toString()}`);
  const directItems = Array.isArray(direct?.data?.items)
    ? direct.data.items
    : Array.isArray(direct?.data?.list)
      ? direct.data.list
      : null;
  if (direct?.success && directItems) {
    const normalized = directItems.map(normalizeCustomerItem).filter((x) => x.id);
    const pagination = normalizePagination(direct?.data?.pagination, page, size, normalized.length);
    return {
      success: true,
      data: { items: sortCustomers(normalized), pagination },
      source: "api",
    };
  }

  return listCustomersLegacy(keyword, apiFilter, Math.max(1, toNumber(page, 1)), Math.max(1, toNumber(size, 20)));
}

async function listOrdersLegacyByCustomer(customerId, page, size) {
  const quick = await authFetchJson(`${API_BASE_URL}/customers/quick-select`);
  const customer = Array.isArray(quick?.data)
    ? quick.data.find((x) => trimText(x?.id) === trimText(customerId))
    : null;
  const keyword = trimText(customer?.name);
  const params = new URLSearchParams();
  params.set("page", "1");
  params.set("size", "100");
  if (keyword) params.set("keyword", keyword);
  const orders = await authFetchJson(`${API_BASE_URL}/orders?${params.toString()}`);
  if (!orders?.success) {
    return orders || { success: false, error: "客户订单加载失败" };
  }
  const all = Array.isArray(orders?.data?.list) ? orders.data.list.map(normalizeOrderItem) : [];
  const filtered = all.filter((x) => {
    if (x.customerId && x.customerId === customerId) return true;
    if (keyword && x.customerName) return x.customerName.includes(keyword);
    return false;
  });
  const start = (page - 1) * size;
  return {
    success: true,
    data: {
      items: filtered.slice(start, start + size),
      pagination: {
        page,
        size,
        total: filtered.length,
      },
    },
    source: "legacy",
  };
}

export async function listCustomerOrders(customerId, { page = 1, size = 100 } = {}) {
  const cid = trimText(customerId);
  if (!cid) return { success: false, error: "客户ID不能为空" };

  const params = new URLSearchParams();
  params.set("page", String(Math.max(1, toNumber(page, 1))));
  params.set("size", String(Math.max(1, toNumber(size, 100))));

  const direct = await authFetchJson(
    `${API_BASE_URL}/customers/${encodeURIComponent(cid)}/orders?${params.toString()}`
  );
  const directItems = Array.isArray(direct?.data?.items) ? direct.data.items : null;
  if (direct?.success && directItems) {
    const items = directItems.map(normalizeOrderItem).filter((x) => x.id);
    const pagination = normalizePagination(direct?.data?.pagination, page, size, items.length);
    return { success: true, data: { items, pagination }, source: "api" };
  }

  return listOrdersLegacyByCustomer(cid, Math.max(1, toNumber(page, 1)), Math.max(1, toNumber(size, 100)));
}

function normalizeCustomerDetail(raw) {
  const customer = normalizeCustomerItem(raw);
  const ledger = raw?.ledger || raw?.account || {};
  const summary = raw?.summary || {};
  const stats = raw?.stats || {};
  return {
    ...customer,
    note: trimText(raw?.note || raw?.collectionNote || ledger?.collectionNote),
    ledger: {
      owedEmptyCount: Math.max(
        0,
        toNumber(
          ledger?.owedEmptyCount,
          toNumber(ledger?.owedBottles, toNumber(summary?.owedEmptyCount, customer.owedEmptyCount))
        )
      ),
      owedEmptySpec: trimText(ledger?.owedEmptySpec),
      owedAmount: Number(
        toNumber(ledger?.owedAmount, toNumber(summary?.owedAmount, customer.owedAmount)).toFixed(2)
      ),
      owedSince: toTimestamp(ledger?.owedSince || ledger?.debtSinceAt),
    },
    stats: {
      totalOrders: Math.max(
        0,
        toNumber(stats?.totalOrders, toNumber(summary?.totalOrders, toNumber(customer.stats.totalOrders, 0)))
      ),
      totalAmount: Number(toNumber(stats?.totalAmount, toNumber(customer.stats.totalAmount, 0)).toFixed(2)),
      lastOrderAt: toTimestamp(stats?.lastOrderAt || summary?.lastOrderAt || customer.lastOrderAt),
    },
    collectionHistory: Array.isArray(raw?.collectionHistory) ? raw.collectionHistory : [],
  };
}

export async function getCustomerDetail(customerId) {
  const cid = trimText(customerId);
  if (!cid) return { success: false, error: "客户ID不能为空" };

  const direct = await authFetchJson(`${API_BASE_URL}/customers/${encodeURIComponent(cid)}`);
  if (direct?.success && direct?.data) {
    return { success: true, data: normalizeCustomerDetail(direct.data), source: "api" };
  }

  const legacy = await authFetchJson(`${API_BASE_URL}/customers/${encodeURIComponent(cid)}/detail`);
  if (!legacy?.success || !legacy?.data) {
    return legacy || { success: false, error: "客户详情加载失败" };
  }

  const detail = normalizeCustomerDetail(legacy.data);
  if (detail.stats.totalOrders <= 0 && detail.stats.totalAmount <= 0) {
    const orders = await listOrdersLegacyByCustomer(cid, 1, 100);
    if (orders?.success && Array.isArray(orders.data?.items)) {
      const all = orders.data.items;
      detail.stats.totalOrders = all.length;
      detail.stats.totalAmount = Number(
        all.reduce((sum, x) => sum + toNumber(x.amount, 0), 0).toFixed(2)
      );
      detail.stats.lastOrderAt = all.reduce((maxTs, x) => Math.max(maxTs, toTimestamp(x.createdAt)), 0);
    }
  }
  return { success: true, data: detail, source: "legacy" };
}

export async function updateCustomer(customerId, payload = {}) {
  const cid = trimText(customerId);
  if (!cid) return { success: false, error: "客户ID不能为空" };
  const data = await authFetchJson(`${API_BASE_URL}/customers/${encodeURIComponent(cid)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {}),
  });
  if (!data?.success) {
    return { success: false, error: data?.error || "客户保存失败，请稍后重试" };
  }
  return { success: true, data: normalizeCustomerDetail(data.data || {}) };
}
