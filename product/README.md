# Product Layer

本目录位于 `requirements/` 与 `.trellis/spec/` 之间，用于承接“需求尚未完全确定”时的产品澄清工作。

## 目标

- 将原始需求整理为可讨论、可追踪的用户场景
- 在生成 spec 与 task 前，先明确页面职责、信息优先级与关键交互
- 记录已确认 / 待确认 / 放弃的产品决策，减少开发阶段反复偏航

## 目录

- `scenarios/`：用户故事、场景链路、角色目标
- `interaction/`：页面职责、导航归属、关键交互与状态反馈
- `decisions/`：产品决策日志与未决问题
- `templates/`：标准模板

## 推荐流程

1. `requirements/` 提供原始业务输入
2. 在 `product/scenarios/` 编写用户场景
3. 在 `product/interaction/` 收敛页面职责与交互边界
4. 在 `product/decisions/` 记录确认结论与遗留问题
5. 将稳定内容沉淀到 `.trellis/spec/`
6. 再由 `.trellis/tasks/` 生成可执行任务

## 与 Trellis 的关系

- `requirements/` 允许不完整，但必须真实反映当前认知
- `product/` 允许迭代更新，是需求澄清层
- `.trellis/spec/` 应尽量保持稳定，是开发约束层
- `.trellis/tasks/` 是执行层，优先引用 `product/` 已确认的场景与交互文件
