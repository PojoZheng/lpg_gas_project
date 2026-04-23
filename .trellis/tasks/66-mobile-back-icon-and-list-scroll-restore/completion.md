# 66-mobile-back-icon-and-list-scroll-restore 完成记录

## 验收结果

1. 二三级页“返回上一页”入口已统一为图标按钮样式。
2. 返回行为已统一为优先上一页（`history.back`），无历史时走页面兜底路径。
3. 订单列表、客户列表已接入“离开前记忆 + 返回后恢复”滚动位置机制。
4. 业务接口与数据契约未变更。

## 引用 spec

- `product/prd/2026-04-14-lpg-vendor-prd-v1.md`
- `product/decisions/2026-04-15-mobile-back-icon-and-list-scroll-restore.md`

## 风险与后续

- `order-detail.html` 原有脚本包含顶层 `return` 写法，建议后续独立任务修正为函数封装以强化静态语法检查稳定性。
