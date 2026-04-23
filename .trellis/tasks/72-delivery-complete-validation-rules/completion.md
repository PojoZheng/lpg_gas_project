# Task 72 完成记录：待配送完单输入校验规则补齐（前后端一致）

## 已完成内容

1. 前端完单表单校验补齐
- 文件：`apps/delivery-app/src/delivery-complete.html`
- 新增规则：
  - 实收金额必须是 `>=0` 且最多两位小数
  - 收款方式必须为 `wechat/cash/credit`
  - 回收空瓶、欠瓶必须为非负整数
  - 回收空瓶 + 欠瓶不得超过订单配送数量
  - `credit`（记账）时实收必须为 `0`
  - `cash/wechat` 时实收必须 `>0`（全额赊账应选择记账）
- 交互：前端在提交前给出明确错误提示，避免无效请求进入后端

2. 后端 complete 接口兜底校验与稳定错误码
- 文件：`services/backend/src/server.js`
- `completeDeliveryOrder` 同步实现与前端一致的规则
- 新增状态冲突错误码：
  - 当订单非待配送时，返回 `ORDER_409_STATUS`
- 参数不合法统一返回：
  - `VALIDATION_400` + 可读文案
- 全局错误出口补齐订单路由契约化返回：
  - `pathname === "/orders" || pathname.startsWith("/orders/")` 统一走 `mapOrderError + sendContractError`

3. 新增规则验证故事测试
- 文件：`.trellis/tests/stories/story_delivery_complete_validation.py`
- 覆盖场景：
  - 合法完单组合通过
  - 非法金额小数位
  - 记账+非零实收
  - 现金/微信+零实收
  - 空瓶合计超配送数量
  - 重复完单状态冲突（409）
- 测试脚本自启独立后端端口（默认 3110），避免依赖常驻 3100 环境

4. 测试命令编排更新
- 文件：`.trellis/tasks/test-commands.json`
- 新增 `72-delivery-complete-validation-rules` 命令集合

## 验证结果

- `node --check services/backend/src/server.js`：通过
- `python3 ./.trellis/tests/stories/story_delivery_complete_validation.py`：通过
- `python3 ./.trellis/scripts/task20_safety_layout_smoke.py`：通过
- `python3 ./.trellis/scripts/task_flow_guard.py`：通过（0 warning / 0 error）
