# 自治 Agent 工作流系统架构设计

> **版本**: v1.0  
> **角色**: PM+Architect Agent  
> **目标**: 实现任务自动拆解与多 Agent 协调的自治工作流

---

## 1. 系统概述

### 1.1 核心目标

```
┌─────────────────────────────────────────────────────────────────┐
│                    自治 Agent 工作流系统                          │
├─────────────────────────────────────────────────────────────────┤
│  输入: 产品需求/用户指令                                          │
│                         ↓                                       │
│  ┌─────────────────┐  ┌──────────────────┐  ┌─────────────────┐ │
│  │ PM+Architect    │→ │ Task Decomposer  │→ │ Agent Scheduler │ │
│  │ Agent           │  │ (任务拆解器)      │  │ (调度器)         │ │
│  │ · 需求分析       │  │ · <60k tokens    │  │ · 负载均衡       │ │
│  │ · 架构设计       │  │   步骤切割       │  │ · 依赖排序       │ │
│  │ · 验收标准       │  │ · 上下文保留     │  │ · 冲突解决       │ │
│  └─────────────────┘  └──────────────────┘  └─────────────────┘ │
│                         ↓                                       │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Trellis Bus (~/.trellis-bus/)              │   │
│  │  · 消息队列  · 状态同步  · 事件广播  · 心跳检测          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                         ↓                                       │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐           │
│  │ Dev A   │  │ Dev B   │  │ Dev C   │  │Integrator│           │
│  │ 辅树    │  │ 辅树    │  │ 辅树    │  │ 主仓    │           │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘           │
│                         ↓                                       │
│  输出: 可运行的代码 + 测试通过 + 文档更新                         │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 设计原则

| 原则 | 说明 |
|------|------|
| **Token 预算管理** | 每个步骤 < 60k tokens，预留 20% 缓冲 |
| **上下文连续性** | 步骤间通过 Trellis Bus 传递最小必要上下文 |
| **自治决策** | Agent 在边界内自主决策，减少人工介入 |
| **可观测性** | 全链路状态可见，便于追踪和调试 |

---

## 2. 核心组件架构

### 2.1 组件关系图

```
┌─────────────────────────────────────────────────────────────────────┐
│                        PM+Architect Agent                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │ Requirements │  │  Architecture │  │  Acceptance  │              │
│  │   Analyzer   │  │   Designer    │  │   Criteria   │              │
│  └──────────────┘  └──────────────┘  └──────────────┘              │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      Task Decomposer (任务拆解器)                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │   Slicer     │  │  Estimator   │  │  Sequencer   │              │
│  │  (步骤切片)   │  │ (Token估算)  │  │  (依赖排序)   │              │
│  └──────────────┘  └──────────────┘  └──────────────┘              │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       Trellis Bus 协调层                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │  Message     │  │   State      │  │   Event      │              │
│  │   Queue      │  │   Store      │  │   Stream     │              │
│  │  (~/.trellis-bus/queue/)      │  │  (~/.trellis-bus/events/)   │
│  └──────────────┘  └──────────────┘  └──────────────┘              │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
            ┌───────────┐   ┌───────────┐   ┌───────────┐
            │  Dev A    │   │  Dev B    │   │  Dev C    │
            │ Worktree  │   │ Worktree  │   │ Worktree  │
            └───────────┘   └───────────┘   └───────────┘
                    │               │               │
                    └───────────────┼───────────────┘
                                    ▼
                          ┌─────────────────┐
                          │   Integrator    │
                          │   (Main Repo)   │
                          └─────────────────┘
```

### 2.2 组件职责矩阵

| 组件 | 职责 | 输入 | 输出 |
|------|------|------|------|
| **PM+Architect Agent** | 需求分析、架构设计、验收标准制定 | 原始需求 | PRD、架构图、验收清单 |
| **Task Decomposer** | 任务拆解、Token 预算分配、依赖分析 | PRD、架构图 | 步骤列表 (Step[]) |
| **Trellis Bus** | 消息路由、状态同步、事件广播 | 步骤执行请求 | 执行结果、状态更新 |
| **Dev Agent** | 代码实现、单元测试、文档更新 | 步骤定义 | 代码提交、测试报告 |
| **Integrator Agent** | 合并、集成测试、发布 | PR 列表 | 合并后的 main 分支 |

---

## 3. 任务拆解算法 (Task Decomposition)

### 3.1 Token 预算模型

```python
# Token 预算分配 (每个步骤)
TOKEN_BUDGET = {
    "total_limit": 60000,           # 硬上限
    "context_reserve": 0.20,         # 20% 上下文预留
    "output_reserve": 0.15,          # 15% 输出预留
    "safety_buffer": 0.10,           # 10% 安全缓冲
    "usable": 0.55,                  # 55% 实际可用 (~33k)
}

