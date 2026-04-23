# Task 43 & 44 代码审查报告

> 审查时间：2026-04-12  
> 审查者：dev-c（备用开发窗口）

---

## 一、Task 43 - 订单历史列表（order-history-list）

### 实现状态：部分完成

| 验收项 | 状态 | 说明 |
|-------|------|------|
| 「我的」页面「历史订单」入口 | ✅ 已添加 | my.html 第 65-74 行已添加订单历史入口卡片 |
| order-list.html 基础结构 | ✅ 已实现 | 页面结构完整，含搜索、筛选、列表、空状态 |
| 顶部 Tab 筛选 | ⚠️ 部分实现 | 缺「已退货」标签，statusMap 有但 filterTabs 缺 |
| 搜索框功能 | ⚠️ 前端模拟 | 已实现但仅在前端模拟数据过滤 |
| 调用真实 API | ❌ 未实现 | 使用 mockOrders，未调用 `fetchOrderList()` |
| 分页功能 | ❌ 未实现 | 加载更多按钮无实际功能 |

### 发现的问题

1. **API 集成缺失**（高优先级）
   - 文件：`apps/delivery-app/src/order-list.html`
   - 问题：使用硬编码的 mockOrders（287-342 行），未调用 `order-client.js` 中的 `fetchOrderList()`
   - 建议：替换为真实 API 调用

2. **筛选标签不完整**（中优先级）
   - 文件：`apps/delivery-app/src/order-list.html` 第 243-248 行
   - 问题：filterTabs 缺少「已退货」选项，虽然 statusMap 已定义
   - 建议：添加 `<button class="filter-tab" data-filter="returned">已退货</button>`

3. **加载更多无功能**（中优先级）
   - 文件：`apps/delivery-app/src/order-list.html` 第 496-498 行
   - 问题：点击仅弹出 alert，无实际分页逻辑
   - 建议：实现分页参数传递和加载逻辑

---

## 二、Task 44 - 退货换货（order-return-exchange）

### 实现状态：部分完成

| 验收项 | 状态 | 说明 |
|-------|------|------|
| POST /orders/:id/return | ✅ 已实现 | server.js 129-206 行 processOrderReturn 完整 |
| order-detail.html 退货面板 | ✅ 已实现 | 退货表单、校验、API 调用完整 |
| 24小时时限控制 | ✅ 已实现 | canReturn() 函数正确实现时限检查 |
| 库存回滚 | ✅ 已实现 | returnInventoryToOnHand() 已调用 |
| 收入扣除 | ✅ 已实现 | 创建 reversalEntry 冲正记录 |
| POST /orders/:id/exchange | ❌ 未实现 | PRD 定义但 server.js 无对应路由 |
| 当场换货（5分钟快捷换货） | ❌ 未实现 | delivery-complete.html 无换货按钮 |
| 换货面板 | ❌ 未实现 | 未创建换货 UI |

### 发现的问题

1. **换货 API 缺失**（高优先级）
   - 文件：`services/backend/src/server.js`
   - 问题：PRD 定义 `POST /orders/:id/exchange`，但后端无对应路由和 handler
   - `order-client.js` 第 34-44 行已定义 `submitOrderExchange`，但后端未实现
   - 建议：补充 exchange 路由和 processOrderExchange 函数

2. **当场换货功能缺失**（高优先级）
   - 文件：`apps/delivery-app/src/delivery-complete.html`
   - 问题：完单后未显示5分钟快捷换货按钮
   - PRD 要求：完单成功页面显示[快捷换货]按钮（5分钟倒计时）
   - 建议：在 complete-toast 或新增区域添加换货入口

3. **换货面板未实现**（高优先级）
   - 文件：未创建
   - PRD 要求：弹出换货面板，选择规格/数量、差价处理方式
   - 建议：在 order-detail.html 中新增换货弹层或创建独立页面

4. **状态不一致**（中优先级）
   - 文件：`apps/delivery-app/src/order-detail.html` 第 195-203 行
   - 问题：formatStatus 缺少 `exchanging`（换货中）状态映射
   - 建议：添加 `{ exchanging: { text: "换货中", class: "status-exchanging" } }`

---

## 三、其他发现的问题

### 5. 订单列表跳转链接参数不一致（低优先级）
- 文件：`apps/delivery-app/src/order-list.html` 第 457、463 行
- 问题：使用 `?id=` 参数，但 order-detail.html 使用 `orderId` 参数名
- 建议：统一参数名（检查 order-detail.html 第 174 行使用 `orderId`）

### 6. my.html 残留无效事件监听（低优先级）
- 文件：`apps/delivery-app/src/my.html` 第 172 行
- 问题：`inventoryBtn` 事件监听但页面无此按钮
- 建议：移除或添加库存入口按钮

---

## 四、修复建议优先级

| 优先级 | 问题 | 影响 |
|-------|------|------|
| P0 | 换货 API 缺失 | Task 44 核心功能无法完成 |
| P0 | 当场换货功能缺失 | Task 44 核心功能无法完成 |
| P1 | 订单列表调用真实 API | Task 43 数据不持久化 |
| P1 | 换货面板未实现 | Task 44 功能不完整 |
| P2 | 筛选标签不完整 | 用户体验问题 |
| P2 | 状态映射不完整 | 显示问题 |
| P3 | 参数命名不一致 | 维护性问题 |

---

## 五、总结

- **Task 43**：UI 结构完整，但需接入真实 API，补充分页和「已退货」筛选
- **Task 44**：退货功能完整实现，但**换货功能完全缺失**（API + UI），需重点补充

建议由负责这两个任务的开发者优先处理换货功能缺失问题。
