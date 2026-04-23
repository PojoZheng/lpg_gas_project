# Task 40：从工作台底部 Sheet 进入快速开单（完成说明）

## 实现摘要

- **主路径**：`workbench.html` 主操作「快速开单」在单页内打开底部 Sheet（`z-index: 75`，高于同步模态 `60`）。
- **动线**：规格 §1.2 — 点击后主按钮约 **150ms** 缩小动效，面板自底部 **250ms** 滑入（`cubic-bezier(0.22, 1, 0.36, 1)`）。
- **步骤**：① 搜索 + 客户列表（`fetchQuickCustomers` / `filterQuickCustomers`）；② 确认规格、数量、单价、稍后配送 / 当场完成；③ `checkInventory` + `quickCreateOrder` 提交。
- **关闭**：点击遮罩、顶部「关闭」、`Escape`、手柄区**向下轻扫**（位移阈值约 72px）。
- **接口**：未改后端契约；与 `quick-order-client.js` 复用相同 API 与 `localStorage` 键 `quick-order-prefs-v1`，与独立开单页偏好一致。

## 仍跳转 `quick-order.html` 的原因与等价路径

| 场景 | 原因 | 返回路径 |
|------|------|----------|
| 添加新客户 | 静态原型避免在 `workbench.html` 内重复大块「新客户」表单与校验；与现有 `quick-order` 内联 overlay 一致 | 链接 `quick-order.html?from=workbench&intent=newCustomer`：进入后自动打开「添加新客户」sheet；`返回首页` / 顶栏返回仍回 `workbench.html` |
| 更多字段、连续开单、展开确认等 | 规格 §1.2 后续分支（展开更多、连续开单模式等）仍在 `quick-order.html` 维护 | 链接 `quick-order.html?from=workbench`；页内「返回首页」回工作台 |

与规格差异：Sheet 内为**两步**（选客户→确认），未实现图中「列表内一键开单跳过确认」等高级分支；这些在独立页保留。

## 风险与后续

- Sheet 与底栏同时存在时需注意滚动与安全区；当前 `max-height: min(88vh, 640px)` + `overflow: auto` 缓解。
- 当场完成依赖用户填写实收；与独立页校验规则对齐（实收不得小于应收）。

## 涉及文件

- `apps/delivery-app/src/workbench.html`：Sheet 结构、样式与逻辑。
- `apps/delivery-app/src/quick-order.html`：`from=workbench&intent=newCustomer` 衔接。
- `.trellis/spec/delivery-app/domain-workbench/REQUIREMENTS_01_COVERAGE.md`：§1 / §3 / §4 / §5 与 task-40 对齐说明。
