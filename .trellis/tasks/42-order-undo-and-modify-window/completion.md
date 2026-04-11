# Task 42：短时撤销与 24 小时改单（完成说明）

## 对照需求

- **来源**：`requirements/01_工作台/需求.md` §6（5 秒撤销、24 小时内改单与库存联动描述）；订单需求 `requirements/02_订单/需求.md` §4.3 修改记录口径。
- **后端**：`/orders/:id/undo` 与 `/orders/:id/basic-update` 既有契约保留；`PATCH basic-update` 响应**向后兼容扩展**字段（见下）。

## 实现摘要

### 5 秒撤销（完单后）

- 后端：`completeDeliveryOrder` 已设置 `lastActionUndoUntil`；本次补充 **`canModifyUntil` 在完单时刷新为完单时刻起 24h**，与改单窗口一致。
- 前端 `delivery-complete.html`：完单成功后展示**顶部 Toast**（约 5s 进度条 +「撤销」），调用既有 `POST /orders/:id/undo`；撤销成功后关闭 Toast、清空「上一笔完单」卡片并刷新列表/库存/安检状态。

### 24 小时内改单与修改记录

- **已完成订单**在 `basic-update` 中支持：
  - **数量**：相对原数量增减时，分别调用 `directConsumeInventory` / `returnInventoryToOnHand`（库存日志类型 `modify_return`），与既有锁定/消耗语义一致。
  - **实收金额**：重算 `paymentStatus`、`debtRecordedAmount`，并通过 `adjustCustomerDebt` 做**差额**调整客户欠款台账。
  - **备注**：`driverNote`（最多 500 字）。
- 每次产生字段差异时写入订单内 **`modifyLogs`**：`{ at, changes: { 字段: { before, after } } }`（最多保留约 120 条，响应中返回最近 20 条）。
- 前端：新增 **`GET /orders/:id`** 客户端封装 `fetchOrderById`；完单后展示「上一笔完单（24 小时内可改）」卡片，可改数量/实收/备注并提交 `PATCH`，下方展示最近修改记录摘要。

## 未纳入 / 风险

- **财务台账**：改单后未自动追加/冲正 `financeEntries` 明细，今日汇总可能与订单维度存在偏差；对账需依赖 `modifyLogs` 或后续财务任务。
- **当场完成 / 安检链**：改单未回写安检与上报状态；若需强一致需订单域后续任务。
- **欠瓶字段**：改单未开放修改 `owedEmptyCount`（需求 §6 欠瓶专章在 02 订单另一节，本任务聚焦 §6.1–6.2 工作台改单口径）。

## 涉及文件

- `.trellis/backend/src/server.js`
- `.trellis/delivery-app/src/delivery-complete-client.js`
- `.trellis/delivery-app/src/delivery-complete.html`
