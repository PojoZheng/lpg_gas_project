#!/usr/bin/env python3
"""Smoke: workbench region B has explicit link to full pending delivery list."""
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
WORKBENCH = ROOT / ".trellis" / "delivery-app" / "src" / "workbench.html"
DELIVERY = ROOT / ".trellis" / "delivery-app" / "src" / "delivery-complete.html"


def assert_contains(path: Path, needles):
  text = path.read_text(encoding="utf-8")
  for needle in needles:
    if needle not in text:
      raise AssertionError(f"{path.relative_to(ROOT)}: missing `{needle}`")


def main():
  assert_contains(
    WORKBENCH,
    [
      "下一个配送",
      "查看全部待配送",
      "delivery-complete.html?from=workbench",
      "view=pending",
      'id="viewAllPendingLink"',
      "view-all-pending-link",
    ],
  )
  assert_contains(DELIVERY, ['id="pendingDeliverySection"', "maybeScrollToPendingList"])
  print("task37 workbench view-all pending smoke passed")


if __name__ == "__main__":
  try:
    main()
  except Exception as err:
    print(f"[FAIL] {err}")
    sys.exit(1)
