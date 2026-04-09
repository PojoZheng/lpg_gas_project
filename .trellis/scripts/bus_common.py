#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import subprocess
from datetime import datetime, timezone
from pathlib import Path


def repo_root_from_script() -> Path:
    return Path(__file__).resolve().parents[2]


def _repo_bus_key(repo_root: Path) -> str:
    """Return a stable key shared by all git worktrees.

    Worktrees have different folder names (e.g. wt-04, wt-17), so using
    repo_root.name would split the bus. We derive key from git common dir.
    """
    try:
        r = subprocess.run(
            ["git", "-C", str(repo_root), "rev-parse", "--git-common-dir"],
            text=True,
            capture_output=True,
            check=False,
        )
        common = r.stdout.strip()
        if common:
            common_path = Path(common)
            if not common_path.is_absolute():
                common_path = (repo_root / common_path).resolve()
            # common dir normally ends with ".git"; parent folder is repo name.
            if common_path.name == ".git":
                return common_path.parent.name
    except Exception:
        pass
    return repo_root.name


def default_bus_dir(repo_root: Path) -> Path:
    return Path.home() / ".trellis-bus" / _repo_bus_key(repo_root)


def get_bus_dir(repo_root: Path) -> Path:
    p = os.environ.get('TRELLIS_BUS_DIR', '').strip()
    return Path(p).expanduser().resolve() if p else default_bus_dir(repo_root)


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def ensure_dir(p: Path) -> None:
    p.mkdir(parents=True, exist_ok=True)


def write_json_atomic(path: Path, payload: dict) -> None:
    ensure_dir(path.parent)
    tmp = path.with_suffix(path.suffix + '.tmp')
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(path)


def read_json(path: Path) -> dict:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except Exception:
        return {}
