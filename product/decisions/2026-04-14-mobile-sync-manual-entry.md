# 2026-04-14 移动端同步入口降级为离线列表手动提交

## 状态

- `confirmed`

## 背景

- 当前移动端首页存在自动弹出的同步引导与重试操作，信息噪音高，且与最新 PRD 不一致。
- 最新 PRD 已确认移动端同步策略为“低频入口 + 人工手动提交”，不做运营化重试面板。

## 最终结论

1. 工作台不再自动弹出同步弹层，不再承载同步重试动作。
2. “我的”页面保留一个低频入口“离线数据”，跳转到移动端离线列表页。
3. 离线列表页提供：查看队列、手动提交、刷新结果，不提供复杂监控和策略操作。

## 影响

- 影响文件：
  - `apps/delivery-app/src/workbench.html`
  - `apps/delivery-app/src/my.html`
  - `apps/delivery-app/src/offline-sync.html`
  - `apps/delivery-app/src/offline-sync-client.js`
- 不影响：后端同步接口契约、平台端同步管理页面
