#!/usr/bin/env python3
"""Ensure workbench requirements/01 coverage doc exists and has expected structure."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DOC = ROOT / ".trellis/spec/delivery-app/domain-workbench/REQUIREMENTS_01_COVERAGE.md"
OVERVIEW = ROOT / ".trellis/spec/delivery-app/domain-workbench/overview.md"
TRACE = ROOT / ".trellis/spec/REQUIREMENTS_TRACEABILITY.md"


def main() -> int:
    if not DOC.is_file():
        print(f"[task36] missing {DOC}", file=sys.stderr)
        return 1
    text = DOC.read_text(encoding="utf-8")
    needles = ["## 1.", "## 2.", "## 3.", "requirements/01_工作台/需求.md", "36-workbench-01-req-spec-alignment"]
    for n in needles:
        if n not in text:
            print(f"[task36] coverage doc missing expected section or ref: {n!r}", file=sys.stderr)
            return 1
    ov = OVERVIEW.read_text(encoding="utf-8")
    if "REQUIREMENTS_01_COVERAGE.md" not in ov:
        print("[task36] overview.md missing link to REQUIREMENTS_01_COVERAGE.md", file=sys.stderr)
        return 1
    tr = TRACE.read_text(encoding="utf-8")
    if "REQUIREMENTS_01_COVERAGE.md" not in tr or "36-workbench-01-req-spec-alignment" not in tr:
        print("[task36] REQUIREMENTS_TRACEABILITY.md missing coverage doc or task-36", file=sys.stderr)
        return 1
    print("[task36] workbench requirements/01 coverage doc ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
