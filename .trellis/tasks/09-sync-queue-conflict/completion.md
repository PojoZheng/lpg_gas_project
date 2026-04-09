# 任务完成记录：09-sync-queue-conflict

## 1. 验收结果
- [x] 支持离线队列提交与批量同步：新增离线入队与批量同步接口，并提供同步队列页面执行批量同步。
- [x] 冲突可识别并可回显处理结果：对订单状态冲突、库存基线冲突做识别，返回冲突类型与中文说明并在页面回显。
- [x] 失败重试后可进入人工处理：失败记录可重试；重试达到上限自动标记人工处理，也支持手动转人工。
- [x] 界面视觉需对齐参考风格并遵循主色 #4799a0：同步队列页面沿用卡片式布局与主色按钮。
- [x] 界面文案必须为中文且严禁 emoji：新增文案均为中文且无 emoji。

## 2. 关键改动
- 后端：`/.trellis/backend/src/server.js`
  - 新增离线队列模型与同步处理状态机
  - 新增接口：
    - `GET /sync/queue`
    - `POST /sync/queue/enqueue`
    - `POST /sync/queue/batch-submit`
    - `POST /sync/queue/:offlineId/retry`
    - `POST /sync/queue/:offlineId/manual`
  - 工作台同步概览改为基于离线队列统计
- 前端：`/.trellis/delivery-app/src/sync-queue-client.js`
  - 新增同步队列 API 调用封装
- 前端：`/.trellis/delivery-app/src/sync-queue.html`
  - 新增同步队列页面，支持入队、批量同步、冲突回显、失败重试与转人工
- 前端：`/.trellis/delivery-app/src/workbench.html`
  - 新增“同步队列”入口

## 3. 测试与风险
- 已执行：`python3 ./.trellis/scripts/auto_test_runner.py --once`（通过）
- 风险：
  - 当前离线队列为内存态，服务重启后记录会重置。
  - 冲突检测目前覆盖订单状态与库存基线两类 MVP 场景，后续可扩展更多实体字段级冲突策略。
