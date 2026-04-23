#!/bin/bash
# 轻量级监控 - 只检测 PR 通知，提醒 Integrator Agent

INBOX="$HOME/.trellis-bus/lpg_gas_project/inbox/integrator.json"
LOG="/tmp/integrator_watch.log"

while true; do
    if [ -f "$INBOX" ] && [ -s "$INBOX" ]; then
        echo "[$(date '+%H:%M:%S')] 🔔 收到 PR 通知！" >> "$LOG"
        cat "$INBOX" >> "$LOG"
        echo "" >> "$LOG"
        
        # 显示通知（Integrator Agent 会看到）
        echo ""
        echo "╔══════════════════════════════════════╗"
        echo "║  🔔 新的 PR 等待合并！              ║"
        echo "╚══════════════════════════════════════╝"
        cat "$INBOX"
        echo ""
        echo "执行合并命令: git merge origin/<branch>"
        
        # 可选：清空或备份
        mv "$INBOX" "$INBOX.processed.$(date +%s)"
    fi
    sleep 5
done
