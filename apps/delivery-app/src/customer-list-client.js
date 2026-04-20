import { ensureAuthenticatedPage } from "./auth-client.js";
import { mountAppBottomNav, restoreListScroll, navigateWithListScroll } from "./app-shell.js";
import { listCustomers } from "./customer-client.js";

if (!ensureAuthenticatedPage()) {
  throw new Error("未登录");
}

const searchInput = document.getElementById("searchInput");
const filterTabs = document.getElementById("filterTabs");
const customerList = document.getElementById("customerList");
const emptyState = document.getElementById("emptyState");
const addBtn = document.getElementById("addBtn");
const loadMoreWrap = document.getElementById("loadMoreWrap");
const loadMoreBtn = document.getElementById("loadMoreBtn");
const pageState = document.getElementById("pageState");
const listState = document.getElementById("listState");

const state = {
  page: 1,
  size: 20,
  total: 0,
  hasMore: false,
  loading: false,
  filter: "all",
  keyword: "",
  items: [],
};
let hasRestoredListScroll = false;

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = String(text || "");
  return div.innerHTML;
}

function maskPhone(phone) {
  const text = String(phone || "");
  if (!/^1\d{10}$/.test(text)) return text;
  return text.replace(/(\d{3})\d{4}(\d{4})/, "$1****$2");
}

function formatLastOrderAt(ts) {
  const time = Number(ts || 0);
  if (!time) return "暂无下单记录";
  const diff = Date.now() - time;
  if (diff < 60 * 1000) return "刚刚下单";
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / (60 * 1000))} 分钟前下单`;
  if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / (60 * 60 * 1000))} 小时前下单`;
  return `${Math.floor(diff / (24 * 60 * 60 * 1000))} 天前下单`;
}

function updateFooterStatus() {
  const shown = state.items.length;
  const total = state.total;
  if (state.loading) {
    pageState.textContent = "加载中...";
    return;
  }
  if (shown === 0) {
    pageState.textContent = "";
    return;
  }
  pageState.textContent = `已显示 ${shown} / ${total}`;
}

function setListState(message, type = "info") {
  if (!listState) return;
  listState.textContent = message || "";
  listState.className = `state-block ${type}`;
  listState.style.display = message ? "block" : "none";
}

function renderCards() {
  if (!state.items.length) {
    customerList.innerHTML = "";
    customerList.style.display = "none";
    emptyState.style.display = "block";
    updateFooterStatus();
    return;
  }

  emptyState.style.display = "none";
  customerList.style.display = "grid";
  customerList.innerHTML = state.items
    .map((customer) => {
      const warning = customer.owedAmount > 0 || customer.owedEmptyCount > 0;
      const tags = [];
      if (customer.tags.some((x) => String(x).toUpperCase() === "VIP")) {
        tags.push('<span class="customer-tag vip">VIP</span>');
      }
      if (warning) {
        tags.push('<span class="customer-tag warning">风险</span>');
      }
      return `
        <article class="customer-card" data-customer-id="${escapeHtml(customer.id)}">
          <div class="customer-header">
            <div class="customer-name-wrap">
              <span class="customer-name">${escapeHtml(customer.name || "未命名客户")}</span>
              ${tags.join("")}
            </div>
          </div>
          <div class="customer-contact">
            <div class="contact-item">
              <svg class="contact-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
              </svg>
              <span>${escapeHtml(maskPhone(customer.phone))}</span>
            </div>
            <div class="contact-item">
              <svg class="contact-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                <circle cx="12" cy="10" r="3"/>
              </svg>
              <span>${escapeHtml(customer.address)}</span>
            </div>
          </div>
          <div class="customer-stats">
            <div class="stat-item">
              <div class="stat-value">${customer.stats.totalOrders}</div>
              <div class="stat-label">累计订单</div>
            </div>
            <div class="stat-item">
              <div class="stat-value ${customer.owedAmount > 0 ? "warning" : ""}">¥${customer.owedAmount.toFixed(2)}</div>
              <div class="stat-label">欠款</div>
            </div>
            <div class="stat-item">
              <div class="stat-value ${customer.owedEmptyCount > 0 ? "warning" : ""}">${customer.owedEmptyCount}</div>
              <div class="stat-label">欠瓶</div>
            </div>
          </div>
          <div class="contact-item" style="margin-bottom: 12px;">
            <span class="stat-label">${escapeHtml(formatLastOrderAt(customer.lastOrderAt))}</span>
          </div>
          <div class="customer-actions">
            <button class="action-btn" type="button" data-action="call">拨打电话</button>
            <button class="action-btn primary" type="button" data-action="order">一键开单</button>
          </div>
        </article>
      `;
    })
    .join("");
  updateFooterStatus();
}

