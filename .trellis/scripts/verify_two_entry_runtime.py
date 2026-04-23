#!/usr/bin/env python3
"""Static checks for App + Web entry runtime (modules, no bad cross-port imports)."""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PLATFORM_SRC = ROOT / "apps/platform/src"


def main() -> int:
    bad = '/apps/delivery-app/src/auth-client.js'
    for p in sorted(PLATFORM_SRC.glob("*.js")):
        if bad in p.read_text(encoding="utf-8"):
            print(f"[verify-two-entry-runtime] FAIL: {p} still imports {bad}", file=sys.stderr)
            return 1

    if not (PLATFORM_SRC / "platform-auth.js").is_file():
        print("[verify-two-entry-runtime] FAIL: platform-auth.js missing", file=sys.stderr)
        return 1

    checks = [
        ROOT / "apps/platform/src/platform-auth.js",
        ROOT / "apps/platform/src/platform-monitor-client.js",
        ROOT / "apps/platform/src/policy-release-client.js",
        ROOT / "apps/platform/src/sync-queue-client.js",
        ROOT / "apps/delivery-app/src/auth-client.js",
    ]
    for js in checks:
        r = subprocess.run(
            ["node", "--check", str(js)],
            cwd=ROOT,
            capture_output=True,
            text=True,
        )
        if r.returncode != 0:
            print(f"[verify-two-entry-runtime] node --check failed: {js}", file=sys.stderr)
            if r.stderr:
                print(r.stderr, file=sys.stderr)
            return 1

    print("[verify-two-entry-runtime] ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
