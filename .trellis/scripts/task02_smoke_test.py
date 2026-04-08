#!/usr/bin/env python3
from pathlib import Path
import json
import sys

ROOT = Path(__file__).resolve().parents[2]

required_files = [
    ROOT / ".trellis/spec/delivery-app/domain-workbench/overview.md",
    ROOT / ".trellis/tasks/02-workbench-aggregation/task.json",
    ROOT / ".trellis/delivery-app/src/login.html",
    ROOT / ".trellis/delivery-app/src/splash.html",
]

for f in required_files:
    if not f.exists():
        print(f"[task02-smoke] 缺少文件: {f}")
        sys.exit(1)

task = json.loads((ROOT / ".trellis/tasks/02-workbench-aggregation/task.json").read_text(encoding="utf-8"))
if task.get("id") != "02-workbench-aggregation":
    print("[task02-smoke] 任务定义异常")
    sys.exit(1)

login_html = (ROOT / ".trellis/delivery-app/src/login.html").read_text(encoding="utf-8")
checks = ["手机号验证码登录", "获取验证码", "登录", "#4799a0"]
for c in checks:
    if c not in login_html:
        print(f"[task02-smoke] 登录页缺少关键内容: {c}")
        sys.exit(1)

if "emoji" in login_html.lower():
    print("[task02-smoke] 登录页存在 emoji 相关字样，请确认规范")
    sys.exit(1)

print("[task02-smoke] 通过")
