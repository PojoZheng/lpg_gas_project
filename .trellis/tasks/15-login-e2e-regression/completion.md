# 任务完成记录：15-login-e2e-regression

## 1. 验收结果
- [x] 覆盖发送验证码、登录、刷新、设备会话 4 条回归用例。
- [x] 自动触发脚本支持 task 级测试命令。
- [x] 测试报告在任务完成记录中可追溯。
- [x] 登录相关页面保持中文文案、禁用 emoji、主色一致（本轮未改动登录页面样式，保持既有规范）。

## 2. 关键改动
- 新增脚本：`/.trellis/scripts/task15_login_e2e_regression.py`
  - 用例 1：`/auth/send-code` 成功路径，校验 `success/data/error/request_id`
  - 用例 2：`/auth/login` 错误验证码失败路径，校验 `VALIDATION_400`
  - 用例 3：`/auth/login` 成功 + `/auth/refresh` 成功回归
  - 用例 4：`/auth/devices` 会话列表回归
  - 脚本支持在 3100 未监听时临时拉起后端并自动回收
- 更新配置：`/.trellis/tasks/test-commands.json`
  - 增加 `15-login-e2e-regression` 专属测试命令

## 3. 测试报告
- 运行：`python3 ./.trellis/scripts/auto_test_runner.py --once`
- 结果：通过（task-15 专属 3 条命令全部通过）
