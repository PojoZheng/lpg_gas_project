# Task 46: 财务域日结对账

## 需求概述
实现配送员每日收支核对与确认流程，包括「我的」页面入口、对账页面、核对确认功能和后端接口。

## 验收项

### 1. 「我的」页面「今日对账」入口
- [x] 在「我的」页面「管理入口」区域添加「今日对账」入口按钮
- [x] 按钮使用绿色图标，突出对账功能的重要性
- [x] 点击跳转至 finance-daily-close.html

### 2. daily-close.html 页面功能
- [x] 今日收入/支出/利润统计展示
  - 收入：气款收入、押金收入、租金收入
  - 支出：采购支出、退押金支出
  - 利润：净利润计算（收入 - 支出）
- [x] 订单汇总：完成订单数、配送气瓶、收回空瓶
- [x] 收款方式统计：现金、微信、支付宝、记账（欠款）
- [x] 今日流水明细列表
- [x] 日结状态显示（已对账/未对账）

### 3. 核对确认功能
- [x] 对账确认区域包含核对清单：
  - 现金盘点核对
  - 微信收款核对
  - 支付宝收款核对
  - 订单数量核对
- [x] 用户需勾选所有核对项后才能提交
- [x] 点击「确认已对账」按钮提交
- [x] 已提交后显示完成状态，锁定当日数据

### 4. POST /finance/daily-close 接口
- [x] 前端 client.js 已实现 confirmDailyClose 函数
- [x] 请求方法：POST
- [x] 请求路径：/finance/daily-close
- [x] 请求体包含：checkedItems（已核对项目）、closeTime（对账时间）、note（可选备注）
- [x] 新增 fetchTodayExpenseSummary 函数获取今日支出汇总

## 文件变更清单

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `.trellis/delivery-app/src/finance-daily-close.html` | 重写 | 完整的日结对账页面，含收入/支出/利润统计和核对确认功能 |
| `.trellis/delivery-app/src/finance-daily-close-client.js` | 修改 | 完善 API 客户端，添加支出查询和历史记录功能 |
| `.trellis/delivery-app/src/my.html` | 修改 | 添加「今日对账」入口按钮 |

## 界面设计

### 主色调
- 品牌色：#4799a0
- 收入/正数：#16a34a（绿色）
- 支出/负数：#ef4444（红色）
- 已完成：#16a34a（绿色渐变）

### 布局结构
```
┌─────────────────────────────────┐
│  今日对账            [返回]     │
├─────────────────────────────────┤
│  [状态卡片] 未对账/已对账        │
│  2026年4月12日 周六             │
│  收入 ¥1680  支出 ¥850  利润¥830│
├─────────────────────────────────┤
│  订单汇总                        │
│  完成订单 8单                    │
│  配送气瓶 15kg×6, 10kg×2        │
├─────────────────────────────────┤
│  收入明细                        │
│  气款 ¥1050  押金 ¥300...       │
├─────────────────────────────────┤
│  支出明细                        │
│  采购 ¥850  退押金 ¥0           │
├─────────────────────────────────┤
│  收款方式                        │
│  现金 ¥980  微信 ¥450...        │
├─────────────────────────────────┤
│  今日流水                        │
│  [流水列表...]                   │
├─────────────────────────────────┤
│  [对账确认区]                    │
│  [核对清单...]                   │
│  [确认已对账] 按钮               │
└─────────────────────────────────┘
```

## API 接口

### GET /finance/today-summary
获取今日财务汇总数据

**响应示例：**
```json
{
  "success": true,
  "data": {
    "totalIncome": 1680,
    "gasIncome": 1050,
    "depositIncome": 300,
    "rentIncome": 0,
    "cashAmount": 980,
    "wechatAmount": 450,
    "alipayAmount": 150,
    "creditAmount": 100,
    "orderCount": 8,
    "deliveryCylinders": "15kg×6, 10kg×2",
    "returnCylinders": "15kg×5, 10kg×1",
    "closeStatus": "open",
    "isClosed": false
  }
}
```

### GET /finance/today-expense
获取今日支出汇总数据

**响应示例：**
```json
{
  "success": true,
  "data": {
    "totalExpense": 850,
    "purchaseExpense": 850,
    "refundExpense": 0
  }
}
```

### POST /finance/daily-close
确认日结对账

**请求体：**
```json
{
  "checkedItems": ["cash", "wechat", "alipay", "orders"],
  "closeTime": "2026-04-12T18:30:00.000Z",
  "note": "今日对账无误"
}
```

**响应示例：**
```json
{
  "success": true,
  "data": {
    "date": "2026-04-12",
    "closedAt": "2026-04-12T18:30:00.000Z",
    "status": "closed"
  }
}
```

## 测试要点

1. 页面加载时正确显示今日日期
2. 未对账状态下显示核对清单和确认按钮
3. 已勾选所有核对项后确认按钮可用
4. 点击确认后弹出二次确认弹窗
5. 确认成功后页面切换为「已对账」状态
6. 已关闭的日期无法再次对账
7. 金额计算正确（收入 - 支出 = 利润）

## 关联文档

- 财务域概述：`.trellis/spec/delivery-app/domain-finance/overview.md`
- 财务需求文档：`requirements/06_财务/需求.md`
- 财务规格文档：`requirements/06_财务/规格.md`
