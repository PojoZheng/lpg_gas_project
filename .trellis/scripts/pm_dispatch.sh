#!/bin/bash
# PM+Architect 任务自动下发脚本

REPO_ROOT="/Users/zhengpeipei/多立恒/概念验证/lpg_gas_project"
BUS_DIR="$HOME/.trellis-bus/lpg_gas_project"
TASK_ID="$1"
ASSIGNEE="$2"  # dev-a, dev-b, dev-c

if [ -z "$TASK_ID" ] || [ -z "$ASSIGNEE" ]; then
    echo "Usage: $0 <task_id> <dev-a|dev-b|dev-c>"
    exit 1
fi

TASK_PATH=".trellis/tasks/$TASK_ID"
TASK_FILE="$REPO_ROOT/$TASK_PATH/task.json"

if [ ! -f "$TASK_FILE" ]; then
    echo "ERROR: Task file not found: $TASK_FILE"
    exit 1
fi

# 读取任务信息
TASK_TITLE=$(cat "$TASK_FILE" | python3 -c "import json,sys; print(json.load(sys.stdin).get('title',''))" 2>/dev/null)

# 创建 trellis bus 消息
INBOX_FILE="$BUS_DIR/inbox/$ASSIGNEE.json"
cat > "$INBOX_FILE" << MSG_EOF
{
  "id": "$(uuidgen 2>/dev/null || echo $(date +%s))",
  "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "type": "TASK_ASSIGNED",
  "from": "pm-arch",
  "to": "$ASSIGNEE",
  "task_id": "$TASK_ID",
  "task_path": "$TASK_PATH",
  "task_title": "$TASK_TITLE",
  "note": "新任务分配，请开始开发"
}
MSG_EOF

echo "✅ Task dispatched: $TASK_ID -> $ASSIGNEE"
echo "   File: $INBOX_FILE"
