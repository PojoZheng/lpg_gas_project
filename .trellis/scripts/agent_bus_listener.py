#!/usr/bin/env python3
from __future__ import annotations

import argparse
import subprocess
import sys
import time
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from bus_common import get_bus_dir, read_json, repo_root_from_script, utc_now, write_json_atomic
from common.paths import set_current_task


VALID_ROLES = {'dev-a', 'dev-b', 'integrate'}


def state_file(repo_root: Path, role: str) -> Path:
    return repo_root / '.trellis' / f'.bus-state-{role}.json'


def load_last_id(repo_root: Path, role: str) -> str:
    return read_json(state_file(repo_root, role)).get('last_id', '')


def save_last_id(repo_root: Path, role: str, cmd_id: str) -> None:
    write_json_atomic(state_file(repo_root, role), {'last_id': cmd_id, 'updated_at': utc_now()})


def post_ack(bus_dir: Path, role: str, cmd: dict, ok: bool, message: str) -> None:
    payload = {
        'ack_at': utc_now(),
        'role': role,
        'command_id': cmd.get('id', ''),
        'round_id': cmd.get('round_id', ''),
        'ok': ok,
        'message': message,
        'task_path': cmd.get('task_path', ''),
    }
    write_json_atomic(bus_dir / 'acks' / f'{role}.json', payload)


def run_once(role: str, run_bootstrap: bool) -> int:
    repo = repo_root_from_script()
    bus = get_bus_dir(repo)
    cmd_path = bus / 'inbox' / f'{role}.json'
    cmd = read_json(cmd_path)
    if not cmd:
        print(f'[listener] {role}: no command')
        return 0
    cmd_id = cmd.get('id', '')
    if not cmd_id:
        print(f'[listener] {role}: invalid command payload')
        return 1

    if cmd_id == load_last_id(repo, role):
        print(f'[listener] {role}: already handled {cmd_id}')
        return 0

    task_path = cmd.get('task_path', '').strip()
    if not task_path:
        post_ack(bus, role, cmd, False, 'empty task_path')
        save_last_id(repo, role, cmd_id)
        return 1

    ok = set_current_task(task_path, repo_root=repo)
    if not ok:
        post_ack(bus, role, cmd, False, f'failed to set current-task: {task_path}')
        save_last_id(repo, role, cmd_id)
        return 1

    msg = f'set .current-task -> {task_path}'
    print(f'[listener] {role}: {msg}')

    if run_bootstrap:
        bootstrap = repo / '.trellis' / 'scripts' / 'session_bootstrap.py'
        r = subprocess.run([sys.executable, str(bootstrap)], cwd=str(repo), text=True)
        if r.returncode != 0:
            post_ack(bus, role, cmd, False, f'bootstrap failed: {r.returncode}')
            save_last_id(repo, role, cmd_id)
            return r.returncode
        msg += '; bootstrap ok'

    post_ack(bus, role, cmd, True, msg)
    save_last_id(repo, role, cmd_id)
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description='Listen local bus command and switch .current-task')
    parser.add_argument('--role', required=True, choices=sorted(VALID_ROLES))
    parser.add_argument('--watch', action='store_true')
    parser.add_argument('--once', action='store_true')
    parser.add_argument('--interval', type=float, default=3.0)
    parser.add_argument('--run-bootstrap', action='store_true')
    args = parser.parse_args()

    if not args.watch and not args.once:
        print('use --once or --watch')
        return 2

    if args.once:
        return run_once(args.role, args.run_bootstrap)

    while True:
        code = run_once(args.role, args.run_bootstrap)
        if code not in (0,):
            print(f'[listener] {args.role}: run_once failed code={code}')
        time.sleep(max(args.interval, 1.0))


if __name__ == '__main__':
    raise SystemExit(main())
