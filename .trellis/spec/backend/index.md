# 后端 Spec 索引

## 端定位
- 后端是同步协调、合规上报、策略下发与数据汇总中心。
- 采用“移动端离线优先，后端最终一致”策略，不阻塞前台业务操作。

## 必读规范
- [目录结构](./directory-structure.md)
- [数据库约束](./database-guidelines.md)
- [错误处理](./error-handling.md)
- [日志规范](./logging-guidelines.md)
- [质量规范](./quality-guidelines.md)
- [共享协议](../shared/sync-protocol.md)

## 业务域目录
| 业务域 | 文件 | 说明 |
|---|---|---|
| 用户域 | [domain-user/overview.md](./domain-user/overview.md) | 认证、会话、设备、安全 |
| 订单域 | [domain-order/overview.md](./domain-order/overview.md) | 订单生命周期与跨域编排 |
| 库存域 | [domain-inventory/overview.md](./domain-inventory/overview.md) | 库存事务、锁定与回滚 |
| 财务域 | [domain-finance/overview.md](./domain-finance/overview.md) | 账务流水、日结、债务 |
| 安检域 | [domain-safety/overview.md](./domain-safety/overview.md) | 安检记录、上报与重试 |
| 配置域 | [domain-config/overview.md](./domain-config/overview.md) | 规则下发、版本化、审计 |

## 来源需求
- `requirements/00_全局/*`
- `requirements/02_订单/*`
- `requirements/04_库存/*`
- `requirements/05_安检/*`
- `requirements/06_财务/*`
- `requirements/07_配置/*`
- `requirements/08_系统/*`
