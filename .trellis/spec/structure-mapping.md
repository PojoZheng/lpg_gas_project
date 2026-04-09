# 目录映射说明（Trellis 默认结构兼容）

本项目采用业务导向目录，不完全等同 Trellis 模板中的 `frontend/backend` 命名。

## 映射关系
- Trellis `frontend/` 对应：
  - `delivery-app/`（移动端，页面位于 `delivery-app/src`）
  - `platform/`（平台 Web 端，页面位于 `platform/src`）
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

## 前端边界（task-25 更新）
- `delivery-app/src` 仅承载配送员端页面与客户端脚本，不再放置平台运营页面。
- `platform/src` 独立承载平台侧页面与客户端脚本（策略发布、监控合规、同步队列等）。
- 两端共享认证能力时，平台侧可引用 `delivery-app/src/auth-client.js`，不改变后端接口契约。
