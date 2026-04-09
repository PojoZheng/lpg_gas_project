# 任务完成记录：25-platform-frontend-separation

## 1. 验收结果
- 已将平台页面与客户端脚本从 `/.trellis/delivery-app/src` 拆分到 `/.trellis/platform/src`：
  - `sync-queue.html`、`sync-queue-client.js`
  - `policy-release.html`、`policy-release-client.js`
  - `platform-monitor.html`、`platform-monitor-client.js`
- 已保留可访问入口并完成职责分离：
  - 配送员端工作台入口改为跳转 `/platform/src/*.html`
  - 平台页面返回入口改为 `/delivery-app/src/workbench.html`
- 未改变业务接口契约与权限校验：
  - 平台客户端仍调用既有后端接口（`/sync/*`、`/platform/*`、`/safety/*`）
  - 仍通过 `Authorization` 头沿用现有鉴权链路
- 已更新目录映射文档与代码边界说明（`/.trellis/spec/structure-mapping.md`）。
- 自动化测试通过（见下方测试结果）。

## 2. 引用 spec
- `.trellis/spec/structure-mapping.md`
- `.trellis/spec/platform/index.md`
- `.trellis/spec/master/architecture.md`

## 3. 风险与后续
- 本地预览脚本已调整为以 `/.trellis` 为静态根目录，历史直链（如 `/workbench.html`）需切换到 `/delivery-app/src/workbench.html`。
- 平台侧当前复用 `delivery-app/src/auth-client.js`，后续可抽到 shared 前端模块以进一步降低跨端耦合。