# 各阶段典型 Token 消耗
TOKEN_PROFILES = {
    "code_reading": {"min": 2000, "avg": 5000, "max": 15000},    # 代码阅读
    "code_writing": {"min": 3000, "avg": 8000, "max": 20000},    # 代码编写
    "test_writing": {"min": 1500, "avg": 4000, "max": 10000},    # 测试编写
    "refactoring": {"min": 2500, "avg": 6000, "max": 15000},     # 重构
    "doc_writing": {"min": 1000, "avg": 3000, "max": 8000},      # 文档编写
}
```

### 3.2 拆解策略

```
┌─────────────────────────────────────────────────────────────────────┐
│                     任务拆解流程                                      │
└─────────────────────────────────────────────────────────────────────┘

输入: PRD + 架构设计
    │
    ▼
┌─────────────────┐
│ 1. 功能分解      │  将 PRD 拆分为独立功能点
│    (Functional  │  例: "用户登录" → [验证手机号, 发送验证码, 校验验证码]
│    Breakdown)   │
└─────────────────┘
    │
    ▼
┌─────────────────┐
│ 2. 技术映射      │  将功能点映射到技术实现
│    (Technical   │  例: "验证手机号" → [创建 API 端点, 实现验证逻辑, 添加测试]
│    Mapping)     │
└─────────────────┘
    │
    ▼
┌─────────────────┐
│ 3. 文件分组      │  按文件关联性分组
│    (File        │  原则: 同一目录/模块的文件尽量在同一批次
│    Grouping)    │
└─────────────────┘
    │
    ▼
┌─────────────────┐
│ 4. Token 估算    │  估算每批次 Token 消耗
│    (Token       │  公式: 代码行数 × 3 + 上下文行数 × 2 + 输出预估
│    Estimation)  │
└─────────────────┘
    │
    ▼
┌─────────────────┐
│ 5. 批次合并/拆分 │  合并小批次, 拆分超预算批次
│    (Batch       │  目标: 每批次 30k-50k tokens
│    Optimization)│
└─────────────────┘
    │
    ▼
┌─────────────────┐
│ 6. 依赖排序      │  确定执行顺序
│    (Dependency  │  原则: 接口先于实现, 基础先于业务
│    Ordering)    │
└─────────────────┘
    │
    ▼
输出: 有序的 Step 列表
```

### 3.3 Step 数据结构

```typescript
interface Step {
  // 基本信息
  id: string;                    // 唯一标识: "step-{task-id}-{seq}"
  taskId: string;                // 所属任务 ID
  sequence: number;              // 执行顺序
  
  // 内容定义
  title: string;                 // 步骤标题 (一句话)
  description: string;           // 详细描述
  acceptance: string[];          // 验收标准 checklist
  
  // Token 预算
  tokenBudget: {
    estimated: number;           // 预估 Token 数
    limit: number;               // 硬上限 (默认 60k)
    contextReserve: number;      // 上下文预留
  };
  
  // 输入/输出
  inputs: {
    files: string[];             // 需要读取的文件
    contextFrom: string[];       // 依赖的前序步骤 ID
    specRefs: string[];          // 相关规范文档
  };
  outputs: {
    files: string[];             // 预期修改/创建的文件
    tests: string[];             // 预期测试文件
    docs: string[];              // 预期文档更新
  };
  
  // 依赖关系
  dependencies: {
    steps: string[];             // 依赖的步骤 ID (must complete first)
    optional: string[];          // 可选依赖 (nice to have)
  };
  
  // 执行元数据
  agent: {
    type: "dev-a" | "dev-b" | "dev-c" | "integrator";
    worktree?: string;           // 指定 worktree 路径
  };
  
  // 状态 (运行时填充)
  status: "pending" | "assigned" | "running" | "completed" | "failed" | "blocked";
  startedAt?: string;
  completedAt?: string;
  result?: {
    commitHash?: string;
    prUrl?: string;
    testReport?: string;
    tokenUsed?: number;
  };
}
```

---

## 4. Trellis Bus 协调机制

### 4.1 目录结构

```
~/.trellis-bus/
├── config.yaml              # 总线配置
├── projects/                # 项目状态目录
│   └── {project-id}/
│       ├── state.json       # 当前项目状态
│       ├── active-task.json # 当前活动任务
│       └── steps/
│           ├── step-001.json
│           ├── step-002.json
│           └── ...
├── queue/                   # 消息队列
│   ├── pending/             # 待处理消息
│   ├── processing/          # 处理中消息
│   └── completed/           # 已完成消息
├── events/                  # 事件流
│   ├── {yyyy-mm-dd}/
│   │   └── {timestamp}-{event-type}.json
├── agents/                  # Agent 注册表
│   └── {agent-id}.json
└── shared-context/          # 共享上下文
    ├── {project-id}/
    │   ├── summaries/       # 步骤摘要 (轻量)
    │   └── artifacts/       # 构建产物
