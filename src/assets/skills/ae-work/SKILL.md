---
name: ae:work
description: "实施阶段：执行设计或直接任务，产出代码、文档、测试用例、设计、报告或其他交付物"
argument-hint: "[设计路径|交接文件路径|任务描述]"
---

# 工作执行技能（编排层）

按设计或明确任务高效实施，采用四阶段编排协议，将实施调度委托给开发域代理。

## 简介

本技能接收一份设计文档、worktree 交接文件或一段描述工作的提示词，按四阶段协议系统化执行。核心目标是**交付可验证结果**；结果可以是代码、文档、测试用例、设计、报告或其他任务产物。

## 输入文档

<input_document> #$ARGUMENTS </input_document>

## 编排原则

`ae:work` 是唯一公开工作执行入口。`references/` 下的子流程文件只是内部执行说明，不是独立技能，不提供命令，也不能绕过本入口、worktree 决策、验证或审查。

执行时必须按顺序读取并执行以下子流程：

1. `references/input-routing-workflow.md`：识别输入类型、委派来源和任务大小。
2. `references/startup-and-worktree-workflow.md`：完成 Git 状态检查、worktree 决策和 A→B 交接处理。
3. `references/task-analysis-workflow.md`：分析任务、构建待办和选择执行策略。
4. `references/execution-workflow.md`：执行前验证、design 契约一致性核验准备、执行前验证、串行/并行执行、失败处理、进度跟踪和主代理汇总职责。
5. `references/verification-workflow.md`：核验真实变更范围、design 契约对照核验、越权修改和统一验证结果。
6. `references/shipping-workflow.md`：完成代码审查、技能内 review 闭环、最终检查、下一步引导和交付模板。

调度阶段通过 `ae-domain-dispatch-prepare` 预计算专精列表，编排层直接并行调度专精代理，最后通过 `ae-domain-dispatch-aggregate` 聚合结果；仅当预计算返回空列表时退化为通过 `@development-domain` 中转。

## 硬性门禁

以下规则不得只依赖 reference 文件记忆，执行中必须持续满足：

- 修改任何项目文件之前，必须完成输入分流、Git 状态检查和 worktree 决策。
- 必须实际运行并记录 `git status --short`、`git branch --show-current`、`git log --oneline -1`。
- 单独使用 `ae:work` 且未显式传入 `worktree`、`current-worktree`、`auto` 时，必须按任务大小向用户询问执行位置，不得自行默认 `auto`。
- 如果调用方是 `ae:task-loop`，固定按 `current-worktree` 执行，记录 `worktree_decision: rejected`，不得询问 worktree 模式、不得创建 worktree、不得把未传值补齐为 `auto`。
- `ae:task-loop ae:work`、`/ae-task-loop ae:work` 都必须归一化为上游编排器委派，按当前工作区执行。
- 传入规范 worktree 交接文件路径时，必须把交接文件作为唯一必需输入，在当前可观察 worktree 中继续执行；不得按裸提示词处理，不得再次创建 worktree。
- A 会话创建 B worktree 后，不得继续实现；必须迁移当前任务已确定、真实存在的需求/设计产物、`ae/graphs/` 和 `.opencode/ae.jsonc`（A 端条件必选：上游产物或物理文件存在时必须迁移，不存在时才不传），design_path 和 task_brief 至少传入一个（有上游 ae:design 产物时优先迁移 design_path；无上游 ae:design 产物时可通过 task_brief 内联任务详情，或生成上下文派生设计并迁移），并调用 `ae-worktree-handoff` 工具生成交接文件；存在性判断和复制必须使用文件系统视角，即使路径被 `.gitignore` 忽略也必须按真实文件系统存在性迁移，不能依赖 `git status`、`git ls-files` 或其他会受 `.gitignore` 影响的 Git 视角；未迁移的产物不得出现在交接文件中，禁止自行拼接交接 Markdown。
- `ae-worktree-handoff` 工具会按固定模板生成结构化交接文件并返回 A 会话最终回复使用的简短交接提示；B worktree 通过 `ae:work <交接文件>` 继续执行，`/ae-work-continue` 只是查找交接文件后调用 `ae:work` 的便捷包装。A→B 启动证明的结构由工具保证，AI 只需填值。
- A 会话转移完成后必须记录 `worktree_decision: transferred`，不得进入普通交付模板。
- 执行后必须由主代理独立运行 Git diff/status 核验真实修改文件，不得只依赖域代理自报。
- 使用知识图谱定位、拆解或评估影响范围时，必须读取 `freshness`；`freshness.status` 不是 `fresh` 时，图谱只能作为候选定位线索，不得作为无影响、无依赖、完整覆盖或无需修改的交付结论，必须刷新图谱或用真实文件、Git 状态和验证命令补证。
- 正式交付前必须运行相关验证、完成代码审查或明确无法审查原因，并记录 Git 操作状态。
- 验证或审查存在阻断项时必须先补齐阻断项，不得宣称交付完成。

