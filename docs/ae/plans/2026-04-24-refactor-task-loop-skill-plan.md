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
    ├── fn 节点：固定逻辑（状态转换、判定、计数）
    ├── delegate 节点 + Zod schema：子会话不确定逻辑
    ├── ask 节点：二选确认
    └── 控制流节点：when（条件分支）、loop（循环）、gate（前置守卫）
```

### 关键设计决策

#### 决策 1：用户回答收集使用 delegate 节点而非 ask 节点

`ask` 节点基于 `context.ask()`，仅返回 `"confirmed"` / `"__abort__"`，无法获取自由文本输入。因此：

- **确认清单（confirm-checklist）**：保持 `ask` 节点，因为是二选确认
- **收集用户回答（collect-answers）**：改用 `delegate` 节点，子会话中通过 `question` 工具与用户交互，返回结构化 `CollectedAnswersSchema`

#### 决策 2：prompt 模板使用 TypeScript 纯函数模块而非参考文件

`resolveContent` 仅支持 `"skill:<slug>"` 和 `"agent:<name>"`，无法加载 `references/` 目录下的文件。改用 TypeScript 纯函数模块：

- 类型安全：函数签名引用 `Ctx<Input, State>`，编译期检查
- 动态上下文：直接读取 `ctx.state` 构建 prompt
- 可测试：纯函数，无文件系统依赖
- 零框架改动

#### 决策 3：delegate 结果通过 fn 中转节点写入 state

`execDelegate` 将结果存入 `ctx.results`（Map），不直接 patch `ctx.state`。后续 `when`/`loop` 条件只能读取 `state`，因此每个 delegate 后需要 `fn` 中转节点：

```typescript
fn('apply-scan-result', (ctx) => {
  const result = ctx.results.get('scan-project') as ScanResult
  return { hasImplementation: result.hasImplementation, implementationSummary: result.summary }
})
```

#### 决策 4：when 条件使用正向检查

`resolveConditionValue` 不支持否定语法（`!state.xxx`）。对于"无实现时执行首次构建"的逻辑，使用 `elseChildren` 反转：

```
when(hasImplementation, [], [delegate('first-execution')])
```

或在前置 `fn` 中设置正向状态字段 `state.needsFirstExecution = !state.hasImplementation`。

#### 决策 5：循环体不使用 gate 节点防止崩溃

`gate` 节点在条件不满足时抛出 `GateError`，会穿透 `execLoop` 的循环体导致工作流崩溃（`exit-handling` 不可达）。因此在循环体内不使用 `gate`，改用 `when` 条件合并：将 `gate('not-exited')` + `when(needsExecute)` 合并为单个 `when` 检查 `exitReason === null && needsExecute`。当 `fn('judge')` 设置 `exitReason` 后，execute 被跳过，循环在下一轮 `until` 检查时优雅退出。

#### 决策 6：瓶颈阈值设为 3 轮

现有 SKILL.md 使用"连续 2 轮无进展"作为瓶颈退出阈值。brainstorm 文档将阈值调整为 3 轮，本计划沿用。理由：3 轮提供了更多恢复机会（如 LLM 在第三轮找到正确方向），同时仍能在无限循环前退出。每轮成本（时间 + token）在 task-loop 场景下可接受。

#### 决策 7：first-execution 和 execute 无需结构化输出

`first-execution` 和 `execute` 两个 delegate 执行的是代码变更（副作用），不返回结构化数据。因此：
- 不需要 Zod schema（它们不需要结构化输出解析）
- 不需要 fn 中转节点（它们的结果不驱动后续 when/loop 条件）
- 下一轮 `verify` delegate 会独立扫描代码库评估变更效果

这与决策 3 不矛盾：决策 3 的 fn 中转仅适用于**有结构化输出且结果需驱动后续条件**的 delegate。

### Zod Schema 设计

```
ScanResultSchema            → { hasImplementation, summary }
QuestionsAnalysisSchema     → { questions: [{id, question, type, defaultValue?}] }
CollectedAnswersSchema      → { answers: [{id, answer}] }
ConditionsSchema            → { conditions: [{id, description}] }
VerificationResultSchema    → { results: [{conditionId, passed, evidence}] }
```

### 状态模型

```typescript
interface TaskLoopState {
  goal: string
  executionSkill: string | null
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
  exitReason: 'done' | 'bottleneck' | 'limit' | 'unrecoverable' | null
}
```

**executionSkill：** 从用户输入的第一个 token 识别执行技能名（如 `ae:work`）。若匹配已知技能，`execute` 和 `first-execution` 的 prompt 中注入该技能的 SKILL.md 内容和预填答案。若不匹配，execute 使用通用执行 prompt。

### 工作流节点编排

```
Phase 0（允许交互）
├── fn('init-state')                    — 初始化状态，解析目标
├── delegate('scan-project')            — 子会话扫描项目 → ScanResultSchema
├── fn('apply-scan-result')             — 从 ctx.results.get('scan-project') 读取，写入 state
├── delegate('analyze-questions')       — 子会话预分析提问 → QuestionsAnalysisSchema
├── fn('prepare-questions')             — 从 ctx.results.get('analyze-questions') 读取，分离需用户回答项和可默认项
├── delegate('collect-answers')         — 子会话通过 question 工具收集用户回答 → CollectedAnswersSchema
├── fn('merge-answers')                 — 从 ctx.results.get('collect-answers') 读取，合并用户回答和默认值到 state
├── delegate('derive-conditions')       — 子会话推导成功条件 → ConditionsSchema
├── fn('prepare-checklist')             — 从 ctx.results.get('derive-conditions') 读取，组装确认清单文本
├── ask('confirm-checklist')            — 用户二选确认（此后禁言）
├── when(hasImplementation, [], [
│     delegate('first-execution')       — 子会话首次执行，传入原始目标
│   ])
└── fn('enter-loop')                    — 标记进入循环（不修改 exitReason）

