#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

from bus_common import get_bus_dir, read_json, repo_root_from_script


def _print(name: str, payload: dict) -> None:
    print(f'## {name}')
    if not payload:
        print("(empty)\n")
        return
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    print("")


def main() -> int:
    repo = repo_root_from_script()
    bus = get_bus_dir(repo)
    print(f"[bus] {bus}\n")
    for role in ('dev-a','dev-b','integrate'):
        _print(f'ack/{role}', read_json(bus/'acks'/f'{role}.json'))
    for role in ('dev-a','dev-b','integrate'):
        _print(f'report/{role}', read_json(bus/'reports'/f'{role}.json'))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
