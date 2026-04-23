# 任务完成记录：05-inventory-lock-revert

## 1. 验收结果
- [x] 稍后配送支持库存锁定：快速开单在 `later_delivery` 模式下改为锁定库存，不再立即扣减总库存。
- [x] 取消订单支持库存回滚：待配送取消时释放锁定库存，库存快照即时回显。
- [x] 完单支持库存正式扣减：待配送完单时先释放锁定，再做正式出库扣减。
- [x] 界面视觉需对齐参考风格并遵循主色 #4799a0：库存快照卡片复用现有浅色卡片样式与主色体系。
- [x] 界面文案必须为中文且严禁 emoji：新增提示、标签、错误文案均为中文且无 emoji。

## 2. 关键改动
- 后端：`/services/backend/src/server.js`
  - 库存结构升级为 `onHand + locked + available`
  - 新增库存事务函数：锁定、释放、正式扣减、直接扣减与事务日志
  - `POST /orders/quick-create` 区分稍后配送锁定与当场完成扣减
  - 完单/取消/撤销流程与库存状态同步
  - 新增 `GET /inventory/snapshot` 返回库存快照与日志
- 前端：`/apps/delivery-app/src/delivery-complete-client.js`
  - 新增库存快照接口调用
- 前端：`/apps/delivery-app/src/delivery-complete.html`
  - 新增库存快照卡片（总库存/锁定库存/可用库存）并在关键动作后刷新
- 前端：`/apps/delivery-app/src/quick-order-client.js`
  - mock 库存逻辑对齐为“锁定/扣减”双路径

## 3. 测试与风险
- 已执行：`python3 ./.trellis/scripts/auto_test_runner.py --once`（通过）
- 风险：
  - 当前库存数据为内存态，服务重启后快照与日志会重置。
  - 目前仅覆盖本地单实例并发场景；跨实例冲突处理仍需后续任务补齐。
