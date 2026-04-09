# Multi-Agent 中文提示词

本目录用于存放可直接粘贴到 Cursor 会话首条消息的角色提示词。

## 文件说明

- `00-unattended-runbook.zh.md`：三窗口少打扰、仅卡住时人工介入的约定（与协调器单点沟通时阅读）。
- `01-dev-coding.zh.md`：开发 Agent（编码）提示词。
- `02-integrator.zh.md`：集成 Agent（合并、验证、发布）提示词。
- `03-dispatcher.zh.md`：调度 Agent（任务创建/分发/广播）提示词。

## 推荐对应关系

- `worktree A` -> 开发 Agent A（例如 `04-delivery-to-complete`）
- `worktree B` -> 开发 Agent B（例如 `17-quick-order-ux-alignment`）
- `main` 或 `worktree integrate` -> 集成 Agent
- 任意独立会话 -> 调度 Agent（建议只保留一个）

## 最小操作规则

1. 在 Cursor 里对该窗口使用 **Agent（执行）模式**，不要用仅问答模式；否则容易只回摘要不跑命令。
2. 每个会话启动先读 `.trellis/.current-task`。
3. 每个会话启动先执行 `python3 ./.trellis/scripts/session_bootstrap.py`。
4. 开发 Agent 只实现 acceptance，不执行 commit/push。
5. 集成 Agent 负责合并、全量检查，必要时执行 `session_finalize.py --commit-message`。
6. 会话上下文接近上限时，开新会话并重复步骤 2-3。

## 本地预览（集成验收前）

合并后若要给可点击的验收链接，先在仓库根执行：

`bash ./.trellis/scripts/start_local_preview.sh`

会同时起 **API :3100** 与 **静态页 :5174**，避免只给死链。