function updateLoadMore() {
  if (!state.items.length || !state.hasMore) {
    loadMoreWrap.style.display = "none";
    return;
  }
  loadMoreWrap.style.display = "block";
  loadMoreBtn.disabled = state.loading;
  loadMoreBtn.textContent = state.loading ? "加载中..." : "加载更多";
}

async function fetchPage({ reset = false } = {}) {
  if (state.loading) return;
  state.loading = true;
  if (reset) {
    state.page = 1;
    state.items = [];
    setListState("正在加载客户...", "loading");
  }
  updateLoadMore();
  updateFooterStatus();

  const result = await listCustomers({
    keyword: state.keyword,
    filter: state.filter,
    page: state.page,
    size: state.size,
  });

  state.loading = false;
  if (!result?.success) {
    renderCards();
    updateLoadMore();
    setListState(result?.error || "客户加载失败，请稍后重试", "error");
    return;
  }

  const data = result.data || {};
  const incoming = Array.isArray(data.items) ? data.items : [];
  state.total = Number(data.pagination?.total || incoming.length || 0);
  if (state.page === 1) {
    state.items = incoming;
  } else {
    state.items = [...state.items, ...incoming];
  }
  const shown = state.items.length;
  state.hasMore = shown < state.total;

  renderCards();
  updateLoadMore();
  setListState("", "info");
  if (!hasRestoredListScroll) {
    restoreListScroll("customer-list");
    hasRestoredListScroll = true;
  }
}

function goDetail(customerId) {
  navigateWithListScroll(`./customer-detail.html?id=${encodeURIComponent(customerId)}`, "customer-list");
}

function goQuickOrder(customerId) {
  window.location.href = `./quick-order.html?from=customer-list&customerId=${encodeURIComponent(customerId)}`;
}

function callCustomer(phone) {
  const cleanPhone = String(phone || "").trim();
  if (!cleanPhone) return;
  window.location.href = `tel:${cleanPhone}`;
}

function bindEvents() {
  let searchTimer = 0;
  searchInput.addEventListener("input", (e) => {
    state.keyword = String(e.target.value || "").trim();
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      fetchPage({ reset: true });
    }, 300);
  });

  filterTabs.addEventListener("click", (e) => {
    const tab = e.target.closest(".filter-tab");
    if (!tab) return;
    filterTabs.querySelectorAll(".filter-tab").forEach((node) => node.classList.remove("active"));
    tab.classList.add("active");
    state.filter = tab.dataset.filter || "all";
    fetchPage({ reset: true });
  });

  customerList.addEventListener("click", (e) => {
    const card = e.target.closest(".customer-card");
    if (!card) return;
    const customerId = card.dataset.customerId;
    const item = state.items.find((x) => x.id === customerId);
    if (!item) return;

    const actionBtn = e.target.closest("button[data-action]");
    if (!actionBtn) {
      goDetail(customerId);
      return;
    }

    const action = actionBtn.dataset.action;
    if (action === "call") callCustomer(item.phone);
    if (action === "order") goQuickOrder(customerId);
  });

  addBtn.addEventListener("click", () => {
    window.location.href = "./quick-order.html?from=customer-list&intent=newCustomer";
  });

  loadMoreBtn.addEventListener("click", async () => {
    if (state.loading || !state.hasMore) return;
    state.page += 1;
    await fetchPage();
  });

}

mountAppBottomNav("appBottomNav", { active: "customer" });
bindEvents();
fetchPage({ reset: true });
