#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path

from bus_common import get_bus_dir, repo_root_from_script, utc_now, write_json_atomic


VALID_ROLES = {'dev-a', 'dev-b', 'integrate'}  # integrate = dev C (third worktree)


def main() -> int:
    p = argparse.ArgumentParser(description='Post lightweight completion report to local bus')
    p.add_argument('--role', required=True, choices=sorted(VALID_ROLES))
    p.add_argument('--status', required=True, choices=['in_progress','done','blocked'])
    p.add_argument('--task', required=True)
    p.add_argument('--summary', default='')
    p.add_argument('--commit', default='')
    p.add_argument('--url', default='')
    args = p.parse_args()

    repo = repo_root_from_script()
    bus = get_bus_dir(repo)
    payload = {
        'reported_at': utc_now(),
        'role': args.role,
        'status': args.status,
        'task': args.task,
        'summary': args.summary,
        'commit': args.commit,
        'url': args.url,
    }
    write_json_atomic(bus / 'reports' / f'{args.role}.json', payload)
    print(f'[report] {args.role} -> {bus / "reports" / f"{args.role}.json"}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
