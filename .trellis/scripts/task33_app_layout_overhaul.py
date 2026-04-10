#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / ".trellis" / "delivery-app" / "src"


def assert_contains(path: Path, needles):
  text = path.read_text(encoding="utf-8")
  for needle in needles:
    if needle not in text:
      raise AssertionError(f"{path}: missing `{needle}`")


def main():
  workbench = SRC / "workbench.html"
  quick_order = SRC / "quick-order.html"
  delivery_complete = SRC / "delivery-complete.html"
  my_page = SRC / "my.html"
  shell = SRC / "delivery-shell.css"

  for page in [workbench, quick_order, delivery_complete, my_page]:
    assert_contains(page, ['<link rel="stylesheet" href="./delivery-shell.css" />'])
    assert_contains(page, ['aria-label="底部导航"', "首页", "客户", "我的"])

  assert_contains(workbench, ["系统状态", 'id="loginEntryBtn"', "state-block"])
  assert_contains(quick_order, ['id="loginBtn"', "提交与反馈", "state-block info tip"])
  assert_contains(delivery_complete, ['id="loginBtn"', "state-block info tip"])
  assert_contains(my_page, ['id="loginTopBtn"', "高频入口", "管理入口"])
  assert_contains(shell, [".state-block", ".app-btn.ghost", "--font-title", "--font-body"])
  print("task33 app layout overhaul smoke passed")


if __name__ == "__main__":
  try:
    main()
  except Exception as err:
    print(f"[FAIL] {err}")
    sys.exit(1)
