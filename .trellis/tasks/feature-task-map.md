# 功能级任务拆解图

## 任务清单（按依赖顺序）
1. 登录认证与会话
2. 工作台聚合
3. 快速开单
4. 待配送到完单
5. 库存锁定与回滚
6. 客户账户联动（欠瓶/欠款）
7. 安检触发与上报
8. 财务记账与日结
9. 同步队列与冲突处理
10. 平台规则配置与发布
11. 平台监控与合规看板
12. 工作台体验优化
13. 快速开单交互与边界对齐
14. 客户账户持久化与催收历史
15. 快速开单导航与确认开单契约补齐
16. 完单安检移动端布局优化
17. 退出登录流程与会话收口
18. 工作台底部导航与头部信息层级优化
19. React 最佳实践审查与修复
20. impeccable 驱动的页面重构
21. 平台前端目录拆分与独立入口
22. 预览脚本与后端路由模块化收口
23. 快速开单提交联调修复
24. App 底部导航统一收口（`task-28-app-bottom-navigation`）
25. Platform 顶部菜单统一收口（`task-29-platform-top-menu`）
26. DESIGN.md 设计令牌与组件基线对齐（`task-30-design-token-component-baseline`）
27. App 端按 DESIGN.md 的页面重构（`task-31-app-design-md-refactor`）
28. Web 端按 DESIGN.md 的页面重构（`task-32-web-design-md-refactor`）
29. App 页面结构级布局重构（`task-33-app-layout-overhaul`）
30. Web 平台页面结构级布局重构（`task-34-platform-layout-overhaul`）
31. Design System 强化与门禁脚本（`task-35-design-system-hardening`）
32. 工作台与 `requirements/01_工作台` 需求/规格对齐登记（`task-36-workbench-01-req-spec-alignment`，文档一期）
33. 工作台 P0：查看全部待配送（`task-37-workbench-p0-view-all-pending`）
34. 工作台 P1：收入卡展开与毛利/趋势占位（`task-38-workbench-p1-income-expand-placeholders`）
35. 工作台 P1：下一配送卡片字段（`task-39-workbench-p1-next-card-fields`）
36. 订单域：底部面板快速开单（`task-40-order-bottom-sheet-quick-order-from-home`）
37. 订单域：连续开单（`task-41-order-continuous-quick-order-mode`）
38. 订单域：撤销与窗口内改单（`task-42-order-undo-and-modify-window`）

```mermaid
flowchart TD
t01[task-01-auth-session] --> t02[task-02-workbench]
t02 --> t03[task-03-quick-order]
t03 --> t04[task-04-delivery-complete]
t04 --> t05[task-05-inventory-lock-revert]
t04 --> t06[task-06-customer-account-link]
t04 --> t07[task-07-safety-report]
t04 --> t08[task-08-finance-daily]
t05 --> t09[task-09-sync-conflict]
t06 --> t09
t07 --> t10[task-10-platform-config-release]
t09 --> t11[task-11-platform-monitor-compliance]
t10 --> t11
t01 --> t12[task-12-backend-auth-persistence]
t12 --> t13[task-13-auth-security-hardening]
t01 --> t14[task-14-auth-api-contract-alignment]
t14 --> t15[task-15-login-e2e-regression]
t03 --> t16[task-16-workbench-experience-polish]
t09 --> t16
t03 --> t17[task-17-quick-order-ux-alignment]
t06 --> t18[task-18-account-persistence-history]
t17 --> t19[task-19-quick-order-nav-submit]
t07 --> t20[task-20-safety-mobile-layout]
t01 --> t21[task-21-auth-logout]
t16 --> t22[task-22-workbench-nav-header]
t16 --> t23[task-23-react-best-practices]
t19 --> t24[task-24-impeccable-redesign]
t20 --> t24
t22 --> t24
t11 --> t25[task-25-platform-frontend-separation]
t25 --> t26[task-26-preview-backend-modularization]
t19 --> t27[task-27-quick-order-submit-integration-fix]
t26 --> t27
t16 --> t28[task-28-app-bottom-navigation]
t25 --> t29[task-29-platform-top-menu]
t26 --> t29
t24 --> t30[task-30-design-token-component-baseline]
t29 --> t30
t16 --> t31[task-31-app-design-md-refactor]
t30 --> t31
t29 --> t32[task-32-web-design-md-refactor]
t30 --> t32
t31 --> t33[task-33-app-layout-overhaul]
t32 --> t34[task-34-platform-layout-overhaul]
t30 --> t35[task-35-design-system-hardening]
t02 --> t36[task-36-workbench-01-req-spec-alignment]
t16 --> t36
t36 --> t37[task-37-workbench-p0-view-all-pending]
t37 --> t38[task-38-workbench-p1-income-expand-placeholders]
t37 --> t39[task-39-workbench-p1-next-card-fields]
t03 --> t40[task-40-order-bottom-sheet-quick-order-from-home]
t17 --> t40
t40 --> t41[task-41-order-continuous-quick-order-mode]
t03 --> t42[task-42-order-undo-and-modify-window]
t04 --> t42
t05 --> t42
```

补充依赖说明（与上表一致，图内为简化边）：

- `28`：工作台体验后统一 App 底栏；依赖平台拆分后的入口一致性时与 `25` 关联。
- `29`：`25`、`26` 后为平台顶栏与预览路径收口。
- `30`：`24`、`29` 后为 DESIGN / token / ui-kit 基线。
- `31`–`32`：依赖 `30`；`31` 可与 `16` 并行起点按 `task.json` 为准。
- `33`–`34`：结构级改版，分别依赖 `31` / `32` 的基线落地。
- `35`：强化 ui-kit 与校验脚本，依赖 `30`。
