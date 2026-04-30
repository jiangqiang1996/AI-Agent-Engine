---
type: brainstorm
status: drafted
date: 2026-04-30
topic: ae-work-contextual-worktree-recommendation
---

# ae:work 按任务情况推荐并选择 Worktree

## 问题框架

当前 `ae:work` 在正式实现型任务前会询问是否创建独立 worktree，但询问话术容易形成固定偏好：不论任务规模和风险如何，都倾向推荐创建 worktree。用户希望推荐语更贴合当前任务上下文：复杂、跨文件、风险较高的任务优先推荐 worktree；轻量、单点、逻辑简单的任务优先推荐当前分支修改，避免为小改动引入额外交接和启动成本。

进一步需求是把推荐策略变成可控制的选择模式：`ae:work` 支持三种模式：使用 worktree、使用当前工作区、自动选择。`ae:lfg` 也支持同样三种参数，并把模式透传给 `ae:work`；当 `ae:lfg` 不传任何 worktree 模式参数时，默认等价于向 `ae:work` 传入自动选择。`ae:task-loop` 如果使用 `ae:work` 执行任务，也应默认向 `ae:work` 使用自动选择模式。

## 需求

**推荐策略**
- R1. 普通 `ae:work` 在需要展示 worktree 选择或安全确认前，应先根据当前任务或已读取计划评估任务复杂度、预计改动范围和风险，再给出推荐依据。→ 验收: 相关提示文本中明确说明推荐依据，而不是无条件推荐创建 worktree。
- R2. 当任务或计划特别复杂、涉及多步骤协作、跨模块变更、风险领域、或预计改动文件偏多时，应优先推荐创建独立 worktree。→ 验收: 复杂任务的选项排序或推荐标记倾向 `创建 worktree`，并说明原因是隔离变更、降低当前工作区污染和便于恢复。
- R3. 当任务改动量特别少、逻辑简单、影响范围清晰，且预计只涉及少量文件时，应优先推荐在当前工作区继续修改。→ 验收: 轻量任务的选项排序或推荐标记倾向 `不创建新 worktree 并在当前工作区执行`，并说明原因是减少不必要的 worktree 交接成本。
- R4. `ae:work` 应支持三种 worktree 选择模式：`worktree`、`current-worktree`、`auto`。→ 验收: 调用方可表达使用 worktree、使用当前工作区、按任务情况自动选择三类意图；不再要求单独的“询问用户”模式。
- R5. `ae:work` 在 `auto` 模式下，应复用 R1-R3 的推荐结果作为默认决策，而不是固定选择 worktree。→ 验收: 复杂任务默认选择 worktree 路径；轻量任务默认选择当前工作区路径；最终交付仍记录实际 `worktree_decision` 和推荐依据；仅在 Git 写操作授权、默认分支风险或推荐依据不足时进入必要确认。
- R6. `ae:work` 在 `worktree` 模式下，不展示是否创建 worktree 的选择，但必须保留 Git 写操作授权和 A→B worktree 交接边界。→ 验收: 执行 `git worktree add`、创建分支或切换分支前仍需用户显式授权和安全校验；创建 B worktree 后，A 会话只做产物迁移、交接文件和继续提示，返回 `worktree_decision: transferred`，实现和最终 gate 在 B 会话完成。
- R7. `ae:work` 在 `current-worktree` 模式下，不展示是否创建 worktree 的选择，但必须保留当前工作区和当前分支安全边界。→ 验收: 继续在当前 `ctx.worktree` 执行；若当前是默认分支，仍需功能分支提示或风险确认；最终交付记录未创建 worktree 的实际原因。若现有 gate 只能使用 `worktree_decision: rejected`，规划阶段必须明确该取值在本轮语义中表示“未创建 worktree 并留在当前工作区”，而非仅表示用户拒绝。
- R8. 三种模式都不得绕过现有不可用降级。→ 验收: 当前不是 Git 仓库、Git 不可用或 `git worktree` 不可用时，不执行 worktree 创建；记录 `worktree_decision: not_applicable` 或按模式给出无法满足的停止说明，具体异常矩阵在计划阶段定义。

**调用方透传与默认行为**
- R9. `ae:lfg` 应支持与 `ae:work` 相同的三种 worktree 选择参数，并透传给 `ae:work`。→ 验收: `ae:lfg` 可显式传入 `worktree`、`current-worktree` 或 `auto`；传入后 `ae:work` 按相同语义执行。
- R10. `ae:lfg` 未收到显式 worktree 选择参数时，默认等价于向 `ae:work` 传入 `auto`。→ 验收: `ae:lfg` 不传任何 worktree 参数时不再一律创建 worktree，而是由 `ae:work` 根据任务情况自动选择 worktree 或当前工作区。
- R10a. `ae:lfg` 默认 `auto` 不得弱化当前分支安全预期。→ 验收: 当 `auto` 推荐当前工作区且存在默认分支、脏工作区或未确认分支风险时，必须按现有安全流程确认、停止或提示创建/切换功能分支。
- R11. `ae:task-loop` 如果使用 `ae:work` 执行任务，应默认向 `ae:work` 使用 `auto` 模式。→ 验收: 用户以 `ae:task-loop` 循环执行且执行技能为 `ae:work` 时，未显式指定 worktree 模式则按 `auto` 执行，避免循环体内触发不可回答的 worktree 选择；若 `auto` 需要 Git 写授权但 Phase 0 未预授权，应停止、瓶颈退出或降级到无需 Git 写操作的当前工作区路径，不得在禁言循环体内提问。
- R12. 规划阶段必须产出可解释的推荐判定规则。→ 验收: 优先复用 `ae:work` 已有任务复杂度和风险分流信号，覆盖任务规模、影响范围、风险领域等最小维度；允许补充少量阈值规则，但不引入加权总分、等级评分或独立复杂度模型。
- R13. 后续计划必须覆盖旧规则迁移范围。→ 验收: 至少检查并同步 `src/assets/skills/ae-work/SKILL.md`、`src/assets/skills/ae-work/references/shipping-workflow.md`、`src/assets/skills/ae-lfg/SKILL.md`、`src/assets/skills/ae-lfg/references/task-routing.md`、`src/assets/skills/ae-task-loop/SKILL.md` 中与默认创建 worktree 或 worktree 决策相关的表述。

