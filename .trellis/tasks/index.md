# 任务执行索引

## 使用方式
- 开发前先阅读 `/.trellis/spec/master` 与 `/.trellis/spec/shared`。
- 按任务依赖顺序推进，不跳过前置任务。
- 每个任务完成后更新 `task.json` 状态并补充验收结果。
- 如任务涉及界面，必须满足：主色 `#4799a0`、视觉风格对齐参考图、文案中文化、禁用 emoji。

## 任务完成记录（三段式）
每个任务完成后，在对应任务目录补充 `completion.md`，按以下三段写：
1. **验收结果**：逐条对应 `task.json.acceptance`
2. **引用 spec**：列出本次实际遵循的 spec 文件路径
3. **风险与后续**：已知风险、边界、建议后续任务

## 任务目录
- `01-auth-session`
- `02-workbench-aggregation`
- `03-quick-order`
- `04-delivery-to-complete`
- `05-inventory-lock-revert`
- `06-customer-account-linkage`
- `07-safety-trigger-report`
- `08-finance-posting-daily-close`
- `09-sync-queue-conflict`
- `10-platform-policy-release`
- `11-platform-monitor-compliance`

## 依赖图
见 [feature-task-map.md](./feature-task-map.md)
