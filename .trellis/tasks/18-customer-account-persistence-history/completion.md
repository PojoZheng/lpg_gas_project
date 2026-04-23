# 任务 18：客户账户持久化与催收历史（完成说明）

## 行为概述

- 客户**欠款金额**、**欠瓶数量**与**催收台账字段**（状态、备注、时间戳、变更历史）写入本地 JSON 文件；进程退出后再次启动会从文件恢复。
- 每次 `PATCH /customers/:id/collection-status` 在**状态或备注相对上次有变化**时追加一条催收记录：`changedAt`（毫秒时间戳）、`status`、`note`。
- `GET /customers/:id/detail` 在原有客户信息与 `account` 摘要基础上，向后兼容增加 `collectionHistory`（最近最多 20 条，**新在前**）与 `accountSummaryConsistency`（摘要与台账最近一条记录的一致性说明）。

## 数据模型（磁盘）

路径默认：`services/backend/data/customer-ledger.json`。可通过环境变量 `TRELLIS_CUSTOMER_LEDGER_PATH` 覆盖（供自动化与多实例隔离）。

文件结构示例：

```json
{
  "savedAt": 1710000000000,
  "accounts": [
    [
      "CUST-001",
      {
        "customerId": "CUST-001",
        "owedAmount": 12.5,
        "owedEmptyCount": 1,
        "collectionStatus": "pending",
        "collectionNote": "已电话",
        "updatedAt": 1710000000000,
        "lastCollectionAt": 1710000000000,
        "collectionHistory": [
          { "changedAt": 1710000000000, "status": "pending", "note": "已电话" }
        ]
      }
    ]
  ]
}
```

单客户 `collectionHistory` 在内存中最多保留 200 条（持久化时一并写入）。

## API 变更（向后兼容）

| 方法 | 路径 | 变更 |
|------|------|------|
| GET | `/customers/:id/detail` | `data` 增加 `collectionHistory`、`accountSummaryConsistency`；原有字段不变。 |
| PATCH | `/customers/:id/collection-status` | 响应体仍为 `data: buildCustomerAccountSummary(...)`，无破坏性变更。 |

### `accountSummaryConsistency`

- `ok: true`：无历史记录，或最近一条记录的 `status` / `note` / `changedAt` 与当前 `account` 摘要中 `collectionStatus`、`collectionNote`、`lastCollectionAt` 一致。
- `ok: false`：上述不一致（例如手工篡改 ledger 文件）；附带 `checks` 布尔字段便于排查。

## 前端（delivery-complete）

- 在「客户详情与账户摘要」卡片中展示一致性文案区块与「最近催收记录」列表（中文、主色描边与既有 `--brand` / `#4799a0` 体系一致，无 emoji）。
- 列表项使用 DOM `textContent` 渲染备注与时间，避免 HTML 注入。

## 风险与限制

- **并发写文件**：当前为同步写 JSON，多进程共写同一 ledger 文件可能互相覆盖；生产环境应使用数据库或单写者队列。
- **与订单数据的关系**：台账金额/欠瓶由完单等流程累加；**订单列表本身未持久化**，重启后仅客户台账从文件恢复，订单维度统计（如 `totalOrders`）会随内存订单重置，摘要中的订单计数可能与业务直觉不一致（既有行为）。
- **环境变量**：`PORT` 支持自定义监听端口（默认 3100），与既有预览脚本兼容；专用 ledger 路径避免与本地开发默认文件冲突。

## 自动化

`python3 .trellis/scripts/task18_customer_persistence_smoke.py`：在 `PORT=3118` 与临时 `TRELLIS_CUSTOMER_LEDGER_PATH` 下启动服务，验证写入文件、进程重启后 GET detail 与一致性字段。
