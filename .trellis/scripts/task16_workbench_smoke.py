#!/usr/bin/env python3
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[2]
WORKBENCH = ROOT / ".trellis" / "delivery-app" / "src" / "workbench.html"


def assert_contains(text: str, needle: str) -> None:
    if needle not in text:
        raise AssertionError(f"Missing expected content: {needle}")


def assert_not_contains(text: str, needle: str) -> None:
    if needle in text:
        raise AssertionError(f"Unexpected content still exists: {needle}")


def main() -> int:
    if not WORKBENCH.exists():
        raise FileNotFoundError(f"workbench page not found: {WORKBENCH}")
    text = WORKBENCH.read_text(encoding="utf-8")

    # task-16 workbench polish baseline checks
    assert_contains(text, 'id="quickOrderBtn"')
    assert_contains(text, 'id="deliveryCompleteBtn"')
    assert_contains(text, 'id="navWorkbenchBtn"')
    assert_contains(text, 'id="navQuickOrderBtn"')
    assert_contains(text, 'id="navMyBtn"')
    assert_contains(text, "./my.html")

    # low-frequency cards should not stay on workbench
    assert_not_contains(text, 'id="syncStatusTag"')
    assert_not_contains(text, 'id="platformMonitorBtn"')
    assert_not_contains(text, 'id="policyReleaseBtn"')

    print("task16 workbench smoke passed")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:  # noqa: BLE001
        print(f"task16 workbench smoke failed: {exc}", file=sys.stderr)
        raise
