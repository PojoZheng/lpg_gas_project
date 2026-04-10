#!/usr/bin/env python3
"""
Model-agnostic session bootstrap script.

Usage:
  python3 ./.trellis/scripts/session_bootstrap.py
  python3 ./.trellis/scripts/session_bootstrap.py --json
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SCRIPT_DIR = Path(__file__).resolve().parent


def run_cmd(cmd: list[str]) -> tuple[int, str, str]:
    result = subprocess.run(
        cmd,
        cwd=ROOT,
        text=True,
        capture_output=True,
        encoding="utf-8",
        errors="replace",
    )
    return result.returncode, result.stdout.strip(), result.stderr.strip()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--json", action="store_true", help="Output JSON format")
    args = parser.parse_args()

    context_cmd = [sys.executable, str(SCRIPT_DIR / "get_context.py")]
    check_cmd = [sys.executable, str(SCRIPT_DIR / "task_conflict_check.py")]
    flow_guard_cmd = [sys.executable, str(SCRIPT_DIR / "task_flow_guard.py")]

    c_code, c_out, c_err = run_cmd(context_cmd)
    k_code, k_out, k_err = run_cmd(check_cmd)
    f_code, f_out, f_err = run_cmd(flow_guard_cmd)

    payload = {
        "context_ok": c_code == 0,
        "conflict_check_ok": k_code == 0,
        "context_output": c_out,
        "context_error": c_err,
        "conflict_check_output": k_out,
        "conflict_check_error": k_err,
        "flow_guard_ok": f_code == 0,
        "flow_guard_output": f_out,
        "flow_guard_error": f_err,
    }

    if args.json:
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        return 0 if c_code == 0 and k_code == 0 and f_code == 0 else 1

    print("=== Session Bootstrap ===")
    print()
    print("[1/2] 当前上下文")
    print(c_out if c_out else "(无输出)")
    if c_err:
        print(f"[warn] get_context stderr: {c_err}")
    print()
    print("[2/3] 任务冲突检查")
    print(k_out if k_out else "(无输出)")
    if k_err:
        print(f"[warn] task_conflict_check stderr: {k_err}")
    print()
    print("[3/3] 任务流一致性检查")
    print(f_out if f_out else "(无输出)")
    if f_err:
        print(f"[warn] task_flow_guard stderr: {f_err}")
    print()

    if c_code == 0 and k_code == 0 and f_code == 0:
        print("Session bootstrap completed.")
        return 0

    print("Session bootstrap completed with warnings/errors.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
