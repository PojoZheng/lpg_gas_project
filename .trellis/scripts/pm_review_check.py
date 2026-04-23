#!/usr/bin/env python3
"""
Rule-based product manager review checker.

Usage:
  python3 ./.trellis/scripts/pm_review_check.py
  python3 ./.trellis/scripts/pm_review_check.py --task 03-quick-order
  python3 ./.trellis/scripts/pm_review_check.py --json
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
TRELLIS = ROOT / ".trellis"


def read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except OSError:
        return ""


def read_current_task_id() -> str:
    p = TRELLIS / ".current-task"
    if not p.exists():
        return ""
    raw = p.read_text(encoding="utf-8").strip()
    if not raw:
        return ""
    return Path(raw).name


def keyword_missing(content: str, keywords: list[str]) -> list[str]:
    return [k for k in keywords if k not in content]


def review_task_03() -> dict:
    requirements = read_text(ROOT / "requirements/01_工作台/需求.md")
    specs = read_text(ROOT / "requirements/01_工作台/规格.md")
    page = read_text(ROOT / "apps/delivery-app/src/quick-order.html")

    findings_p0: list[str] = []
    findings_p1: list[str] = []

    required_in_page = ["添加新客户", "查看全部客户", "搜索客户姓名、手机号或地址", "稍后配送", "当场完成"]
    missing = keyword_missing(page, required_in_page)
    for x in missing:
        findings_p0.append(f"快速开单页面缺少关键入口或文案：{x}")

    if "一键开单" in requirements and "一键开单" not in page:
        findings_p1.append("需求提到“一键开单”，当前页面未提供对应交互。")
    if "展开更多" in specs and "展开更多" not in page:
        findings_p1.append("规格提到“展开更多”，当前页面未提供扩展字段入口。")
    if "连续开单" in requirements and "连续开单" not in page:
        findings_p1.append("需求提到“连续开单模式”，当前未支持。")
    if "收款方式" in requirements and "收款方式" not in page:
        findings_p1.append("当场完成应包含收款信息确认，当前仅有基础开单。")

    suggested_tasks = []
    if findings_p1:
        suggested_tasks.append(
            {
                "id": "17-quick-order-ux-alignment",
                "title": "快速开单交互与边界对齐",
                "depends_on": ["03-quick-order"],
                "reason": "承接快速开单高级交互，不阻塞主链 task-04。",
            }
        )

    return {
        "task": "03-quick-order",
        "p0_findings": findings_p0,
        "p1_findings": findings_p1,
        "suggested_tasks": suggested_tasks,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--task", help="Task id")
    parser.add_argument("--json", action="store_true", help="JSON output")
    args = parser.parse_args()

    task_id = args.task or read_current_task_id()
    if not task_id:
        task_id = "03-quick-order"

    if task_id == "03-quick-order":
        result = review_task_03()
    else:
        result = {
            "task": task_id,
            "p0_findings": [],
            "p1_findings": [f"暂未内置 {task_id} 的评审规则，可后续扩展。"],
            "suggested_tasks": [],
        }

    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0

    print("[pm-review-check] 任务:", result["task"])
    print("[pm-review-check] P0 问题数:", len(result["p0_findings"]))
    for item in result["p0_findings"]:
        print("  -", item)
    print("[pm-review-check] P1 建议数:", len(result["p1_findings"]))
    for item in result["p1_findings"]:
        print("  -", item)
    if result["suggested_tasks"]:
        print("[pm-review-check] 建议新增任务:")
        for t in result["suggested_tasks"]:
            print(f"  - {t['id']}: {t['title']} (depends_on: {', '.join(t['depends_on'])})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
