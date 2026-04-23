# 2026-04-15 登录会话失效处理收口：直接跳登录页

## 状态

- `confirmed`

## 背景

- 会话失效时，部分页面仍可能显示“未登录/登录失效”提示文案。
- 用户要求会话失效后直接回登录页，不在业务页提示。

## 最终结论

1. 会话缺失或鉴权失败时，由认证层统一执行跳转登录页。
2. 会话失效跳转不附带提示文案参数（`from`）。
3. 客户端模块不再返回“未登录请先登录”这类提示文案给页面展示。

## 影响

- 影响文件：
  - `apps/delivery-app/src/auth-client.js`
  - `apps/delivery-app/src/workbench-client.js`
  - `apps/delivery-app/src/offline-sync-client.js`
  - `apps/delivery-app/src/quick-order-client.js`
- 不影响：登录页主动退出提示与登录流程
