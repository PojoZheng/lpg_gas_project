# Multi-Agent 中文提示词

本目录用于存放可直接粘贴到 Cursor 会话首条消息的角色提示词。

## 文件说明

- `01-dev-coding.zh.md`：开发 Agent（编码）提示词。
- `02-integrator.zh.md`：集成 Agent（合并、验证、发布）提示词。
- `03-dispatcher.zh.md`：调度 Agent（任务创建/分发/广播）提示词。

## 推荐对应关系

- `worktree A` -> 开发 Agent A（例如 `04-delivery-to-complete`）
- `worktree B` -> 开发 Agent B（例如 `17-quick-order-ux-alignment`）
- `main` 或 `worktree integrate` -> 集成 Agent
- 任意独立会话 -> 调度 Agent（建议只保留一个）

## 最小操作规则

1. 每个会话启动先读 `.trellis/.current-task`。
2. 每个会话启动先执行 `python3 ./.trellis/scripts/session_bootstrap.py`。
3. 开发 Agent 只实现 acceptance，不执行 commit/push。
4. 集成 Agent 负责合并、全量检查，必要时执行 `session_finalize.py --commit-message`。
5. 会话上下文接近上限时，开新会话并重复步骤 1-2。
