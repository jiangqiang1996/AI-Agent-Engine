---
name: ae:lfg
description: "默认入口：驱动从需求到执行的 AE 主流程；若已有产物则优先恢复，否则从头脑风暴开始"
argument-hint: "[需求描述|已有产物路径]"
defaultEntry: true
disable-model-invocation: true
---

# AE LFG

全自主工程管道。按顺序执行每个步骤，**不得跳过任何必需步骤，不得提前进入编码或实现。**

## 静默执行原则

`ae:lfg` 的默认体验是：除了一开始为澄清目标、确认关键约束、确认 worktree/Git 写操作授权范围进行少量询问之外，后续尽可能静默执行到结束。不得在每个阶段重复询问“是否继续”。只有以下情况才允许中途停下询问：需求或验收标准仍不明确、用户授权范围不足以覆盖即将执行的 Git 写操作、发现安全/数据/破坏性风险、计划或审查出现必须由用户决策的 P0/P1 分歧、验证环境需要用户提供外部信息。

## 输入

<feature_description> #$ARGUMENTS </feature_description>

**如果上面的描述为空，询问用户：** "你想构建什么？请描述功能、问题或改进。" 然后等待回复再继续。

## 任务分类

在进入主管道之前，先读取 `@./references/task-routing.md`，按 S1-S7 分类任务，并遵循以下规则：

- **S1 简单问答**：直接回答；必要时只做只读搜索/读取。不进入 `ae:lfg` 管道。
- **S2 模糊想法**：先澄清，或进入步骤 2 的 `ae:brainstorm`。需求仍模糊时不得直接编码。
- **S3 小修复**：如果范围仍然轻量，可转 `ae:work` 轻路径；只有在正式代码交付时才要求最终 `ae-gate`。一旦命中升级停点，立即改走 S4。
- **S4 多步骤实现**：这是 `ae:lfg` 的标准适用场景，必须走完整主管道。
- **S5 只读审查**：改用 `ae:review mode:report-only`，默认保持只读，不进入 `ae:lfg` 管道。
- **S6 提交请求**：改走 Git 安全流程或 `/ae-commit`，不自动开始实现。
- **S7 混合意图**：先拆分阶段；实现与验证完成后，才允许进入提交流程。

如果任务显然不属于软件任务，告知用户：`"ae:lfg 专注于软件工程管道。此任务不属于软件范畴，请直接描述你的需求，我将尽力协助。"` 然后停止。

## 恢复策略

优先使用 `ae-recovery` 工具检查是否已有可恢复产物：

- 若存在单一候选，恢复到对应阶段
- 若存在多个候选，要求显式选择
- 若没有产物，从步骤 2 开始

## 门禁证明

在关键阶段调用 `ae-gate` 工具，不能只用文字承诺替代门禁结果：

- 进入实现前：`ae-gate workflow:lfg checkpoint:before_work plan_path:<plan-path>` 必须通过
- 进入代码审查前：`ae-gate workflow:lfg checkpoint:before_review plan_path:<plan-path> validation_commands:[...]` 必须通过
- 最终交付前：`ae-gate workflow:lfg checkpoint:final plan_path:<plan-path> validation_commands:[...] review_status:passed review_evidence:{...} git_operations:[...] worktree_decision:<created|rejected|not_applicable>` 必须通过并写入证明；若执行过 Git 写操作，还必须传入 `git_operation_args` 和可验证 `git_authorization_evidence`

如果门禁返回 `status: block`，必须先补齐阻断项再继续，不得输出 `<promise>DONE</promise>`。

## 管道步骤

### 步骤 1（可选）：浏览器能力依赖说明

主管道开始时不无条件运行 `/ae-setup`。只有步骤 8 检测到项目需要浏览器测试，或后续流程实际准备使用 `agent-browser` 时，才先运行 `ae:setup` / `/ae-setup`。

### 步骤 2：需求探索

运行 `ae:brainstorm $ARGUMENTS`

在需求探索阶段一次性收集后续静默执行所需的关键决策：目标、范围边界、验收标准、可接受的验证方式，以及 Git/worktree 授权边界。仅从 `$ARGUMENTS` 或用户主动提出的约束中识别是否已显式禁用 worktree；若用户未显式禁用 worktree，后续不再询问是否创建 worktree。

**门控：** 验证 `ae:brainstorm` 产出了需求文档（`docs/ae/brainstorms/*-requirements.md`）。如果未产出且需求已经足够清晰，继续。如果需求模糊且未产出文档，重新运行 `ae:brainstorm $ARGUMENTS`。在继续步骤 3 之前，**必须**有足够的产物流入计划阶段。

只有在 `ae:brainstorm` 已将任务重新归类为 S3 轻量修复时，才允许跳出本主管道转入 `ae:work`；否则必须继续计划阶段。

### 步骤 3：需求审查

仅当步骤 2 产出了需求文档时，运行 `ae:review mode:headless domain:document <requirements-doc-path>`。

审查步骤 2 产出的需求文档。如果步骤 2 未产出需求文档且需求已经足够清晰，跳过本步骤并记录原因；不要无路径调用文档域审查。

**门控：** 如果审查报告 P0/P1 发现，确认是否需要修正后再继续。

