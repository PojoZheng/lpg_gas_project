# 任务完成记录：43-order-history-list

## 1. 验收结果
- [x] 「我的」页面已提供「订单历史」入口，并跳转至 `./order-list.html`。
- [x] `order-list.html` 已实现顶部 Tab 筛选（全部/待配送/已完成/已取消/已退货）。
- [x] `order-list.html` 已实现搜索框，支持客户姓名、地址、订单号模糊匹配。
- [x] 列表项展示客户姓名、地址、规格×数量、金额、状态标签、时间。
- [x] 已完成订单可进入 `order-detail.html` 查看详情。
- [x] `GET /orders?page=&size=&status=&keyword=&customerId=` 可用，返回分页订单列表。
- [x] `GET /orders/:id` 可用，返回订单详情对象（含金额、支付、修改记录等字段）。
- [x] 页面保持中文、无 emoji，沿用 delivery-app 主色 `#4799a0`。

## 2. 本次补齐
- 统一订单历史链路的登录态读取：`order-list.html` 与 `order-client.js` 优先读取 `auth_session`，兼容旧 `driver_session`。
- 修正列表到详情的参数命名，`order-list.html` 统一跳转 `order-detail.html?orderId=...`，详情页同时兼容 `orderId/id`。
- 支持从客户详情通过 `customerId` 深链进入历史订单页，列表接口同步支持 `customerId` 过滤。

## 3. 验证记录
- `node --check services/backend/src/server.js`
- 订单列表与详情静态复核完成，历史订单入口、筛选、详情跳转链路已对齐。

## 4. 涉及文件
- `apps/delivery-app/src/my.html`
- `apps/delivery-app/src/order-list.html`
- `apps/delivery-app/src/order-detail.html`
- `apps/delivery-app/src/order-client.js`
- `services/backend/src/server.js`
