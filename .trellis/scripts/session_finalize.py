#!/usr/bin/env python3
"""
Model-agnostic session finalize script.

Usage:
  python3 ./.trellis/scripts/session_finalize.py
  python3 ./.trellis/scripts/session_finalize.py --json
  python3 ./.trellis/scripts/session_finalize.py --commit-message "chore: finalize session"
  python3 ./.trellis/scripts/session_finalize.py --commit-message "..." --push

Commit / push (--commit-message, --push):
  Intended for the **integrator** role after merge and local verification. Feature
  agents should run this script **without** these flags (checks + handoff only).

  If --commit-message is set, commit runs only after task_conflict_check and
  session_bootstrap both exit 0; otherwise the working tree is left unchanged
  and the process exits with code 3.
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


def run_pm_review_json() -> tuple[dict, str, str]:
    code, out, err = run_cmd(
        [sys.executable, str(TRELLIS / "scripts" / "pm_review_check.py"), "--json"]
    )
    if code != 0 or not out.strip():
        fallback = {
            "task": Path(read_current_task()).name
            if read_current_task() not in ("(none)", "")
            else "",
            "p0_findings": [],
            "p1_findings": [],
            "suggested_tasks": [],
            "_error": err or out or f"exit {code}",
        }
        return fallback, "", err or out or f"exit {code}"
    try:
        data = json.loads(out)
        return data, format_pm_review_human(data), ""
    except json.JSONDecodeError:
        fallback = {
            "task": "",
            "p0_findings": [],
            "p1_findings": [],
            "suggested_tasks": [],
            "_error": "invalid JSON from pm_review_check",
        }
        return fallback, "", "invalid JSON from pm_review_check"


def format_pm_review_human(result: dict) -> str:
    lines = [
        f"[pm-review-check] 任务: {result.get('task', '')}",
        f"[pm-review-check] P0 问题数: {len(result.get('p0_findings') or [])}",
    ]
    for item in result.get("p0_findings") or []:
        lines.append(f"  - {item}")
    lines.append(f"[pm-review-check] P1 建议数: {len(result.get('p1_findings') or [])}")
    for item in result.get("p1_findings") or []:
        lines.append(f"  - {item}")
    sug = result.get("suggested_tasks") or []
    if sug:
        lines.append("[pm-review-check] 建议新增任务:")
        for t in sug:
            if isinstance(t, dict):
                dep = ", ".join(t.get("depends_on") or [])
                lines.append(f"  - {t.get('id', '')}: {t.get('title', '')} (depends_on: {dep})")
    err = result.get("_error")
    if err:
        lines.append(f"[pm-review-check] error: {err}")
    return "\n".join(lines)


def format_pm_review_for_prompt(pm: dict, max_items: int = 6) -> str:
    lines: list[str] = ["- PM 评审（规则检查）:"]
    task = pm.get("task") or "(unknown)"
    p0 = pm.get("p0_findings") or []
    p1 = pm.get("p1_findings") or []
    sug = pm.get("suggested_tasks") or []
    err = pm.get("_error")
    if err:
        lines.append(f"  - 未解析到结构化结果: {err}")
        return "\n".join(lines)
    lines.append(f"  - 任务: {task}")
    lines.append(f"  - P0: {len(p0)} 条" + (f"；示例: {p0[0]}" if p0 else ""))
    if len(p0) > 1:
        for item in p0[1 : max_items]:
            lines.append(f"    · {item}")
    lines.append(f"  - P1: {len(p1)} 条" + (f"；示例: {p1[0]}" if p1 else ""))
    if len(p1) > 1:
        for item in p1[1 : max_items]:
            lines.append(f"    · {item}")
    if sug:
        ids = ", ".join(str(t.get("id", "")) for t in sug if isinstance(t, dict))
        lines.append(f"  - 建议跟进任务: {ids}" if ids else "  - 建议跟进任务: （见 checks.pm_review_check）")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Session handoff: conflict check, PM review, bootstrap JSON. "
        "Optional git commit/push for integrator role only."
    )
    parser.add_argument("--json", action="store_true", help="Output JSON format")
    parser.add_argument(
        "--commit-message",
        metavar="MSG",
        help="Integrator only: commit all tracked/untracked changes after checks pass (see module docstring)",
    )
    parser.add_argument(
        "--push",
        action="store_true",
        help="Integrator only: git push after a successful --commit-message commit",
    )
    args = parser.parse_args()

    if args.push and not args.commit_message:
        print("Error: --push requires --commit-message", file=sys.stderr)
        return 2

    # Base status
    _, branch, _ = run_cmd(["git", "branch", "--show-current"])
    _, head, _ = run_cmd(["git", "rev-parse", "HEAD"])
    _, status_short, _ = run_cmd(["git", "status", "--short"])

    # Conflict check, PM review and bootstrap validation
    conflict_code, conflict_out, conflict_err = run_cmd(
        [sys.executable, str(TRELLIS / "scripts" / "task_conflict_check.py")]
    )
    pm_review_data, pm_review_out, pm_review_err = run_pm_review_json()
    bootstrap_code, bootstrap_out, bootstrap_err = run_cmd(
        [sys.executable, str(TRELLIS / "scripts" / "session_bootstrap.py"), "--json"]
    )

    checks_ok = conflict_code == 0 and bootstrap_code == 0
    commit_blocked = bool(args.commit_message) and not checks_ok

    commit_hash = ""
    push_output = ""
    commit_err = ""
    push_err = ""
    commit_performed = False
    push_performed = False

    if args.commit_message and commit_blocked:
        commit_err = (
            "commit skipped: task_conflict_check or session_bootstrap failed "
            f"(conflict_check={conflict_code}, bootstrap={bootstrap_code}). "
            "Fix issues and re-run."
        )

    if args.commit_message and not commit_blocked:
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
            "主链优先：推进 04-delivery-to-complete；快速开单基础能力在 03-quick-order。",
            "深度 UX（一键开单、连续开单等）走 17-quick-order-ux-alignment，不插队主链。",
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
            "checks_ok_for_integrator_commit": checks_ok,
            "commit_skipped_due_to_failed_checks": commit_blocked,
            "task_conflict_check_exit": conflict_code,
            "session_bootstrap_exit": bootstrap_code,
        },
        "checks": {
            "task_conflict_check": {
                "output": conflict_out,
                "error": conflict_err,
            },
            "pm_review_check": {
                "output": pm_review_out,
                "error": pm_review_err,
                "json": pm_review_data,
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
            "- 开发优先级: 主链 04-delivery-to-complete；快速开单深化见 17-quick-order-ux-alignment。\n"
            f"{format_pm_review_for_prompt(pm_review_data)}\n"
            f"- 访问地址: {', '.join(handoff['project_urls'])}\n"
            "- 收尾时执行: python3 ./.trellis/scripts/session_finalize.py\n"
        ),
        "handoff": handoff,
    }

    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
        if commit_blocked:
            return 3
        if args.commit_message and not commit_performed and commit_err:
            return 1
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

    if commit_blocked:
        return 3
    if args.commit_message and not commit_performed and commit_err:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
