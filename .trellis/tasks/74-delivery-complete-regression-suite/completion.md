# Task 74 完成记录：待配送完单链路回归测试包（结构+契约+校验）

## 交付物

1. 完单主链路故事测试
- 文件：`.trellis/tests/stories/story_delivery_complete_flow_e2e.py`
- 覆盖：待配送选择 -> 完单提交 -> 安检记录触发 -> 安检提交闭环（按策略）

2. 订单契约一致性测试
- 文件：`.trellis/tests/stories/story_order_contract_consistency.py`
- 覆盖：`/orders`、`/orders/pending-delivery`、`/orders/:id` 关键字段同口径
- 断言：字段完整、无 snake_case 回归、关键字段值一致

3. 完单规则测试（复用 task72）
- 文件：`.trellis/tests/stories/story_delivery_complete_validation.py`
- 覆盖：非法输入组合 + 错误码断言（`VALIDATION_400` / `ORDER_409_STATUS`）

4. 测试命令接入
- 文件：`.trellis/tasks/test-commands.json`
- 新增：`74-delivery-complete-regression-suite` 任务命令组，支持独立执行

## 验证结果

- `python3 ./.trellis/tests/stories/story_order_contract_consistency.py`：通过
- `python3 ./.trellis/tests/stories/story_delivery_complete_validation.py`：通过
- `python3 ./.trellis/tests/stories/story_delivery_complete_flow_e2e.py`：通过
- `python3 ./.trellis/scripts/task20_safety_layout_smoke.py`：通过
- `python3 ./.trellis/scripts/task_flow_guard.py`：通过（0 warning / 0 error）
