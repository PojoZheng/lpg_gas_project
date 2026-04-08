# 目录映射说明（Trellis 默认结构兼容）

本项目采用业务导向目录，不完全等同 Trellis 模板中的 `frontend/backend` 命名。

## 映射关系
- Trellis `frontend/` 对应：
  - `delivery-app/`（移动端）
  - `platform/`（平台 Web 端）
- Trellis `backend/` 对应：
  - `backend/`
- Trellis 跨层规范补充：
  - `master/`（总纲）
  - `shared/`（共享契约）
  - `guides/`（思考指南）

## 为什么这样划分
- 本项目前端有两个独立角色端：配送员端与平台端。
- `master + shared` 能避免跨端重复定义，减少规范冲突。

## 与任务系统的关系
- 每个任务 `input_spec` 必须指向上述目录中的真实文档。
- 如任务涉及 UI，需额外满足：
  - 视觉对齐（主色 `#4799a0` + 参考风格）
  - 中文文案
  - 禁用 emoji
