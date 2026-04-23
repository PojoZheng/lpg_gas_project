# Dev-B Journal

## 2026-04-12 Task 48 开工通知

**PM+Architect 通知**

新任务已就绪，请开始开发。

### 任务信息
- **任务 ID**: 48-debt-management
- **任务名称**: 财务域 P1：欠款管理与催收
- **优先级**: P1
- **预计工期**: 2天
- **依赖任务**: Task 46（财务）、Task 47（客户）
- **并行任务**: Task 46（dev-c）、Task 47（dev-a）

### 任务位置
- **Spec**: `.trellis/tasks/48-debt-management/prd.md`
- **Task JSON**: `.trellis/tasks/48-debt-management/task.json`

### 核心需求
1. **债务管理概览页** (`debt-overview.html`):
   - 欠款统计卡片（总额、逾期）
   - 筛选标签（全部/逾期/今日需催）
   - 待催收列表（按逾期天数排序）

2. **催款面板**:
   - 欠款信息展示
   - 催款话术（可复制）
   - 快捷操作：拨打电话、发送短信
   - 催款记录

3. **还款面板**:
   - 还款金额录入
   - 还款方式选择
   - 支持部分还款和全部还清

4. **后端接口**:
   - `GET /debts/overview`（欠款统计）
   - `GET /debts/list`（待催收列表）
   - `POST /debts/reminder`（记录催款）
   - `POST /debts/repayment`（记录还款）

### 依赖
- Task 46 财务管理（数据基础）
- Task 47 客户管理（客户信息）

### 开发流程
1. 从 `origin/main` 切出分支：`feat/task-48-debt`
2. 按 prd.md 实现功能
3. 自测：`python3 ./.trellis/scripts/auto_test_runner.py --once`
4. 提交 PR，等待 Integrator 验证

### 注意事项
- 逾期规则：>7天为逾期，>15天为严重逾期
- 催款话术可配置，默认提供标准话术
- 还款后更新客户台账（与 Task 47 对齐）
- 中文、无 emoji、主色 `#4799a0`

---
**如有疑问，请联系 PM+Architect**
