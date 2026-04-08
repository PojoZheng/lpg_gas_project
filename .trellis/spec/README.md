# Spec 总索引

本目录是项目在 Trellis 下的规范单一入口，所有任务执行前应先阅读本索引。

## 阅读顺序（推荐）
1. `master/`：产品与架构总纲
2. `shared/`：共享实体、状态、接口、同步协议
3. `delivery-app/`、`platform/`、`backend/`：端侧与后端域规范
4. `guides/`：实现前思考清单

## 目录结构
- `master/`：产品总览、域关系、跨端约束
- `shared/`：跨端统一契约（实体/状态/同步/API）
- `delivery-app/`：配送员端规范（设计与业务域）
- `platform/`：平台端规范（配置/监控/合规/管理）
- `backend/`：后端规范（业务域与工程约束）
- `guides/`：思考指南（复用、跨层）

## 统一约束
- 视觉主色：`#4799a0`
- 界面文案：中文
- 界面禁令：严禁使用 emoji
- 任务开发：必须引用对应 `input_spec`

## 对应说明
若你熟悉 Trellis 默认模板中的 `frontend/backend` 结构，请先阅读：
- `./structure-mapping.md`
