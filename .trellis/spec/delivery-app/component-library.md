# 组件库规范（配送员端）

## 1. 组件分层
- 基础层：按钮、输入框、标签、分割线、图标容器
- 业务层：订单卡片、客户卡片、收入统计卡片、安检项、同步状态条
- 页面层：工作台页面骨架、订单流程弹层、日结页面骨架

### 跨端复用底座（app + web）
- 统一复用 `/.trellis/ui-kit/`：
  - `styles/tokens.css`
  - `styles/components.css`
  - `icons/sprite.svg`
- 首版组件资产用于 A/B 并行接入，禁止在新页面重复定义基础按钮/卡片/导航/表单样式。

## 2. 通用组件约束
- 颜色、圆角、间距必须引用 `design-tokens.md`。
- 组件文案必须为中文。
- 组件内严禁 emoji。
- 组件状态至少覆盖：默认、按下、禁用、加载、错误。

## 3. 关键组件定义
### 主按钮 `PrimaryButton`
- 颜色：`Brand.Primary`
- 圆角：`Radius.Button`
- 用于提交、确认、推进流程
- 实现类：`.ds-btn.ds-btn-primary`

### 卡片容器 `AppCard`
- 背景：`Neutral.Surface`
- 边框：`Neutral.Border`
- 圆角：`Radius.Card`
- 实现类：`.ds-card` / `.ds-card-title`

### 底部导航 `BottomNav`
- 三栏固定：`首页 / 客户 / 我的`
- 激活态：`Brand.Primary` 背景 + 白色文字
- 实现类：`.ds-nav` / `.ds-nav-btn.active`

### 表单基线 `FormField`
- 输入与下拉高度不低于 `48`
- 标签与输入间距遵循 `Space.2XS` + `Space.XS`
- 实现类：`.ds-field` / `.ds-label` / `.ds-input` / `.ds-select`

### 状态提示 `StatusBadge`
- 用于同步状态、订单状态、债务风险
- 需提供颜色和文案映射，不允许自由拼接词
- 实现类：`.ds-status-badge` + `info|success|warning|error`

### 图标 `IconSprite`
- 统一从 `/.trellis/ui-kit/icons/sprite.svg` 引用
- 命名遵循语义：`i-home` / `i-customer` / `i-my` / `i-arrow-right`
- 推荐容器类：`.ds-icon`

### 页面头 `PageHeader`
- 结构：标题 + 右侧操作（可选返回/刷新）
- 实现类：`.ds-page-header` / `.ds-page-header-title`

### 统计卡 `StatCard`
- 用于收入、数量、状态汇总展示
- 实现类：`.ds-stat-card` / `.ds-stat-label` / `.ds-stat-value`

### 表单分组 `FormSection`
- 用于订单输入、筛选区块化
- 实现类：`.ds-form-section` / `.ds-form-section-title`

### 空状态 `EmptyState`
- 空列表/无数据时统一展示结构与文案层级
- 实现类：`.ds-empty-state` / `.ds-empty-title` / `.ds-empty-desc`

### 反馈横幅 `FeedbackBanner`
- 用于跨组件状态反馈（非弹窗）
- 实现类：`.ds-feedback-banner` + `info|success|warning|error`

## 4. 组件验收
- 视觉风格与参考图一致（浅底、弱边框、卡片化）
- 文案中文化合规
- 无 emoji，图标统一使用矢量图标库
- 新增页面需给出 UI Kit 接入路径与最小示例链接。
- 与 `DESIGN.md` 的 token/字体/间距映射一致，不允许私有偏移实现。
- 页面重构（task-33/34）必须复用上述 5 个强化组件中的至少 2 个。
