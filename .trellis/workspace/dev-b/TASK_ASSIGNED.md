# 🚨 任务派发通知

**Developer: dev-b**
**派发时间: 2026-04-12**
**优先级: P1**

---

## 任务信息

| 项目 | 内容 |
|------|------|
| 任务 ID | 48-debt-management |
| 任务名称 | 财务域 P1：欠款管理与催收 |
| 状态 | 🔴 **已派发，立即开工** |
| 截止日期 | 2026-04-14（2天） |
| 依赖 | Task 46、Task 47（接口契约已定义，可并行开发） |

---

## 立即执行

### Step 1: 切分支（5分钟）
```bash
git fetch origin
git checkout -b feat/task-48-debt origin/main
```

### Step 2: 读需求（15分钟）
- 必读: `.trellis/tasks/48-debt-management/prd.md`
- 接口: `GET /debts/overview`, `GET /debts/list`, `POST /debts/reminder`, `POST /debts/repayment`

### Step 3: 开发（1.5天）
1. `debt-overview.html` - 债务管理页（统计、筛选、列表）
2. 催款面板 - 话术、拨打电话、发送短信
3. 还款面板 - 金额录入、方式选择
4. `server.js` - 后端接口

### Step 4: 自测（4小时）
```bash
python3 ./.trellis/scripts/auto_test_runner.py --once
node --check apps/delivery-app/src/debt-client.js 2>/dev/null || echo "检查语法"
```

### Step 5: 提交 PR
```bash
git add .
git commit -m "feat: Task 48 欠款管理与催收"
git push origin feat/task-48-debt
```

---

## 验收清单

- [ ] 债务管理入口显示欠款总额和逾期人数
- [ ] 欠款统计准确（总欠款、逾期金额、人数）
- [ ] 列表按逾期天数排序，标记颜色正确
- [ ] 催款功能：话术复制、拨打电话正常
- [ ] 还款功能：部分还款、全部还清正常
- [ ] 还款后欠款金额更新，生成记录
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
