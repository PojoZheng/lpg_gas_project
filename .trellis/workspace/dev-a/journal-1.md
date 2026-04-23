# Dev-A Journal

## 2026-04-12 Task 47 开工通知

**PM+Architect 通知**

新任务已就绪，请开始开发。

### 任务信息
- **任务 ID**: 47-customer-list-management
- **任务名称**: 客户域 P1：客户列表与详情管理
- **优先级**: P1
- **预计工期**: 2.5天
- **并行任务**: Task 46（财务域，dev-c 负责）

### 任务位置
- **Spec**: `.trellis/tasks/47-customer-list-management/prd.md`
- **Task JSON**: `.trellis/tasks/47-customer-list-management/task.json`

### 核心需求
1. **客户列表页** (`customer-list.html`):
   - 搜索框（姓名/电话/地址）
   - 筛选标签（全部/有欠瓶/有欠款/VIP）
   - 客户卡片（信息 + 欠瓶/欠款标记）

2. **客户详情页** (`customer-detail.html`):
   - 基本信息展示
   - 台账概况（欠瓶/欠款统计）
   - 快捷操作：快速开单、查看订单、催款
   - 最近订单列表

3. **后端接口**:
   - `GET /customers`（搜索、筛选、分页）
   - `GET /customers/:id`（详情 + 台账）
   - `GET /customers/:id/orders`（历史订单）
   - `POST /customers/:id/reminder`（记录催款）

### 依赖
- Task 40 快速开单功能（已完成）
- Task 43 订单列表功能（已完成）

### 开发流程
1. 从 `origin/main` 切出分支：`feat/task-47-customer`
2. 按 prd.md 实现功能
3. 自测：`python3 ./.trellis/scripts/auto_test_runner.py --once`
4. 提交 PR，等待 Integrator 验证

### 注意事项
- 复用现有客户数据（`mockCustomers`）
- 与订单列表保持 UI 风格一致
- 催款功能先实现话术复制 + 拨打电话
- 中文、无 emoji、主色 `#4799a0`

---
**如有疑问，请联系 PM+Architect**
