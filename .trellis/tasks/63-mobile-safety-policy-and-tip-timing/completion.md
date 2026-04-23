# 63-mobile-safety-policy-and-tip-timing 完成记录

## 验收结果

1. 完单页已接入平台当前策略读取，`safetyCheckRequired=true` 才启用“未安检不得继续完单”拦截。
2. 页面提示位（完单提示、账户提示、安检提示、底部状态）默认隐藏，仅在操作触发时显示。
3. 后端接口与字段契约未改动。

## 引用 spec

- `product/prd/2026-04-14-lpg-vendor-prd-v1.md`
- `product/decisions/2026-04-14-mobile-safety-required-by-policy-and-on-demand-tips.md`

## 风险与后续

- 若未来策略按区域/配送员差异化下发，需补充移动端会话级缓存与失效机制。
