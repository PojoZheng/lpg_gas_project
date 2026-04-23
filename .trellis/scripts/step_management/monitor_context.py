#!/usr/bin/env python3
"""
监控 Agent 上下文使用情况
在 Kimi CLI 中运行，通过截图或状态栏检测
"""

import subprocess
import sys
import time

CONTEXT_LIMIT = 262100  # kimi 上下文上限
def get_context_from_tmux(pane_id):
    """从 tmux pane 获取上下文信息"""
    try:
        result = subprocess.run(
            ['tmux', 'capture-pane', '-t', pane_id, '-p'],
            capture_output=True,
            text=True
        )
        output = result.stdout
        
        # 查找 context: XX% (XXk/262.1k) 模式
        for line in output.split('\n'):
            if 'context:' in line and '/262.1k' in line:
                # 提取百分比
                parts = line.split('context:')
                if len(parts) > 1:
                    percent_part = parts[1].strip().split('%')[0]
                    try:
                        return float(percent_part)
                    except ValueError:
                        continue
        return None
    except Exception as e:
        print(f"Error reading pane {pane_id}: {e}")
        return None


def check_all_panes():
    """检查所有 Dev Agent pane"""
    panes = ['%1', '%2', '%3', '%4']  # Dev A, B, C, PM+Arch
    
    for pane in panes:
        context = get_context_from_tmux(pane)
        if context:
            if context > 85:
                print(f"[ALERT] Pane {pane}: Context {context}% - NEED HANDOFF!")
                # 可以在这里触发 handoff 脚本
            elif context > 70:
                print(f"[WARN] Pane {pane}: Context {context}% - Approaching limit")
            else:
                print(f"[OK] Pane {pane}: Context {context}%")


if __name__ == "__main__":
    check_all_panes()
