# 共享实体字典

## 核心交易实体
- `Order`：订单主记录，包含订单类型、状态、应收实收、客户与库存关联。
- `OrderItem`：订单明细，按规格记录数量、单价。
- `Customer`：客户基础档案与标签。
- `InventorySnapshot`：库存快照，按规格区分重瓶/空瓶及可用量。
- `InventoryLog`：库存事务日志（锁定、出库、回滚、盘点、充装）。
- `InspectionRecord`：安检记录，含检查项、照片、上报状态。
- `FinanceEntry`：财务流水，区分收入、支出、调整。
- `DebtRecord`：欠款/欠瓶记录与催收状态。

## 系统与同步实体
- `User`：配送员账号主体。
- `LoginDevice`：设备会话与安全信息。
- `Notification`：消息中心记录。
- `OfflineQueue`：离线待同步队列。
- `DataSyncLog`：同步批次与冲突处理日志。

## 平台侧实体
- `DealerProfile`：经销商/配送组织信息。
- `RegionPolicy`：区域策略模板与覆盖配置。
- `ComplianceReport`：监管上报记录。

## 来源需求
- `requirements/00_全局/实体清单.md`
- `requirements/02_订单/数据模型.md`
- `requirements/08_系统/数据模型.md`
