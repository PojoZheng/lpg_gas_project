# 需求（requirements）→ Spec（.trellis/spec）→ 任务（.trellis/tasks）对齐表

本文把仓库根目录 `requirements/` 与 Trellis 内规格、已实现任务做**索引级**对齐，便于评审缺口与开新任务。实现细节以各 `task.json` 的 `input_spec` / `acceptance` 为准。

## 1. 当前任务状态（Trellis）

- **未完成**：`00-bootstrap-guidelines`（进行中；子任务见该目录 `task.json`）
- **其余**：`01`–`35` 及历史任务在 `task.json` 中均为 `completed` 时，即视为本阶段功能链已收口（以仓库为准）

## 2. 按需求模块映射

| requirements 目录 | 主要 Spec 落点 | 代表性任务 ID（已实现/曾用） |
|-------------------|----------------|-------------------------------|
| `00_全局/` | [master/index.md](./master/index.md)、[master/product-overview.md](./master/product-overview.md)、[shared/entities.md](./shared/entities.md) | 跨任务约束，无单一编号 |
| `01_工作台/` | [delivery-app/domain-workbench/overview.md](./delivery-app/domain-workbench/overview.md) | `02-workbench-aggregation`、`16-workbench-experience-polish`、`22-workbench-bottom-nav-and-header-polish` |
| `02_订单/` | [delivery-app/domain-order/overview.md](./delivery-app/domain-order/overview.md) | `03-quick-order`、`04-delivery-to-complete`、`17-quick-order-ux-alignment`、`19-quick-order-navigation-and-submit-contract`、`27-quick-order-submit-integration-fix` |
| `03_客户/` | [delivery-app/domain-customer/overview.md](./delivery-app/domain-customer/overview.md)、[backend/domain-customer/overview.md](./backend/domain-customer/overview.md) | `06-customer-account-linkage`、`18-customer-account-persistence-history` |
| `04_库存/` | [delivery-app/domain-inventory/overview.md](./delivery-app/domain-inventory/overview.md) | `05-inventory-lock-revert` |
| `05_安检/` | [delivery-app/domain-safety/overview.md](./delivery-app/domain-safety/overview.md) | `07-safety-trigger-report`、`20-safety-complete-mobile-layout` |
| `06_财务/` | [delivery-app/domain-finance/overview.md](./delivery-app/domain-finance/overview.md) | `08-finance-posting-daily-close` |
| `07_配置/`（含平台端） | [delivery-app/domain-config/overview.md](./delivery-app/domain-config/overview.md)、[platform/index.md](./platform/index.md) 及各 `domain-*` | `09-sync-queue-conflict`、`10-platform-policy-release`、`11-platform-monitor-compliance`、`25-platform-frontend-separation`、`29-platform-top-menu` |
| `08_系统/`（认证、同步、消息等） | [delivery-app/domain-system/overview.md](./delivery-app/domain-system/overview.md)、[backend/domain-user/overview.md](./backend/domain-user/overview.md)、[shared/api-contracts.md](./shared/api-contracts.md) | `01-auth-session`、`12-backend-auth-persistence`、`13-auth-security-hardening`、`14-auth-api-contract-alignment`、`15-login-e2e-regression`、`21-auth-logout-flow`、`26-preview-backend-modularization` |

## 3. 横切：设计与 UI 基线

| 主题 | Spec | 任务 |
|------|------|------|
| 配送员端视觉与组件 | [delivery-app/DESIGN.md](./delivery-app/DESIGN.md)、[design-tokens.md](./delivery-app/design-tokens.md)、[component-library.md](./delivery-app/component-library.md) | `24-ui-ux-pro-max-redesign`、`30-design-token-component-baseline`、`31-app-design-md-refactor`、`33-app-layout-overhaul` |
| 平台端视觉与壳层 | 同上 + [platform/index.md](./platform/index.md) | `32-web-design-md-refactor`、`34-platform-layout-overhaul` |
| 共享 UI Kit | [../ui-kit/README.md](../ui-kit/README.md) | `30-design-token-component-baseline`、`35-design-system-hardening` |
| 工程与客户端质量 | [delivery-app/index.md](./delivery-app/index.md)、[guides/index.md](./guides/index.md) | `23-react-best-practices-audit`、`28-app-bottom-navigation` |

## 4. 已知缺口（与 `00-bootstrap-guidelines` 一致）

- **`spec/frontend/`**：历史上未落盘；配送员端规范已集中在 `delivery-app/` 与 [frontend/index.md](./frontend/index.md)（本仓库新增入口）。
- **「补充示例与反例」**：尚未在各指南中块化沉淀，建议后续单开文档任务或按域追加 `examples/` 小节。
- **requirements 中未在上方表单独列出的子文档**（如 `08_系统/消息通知/`）：与当前 Trellis 原型范围可能部分未覆盖；若产品要坚持，需**新开 task** 并补 `platform`/`delivery-app` 域说明。

## 5. 维护约定

- 新增或调整 **requirements** 后：在本文件对应行补充 **Spec 路径** 与 **计划任务 ID**（或注明「待拆任务」）。
- 新增 **Trellis 任务** 后：在 [feature-task-map.md](../tasks/feature-task-map.md) 更新依赖图与叙事顺序。
- **验收**：仍以 `task.json` + `completion.md` + 自动化脚本为准；本文件不做验收替代。
