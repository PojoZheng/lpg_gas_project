# 30-design-token-component-baseline completion

## 交付内容
- 新增 `/.trellis/spec/delivery-app/DESIGN.md`，作为统一视觉源规范。
- 将 DESIGN 规范映射到：
  - `/.trellis/spec/delivery-app/design-tokens.md`
  - `/.trellis/spec/delivery-app/component-library.md`
- 完善 UI Kit 基线：
  - `/.trellis/ui-kit/styles/tokens.css`
  - `/.trellis/ui-kit/styles/components.css`
  - `/.trellis/ui-kit/examples/minimal-integration.html`

## 最小接入示例
- 路径：`/.trellis/ui-kit/examples/minimal-integration.html`
- 引入：
  - `/.trellis/ui-kit/styles/tokens.css`
  - `/.trellis/ui-kit/styles/components.css`

## 验证
- `python3 ./.trellis/scripts/auto_test_runner.py --once` 通过
