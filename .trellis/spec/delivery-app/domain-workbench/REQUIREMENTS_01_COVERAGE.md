# 工作台：`requirements/01_工作台` 与当前实现对齐表

> 对照源：`requirements/01_工作台/需求.md`、`requirements/01_工作台/规格.md`  
> 实现参考：`/.trellis/delivery-app/src/workbench.html`、`workbench-client.js`、后端工作台聚合接口（若有）  
> 维护：需求或首页改版后更新本表；**验收以对应 `task.json` 为准**，本表为产品/规格缺口登记。

## 1. 总览结论（摘要）

| 维度 | 对齐程度 | 说明 |
|------|----------|------|
| 核心信息架构（收入 + 下一待办 + 开单入口） | 高 | 与 `domain-workbench/overview.md` MVP 及 task-02/16 收口一致 |
| 需求文档中的 **区域 A/B/C 占比与「底部大按钮区」** | 中 | 现为卡片化布局 + 主操作区，未严格按 25%/50%/25% dp 分区 |
| **今日毛利、7 日趋势图、收入卡展开态** | 部分 | task-38：收入卡支持「查看更多」展开；毛利与近 7 日趋势为前端占位（无成本接口与图表库） |
| **下一配送卡片全字段**（标签、规格图标、欠瓶/欠款强调、应收等） | 高 | task-39：`workbench.html` 已按 §3.2.2 逐项展示；`nextDelivery` 扩展字段与排序见 `server.js` `getNextWorkbenchDeliveryOrder` |
| **快速开单：工作台底部弹出面板** | 中 | 主操作「快速开单」已用底部 Sheet（选客户→确认→提交）；添加新客户与「连续开单」等仍跳转 `quick-order.html`（见 task-40 completion） |
| **连续开单 / 5 秒撤销 / 24h 改单** | 低 | 属订单/交易域，首页仅入口；需订单任务承接 |
| **离线乐观收入与冲突策略** | 中 | 有同步模态与网络提示；与需求第 7 节全文未逐项对齐 |

## 2. 需求.md 章节对照

| 章节 | 要点 | 实现状态 | 备注 / 后续方向 |
|------|------|----------|----------------|
| §1 定位 | 3s/5s/10s | 部分 | 可补充性能与埋点验收（非本仓库必选） |
| §2.1 布局 | A/B/C 三区 | 部分 | 设计 token 下可再压「主按钮区」视觉权重 |
| §2.1 区域 B | 「查看全部」待配送列表入口 | **已满足** | `workbench.html`「下一个配送」卡片内「查看全部待配送」→ `delivery-complete.html?from=workbench&view=pending`（task-37） |
| §3.1 收入卡 | 已收/待收/毛利/趋势 | 部分 | 已收/待收/合计已展示；毛利与趋势为 **占位**（task-38），真实口径与图表待财务/数据接口 |
| §3.2 下一配送 | 排序规则 | 部分 | 规则见 overview；需与列表接口契约对齐 |
| §3.2 下一配送 | 卡片字段全集 | **已满足** | task-39：`/workbench/overview` 的 `nextDelivery` 扩展字段 + 首页「下一个配送」卡片渲染 |
| §4 快速开单 | 流程与库存说明 | 部分 | 业务流程在订单域；工作台保证入口可达 |
| §5 连续开单 | 面板不关闭等 | 未 | 归属 `quick-order` / 订单域任务 |
| §6 修改与撤销 | 5s 撤销、24h 修改 | 未/部分 | 归属订单/财务域 |
| §7 离线 | 队列与冲突 | 部分 | 与 task-09、同步 UI 联动 |
| §8 一致性 | 首页与「我的」 | 部分 | 依赖同步与账号域 |

## 3. 规格.md 对照（摘录）

| 规格主题 | 实现状态 | 备注 |
|----------|----------|------|
| 首页加载：骨架 → 缓存 → 请求 → 不一致动画 | 低 | 多为直接拉取与文案提示，未实现完整动画状态机 |
| 快速开单：按钮动画 + 底部滑入面板 | 中 | 工作台入口：按钮约 150ms 缩小动效 + 面板约 250ms 自底滑入；遮罩/关闭/手柄下滑关闭；添加新客户与「连续开单」等仍跳转 `quick-order.html`（见 task-40 completion）；完整规格中的「一键开单跳过确认」等仍可在独立页完成 |
| 收入卡折叠/展开高度与趋势区 | 部分 | task-38：`查看更多`/`收起` + `aria-expanded` 控制展开区；高度动画未按规格 dp 精调，趋势为文案空态；与 §3.1 缺口一致（无成本接口与图表库） |
| 当场完成状态机 | 部分 | 在完单/开单页，非首页 |

