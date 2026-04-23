#!/bin/bash
# Checkpoint 机制：完成任务步骤后保存状态

TASK_ID="$1"
STEP_ID="$2"
STEP_STATUS="$3"  # completed, in_progress, blocked

REPO_ROOT="/Users/zhengpeipei/多立恒/概念验证/lpg_gas_project"
STEP_DIR="$REPO_ROOT/.trellis/tasks/$TASK_ID/steps"
HANDOFF_DIR="$STEP_DIR/handoff"

mkdir -p "$HANDOFF_DIR"

# 生成 checkpoint 文件
cat > "$HANDOFF_DIR/step-${STEP_ID}.json" << EOF
{
  "task_id": "$TASK_ID",
  "step_id": $STEP_ID,
  "status": "$STEP_STATUS",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "git_commit": "$(git rev-parse --short HEAD 2>/dev/null || echo 'none')",
  "modified_files": $(git diff --name-only HEAD 2>/dev/null | jq -R . | jq -s . || echo '[]')
}
EOF

# 生成人类可读的 handoff 文档
cat > "$HANDOFF_DIR/step-${STEP_ID}.md" << EOF
# Step $STEP_ID Checkpoint

- **Task**: $TASK_ID
- **Step**: $STEP_ID
- **Status**: $STEP_STATUS
- **Time**: $(date)
- **Commit**: $(git rev-parse --short HEAD 2>/dev/null || echo 'none')

## 完成内容
$(git diff --stat HEAD 2>/dev/null || echo 'No changes')

## 下一步
<!-- 由 Agent 填写 -->

## 注意事项
<!-- 由 Agent 填写 -->
EOF

echo "[checkpoint] Task $TASK_ID Step $STEP_ID: $STEP_STATUS"
echo "[checkpoint] Files saved to: $HANDOFF_DIR/"
