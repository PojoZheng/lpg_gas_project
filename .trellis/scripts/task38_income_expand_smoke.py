#!/usr/bin/env python3
"""Smoke: workbench income card expand + gross profit / 7-day trend placeholders."""
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
WORKBENCH = ROOT / ".trellis" / "delivery-app" / "src" / "workbench.html"


def assert_contains(path: Path, needles):
  text = path.read_text(encoding="utf-8")
  for needle in needles:
    if needle not in text:
      raise AssertionError(f"{path.relative_to(ROOT)}: missing `{needle}`")


def main():
  assert_contains(
    WORKBENCH,
    [
      'id="incomeToggleBtn"',
      'id="incomeExpandPanel"',
      "aria-expanded",
      "aria-controls=\"incomeExpandPanel\"",
      "查看更多",
      "今日毛利",
      "近 7 日趋势",
      "暂无趋势图",
      "setIncomeExpanded",
    ],
  )
  print("task38 income expand smoke passed")


if __name__ == "__main__":
  try:
    main()
  except Exception as err:
    print(f"[FAIL] {err}")
    sys.exit(1)
