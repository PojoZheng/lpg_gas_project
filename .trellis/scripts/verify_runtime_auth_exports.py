#!/usr/bin/env python3
"""
Verify delivery-app auth-client exports expected by workbench (avoids stale-cache confusion).

If this passes but the browser still errors, restart preview + hard refresh (Cmd+Shift+R).
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
AUTH = ROOT / "apps/delivery-app/src/auth-client.js"
WORKBENCH = ROOT / "apps/delivery-app/src/workbench.html"


def main() -> int:
    if not AUTH.is_file():
        print(f"[verify-runtime-auth-exports] missing {AUTH}", file=sys.stderr)
        return 1
    text = AUTH.read_text(encoding="utf-8")
    required_exports = (
        "export function ensureAuthenticatedPage",
        "export async function authFetchJson",
        "export function redirectToLogin",
        "export async function logoutCurrentSession",
    )
    missing = [r for r in required_exports if r not in text]
    if missing:
        print("[verify-runtime-auth-exports] FAIL: auth-client.js missing:", file=sys.stderr)
        for m in missing:
            print(f"  - {m}", file=sys.stderr)
        return 1

    wb = WORKBENCH.read_text(encoding="utf-8")
    if "ensureAuthenticatedPage" not in wb or "from \"./auth-client.js\"" not in wb:
        print("[verify-runtime-auth-exports] FAIL: workbench.html auth import drift", file=sys.stderr)
        return 1

    print("[verify-runtime-auth-exports] ok (restart preview + hard refresh if browser still errors)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
