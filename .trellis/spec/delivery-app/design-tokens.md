# 配送员端 Design Tokens

本规范用于统一配送员端视觉风格，主色为 `#4799a0`。本文件由 `DESIGN.md` 映射生成，并与 `/.trellis/ui-kit/styles/tokens.css` 保持一致。

## 1. 颜色系统
| Token | 值 | 语义 |
|---|---|---|
| `Brand.Primary` | `#4799a0` | 主品牌色，主按钮、选中态、进度与关键强调 |
| `Brand.PrimarySoft` | `#E7F3F4` | 主色弱化底，用于图标容器和浅提示背景 |
| `Neutral.Background` | `#F7F8FA` | 页面背景色（浅灰白） |
| `Neutral.Surface` | `#FFFFFF` | 卡片与弹层背景 |
| `Neutral.Border` | `#ECEFF3` | 弱边框与分割线 |
| `Neutral.TextPrimary` | `#111111` | 主文字 |
| `Neutral.TextSecondary` | `#8B9098` | 次文字 |
| `System.Success` | `#16A34A` | 成功状态 |
| `System.Warning` | `#F59E0B` | 警告状态 |
| `System.Error` | `#EF4444` | 错误状态 |

### 状态语义
- `State.Info.Bg` / `State.Info.Text`
- `State.Success.Bg` / `State.Success.Text`
- `State.Warning.Bg` / `State.Warning.Text`
- `State.Error.Bg` / `State.Error.Text`

## 2. 圆角与边框
- `Radius.PageCard`: `24`
- `Radius.Card`: `20`
- `Radius.Button`: `16`
- `Radius.Input`: `14`
- `Radius.IconContainer`: `14`
- `Border.Hairline`: `1`

## 3. 阴影与层次
- 默认不使用重阴影，优先“浅色背景 + 弱边框”表达层级。
- 若必须使用阴影，仅允许轻阴影：
  - `Shadow.Soft`: `0 4 16 rgba(17, 17, 17, 0.05)`

## 4. 间距系统
- `Space.2XS`: `4`
- `Space.XS`: `8`
- `Space.S`: `12`
- `Space.M`: `16`
- `Space.L`: `24`
- `Space.XL`: `32`

## 5. 排版系统
| Token | 字重 | 场景 | 字体 |
|---|---|---|---|
| `Text.Display` | 700 | 金额、核心数据 | `Space Grotesk` |
| `Text.Title` | 600 | 页面标题、卡片标题 | `Space Grotesk` |
| `Text.Body` | 400 | 正文、说明 | `Inter` |
| `Text.Caption` | 400 | 次要信息、时间、辅助提示 | `Inter` |

### 字体回退栈
- `Font.Display`: `"Space Grotesk", "Inter", "PingFang SC", "Noto Sans SC", sans-serif`
- `Font.Body`: `"Inter", "Space Grotesk", "PingFang SC", "Noto Sans SC", sans-serif`

## 6. Token 到实现映射（ui-kit）
| 规范 Token | CSS 变量 | 文件 |
|---|---|---|
| `Brand.Primary` | `--ds-color-brand` | `/.trellis/ui-kit/styles/tokens.css` |
| `Neutral.Surface` | `--ds-color-surface` | `/.trellis/ui-kit/styles/tokens.css` |
| `Radius.Button` | `--ds-radius-btn` | `/.trellis/ui-kit/styles/tokens.css` |
| `Space.M` | `--ds-space-m` | `/.trellis/ui-kit/styles/tokens.css` |
| `Text.Body` | `--ds-font-size-body` | `/.trellis/ui-kit/styles/tokens.css` |
| `State.Info.Bg` | `--ds-state-info-bg` | `/.trellis/ui-kit/styles/tokens.css` |
| `State.Error.Text` | `--ds-state-error-text` | `/.trellis/ui-kit/styles/tokens.css` |

## 7. 强制约束
- 禁止硬编码视觉常量，必须引用 token。
- 界面文案必须使用中文。
- 禁止在界面中使用 emoji。
- 图标统一使用矢量图标库（如 `MaterialCommunityIcons`）。
- 引入样式时必须优先使用 `/.trellis/ui-kit/styles/tokens.css`，禁止绕过 token 直接写状态色常量。