# 任务完成记录：14-auth-api-contract-alignment

## 1. 验收结果
- [x] `send-code/login/refresh/devices` 接口响应结构统一：认证接口返回统一 `success/data/error/request_id` 结构。
- [x] 错误码和错误文案统一到 shared 契约：认证失败返回 `{ code, message }`，覆盖 `AUTH_401` 与 `VALIDATION_400`。
- [x] 前端调用层适配并保留中文提示：前端调用层兼容 `error` 对象并继续输出中文提示文案。
- [x] 更新接口文档与任务完成记录：补充 shared 契约认证接口约定，并新增本完成记录。
- [x] 自动化测试通过。

## 2. 关键改动
- 后端：`/.trellis/backend/src/server.js`
  - 新增认证契约响应工具：`sendContractSuccess`、`sendContractError`
  - 为认证路由增加 `request_id`
  - 统一认证失败映射：`AUTH_401`、`VALIDATION_400`
- 前端：`/.trellis/delivery-app/src/auth-client.js`
  - 新增 `normalizeApiResult`，兼容 `error` 对象并保留中文提示
- 文档：`/.trellis/spec/shared/api-contracts.md`
  - 增加“认证接口约定（task-14）”章节

## 3. 测试
- `python3 ./.trellis/scripts/auto_test_runner.py --once`（通过）
