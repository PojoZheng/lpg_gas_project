#!/usr/bin/env python3
"""
自动测试触发器（按 Trellis 当前任务）

功能：
1) 监听代码目录变化（delivery-app/src、backend/src、platform/src、shared/src）
2) 根据 .trellis/.current-task 自动匹配任务测试命令
3) 若未配置任务命令，执行默认检查

用法：
  python3 ./.trellis/scripts/auto_test_runner.py --once
  python3 ./.trellis/scripts/auto_test_runner.py --watch
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from pathlib import Path
from typing import Dict, List


PROJECT_ROOT = Path(__file__).resolve().parents[2]
TRELLIS_ROOT = PROJECT_ROOT / ".trellis"
CURRENT_TASK_FILE = TRELLIS_ROOT / ".current-task"
TEST_CONFIG_FILE = TRELLIS_ROOT / "tasks" / "test-commands.json"

WATCH_DIRS = [
    TRELLIS_ROOT / "delivery-app" / "src",
    TRELLIS_ROOT / "backend" / "src",
    TRELLIS_ROOT / "platform" / "src",
    TRELLIS_ROOT / "shared" / "src",
]


def read_current_task_id() -> str:
    if not CURRENT_TASK_FILE.exists():
        return ""
    raw = CURRENT_TASK_FILE.read_text(encoding="utf-8").strip()
    # 例如: .trellis/tasks/02-workbench-aggregation
    return Path(raw).name


def load_task_commands() -> Dict[str, List[str]]:
    if not TEST_CONFIG_FILE.exists():
        return {}
    try:
        data = json.loads(TEST_CONFIG_FILE.read_text(encoding="utf-8"))
        return {k: v for k, v in data.items() if isinstance(v, list)}
    except Exception:
        return {}


def default_commands() -> List[str]:
    commands: List[str] = []

    # 后端 js 语法检查（无依赖即可执行）
    backend_src = TRELLIS_ROOT / "backend" / "src"
    if backend_src.exists():
        for p in backend_src.rglob("*.js"):
            commands.append(f'node --check "{p}"')

    # 若存在 .trellis/package.json，则尝试运行常见脚本
    package_json = TRELLIS_ROOT / "package.json"
    if package_json.exists():
        try:
            pkg = json.loads(package_json.read_text(encoding="utf-8"))
            scripts = pkg.get("scripts", {})
            for name in ["lint", "typecheck", "test", "test:unit", "test:e2e:smoke"]:
                if name in scripts:
                    commands.append(f"npm run {name} --prefix \"{TRELLIS_ROOT}\"")
        except Exception:
            pass

    # App/Web 双入口静态校验（轻量，避免跨端口错误 import）
    verify_auth = PROJECT_ROOT / ".trellis" / "scripts" / "verify_runtime_auth_exports.py"
    verify_two = PROJECT_ROOT / ".trellis" / "scripts" / "verify_two_entry_runtime.py"
    if verify_auth.is_file():
        commands.append(f'python3 "{verify_auth}"')
    if verify_two.is_file():
        commands.append(f'python3 "{verify_two}"')

    return commands


def run_commands(commands: List[str]) -> int:
    if not commands:
        print("[auto-test] 未找到可执行测试命令，请先配置。")
        return 0

    print(f"[auto-test] 将执行 {len(commands)} 条命令")
    for i, cmd in enumerate(commands, start=1):
        print(f"\n[auto-test] ({i}/{len(commands)}) {cmd}")
        result = subprocess.run(
            cmd,
            shell=True,
            cwd=str(PROJECT_ROOT),
            text=True,
        )
        if result.returncode != 0:
            print(f"[auto-test] 命令失败，退出码 {result.returncode}")
            return result.returncode
    print("\n[auto-test] 全部通过")
    return 0


def snapshot_mtime() -> Dict[str, float]:
    state: Dict[str, float] = {}
    for folder in WATCH_DIRS:
        if not folder.exists():
            continue
        for p in folder.rglob("*"):
            if p.is_file():
                try:
                    state[str(p)] = p.stat().st_mtime
                except OSError:
                    pass
    return state


def changed(prev: Dict[str, float], curr: Dict[str, float]) -> bool:
    if prev.keys() != curr.keys():
        return True
    for k, v in curr.items():
        if prev.get(k) != v:
            return True
    return False


def resolve_commands_for_current_task() -> List[str]:
    task_id = read_current_task_id()
    task_map = load_task_commands()
    if task_id and task_id in task_map:
        print(f"[auto-test] 当前任务: {task_id}（使用任务专属命令）")
        return task_map[task_id]
    print(f"[auto-test] 当前任务: {task_id or '未设置'}（使用默认命令）")
    return default_commands()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true", help="仅执行一次")
    parser.add_argument("--watch", action="store_true", help="持续监听并自动执行")
    parser.add_argument("--interval", type=float, default=2.0, help="监听轮询间隔秒数")
    args = parser.parse_args()

    if not args.once and not args.watch:
        print("请指定 --once 或 --watch")
        return 2

    if args.once:
        return run_commands(resolve_commands_for_current_task())

    print("[auto-test] 监听已启动，检测到变更后将自动执行测试...")
    prev = snapshot_mtime()
    while True:
        time.sleep(max(0.5, args.interval))
        curr = snapshot_mtime()
        if changed(prev, curr):
            print("\n[auto-test] 检测到代码变更，开始执行测试...")
            code = run_commands(resolve_commands_for_current_task())
            if code != 0:
                print("[auto-test] 本轮测试失败，等待下一次变更重试...")
            prev = curr


if __name__ == "__main__":
    sys.exit(main())