## 四阶段编排协议

### 阶段一：入口（Entry）

解析输入，确定工作意图和约束，输出 `TaskIntent`。

读取 `references/input-routing-workflow.md` 识别输入类型（设计路径、worktree 交接文件、裸提示词或上游编排器委派）。

读取 `references/startup-and-worktree-workflow.md` 完成 Git 状态检查和 worktree 决策。该阶段是修改文件前的硬性阻断门禁。

读取 `references/task-analysis-workflow.md` 分析任务结构、构建待办和选择执行策略。

#### TaskIntent 输出

```typescript
{
  stage: 'entry',
  intent: '工作意图标签（如：实现功能 X、修复 Bug Y、重构模块 Z）',
  domain: 'development',
  constraints: ['排除规则', 'worktree 约束', '验证要求'],
  rawInput: '原始输入',
  timestamp: 'ISO 时间戳'
}
```

### 阶段二：交互（Interact）

确认工作范围和执行策略，输出 `ConfirmedContext`。

- 交互模式：展示任务分解、执行策略和预览，让用户确认或修正
- 上游编排器委派（ae:task-loop）：跳过用户确认，直接进入调度
- worktree 交接文件：按交接文件中的 `resume_entrypoint` 继续，跳过重新确认

#### ConfirmedContext 输出

```typescript
{
  stage: 'interact',
  confirmedParams: { 执行策略、待办单元、并行分组 },
  exclusions: ['排除的文件和范围'],
  boundaries: ['安全边界和操作限制'],
  timestamp: 'ISO 时间戳'
}
```

### 阶段三：调度（Dispatch）

采用代码化调度：编排层直接通过 Task 工具并行调用开发专精代理，不经过 @development-domain 中转。

**不可降级硬约束**（来自 `@development-domain` 域代理定义，编排层必须遵守）：

> 如果编排层已通过 `ae-domain-dispatch-prepare` 获得非空专精列表（`specialistCount > 0`），**不得调用 `@development-domain`**，必须走代码化调度路径（步骤 3.1 → 3.2 → 3.3 → 3.4）。

无论专精数量多少（即使 10 个以上），都必须直接 Task 调度全部专精。以下理由**均不构成**降级为 `@development-domain` 的条件：
- 上下文成本 / token 经济顾虑
- 根因已定位、实施动力下降
- "伪并行"或平台疑似不支持多工具调用（需真实证据）

仅当满足**全部**以下条件时，才允许降级为通过 Task 调用 `@development-domain`：
1. 平台**硬性技术不支持**在同一条消息中发出多个工具调用（需可验证证据，不是 LLM 主观判断）
2. 且 `specialistCount > 20`（逐个串行发出 20 个以上 Task 不现实）

不满足上述条件时，即使 `specialistCount` 高达 20，也必须逐个串行发出全部 Task 调用，**不得跳过任何一个专精代理**，**不得降级为调用域代理**。

#### 步骤 3.1：准备调度

调用 `ae-domain-dispatch-prepare` 工具，传入 domain=development、intent、constraints 以及顶层布尔标记（has_ui、has_security、has_api 等）。工具返回：
- `tasks`：每个选中专精代理的 agent 名、prompt 模板和能力描述
- `strategy`：协调策略（development 域为 parallel-then-sequential + merge）
- `specialistCount`：选中数量
- `consistencyWarnings`：domain/kind 一致性校验警告数组（空数组表示无冲突）；编排层应展示给用户并据此复核调度参数
- `dispatchGuard`：调度门禁结构，包含降级违规检测使用的 domainAgentName 和 specialistCount；编排层不得绕过此门禁调用域代理

如果 `specialistCount` 为 0，退化为通过 Task 调用 `@development-domain`，构造 `DomainCallRequest` 传入。这是**唯一**允许调用 `@development-domain` 的场景。

#### 步骤 3.2：并行调度专精代理

在同一轮回复中，使用 Task 工具并行调用 `tasks` 数组中的每个专精代理。

**并行调度硬约束**：你必须在同一轮回复中一次性发出所有 Task 工具调用，禁止等上一个 Task 返回后再发出下一个。

**平台并行行为说明**：OpenCode Task 工具支持在同一条消息中发出多个调用时并行执行。如果你的回复仅包含一个 Task 调用，它将串行执行——这是导致"伪并行"的常见原因。务必在同一条回复中包含所有 Task 调用。

