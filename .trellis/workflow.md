# Development Workflow

> Based on [Effective Harnesses for Long-Running Agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)

---

## Table of Contents

1. [Quick Start (Do This First)](#quick-start-do-this-first)
2. [Workflow Overview](#workflow-overview)
3. [Session Start Process](#session-start-process)
4. [Development Process](#development-process)
5. [Session End](#session-end)
6. [Parallel multi-agent (optional)](#parallel-multi-agent-optional)
7. [File Descriptions](#file-descriptions)
8. [Best Practices](#best-practices)

---

## Quick Start (Do This First)

### Step 0: Initialize Developer Identity (First Time Only)

> **Multi-developer support**: Each developer/Agent needs to initialize their identity first

```bash
# Check if already initialized
python3 ./.trellis/scripts/get_developer.py

# If not initialized, run:
python3 ./.trellis/scripts/init_developer.py <your-name>
# Example: python3 ./.trellis/scripts/init_developer.py cursor-agent
```

This creates:
- `.trellis/.developer` - Your identity file (gitignored, not committed)
- `.trellis/workspace/<your-name>/` - Your personal workspace directory

**Naming suggestions**:
- Human developers: Use your name, e.g., `john-doe`
- Cursor AI: `cursor-agent` or `cursor-<task>`
- Claude Code: `claude-agent` or `claude-<task>`
- iFlow cli: `iflow-agent` or `iflow-<task>`

### Step 1: Understand Current Context

```bash
# One command bootstrap (model-agnostic, recommended)
python3 ./.trellis/scripts/session_bootstrap.py

# One command finalize (model-agnostic)
python3 ./.trellis/scripts/session_finalize.py

# Get full context in one command
python3 ./.trellis/scripts/get_context.py

# Or check manually:
python3 ./.trellis/scripts/get_developer.py      # Your identity
python3 ./.trellis/scripts/task.py list          # Active tasks
git status && git log --oneline -10              # Git state
```

### Step 2: Read Project Guidelines [MANDATORY]

**CRITICAL**: Read guidelines before writing any code:

```bash
# Read frontend guidelines index (if applicable)
cat .trellis/spec/frontend/index.md

# Read backend guidelines index (if applicable)
cat .trellis/spec/backend/index.md
```

**Why read both?**
- Understand the full project architecture
- Know coding standards for the entire codebase
- See how frontend and backend interact
- Learn the overall code quality requirements

### Step 3: Before Coding - Read Specific Guidelines (Required)

Based on your task, read the **detailed** guidelines:

**Frontend Task**:
```bash
cat .trellis/spec/frontend/hook-guidelines.md      # For hooks
cat .trellis/spec/frontend/component-guidelines.md # For components
cat .trellis/spec/frontend/type-safety.md          # For types
```

**Backend Task**:
```bash
cat .trellis/spec/backend/database-guidelines.md   # For DB operations
cat .trellis/spec/backend/type-safety.md           # For types
cat .trellis/spec/backend/logging-guidelines.md    # For logging
```

---

## Workflow Overview

### Core Principles

1. **Read Before Write** - Understand context before starting
2. **Follow Standards** - [!] **MUST read `.trellis/spec/` guidelines before coding**
3. **Incremental Development** - Complete one task at a time
4. **Record Promptly** - Update tracking files immediately after completion
5. **Document Limits** - [!] **Max 2000 lines per journal document**

### File System

```
.trellis/
|-- .developer           # Developer identity (gitignored)
|-- scripts/
|   |-- __init__.py          # Python package init
|   |-- common/              # Shared utilities (Python)
|   |   |-- __init__.py
|   |   |-- paths.py         # Path utilities
|   |   |-- developer.py     # Developer management
|   |   +-- git_context.py   # Git context implementation
|   |-- multi_agent/         # Multi-agent pipeline scripts
|   |   |-- __init__.py
|   |   |-- start.py         # Start worktree agent
|   |   |-- status.py        # Monitor agent status
|   |   |-- create_pr.py     # Create PR
|   |   +-- cleanup.py       # Cleanup worktree
|   |-- init_developer.py    # Initialize developer identity
|   |-- get_developer.py     # Get current developer name
|   |-- task.py              # Manage tasks
|   |-- get_context.py       # Get session context
|   +-- add_session.py       # One-click session recording
|-- workspace/           # Developer workspaces
|   |-- index.md         # Workspace index + Session template
|   +-- {developer}/     # Per-developer directories
|       |-- index.md     # Personal index (with @@@auto markers)
|       +-- journal-N.md # Journal files (sequential numbering)
|-- tasks/               # Task tracking
|   +-- {MM}-{DD}-{name}/
|       +-- task.json
|-- spec/                # [!] MUST READ before coding
|   |-- frontend/        # Frontend guidelines (if applicable)
|   |   |-- index.md               # Start here - guidelines index
|   |   +-- *.md                   # Topic-specific docs
|   |-- backend/         # Backend guidelines (if applicable)
|   |   |-- index.md               # Start here - guidelines index
|   |   +-- *.md                   # Topic-specific docs
|   +-- guides/          # Thinking guides
|       |-- index.md                      # Guides index
|       |-- cross-layer-thinking-guide.md # Pre-implementation checklist
|       +-- *.md                          # Other guides
+-- workflow.md             # This document
```

---

## Session Start Process

### Step 1: Get Session Context

Use the unified context script:

```bash
# Recommended: context + task conflict check in one command
python3 ./.trellis/scripts/session_bootstrap.py

# Optional: task flow guard only (status/dependency/completion consistency)
python3 ./.trellis/scripts/task_flow_guard.py

# App/Web 模块与跨端口 import 静态校验（工作台若报「无导出」多为缓存，先跑此脚本再强刷）
python3 ./.trellis/scripts/verify_runtime_auth_exports.py
python3 ./.trellis/scripts/verify_two_entry_runtime.py

# Optional: generate next-session handoff package
python3 ./.trellis/scripts/session_finalize.py

# Optional: product-manager gap review for current task
python3 ./.trellis/scripts/pm_review_check.py --task <task-id>

# Get all context in one command
python3 ./.trellis/scripts/get_context.py

# Or get JSON format
python3 ./.trellis/scripts/get_context.py --json
```

### Step 2: Read Development Guidelines [!] REQUIRED

**[!] CRITICAL: MUST read guidelines before writing any code**

Based on what you'll develop, read the corresponding guidelines:

**Frontend Development** (if applicable):
```bash
# Read index first, then specific docs based on task
cat .trellis/spec/frontend/index.md
```

**Backend Development** (if applicable):
```bash
# Read index first, then specific docs based on task
cat .trellis/spec/backend/index.md
```

**Cross-Layer Features**:
```bash
# For features spanning multiple layers
cat .trellis/spec/guides/cross-layer-thinking-guide.md
```

### Step 3: Select Task to Develop

Use the task management script:

```bash
# List active tasks
python3 ./.trellis/scripts/task.py list

# Create new task (creates directory with task.json)
python3 ./.trellis/scripts/task.py create "<title>" --slug <task-name>
```

---

## Development Process

### Task Development Flow

```
1. Create or select task
   --> python3 ./.trellis/scripts/task.py create "<title>" --slug <name> or list

2. Write code according to guidelines
   --> Read .trellis/spec/ docs relevant to your task
   --> For cross-layer: read .trellis/spec/guides/

3. Self-test
   --> Run project's lint/test commands (see spec docs)
   --> Manual feature testing

4. Commit code
   --> git add <files>
   --> git commit -m "type(scope): description"
       Format: feat/fix/docs/refactor/test/chore

5. Record session (one command)
   --> python3 ./.trellis/scripts/add_session.py --title "Title" --commit "hash"
```

### Code Quality Checklist

**Must pass before commit**:
- [OK] Lint checks pass (project-specific command)
- [OK] Type checks pass (if applicable)
- [OK] Manual feature testing passes

**Project-specific checks**:
- See `.trellis/spec/frontend/quality-guidelines.md` for frontend
- See `.trellis/spec/backend/quality-guidelines.md` for backend

---

## Session End

### One-Click Session Recording

After code is committed, use:

```bash
python3 ./.trellis/scripts/add_session.py \
  --title "Session Title" \
  --commit "abc1234" \
  --summary "Brief summary"
```

This automatically:
1. Detects current journal file
2. Creates new file if 2000-line limit exceeded
3. Appends session content
4. Updates index.md (sessions count, history table)

### Pre-end Checklist

Use `/trellis:finish-work` command to run through:
1. [OK] All code committed, commit message follows convention
2. [OK] Session recorded via `add_session.py`
3. [OK] No lint/test errors
4. [OK] Working directory clean (or WIP noted)
5. [OK] Spec docs updated if needed

---

## Parallel multi-agent (optional)

Use this when you run **three coding agents** (A / B / dev C on the third worktree; scripts may call it `integrate`) plus **integrator on the main-repo checkout** (merge, full test, release).

### Isolation

- Prefer **one git worktree per agent** (separate Cursor windows). Each worktree has its own `.trellis/.current-task` (gitignored), so `auto_test_runner.py` and `pm_review_check.py` resolve the correct task per tree.
- **Integrator** should use the **main-repo checkout** (the single worktree that holds local branch `main`) for `git merge` / `rebase` and for `session_finalize.py` (optional commit/push), so git state is not contested with active dev worktrees.

### Roles

| Role | Typical tasks | Scripts |
|------|------------------|---------|
| Dev A / B | Implement feature branches; run task-specific smoke tests | `session_bootstrap.py`, `auto_test_runner.py`, `task.py` as needed |
| Integrator | Merge in agreed order; resolve conflicts; run full checks | `task_conflict_check.py`, `pm_review_check.py` (after merge), `pm_review_check.py --task <id>` if needed, `auto_test_runner.py` with `.current-task` set to integration target, `session_finalize.py` |

### Git：`main` 归属（本仓库多窗口硬规则）

- **仅主仓上的集成职责**（常与调度同一会话）可对 `origin/main` 执行 `git push`（合并验证通过后）。**辅树开发窗口** **禁止** `git push origin main`。
- **开发窗口**推自己的分支，例如 `feat/task-39-next-card`，并 **开 PR**；集成在**主仓** `merge` / `cherry-pick` 并解决冲突后，再推 `main`。
- **`main` 检出唯一性（Git worktree）**：同一仓库内 **只有一个 worktree 能持有本地分支 `main`**。辅 worktree（如 `wt-04` / `wt-17` / `wt-integrate`）**不要**执行 `git checkout main`；对齐 `origin/main` 请用 `git switch --detach origin/main`，或 `git switch -c feat/<topic> origin/main`。
- **调度与合并验收可合并到「主仓协调器」会话**：**merge / push `main` 只在主仓目录** 完成。第三辅树 **`wt-integrate` / 总线角色 `integrate` = 开发 C**（编码与 `feat`+PR），**不是**「唯一能写 main 的树」。
- 跨会话不依赖聊天记忆：**以本段 + 根目录 `AGENTS.md` 中「Git 与多窗口」为准**；新会话先读 `AGENTS.md` 再写代码。

### `config.yaml` lifecycle hooks vs parallel agents

Hooks in `.trellis/config.yaml` (`after_create`, `after_start`, `after_finish`) run only when **`task.py`** runs the corresponding lifecycle (`create` / `start` / `finish`). They execute:

- `task_conflict_check.py` — **read-only** scan of `tasks/*.json`; safe for parallel worktrees.
- `pm_review_check.py` — reads **this worktree’s** `.trellis/.current-task` unless you pass `--task`; safe per worktree.

They do **not** run automatically on every file save; no extra conflict beyond normal git merge.

### Automation scripts: conflict risk

| Script | Risk | Why |
|--------|------|-----|
| `task_conflict_check.py` | Low | Reads task JSON; no writes. |
| `pm_review_check.py` | Low | Reads files; optional `--task` overrides `.current-task`. |
| `session_bootstrap.py` | Low | Runs read-only checks + conflict check + task flow guard. |
| `task_flow_guard.py` | Low | Checks task status/dependency/completion consistency; no writes. |
| `auto_test_runner.py` | Low | Uses local `.current-task`; each worktree should set its own. |
| `get_context.py` | Low | Reads git + journal paths; no writes. |
| `add_session.py` | **High** | Appends journal and rewrites `workspace/<dev>/index.md` — **serialize** (one agent at a time) or **integrator-only** after merge. |
| `session_finalize.py` | **High** | Optional `git add -A` / commit / push — **integrator-only** or one session at a time. |
| `multi_agent/start.py` | **Medium** | Writes `registry.json` and creates worktrees — avoid concurrent `registry_add_agent` from two processes; prefer one launcher or stagger starts. |

### Optional optimizations (later)

- Add **file locking or atomic replace** for `registry.json` if multiple `multi_agent/start.py` runs become common.
- Teach `auto_test_runner.py` / CI to accept **`--task`** explicitly (currently driven by `.current-task`) for integration runs without touching the pointer file.

---

## File Descriptions

### 1. workspace/ - Developer Workspaces

**Purpose**: Record each AI Agent session's work content

**Structure** (Multi-developer support):
```
workspace/
|-- index.md              # Main index (Active Developers table)
+-- {developer}/          # Per-developer directory
    |-- index.md          # Personal index (with @@@auto markers)
    +-- journal-N.md      # Journal files (sequential: 1, 2, 3...)
```

**When to update**:
- [OK] End of each session
- [OK] Complete important task
- [OK] Fix important bug

### 2. spec/ - Development Guidelines

**Purpose**: Documented standards for consistent development

**Structure** (Multi-doc format):
```
spec/
|-- frontend/           # Frontend docs (if applicable)
|   |-- index.md        # Start here
|   +-- *.md            # Topic-specific docs
|-- backend/            # Backend docs (if applicable)
|   |-- index.md        # Start here
|   +-- *.md            # Topic-specific docs
+-- guides/             # Thinking guides
    |-- index.md        # Start here
    +-- *.md            # Guide-specific docs
```

**When to update**:
- [OK] New pattern discovered
- [OK] Bug fixed that reveals missing guidance
- [OK] New convention established

### 3. Tasks - Task Tracking

Each task is a directory containing `task.json`:

```
tasks/
|-- 01-21-my-task/
|   +-- task.json
+-- archive/
    +-- 2026-01/
        +-- 01-15-old-task/
            +-- task.json
```

**Commands**:
```bash
python3 ./.trellis/scripts/task.py create "<title>" [--slug <name>]   # Create task directory
python3 ./.trellis/scripts/task.py archive <name>  # Archive to archive/{year-month}/
python3 ./.trellis/scripts/task.py list            # List active tasks
python3 ./.trellis/scripts/task.py list-archive    # List archived tasks
```

---

## Best Practices

### [OK] DO - Should Do

1. **Before session start**:
   - Run `python3 ./.trellis/scripts/get_context.py` for full context
   - [!] **MUST read** relevant `.trellis/spec/` docs

2. **During development**:
   - [!] **Follow** `.trellis/spec/` guidelines
   - For cross-layer features, use `/trellis:check-cross-layer`
   - Develop one task per session **unless** you use [parallel multi-agent](#parallel-multi-agent-optional) (worktrees + clear ownership).
   - Run lint and tests frequently
   - **Workbench home (`workbench.html` / `workbench-client.js`)**: any commit that changes these files **must** include an edit to `REQUIREMENTS_01_COVERAGE.md` in the **same** diff (see `AGENTS.md` + `verify_workbench_coverage_touch.py`). Use an explicit `N/A` rationale only when truly no doc delta, and get coordinator sign-off.

3. **After development complete**:
   - Use `/trellis:finish-work` for completion checklist
   - After fix bug, use `/trellis:break-loop` for deep analysis
   - **Coding agents**: commit on **`feat/*`** branches, **`git push origin feat/...`**, open a PR to `main`; **never** `git push origin main`.
   - **Integrator** (usually **main-repo** session): merge PRs / resolve conflicts, then push `main`; may use `session_finalize.py --commit-message "..."` (optionally `--push`) for integration-only commits after checks pass.
   - Use `add_session.py` to record progress

### [X] DON'T - Should Not Do

1. [!] **Don't** skip reading `.trellis/spec/` guidelines
2. [!] **Don't** let journal single file exceed 2000 lines
3. **Don't** develop multiple unrelated tasks **in the same working tree** without coordination (use worktrees + [Parallel multi-agent](#parallel-multi-agent-optional) if you need parallelism)
4. **Don't** commit code with lint/test errors
5. **Don't** forget to update spec docs after learning something
6. [!] **Don't** `git push origin main` from a **coding** worktree; **integrator** (main repo) merges PRs and may use `session_finalize.py --commit-message` after checks pass (see [Parallel multi-agent](#parallel-multi-agent-optional))

---

## Quick Reference

### Must-read Before Development

| Task Type | Must-read Document |
|-----------|-------------------|
| Frontend work | `frontend/index.md` → relevant docs |
| Backend work | `backend/index.md` → relevant docs |
| Cross-Layer Feature | `guides/cross-layer-thinking-guide.md` |

### Commit Convention

```bash
git commit -m "type(scope): description"
```

**Type**: feat, fix, docs, refactor, test, chore
**Scope**: Module name (e.g., auth, api, ui)

### Common Commands

```bash
# Session management
python3 ./.trellis/scripts/get_context.py    # Get full context
python3 ./.trellis/scripts/add_session.py    # Record session

# Task management
python3 ./.trellis/scripts/task.py list      # List tasks
python3 ./.trellis/scripts/task.py create "<title>" # Create task

# Slash commands
/trellis:finish-work          # Pre-commit checklist
/trellis:break-loop           # Post-debug analysis
/trellis:check-cross-layer    # Cross-layer verification
```

---

## Summary

Following this workflow ensures:
- [OK] Continuity across multiple sessions
- [OK] Consistent code quality
- [OK] Trackable progress
- [OK] Knowledge accumulation in spec docs
- [OK] Transparent team collaboration

**Core Philosophy**: Read before write, follow standards, record promptly, capture learnings