```

### 4.2 消息协议

```typescript
// 基础消息接口
interface BusMessage {
  id: string;                  // 消息唯一 ID
  type: MessageType;
  timestamp: string;           // ISO 8601
  projectId: string;
  taskId: string;
  payload: unknown;
  metadata: {
    sender: string;            // Agent ID
    priority: number;          // 1-10, 数字越小优先级越高
    ttl?: number;              // 生存时间 (秒)
  };
}

// 消息类型枚举
type MessageType =
  | "step.assign"              // 分配步骤给 Agent
  | "step.start"               // Agent 开始执行
  | "step.progress"            // 进度更新 (每 5min 或关键节点)
  | "step.complete"            // 步骤完成
  | "step.fail"                // 步骤失败
  | "step.block"               // 步骤被阻塞
  | "agent.heartbeat"          // Agent 心跳
  | "agent.register"           // Agent 注册
  | "agent.unregister"         // Agent 注销
  | "task.create"              // 创建新任务
  | "task.update"              // 更新任务状态
  | "broadcast.coordination";  // 协调广播

// 步骤分配消息示例
interface StepAssignMessage extends BusMessage {
  type: "step.assign";
  payload: {
    stepId: string;
    stepPath: string;          // ~/.trellis-bus/projects/{id}/steps/{step-id}.json
    contextSnapshot: {
      summary: string;         // 前序步骤摘要
      keyDecisions: string[];  // 关键决策点
      relevantFiles: string[]; // 相关文件列表
    };
    deadline?: string;         // 可选截止时间
  };
}

// 步骤完成消息示例
interface StepCompleteMessage extends BusMessage {
  type: "step.complete";
  payload: {
    stepId: string;
    result: {
      commitHash: string;
      prUrl?: string;
      filesChanged: string[];
      testsPassed: boolean;
      tokenUsed: number;
    };
    summary: string;           // 本步骤执行摘要 (供后续步骤使用)
    nextStepsReady: string[];  // 可解锁的步骤
  };
}
```

### 4.3 状态机

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Step 状态机                                   │
└─────────────────────────────────────────────────────────────────────┘

                         ┌─────────────┐
                    ┌───→│   PENDING   │←────────────────┐
                    │    │   (待定)     │                 │
                    │    └─────────────┘                 │
                    │           │                         │
           依赖未满足           │ 分配                     │ 重试
                    │           ▼                         │
                    │    ┌─────────────┐    依赖满足      │
                    └─── │   BLOCKED   │─────────────────┘
                         │   (阻塞)     │
                         └─────────────┘
                                │
                                ▼
                         ┌─────────────┐
                    ┌───→│   ASSIGNED  │
                    │    │   (已分配)   │
                    │    └─────────────┘
                    │           │
            超时/释放           │ 开始执行
                    │           ▼
                    │    ┌─────────────┐
                    └─── │   RUNNING   │←────────────────┐
                         │   (执行中)   │                 │
                         └─────────────┘                 │
                                │                         │
                      ┌─────────┴─────────┐               │
                      ▼                   ▼               │
               ┌─────────────┐      ┌─────────────┐       │
               │  COMPLETED  │      │   FAILED    │───────┘
               │   (完成)     │      │   (失败)     │
               └─────────────┘      └─────────────┘
```

### 4.4 Agent 协调流程

```
┌─────────────────────────────────────────────────────────────────────┐
│                     多 Agent 协调时序图                               │
└─────────────────────────────────────────────────────────────────────┘

PM+Architect          Trellis Bus           Dev A           Dev B
     │                     │                  │               │
     │──1. 拆解任务────────→│                  │               │
     │   (生成 Steps)       │                  │               │
     │                     │                  │               │
     │                     │←─────────2. 注册 Agent───────────│
     │                     │   (heartbeat)    │               │
     │                     │                  │               │
     │                     │──3. 分配 Step A───────────────→│
     │                     │                  │               │
     │                     │←─────────4. 接受任务─────────────│
     │                     │                  │               │
     │                     │──5. 分配 Step B────────────────→│
     │                     │                                  │
     │                     │←──────────────────6. 接受任务────│
     │                     │                  │               │
     │                     │←─────────7. 进度更新─────────────│
     │                     │   (每 5min 或关键节点)            │
     │                     │                  │               │
     │                     │←──────────────────8. Step B 完成──│
     │                     │   (触发 Step C)                   │
     │                     │                                  │
     │                     │──9. 分配 Step C───────────────→│
     │                     │   (如果 Dev A 已完成 Step A)      │
     │                     │                                  │
     │                     │←────────10. Step A 完成──────────│
     │                     │                  │               │
     │                     │──11. 广播任务完成────────────────→│
     │                     │                  │               │
     │←────────────────12. 通知集成───────────────────────────│
         (所有步骤完成, 进入集成阶段)
```

