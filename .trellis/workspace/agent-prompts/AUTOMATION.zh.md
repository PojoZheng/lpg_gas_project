# 协调器自动化流程（本机）

目标：**你在主仓协调器会话里决策** → 一条脚本写指针、出广播、弹通知 → **三棵辅 worktree** 按 `SESSION_KICKOFF.zh.md` 粘贴首条消息（开发 A/B/C）；**合并与推 `main`** 仍在**主仓同一会话**（调度 + 集成）完成。

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
| 5 | 打开三棵辅树窗口，分别粘贴 `SESSION_KICKOFF.zh.md` 里 **开发 A / 开发 B / 开发 C** 对应段落；**主仓**会话单独按该文档「主仓：调度 + 集成」一节执行合并与预览 |

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
- 本机脚本**不替代**三棵辅树上的开发与**主仓**里的合并。

## 限制

- Cursor Agent 不会自动读通知；通知只提醒你**去三棵开发窗口（及如需则主仓）发消息**。
- `sync_worktrees.sh` 在非 `main` 分支上对 `origin/main` 做 merge，若有冲突需本地解决。


## 本机消息总线（可选，减少四窗口来回）

你可以让**三棵辅树**上的开发窗口各跑对应监听器；**`--role integrate` 在第三辅树（开发 C，常 `wt-integrate`）目录执行**——与脚本命名一致（**integrate = 开发 C**）。**合并 `main` 仍在主仓会话人工完成**，主仓一般**不**跑 `integrate` 总线监听。

1) 协调器下发（主仓库）：
```bash
python3 ./.trellis/scripts/coordinator_bus_dispatch.py   --dev-a-task .trellis/tasks/07-safety-trigger-report   --dev-b-task .trellis/tasks/08-finance-posting-daily-close   --integrate-task .trellis/tasks/07-safety-trigger-report   --notify
```

2) 监听（`dev-a` / `dev-b` / **`integrate`（= 开发 C，第三辅树）**）：
```bash
# 开发 A（在 wt-04 等辅树目录执行）
python3 ./.trellis/scripts/agent_bus_listener.py --role dev-a --watch --run-bootstrap
# 开发 B（在 wt-17 等辅树目录执行）
python3 ./.trellis/scripts/agent_bus_listener.py --role dev-b --watch --run-bootstrap
# 开发 C（在 wt-integrate 等第三辅树目录执行；总线角色名为 integrate）
python3 ./.trellis/scripts/agent_bus_listener.py --role integrate --watch --run-bootstrap
```

3) 每个窗口完成后回报（在对应窗口执行）：
```bash
python3 ./.trellis/scripts/agent_bus_report.py --role dev-a --status done --task 07-safety-trigger-report --commit <hash> --summary "acceptance 完成"
```

4) 协调器汇总查看（主仓库）：
```bash
python3 ./.trellis/scripts/coordinator_bus_collect.py
```

说明：监听器能自动切 `.current-task` + 跑 bootstrap，但**不能替代 Agent 聊天窗口做编码决策**；它主要减少你手动分发与回收状态的次数。
