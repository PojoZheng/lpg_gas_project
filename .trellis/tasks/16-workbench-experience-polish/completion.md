# task-16 完成说明（工作台功能闭环）

## 本轮目标
- 首页取消常驻同步状态卡，改为“联网且存在待同步”时自动弹同步模态。
- 下一待配送卡补齐“查看详情 / 开始配送”动作。
- 补齐无收入、无待配送时的空状态文案与引导动作。

## 实现内容
- `workbench.html`
  - 新增同步模态 `syncOverlay`，包含：
    - `立即同步`
    - `稍后处理`
    - `查看同步明细`
    - `重试失败项`
  - 移除常驻同步卡，改为在 `loadData` 成功且在线时按 `sync.pendingCount` 自动触发模态。
  - 下一待配送卡新增 `nextDetailBtn`、`startDeliveryBtn` 两个动作入口。
  - 新增空状态文案：
    - 收款为空：`今日暂无收款数据，可先去快速开单。`
    - 待配送为空：`暂无待配送 / 可前往快速开单创建新订单`
- `workbench-client.js`
  - 新增 `fetchSyncQueueOverview()`：读取同步队列并聚合待同步/失败/等待重试数量。
  - 新增 `batchSyncNow()`：触发批量同步。

## 验证
- `python3 ./.trellis/scripts/task16_workbench_closure.py`
- `python3 ./.trellis/scripts/auto_test_runner.py --once`

## 约束说明
- 未修改任何后端接口契约。
- 保持当前 UI 风格，仅补齐功能闭环与引导交互。
