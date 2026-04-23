# 任务完成记录：47-customer-list-management

## 1. 验收结果
- [x] 「客户」入口已指向 `customer-list.html`。
- [x] `customer-list.html` 已实现搜索框、客户卡片、欠瓶/欠款标记与筛选。
- [x] 已新增 `customer-detail.html`，展示基本信息、台账汇总、最近订单与历史订单入口。
- [x] `GET /customers` 可支持搜索、筛选、分页。
- [x] `GET /customers/:id` 可返回客户详情与台账汇总。
- [x] `GET /customers/:id/orders` 可返回客户历史订单。
- [x] 从客户详情与客户列表可一键跳转快速开单，并带 `customerId` 预选客户。
- [x] 页面保持中文、无 emoji，沿用主色 `#4799a0`。

## 2. 本次补齐
- 新增统一客户客户端 `customer-client.js`，优先调用 `GET /customers`、`GET /customers/:id`、`GET /customers/:id/orders`，兼容旧接口降级。
- `customer-list-client.js` 已切换为真实接口数据源，支持 300ms 搜索防抖、分页加载更多、筛选和深链跳转。
- 新增 `customer-detail.html`，补齐客户详情、账务摘要、催款快捷动作、最近订单与历史订单入口。
- `quick-order.html` 已支持读取 `customerId` 查询参数并自动选中客户。
- `order-list.html` 与 `/orders` 已支持通过 `customerId` 深链查看该客户历史订单。

## 3. 验证记录
- `node --check services/backend/src/server.js`
- `node --experimental-default-type=module --check apps/delivery-app/src/customer-client.js`
- 本地冒烟：
  - `GET /customers?page=1&size=5`
  - `GET /customers/CUST-001`
  - `GET /customers/CUST-001/orders?page=1&size=5`
  - 创建订单后客户详情 `recentOrders` 与客户历史订单接口联动更新

## 4. 涉及文件
- `apps/delivery-app/src/customer-list.html`
- `apps/delivery-app/src/customer-list-client.js`
- `apps/delivery-app/src/customer-detail.html`
- `apps/delivery-app/src/customer-client.js`
- `apps/delivery-app/src/quick-order.html`
- `apps/delivery-app/src/order-list.html`
- `services/backend/src/server.js`
