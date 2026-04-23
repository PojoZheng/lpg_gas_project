#!/bin/bash
# Integrator Agent - 启动 Inbox 监听服务

LOG_DIR=".trellis/workspace/integrator"
PID_FILE="$LOG_DIR/watch.pid"

# 停止已运行的实例
if [ -f "$PID_FILE" ]; then
    OLD_PID=$(cat "$PID_FILE" 2>/dev/null)
    if [ -n "$OLD_PID" ]; then
        kill "$OLD_PID" 2>/dev/null
        sleep 1
    fi
fi

# 启动新的监听进程
nohup python3 "$LOG_DIR/watch_inbox.py" > "$LOG_DIR/watch.out" 2>&1 &
NEW_PID=$!
echo $NEW_PID > "$PID_FILE"

echo "监听服务已启动 (PID: $NEW_PID)"
echo "日志: $LOG_DIR/inbox_watch.log"
