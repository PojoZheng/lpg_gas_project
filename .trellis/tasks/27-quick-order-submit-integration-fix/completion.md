# 任务完成记录：27-quick-order-submit-integration-fix

## 1. 验收结果
- [x] 快速开单页面可真实提交成功并返回明确成功反馈：保持真实调用 `/orders/quick-create`，成功后展示订单号与追踪提示。
- [x] 提交失败返回中文可理解错误信息并区分类型：前端按网络/鉴权/参数/服务失败分类提示中文文案。
- [x] 后端订单写入与前端请求契约一致：`/orders/quick-create` 改为统一契约响应，含 `request_id` 与标准错误码。
- [x] 提交后的订单在后续流程可追踪：成功开单后可在待配送链路中检索到订单，并提供“前往待配送/完单链路追踪订单”入口。
- [x] 新增最小联调回归脚本并通过自动化：新增脚本覆盖 auth/validation/success/trace 主链路。

## 2. 关键改动
- 后端：`/.trellis/backend/src/server.js`
  - 新增订单错误映射 `mapOrderError`
  - 调整 `POST /orders/quick-create` 为统一契约返回：
    - 成功：`success=true, data, error=null, request_id`
    - 失败：区分 `AUTH_401` / `VALIDATION_400` / `INVENTORY_409_STOCK`
- 前端：`/.trellis/delivery-app/src/quick-order-client.js`
  - 按 HTTP 状态与错误码分类中文错误提示：
    - 网络失败
    - 鉴权失败
    - 参数失败
    - 服务失败
- 前端：`/.trellis/delivery-app/src/quick-order.html`
  - 开单成功后新增可追踪引导按钮
  - 成功提示补充“可在待配送/完单链路继续追踪”
- 测试：
  - 新增 `/.trellis/scripts/task27_quick_order_integration.py`
  - 更新 `/.trellis/tasks/test-commands.json` 增加 `27-quick-order-submit-integration-fix` 专属命令

## 3. 测试与风险
- 已执行：`python3 ./.trellis/scripts/auto_test_runner.py --once`（针对 task-27 专属命令，通过）
- 风险：
  - 当前联调回归使用本地内存数据，重启后数据重置。
  - 前端“追踪订单”入口目前统一跳转待配送/完单页面，后续可细分到订单详情页。
