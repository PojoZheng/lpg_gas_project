# 三执行窗口首轮 / 新一轮「首条消息」模板

**约定（以此为准）**：

- **三个 Cursor 执行窗口** = 开发 A、开发 B、开发 C（各在**自己的 git worktree**根目录打开）。
- **合并 PR、`push origin main`、跑 `start_local_preview.sh`、给验收 URL** = 在**主仓**（全库**唯一**检出本地分支 `main` 的那棵目录）的**协调器 + 集成**会话中完成；**不再**要求「第三窗 = 集成专用 wt-integrate」。
- 辅 worktree **禁止** `git checkout main`；对齐主线用 `git switch --detach origin/main` 或 `git switch -c feat/<topic> origin/main`（见根目录 `AGENTS.md`）。

**使用方式**：协调器跑完 `coordinator_round.sh`（或写好各树 `.current-task`）后，在**对应 worktree 根目录**打开 Cursor，将**与你角色匹配**的整段复制为**该窗口第一条用户消息**（可删去括号说明）。

---

## 窗口 1：开发 A（例如 wt-04）

你是我的开发 Agent（开发 A）。工作区必须打开为**本 git worktree 的仓库根目录**（与 `setup_parallel_worktrees` 中 Dev A 目录一致）。

请严格遵循 `.trellis/workspace/agent-prompts/01-dev-coding.zh.md`（含第 0、0.1 节）：先执行恢复步骤，再**同一会话内**按 `.trellis/.current-task` 指向的 `task.json` 中 `acceptance` 连续实现；除非报错或职责不符，不要停下来问我是否继续。

先执行：

`python3 ./.trellis/scripts/session_bootstrap.py`

然后根据输出中的 Current Task 开始改代码与测试。

---

## 窗口 2：开发 B（例如 wt-17）

你是我的开发 Agent（开发 B）。工作区必须打开为**本 git worktree 的仓库根目录**（与 `setup_parallel_worktrees` 中 Dev B 目录一致）。

请严格遵循 `.trellis/workspace/agent-prompts/01-dev-coding.zh.md`（含第 0、0.1 节）：先执行恢复步骤，再**同一会话内**按 `.trellis/.current-task` 连续实现；除非报错或职责不符，不要停下来问我是否继续。

先执行：

`python3 ./.trellis/scripts/session_bootstrap.py`

然后根据输出中的 Current Task 开始改代码与测试。

---

## 窗口 3：开发 C（例如 wt-integrate）

你是我的开发 Agent（开发 C）。工作区必须打开为**本 git worktree 的仓库根目录**（常为 `wt-integrate` 或其它第三棵辅树）。

请严格遵循 `.trellis/workspace/agent-prompts/01-dev-coding.zh.md`（含第 0、0.1 节）：先执行恢复步骤，再按 `.trellis/.current-task` 实现 acceptance；**本窗口不承担合并进 `main` 与 `push origin main`**（由主仓协调器+集成会话处理）。

先执行：

`python3 ./.trellis/scripts/session_bootstrap.py`

然后根据输出中的 Current Task 开始改代码与测试。

---

## 主仓会话：调度 + 集成（单独会话，不占用「窗口 1–3」）

在**主仓**打开 Cursor（与三棵辅树之一**不同**的目录，且为**唯一**检出 `main` 的 worktree）。

- **调度**：遵循 `03-dispatcher.zh.md`（任务、广播、`.current-task` 分发、`suggest_next_task.py` 等）。
- **集成**：遵循 `02-integrator.zh.md`（合并 PR、解决冲突、检查、`start_local_preview.sh`、验收 URL、`session_finalize.py` 等）。

先执行：

`python3 ./.trellis/scripts/session_bootstrap.py`

然后按待合并 PR 与检查流程继续；**不要**在辅树执行 `git checkout main` 来完成合并。
