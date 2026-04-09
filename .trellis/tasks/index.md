# 任务执行索引

## 使用方式
- 开发前先阅读 `/.trellis/spec/master` 与 `/.trellis/spec/shared`。
- 按任务依赖顺序推进，不跳过前置任务。
- 每个任务完成后更新 `task.json` 状态并补充验收结果。
- 如任务涉及界面，必须满足：主色 `#4799a0`、视觉风格对齐参考图、文案中文化、禁用 emoji。
- 新增任务前运行冲突检查：`python3 ./.trellis/scripts/task_conflict_check.py`。
- 新增任务前运行产品评审检查：`python3 ./.trellis/scripts/pm_review_check.py --task <task-id>`。
- 系统已配置自动触发：`task create/start` 后会自动执行冲突检查。
- 跨会话启动建议统一执行：`python3 ./.trellis/scripts/session_bootstrap.py`（上下文 + 冲突检查）。
- 会话结束建议执行：`python3 ./.trellis/scripts/session_finalize.py`（生成下会话初始指令包）。

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
- `12-backend-auth-persistence`
- `13-auth-security-hardening`
- `14-auth-api-contract-alignment`
- `15-login-e2e-regression`
- `16-workbench-experience-polish`
- `17-quick-order-ux-alignment`
- `18-customer-account-persistence-history`
- `19-quick-order-navigation-and-submit-contract`
- `20-safety-complete-mobile-layout`
- `21-auth-logout-flow`
- `22-workbench-bottom-nav-and-header-polish`

## 依赖图
见 [feature-task-map.md](./feature-task-map.md)
