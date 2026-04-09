#!/usr/bin/env python3
from pathlib import Path
import json
import sys

ROOT = Path(__file__).resolve().parents[2]

required_files = [
    ROOT / ".trellis/tasks/03-quick-order/task.json",
    ROOT / ".trellis/delivery-app/src/quick-order.html",
    ROOT / ".trellis/delivery-app/src/quick-order-client.js",
    ROOT / ".trellis/delivery-app/src/workbench.html",
]

for f in required_files:
    if not f.exists():
        print(f"[task03-smoke] 缺少文件: {f}")
        sys.exit(1)

task = json.loads((ROOT / ".trellis/tasks/03-quick-order/task.json").read_text(encoding="utf-8"))
if task.get("id") != "03-quick-order":
    print("[task03-smoke] 任务定义异常")
    sys.exit(1)

quick_html = (ROOT / ".trellis/delivery-app/src/quick-order.html").read_text(encoding="utf-8")
checks = [
    "快速开单",
    "选择客户",
    "稍后配送",
    "当场完成",
    "确认开单",
    "添加新客户",
    "查看全部客户",
    "搜索客户姓名、手机号或地址",
    "#4799a0",
]
for c in checks:
    if c not in quick_html:
        print(f"[task03-smoke] 快速开单页缺少关键内容: {c}")
        sys.exit(1)

if "emoji" in quick_html.lower():
    print("[task03-smoke] 快速开单页存在 emoji 相关字样，请确认规范")
    sys.exit(1)

if "logo-polygon.png" in quick_html:
    print("[task03-smoke] 快速开单页不允许使用 Logo")
    sys.exit(1)

workbench_html = (ROOT / ".trellis/delivery-app/src/workbench.html").read_text(encoding="utf-8")
if "./quick-order.html" not in workbench_html:
    print("[task03-smoke] 工作台未接入快速开单入口跳转")
    sys.exit(1)

print("[task03-smoke] 通过")