**串行降级（非域代理降级）**：如果平台硬性不支持多工具调用（需可验证证据），退化为逐个串行发出全部 Task 调用。**不得因此跳过任何一个专精代理**，**不得因此降级为调用 `@development-domain`**（除非同时满足上方"专精 > 20"条件）。

每个 Task 调用的 prompt 必须包含：
- 专精代理的 prompt 模板（来自 prepare 工具的 `tasks[].prompt`）
- 代理 markdown 文件内容（通过 `@{agent_name}` 引用对应代理）
- 任务描述（含待办单元、文件范围、实现要求）
- 已确认的参数和约束
- 设计文档内容（如有）
- 验证要求

#### 步骤 3.3：顺序集成（parallel-then-sequential 策略）

并行阶段完成后，如果 strategy 为 `parallel-then-sequential` 且存在需要集成的跨专精产出：
1. 检查并行结果中是否有跨代理文件冲突
2. 如有冲突，使用 Task 调用 `@debug-fix` 或相关专精代理解决集成问题
3. 如无冲突，跳过此步骤

#### 步骤 3.4：聚合结果

调用 `ae-domain-dispatch-aggregate` 工具，传入：
- `strategy`：`merge`（开发域固定）
- `results`：每个专精代理的执行结果（status、output、evidence）
- `dispatchedAgents`：实际调度的专精代理名称列表
- `skippedAgents`：选中但未调度的专精代理名称列表
- `skipReasons`：跳过原因
- `expectedSpecialistCount`：步骤 3.1 中 `ae-domain-dispatch-prepare` 返回的 `specialistCount`（用于降级违规检测）

工具返回 `DomainExecutionResult`，包含聚合后的输出、证据和 dispatchManifest。

**错误处理：** 如果某个专精代理返回 `failed` 或 `partial`，使用已完成的结果继续聚合，记录失败原因。

#### 调度一致性校验

接收 `DomainExecutionResult` 后，检查 `dispatchManifest` 和 `guardViolation`：

- 若返回结果包含 `guardViolation` 字段，**必须**在汇总阶段报告中以 `error` 级别标注降级违规，完整展示 `guardViolation.message`，并检查编排层是否错误降级
- 若 `dispatchManifest.dispatched` 数量少于 prepare 工具返回的 `specialistCount`，在汇总阶段报告不一致，列出被跳过的专精和跳过原因
- 若 `dispatchManifest.dispatched` 仅含域代理名（development-domain）但 `specialistCount > 0`，标记为"降级违规"，需审查编排层决策
- 若 `dispatchManifest` 缺失，跳过校验并记录"无法校验"
- 校验为报告性质，不阻断后续流程；但降级违规必须在最终交付中显式声明

#### DispatchResults 输出

```typescript
{
  stage: 'dispatch',
  domainResults: [DomainExecutionResult],
  timestamp: 'ISO 时间戳'
}
```

### 阶段四：汇总（Summary）

接收 `DomainExecutionResult`，完成验证和交付，输出 `Deliverable`。

读取 `references/verification-workflow.md` 核验真实变更范围、越权修改和统一验证结果。发现越权或污染修改时停止并请求用户决策，不得自动覆盖或回滚。

读取 `references/shipping-workflow.md` 完成代码审查、最终检查和交付。

在最终交付前必须汇总以下证据：

- 设计路径或交接文件路径（如有）
- 无设计路径时的无需设计原因、定位证据和升级判断
- 本次实际运行的测试、构建、类型检查、lint 等验证命令
- 每条验证命令对应的真实执行结果，包含 `command`、`exit_code`、`output`、`executed_at`
- 代码审查状态；未运行时说明原因
- 本次会话执行过的 Git 写操作；没有则明确说明无
- `worktree_decision`（创建、拒绝、不适用、转移或取消）
- 如执行 Git 写操作，列出命令参数和授权证据
- 如审查状态为通过或失败，列出审查证据来源

最终回复必须包含以下分区：已完成、已验证、未验证/无法验证、Git 操作状态、审查状态、剩余风险。

#### Deliverable 输出

```typescript
{
  stage: 'summary',
  description: '交付物描述',
  validationResults: ['验证结果'],
  artifacts: ['变更文件列表', '审查报告路径'],
  timestamp: 'ISO 时间戳'
}
```

## 核心原则

- **快速启动，快速执行** — 澄清一次，然后执行
- **设计是向导** — 遵循已有模式和引用
- **持续测试** — 每次变更后测试，非最后
- **质量内建** — 遵循模式、编写测试、推送前 lint
- **交付完整功能** — 标记所有任务完成，不留 80% 功能
- **证据交付** — 最终回复必须引用验证命令、审查状态和 Git 操作状态
