# 🚨 任务派发通知

**Developer: dev-a**
**派发时间: 2026-04-12**
**优先级: P1**

---

## 任务信息

| 项目 | 内容 |
|------|------|
| 任务 ID | 47-customer-list-management |
| 任务名称 | 客户域 P1：客户列表与详情管理 |
| 状态 | 🔴 **已派发，立即开工** |
| 截止日期 | 2026-04-15（2.5天） |

---

## 立即执行

### Step 1: 切分支（5分钟）
```bash
git fetch origin
git checkout -b feat/task-47-customer origin/main
```

### Step 2: 读需求（15分钟）
- 必读: `.trellis/tasks/47-customer-list-management/prd.md`
- 接口: `GET /customers`, `GET /customers/:id`, `POST /customers/:id/reminder`

### Step 3: 开发（2天）
1. `customer-list.html` - 客户列表页（搜索、筛选、卡片）
2. `customer-detail.html` - 客户详情页（信息、台账、快捷操作）
3. `server.js` - 后端接口

### Step 4: 自测（4小时）
```bash
python3 ./.trellis/scripts/auto_test_runner.py --once
node --check apps/delivery-app/src/customer-client.js 2>/dev/null || echo "检查语法"
```

### Step 5: 提交 PR
```bash
git add .
git commit -m "feat: Task 47 客户列表与详情管理"
git push origin feat/task-47-customer
```

---

## 验收清单

- [ ] 客户列表页：搜索、筛选、分页正常
- [ ] 客户卡片展示欠瓶/欠款标记
- [ ] 客户详情页：信息完整、台账准确
- [ ] 快捷操作：开单/查看订单/催款正常跳转
- [ ] 从客户详情开单，客户信息预填
- [ ] 催款功能：话术复制、拨打电话正常
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
