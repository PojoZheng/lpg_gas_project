#!/usr/bin/env python3
"""Smoke: quick-order continuous mode (req §5) UI and session key."""
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
HTML = ROOT / ".trellis" / "delivery-app" / "src" / "quick-order.html"


def assert_contains(needles):
  text = HTML.read_text(encoding="utf-8")
  for needle in needles:
    if needle not in text:
      raise AssertionError(f"quick-order.html: missing `{needle}`")


def main():
  assert_contains(
    [
      'id="continuousBanner"',
      'id="exitContinuousBtn"',
      "连续开单中",
      "退出连续模式",
      "今日累计（本页连续）",
      "qo-continuous-session-v1",
      "readContSession",
      "上一单客户不会自动保留",
      "skipAutoSelect",
      "对齐需求 §5.3",
    ]
  )
  print("task41 continuous quick-order smoke passed")


if __name__ == "__main__":
  try:
    main()
  except Exception as err:
    print(f"[FAIL] {err}")
    sys.exit(1)