Loop: verify-fix-loop（while 语义：先检查 until 再执行 body, max=30）
├── delegate('verify')                  — 子会话验证 → VerificationResultSchema
├── fn('judge')                         — 从 ctx.results.get('verify') 读取，更新通过计数、检测瓶颈、决定 executionMode 和 exitReason
└── when(exitReason===null && needsExecute, [
      delegate('execute')               — 子会话执行/修复（无结构化输出）
    ])

Exit（允许交互）
└── fn('exit-handling')                 — 根据退出原因输出结果
```

**loop 语义说明：** `until: (ctx) => ctx.state.exitReason !== null`，检查在 body 之前执行（while 语义）。进入循环时 `exitReason` 为 `null`，第一轮必然执行。`fn('enter-loop')` 不得修改 `exitReason`。

## 文件结构

```
src/workflows/
├── index.ts                      # 内置工作流注册表
├── task-loop.ts                  # 工作流定义（defineWorkflow）
├── task-loop.types.ts            # Input/State 接口 + Zod schema
├── utils.ts                      # transferResult 等工具函数
└── prompts/
    └── task-loop-prompts.ts      # 纯函数：为每个 delegate 构建 prompt
```

## 实现单元

### U0: 前置验证（session.prompt 多轮工具使用）

**目标：** 在 U1 开始前，验证 opencode SDK 的 `session.prompt()` 是否支持子会话内的多轮工具使用循环。

**方法：**
- 创建最小测试用例：构建一个 delegate 节点，prompt 指示 LLM 使用 `question` 工具向用户提问并获取回答
- 若验证通过：继续 U1，collect-answers 使用 delegate 节点
- 若验证失败：调整决策 1，将 collect-answers 的交互逻辑移回 SKILL.md 薄壳层（拆分为两次 orchestrator 调用：phase0-prepare → 主会话 question 交互 → phase0-execute）

**依赖：** 无（阻塞 U1）

### U1: 定义工作流

**目标：** 创建 `src/workflows/task-loop.ts` 及类型和 prompt 模块，用编排器 builder API 定义完整流程。

**文件：**
- 新增 `src/workflows/task-loop.ts`
- 新增 `src/workflows/task-loop.types.ts`
- 新增 `src/workflows/prompts/task-loop-prompts.ts`
- 新增 `src/workflows/utils.ts`（transferResult 工具函数）
- 新增 `src/workflows/index.ts`（导出注册表）
- 修改 `src/services/orchestrator/types.ts`（DelegateNode 添加 retries 字段）
- 修改 `src/services/orchestrator/builder.ts`（delegate 构建器支持 retries）
- 修改 `src/services/orchestrator/executor.ts`（execDelegate 实现重试逻辑）

**方法：**
- 使用 `defineWorkflow` 定义输入 schema（`z.object({ goal: z.string() })`）和状态初始化函数
- 使用 `fn` 节点处理所有固定逻辑（状态转换、判定、计数）
  - 使用 `transferResult(stepName, schema, mapper)` 工具函数封装 fn 中转节点，集中处理从 `ctx.results` 读取 + Zod 验证 + state patch，减少样板代码并保障类型安全
- 使用 `delegate` 节点 + 专用 Zod schema 处理子会话任务
  - `delegate` 节点的 `message` 函数从 `task-loop-prompts.ts` 中的纯函数获取 prompt
  - `delegate` 节点支持 `retries` 字段（本次新增的框架增强），循环体内关键 delegate（verify）配置 retries=2
- 使用 `ask` 节点处理二选确认（confirm-checklist）
- 使用 `when` / `loop` 处理控制流
  - `when` 条件仅使用正向检查，需要否定逻辑时通过 `elseChildren` 或前置 `fn` 设置正向字段
  - **循环体内不使用 `gate` 节点**（会抛 GateError 导致崩溃），改用 `when` 合并条件
- 循环节点：`loop({ name: 'verify-fix-loop', max: 30, until: (ctx) => ctx.state.exitReason !== null, body: [...] })`
  - while 语义：先检查 `until` 再执行 body
- 判定逻辑在 `fn('judge')` 中：从 verify 结果计算通过计数，与 `previousPassedCount` 比较；根据差距决定 `executionMode`（REBUILD 或 FIX）；连续 3 轮无进展设置 `exitReason='bottleneck'`；全部通过设置 `exitReason='done'`；verify 结果中包含 UNRECOVERABLE 标记时设置 `exitReason='unrecoverable'`
- `fn('init-state')` 中解析用户输入：提取第一个 token 匹配已知技能名列表，匹配时设置 `state.executionSkill`，不匹配时为 null
- execute 和 first-execution 的 prompt 中检查 `state.executionSkill`：非 null 时通过 `ctx.resolveContent('skill:<name>')` 加载技能 SKILL.md 内容并注入 prompt
- prompt 模板中包含明确的 JSON 输出格式要求和示例，降低 delegate 输出解析失败率
- 在 prompt 中对循环体 delegate（verify、execute）包含禁言令

**需遵循的模式：**
- `src/services/orchestrator/builder.ts` 中的 builder API 签名
- `src/services/orchestrator/types.ts` 中的 `Ctx` 接口（`results: Map`、`delegate()`、`ask()`）
- `src/tools/ae-orchestrator.tool.ts` 中 `createDelegate` 的调用模式

**依赖：** U0（session.prompt 验证通过）

### U2: 注册内置工作流到编排器工具

**目标：** 扩展 `ae-orchestrator.tool.ts`，当 `workflow_name` 匹配已知内置工作流时使用 TypeScript 定义。

**文件：**
- 修改 `src/tools/ae-orchestrator.tool.ts`

**方法：**
- 从 `src/workflows/index.ts` 导入 `getBuiltInWorkflow`
- 在 `execute` 函数中，先调用 `getBuiltInWorkflow(args.workflow_name)`
- 匹配时：使用内置 `WorkflowDefinition` + `execute()` 运行，忽略 `args.steps`
- 不匹配时：沿用现有 `buildNodesFromJson` 逻辑
- 将 `args.steps` 从必填改为可选（内置工作流不需要 steps）
- 依赖方向：`tools/` → `workflows/` → `services/orchestrator/`，无循环依赖

**需遵循的模式：**
- 现有 `buildNodesFromJson` 不变，仅增加前置分支

**依赖：** U1

### U3: 重写 SKILL.md

**目标：** 将 SKILL.md 精简为薄壳，清理旧参考文件。

**文件：**
- 修改 `src/assets/skills/ae-task-loop/SKILL.md`
- 删除 `src/assets/skills/ae-task-loop/references/phase-zero.md`
- 删除 `src/assets/skills/ae-task-loop/references/loop-body.md`
- 删除 `src/assets/skills/ae-task-loop/references/exit-handling.md`

**方法：**
- 保留 frontmatter（name, description, argument-hint）
- 输入解析：提取 `$ARGUMENTS` 作为 goal
- 调用 `ae-orchestrator` 工具，传入 `workflow_name: "ae-task-loop"`，`input: { goal: "..." }`
- 退出处理：展示工具返回的结果
- 删除旧的 references 文件（已迁移到 TypeScript prompt 模块）

**依赖：** U1, U2

## 验证

### U1 测试场景

- 正常路径：goal → 完整流程 → exitReason='done'
- 首次执行路径：hasImplementation=false → 首次执行 → 循环
- 跳过首次执行：hasImplementation=true → 直接循环
- 瓶颈退出：连续 3 轮无进展 → exitReason='bottleneck'
- 上限退出：达到 30 轮 → exitReason='limit'
- 不可恢复退出：verify 返回 UNRECOVERABLE → exitReason='unrecoverable'
- 空目标：goal 为空时拒绝执行
- executionSkill 解析：输入含技能名 → state.executionSkill 非空
- executionSkill 注入：execute prompt 包含技能 SKILL.md 内容
- transferResult 工具函数正确验证和转换 delegate 输出
- delegate retries：verify 输出解析失败 → 重试最多 2 次
- fn 中转节点正确读取 ctx.results 并 patch state
- when 条件在 hasImplementation=true 时跳过首次执行
- when 条件在 hasImplementation=false 时执行首次执行
- loop until 语义：exitReason 非 null 时停止循环
- enter-loop 不修改 exitReason

### U2 测试场景

- 内置工作流名匹配：workflow_name='ae-task-loop' → 使用内置定义
- 内置工作流名不匹配：workflow_name='custom' → 沿用 JSON 构建
- 缺少内置工作流注册：不影响现有功能
- steps 为空 + 内置工作流名匹配：正常执行
- steps 为空 + 未知工作流名：返回提示信息

### U3 测试场景

- SKILL.md 包含正确的 ae-orchestrator 工具调用指令
- 旧 references 文件已删除

## 风险

- **子会话 question 工具可用性**：`delegate` 节点创建子会话后，子会话 LLM 能否使用 `question` 工具取决于 opencode SDK 的 `session.prompt()` 是否支持多轮工具使用循环。**已通过 U0 前置验证 mitigated**。若 U0 验证失败，回退到 SKILL.md 薄壳层交互方案
- **delegate 子会话禁言**：子会话创建后无法阻止其使用 question 工具，需在 prompt 中明确禁言令（循环体 delegate）
- **delegate 输出解析失败**：**已通过 DelegateNode.retries mitigated**。关键 delegate 配置 retries=2，配合 prompt 中的 JSON 格式要求和示例

## 后续增强项（非本次范围）

- `resolveContent` 扩展：支持 `"skill:<slug>/references/<file>"` 模式
- `when` 否定语法：支持 `"!state.xxx"` 条件
- `WORKFLOW` 常量：在 `ae-asset-schema.ts` 中添加工作流名称常量
