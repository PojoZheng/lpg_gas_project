#!/bin/bash
# Integrator Daemon - 自动监听 trellis bus 并合并 PR
# 只在 Integrator Agent (Pane 1) 中运行

REPO_ROOT="/Users/zhengpeipei/多立恒/概念验证/lpg_gas_project"
BUS_DIR="$HOME/.trellis-bus/lpg_gas_project"
INBOX="$BUS_DIR/inbox/integrator.json"
LOG_FILE="/tmp/integrator_daemon.log"
PID_FILE="/tmp/integrator_daemon.pid"

# 记录日志
log() {
    echo "[$(date '+%H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# 检查是否在 main 分支
check_main_branch() {
    cd "$REPO_ROOT"
    local branch=$(git branch --show-current)
    if [ "$branch" != "main" ]; then
        log "ERROR: Not on main branch (current: $branch)"
        return 1
    fi
    return 0
}

# 处理 PR 合并
merge_pr() {
    local branch=$1
    local task_id=$2
    
    log "Processing PR: $branch (Task: $task_id)"
    
    cd "$REPO_ROOT"
    
    # 获取最新
    git fetch origin
    
    # 尝试合并
    if git merge "origin/$branch" --no-edit 2>&1 | tee -a "$LOG_FILE"; then
        log "Merge successful: $branch"
        
        # Push to main
        if git push origin main 2>&1 | tee -a "$LOG_FILE"; then
            log "Pushed to main: $branch"
            
            # 更新 task 状态
            update_task_status "$task_id"
            
            # 发送确认
            send_ack "$task_id" "merged"
            return 0
        else
            log "ERROR: Push failed for $branch"
            send_ack "$task_id" "push_failed"
            return 1
        fi
    else
        log "ERROR: Merge conflict for $branch"
        send_ack "$task_id" "conflict"
        # 重置合并
        git merge --abort 2>/dev/null || true
        return 1
    fi
}

# 更新 task 状态
update_task_status() {
    local task_id=$1
    local task_file="$REPO_ROOT/.trellis/tasks/$task_id/task.json"
    
    if [ -f "$task_file" ]; then
        # 更新 status 为 completed
        python3 -c "
import json
with open('$task_file', 'r') as f:
    data = json.load(f)
data['status'] = 'completed'
with open('$task_file', 'w') as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
" 2>&1 | tee -a "$LOG_FILE"
        log "Updated task status: $task_id -> completed"
    fi
}

# 发送确认回执
send_ack() {
    local task_id=$1
    local status=$2
    local ack_file="$BUS_DIR/acks/integrator-$(date +%s).json"
    
    cat > "$ack_file" << EOF
{
  "from": "integrator",
  "to": "pm-arch",
  "type": "PR_MERGED",
  "task_id": "$task_id",
  "status": "$status",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
    log "Sent ack: $task_id -> $status"
}

# 主循环
main_loop() {
    log "=== Integrator Daemon Started ==="
    log "PID: $$"
    echo $$ > "$PID_FILE"
    
    while true; do
        # 检查 inbox
        if [ -f "$INBOX" ]; then
            # 读取消息
            local msg=$(cat "$INBOX" 2>/dev/null)
            if [ -n "$msg" ]; then
                log "Received message: $(echo "$msg" | head -1)"
                
                # 解析消息
                local type=$(echo "$msg" | python3 -c "import json,sys; print(json.load(sys.stdin).get('type',''))" 2>/dev/null)
                local branch=$(echo "$msg" | python3 -c "import json,sys; print(json.load(sys.stdin).get('branch',''))" 2>/dev/null)
                local task_id=$(echo "$msg" | python3 -c "import json,sys; print(json.load(sys.stdin).get('task_id',''))" 2>/dev/null)
                
                if [ "$type" = "PR_SUBMITTED" ] && [ -n "$branch" ]; then
                    log "Processing: $branch"
                    
                    # 检查 main 分支
                    if check_main_branch; then
                        merge_pr "$branch" "$task_id"
                    fi
                fi
                
                # 清空 inbox（已处理）
                rm -f "$INBOX"
            fi
        fi
        
        # 每 10 秒检查一次
        sleep 10
    done
}

# 启动
case "$1" in
    start)
        main_loop &
        ;;
    stop)
        if [ -f "$PID_FILE" ]; then
            kill $(cat "$PID_FILE") 2>/dev/null
            rm -f "$PID_FILE"
            log "Daemon stopped"
        fi
        ;;
    status)
        if [ -f "$PID_FILE" ] && kill -0 $(cat "$PID_FILE") 2>/dev/null; then
            echo "Running (PID: $(cat $PID_FILE))"
            tail -5 "$LOG_FILE"
        else
            echo "Not running"
        fi
        ;;
    *)
        echo "Usage: $0 {start|stop|status}"
        exit 1
        ;;
esac
