#!/usr/bin/env python3
"""
If workbench home implementation files change, REQUIREMENTS_01_COVERAGE.md must
change in the same diff-set (reduces silent drift from requirements/01_工作台).

CI: set GITHUB_EVENT_NAME + either (GIT_BEFORE, GIT_AFTER) for push or
(PR_BASE_SHA, PR_HEAD_SHA) for pull_request. Local: compares merge-base(origin/main, HEAD)..HEAD.
"""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
COVERAGE = ".trellis/spec/delivery-app/domain-workbench/REQUIREMENTS_01_COVERAGE.md"
WATCH = (
    ".trellis/delivery-app/src/workbench.html",
    ".trellis/delivery-app/src/workbench-client.js",
)


def run_git(args: list[str]) -> tuple[int, str, str]:
    result = subprocess.run(
        ["git", *args],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    return result.returncode, (result.stdout or "").strip(), (result.stderr or "").strip()


def norm_paths(lines: list[str]) -> list[str]:
    return [p.replace("\\", "/").strip() for p in lines if p.strip()]


def changed_files(from_ref: str, to_ref: str) -> list[str] | None:
    code, out, err = run_git(["diff", "--name-only", from_ref, to_ref])
    if code != 0:
        print(f"[verify-workbench-coverage] git diff {from_ref} {to_ref} failed: {err}", file=sys.stderr)
        return None
    return norm_paths(out.splitlines())


def local_merge_base_files() -> list[str] | None:
    code, _, _ = run_git(["rev-parse", "--verify", "origin/main"])
    if code != 0:
        print("[verify-workbench-coverage] skip: no origin/main (fetch first)")
        return []
    code, mb, err = run_git(["merge-base", "origin/main", "HEAD"])
    if code != 0:
        print(f"[verify-workbench-coverage] skip: merge-base failed: {err}")
        return []
    return changed_files(mb, "HEAD")


def main() -> int:
    event = os.environ.get("GITHUB_EVENT_NAME", "").strip()
    files: list[str] | None = None

    if event == "pull_request":
        base = os.environ.get("PR_BASE_SHA", "").strip()
        head = os.environ.get("PR_HEAD_SHA", "").strip()
        if not base or not head:
            print(
                "[verify-workbench-coverage] ERROR: pull_request requires PR_BASE_SHA and PR_HEAD_SHA",
                file=sys.stderr,
            )
            return 1
        files = changed_files(base, head)
    elif event == "push":
        before = os.environ.get("GIT_BEFORE", "").strip()
        after = os.environ.get("GIT_AFTER", "").strip()
        if not after:
            print("[verify-workbench-coverage] ERROR: push requires GIT_AFTER", file=sys.stderr)
            return 1
        if not before or before.strip("0") == "":
            print("[verify-workbench-coverage] skip: push has no parent SHA (e.g. new branch)")
            return 0
        files = changed_files(before, after)
    else:
        files = local_merge_base_files()
        if files is None:
            return 1
        if not files:
            return 0

    if files is None:
        return 1
    if not files:
        print("[verify-workbench-coverage] ok (empty diff)")
        return 0

    touched_watch = any(w in files for w in WATCH)
    touched_cov = COVERAGE in files
    if touched_watch and not touched_cov:
        print(
            "[verify-workbench-coverage] FAIL: workbench home files changed without "
            f"`{COVERAGE}` in the same diff.",
            file=sys.stderr,
        )
        print(
            "  Add at least one line to the coverage doc (e.g. 变更记录) or split the change.",
            file=sys.stderr,
        )
        return 1

    print("[verify-workbench-coverage] ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
