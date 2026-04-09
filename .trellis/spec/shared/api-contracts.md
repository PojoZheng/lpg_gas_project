# 接口契约与错误码

## 通用响应
```json
{
  "success": true,
  "data": {},
  "error": null,
  "request_id": "uuid"
}
```

### 认证接口约定（task-14）
- 适用接口：`/auth/send-code`、`/auth/login`、`/auth/refresh`、`/auth/devices`
- 成功响应统一：
  - `success=true`
  - `data` 为业务数据
  - `error=null`
  - `request_id` 必填
- 失败响应统一：
  - `success=false`
  - `data=null`
  - `error` 为对象：`{ code, message }`
  - `request_id` 必填

## 关键接口分组
- 认证：`/auth/send-code`、`/auth/login`、`/auth/refresh`
- 订单：`/orders`、`/orders/:id/complete`、`/orders/:id/cancel`
- 库存：`/inventory/snapshot`、`/inventory/locks`、`/inventory/reconcile`
- 同步：`/sync/push`、`/sync/pull`、`/sync/conflicts`
- 安检：`/inspections`、`/inspections/:id/report`
- 财务：`/finance/entries`、`/finance/daily-settlements`
- 平台配置：`/platform/policies`、`/platform/policies/publish`

## 错误码
- `AUTH_401`：登录态无效或过期
- `ORDER_409_STATUS`：订单状态冲突
- `INVENTORY_409_STOCK`：库存不足或冲突
- `SYNC_409_CONFLICT`：同步冲突待处理
- `COMPLIANCE_502_REPORT`：监管上报失败
- `VALIDATION_400`：参数校验失败

## 来源需求
- `requirements/02_订单/接口.md`
- `requirements/04_库存/接口.md`
- `requirements/08_系统/登录认证/接口.md`
- `requirements/07_配置/接口.md`
