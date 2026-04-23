#!/usr/bin/env python3
"""Light smoke for task 20.

Supports both legacy single-page safety layout and the new multi-page flow
(delivery-complete as entry + dedicated delivery-safety page).
"""
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
HTML = ROOT / ".trellis" / "delivery-app" / "src" / "delivery-complete.html"
SAFETY_HTML = ROOT / ".trellis" / "delivery-app" / "src" / "delivery-safety.html"


def assert_contains(needles):
  text = HTML.read_text(encoding="utf-8")
  for needle in needles:
    if needle not in text:
      raise AssertionError(f"{HTML.relative_to(ROOT)}: missing `{needle}`")


def main():
  text = HTML.read_text(encoding="utf-8")
  if 'class="delivery-complete-body"' in text:
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
  else:
    for needle in ["待配送流程入口", "pending-delivery-list.html", "delivery-safety.html"]:
      if needle not in text:
        raise AssertionError(f"{HTML.relative_to(ROOT)}: missing `{needle}`")
    safety_text = SAFETY_HTML.read_text(encoding="utf-8")
    for needle in ["safety-check", "提交安检", "失败重试", "安检上报"]:
      if needle not in safety_text:
        raise AssertionError(f"{SAFETY_HTML.relative_to(ROOT)}: missing `{needle}`")
  print("task20 safety layout smoke passed")


if __name__ == "__main__":
  try:
    main()
  except Exception as err:
    print(f"[FAIL] {err}")
    sys.exit(1)
