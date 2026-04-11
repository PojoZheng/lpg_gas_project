#!/usr/bin/env python3
"""
Suggest the next main-chain task(s) from task.json depends_on + status.

Order of the main chain must stay aligned with `.trellis/tasks/feature-task-map.md`.
This script does not parse the markdown graph; it trusts each task's `depends_on`.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Dict, List, Set


ROOT = Path(__file__).resolve().parents[2]
TASKS_DIR = ROOT / ".trellis" / "tasks"


# Product main line (01–11). Keep in sync with feature-task-map.md narrative order.
MAIN_CHAIN_IDS: List[str] = [
    "01-auth-session",
    "02-workbench-aggregation",
    "03-quick-order",
    "04-delivery-to-complete",
    "05-inventory-lock-revert",
    "06-customer-account-linkage",
    "07-safety-trigger-report",
    "08-finance-posting-daily-close",
    "09-sync-queue-conflict",
    "10-platform-policy-release",
    "11-platform-monitor-compliance",
]

MAIN_CHAIN_SET: Set[str] = set(MAIN_CHAIN_IDS)


def parse_number(task_id: str) -> int:
    m = re.match(r"^(\d+)-", task_id)
    return int(m.group(1)) if m else 999


def load_tasks() -> Dict[str, dict]:
    out: Dict[str, dict] = {}
    for path in sorted(TASKS_DIR.glob("*/task.json")):
        raw = json.loads(path.read_text(encoding="utf-8"))
        tid = raw.get("id", "")
        folder = path.parent.name
        if tid and tid == folder:
            out[tid] = raw
    return out


def is_done(raw: dict) -> bool:
    return raw.get("status", "") in ("completed", "done")


def deps_satisfied(tid: str, tasks: Dict[str, dict]) -> bool:
    t = tasks.get(tid)
    if not t:
        return False
    for dep in t.get("depends_on", []):
        d = tasks.get(dep)
        if not d or not is_done(d):
            return False
    return True


def blocking_deps(tid: str, tasks: Dict[str, dict]) -> List[str]:
    t = tasks.get(tid)
    if not t:
        return []
    blocked: List[str] = []
    for dep in t.get("depends_on", []):
        d = tasks.get(dep)
        if not d or not is_done(d):
            blocked.append(dep)
    return blocked


def rel_task_path(folder_name: str) -> str:
    return f".trellis/tasks/{folder_name}"


def classify(tid: str) -> str:
    if tid in MAIN_CHAIN_SET:
        return "main"
    n = parse_number(tid)
    if n == 0:
        return "meta"
    if 12 <= n <= 17:
        return "side"
    return "other"


def ready_todo_ids(tasks: Dict[str, dict]) -> List[str]:
    """All tasks with status=todo and depends_on fully completed, stable order."""
    out: List[str] = []
    for tid, raw in tasks.items():
        if raw.get("status", "") != "todo":
            continue
        if not deps_satisfied(tid, tasks):
            continue
        out.append(tid)
    out.sort(key=lambda x: (parse_number(x), x))
    return out


def analyze(tasks: Dict[str, dict]) -> dict:
    ready_main: List[str] = []
    for tid in MAIN_CHAIN_IDS:
        raw = tasks.get(tid)
        if not raw:
            continue
        if is_done(raw):
            continue
        if deps_satisfied(tid, tasks):
            ready_main.append(tid)

    first_incomplete_main: str | None = None
    first_blockers: List[str] = []
    for tid in MAIN_CHAIN_IDS:
        raw = tasks.get(tid)
        if not raw or is_done(raw):
            continue
        first_incomplete_main = tid
        first_blockers = blocking_deps(tid, tasks)
        break

    recommended: str | None = ready_main[0] if ready_main else None

    ready_side: List[str] = []
    for tid, raw in sorted(tasks.items(), key=lambda x: parse_number(x[0])):
        if classify(tid) != "side":
            continue
        if is_done(raw):
            continue
        if deps_satisfied(tid, tasks):
            ready_side.append(tid)

    core_open = [tid for tid, raw in tasks.items() if 3 <= parse_number(tid) <= 4 and not is_done(raw)]

    ready_todos = ready_todo_ids(tasks)
    suggested_next_todo = ready_todos[0] if ready_todos else None

    return {
        "recommended_main_next": recommended,
        "ready_main_parallel": ready_main,
        "first_incomplete_main": first_incomplete_main,
        "first_incomplete_main_blockers": first_blockers,
        "ready_side_parallel": ready_side,
        "core_chain_open_ids": sorted(core_open),
        "ready_todos": ready_todos,
        "suggested_next_todo": suggested_next_todo,
        "notes": (
            "recommended_main_next 取 ready_main_parallel 中在主链顺序里的第一个；"
            "并行开发请从 ready_main_parallel 拆给 A/B。"
            "suggested_next_todo 为全库 status=todo 且依赖已满足者中编号最小的一个。"
        ),
    }


def print_human(payload: dict, tasks: Dict[str, dict]) -> None:
    rec = payload["recommended_main_next"]
    ready = payload["ready_main_parallel"]
    first = payload["first_incomplete_main"]
    blockers = payload["first_incomplete_main_blockers"]
    next_todo = payload.get("suggested_next_todo")
    ready_todos = payload.get("ready_todos") or []

    print("[suggest-next-task] 全库 todo（status=todo 且 depends_on 已全部完成）")
    if next_todo:
        t = tasks[next_todo]
        print(f"  建议下一 todo: {next_todo} — {t.get('title', t.get('name', ''))}")
        print(f"  目录: {rel_task_path(next_todo)}")
        if len(ready_todos) > 1:
            print(f"  同条件可选项（共 {len(ready_todos)} 个）: {', '.join(ready_todos[:8])}{'…' if len(ready_todos) > 8 else ''}")
    else:
        print("  建议下一 todo: (无 — 没有依赖已满足的 todo，或任务数据缺失)")

    print("[suggest-next-task] 主链（按 feature-task-map 顺序，依赖来自各 task.json）")
    if rec:
        t = tasks[rec]
        print(f"  建议下一任务: {rec} — {t.get('title', '')}")
        print(f"  目录: {rel_task_path(rec)}")
    else:
        print("  建议下一任务: (无 — 主链无已解锁的待办或数据缺失)")

    if first and blockers:
        print(f"  主链首个未完成: {first}，仍被依赖阻塞: {', '.join(blockers)}")

    if ready:
        print("  当前可并行启动的主链子任务（依赖已满足）:")
        for tid in ready:
            print(f"    - {tid} — {tasks[tid].get('title', '')}  ->  {rel_task_path(tid)}")

    side = payload["ready_side_parallel"]
    if side:
        print("  非主链已解锁（可选）:")
        for tid in side:
            print(f"    - {tid} — {tasks[tid].get('title', '')}  ->  {rel_task_path(tid)}")

    core = payload["core_chain_open_ids"]
    if core:
        print(f"  [与 task_conflict_check 对齐] 核心 03–04 仍有未完成: {', '.join(core)}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Suggest next Trellis tasks from task.json graph.")
    parser.add_argument("--json", action="store_true", help="Print JSON only.")
    args = parser.parse_args()

    tasks = load_tasks()
    if not tasks:
        print("[suggest-next-task] 未加载到任务", file=sys.stderr)
        return 1

    payload = analyze(tasks)

    if args.json:
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        return 0

    print_human(payload, tasks)
    return 0


if __name__ == "__main__":
    sys.exit(main())
