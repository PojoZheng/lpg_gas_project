#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Set, Tuple


ROOT = Path(__file__).resolve().parents[2]
TASKS_DIR = ROOT / ".trellis" / "tasks"
TASK_JSON_GLOB = "*/task.json"


@dataclass
class Task:
    task_id: str
    folder: str
    status: str
    depends_on: List[str]
    acceptance: List[str]
    input_spec: List[str]
    number: int


def normalize_text(text: str) -> str:
    text = text.strip().lower()
    text = re.sub(r"\s+", "", text)
    return text


def parse_number(task_id: str) -> int:
    m = re.match(r"^(\d+)-", task_id)
    if not m:
        return 999
    return int(m.group(1))


def load_tasks() -> Dict[str, Task]:
    tasks: Dict[str, Task] = {}
    for path in sorted(TASKS_DIR.glob(TASK_JSON_GLOB)):
        raw = json.loads(path.read_text(encoding="utf-8"))
        task_id = raw.get("id", "")
        folder = path.parent.name
        tasks[task_id] = Task(
            task_id=task_id,
            folder=folder,
            status=raw.get("status", ""),
            depends_on=raw.get("depends_on", []),
            acceptance=raw.get("acceptance", []),
            input_spec=raw.get("input_spec", []),
            number=parse_number(task_id),
        )
    return tasks


def has_path(a: str, b: str, graph: Dict[str, List[str]]) -> bool:
    stack = [a]
    seen: Set[str] = set()
    while stack:
        node = stack.pop()
        if node == b:
            return True
        if node in seen:
            continue
        seen.add(node)
        stack.extend(graph.get(node, []))
    return False


def detect_cycles(graph: Dict[str, List[str]]) -> List[List[str]]:
    WHITE, GRAY, BLACK = 0, 1, 2
    color: Dict[str, int] = {k: WHITE for k in graph}
    parent: Dict[str, str] = {}
    cycles: List[List[str]] = []

    def dfs(node: str) -> None:
        color[node] = GRAY
        for nxt in graph.get(node, []):
            if color.get(nxt, WHITE) == WHITE:
                parent[nxt] = node
                dfs(nxt)
            elif color.get(nxt) == GRAY:
                cycle = [nxt]
                cur = node
                while cur != nxt and cur in parent:
                    cycle.append(cur)
                    cur = parent[cur]
                cycle.append(nxt)
                cycle.reverse()
                cycles.append(cycle)
        color[node] = BLACK

    for node in graph:
        if color[node] == WHITE:
            dfs(node)
    return cycles


def main() -> int:
    tasks = load_tasks()
    errors: List[str] = []
    warnings: List[str] = []

    if not tasks:
        print("[task-conflict-check] 未发现任务配置")
        return 1

    for t in tasks.values():
        if t.task_id != t.folder:
            warnings.append(f"任务目录与 id 不一致：folder={t.folder} id={t.task_id}")

    graph: Dict[str, List[str]] = {tid: list(t.depends_on) for tid, t in tasks.items()}

    for tid, deps in graph.items():
        for dep in deps:
            if dep not in tasks:
                errors.append(f"{tid} 依赖不存在任务：{dep}")

    for cycle in detect_cycles(graph):
        errors.append("发现依赖环：" + " -> ".join(cycle))

    acceptance_map: Dict[str, List[str]] = {}
    for tid, t in tasks.items():
        for item in t.acceptance:
            key = normalize_text(item)
            acceptance_map.setdefault(key, []).append(tid)
    for text_key, owners in acceptance_map.items():
        uniq = sorted(set(owners))
        if len(uniq) > 1:
            warnings.append(f"验收项重复（可能范围冲突）：{', '.join(uniq)}")

    task_ids = sorted(tasks.keys(), key=lambda x: tasks[x].number)
    for i, tid_a in enumerate(task_ids):
        a = tasks[tid_a]
        set_a = set(a.input_spec)
        if not set_a:
            continue
        for tid_b in task_ids[i + 1 :]:
            b = tasks[tid_b]
            set_b = set(b.input_spec)
            if not set_b:
                continue
            inter = len(set_a & set_b)
            union = len(set_a | set_b)
            if union == 0:
                continue
            jaccard = inter / union
            if jaccard >= 0.67:
                linked = has_path(tid_a, tid_b, graph) or has_path(tid_b, tid_a, graph)
                if not linked:
                    warnings.append(
                        f"输入规范高度重叠但无依赖关系：{tid_a} <-> {tid_b} (重叠度 {jaccard:.2f})"
                    )

    core_chain_open = [
        tid for tid, t in tasks.items() if 3 <= t.number <= 4 and t.status != "completed"
    ]
    for tid, t in tasks.items():
        if t.number > 11 and t.status in {"todo", "in_progress"} and core_chain_open:
            warnings.append(
                f"{tid} 为非主链任务，当前主链未完成：{', '.join(sorted(core_chain_open))}"
            )

    print("[task-conflict-check] 扫描完成")
    print(f"[task-conflict-check] 任务数: {len(tasks)}")
    if warnings:
        print(f"[task-conflict-check] 警告: {len(warnings)}")
        for w in warnings:
            print(f"  - {w}")
    else:
        print("[task-conflict-check] 警告: 0")

    if errors:
        print(f"[task-conflict-check] 错误: {len(errors)}")
        for e in errors:
            print(f"  - {e}")
        return 1

    print("[task-conflict-check] 错误: 0")
    return 0


if __name__ == "__main__":
    sys.exit(main())
