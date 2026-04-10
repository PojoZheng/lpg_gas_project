#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List


ROOT = Path(__file__).resolve().parents[2]
TASKS_DIR = ROOT / ".trellis" / "tasks"


@dataclass
class Task:
    task_id: str
    folder: str
    status: str
    depends_on: List[str]
    task_json_path: Path
    completion_path: Path


def parse_number(task_id: str) -> int:
    m = re.match(r"^(\d+)-", task_id)
    if not m:
        return 999
    return int(m.group(1))


def load_tasks() -> Dict[str, Task]:
    tasks: Dict[str, Task] = {}
    for path in sorted(TASKS_DIR.glob("*/task.json")):
        raw = json.loads(path.read_text(encoding="utf-8"))
        task_id = raw.get("id", "")
        if not task_id:
            continue
        tasks[task_id] = Task(
            task_id=task_id,
            folder=path.parent.name,
            status=raw.get("status", ""),
            depends_on=list(raw.get("depends_on", [])),
            task_json_path=path,
            completion_path=path.parent / "completion.md",
        )
    return tasks


def check(tasks: Dict[str, Task]) -> tuple[List[str], List[str]]:
    errors: List[str] = []
    warnings: List[str] = []

    completed_ids = {tid for tid, t in tasks.items() if t.status == "completed"}
    open_status = {"todo", "in_progress"}

    for tid, t in sorted(tasks.items(), key=lambda kv: parse_number(kv[0])):
        if t.task_id != t.folder:
            warnings.append(f"{tid}: 目录名与 id 不一致（{t.folder}）")

        if t.status == "completed":
            if not t.completion_path.exists():
                errors.append(f"{tid}: status=completed 但缺少 completion.md")
            for dep in t.depends_on:
                if dep not in tasks:
                    errors.append(f"{tid}: 依赖不存在 {dep}")
                elif dep not in completed_ids:
                    errors.append(f"{tid}: 依赖 {dep} 未完成，但本任务标记为 completed")

        if t.status in open_status and t.completion_path.exists():
            warnings.append(f"{tid}: 状态为 {t.status}，但已存在 completion.md（可能状态漂移）")

    return errors, warnings


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate Trellis task flow consistency.")
    parser.add_argument("--json", action="store_true", help="Output JSON.")
    args = parser.parse_args()

    tasks = load_tasks()
    if not tasks:
        msg = "[task-flow-guard] 未找到 task.json"
        if args.json:
            print(json.dumps({"ok": False, "error": msg}, ensure_ascii=False, indent=2))
        else:
            print(msg)
        return 1

    errors, warnings = check(tasks)
    ok = len(errors) == 0

    payload = {
        "ok": ok,
        "task_count": len(tasks),
        "error_count": len(errors),
        "warning_count": len(warnings),
        "errors": errors,
        "warnings": warnings,
    }

    if args.json:
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        return 0 if ok else 1

    print("[task-flow-guard] 扫描完成")
    print(f"[task-flow-guard] 任务数: {len(tasks)}")
    print(f"[task-flow-guard] 警告: {len(warnings)}")
    for w in warnings:
        print(f"  - {w}")
    print(f"[task-flow-guard] 错误: {len(errors)}")
    for e in errors:
        print(f"  - {e}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
