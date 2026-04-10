# Task-32 完成说明（Web 端按 DESIGN.md 重构）

## 本轮目标
- 按 `DESIGN.md` 对平台端四页（`index / platform-monitor / policy-release / sync-queue`）做统一视觉重构。
- 统一侧栏 + 顶部栏 + 卡片风格，主色固定 `#4799a0`，避免黑色主态。
- 保持平台端接口契约不变，仅改 UI/交互展示层。

## 已完成项
1. 四页统一接入 `platform-design-system.css`，保证页面壳层一致：
   - 左侧导航（单入口 + 当前页高亮）
   - 顶部栏（标题 + 返回入口）
   - 内容卡片与指标卡布局
2. 根据 `DESIGN.md` 收敛 design token：
   - 主色与主态交互统一为 `#4799a0` 系列
   - 圆角调整到基线（Card=20, Button=16, Input=14, Nav=12）
   - 保持浅色背景 + 弱边框 + 低噪音视觉层次
3. 字体体系对齐：
   - 标题与关键数字优先 `Space Grotesk`
   - 正文与表单优先 `Inter`（含中文回退）
4. 交互状态补齐：
   - 侧栏 active/active-press 使用品牌浅底与主色，避免黑色品牌偏移
   - 主按钮 hover/active 使用主色深一阶，不引入黑色主态

## 接口契约确认
- `platform-monitor-client.js`、`policy-release-client.js`、`sync-queue-client.js` 调用路径与请求结构保持不变。
- 本轮未修改任何后端接口、字段或业务流程分支。

## 影响文件
- `.trellis/platform/src/platform-design-system.css`
- `.trellis/tasks/32-web-design-md-refactor/task.json`
