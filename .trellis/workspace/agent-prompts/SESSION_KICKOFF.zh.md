# 三窗口首轮 / 新一轮「首条消息」模板

**使用方式**：协调器跑完 `coordinator_round.sh`（或写好指针）后，在**对应 worktree 根目录**打开 Cursor，将**与你角色匹配**的整段复制为**该窗口第一条用户消息**（可删去括号说明）。

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

## 窗口 3：集成（例如 wt-integrate）

你是我的集成 Agent。工作区必须打开为**集成用 worktree 的仓库根目录**。

请严格遵循 `.trellis/workspace/agent-prompts/02-integrator.zh.md`（含第 0、0.1 节）：先执行恢复步骤，再按约定合并开发分支、跑检查；合并通过后再按提示词执行 `start_local_preview.sh` 并给出可点击验收 URL。除非报错或缺少合并输入，不要停下来问我是否继续。

先执行：

`python3 ./.trellis/scripts/session_bootstrap.py`

然后根据当前任务与待合并分支继续集成工作。
