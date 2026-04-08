# 状态与枚举

## 订单状态
- `pending_delivery`：待配送
- `completed`：已完成
- `cancelled`：已取消
- `returned`：已退货

## 同步状态
- `pending`：待同步
- `syncing`：同步中
- `completed`：已同步
- `failed`：同步失败

## 收款状态
- `unpaid`：未收
- `partial_paid`：部分收款
- `paid`：已收清

## 安检状态
- `normal`：正常
- `abnormal`：异常
- `skipped`：跳过待补
- `reported`：已上报

## 债务状态
- `active`：未结清
- `overdue`：已超期
- `settled`：已结清
- `waived`：已免除

## 来源需求
- `requirements/02_订单/规格.md`
- `requirements/05_安检/规格.md`
- `requirements/06_财务/规格.md`
- `requirements/08_系统/需求.md`
