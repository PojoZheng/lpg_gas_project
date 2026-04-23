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

## 订单接口字段契约（task-71）

### 统一字段口径
- `/orders`
- `/orders/pending-delivery`
- `/orders/:id`

以上三个接口统一使用 camelCase 字段，不再混用 snake_case。

### 订单对象（OrderContract）
```json
{
  "orderId": "ORD-1713571200000",
  "customerId": "CUST-001",
  "customerName": "李大妈",
  "address": "阳光花园5栋1单元301",
  "orderType": "later_delivery",
  "orderStatus": "pending_delivery",
  "spec": "15kg",
  "quantity": 1,
  "unitPrice": 120,
  "amount": 120,
  "receivedAmount": 0,
  "paymentStatus": "unpaid",
  "paymentMethod": "",
  "recycledEmptyCount": 0,
  "owedEmptyCount": 0,
  "scheduleAt": "今天 18:30",
  "inventoryStage": "locked",
  "createdAt": 1713571200000,
  "completedAt": 0
}
```

### 列表接口
`GET /orders` 返回：
```json
{
  "success": true,
  "data": {
    "total": 100,
    "page": 1,
    "size": 20,
    "list": [
      {
        "orderId": "ORD-1713571200000",
        "customerId": "CUST-001",
        "customerName": "李大妈",
        "address": "阳光花园5栋1单元301",
        "orderType": "later_delivery",
        "orderStatus": "pending_delivery",
        "spec": "15kg",
        "quantity": 1,
        "unitPrice": 120,
        "amount": 120,
        "receivedAmount": 0,
        "paymentStatus": "unpaid",
        "paymentMethod": "",
        "recycledEmptyCount": 0,
        "owedEmptyCount": 0,
        "scheduleAt": "今天 18:30",
        "inventoryStage": "locked",
        "createdAt": 1713571200000,
        "completedAt": 0
      }
    ]
  }
}
```

### 待配送接口
`GET /orders/pending-delivery` 返回 `OrderContract[]`，字段与上文完全一致，仅数据集合限定为 `orderStatus=pending_delivery`。

### 详情接口
`GET /orders/:id` 返回单个 `OrderContract` 对象，字段与列表项一致。

### 完单关键字段说明
- `amount`：应收金额
- `receivedAmount`：实收金额
- `recycledEmptyCount`：回收空瓶数量
- `owedEmptyCount`：欠瓶数量
- `paymentMethod`：收款方式（`cash`/`wechat`/`alipay`/`transfer`/`credit`）

## 来源需求
- `requirements/02_订单/接口.md`
- `requirements/04_库存/接口.md`
- `requirements/08_系统/登录认证/接口.md`
- `requirements/07_配置/接口.md`
