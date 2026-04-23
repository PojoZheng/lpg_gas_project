# 2026-04-14 移动端完单页：安检必做由策略决定 + 提示按操作触发

## 状态

- `confirmed`

## 背景

- 用户确认“安检是否随单必做”应由平台策略下发决定，前端不应写死强制。
- 当前完单页有多处常驻提示文案，页面信息噪音偏高。

## 最终结论

1. 完单页读取平台当前策略 `safetyCheckRequired`，仅在为 `true` 时强制“上一单安检未完成不得继续下一单完单”。
2. 仅在用户触发操作时展示提示文案；默认页面不常驻提示文字。

## 影响

- 影响文件：
  - `apps/delivery-app/src/delivery-complete-client.js`
  - `apps/delivery-app/src/delivery-complete.html`
- 不影响：后端策略字段与安检接口契约