---

## 5. PM+Architect Agent 详细设计

### 5.1 职责边界

```
┌─────────────────────────────────────────────────────────────────────┐
│                    PM+Architect Agent 职责                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Phase 1: 需求分析 (Requirements Analysis)                           │
│  ─────────────────────────────────────────                          │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐                   │
│  │ 用户故事提取 │ │  边界识别   │ │  风险标记   │                   │
│  │ · 角色分析  │ │ · 输入边界  │ │ · 技术风险  │                   │
│  │ · 场景列举  │ │ · 输出边界  │ │ · 依赖风险  │                   │
│  │ · 验收标准  │ │ · 异常场景  │ │ · 资源风险  │                   │
│  └─────────────┘ └─────────────┘ └─────────────┘                   │
│                                                                     │
│  Phase 2: 架构设计 (Architecture Design)                             │
│  ─────────────────────────────────────────                          │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐                   │
│  │ 模块划分    │ │  接口设计   │ │  数据模型   │                   │
│  │ · 领域边界  │ │ · API 契约  │ │ · 实体关系  │                   │
│  │ · 层次结构  │ │ · 事件格式  │ │ · 状态流转  │                   │
│  │ · 依赖关系  │ │ · 错误码    │ │ · 存储方案  │                   │
│  └─────────────┘ └─────────────┘ └─────────────┘                   │
│                                                                     │
│  Phase 3: 任务拆解 (Task Decomposition)                              │
│  ─────────────────────────────────────────                          │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐                   │
│  │ 步骤生成    │ │ Token 分配  │ │ 依赖排序    │                   │
│  │ · 功能切片  │ │ · 预算估算  │ │ · 拓扑排序  │                   │
│  │ · 文件分组  │ │ · 缓冲预留  │ │ · 并行识别  │                   │
│  │ · 验收映射  │ │ · 动态调整  │ │ · 关键路径  │                   │
│  └─────────────┘ └─────────────┘ └─────────────┘                   │
│                                                                     │
│  Phase 4: 协调发布 (Coordination)                                    │
│  ─────────────────────────────────────────                          │
│  · 写入 Trellis Bus                                                │
│  · 广播任务分配                                                     │
│  · 监控执行状态                                                     │
│  · 处理阻塞/异常                                                    │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.2 决策树: 何时新建任务

```
收到新需求
    │
    ├──→ 能塞进当前 in_progress 任务?
    │       │
    │       ├──→ 是 → 不改验收边界?
    │       │       │
    │       │       ├──→ 是 → 记入备注/journal
    │       │       │           │
    │       │       │           └──→ 结束
    │       │       │
    │       │       └──→ 否 → 扩展验收边界?
    │       │               │
    │       │               ├──→ 是 → 更新 task.json
    │       │               │           │
    │       │               │           └──→ 结束
    │       │               │
    │       │               └──→ 否 → 新建任务
    │       │                           │
    │       │                           └──→ [新建任务流程]
    │       │
    │       └──→ 否 → 新能力/新边界/新依赖?
    │               │
    │               ├──→ 是 → [新建任务流程]
    │               │
    │               └──→ 否 → 紧急小改?
    │                       │
    │                       ├──→ 是 → 开临时任务
    │                       │           │
    │                       │           └──→ 结束
    │                       │
    │                       └──→ 否 → 需求不明确
    │                                   │
    │                                   └──→ 澄清后重入
    │
    └──→ [新建任务流程]
            │
            ├──→ 1. 判断成熟度
            │       │
            │       ├──→ 轻量 → 直接建 task.json
            │       │           │
            │       │           └──→ 开发先动, spec 迭代中补
            │       │
            │       ├──→ 标准 → 先补 spec 章节
            │       │           │
            │       │           └──→ 再建 task.json
            │       │
            │       └──→ 重型 → 先写完整 spec
            │                   │
            │                   ├──→ 再画任务图
            │                   │
            │                   └──→ 最后广播
            │
            ├──→ 2. 维护工件
            │       · task.json
            │       · feature-task-map.md
            │       · index.md (若使用)
            │
            └──→ 3. 广播任务
                    · 写入各 worktree 的 .current-task
                    · 发送 Trellis Bus 消息
                    · 系统通知 (可选)
