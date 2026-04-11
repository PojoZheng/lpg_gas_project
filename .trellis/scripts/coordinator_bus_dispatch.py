#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import uuid
from pathlib import Path

from bus_common import get_bus_dir, read_json, repo_root_from_script, utc_now, write_json_atomic


ROLES = ('dev-a', 'dev-b', 'integrate')


def _post_one(bus_dir: Path, role: str, task_path: str, note: str, round_id: str) -> str:
    cmd_id = str(uuid.uuid4())
    payload = {
        'id': cmd_id,
        'created_at': utc_now(),
        'round_id': round_id,
        'type': 'switch_task',
        'role': role,
        'task_path': task_path,
        'note': note,
    }
    p = bus_dir / 'inbox' / f'{role}.json'
    write_json_atomic(p, payload)
    return cmd_id


def _task_label(repo: Path, task_path: str) -> str:
    p = repo / task_path / "task.json"
    if not p.exists():
        return task_path
    try:
        raw = json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return task_path
    tid = raw.get("id") or Path(task_path).name
    title = raw.get("title", "")
    return f"{tid} ({title})" if title else str(tid)


def _print_kickoff(repo: Path, dev_a_task: str, dev_b_task: str, integrate_task: str) -> None:
    a_label = _task_label(repo, dev_a_task)
    b_label = _task_label(repo, dev_b_task)
    i_label = _task_label(repo, integrate_task)
    print("\n=== COPY FOR CHAT WINDOWS ===")
    print(f"[开发A] 已下发任务 {a_label}。请按当前 .trellis/.current-task 连续实现 acceptance；**commit + `git push origin feat/...` + 开 PR**；完成后回报 PR 链接或 commit hash。")
    print(f"[开发B] 已下发任务 {b_label}。请按当前 .trellis/.current-task 连续实现 acceptance；**commit + `git push origin feat/...` + 开 PR**；完成后回报 PR 链接或 commit hash。")
    print(f"[开发C/integrate] 已下发任务 {i_label}。请按当前 .trellis/.current-task 连续实现 acceptance；**commit + `git push origin feat/...` + 开 PR**；完成后回报 PR 链接或 commit hash。（合并 `main` 由主仓会话处理，本树**禁止** `push origin main`）。")
    print("=== END COPY ===")


def main() -> int:
    parser = argparse.ArgumentParser(
        description='Dispatch tasks to bus inbox: dev-a, dev-b, integrate (= dev C third worktree).'
    )
    parser.add_argument('--dev-a-task', required=True)
    parser.add_argument('--dev-b-task', required=True)
    parser.add_argument('--integrate-task', required=True)
    parser.add_argument('--round-id', default='')
    parser.add_argument('--note', default='')
    parser.add_argument('--notify', action='store_true')
    parser.add_argument('--no-kickoff', action='store_true', help='Do not print chat-ready kickoff lines.')
    args = parser.parse_args()

    repo = repo_root_from_script()
    bus = get_bus_dir(repo)
    round_id = args.round_id or utc_now().replace(':','').replace('-','')

    a = _post_one(bus, 'dev-a', args.dev_a_task, args.note, round_id)
    b = _post_one(bus, 'dev-b', args.dev_b_task, args.note, round_id)
    i = _post_one(bus, 'integrate', args.integrate_task, args.note, round_id)

    print(f'[bus] dir: {bus}')
    print(f'[bus] round: {round_id}')
    print(f'[bus] dev-a -> {args.dev_a_task} ({a})')
    print(f'[bus] dev-b -> {args.dev_b_task} ({b})')
    print(f'[bus] integrate -> {args.integrate_task} ({i})')
    if not args.no_kickoff:
        _print_kickoff(repo, args.dev_a_task, args.dev_b_task, args.integrate_task)

    if args.notify:
      notify_script = repo / '.trellis' / 'scripts' / 'notify_local.py'
      body = f'下发完成: A={args.dev_a_task}, B={args.dev_b_task}, I={args.integrate_task}'
      subprocess.run([sys.executable, str(notify_script), '--title', 'Trellis Bus', '--body', body], check=False)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