### 步骤 4：创建计划

如果需求是纯重构或行为保持型技术债治理，运行 `ae:refactor <requirements-doc-path-or-original-arguments>`。否则运行 `ae:plan <requirements-doc-path-or-original-arguments>`。

当步骤 2 产出了需求文档时，必须把需求文档路径传递给计划技能；未产出需求文档但需求足够清晰时，传递原始用户需求。

**门控：** 验证计划技能在 `docs/ae/plans/` 中产出了计划文件。如果未产出，重新运行对应计划技能。**在计划文件存在之前不得继续步骤 5。** 记录计划文件路径——它将传递给步骤 7 的 `ae:review`。

### 步骤 5：计划审查

运行 `ae:review mode:headless domain:document <plan-path-from-step-4>`

**门控：** 验证计划审查通过。如果审查未通过，根据发现修正计划后重新审查。

### 步骤 6：执行实现

先运行 `ae-gate workflow:lfg checkpoint:before_work plan_path:<plan-path-from-step-4>`。门禁通过后再继续。

在调用 `ae:work` 前应用 `ae:lfg` 默认 worktree 策略：当前目录是 Git 仓库且 `git worktree` 可用时，不询问用户是否创建 worktree，一律准备创建独立 worktree 并同步创建对应分支；Git 写操作授权应尽量在前置澄清阶段一次性取得，执行前只校验实际命令仍落在已授权范围内，避免中途重复询问。只有用户在 `$ARGUMENTS` 中显式声明不使用 worktree（如 `--no-worktree` 或明确写明“不使用 worktree”）时，才允许跳过默认创建并记录 `worktree_decision: rejected`。当前项目不是 Git 仓库、Git 不可用或 `git worktree` 不支持时，不询问 worktree 选择，记录 `worktree_decision: not_applicable`。

运行 `ae:work`，并明确传递本次来自 `ae:lfg`：未显式禁用 worktree 时按 `ae:lfg` 默认 worktree 策略执行，不展示“是否创建 worktree”的选择。

如果 `ae:work` 创建了 B worktree 并返回 `worktree_decision: transferred`，当前 A 会话必须停止主管道：只输出 B worktree 路径、已迁移产物、交接 Markdown 路径和在 B 目录新开 opencode 的继续提示词。不得继续步骤 7、步骤 8 或最终功能交付 gate；后续代码审查、浏览器测试和最终交付必须在 B 会话中完成。

如果 `ae:work` 返回 `worktree_decision: cancelled`，当前主管道立即停止：只输出取消状态、已完成/未完成项和不运行后续步骤或最终功能交付 gate 的说明。

**门控：** 验证实现工作已执行——超出计划范围的文件被创建或修改。**如果没有代码变更，不得继续步骤 7。**

### 步骤 7：代码审查

先运行 `ae-gate workflow:lfg checkpoint:before_review plan_path:<plan-path-from-step-4>`，并传入已实际运行的 `validation_commands`。如果尚未运行验证，先运行验证再审查。

运行 `ae:review mode:autofix plan:<plan-path-from-step-4>`

传递步骤 4 的计划文件路径，以便 `ae:review` 可以验证需求完整性。

**门控：** 如果审查结论为"不可合并"，根据发现修正后重新审查。

### 步骤 8：浏览器测试

检查项目中是否有 UI 相关文件（`src/app/*`、`src/components/*`、`src/views/*`、`*.html` 等）：

- 如果存在 UI 文件，先运行 `ae:setup` / `/ae-setup`；环境就绪后再运行 `ae:test-browser`
- 如果 `ae:setup` 安装失败、用户拒绝安装或当前环境无法安装，记录“无法验证：浏览器测试未执行”，不得运行 `agent-browser` 命令
- 如果项目无 UI 文件，跳过此步骤

**门控：** 如果浏览器测试全部失败，输出警告但允许继续。

### 步骤 9：完成

运行 `ae-gate workflow:lfg checkpoint:final plan_path:<plan-path-from-step-4> validation_commands:[...] review_status:passed review_evidence:{...} git_operations:[...] worktree_decision:<created|rejected|not_applicable>`。`worktree_decision` 必须沿用步骤 6 的结果；若结果为 `transferred` 或 `cancelled`，不得进入最终功能交付 gate。`review_evidence` 必须绑定当前 worktree、branch、HEAD 和状态摘要；如执行过 Git 写操作，传入 `git_operation_args` 和可验证 `git_authorization_evidence`，不能只依赖 `user_authorized_git_write`。如有浏览器测试，传入 `browser_test_status`。门禁通过后，在最终回复中引用 `proofPath`。

最终回复必须遵循 `ae:work` 交付参考中的最终模板分区：已完成、已验证、未验证/无法验证、Git 操作状态、门禁结果、剩余风险。

输出 `<promise>DONE</promise>`

---

标准主链路：`ae:brainstorm` → `ae:review mode:headless domain:document`（有需求文档时）→ `ae:plan` / `ae:refactor` → `ae:review mode:headless domain:document` → `ae:work` → `ae:review` → 浏览器测试

从步骤 2 现在开始。记住：先计划，再工作。永远不要跳过计划。

参考：@./references/pipeline.md
参考：@./references/task-routing.md
