# 任务完成记录：37-workbench-p0-view-all-pending

## 验收结果
- [x] 工作台「下一个配送 / 待办」区块标题对齐需求区域 B，并提供固定入口「查看全部待配送」，链至 `./delivery-complete.html?from=workbench&view=pending`。
- [x] 文案中文、无 emoji；入口使用 `app-btn ghost` 与 `min-height: 48px` 触控尺寸，符合 DESIGN 最小触达。
- [x] 保留主操作区「快速开单 / 待配送」与底部导航；未改后端接口契约。
- [x] 已更新 `.trellis/spec/delivery-app/domain-workbench/REQUIREMENTS_01_COVERAGE.md` §2 与 §5 P0 第 1 条为已满足。
- [x] `delivery-complete.html` 在 `view=pending` 时加载订单后平滑滚动至「待配送订单」区块，便于从工作台进入后直接定位列表。

## 关键改动
- `apps/delivery-app/src/workbench.html`：区域 B 标题与副文案、`viewAllPendingLink` 链接样式。
- `apps/delivery-app/src/delivery-complete.html`：`pendingDeliverySection` 锚点与 `maybeScrollToPendingList`。
- `.trellis/spec/delivery-app/domain-workbench/REQUIREMENTS_01_COVERAGE.md`：覆盖表与变更记录。
- `.trellis/scripts/task37_workbench_view_all_smoke.py`：轻量 DOM/路由断言。
- `.trellis/tasks/test-commands.json`：增加本任务测试命令条目。

## 校验
- `python3 ./.trellis/scripts/auto_test_runner.py --once`
- `node --check "apps/delivery-app/src/workbench-client.js"`（未改逻辑时仍通过）
