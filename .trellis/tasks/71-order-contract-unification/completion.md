# Task 71 完成记录：订单接口字段契约统一（列表/待配送/详情）

## 已完成内容

1. 后端统一订单返回字段口径（camelCase）
- 文件：`services/backend/src/server.js`
- 改动：
  - 将 `mapOrderListItem` 统一为 `mapOrderContract`
  - `/orders` 列表项改为返回 `OrderContract`
  - `/orders/pending-delivery` 改为返回同一 `OrderContract`
  - `/orders/:id` 改为返回同一 `OrderContract`
  - `listCustomerOrders` 与 `getCustomerDetail.recentOrders` 同步复用统一映射

2. 前端订单列表消费字段统一
- 文件：`apps/delivery-app/src/order-list.html`
- 改动：
  - 切换为消费 `orderId/orderStatus/customerName/spec/quantity/amount/createdAt`
  - 移除对旧 snake_case 字段读取路径

3. 契约文档补充
- 文件：`.trellis/spec/shared/api-contracts.md`
- 改动：
  - 新增“订单接口字段契约（task-71）”
  - 补充 `/orders`、`/orders/pending-delivery`、`/orders/:id` 同口径说明
  - 增补完单关键字段定义：`amount`、`receivedAmount`、`recycledEmptyCount`、`owedEmptyCount`、`paymentMethod`

## 验证结果

- `python3 ./.trellis/scripts/task20_safety_layout_smoke.py`：通过
- `bash ./.trellis/scripts/start_local_preview.sh --check-only`：通过
- `python3 ./.trellis/scripts/task_flow_guard.py`：通过（0 warning / 0 error）

## 备注

- `task27_quick_order_integration.py` 在当前常驻服务环境下存在既有失败（参数失败返回断言），本次 task 71 改动范围未触发该脚本断言代码路径变更。
