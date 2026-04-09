#!/usr/bin/env python3
"""
Coordinator broadcast: format one-liners for dev A/B + integrator, optionally write .current-task.

Typical env (see setup_parallel_worktrees.example.sh):
  TRELLIS_WT_DEV_A, TRELLIS_WT_DEV_B, TRELLIS_WT_INTEGRATE — absolute paths to worktree roots.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path


_SCRIPTS = Path(__file__).resolve().parent
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))

from common.paths import set_current_task


def parse_number(task_id: str) -> int:
    m = re.match(r"^(\d+)-", task_id)
    return int(m.group(1)) if m else 999


def load_task_meta(repo_root: Path, task_rel: str) -> dict:
    p = repo_root / task_rel / "task.json"
    if not p.is_file():
        return {}
    return json.loads(p.read_text(encoding="utf-8"))


def blocks_main_chain_hint(task_id: str, status: str) -> str:
    if status in ("completed", "done"):
        return "否"
    n = parse_number(task_id)
    if n <= 4:
        return "是"
    if n <= 11:
        return "主链子任务"
    return "否（支线）"


def priority_label(task_id: str) -> str:
    n = parse_number(task_id)
    return "P1" if n <= 6 else "P2"


def one_liner(
    role: str,
    task_rel: str,
    task_id: str,
    title: str,
    priority: str,
    blocks: str,
    goals: str,
) -> str:
    return (
        f"[{role}] 任务 {task_id} ({title}) | {priority} | 阻塞主链相关: {blocks} | {goals} | 目录 {task_rel}"
    )


def emit(args: argparse.Namespace) -> int:
    repo = Path(args.repo_root).resolve()
    da = args.dev_a_task.strip()
    db = args.dev_b_task.strip()
    it = args.integrate_task.strip()

    meta_a = load_task_meta(repo, da)
    meta_b = load_task_meta(repo, db)
    meta_i = load_task_meta(repo, it)

    id_a = meta_a.get("id") or Path(da).name
    id_b = meta_b.get("id") or Path(db).name
    id_i = meta_i.get("id") or Path(it).name

    title_a = meta_a.get("title", "")
    title_b = meta_b.get("title", "")
    title_i = meta_i.get("title", "")

    st_a = meta_a.get("status", "unknown")
    st_b = meta_b.get("status", "unknown")
    st_i = meta_i.get("status", "unknown")

    acc_a = meta_a.get("acceptance") or []
    acc_b = meta_b.get("acceptance") or []
    goal_a = acc_a[0] if acc_a else "完成本轮验收项"
    goal_b = acc_b[0] if acc_b else "完成本轮验收项"
    goal_i = "合并后 bash ./.trellis/scripts/start_local_preview.sh，再给出可点击验收 URL"

    lines = [
        "=== 协调器广播（粘贴到各窗口首条或接力消息）===",
        one_liner(
            "开发A",
            da,
            id_a,
            title_a,
            priority_label(id_a),
            blocks_main_chain_hint(id_a, st_a),
            f"本轮目标: {goal_a}",
        ),
        one_liner(
            "开发B",
            db,
            id_b,
            title_b,
            priority_label(id_b),
            blocks_main_chain_hint(id_b, st_b),
            f"本轮目标: {goal_b}",
        ),
        one_liner(
            "集成",
            it,
            id_i,
            title_i,
            "P1",
            blocks_main_chain_hint(id_i, st_i),
            goal_i,
        ),
        "=== 以上 ===",
    ]
    text = "\n".join(lines) + "\n"
    print(text, end="")

    wt_a = args.write_dev_a or os.environ.get("TRELLIS_WT_DEV_A", "").strip()
    wt_b = args.write_dev_b or os.environ.get("TRELLIS_WT_DEV_B", "").strip()
    wt_i = args.write_integrate or os.environ.get("TRELLIS_WT_INTEGRATE", "").strip()

    if wt_a:
        root = Path(wt_a).resolve()
        if set_current_task(da, repo_root=root):
            print(f"[ok] {root}/.trellis/.current-task -> {da}", file=sys.stderr)
        else:
            print(f"[err] 无法写入 {root} 的 .current-task（路径是否存在？）", file=sys.stderr)
            return 1
    if wt_b:
        root = Path(wt_b).resolve()
        if set_current_task(db, repo_root=root):
            print(f"[ok] {root}/.trellis/.current-task -> {db}", file=sys.stderr)
        else:
            print(f"[err] 无法写入 {root} 的 .current-task", file=sys.stderr)
            return 1
    if wt_i:
        root = Path(wt_i).resolve()
        if set_current_task(it, repo_root=root):
            print(f"[ok] {root}/.trellis/.current-task -> {it}", file=sys.stderr)
        else:
            print(f"[err] 无法写入 {root} 的 .current-task", file=sys.stderr)
            return 1

    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Coordinator broadcast lines + optional .current-task writes.")
    parser.add_argument(
        "--repo-root",
        default=".",
        help="Repository root containing .trellis/tasks (default: cwd).",
    )
    parser.add_argument("--dev-a-task", required=True, help="Relative path e.g. .trellis/tasks/05-...")
    parser.add_argument("--dev-b-task", required=True)
    parser.add_argument("--integrate-task", required=True)
    parser.add_argument("--write-dev-a", default="", help="Absolute path to dev A worktree root.")
    parser.add_argument("--write-dev-b", default="", help="Absolute path to dev B worktree root.")
    parser.add_argument("--write-integrate", default="", help="Absolute path to integrator worktree root.")
    args = parser.parse_args()
    return emit(args)


if __name__ == "__main__":
    sys.exit(main())
