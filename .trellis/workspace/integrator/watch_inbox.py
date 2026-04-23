#!/usr/bin/env python3
"""
Integrator Agent - Inbox 监听系统
监控 ~/.trellis-bus/lpg_gas_project/inbox/integrator.json
每 5 秒检查一次
"""

import json
import time
import os
from pathlib import Path
from datetime import datetime

INBOX_PATH = Path.home() / ".trellis-bus/lpg_gas_project/inbox/integrator.json"
OUTBOX_PATH = Path.home() / ".trellis-bus/lpg_gas_project/outbox"
LOG_PATH = Path(".trellis/workspace/integrator/inbox_watch.log")

def log(msg):
    """记录日志"""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    entry = f"[{timestamp}] {msg}"
    print(entry)
    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(LOG_PATH, "a", encoding="utf-8") as f:
        f.write(entry + "\n")

def process_message(data):
    """处理收到的消息"""
    msg_type = data.get("type", "unknown")
    task = data.get("task", "unknown")
    
    log(f"📨 收到消息: type={msg_type}, task={task}")
    
    if msg_type == "dispatch":
        if task == "merge-prs":
            instructions = data.get("instructions", {})
            prs = instructions.get("prs", [])
            log(f"   需要合并 {len(prs)} 个 PR:")
            for pr in prs:
                log(f"     - PR #{pr.get('number')}: {pr.get('title')}")
            return {"action": "merge_prs", "prs": prs}
        
        elif task == "update-task-status":
            task_id = data.get("task_id")
            status = data.get("status")
            log(f"   更新任务状态: {task_id} -> {status}")
            return {"action": "update_task", "task_id": task_id, "status": status}
    
    return None

def send_ack(message_id, result):
    """发送确认回复"""
    ack_file = OUTBOX_PATH / f"ack_{message_id}.json"
    OUTBOX_PATH.mkdir(parents=True, exist_ok=True)
    with open(ack_file, "w", encoding="utf-8") as f:
        json.dump({
            "type": "ack",
            "timestamp": datetime.now().isoformat(),
            "result": result
        }, f, indent=2, ensure_ascii=False)
    log(f"📤 发送确认: {ack_file.name}")

def watch():
    """监听循环"""
    log("=" * 50)
    log("Integrator Inbox 监听系统启动")
    log(f"监控路径: {INBOX_PATH}")
    log("=" * 50)
    
    last_mtime = None
    last_content = None
    
    try:
        while True:
            if INBOX_PATH.exists():
                try:
                    mtime = INBOX_PATH.stat().st_mtime
                    
                    # 检查是否有更新
                    if last_mtime != mtime:
                        with open(INBOX_PATH, "r", encoding="utf-8") as f:
                            content = f.read()
                        
                        if content != last_content:
                            try:
                                data = json.loads(content)
                                result = process_message(data)
                                
                                # 发送确认
                                msg_id = data.get("id", f"msg_{int(time.time())}")
                                send_ack(msg_id, result)
                                
                                last_content = content
                            except json.JSONDecodeError as e:
                                log(f"❌ JSON 解析错误: {e}")
                        
                        last_mtime = mtime
                except Exception as e:
                    log(f"❌ 读取错误: {e}")
            else:
                # 文件不存在，静默等待
                pass
            
            time.sleep(5)
            
    except KeyboardInterrupt:
        log("\n监听系统已停止")

if __name__ == "__main__":
    watch()
