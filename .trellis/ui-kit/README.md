# UI Kit v0 (A/B 接入版)

## 文件结构
- `styles/tokens.css`：app + web 共用 token（色彩/圆角/阴影/间距/字体）
- `styles/components.css`：基础组件样式（按钮/卡片/导航/表单）
- `icons/sprite.svg`：SVG 图标符号集（home/customer/my/arrow-right）
- `examples/minimal-integration.html`：最小接入示例

## 最小接入
1. 在页面 head 中引入：
   - `/.trellis/ui-kit/styles/tokens.css`
   - `/.trellis/ui-kit/styles/components.css`
2. 组件类名直接使用：
   - 按钮：`ds-btn ds-btn-primary`
   - 卡片：`ds-card`
   - 导航：`ds-nav` + `ds-nav-btn`
   - 表单：`ds-label` + `ds-input`/`ds-select`
3. 图标按需引用 `icons/sprite.svg` 中的 symbol（后续可通过构建注入或内联）。
