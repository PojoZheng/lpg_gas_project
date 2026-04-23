#!/usr/bin/env python3
"""
Integrator Agent - PR 自动监听系统
监控远程分支状态，检测新的 PR 需要合并
"""

import subprocess
import json
import time
from datetime import datetime
from pathlib import Path

WORKSPACE = Path(".trellis/workspace/integrator")
STATE_FILE = WORKSPACE / "pr_state.json"
LOG_FILE = WORKSPACE / "monitor.log"

def log(msg):
    """记录日志"""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    entry = f"[{timestamp}] {msg}"
    print(entry)
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(entry + "\n")

def run_git(args):
    """执行 git 命令"""
    result = subprocess.run(
        ["git"] + args,
        capture_output=True,
        text=True
    )
    return result.stdout.strip()

def fetch_origin():
    """获取远程最新状态"""
    run_git(["fetch", "origin"])

def get_unmerged_branches():
    """获取未合并到 main 的远程分支"""
    output = run_git(["branch", "-r", "--no-merged", "origin/main"])
    if not output:
        return []
    branches = [b.strip() for b in output.split("\n") if b.strip()]
    # 过滤掉 HEAD 和 main
    return [b for b in branches if "HEAD" not in b and "main" not in b]

def get_branch_info(branch):
    """获取分支详细信息"""
    # 获取最新提交信息
    commit_msg = run_git(["log", "-1", "--format=%s", branch])
    commit_author = run_git(["log", "-1", "--format=%an", branch])
    commit_date = run_git(["log", "-1", "--format=%ar", branch])
    commit_hash = run_git(["log", "-1", "--format=%h", branch])
    
    return {
        "branch": branch,
        "commit_hash": commit_hash,
        "message": commit_msg,
        "author": commit_author,
        "date": commit_date
    }

def load_state():
    """加载上次状态"""
    if STATE_FILE.exists():
        with open(STATE_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"branches": {}, "last_check": None}

def save_state(state):
    """保存当前状态"""
    state["last_check"] = datetime.now().isoformat()
    WORKSPACE.mkdir(parents=True, exist_ok=True)
    with open(STATE_FILE, "w", encoding="utf-8") as f:
        json.dump(state, f, indent=2, ensure_ascii=False)

def check_new_prs():
    """检查新的 PR"""
    log("=" * 50)
    log("开始检查 PR 状态...")
    
    # 获取远程更新
    fetch_origin()
    
    # 获取当前未合并分支
    current_branches = get_unmerged_branches()
    state = load_state()
    
    new_prs = []
    updated_prs = []
    
    for branch in current_branches:
        info = get_branch_info(branch)
        branch_name = branch.replace("origin/", "")
        
        if branch_name not in state["branches"]:
            # 新分支
            new_prs.append(info)
            log(f"🆕 新 PR 检测: {branch_name}")
            log(f"   提交: {info['commit_hash']} - {info['message']}")
            log(f"   作者: {info['author']} ({info['date']})")
        else:
            # 检查是否有更新
            old_hash = state["branches"][branch_name].get("commit_hash")
            if old_hash != info["commit_hash"]:
                updated_prs.append(info)
                log(f"📝 PR 更新: {branch_name}")
                log(f"   新提交: {info['commit_hash']} - {info['message']}")
    
    # 更新状态
    state["branches"] = {
        b.replace("origin/", ""): get_branch_info(b) 
        for b in current_branches
    }
    save_state(state)
    
    # 输出汇总
    log(f"\n📊 汇总:")
    log(f"   待合并分支: {len(current_branches)} 个")
    log(f"   新 PR: {len(new_prs)} 个")
    log(f"   更新 PR: {len(updated_prs)} 个")
    
    if current_branches:
        log(f"\n📋 待合并列表:")
        for branch in current_branches:
            branch_name = branch.replace("origin/", "")
            info = state["branches"].get(branch_name, {})
            status = "🆕 NEW" if branch_name in [p["branch"].replace("origin/", "") for p in new_prs] else "⏳"
            log(f"   {status} {branch_name}")
    
    log("检查完成")
    return new_prs, updated_prs

def main():
    """主循环"""
    log("=" * 50)
    log("Integrator Agent - PR 监听系统启动")
    log("=" * 50)
    
    # 立即执行一次检查
    check_new_prs()
    
    # 持续监听（每 30 秒检查一次）
    try:
        while True:
            time.sleep(30)
            check_new_prs()
    except KeyboardInterrupt:
        log("\n监听系统已停止")

if __name__ == "__main__":
    main()
