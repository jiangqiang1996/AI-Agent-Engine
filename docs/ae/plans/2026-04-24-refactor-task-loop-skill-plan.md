---
date: 2026-04-24
status: active
---

# ae:task-loop 技能重构计划

## 需求来源

`docs/ae/brainstorms/2026-04-24-refactor-task-loop-skill.md`

## 技术方案

### 核心思路

将 `ae:task-loop` 从"LLM 解读 SKILL.md 中的流程描述"重构为"TypeScript 编排器固化流程 + prompt 委派不确定逻辑"。

- **固定逻辑（TypeScript）**：流程结构、状态管理、轮次计数、瓶颈检测、退出判定、用户交互时机
- **不确定逻辑（prompt 委派）**：项目扫描、提问预分析、成功条件推导、验证、执行

### 架构

```
SKILL.md（薄壳：解析输入 → 调用 ae-orchestrator 工具）
    │
    ▼
ae-orchestrator 工具（识别内置工作流名 → 加载 TS 定义）
    │
    ▼
workflows/task-loop.ts（defineWorkflow 固化完整流程）
    │
    ├── fn 节点：固定逻辑
    ├── delegate 节点 + Zod schema：子会话不确定逻辑
    └── ask 节点：用户交互
```

### Zod Schema 设计

```
ScanResultSchema          → { hasImplementation, summary }
QuestionsAnalysisSchema   → { questions: [{id, question, type, defaultValue?}] }
ConditionsSchema          → { conditions: [{id, description}] }
VerificationResultSchema  → { results: [{conditionId, passed, evidence}] }
```

### 状态模型

```typescript
interface TaskLoopState {
  goal: string
  hasImplementation: boolean
  implementationSummary: string
  questionsAndAnswers: Array<{ id: string; question: string; answer: string }>
  successConditions: Array<{ id: string; description: string }>
  currentRound: number
  maxRounds: number
  executionMode: 'REBUILD' | 'FIX' | null
  problemList: string[]
  lastVerificationResults: Array<{ conditionId: string; passed: boolean; evidence: string }>
  previousPassedCount: number
  consecutiveNoProgress: number
  exitReason: 'done' | 'bottleneck' | 'limit' | null
}
```

### 工作流节点编排

```
Phase 0（允许交互）
├── fn('init-state')                    — 初始化状态，解析目标
├── delegate('scan-project')            — 子会话扫描项目 → ScanResultSchema
├── fn('apply-scan-result')             — 将扫描结果写入状态
├── delegate('analyze-questions')       — 子会话预分析提问 → QuestionsAnalysisSchema
├── fn('prepare-questions')             — 分离需用户回答项和可默认项
├── ask('collect-answers')              — 向用户收集不可默认项答案
├── fn('merge-answers')                 — 合并用户回答和默认值到状态
├── delegate('derive-conditions')       — 子会话推导成功条件 → ConditionsSchema
├── fn('prepare-checklist')             — 组装确认清单文本
├── ask('confirm-checklist')            — 用户确认/修改（此后禁言）
├── when(no-impl, [
│     delegate('first-execution')       — 子会话首次执行，传入原始目标
│   ])
└── fn('enter-loop')                    — 标记进入循环

Loop: verify-fix-loop（until=done, max=30）
├── delegate('verify')                  — 子会话验证 → VerificationResultSchema
├── fn('judge')                         — 判定：更新通过计数、检测瓶颈、决定模式
├── gate('not-exited')                  — 确保未触发退出条件
└── when(needs-execute, [
      delegate('execute')               — 子会话执行/修复
    ])

Exit（允许交互）
└── fn('exit-handling')                 — 根据退出原因输出结果
```

## 实现单元

### U1: 定义工作流

**目标：** 创建 `src/workflows/task-loop.ts`，用编排器 builder API 定义完整流程。

**文件：**
- 新增 `src/workflows/task-loop.ts`
- 新增 `src/workflows/index.ts`（导出注册表）

**方法：**
- 使用 `defineWorkflow` 定义输入 schema（`z.object({ goal: z.string() })`）和状态初始化函数
- 使用 `fn` 节点处理所有固定逻辑（状态转换、判定、计数）
- 使用 `delegate` 节点 + 专用 Zod schema 处理子会话任务
- 使用 `ask` 节点处理用户交互
- 使用 `when` / `loop` / `gate` 处理控制流
- 循环节点：`loop({ name: 'verify-fix-loop', max: 30, until: (ctx) => ctx.state.exitReason !== null, body: [...] })`
- 判定逻辑在 `fn('judge')` 中：比较 `currentPassedCount` 与 `previousPassedCount`，连续 3 轮无进展标记瓶颈退出
- `delegate` 节点的 `message` 函数从 `ctx.state` 动态构建 prompt

