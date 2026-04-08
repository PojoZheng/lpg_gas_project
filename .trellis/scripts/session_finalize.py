#!/usr/bin/env python3
"""
Model-agnostic session finalize script.

Usage:
  python3 ./.trellis/scripts/session_finalize.py
  python3 ./.trellis/scripts/session_finalize.py --json
  python3 ./.trellis/scripts/session_finalize.py --commit-message "chore: finalize session"
  python3 ./.trellis/scripts/session_finalize.py --commit-message "..." --push
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
TRELLIS = ROOT / ".trellis"


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


def read_current_task() -> str:
    p = TRELLIS / ".current-task"
    if not p.exists():
        return "(none)"
    raw = p.read_text(encoding="utf-8").strip()
    return raw if raw else "(none)"


def extract_top_risks(conflict_output: str, limit: int = 5) -> list[str]:
    lines = [x.strip() for x in conflict_output.splitlines() if x.strip().startswith("- ")]
    return lines[:limit]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--json", action="store_true", help="Output JSON format")
    parser.add_argument("--commit-message", help="Optional commit message for current changes")
    parser.add_argument("--push", action="store_true", help="Push after commit (requires commit-message)")
    args = parser.parse_args()

    if args.push and not args.commit_message:
        print("Error: --push requires --commit-message", file=sys.stderr)
        return 2

    # Base status
    _, branch, _ = run_cmd(["git", "branch", "--show-current"])
    _, head, _ = run_cmd(["git", "rev-parse", "HEAD"])
    _, status_short, _ = run_cmd(["git", "status", "--short"])

    # Conflict check and bootstrap validation
    _, conflict_out, conflict_err = run_cmd([sys.executable, str(TRELLIS / "scripts" / "task_conflict_check.py")])
    _, bootstrap_out, bootstrap_err = run_cmd(
        [sys.executable, str(TRELLIS / "scripts" / "session_bootstrap.py"), "--json"]
    )

    commit_hash = ""
    push_output = ""
    commit_err = ""
    push_err = ""
    commit_performed = False
    push_performed = False

    if args.commit_message:
        add_code, _, add_err = run_cmd(["git", "add", "-A"])
        if add_code != 0:
            commit_err = f"git add failed: {add_err}"
        else:
            c_code, c_out, c_err = run_cmd(["git", "commit", "-m", args.commit_message])
            if c_code == 0:
                commit_performed = True
                _, commit_hash, _ = run_cmd(["git", "rev-parse", "HEAD"])
                commit_err = ""
            else:
                commit_err = c_err or c_out

    if args.push and commit_performed:
        p_code, p_out, p_err = run_cmd(["git", "push"])
        if p_code == 0:
            push_performed = True
            push_output = p_out
        else:
            push_err = p_err or p_out

    _, status_after, _ = run_cmd(["git", "status", "--short"])

    handoff = {
        "branch": branch or "(unknown)",
        "head": (commit_hash or head) or "(unknown)",
        "current_task": read_current_task(),
        "working_tree_clean": status_after == "",
        "must_run": 'python3 ./.trellis/scripts/session_bootstrap.py',
        "project_urls": [
            "http://127.0.0.1:5174/splash.html",
            "http://127.0.0.1:5174/login.html",
            "http://127.0.0.1:5174/workbench.html",
        ],
        "conflict_risks": extract_top_risks(conflict_out),
        "notes": [
            "主链优先：先做 03-quick-order，再做 04-delivery-to-complete。",
            "非主链优化任务不插队执行，除非明确阻塞主链。",
        ],
    }

    result = {
        "summary": {
            "branch": branch or "(unknown)",
            "head_before": head or "(unknown)",
            "head_after": (commit_hash or head) or "(unknown)",
            "current_task": read_current_task(),
            "status_before": status_short,
            "status_after": status_after,
            "commit_performed": commit_performed,
            "push_performed": push_performed,
        },
        "checks": {
            "task_conflict_check": {
                "output": conflict_out,
                "error": conflict_err,
            },
            "session_bootstrap_json": {
                "output": bootstrap_out,
                "error": bootstrap_err,
            },
        },
        "git": {
            "commit_error": commit_err,
            "push_output": push_output,
            "push_error": push_err,
        },
        "next_session_prompt": (
            "请继续当前仓库开发。\n"
            f"- 当前分支: {handoff['branch']}\n"
            f"- 最新提交: {handoff['head']}\n"
            f"- 当前任务: {handoff['current_task']}\n"
            f"- 先执行: {handoff['must_run']}\n"
            "- 开发优先级: 先 03-quick-order，再 04-delivery-to-complete；非主链任务不插队。\n"
            f"- 访问地址: {', '.join(handoff['project_urls'])}\n"
        ),
        "handoff": handoff,
    }

    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0

    print("=== Session Finalize ===")
    print()
    print(f"- Branch: {result['summary']['branch']}")
    print(f"- HEAD: {result['summary']['head_after']}")
    print(f"- Current task: {result['summary']['current_task']}")
    print(f"- Commit performed: {result['summary']['commit_performed']}")
    print(f"- Push performed: {result['summary']['push_performed']}")
    print()
    print("Next-session prompt:")
    print(result["next_session_prompt"])

    if commit_err:
        print(f"[warn] commit error: {commit_err}")
    if push_err:
        print(f"[warn] push error: {push_err}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
