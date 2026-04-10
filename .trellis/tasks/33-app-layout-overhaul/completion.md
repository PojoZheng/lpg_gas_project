# task-33 完成说明（App Layout Overhaul）

## 改造范围
- `workbench.html`
- `quick-order.html`
- `delivery-complete.html`
- `my.html`
- `delivery-shell.css`

## 前后对照要点

### 1) 信息层级重排（结构级）
- **workbench**
  - 由“概览+操作+待办”扩展为“概览+主操作+待办+系统状态”四层结构。
  - 将同步/登录辅助入口收敛到系统状态卡，主操作与待办分层更清晰。
- **quick-order**
  - 从“两大卡片”改为“客户选择 / 订单配置 / 提交与反馈”三段式结构。
  - 提交流程与反馈区域拆分，首屏重点更明确。
- **delivery-complete**
  - 保留业务分卡但统一头部、反馈区与状态表达，操作区主次更清晰。
- **my**
  - 从单一“流程入口”改为“高频入口 + 管理入口”双分组结构，信息聚焦。

### 2) 导航与登录入口统一
- 底部导航保留并统一为“首页 / 客户 / 我的”，视觉与激活态统一。
- 四页均可见登录入口：
  - workbench 顶部登录按钮 + 系统状态卡账号入口
  - quick-order 顶部登录按钮
  - delivery-complete 顶部登录按钮
  - my 顶部登录按钮 + 管理区登录入口

### 3) 空/加载/错误状态统一
- 基于共享样式新增统一状态块：`state-block info/success/error/loading`。
- 四页反馈文案统一中文化表达，加载/错误/空状态可感知且风格一致。

### 4) token/component 落地
- 统一使用 `delivery-shell.css` 中 token 与组件层：
  - token：颜色、字体、圆角、间距
  - 组件：`app-btn`、`app-card`、`nav-btn`、`app-input/app-select`、`state-block`
- 页面内样式改为在共享组件基础上做最小局部覆盖，避免“各自为政”。

## 约束确认
- 未修改接口契约与业务 API 语义，仅调整 UI/交互实现层。

## 验证
- `python3 ./.trellis/scripts/task33_app_layout_overhaul.py`
- `python3 ./.trellis/scripts/auto_test_runner.py --once`