## 成功标准

- `ae:work` 的 worktree 决策提示包含上下文依据，不再盲目推荐创建 worktree。
- 轻量任务默认不进入高成本 worktree 流程，复杂或高风险任务仍优先获得 worktree 隔离建议。
- `ae:lfg` 和 `ae:task-loop` 的默认行为一致：未显式指定模式时按 `auto` 调用 `ae:work`，且不会产生禁言阶段无法回答的交互。
- 任何模式都不弱化 Git 写操作授权、默认分支风险确认和 worktree 不可用降级。

## 范围边界

- 不要求保留独立“询问用户”模式；本轮需求收敛为 `worktree`、`current-worktree`、`auto` 三种模式。
- 不改变创建 worktree 的授权、安全校验、固定目录和交接规则。
- 不要求 `ae:lfg` 默认展示 worktree 选择；默认仍应尽量静默，只是默认静默决策改为按推荐自动选择。
- 不要求实现精确文件数预测；允许基于已读计划、只读定位证据和任务描述做保守判断。
- 不要求本次定义最终命令行语法；本文用 `worktree`、`current-worktree`、`auto` 表达三种模式语义，最终参数名和别名留给规划阶段决定。
- 本文中的静默仅指不展示 worktree 选择；任何 Git 写操作、默认分支风险确认或当前工作区安全确认仍必须按现有流程执行。
- 不要求恢复第四种公开模式，但允许在 `auto` 无法安全静默决策时进入交互式降级。

## 关键决策

- 推荐策略应放在 `ae:work` 的准备环境阶段。理由：推荐发生在询问是否创建 worktree 的同一流程中，用户能在做选择前看到上下文依据。
- 推荐应基于已有的任务复杂度信号，而不是新增独立评分体系。理由：`ae:work` 已有轻量修复、扩展任务、多步骤实现等分流信号，复用这些信号更简单且不增加维护成本。
- worktree 选择模式应由 `ae:work` 统一解释和执行，`ae:lfg` 与 `ae:task-loop` 只负责透传或默认补齐模式。理由：避免多个技能维护互相冲突的 worktree 决策规则。
- `ae:lfg` 默认模式应从“一律创建 worktree”调整为“按推荐自动选择”。理由：这保留少询问体验，同时避免轻量任务被默认引导到高成本 worktree 流程。
- `ae:task-loop` 使用 `ae:work` 时默认 `auto`，但必须在 Phase 0 授权边界内解决 Git 写授权。理由：循环体禁言令要求 Phase 0 后尽量无人值守，自动选择比进入交互式 worktree 选择更符合循环执行语义。

## 依赖 / 假设

- 假设普通 `ae:work` 会在正式实现型任务前完成只读定位或读取计划，因此具备做推荐所需的最低上下文。
- 假设“当前工作区修改”仍需要遵守现有分支安全提示；不创建 worktree 不等于允许直接在默认分支无确认修改。
- 假设 `ae:lfg` 和 `ae:task-loop` 可以把显式模式参数传递给 `ae:work`；后续计划需验证调用链是否支持透传。

## 待定问题

### 推迟到规划
- [影响 R1/R2/R3/R12][技术] 具体复用哪些现有复杂度信号触发 worktree 推荐，以及是否需要补充少量阈值规则。
- [影响 R3/R7/R10a][技术] 当前工作区推荐如何区分“已有功能分支”“默认分支”和“脏工作区”，以及默认分支下如何组织二次确认话术。
- [影响 R4/R9/R11][技术] 三种模式的最终参数名、命令别名和透传格式如何命名，是否采用 `current-worktree` 作为最终公开名。
- [影响 R5/R10/R11][技术] `auto` 模式下，如果推荐结果需要 Git 写授权但授权不足，如何呈现授权请求并在用户拒绝时选择取消、改用当前工作区或停止。
- [影响 R8][技术] 三种模式在 Git 不可用、worktree 不可用、默认分支风险确认失败等异常场景下的状态矩阵和 `worktree_decision` 取值。

## 下一步

-> `/ae-plan docs/ae/brainstorms/ae-work-contextual-worktree-recommendation-requirements.md`
