# Task-16 完成说明（工作台体验优化）

## 本轮范围
- 仅改工作台 UI/交互层，不修改后端接口契约与业务字段。
- 对齐输入规范：`domain-workbench/overview`、`ui-manifest`、`ui-copy-policy`。

## 关键完成项
1. **同步提示从常驻卡改为按条件模态**
   - 取消常驻同步状态卡。
   - 在线且存在待同步时自动弹出同步模态，展示待同步条数并提供“立即同步 / 稍后处理”。
   - 同步失败时显式提供“查看同步明细 / 重试失败项”入口。
2. **刷新反馈统一**
   - 新增“刷新”按钮，与下拉刷新统一走同一刷新逻辑与提示文案。
   - 加载中、成功、失败反馈收口到统一提示区域。
3. **离线/联网提示一致**
   - 新增网络状态徽标（在线/离线）。
   - 统一离线与联网中文提示：离线强调仅展示缓存，联网强调可刷新。
4. **下一待配送卡可行动**
   - 新增“查看详情 / 开始配送”两个动作，进入待配送流程页。
5. **空状态补齐**
   - 收款为空时提示“今日暂无收款数据，可先去快速开单”。
   - 待配送为空时提示“暂无待配送，可前往快速开单创建新订单”。

## 影响文件
- `.trellis/delivery-app/src/workbench.html`
- `.trellis/delivery-app/src/workbench-client.js`
- `.trellis/scripts/task16_workbench_closure.py`
- `.trellis/scripts/task16_workbench_smoke.py`
- `.trellis/tasks/16-workbench-experience-polish/task.json`
- `.trellis/tasks/test-commands.json`

## 验证
- `python3 ./.trellis/scripts/task16_workbench_closure.py`
- `python3 ./.trellis/scripts/task16_workbench_smoke.py`
- `python3 ./.trellis/scripts/auto_test_runner.py --once`
