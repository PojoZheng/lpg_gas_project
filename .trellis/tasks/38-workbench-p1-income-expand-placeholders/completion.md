# 任务完成记录：38-workbench-p1-income-expand-placeholders

## 验收结果
- [x] 今日收入卡（「今天能赚多少钱」）增加「查看更多 / 收起」切换，展开区含「今日毛利」固定展示 `￥0.00` 与成本未接入说明，以及「近 7 日趋势」空态与图表待接入说明。
- [x] 使用 `aria-expanded`、`aria-controls`、展开区 `role="region"` 与可见标题的 `visually-hidden` 辅助；主切换按钮带 `aria-label`。
- [x] 文案均为中文、无 emoji；展开区使用浅底与次要文字色，主操作仍为主操作区「快速开单」主色按钮，未抢主操作色。
- [x] 未修改 `workbench-client.js` 与后端 `/workbench/overview` 契约；毛利与趋势未接真实字段，页面为 **静态占位**（与既有已收/待收 mock 行为一致时在 completion 中说明）。

## 关键改动
- `apps/delivery-app/src/workbench.html`：收入卡结构、`setIncomeExpanded` 交互与局部样式。
- `.trellis/spec/delivery-app/domain-workbench/REQUIREMENTS_01_COVERAGE.md`：§1、§2 §3.1、规格「收入卡折叠/展开」行及 §5 P1 首行状态。
- `.trellis/scripts/task38_income_expand_smoke.py`、`.trellis/tasks/test-commands.json`：任务 38 校验命令。

## Mock / 占位说明
- 「今日毛利」数值固定为 `￥0.00`，不随 `finance` 接口变化；待成本/进货数据进入工作台接口后再绑定。
- 「近 7 日趋势」无图表库、无序列数据，仅空态框与说明文案。

## 校验
- `python3 ./.trellis/scripts/auto_test_runner.py --once`（`.current-task` 指向本任务时）
- `node --check "apps/delivery-app/src/workbench-client.js"`
