# Task 73 完成记录：完单页跨域能力归位（催收/库存/改单）

## 结果概述

本任务完成了“待配送完单”页面的跨域能力归位，页面边界调整为：
- 完单页只处理交易提交与安检闭环
- 催收状态维护统一收敛到债务管理页
- 24h 改单入口与操作统一收敛到订单详情页

## 实施明细

1. 完单页增加跨页归位入口（不承载跨域编辑）
- 文件：`apps/delivery-app/src/delivery-complete.html`
- 调整：
  - 新增按钮：`去订单详情改单`（跳转 `order-detail.html?orderId=...`）
  - 新增按钮：`去债务管理`（跳转 `debt-overview.html`）
  - 完单成功提示文案补充边界引导：
    - 有欠款：提示去债务管理
    - 无欠款：提示 24h 改单在订单详情执行

2. 订单详情页承接 24h 改单入口与操作
- 文件：`apps/delivery-app/src/order-detail.html`
- 调整：
  - 新增“24 小时改单”卡片与编辑项（配送时间、地址、数量、单价、实收金额）
  - 仅在可修改窗口内显示（`canModifyUntil`）
  - 调用 `/orders/:id/basic-update` 执行保存
  - 非已完成订单禁改实收金额

3. 订单客户端补齐改单接口
- 文件：`apps/delivery-app/src/order-client.js`
- 调整：
  - 新增 `updateOrderBasic(orderId, payload)`，对接 `PATCH /orders/:id/basic-update`

4. 我的页/债务页强化边界文案
- 文件：`apps/delivery-app/src/my.html`
  - 债务管理入口副文案更新为“催款状态维护与还款登记”
- 文件：`apps/delivery-app/src/debt-overview.html`
  - 头部说明明确“催收状态编辑统一在本页处理（完单页仅保留结果展示）”

## 验证

- `node --check services/backend/src/server.js`：通过
- `node --experimental-default-type=module --check apps/delivery-app/src/order-client.js`：通过
- `python3 ./.trellis/scripts/task20_safety_layout_smoke.py`：通过
- `python3 ./.trellis/scripts/task_flow_guard.py`：通过（0 warning / 0 error）
