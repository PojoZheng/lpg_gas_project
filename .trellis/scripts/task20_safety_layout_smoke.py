#!/usr/bin/env python3
"""Light smoke for task 20: delivery-complete safety section + bottom dock layout."""
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
HTML = ROOT / ".trellis" / "delivery-app" / "src" / "delivery-complete.html"


def assert_contains(needles):
  text = HTML.read_text(encoding="utf-8")
  for needle in needles:
    if needle not in text:
      raise AssertionError(f"{HTML.relative_to(ROOT)}: missing `{needle}`")


def main():
  assert_contains([
    'class="delivery-complete-body"',
    'id="safetyCard"',
    "safety-card",
    'aria-labelledby="safetyCardTitle"',
    "safety-check",
    "check-item",
    'role="region"',
    'aria-label="安检操作区"',
    'id="dockStatus"',
    'aria-live="polite"',
    "dock-secondary-row",
    'id="submitSafetyBtn"',
    'id="retrySafetyBtn"',
    'id="backWorkbenchBtn"',
    "dock-actions",
    "calc(300px + env(safe-area-inset-bottom",
    "header-actions",
    "390×844",
  ])
  print("task20 safety layout smoke passed")


if __name__ == "__main__":
  try:
    main()
  except Exception as err:
    print(f"[FAIL] {err}")
    sys.exit(1)
