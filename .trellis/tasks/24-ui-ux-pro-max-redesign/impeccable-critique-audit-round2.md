# Task-24 Round-2 /impeccable critique + audit

## 审查方式
- `/impeccable teach`：基于现有 `/.impeccable.md` 做上下文更新（新增 task-24 导航与改造约束）。
- `/critique` 与 `/audit`：围绕本轮责任页面执行等效审查并形成可落地改造项。

## 审查页面
- `/apps/delivery-app/src/workbench.html`
- `/apps/delivery-app/src/quick-order.html`
- `/apps/delivery-app/src/delivery-complete.html`

## /critique 关键结论
1. 首页混入低频入口（平台/同步/策略），主流程焦点被稀释。
2. 三页底部导航虽是三项，但“我的”并非稳定落点，用户心智不一致。
3. 页面壳层样式重复定义较多，导致样式节奏无法稳定复用。
4. 提示与返回文案不统一（返回工作台/返回上一页混用），语义不清。

## /audit 关键结论
1. 可触达性：主要按钮尺寸可达标，但个别按钮体系高度与反馈规范不统一。
2. 可恢复性：低频能力散落在多个页面，异常时回退路径认知成本偏高。
3. 信息安全性：状态提示缺少统一可读策略，错误态扫描效率可提升。
4. 一致性风险：无共享壳层样式时，后续页面迭代容易出现风格漂移。

## 对应改造策略
- `/arrange`：新增 `delivery-shell.css` 作为共享壳层样式基线。
- `/clarify`：统一“返回首页/进入我的”等导航语义，减少歧义。
- `/polish`：收敛页面入口信息密度，强化高频流程优先级。
- `/normalize`：新增 `my.html`，承接低频能力并统一三页底部“我的”指向。
- `/harden`：关键提示区补充 `aria-live="polite"`，提高状态反馈可感知性。
