# task-31 完成说明（App 端 DESIGN.md 增量对齐）

## 本轮策略
- 基于当前已合入的移动端结果做增量修正，不整包重做。
- 优先补齐 DESIGN.md 缺失与未达项：颜色、字体、圆角、间距、统一组件层。

## 变更内容
- 新增 `/.trellis/spec/delivery-app/DESIGN.md`，补齐 task-31 输入规范缺口。
- 统一强化共享样式 `delivery-shell.css`：
  - token：主色 `#4799a0`、中性色 `#424949`、字体 `Space Grotesk/Inter`
  - 组件层：`app-btn/app-card/nav-btn/app-input/app-select`
  - 调整过大视觉参数为“subtle + normal”（圆角、间距、标题尺寸）。
- 四页增量修正：
  - `workbench.html`：同步模态标题与圆角走 token，保留既有流程。
  - `quick-order.html`：卡片标题、搜索/弹层标题、表单控件更一致地走 token。
  - `delivery-complete.html`：卡片/按钮/支付按钮/标题统一 token 化。
  - `my.html`：入口标题统一标题字体 token。

## 变更页面
- `apps/delivery-app/src/workbench.html`
- `apps/delivery-app/src/quick-order.html`
- `apps/delivery-app/src/delivery-complete.html`
- `apps/delivery-app/src/my.html`
- `apps/delivery-app/src/delivery-shell.css`

## 验证
- `python3 ./.trellis/scripts/task31_app_design_md_refactor.py`
- `python3 ./.trellis/scripts/auto_test_runner.py --once`

## 约束确认
- 本轮仅 UI/交互增量对齐，未改接口契约与业务语义。
