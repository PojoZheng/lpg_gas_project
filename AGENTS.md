<!-- TRELLIS:START -->
# Trellis Instructions

These instructions are for AI assistants working in this project.

Use the `/trellis:start` command when starting a new session to:
- Initialize your developer identity
- Understand current project context
- Read relevant guidelines

Use `@/.trellis/` to learn:
- Development workflow (`workflow.md`)
- Project structure guidelines (`spec/`)
- Developer workspace (`workspace/`)

Keep this managed block so 'trellis update' can refresh the instructions.

<!-- TRELLIS:END -->

## Git 与多窗口（团队约定，跨会话以此为准）

- **除「集成」角色使用的 worktree / 窗口外，禁止执行 `git push origin main`。** 其它窗口若发现自己在 `main` 上且准备推送，先停下，改交集成处理。
- **开发窗口（04 / 17 / 开发 C 等）**：在 **`feat/<任务或简述>`** 分支上开发，并执行 **`git push origin feat/...`**；或只向集成交付 **patch / 合并顺序说明**，由集成在专用树里合并后再推 `main`。
- **新会话**：先读本段并确认当前窗口角色；`session_bootstrap` 前后若目录/分支与角色不符，应停下纠正再继续（与下方 Recovery 清单一致）。

## 工作台实现变更与对齐表（PR / 合入硬规则）

- 若同一变更集修改 **`/.trellis/delivery-app/src/workbench.html`** 或 **`/.trellis/delivery-app/src/workbench-client.js`**，须**同时**修改 **`/.trellis/spec/delivery-app/domain-workbench/REQUIREMENTS_01_COVERAGE.md`**（至少一行有实质意义，例如 §1、章节对照、§5 或**变更记录**）。
- 确无文档更新必要时：在 PR 或集成说明中写 **`N/A` 及理由**，由协调者确认后合入；否则 **CI 会失败**（脚本 `verify_workbench_coverage_touch.py`）。
- 本地自检（相对 `origin/main`）：`python3 ./.trellis/scripts/verify_workbench_coverage_touch.py`

## Session Recovery Baseline

For any new chat session in this repository, run this recovery checklist before coding:

1. `pwd`
2. `git branch --show-current`
3. `cat .trellis/.current-task` (if file exists in this worktree)
4. `python3 ./.trellis/scripts/session_bootstrap.py`
5. `git status --short`

If the directory/branch/task pointer does not match the role for this window, stop and ask for correction before making edits.
