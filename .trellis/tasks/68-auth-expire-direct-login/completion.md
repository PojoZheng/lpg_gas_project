# 68-auth-expire-direct-login 完成记录

## 验收结果

1. 认证层会话缺失/失效时统一直接跳转登录页。
2. 会话失效跳转不再携带提示文案参数。
3. `workbench/offline-sync/quick-order` 客户端模块不再返回“未登录请先登录”提示文案给页面展示。
4. 登录接口与会话存储结构未变更。

## 引用 spec

- `product/decisions/2026-04-15-auth-expire-direct-login.md`
