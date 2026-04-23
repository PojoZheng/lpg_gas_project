# 2026-04-15 移动端二三级页返回入口统一与列表回位

## 状态

- `confirmed`

## 背景

- 二三级页面的返回入口样式不统一，存在“文字返回”与图标返回混用。
- 列表页跳转详情后，返回列表时位置不稳定，影响连续查看效率。

## 最终结论

1. 二三级页面“返回上一页”入口统一为图标按钮，不展示文字。
2. 返回行为统一为：
   - 优先回上一页（`history.back`）；
   - 无历史时回退到约定兜底页。
3. 列表页支持滚动位置记忆与恢复：
   - 跳转详情前保存滚动位置；
   - 返回列表后在首轮渲染完成时恢复位置。

## 影响

- 影响文件：
  - `apps/delivery-app/src/app-shell.js`
  - `apps/delivery-app/src/delivery-shell.css`
  - `apps/delivery-app/src/order-list.html`
  - `apps/delivery-app/src/order-detail.html`
  - `apps/delivery-app/src/customer-list-client.js`
  - `apps/delivery-app/src/customer-detail.html`
  - `apps/delivery-app/src/finance-overview.html`
  - `apps/delivery-app/src/finance-daily-close.html`
  - `apps/delivery-app/src/inventory.html`
  - `apps/delivery-app/src/debt-overview.html`
  - `apps/delivery-app/src/quick-order.html`
  - `apps/delivery-app/src/delivery-complete.html`
  - `apps/delivery-app/src/offline-sync.html`
- 不影响：后端接口契约