**需遵循的模式：**
- `src/services/orchestrator/builder.ts` 中的 builder API 签名
- `src/tools/ae-orchestrator.tool.ts` 中 `createCallLLM` / `createDelegate` 的调用模式

**依赖：** 无（编排器框架已存在）

### U2: 注册内置工作流到编排器工具

**目标：** 扩展 `ae-orchestrator.tool.ts`，当 `workflow_name` 匹配已知内置工作流时使用 TypeScript 定义。

**文件：**
- 修改 `src/tools/ae-orchestrator.tool.ts`

**方法：**
- 导入内置工作流注册表
- 在 `execute` 函数中，先检查 `args.workflow_name` 是否匹配内置工作流
- 匹配时直接使用内置的 `WorkflowDefinition`，忽略 `args.steps`
- 不匹配时沿用现有 JSON 动态构建逻辑

**需遵循的模式：**
- 现有 `buildNodesFromJson` 不变，仅增加前置分支

**依赖：** U1

### U3: 编写 prompt 参考文件

**目标：** 为每个 delegate 节点编写 prompt 模板。

**文件：**
- 新增 `src/assets/skills/ae-task-loop/references/scan-project.md`
- 新增 `src/assets/skills/ae-task-loop/references/analyze-questions.md`
- 新增 `src/assets/skills/ae-task-loop/references/derive-conditions.md`
- 新增 `src/assets/skills/ae-task-loop/references/verify.md`
- 新增 `src/assets/skills/ae-task-loop/references/execute.md`

**方法：**
- 每个 prompt 文件包含角色定义、任务描述、输出格式要求（对应 Zod schema）
- `scan-project.md`：扫描项目文件结构，判断目标相关实现是否存在
- `analyze-questions.md`：分析目标歧义、技能交互节点，输出结构化提问列表
- `derive-conditions.md`：结合目标和用户回答推导成功条件
- `verify.md`：逐条对照成功条件验证，输出结构化结果
- `execute.md`：根据模式（REBUILD/FIX）执行或修复，包含禁言令

**删除：**
- `src/assets/skills/ae-task-loop/references/phase-zero.md`
- `src/assets/skills/ae-task-loop/references/loop-body.md`
- `src/assets/skills/ae-task-loop/references/exit-handling.md`

**依赖：** U1（需要知道每个 prompt 的输入输出契约）

### U4: 重写 SKILL.md

**目标：** 将 SKILL.md 精简为薄壳。

**文件：**
- 修改 `src/assets/skills/ae-task-loop/SKILL.md`

**方法：**
- 保留 frontmatter（name, description, argument-hint）
- 输入解析：提取 `$ARGUMENTS` 作为 goal
- 调用 `ae-orchestrator` 工具，传入 `workflow_name: "ae-task-loop"`，`input: { goal: "..." }`
- 退出处理：展示工具返回的结果

**依赖：** U1, U2

## 验证

### U1 测试场景

- 正常路径：goal → 完整流程 → exitReason='done'
- 首次执行路径：hasImplementation=false → 首次执行 → 循环
- 跳过首次执行：hasImplementation=true → 直接循环
- 瓶颈退出：连续 3 轮无进展 → exitReason='bottleneck'
- 上限退出：达到 30 轮 → exitReason='limit'
- 空目标：goal 为空时拒绝执行

### U2 测试场景

- 内置工作流名匹配：workflow_name='ae-task-loop' → 使用内置定义
- 内置工作流名不匹配：workflow_name='custom' → 沿用 JSON 构建
- 缺少内置工作流注册：不影响现有功能

## 风险

- **ask 节点限制**：当前 `askFn` 实现只返回 'confirmed'，无法获取用户文本输入。确认清单和收集回答步骤可能需要调整交互方式（改为工具描述中引导 LLM 先用 question 工具收集，再传入 input）
- **delegate 子会话禁言**：子会话创建后无法阻止其使用 question 工具，需在 prompt 中明确禁言令
- **prompt 文件加载**：当前 `delegate` 节点不支持 `contentRef`，需要在 message 中内联 prompt 内容，或先通过 `ctx.resolveContent` 加载后在 `fn` 节点中拼装
