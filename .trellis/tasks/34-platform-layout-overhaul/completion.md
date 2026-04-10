# Task-34 完成说明（platform-layout-overhaul）

## 改造范围
- 页面：`index`、`platform-monitor`、`policy-release`、`sync-queue`
- 仅改 UI/交互层，未改接口契约与数据请求结构

## 结构级调整
1. 统一框架层
   - 四页统一 `侧栏 + 顶栏 + 面包屑 + 标题区`。
   - 统一“返回平台入口”与“快速入口”路径，保证可达性。
2. 指标与卡片层级
   - 增加 `page-hero`、`kpi-grid`、`kpi-card`，形成“标题区 -> 指标区 -> 内容卡片区”层级。
   - `sync-queue` 统计区改为 KPI 卡片化，弱化表单感。
3. 组件体系统一
   - 按钮体系统一为 `primary / secondary / ghost / danger / disabled`。
   - 筛选区统一为 `filter-panel + filter-grid + switch-line`。
   - 列表区域统一为 `table-card + table-head`。

## DESIGN.md 对照
- 主色与交互：统一主色 `#4799a0`，主态与激活态不使用黑色品牌主态。
- 字体：标题与关键数字优先 `Space Grotesk`，正文表单优先 `Inter`。
- 令牌：圆角、间距、边框风格统一并对齐 DESIGN 语义。
- 中文文案与低噪音卡片化表达保持一致。

## 接口契约确认
- `platform-monitor-client.js`、`policy-release-client.js`、`sync-queue-client.js` 的调用路径、参数、字段均未变更。
- 所有已有按钮行为仍由原页面脚本驱动，仅调整样式与布局容器。
