# 24-ui-ux-pro-max-redesign completion

## 执行顺序（先评审后改造）
1. `/impeccable teach`：更新 `/.impeccable.md` 的 task-24 上下文与导航约束。
2. `/critique + /audit`：产出 `impeccable-critique-audit-round2.md`。
3. `/arrange /clarify /polish /normalize /harden`：完成页面落地改造。

## 页面改造结果
- 新增共享壳层样式：`/.trellis/delivery-app/src/delivery-shell.css`
- 新增低频能力聚合页：`/.trellis/delivery-app/src/my.html`
- 改造页面：
  - `/.trellis/delivery-app/src/workbench.html`
  - `/.trellis/delivery-app/src/quick-order.html`
  - `/.trellis/delivery-app/src/delivery-complete.html`

## 核心收口点
- 底部导航保持仅 3 个常驻 Tab：`首页 / 客户 / 我的`。
- 首页移除低频入口，低频能力统一收敛到“我的”页面。
- 三页“我的”入口统一指向 `my.html`，返回路径一致。
- 关键提示区补充 `aria-live="polite"`，提升反馈可感知性。
- 保持业务接口契约与调用路径不变，仅做 UI/UX 层重构。

## 验证
- `python3 ./.trellis/scripts/auto_test_runner.py --once`：通过

## 本次修正说明（为什么这么改）
- 选择 **A（调整 depends_on，去除未完成任务依赖）**。
- 原因：task-24 的验收范围聚焦于 `workbench / quick-order / delivery-complete` 三页的统一视觉与交互收口，其交付已可独立成立，不依赖 task-20 或 task-22 的新增实现才能满足既有验收条目。
- 为保证任务状态一致性，保留已完成且直接相关的前置 `19-quick-order-navigation-and-submit-contract`，移除未完成任务依赖，避免出现“任务已 completed 但仍硬依赖未完成任务”的元数据冲突。
