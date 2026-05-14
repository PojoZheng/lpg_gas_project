#!/usr/bin/env python3
"""Smoke: quick-order streamlined UI after customer-entry simplification."""
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
HTML = ROOT / "apps" / "delivery-app" / "src" / "quick-order.html"


def assert_contains(needles):
  text = HTML.read_text(encoding="utf-8")
  for needle in needles:
    if needle not in text:
      raise AssertionError(f"quick-order.html: missing `{needle}`")

def assert_not_contains(needles):
  text = HTML.read_text(encoding="utf-8")
  for needle in needles:
    if needle in text:
      raise AssertionError(f"quick-order.html: should remove `{needle}`")


def main():
  assert_contains(
    [
      'id="qtyText"',
      'id="specSelect"',
      'id="priceInput"',
      'id="createBtn"',
      "订单信息",
      "提交开单",
    ]
  )
  assert_not_contains(
    [
      'id="continuousMode"',
      'id="rememberDefaults"',
      'id="moreFieldsBtn"',
      'id="advancedToggleBtn"',
      "提交与反馈",
    ]
  )
  print("task41 quick-order simplified smoke passed")


if __name__ == "__main__":
  try:
    main()
  except Exception as err:
    print(f"[FAIL] {err}")
    sys.exit(1)
