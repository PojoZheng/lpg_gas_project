#!/bin/bash
# Dev Agent 自动监听任务脚本

ROLE="$1"  # dev-a, dev-b, dev-c
if [ -z "$ROLE" ]; then
    echo "Usage: $0 <dev-a|dev-b|dev-c>"
    exit 1
fi

BUS_DIR="$HOME/.trellis-bus/lpg_gas_project"
INBOX="$BUS_DIR/inbox/$ROLE.json"

echo "=== Dev Agent: $ROLE ==="
echo "监听: $INBOX"
echo "每 5 秒检查一次..."
echo ""

while true; do
    if [ -f "$INBOX" ] && [ -s "$INBOX" ]; then
        echo ""
        echo "╔════════════════════════════════════════╗"
        echo "║  🔔 收到新任务！                       ║"
        echo "╚════════════════════════════════════════╝"
        echo ""
        cat "$INBOX" | python3 -m json.tool 2>/dev/null || cat "$INBOX"
        echo ""
        echo "执行: python3 ./.trellis/scripts/session_bootstrap.py"
        echo "开始开发..."
        
        # 备份已处理的消息
        mv "$INBOX" "$INBOX.processed.$(date +%s)"
        
        # 这里 Dev Agent 应该自动开始工作
        # 但目前在手动模式下，只显示通知
    fi
    sleep 5
done
