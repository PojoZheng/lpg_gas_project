#!/bin/bash
# Recover 机制：新会话启动时恢复状态

TASK_ID="$1"
STEP_ID="$2"

REPO_ROOT="/Users/zhengpeipei/多立恒/概念验证/lpg_gas_project"
STEP_DIR="$REPO_ROOT/.trellis/tasks/$TASK_ID/steps"
HANDOFF_DIR="$STEP_DIR/handoff"
HANDOFF_FILE="$HANDOFF_DIR/step-${STEP_ID}.md"

echo "=== 恢复任务状态 ==="
echo "Task: $TASK_ID"
echo "Step: $STEP_ID"

if [ -f "$HANDOFF_FILE" ]; then
    echo ""
    echo "=== 上一步 handoff ==="
    cat "$HANDOFF_FILE"
    echo ""
    echo "=== 继续执行 ==="
else
    echo "[warn] No handoff file found at $HANDOFF_FILE"
    echo "Starting fresh..."
fi
