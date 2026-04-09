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
  my_center = SRC / "my.html"

  for page in [workbench, quick_order, delivery_complete, my_center]:
    assert_contains(page, ['<link rel="stylesheet" href="./delivery-shell.css" />'])
    assert_contains(page, ['aria-label="底部导航"', "首页", "客户", "我的"])

  assert_contains(workbench, ['id="quickOrderBtn"', 'class="action-grid"', "今天能赚多少钱"])
  assert_contains(workbench, ['class="nav-icon"', "低频能力请前往“我的”统一处理。"])
  assert_contains(my_center, ["同步队列", "平台运营入口", "财务记账与日结"])
  print("task24 ui refactor smoke passed")


if __name__ == "__main__":
  try:
    main()
  except Exception as err:
    print(f"[FAIL] {err}")
    sys.exit(1)
