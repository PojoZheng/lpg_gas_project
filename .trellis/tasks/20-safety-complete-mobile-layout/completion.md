# 任务完成记录：20-safety-complete-mobile-layout

## 1. 验收结果
- [x] 完单安检关键操作区符合单手习惯：主按钮「提交安检并上报」全宽置顶于底部操作区，次操作「返回工作台」「失败重试」同排并列，最小高度 48px。
- [x] 拍照、检查项、状态在 390×844 目标下避免遮挡：主区域增加与底部固定区匹配的 `padding-bottom`（含安全区），安检检查项固定单列与换行，顶栏在窄屏改为上下结构。
- [x] 反馈与回退路径清晰：`#dockStatus` 与 `#safetyTip` 同步文案，`dockStatus` 使用 `aria-live="polite"`；顶栏「工作台」与底部「返回工作台」分工明确。
- [x] 视觉对齐 DESIGN 基线：主色沿用 `var(--brand)`（#4799a0），状态条使用主色浅底。
- [x] 界面文案为中文且不含 emoji。
- [x] 自动化：`node --check` 与 `task20_safety_layout_smoke.py` 通过。

## 2. 关键改动
- 前端：`/.trellis/delivery-app/src/delivery-complete.html`
  - `body.delivery-complete-body` 与主内容底部留白加大，适配底部「安检操作区」+ 底部导航总高度。
  - 安检卡片 `safety-card`：检查项单列、触控区域与复选框尺寸优化；区块标题与 `aria-labelledby` 关联。
  - 底部 `dock-wrap`：`role="region"`、`aria-label="安检操作区"`；主/次按钮分区（`dock-actions`、`dock-secondary-row`）；状态条样式强化。
  - 顶栏窄屏：`header-actions` 内按钮横向铺满，避免标题与双按钮同一行挤压溢出。

## 3. 测试
- `node --check ".trellis/delivery-app/src/delivery-complete-client.js"`
- `python3 ./.trellis/scripts/task20_safety_layout_smoke.py`
