#!/usr/bin/env python3
from __future__ import annotations

import argparse
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


def main() -> int:
    parser = argparse.ArgumentParser(description='Dispatch tasks to local bus inbox for dev-a/dev-b/integrate')
    parser.add_argument('--dev-a-task', required=True)
    parser.add_argument('--dev-b-task', required=True)
    parser.add_argument('--integrate-task', required=True)
    parser.add_argument('--round-id', default='')
    parser.add_argument('--note', default='')
    parser.add_argument('--notify', action='store_true')
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

    if args.notify:
      notify_script = repo / '.trellis' / 'scripts' / 'notify_local.py'
      body = f'下发完成: A={args.dev_a_task}, B={args.dev_b_task}, I={args.integrate_task}'
      subprocess.run([sys.executable, str(notify_script), '--title', 'Trellis Bus', '--body', body], check=False)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
