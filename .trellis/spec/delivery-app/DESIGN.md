# Delivery App DESIGN Baseline

本文件定义 app + web 统一视觉基线，作为 token 与组件实现的唯一映射源。

## 1. 视觉风格
- 主色：`#4799a0`
- 背景：浅灰白，卡片化，弱边框
- 表达原则：高对比文本 + 低噪音装饰 + 清晰状态反馈

## 2. 字体系统
- 标题与数字强调：`Space Grotesk`
- 正文与表单：`Inter`
- 中文回退：`PingFang SC` / `Noto Sans SC` / `sans-serif`

## 3. 设计令牌（源定义）
### 颜色
- `Brand.Primary`: `#4799a0`
- `Brand.PrimarySoft`: `#e7f3f4`
- `Neutral.Background`: `#f7f8fa`
- `Neutral.Surface`: `#ffffff`
- `Neutral.Border`: `#eceff3`
- `Neutral.TextPrimary`: `#424949`
- `Neutral.TextSecondary`: `#8b9098`
- `System.Success`: `#16a34a`
- `System.Warning`: `#f59e0b`
- `System.Error`: `#ef4444`

### 圆角
- `Radius.Card`: `20`
- `Radius.Button`: `16`
- `Radius.Input`: `14`
- `Radius.Nav`: `12`
- `Radius.Pill`: `999`

### 间距
- `Space.2XS`: `4`
- `Space.XS`: `8`
- `Space.S`: `12`
- `Space.M`: `16`
- `Space.L`: `24`
- `Space.XL`: `32`

### 状态语义（State）
- `State.Info.Bg`: `Brand.PrimarySoft`
- `State.Info.Text`: `Brand.Primary`
- `State.Success.Bg`: `#ecfdf3`
- `State.Success.Text`: `System.Success`
- `State.Warning.Bg`: `#fff7ed`
- `State.Warning.Text`: `#b45309`
- `State.Error.Bg`: `#fef2f2`
- `State.Error.Text`: `System.Error`

## 4. 基础组件基线
- 按钮：`Primary / Secondary / Ghost / Disabled`
- 卡片：`Card + CardTitle + CardSubText`
- 导航：底部三栏导航，激活态统一主色
- 表单：标签 + 输入/下拉，最小触达 `48x48`
- 状态提示：`Info / Success / Warning / Error`（文案必须中文）
- 强化组件（task-35）：
  - `PageHeader`
  - `StatCard`
  - `FormSection`
  - `EmptyState`
  - `FeedbackBanner`

## 5. 图标体系
- 统一使用 SVG symbol sprite，禁止页面散落内联 SVG 路径。
- 图标命名使用语义前缀：`i-home`、`i-customer`、`i-my`、`i-arrow-right`。
- 图标容器统一圆角与浅底色，不使用 emoji 代替图标。

## 6. App 页面约束
- 适用页面：`workbench / quick-order / delivery-complete / my`
- 底部导航固定三项：`首页 / 客户 / 我的`
- 可触达区域不低于 `48x48`
- 仅允许 UI/交互优化，不改接口契约与业务语义
- 加载/失败/空状态文案统一中文且可感知
