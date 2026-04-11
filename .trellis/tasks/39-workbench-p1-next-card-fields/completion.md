# 任务完成记录：39-workbench-p1-next-card-fields

## 1. 验收结果

- [x] 「下一个配送」卡片在数据可用时展示：客户姓名、客户标签、地址（单行省略）、气瓶规格与数量、应收（主色强调）、预约时间、欠瓶、欠款、订单号；缺字段显示「--」或中性 0 文案。
- [x] 预约时间、欠款使用红色辅助强调；欠瓶使用黄色系辅助强调；应收金额使用品牌主色；无 emoji。
- [x] 后端 `GET /workbench/overview` 的 `data.nextDelivery` 在原有字段基础上扩展可选字段，空队列时 `orderId` 为 `null`，与前端空态判断一致。
- [x] `REQUIREMENTS_01_COVERAGE.md` 已更新摘要与 §5 表。
- [x] `python3 ./.trellis/scripts/auto_test_runner.py --once` 与 `node --check`（本次改动的 `.js`）通过。

## 2. 字段映射（workbench-client / 后端 → 页面）

| 数据源字段 | UI 位置 | 说明 |
|------------|---------|------|
| `nextDelivery.customerName` | `#nextCustomer` | 客户姓名 |
| `nextDelivery.customerTags` | `#nextTags` 内动态 `span.next-tag` | 来自客户档案 `tags` 数组；无则不留标签 |
| `nextDelivery.address` | `#nextAddress` | 单行省略 |
| `nextDelivery.spec` + `quantity` | `#nextSpecQty` | 文案形如 `15kg × 2 瓶` |
| `nextDelivery.amount` | `#nextAmount` | `￥x.xx`，主色 class |
| `nextDelivery.scheduleAt` | `#nextSchedule` | 非「尽快配送/待创建」视为有效预约，套红色强调 class |
| `nextDelivery.owedEmptyCount` | `#nextOwedBottles` | 大于 0 时黄字强调 |
| `nextDelivery.owedAmount` | `#nextOwedMoney` | 大于 0 时红字强调 |
| `nextDelivery.orderId` | `#nextOrderId` | 无待配送时为 `--` |

Mock 数据：`workbench-client.js` 中 `buildMockOverview().nextDelivery` 与上表对齐，便于离线演示。

## 3. 后端补充

- `getNextWorkbenchDeliveryOrder`：待配送队列按「有明确预约时间优先 → 预约时间字符串升序 → 创建时间」选取下一单（无距离字段，与需求 3.2.1 部分对齐）。
- `buildNextDeliveryPayload`：聚合订单行与客户台账摘要、客户 `tags`。

## 4. 测试

- `python3 ./.trellis/scripts/auto_test_runner.py --once`
- `node --check`：`.trellis/backend/src/server.js`、`.trellis/delivery-app/src/workbench-client.js`
- `python3 ./.trellis/scripts/task39_workbench_next_card_smoke.py`
