# Multi-Agent 中文提示词

本目录用于存放可直接粘贴到 Cursor 会话首条消息的角色提示词。

## 文件说明

- `AUTOMATION.zh.md`：**协调器本机自动化**（`coordinator_round.sh`、`coordinator.env`、与 CI 的分工）。
- `SESSION_KICKOFF.zh.md`：三棵辅树 **开发 A / B / C** 的首条消息模板，外加 **主仓「调度 + 集成」** 一节。
- `00-unattended-runbook.zh.md`：三开发窗口 + 主仓少打扰、仅卡住时人工介入的约定（与协调器单点沟通时阅读）。
- `01-dev-coding.zh.md`：开发 Agent（编码）提示词。
- `02-integrator.zh.md`：集成 Agent（合并、验证、发布）提示词。
- `03-dispatcher.zh.md`：调度 Agent（任务创建/分发/广播）提示词。

## 推荐对应关系

- `worktree A` -> 开发 Agent A（例如 `04-delivery-to-complete`）
- `worktree B` -> 开发 Agent B（例如 `17-quick-order-ux-alignment`）
- **合并 / 推 `main`**：默认在 **已检出 `main` 的主仓 worktree** 的「集成」会话中完成（Git 规定全库只能有一棵检出 `main`）。
- `wt-integrate`（或其它辅树）-> 可作 **开发 C** 或工具脚本；**不**因此自动承担写 `main`，除非主仓不可用且团队另有约定。
- 任意独立会话 -> **调度**（可与主仓「集成」由同一人/同一会话承担，但文档上仍区分职责：调度=排期广播，集成=合并与验收链接）

## 最小操作规则

1. 在 Cursor 里对该窗口使用 **Agent（执行）模式**，不要用仅问答模式；否则容易只回摘要不跑命令。
2. 每个会话启动先读 `.trellis/.current-task`。
3. 每个会话启动先执行 `python3 ./.trellis/scripts/session_bootstrap.py`。
4. 开发 Agent：实现 acceptance；**可 commit + `git push origin feat/...` + 开 PR**；**禁止** `git push origin main`。
5. 集成（多在主仓）：合并 PR、全量检查、`start_local_preview.sh` 后再给验收 URL；必要时 `session_finalize.py --commit-message`。
6. 会话上下文接近上限时，开新会话并重复步骤 2-3。

## 本地预览（集成验收前）

合并后若要给可点击的验收链接，先在仓库根执行：

`bash ./.trellis/scripts/start_local_preview.sh`

会同时起 **API :3100** 与 **静态页 :5174**，避免只给死链。
