---
name: ae:work
description: "实施阶段：执行计划或直接任务，产出代码、文档、测试用例、设计、报告或其他交付物"
argument-hint: "[计划路径|交接文件路径|任务描述]"
---

# 工作执行技能

按计划或明确任务高效实施，保持质量并完成可验证交付。

## 简介

本技能接收一份计划文档、worktree 交接文件或一段描述工作的提示词，并系统化地执行。核心目标是**交付可验证结果**；结果可以是代码、文档、测试用例、设计、报告或其他任务产物。

## 输入文档

<input_document> #$ARGUMENTS </input_document>

## 编排原则

`ae:work` 是唯一公开工作执行入口。`references/` 下的子流程文件只是内部执行说明，不是独立技能，不提供命令，也不能绕过本入口、worktree 决策、验证、审查或最终门禁。

执行时必须按顺序读取并执行以下子流程：

1. `references/input-routing-workflow.md`：识别输入类型、委派来源和任务大小。
2. `references/startup-and-worktree-workflow.md`：完成 Git 状态检查、worktree 决策和 A→B 交接处理。
3. `references/task-analysis-workflow.md`：分析任务、构建待办和选择执行策略。
4. `references/execution-workflow.md`：执行实现、串行/并行调度、失败处理和进度跟踪。
5. `references/verification-workflow.md`：核验真实变更范围、越权修改和统一验证结果。
6. `references/shipping-workflow.md`：完成代码审查、最终 gate 和交付模板。

并行执行子代理只能通过 `references/execution-workflow.md` 引用 `references/work-subagent-template.md` 构建提示。

## 硬性门禁

以下规则不得只依赖 reference 文件记忆，执行中必须持续满足：

- 修改任何项目文件之前，必须完成输入分流、Git 状态检查和 worktree 决策。
- 必须实际运行并记录 `git status --short`、`git branch --show-current`、`git log --oneline -1`。
- 单独使用 `ae:work` 且未显式传入 `worktree`、`current-worktree`、`auto` 时，必须按任务大小向用户询问执行位置，不得自行默认 `auto`。
- 如果调用方是 `ae:lfg` 或 `ae:task-loop`，固定按 `current-worktree` 执行，记录 `worktree_decision: rejected`，不得询问 worktree 模式、不得创建 worktree、不得把未传值补齐为 `auto`。
- `/ae-lfg ae:work`、`ae:lfg ae:work`、`ae:task-loop ae:work`、`/ae-task-loop ae:work` 都必须归一化为上游编排器委派，按当前工作区执行。
- 传入规范 worktree 交接文件路径时，必须把交接文件作为唯一必需输入，在当前可观察 worktree 中续执行；不得按裸提示词处理，不得再次创建 worktree。
- A 会话创建 B worktree 后，不得继续实现；只能按需迁移当前任务已确定、真实存在的需求/计划/设计产物、`ae/graphs/` 和 `.opencode/ae.jsonc` 可选上下文，并调用 `ae-worktree-handoff` 工具生成交接文件；存在性判断和复制必须使用文件系统视角，不能依赖 `git status`、`git ls-files` 或其他会受 `.gitignore` 影响的 Git 视角；未迁移的可选上下文不得出现在交接文件中，禁止自行拼接交接 Markdown。
- `ae-worktree-handoff` 工具会按固定模板生成结构化交接文件并返回 A 会话最终回复使用的简短交接提示；B worktree 通过 `ae:work <交接文件>` 续执行，`/ae-work-continue` 只是查找交接文件后调用 `ae:work` 的便捷包装。A→B 启动证明的结构由工具保证，AI 只需填值。
- A 会话转移完成后必须记录 `worktree_decision: transferred`，不得调用最终交付门禁，不得进入普通交付模板。
- 执行后必须由主代理独立运行 Git diff/status 核验真实修改文件，不得只依赖子代理自报。
- 使用知识图谱定位、拆解或评估影响范围时，必须读取 `freshness`；`freshness.status` 不是 `fresh` 时，图谱只能作为候选定位线索，不得作为无影响、无依赖、完整覆盖或无需修改的交付结论，必须刷新图谱或用真实文件、Git 状态和验证命令补证。
- 正式交付前必须运行相关验证、完成代码审查或明确无法审查原因，并调用 `ae-gate workflow:work checkpoint:final`。
- `ae-gate` 阻断时必须先补齐阻断项，不得宣称交付完成。

## 执行工作流

### 阶段 0：输入分流

读取 `references/input-routing-workflow.md`，输出 `work_intent`。若输入为计划路径、worktree 交接文件、裸提示词或上游编排器委派，都必须先完成该阶段。

### 阶段 1：快速启动

读取 `references/startup-and-worktree-workflow.md`，输出 `work_context`。该阶段是修改文件前的硬性阻断门禁。

随后读取 `references/task-analysis-workflow.md`，输出 `todo_units`、`conflict_matrix`、`parallel_groups` 和执行策略。

### 阶段 2：执行

读取 `references/execution-workflow.md`。执行前必须确认 `work_context.worktree_decision` 已确定，且用户或上游编排器已确认当前工作区策略。

### 阶段 3：验证

读取 `references/verification-workflow.md`，输出 `verification_result` 和实际 `validation_commands`。发现越权或污染修改时停止并请求用户决策，不得自动覆盖或回滚。

### 阶段 4：质量检查与交付

当所有阶段 2 任务完成且阶段 3 验证结果可用时，读取 `references/shipping-workflow.md` 获取完整交付工作流。

在最终交付前必须调用 `ae-gate workflow:work checkpoint:final`，传入：

- `plan_path`（如果本次从计划文档执行）
- `notes`（如果本次没有计划路径，必须说明任务为何无需计划，并记录定位证据和升级判断）
- `validation_commands`（本次实际运行的测试、构建、类型检查、lint 等命令）
- `validation_results`（每条 `validation_commands` 对应的真实执行结果，包含 `command`、`exit_code`、`output`、`executed_at`；用于通过门禁的 `exit_code` 必须为 0）
- `review_status`（代码审查状态；未运行时说明原因）
- `git_operations`（本次会话执行过的 Git 写操作；没有则传空数组）
- `worktree_decision`（创建、拒绝或不适用；`transferred`/`cancelled` 只能作为终止状态记录，不得作为最终功能交付 gate 的通过状态）
- 如执行 Git 写操作，传入 `git_operation_args` 和 `git_authorization_evidence`；不能只依赖 `user_authorized_git_write`
- 如 `review_status` 为 `passed` 或 `failed`，传入绑定当前 worktree、branch、HEAD 和状态摘要的 `review_evidence`

最终回复必须包含以下分区：已完成、已验证、未验证/无法验证、Git 操作状态、门禁结果、剩余风险。

例外：如果本轮创建了新 worktree 并已转移到 B worktree，A 会话不是功能交付会话，必须遵循 A→B 转移停点：不调用最终交付门禁，不输出普通交付分区，只输出继续提示词。

## 核心原则

- **快速启动，快速执行** — 澄清一次，然后执行
- **计划是向导** — 遵循已有模式和引用
- **持续测试** — 每次变更后测试，非最后
- **质量内建** — 遵循模式、编写测试、推送前 lint
- **交付完整功能** — 标记所有任务完成，不留 80% 功能
- **证据交付** — 最终回复必须引用 `ae-gate` 的门禁结果或证明路径
