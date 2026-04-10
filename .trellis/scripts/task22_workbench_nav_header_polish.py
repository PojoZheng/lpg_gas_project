#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
WORKBENCH = ROOT / ".trellis" / "delivery-app" / "src" / "workbench.html"
SHELL = ROOT / ".trellis" / "delivery-app" / "src" / "delivery-shell.css"


def assert_contains(path: Path, needles):
  text = path.read_text(encoding="utf-8")
  for needle in needles:
    if needle not in text:
      raise AssertionError(f"{path}: missing `{needle}`")


def main():
  assert_contains(WORKBENCH, ['aria-label="底部导航"', "首页", "客户", "我的"])
  assert_contains(WORKBENCH, ['id="loginBtn"', 'id="networkBadge"', "header-note"])
  assert_contains(WORKBENCH, ['class="state-block info"', "state-block loading", "state-block success", "state-block error"])
  assert_contains(SHELL, [".nav-btn.active", ".state-block", ".app-btn.ghost"])
  print("task22 workbench nav/header polish smoke passed")


if __name__ == "__main__":
  try:
    main()
  except Exception as err:
    print(f"[FAIL] {err}")
    sys.exit(1)
