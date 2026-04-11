#!/usr/bin/env python3
"""Smoke: workbench next-delivery card exposes §3.2.2 field hooks (HTML + server payload)."""
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
WORKBENCH = ROOT / ".trellis" / "delivery-app" / "src" / "workbench.html"
SERVER = ROOT / ".trellis" / "backend" / "src" / "server.js"


def assert_contains(path: Path, needles):
  text = path.read_text(encoding="utf-8")
  for needle in needles:
    if needle not in text:
      raise AssertionError(f"{path.relative_to(ROOT)}: missing `{needle}`")


def main():
  assert_contains(
    WORKBENCH,
    [
      'id="nextTags"',
      'id="nextSpecQty"',
      'id="nextAmount"',
      'id="nextSchedule"',
      'id="nextOwedBottles"',
      'id="nextOwedMoney"',
      "renderCustomerTags",
      "customerTags",
    ],
  )
  assert_contains(
    SERVER,
    [
      "customerTags",
      "buildNextDeliveryPayload",
      "getNextWorkbenchDeliveryOrder",
      "hasConcreteSchedule",
    ],
  )
  print("task39 workbench next-card fields smoke passed")


if __name__ == "__main__":
  try:
    main()
  except Exception as err:
    print(f"[FAIL] {err}")
    sys.exit(1)
