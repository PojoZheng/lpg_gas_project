# 初始化任务：补齐项目开发规范

## 目标
建立可执行、可追溯、中文化的项目规范体系，确保后续 AI 与开发者协同一致。

## 任务范围

### 后端规范
| 文件 | 需要补齐内容 |
|---|---|
| `.trellis/spec/backend/directory-structure.md` | 目录分层与模块边界 |
| `.trellis/spec/backend/database-guidelines.md` | 数据模型、迁移、事务、命名规范 |
| `.trellis/spec/backend/error-handling.md` | 错误分类、返回格式、重试策略 |
| `.trellis/spec/backend/logging-guidelines.md` | 日志级别、字段、脱敏要求 |
| `.trellis/spec/backend/quality-guidelines.md` | 代码质量、测试与验收门禁 |

### 前端/客户端规范
| 文件 | 需要补齐内容 |
|---|---|
| `.trellis/spec/delivery-app/design-tokens.md` | 色彩、间距、圆角、阴影 token |
| `.trellis/spec/delivery-app/ui-manifest.md` | 视觉与交互禁令、中文化、禁用 emoji |
| `.trellis/spec/delivery-app/component-library.md` | 组件定义、状态覆盖、验收规则 |

## 执行原则
1. 先描述当前真实约束，再给出推荐做法。
2. 所有文档使用中文，界面文案使用中文。
3. 界面中严禁使用 emoji，统一使用图标库。
4. 每条规范尽量附带来源文件或可验证依据。

## 完成检查
- [ ] 核心规范文档已补齐
- [ ] 任务与 PRD 文档已中文化
- [ ] 设计规范已明确主色 `#4799a0`
- [ ] 已写入“禁用 emoji”强制规则
