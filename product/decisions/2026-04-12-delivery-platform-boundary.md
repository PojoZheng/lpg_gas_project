# 2026-04-12 delivery-app / platform 边界重构

- 状态：confirmed
- 相关任务：48-debt-management
- 相关场景：`product/scenarios/48-debt-management-story.md`

## 背景

当前仓库中 `delivery-app`、`platform` 与 `.trellis` 共处一层，且部分页面容易因为入口安排不清晰而出现功能堆叠。原始 `requirements/` 文档也并非全部稳定，导致 spec 与实现可能过早固化。

## 备选方案

1. 继续保持 `requirements -> spec -> task -> code` 的直线流程
2. 在 `requirements` 与 `spec` 之间加入 `product` 层，先沉淀场景、交互与决策，再进入 spec 与 task

## 决策

采用方案 2。新增 `product/` 作为产品澄清层，并明确：

- `delivery-app` 负责配送员高频执行与必要低频执行
- `platform` 负责监控、配置、审计与策略下发
- `backend` 负责共享事实、同步协调与规则执行
- `product` 负责把模糊需求转成可执行的场景与交互边界

## 影响

- 对 spec：后续新增或重做功能时，`input_spec` 应优先补充对应 `product/` 文件
- 对 task：任务验收需同时覆盖规范符合性与用户故事完整性
- 对实现：页面职责优先清理，再做视觉优化
- 对测试：引入用户故事测试目录，逐步替代仅按接口/页面命名的 smoke 测试
