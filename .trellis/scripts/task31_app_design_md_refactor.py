#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
SPEC = ROOT / ".trellis" / "spec" / "delivery-app" / "DESIGN.md"
SRC = ROOT / ".trellis" / "delivery-app" / "src"


def assert_contains(path: Path, needles):
  text = path.read_text(encoding="utf-8")
  for needle in needles:
    if needle not in text:
      raise AssertionError(f"{path}: missing `{needle}`")


def main():
  assert_contains(
    SPEC,
    ["#4799a0", "#424949", "Space Grotesk", "Inter", "按钮、卡片、导航、表单必须走统一 token 与组件层"],
  )

  pages = ["workbench.html", "quick-order.html", "delivery-complete.html", "my.html"]
  for name in pages:
    assert_contains(SRC / name, ['<link rel="stylesheet" href="./delivery-shell.css" />'])
    assert_contains(SRC / name, ['aria-label="底部导航"', "首页", "客户", "我的"])

  assert_contains(
    SRC / "delivery-shell.css",
    ["--brand: #4799a0;", "--neutral: #424949;", '--font-title: "Space Grotesk"', '--font-body: "Inter"'],
  )
  print("task31 app design md incremental align passed")


if __name__ == "__main__":
  try:
    main()
  except Exception as err:
    print(f"[FAIL] {err}")
    sys.exit(1)
