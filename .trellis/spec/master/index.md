# Master Spec 索引

## 作用
`master` 是三端共识层，用于定义产品边界、跨端架构、非功能约束与域关系图。

若原始需求仍存在分歧，先在仓库根目录的 `product/` 层完成场景与交互收口，再将稳定结论沉淀回 `master`。

## 文档清单
- [架构总纲](./architecture.md)
- [产品总览](./product-overview.md)
- [业务域地图](./domain-map.md)
- [需求 → Spec → 任务 追溯表](../REQUIREMENTS_TRACEABILITY.md)

## 适用范围
- 所有端（delivery-app/platform/backend）都必须遵守本目录约束。
- 端内文档与 `shared` 文档冲突时，以 `master` 为准。

## 来源需求
- `requirements/README.md`
- `product/README.md`
- `requirements/00_全局/产品概述.md`
- `requirements/00_全局/核心认知.md`
- `requirements/00_全局/业务流程.md`
- `requirements/00_全局/术语表.md`
