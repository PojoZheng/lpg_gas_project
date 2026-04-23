# 目录映射说明（Trellis 默认结构兼容）

本项目采用业务导向目录，不完全等同 Trellis 模板中的 `frontend/backend` 命名。
当前采用“治理层与业务代码同仓，但业务实现已迁移到根目录可见路径”的方案。

## 映射关系
- Trellis `frontend/` 对应：
  - `apps/delivery-app/`（移动端，页面位于 `apps/delivery-app/src`）
  - `apps/platform/`（平台 Web 端，页面位于 `apps/platform/src`）
- Trellis `backend/` 对应：
  - `services/backend/`
- 需求澄清层：
  - 仓库根 `product/`（用户场景、交互收口、产品决策）
- Trellis 跨层规范补充：
  - `master/`（总纲）
  - `shared/`（共享契约）
  - `guides/`（思考指南）

## 为什么这样划分
- 本项目前端有两个独立角色端：配送员端与平台端。
- `delivery-app` 与 `platform` 的职责不同：
  - `delivery-app`：配送员执行端，优先承载高频交易与必要低频执行
  - `platform`：监控、配置、审计与策略下发端
- `master + shared` 能避免跨端重复定义，减少规范冲突。
- `product/` 允许在进入 spec 前，先澄清需求与交互，避免把不稳定需求过早写死进规范。

## 与任务系统的关系
- 每个任务 `input_spec` 必须指向上述目录中的真实文档。
- 当 `requirements/` 尚不稳定时，任务应优先补充引用对应的 `product/` 文档。
- 如任务涉及 UI，需额外满足：
  - 视觉对齐（主色 `#4799a0` + 参考风格）
  - 中文文案
  - 禁用 emoji

## 前端边界（task-25 更新）
- `apps/delivery-app/src` 仅承载配送员端页面与客户端脚本，不再放置平台运营页面。
- `apps/platform/src` 独立承载平台侧页面与客户端脚本（策略发布、监控合规、同步队列等）。
- 两端共享认证能力时，平台侧可引用 `apps/delivery-app/src/auth-client.js`，不改变后端接口契约。

## 当前目录形态

当前仓库的业务实现路径如下：

```text
requirements/
product/
apps/
  delivery-app/
  platform/
services/
  backend/
.trellis/
  spec/
  tasks/
  scripts/
  workspace/
```

`.trellis/delivery-app`、`.trellis/platform`、`.trellis/backend` 当前保留为兼容符号链接，供历史脚本与旧任务文档过渡使用。