## 4. 与已有 Trellis 任务的关系

| 任务 | 与本表关系 |
|------|------------|
| `02-workbench-aggregation` | 首页聚合 MVP |
| `16-workbench-experience-polish` | 同步模态、下一单操作、刷新等 |
| `22-workbench-bottom-nav-and-header-polish` | 顶栏与底栏层级 |
| `28-app-bottom-navigation` | 三 Tab 与 spec 一致 |
| **`36-workbench-01-req-spec-alignment`** | **本表维护 + overview 链接 + 缺口优先级登记（文档交付）** |
| **`39-workbench-p1-next-card-fields`** | **下一配送卡片 §3.2.2 字段与 `nextDelivery` 契约（task-39）** |
| **`40-order-bottom-sheet-quick-order-from-home`** | **工作台主入口底部 Sheet 快速开单（选客户→确认）；与 `quick-order-client` 复用** |

## 5. 建议的后续迭代顺序（对应 Trellis 任务）

| 优先级 | 内容 | 任务 ID | 状态 / 备注 |
|--------|------|---------|---------------|
| P0 | 「查看全部待配送」入口 | `37-workbench-p0-view-all-pending` | **已满足**：区域 B 卡片「查看全部待配送」→ `delivery-complete.html?from=workbench&view=pending` |
| P1 | 收入卡展开 + 毛利/趋势占位 | `38-workbench-p1-income-expand-placeholders` | **已满足（占位）**：展开区含今日毛利说明 + 近 7 日趋势空态；无后端字段变更 |
| P1 | 下一配送卡片字段补齐 | `39-workbench-p1-next-card-fields` | **已满足**：卡片字段与 `nextDelivery` 契约扩展；冒烟 `task39_workbench_next_card_smoke.py` |
| 订单域 | 工作台底部面板式快速开单 | `40-order-bottom-sheet-quick-order-from-home` | **已满足（MVP）**：底部 Sheet + 链路至 `quick-order.html` 补充能力 |
| 订单域 | 连续开单模式 | `41-order-continuous-quick-order-mode` | 待办 |
| 订单域 | 短时撤销与窗口内改单 | `42-order-undo-and-modify-window` | 待办 |

---

**变更记录**

| 日期 | 说明 |
|------|------|
| 2026-04-11 | 首版：建立 01 工作台需求/规格与实现对齐基线 |
| 2026-04-11 | task-37：区域 B「查看全部待配送」入口落地；§2 / §5 P0 第 1 条标为已满足 |
| 2026-04-11 | task-38：收入卡展开占位（毛利 + 近 7 日趋势说明）；更新 §1、§2 §3.1、规格收入卡行与 §5 P1 首行 |
| 2026-04-11 | task-40：工作台「快速开单」底部 Sheet MVP；更新 §1 总览、§3 规格摘录与 §5 订单域行 |
| 2026-04-11 | task-39：§3.2.2 下一配送卡片字段与 `nextDelivery` 聚合对齐；§1 摘要、§2 §3.2.2、§4、§5 P1 与变更记录更新 |
| 2026-04-11 | 工程：工作台首页 `workbench.html` / `workbench-client.js` 变更须同 PR 更新本表（`verify_workbench_coverage_touch.py` + CI）；见 `AGENTS.md` |
| 2026-04-11 | feat: 新增客户列表页 `customer-list.html`，底部导航「客户」按钮统一指向客户列表页；涉及 `workbench.html`、`my.html`、`delivery-complete.html`、`quick-order.html`、`order-list.html` 导航更新 |
| 2026-04-12 | Task 47: 客户列表管理功能 - 搜索(300ms防抖)、筛选(全部/有欠款/有欠瓶/VIP)、分页加载、客户卡片展示(姓名/电话/地址/欠款/欠瓶标记)、GET /api/customers 接口调用；新增 `customer-detail.html` 详情页框架 |
