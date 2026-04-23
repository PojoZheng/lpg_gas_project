# 🚨 任务派发通知

**Developer: dev-c**
**派发时间: 2026-04-12**
**优先级: P1**

---

## 任务信息

| 项目 | 内容 |
|------|------|
| 任务 ID | 46-finance-income-daily-close |
| 任务名称 | 财务域 P1：收入明细与日结对账 |
| 状态 | 🔴 **已派发，立即开工** |
| 截止日期 | 2026-04-15（3天） |

---

## 立即执行

### Step 1: 切分支（5分钟）
```bash
git fetch origin
git checkout -b feat/task-46-finance origin/main
```

### Step 2: 读需求（15分钟）
- 必读: `.trellis/tasks/46-finance-income-daily-close/prd.md`
- 接口: `GET /finance/income`, `GET /finance/daily-close`, `POST /finance/daily-close/confirm`

### Step 3: 开发（2.5天）
1. `finance-overview.html` - 收入明细页
2. `finance-daily-close.html` - 日结对账页
3. `server.js` - 后端接口

### Step 4: 自测（4小时）
```bash
python3 ./.trellis/scripts/auto_test_runner.py --once
node --check apps/delivery-app/src/finance-client.js 2>/dev/null || echo "检查语法"
```

### Step 5: 提交 PR
```bash
git add .
git commit -m "feat: Task 46 收入明细与日结对账"
git push origin feat/task-46-finance
```

---

## 验收清单

- [ ] 「我的」页面有「财务管理」入口
- [ ] 收入明细页：时间筛选、汇总、列表分页
- [ ] 日结对账页：收支汇总、收款核对、差异计算
- [ ] 确认日结后生成记录
- [ ] 接口数据与订单完成数据一致
- [ ] 中文、无 emoji、主色 #4799a0

---

## 阻塞上报

遇到问题立即上报：
1. 接口契约冲突
2. 需求不明确
3. 依赖未就绪

**禁止阻塞不报到截止日期！**

---

**状态: 等待开工确认**
