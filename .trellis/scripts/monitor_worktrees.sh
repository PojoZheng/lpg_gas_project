#!/bin/bash
# 每分钟监控各 worktree pane 状态
# 自动处理卡住的情况

LOG_FILE="/tmp/pane_monitor.log"

log() {
    echo "[$(date '+%H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# 检查 pane 是否需要批准
approve_if_needed() {
    local pane=$1
    local output=$(tmux capture-pane -t "$pane" -p 2>/dev/null | tail -10)
    
    # 检查是否在等待命令批准
    if echo "$output" | grep -q "ACTION REQUIRED"; then
        log "⚠️ $pane: 检测到确认对话框，自动批准"
        # 选择 option 2 (Approve for this session)
        tmux send-keys -t "$pane" "2" Enter
        log "✅ $pane: 已批准本 session"
        return 0
    fi
    
    # 检查是否在等待文件编辑批准
    if echo "$output" | grep -qE "WriteFile|StrReplaceFile.*requesting approval"; then
        log "⚠️ $pane: 检测到文件编辑确认，自动批准"
        tmux send-keys -t "$pane" "y" Enter
        log "✅ $pane: 文件编辑已批准"
        return 0
    fi
    
    return 1
}

# 检查 pane 工作状态
check_pane_status() {
    local pane=$1
    local name=$2
    local output=$(tmux capture-pane -t "$pane" -p 2>/dev/null | tail -15)
    
    # 先尝试自动批准
    approve_if_needed "$pane"
    
    # 检查工作状态
    if echo "$output" | grep -qE "Using|Used|Writing|Reading|StrReplace|WriteFile|Grep|Shell.*cd"; then
        log "🔄 $name ($pane): 工作中"
    elif echo "$output" | grep -qE "完成|done|finished|completed"; then
        log "✅ $name ($pane): 可能已完成"
    elif echo "$output" | grep -qE "等待|waiting|pause|待命"; then
        log "⏸️ $name ($pane): 等待中"
    else
        log "💤 $name ($pane): 空闲"
    fi
}

# 主循环
log "=== 开始监控 ==="

# 检查每个 pane
check_pane_status "%1" "DevA-Task43"
check_pane_status "%2" "DevB-Standby"
check_pane_status "%3" "DevC-Standby"

log "=== 监控结束 ==="
