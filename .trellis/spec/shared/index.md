# Shared Spec 索引

## 作用
`shared` 用于承载跨端共享的数据契约，避免在端内文档重复定义。

## 文档清单
- [共享实体字典](./entities.md)
- [状态与枚举](./enums-and-statuses.md)
- [离线同步协议](./sync-protocol.md)
- [接口契约与错误码](./api-contracts.md)

## 使用规则
- 端内 spec 只引用共享定义，不重复定义字段语义。
- 新增跨域字段时，先更新 `shared`，再更新端内引用。
