// 客户列表页客户端逻辑
(function () {
  "use strict";

  // DOM 元素
  const searchInput = document.getElementById("searchInput");
  const filterTabs = document.getElementById("filterTabs");
  const customerList = document.getElementById("customerList");
  const emptyState = document.getElementById("emptyState");
  const addBtn = document.getElementById("addBtn");
  const navWorkbenchBtn = document.getElementById("navWorkbenchBtn");
  const navMyBtn = document.getElementById("navMyBtn");

  // 状态
  let allCustomers = [];
  let currentFilter = "all";
  let searchKeyword = "";

  // 模拟客户数据
  const mockCustomers = [
    {
      id: "C001",
      name: "李大妈",
      phone: "13800138001",
      address: "阳光花园5栋1单元301",
      tags: ["VIP", "老客户"],
      orderCount: 45,
      owedAmount: 0,
      owedBottles: 0,
      lastOrderDays: 3,
    },
    {
      id: "C002",
      name: "王老板",
      phone: "13900139002",
      address: "工业路18号",
      tags: [],
      orderCount: 12,
      owedAmount: 480,
      owedBottles: 2,
      lastOrderDays: 15,
    },
    {
      id: "C003",
      name: "张餐馆",
      phone: "13700137003",
      address: "美食街8号",
      tags: ["大客户"],
      orderCount: 28,
      owedAmount: 0,
      owedBottles: 1,
      lastOrderDays: 8,
    },
    {
      id: "C004",
      name: "赵师傅",
      phone: "13600136004",
      address: "老城区3号",
      tags: [],
      orderCount: 6,
      owedAmount: 150,
      owedBottles: 0,
      lastOrderDays: 30,
    },
    {
      id: "C005",
      name: "刘大姐",
      phone: "13500135005",
      address: "新村小区12栋",
      tags: ["VIP"],
      orderCount: 32,
      owedAmount: 0,
      owedBottles: 0,
      lastOrderDays: 5,
    },
  ];

  // 初始化
  function init() {
    bindEvents();
    loadCustomers();
  }

  // 绑定事件
  function bindEvents() {
    // 搜索
    searchInput.addEventListener("input", (e) => {
      searchKeyword = e.target.value.trim().toLowerCase();
      renderCustomers();
    });

    // 筛选标签
    filterTabs.addEventListener("click", (e) => {
      if (e.target.classList.contains("filter-tab")) {
        document.querySelectorAll(".filter-tab").forEach((tab) => tab.classList.remove("active"));
        e.target.classList.add("active");
        currentFilter = e.target.dataset.filter;
        renderCustomers();
      }
    });

    // 新增客户
    addBtn.addEventListener("click", () => {
      location.href = "./quick-order.html?from=customer-list&intent=newCustomer";
    });

    // 底部导航
    navWorkbenchBtn.addEventListener("click", () => {
      location.href = "./workbench.html";
    });
    navMyBtn.addEventListener("click", () => {
      location.href = "./my.html";
    });
  }

  // 加载客户数据
  async function loadCustomers() {
    try {
      // 尝试从 localStorage 加载
      const stored = localStorage.getItem("customers");
      if (stored) {
        allCustomers = JSON.parse(stored);
      } else {
        // 使用模拟数据
        allCustomers = [...mockCustomers];
        localStorage.setItem("customers", JSON.stringify(allCustomers));
      }
    } catch (e) {
      allCustomers = [...mockCustomers];
    }
    renderCustomers();
  }

  // 筛选客户
  function filterCustomers() {
    return allCustomers.filter((customer) => {
      // 搜索筛选
      if (searchKeyword) {
        const matchName = customer.name.toLowerCase().includes(searchKeyword);
        const matchPhone = customer.phone.includes(searchKeyword);
        const matchAddress = customer.address.toLowerCase().includes(searchKeyword);
        if (!matchName && !matchPhone && !matchAddress) return false;
      }

      // 标签筛选
      switch (currentFilter) {
        case "debt":
          return customer.owedAmount > 0;
        case "bottle":
          return customer.owedBottles > 0;
        case "vip":
          return customer.tags.includes("VIP");
        default:
          return true;
      }
    });
  }

  // 渲染客户列表
  function renderCustomers() {
    const filtered = filterCustomers();

    if (filtered.length === 0) {
      customerList.style.display = "none";
      emptyState.style.display = "block";
      return;
    }

    customerList.style.display = "grid";
    emptyState.style.display = "none";

    customerList.innerHTML = filtered
      .map((customer) => {
        const hasWarning = customer.owedAmount > 0 || customer.owedBottles > 0;
        const vipTag = customer.tags.includes("VIP")
          ? '<span class="customer-tag vip">VIP</span>'
          : "";
        const warningTag = hasWarning ? '<span class="customer-tag warning">!</span>' : "";

        return `
        <div class="customer-card" data-id="${customer.id}">
          <div class="customer-header">
            <div class="customer-name-wrap">
              <span class="customer-name">${escapeHtml(customer.name)}</span>
              ${vipTag}
              ${warningTag}
            </div>
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
          <div class="customer-stats">
            <div class="stat-item">
              <div class="stat-value">${customer.orderCount}</div>
              <div class="stat-label">历史订单</div>
            </div>
            <div class="stat-item">
              <div class="stat-value ${customer.owedAmount > 0 ? "warning" : ""}">¥${customer.owedAmount}</div>
              <div class="stat-label">欠款</div>
            </div>
            <div class="stat-item">
              <div class="stat-value ${customer.owedBottles > 0 ? "warning" : ""}">${customer.owedBottles}</div>
              <div class="stat-label">欠瓶</div>
            </div>
          </div>
          <div class="customer-actions">
            <button class="action-btn" onclick="callCustomer('${customer.phone}')">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
              </svg>
              拨打电话
            </button>
            <button class="action-btn primary" onclick="quickOrder('${customer.id}')">一键开单</button>
            <button class="action-btn" onclick="viewDetail('${customer.id}')">查看详情</button>
          </div>
        </div>
      `;
      })
      .join("");
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
    // 暂跳转到快速开单页，后续可扩展客户详情页
    location.href = `./quick-order.html?from=customer-list&customerId=${customerId}&view=detail`;
  };

  // 工具函数：HTML 转义
  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  // 工具函数：手机号脱敏
  function maskPhone(phone) {
    return phone.replace(/(\d{3})\d{4}(\d{4})/, "$1****$2");
  }

  // 启动
  init();
})();