```

---

## 6. 异常处理与恢复

### 6.1 异常类型与处理策略

| 异常类型 | 检测方式 | 处理策略 | 责任 Agent |
|----------|----------|----------|------------|
| **Token 溢出** | 实时监控 | 暂停→保存上下文→拆分为子步骤→重新分配 | PM+Architect |
| **步骤失败** | 状态消息 | 重试(3次)→降级→人工介入 | Dev Agent |
| **依赖循环** | 拓扑排序 | 检测→打破循环→标记强制顺序 | PM+Architect |
| **Agent 失联** | 心跳超时 | 超时释放→重新分配 | Trellis Bus |
| **Git 冲突** | 合并失败 | 冲突标记→Integrator 介入 | Integrator |
| **测试失败** | CI 报告 | 回滚→修复→重跑 | Dev Agent |

### 6.2 上下文溢出恢复

```
Dev Agent 检测到 Token 接近上限 (50k/60k)
    │
    ├──→ 1. 立即暂停执行
    │
    ├──→ 2. 保存当前状态
    │       · 已修改文件 (git stash)
    │       · 当前进度描述
    │       · 已消耗 Token 数
    │
    ├──→ 3. 发送 "step.pause" 消息到 Trellis Bus
    │       · 包含: 已完成部分, 待完成部分, 建议切分点
    │
    └──→ 4. PM+Architect 接收消息后
            │
            ├──→ 分析剩余工作量
            │
            ├──→ 拆分为子步骤
            │       · step-5a: 完成当前文件修改
            │       · step-5b: 实现剩余功能
            │
            └──→ 重新分配子步骤
                    · step-5a → Dev A (当前上下文)
                    · step-5b → Dev B (新上下文)
```

---

## 7. 实现路线图

### 7.1 阶段规划

```
Phase 1: 基础框架 (MVP)
─────────────────────────
[2周]
· Trellis Bus 目录结构
· 基础消息协议
· 简单的任务拆解 (按文件数量)
· Dev Agent 适配

Phase 2: 智能拆解
────────────────
[2周]
· Token 估算模型
· 依赖分析算法
· 上下文传递优化
· 状态机完整实现

Phase 3: 自治协调
────────────────
[2周]
· Agent 自动分配
· 负载均衡
· 异常自动恢复
· 心跳与监控

Phase 4: 高级特性
────────────────
[持续]
· 学习历史数据优化拆解
· 预测性资源分配
· 多项目并行支持
· 可视化仪表盘
```

### 7.2 与现有 Trellis 集成点

```
现有 Trellis 组件
    │
    ├──→ workflow.md
    │       └──→ 新增: 自治模式启动流程
    │
    ├──→ agent-prompts/
    │       ├──→ 01-dev-coding.zh.md
    │       │       └──→ 新增: 从 Trellis Bus 读取任务
    │       ├──→ 02-integrator.zh.md
    │       │       └──→ 新增: 监控所有步骤完成
    │       └──→ 03-dispatcher.zh.md
    │               └──→ 替换为: PM+Architect 自动调度
    │
    ├──→ scripts/
    │       ├──→ session_bootstrap.py
    │       │       └──→ 新增: 连接 Trellis Bus
    │       ├───→ task.py
    │       │       └──→ 新增: 调用 Task Decomposer
    │       └──→ [新增] autonomous_orchestrator.py
    │
    └──→ spec/
            └──→ [新增] autonomous-agent-system/
                    ├──→ ARCHITECTURE.md (本文档)
                    ├──→ API.md
                    └──→ TROUBLESHOOTING.md
```

---

## 8. 附录

### 8.1 术语表

| 术语 | 定义 |
|------|------|
| **Step** | 任务的最小可执行单元，Token 预算 < 60k |
| **Trellis Bus** | 位于 `~/.trellis-bus/` 的消息总线与状态存储 |
| **Worktree** | Git 工作树，每个 Dev Agent 一个独立 worktree |
| **Context Snapshot** | 步骤执行时的上下文摘要，供后续步骤使用 |
| **Token Budget** | 每个步骤的 Token 预算，默认 60k |

### 8.2 参考资料

- [Effective Harnesses for Long-Running Agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
- Trellis Workflow: `.trellis/workflow.md`
- Agent Prompts: `.trellis/workspace/agent-prompts/`

---

> **维护者**: PM+Architect Agent  
> **最后更新**: 2026-04-12
