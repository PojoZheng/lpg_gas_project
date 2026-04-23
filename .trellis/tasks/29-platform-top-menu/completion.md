# 29-platform-top-menu completion

## 变更概览
- 新增平台单入口页面：`/apps/platform/src/index.html`，作为 platform 验收主链接。
- 为 `platform-monitor.html`、`policy-release.html`、`sync-queue.html` 增加统一顶部菜单（monitor/policy/sync）。
- 顶部菜单支持当前页高亮，页面状态可识别。
- 三个平台页面的返回按钮统一改为“返回平台入口”，并跳转 `./index.html`，减少多链接记忆成本。
- 未改动任何平台业务接口调用逻辑与鉴权分支，保持接口契约不变。

## 验收导航说明
- 平台主入口（推荐验收单链接）：`/index.html`
- 入口页可一跳进入：
  - 监控：`/platform-monitor.html`
  - 策略：`/policy-release.html`
  - 同步：`/sync-queue.html`

## 验证
- `python3 ./.trellis/scripts/auto_test_runner.py --once` 通过
- `bash ./.trellis/scripts/start_local_preview.sh --check-only` 通过
