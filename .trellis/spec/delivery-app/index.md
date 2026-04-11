# 配送员端 Spec 索引

## 端定位
- 面向配送员的高频业务操作端，遵循“3秒可见核心数据、3步完成核心操作”。
- 底部导航仅允许 3 个常驻 Tab：首页、客户、我的。
- 库存、安检、财务、配置等低频能力统一收敛到“我的”或业务流程触发入口。

## 必读规范
- [设计令牌](./design-tokens.md)
- [UI 交互宣言](./ui-manifest.md)
- [组件库规范](./component-library.md)
- [关键线框流程](./wireflows.md)
- [交互细则](./interaction-spec.md)
- [无障碍规范](./accessibility-spec.md)
- [动效与响应式规范](./responsive-motion-spec.md)
- [中文文案规范](./ui-copy-policy.md)
- [Logo 使用规范](./logo-usage-spec.md)
- [跨端架构总纲](../master/architecture.md)
- [共享实体与状态](../shared/entities.md)

## 业务域目录
| 业务域 | 文件 | 说明 |
|---|---|---|
| 工作台 | [domain-workbench/overview.md](./domain-workbench/overview.md) | 首页收入、待送聚合与快速入口 |
| 订单 | [domain-order/overview.md](./domain-order/overview.md) | 开单、待送、完单、撤销、修改 |
| 客户 | [domain-customer/overview.md](./domain-customer/overview.md) | 客户档案、账户摘要、历史关联 |
| 库存 | [domain-inventory/overview.md](./domain-inventory/overview.md) | 锁定、出库、回滚、盘点、预警 |
| 安检 | [domain-safety/overview.md](./domain-safety/overview.md) | 随瓶安检、拍照、上报 |
| 财务 | [domain-finance/overview.md](./domain-finance/overview.md) | 自动记账、欠款追踪、日结 |
| 配置 | [domain-config/overview.md](./domain-config/overview.md) | 业务参数与策略开关 |
| 系统 | [domain-system/overview.md](./domain-system/overview.md) | 登录认证、同步、消息中心 |

## 来源需求与任务索引

- [需求 → Spec → 任务 追溯表](../REQUIREMENTS_TRACEABILITY.md)

- `requirements/01_工作台/*`
- `requirements/02_订单/*`
- `requirements/03_客户/*`
- `requirements/04_库存/*`
- `requirements/05_安检/*`
- `requirements/06_财务/*`
- `requirements/07_配置/气贩子端需求.md`
- `requirements/08_系统/*`