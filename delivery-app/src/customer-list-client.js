// 客户列表页客户端逻辑
(function () {
  "use strict";

  // DOM 元素
  const searchInput = document.getElementById("searchInput");
  const searchClear = document.getElementById("searchClear");
  const filterTabs = document.getElementById("filterTabs");
  const customerList = document.getElementById("customerList");
  const emptyState = document.getElementById("emptyState");
  const emptyDesc = document.getElementById("emptyDesc");
  const loadingState = document.getElementById("loadingState");
  const statsBar = document.getElementById("statsBar");
  const totalCount = document.getElementById("totalCount");
  const filterLabel = document.getElementById("filterLabel");
  const loadMore = document.getElementById("loadMore");
  const loadMoreBtn = document.getElementById("loadMoreBtn");
  const addBtn = document.getElementById("addBtn");
  const emptyAddBtn = document.getElementById("emptyAddBtn");
  const backBtn = document.getElementById("backBtn");
  const navWorkbenchBtn = document.getElementById("navWorkbenchBtn");
  const navMyBtn = document.getElementById("navMyBtn");

  // 状态
  let allCustomers = [];
  let currentFilter = "all";
  let searchKeyword = "";
  let isLoading = false;
  let currentPage = 1;
  let hasMore = false;
  let totalCustomers = 0;
  const PAGE_SIZE = 20;

  // 筛选标签映射
  const filterLabels = {
    all: "",
    debt: "有欠款",
    bottle: "有欠瓶",
    vip: "VIP"
  };

  // 模拟客户数据
  const mockCustomers = [
    {
      id: "C001",
      name: "李大妈",
      phone: "13800138001",
      address: "阳光花园5栋1单元301",
      tags: ["VIP", "老客户"],
      type: "住宅",
      orderCount: 45,
      owedAmount: 0,
      owedBottles: 0,
      lastOrderDays: 3,
      distance: 1.2
    },
    {
      id: "C002",
      name: "王老板",
      phone: "13900139002",
      address: "工业路18号",
      tags: [],
      type: "商铺",
      orderCount: 12,
      owedAmount: 480,
      owedBottles: 2,
      lastOrderDays: 15,
      distance: 2.5
    },
    {
      id: "C003",
      name: "张餐馆",
      phone: "13700137003",
      address: "美食街8号",
      tags: ["大客户"],
      type: "餐馆",
      orderCount: 28,
      owedAmount: 0,
      owedBottles: 1,
      lastOrderDays: 8,
      distance: 0.8
    },
    {
      id: "C004",
      name: "赵师傅",
      phone: "13600136004",
      address: "老城区3号",
      tags: [],
      type: "住宅",
      orderCount: 6,
      owedAmount: 150,
      owedBottles: 0,
      lastOrderDays: 30,
      distance: 3.2
    },
    {
      id: "C005",
      name: "刘大姐",
      phone: "13500135005",
      address: "新村小区12栋",
      tags: ["VIP"],
      type: "住宅",
      orderCount: 32,
      owedAmount: 0,
      owedBottles: 0,
      lastOrderDays: 5,
      distance: 1.8
    }
  ];

  // 初始化
  function init() {
    bindEvents();
    loadCustomers();
  }

  // 绑定事件
  function bindEvents() {
    // 搜索 - 带防抖 300ms
    let searchTimeout;
    searchInput.addEventListener("input", (e) => {
      searchKeyword = e.target.value.trim();
      
      // 显示/隐藏清除按钮
      if (searchKeyword) {
        searchClear.classList.add("visible");
      } else {
        searchClear.classList.remove("visible");
      }
      
      // 防抖处理
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        currentPage = 1;
        allCustomers = [];
        loadCustomers();
      }, 300);
    });

    // 清除搜索
    searchClear.addEventListener("click", () => {
      searchInput.value = "";
      searchKeyword = "";
      searchClear.classList.remove("visible");
      searchInput.focus();
      currentPage = 1;
      allCustomers = [];
      loadCustomers();
    });

    // 筛选标签
    filterTabs.addEventListener("click", (e) => {
      if (e.target.classList.contains("filter-tab")) {
        document.querySelectorAll(".filter-tab").forEach((tab) => tab.classList.remove("active"));
        e.target.classList.add("active");
        currentFilter = e.target.dataset.filter;
        currentPage = 1;
        allCustomers = [];
        loadCustomers();
      }
    });

    // 新增客户
    addBtn.addEventListener("click", () => {
      location.href = "./quick-order.html?from=customer-list&intent=newCustomer";
    });

    // 空状态添加按钮
    emptyAddBtn.addEventListener("click", () => {
      location.href = "./quick-order.html?from=customer-list&intent=newCustomer";
    });

    // 返回按钮
    backBtn.addEventListener("click", () => {
      location.href = "./workbench.html";
    });

    // 底部导航
    navWorkbenchBtn.addEventListener("click", () => {
      location.href = "./workbench.html";
    });
    navMyBtn.addEventListener("click", () => {
      location.href = "./my.html";
    });

    // 加载更多
    loadMoreBtn.addEventListener("click", () => {
      if (!isLoading && hasMore) {
        currentPage++;
        loadCustomers();
      }
    });
  }

  // 加载客户数据
  async function loadCustomers() {
    if (isLoading) return;
    
    isLoading = true;
    showLoading(true);

    try {
      // 构建查询参数
      const params = new URLSearchParams();
      params.append("page", currentPage);
      params.append("pageSize", PAGE_SIZE);
      
      if (searchKeyword) {
        params.append("keyword", searchKeyword);
      }
      
      if (currentFilter !== "all") {
        params.append("filter", currentFilter);
      }

      // 尝试调用 API
      let customers = [];
      let total = 0;
      let more = false;

      try {
        const response = await fetch(`/api/customers?${params.toString()}`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${getAuthToken()}`
          }
        });

        if (response.ok) {
          const data = await response.json();
          customers = data.customers || [];
          total = data.total || 0;
          more = data.hasMore || false;
        } else {
          // API 失败，使用本地数据
          throw new Error("API failed");
        }
      } catch (apiError) {
        // 使用本地模拟数据
        const filtered = filterMockCustomers();
        total = filtered.length;
        const start = (currentPage - 1) * PAGE_SIZE;
        const end = start + PAGE_SIZE;
        customers = filtered.slice(start, end);
        more = end < filtered.length;
      }

      // 更新状态
      if (currentPage === 1) {
        allCustomers = customers;
      } else {
        allCustomers = allCustomers.concat(customers);
      }
      totalCustomers = total;
      hasMore = more;

      renderCustomers();
      updateStats();
    } catch (error) {
      console.error("加载客户失败:", error);
      showError("加载客户失败，请重试");
    } finally {
      isLoading = false;
      showLoading(false);
    }
  }

  // 筛选本地模拟数据
  function filterMockCustomers() {
    let filtered = [...mockCustomers];

    // 搜索筛选
    if (searchKeyword) {
      const keyword = searchKeyword.toLowerCase();
      filtered = filtered.filter((customer) => {
        const matchName = customer.name.toLowerCase().includes(keyword);
        const matchPhone = customer.phone.includes(keyword);
        const matchAddress = customer.address.toLowerCase().includes(keyword);
        return matchName || matchPhone || matchAddress;
      });
    }

    // 标签筛选
    switch (currentFilter) {
      case "debt":
        filtered = filtered.filter(c => c.owedAmount > 0);
        break;
      case "bottle":
        filtered = filtered.filter(c => c.owedBottles > 0);
        break;
      case "vip":
        filtered = filtered.filter(c => c.tags.includes("VIP"));
        break;
    }

    return filtered;
  }

  // 显示/隐藏加载状态
  function showLoading(show) {
    if (show && currentPage === 1) {
      loadingState.style.display = "block";
      customerList.style.display = "none";
      emptyState.style.display = "none";
      loadMore.style.display = "none";
    } else {
      loadingState.style.display = "none";
    }
    
    loadMoreBtn.disabled = show;
    loadMoreBtn.textContent = show ? "加载中..." : "加载更多";
  }

  // 更新统计信息
  function updateStats() {
    totalCount.textContent = totalCustomers;
    filterLabel.textContent = filterLabels[currentFilter] || "";
  }

  // 渲染客户列表
  function renderCustomers() {
    if (allCustomers.length === 0) {
      customerList.style.display = "none";
      emptyState.style.display = "block";
      loadMore.style.display = "none";
      
      // 根据筛选条件更新空状态提示
      if (searchKeyword) {
        emptyDesc.textContent = `未找到包含"${searchKeyword}"的客户`;
      } else if (currentFilter !== "all") {
        emptyDesc.textContent = `暂无${filterLabels[currentFilter]}的客户`;
      } else {
        emptyDesc.textContent = "点击右下角按钮添加您的第一个客户";
      }
      return;
    }

    customerList.style.display = "grid";
    emptyState.style.display = "none";

    customerList.innerHTML = allCustomers
      .map((customer) => {
        const hasWarning = customer.owedAmount > 0 || customer.owedBottles > 0;
        const isOverdue = customer.lastOrderDays > 30;
        
        // 标签显示
        let tagsHtml = "";
        if (customer.tags && customer.tags.includes("VIP")) {
          tagsHtml += '<span class="customer-tag vip">VIP</span>';
        }
        if (hasWarning) {
          tagsHtml += '<span class="customer-tag warning">!</span>';
        }

        // 距离显示
        let distanceHtml = "";
        if (customer.distance) {
          distanceHtml = `<span class="customer-distance">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="10" r="3"/>
              <path d="M12 21.7C12 21.7 5 15.5 5 10C5 6 8 3 12 3C16 3 19 6 19 10C19 15.5 12 21.7 12 21.7Z"/>
            </svg>
            ${customer.distance}km
          </span>`;
        }

        // 财务摘要
        const owedAmountClass = customer.owedAmount > 0 ? "warning" : "";
        const owedBottlesClass = customer.owedBottles > 0 ? "warning" : "";

        // 类型标签
        const typeTag = customer.type ? `<span class="type-tag">${customer.type}</span>` : "";

        return `
        <div class="customer-card" data-id="${customer.id}">
          <div class="customer-header">
            <div class="customer-name-wrap">
              <span class="customer-name">${escapeHtml(customer.name)}</span>
              ${tagsHtml}
            </div>
            ${distanceHtml}
          </div>
          <div class="customer-contact">
            <div class="contact-item">
              <svg class="contact-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
              </svg>
              <span>${maskPhone(customer.phone)}</span>
            </div>
            <div class="contact-item">
              <svg class="contact-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                <circle cx="12" cy="10" r="3"/>
              </svg>
              <span>${escapeHtml(customer.address)}</span>
            </div>
          </div>
          <div class="customer-financial">
            <div class="financial-item">
              <span class="financial-label">历史:</span>
              <span class="financial-value">${customer.orderCount || 0}单</span>
            </div>
            <div class="financial-item">
              <span class="financial-label">欠款:</span>
              <span class="financial-value ${owedAmountClass}">¥${customer.owedAmount || 0}</span>
            </div>
            <div class="financial-item">
              <span class="financial-label">欠瓶:</span>
              <span class="financial-value ${owedBottlesClass}">${customer.owedBottles || 0}</span>
            </div>
            <div class="customer-tags-row">
              ${typeTag}
            </div>
          </div>
          <div class="customer-actions">
            <button class="action-btn" onclick="event.stopPropagation(); callCustomer('${customer.phone}')">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
              </svg>
              拨打电话
            </button>
            <button class="action-btn primary" onclick="event.stopPropagation(); quickOrder('${customer.id}')">一键开单</button>
            <button class="action-btn" onclick="event.stopPropagation(); viewDetail('${customer.id}')">查看详情</button>
          </div>
        </div>
      `;
      })
      .join("");

    // 绑定卡片点击事件
    document.querySelectorAll(".customer-card").forEach((card) => {
      card.addEventListener("click", () => {
        const customerId = card.dataset.id;
        viewDetail(customerId);
      });
    });

    // 显示/隐藏加载更多
    if (hasMore) {
      loadMore.style.display = "block";
    } else {
      loadMore.style.display = "none";
    }
  }

  // 拨打电话
  window.callCustomer = function (phone) {
    window.location.href = `tel:${phone}`;
  };

  // 一键开单
  window.quickOrder = function (customerId) {
    location.href = `./quick-order.html?from=customer-list&customerId=${customerId}`;
  };

  // 查看详情
  window.viewDetail = function (customerId) {
    location.href = `./customer-detail.html?id=${customerId}`;
  };

  // 获取认证令牌
  function getAuthToken() {
    try {
      return localStorage.getItem("auth_token") || "";
    } catch (e) {
      return "";
    }
  }

  // 显示错误提示
  function showError(message) {
    // 简单的错误提示，可扩展为 Toast
    alert(message);
  }

  // 工具函数：HTML 转义
  function escapeHtml(text) {
    if (!text) return "";
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  // 工具函数：手机号脱敏
  function maskPhone(phone) {
    if (!phone) return "";
    return phone.replace(/(\d{3})\d{4}(\d{4})/, "$1****$2");
  }

  // 启动
  init();
})();
