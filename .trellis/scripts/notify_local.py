#!/usr/bin/env python3
"""
本机桌面通知（macOS 用 osascript；其它系统仅打印到 stderr）。

用法:
  python3 ./.trellis/scripts/notify_local.py --title "Trellis" --body "指针已写，请在辅树与主仓各跑 session_bootstrap"
  python3 ./.trellis/scripts/notify_local.py "短正文"   # 标题默认 Trellis
"""
from __future__ import annotations

import argparse
import subprocess
import sys


def _escape_applescript_string(s: str) -> str:
    return s.replace("\\", "\\\\").replace('"', '\\"')


def notify(title: str, body: str) -> int:
    if sys.platform != "darwin":
        print(f"[notify_local] (非 macOS，已跳过系统通知) {title}: {body}", file=sys.stderr)
        return 0

    script = f'display notification "{_escape_applescript_string(body)}" with title "{_escape_applescript_string(title)}"'
    try:
        r = subprocess.run(
            ["osascript", "-e", script],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if r.returncode != 0:
            print(f"[notify_local] osascript 失败: {r.stderr}", file=sys.stderr)
            return r.returncode
    except OSError as e:
        print(f"[notify_local] 无法执行 osascript: {e}", file=sys.stderr)
        return 1
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="本机通知（macOS Notification Center）")
    parser.add_argument("--title", default="Trellis", help="通知标题")
    parser.add_argument("--body", default="", help="通知正文")
    parser.add_argument(
        "body_positional",
        nargs="*",
        help="正文（若未用 --body，可写在此）",
    )
    args = parser.parse_args()
    body = args.body.strip() or " ".join(args.body_positional).strip()
    if not body:
        body = "请检查各 worktree，并在辅树开发窗口与主仓（如需）执行 session_bootstrap 后继续。"
    return notify(args.title, body)


if __name__ == "__main__":
    sys.exit(main())
