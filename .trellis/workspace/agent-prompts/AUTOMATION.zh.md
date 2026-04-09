# 协调器自动化流程（本机）

目标：**你在协调器会话里决策** → 一条脚本写指针、出广播、弹通知 → 三窗口按 `SESSION_KICKOFF.zh.md` 粘贴首条消息即可继续。

## 一次性配置

1. 若尚未创建 worktree，可参考 `.trellis/scripts/setup_parallel_worktrees.example.sh`。
2. 复制并编辑本地配置（**不提交**）：
   ```bash
   cp .trellis/scripts/coordinator.env.example .trellis/scripts/coordinator.env
   # 编辑 coordinator.env：填写三个 worktree 绝对路径与本轮 COORDINATOR_*_TASK
   ```
3. `coordinator.env` 已在 `.trellis/.gitignore` 中忽略。

## 每轮推荐节奏

| 步骤 | 动作 |
|------|------|
| 1 | （可选）各机先对齐代码：`bash .trellis/scripts/sync_worktrees.sh` |
| 2 | 在 `coordinator.env` 中更新本轮 `COORDINATOR_*_TASK`（或先 `python3 .trellis/scripts/suggest_next_task.py` 参考） |
| 3 | 执行：`bash .trellis/scripts/coordinator_round.sh` |
| 4 | 查看终端打印的广播；若开启 `COORDINATOR_NOTIFY`，本机会弹通知 |
| 5 | 打开三窗口，分别粘贴 `SESSION_KICKOFF.zh.md` 里 **开发 A / 开发 B / 集成** 对应段落 |

仅想看主链建议、**不写指针**时：

```bash
bash .trellis/scripts/coordinator_round.sh --suggest-only
```

关闭通知（仍写指针与打印广播）：

```bash
COORDINATOR_NOTIFY=0 bash .trellis/scripts/coordinator_round.sh
```

## 与 CI 的关系

- Push 后 GitHub Actions 跑 `.github/workflows/ci.yml`（静态检查 + 冒烟）。
- 本机脚本**不替代**三窗口里的实现与合并。

## 限制

- Cursor Agent 不会自动读通知；通知只提醒你**去三窗口发消息**。
- `sync_worktrees.sh` 在非 `main` 分支上对 `origin/main` 做 merge，若有冲突需本地解决。
