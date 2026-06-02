---
name: ae:lfg
description: "核心流程组合技能：串联 ae:prd → ae:plan → ae:work → ae:review 等阶段，一站式完成从需求到交付的全流程；各阶段技能也可独立使用"
argument-hint: "[任务描述|已有产物路径]"
disable-model-invocation: true
---

# AE LFG

核心流程组合技能。将 ae:prd、ae:plan、ae:work、ae:review 等阶段技能串联为一站式执行管道，按任务类型自动分流。各阶段技能均可独立通过命令使用，ae:lfg 是它们的一种组合使用方式。**不得跳过当前任务必需步骤，不得在目标、边界和验收标准不清时提前进入实施。** 软件开发是重点场景之一，但不是唯一适用范围。

## 静默执行原则

`ae:lfg` 的默认体验是：除了一开始为澄清目标、确认关键约束和 Git 写操作授权范围进行少量询问之外，后续尽可能静默执行到结束。不得在每个阶段重复询问“是否继续”。`ae:lfg` 调用 `ae:work` 时固定当前工作区执行，不询问 worktree 模式、不创建 worktree。只有以下情况才允许中途停下询问：需求或验收标准仍不明确、用户授权范围不足以覆盖即将执行的 Git 写操作、发现安全/数据/破坏性风险、计划或审查出现必须由用户决策的 P0/P1 分歧、验证环境需要用户提供外部信息。

## 输入

<feature_description> #$ARGUMENTS </feature_description>

**如果上面的描述为空，询问用户：** "你想完成什么任务？请描述目标、产物、约束或已有材料。" 然后等待回复再继续。

## 任务分类

在进入主管道之前，先读取 `@./references/task-routing.md`，按 S1-S7 分类任务，并遵循以下规则：

- **S1 简单问答**：直接回答；必要时只做只读搜索/读取。不进入 `ae:lfg` 管道。
- **S2 模糊想法**：先澄清，必要时用 `ae:brainstorm` 做通用讨论；进入正式需求定义时走步骤 2 的 `ae:prd`。需求仍模糊时不得直接编码。
- **S3 小修复**：如果范围仍然轻量，可转 `ae:work` 轻路径；正式代码交付时必须记录验证、审查和 Git 操作状态。一旦命中升级停点，立即改走 S4。
- **S4 多步骤任务**：这是 `ae:lfg` 的标准适用场景，必须走完整主管道。
- **S5 只读审查**：改用 `ae:review mode:report-only`，默认保持只读，不进入 `ae:lfg` 管道。
- **S6 提交请求**：改走 Git 安全流程或 `/ae-commit`，不自动开始实现。
- **S7 混合意图**：先拆分阶段；实现与验证完成后，才允许进入提交流程。

非软件任务不得被排除在主管道之外。若任务不涉及代码、测试或构建，将其作为文档、测试用例、设计、报告或通用产物交付处理，并在实施与交付阶段使用产物路径、追溯关系、审查结论、人工可检查标准或用户确认作为证据。

## 恢复策略

优先使用 `ae-recovery` 工具检查是否已有可恢复产物：

- 若存在单一候选，恢复到对应阶段
- 若存在多个候选，要求显式选择
- 若没有产物，从步骤 2 开始

## 交付证据

关键阶段必须收集可复核证据，不能只用文字承诺替代真实检查：

- 进入实现前：必须确认计划路径存在，或记录无需计划的定位证据和升级判断
- 进入结果审查前：必须已实际运行验证，并记录 `validation_commands` 及一一对应的 `validation_results`；非代码任务也必须使用真实可执行的产物存在性、格式、一致性或人工可复核检查命令作为验证证据，不得伪造测试命令
- 最终交付前：必须汇总计划路径、验证结果、审查状态、Git 操作状态、worktree 决策和剩余风险；若执行过 Git 写操作，还必须记录命令参数和可验证授权证据

如果验证、审查或授权证据存在阻断项，必须先补齐阻断项再继续，不得输出 `<promise>DONE</promise>`。

## 管道步骤

### 步骤 1（可选）：浏览器能力依赖说明

主管道开始时不无条件运行 `/ae-chrome-devtools`。只有步骤 8 检测到项目需要浏览器测试，或后续流程实际准备使用 chrome-devtools-mcp 工具时，才先运行 `ae:chrome-devtools` / `/ae-chrome-devtools` 动态注册流程。

### 步骤 2：需求探索

运行 `ae:prd $ARGUMENTS`

在需求探索阶段一次性收集后续静默执行所需的关键决策：目标、范围边界、验收标准、可接受的验证方式，以及 Git 写操作授权边界。`ae:lfg` 不收集、不询问、不透传 worktree 模式；调用 `ae:work` 时固定当前工作区执行。兼容输入 `--no-worktree` 或明确写明“不使用 worktree”时，也只作为当前工作区执行的同义约束记录。

**门控：** 验证 `ae:prd` 产出了需求文档（`ae/prds/*-prd.md`）。如果未产出且需求已经足够清晰，继续。如果需求模糊且未产出文档，重新运行 `ae:prd $ARGUMENTS`。在继续步骤 3 之前，**必须**有足够的上游产物可供计划阶段使用。

只有在 `ae:prd` 已将任务重新归类为 S3 轻量修复时，才允许跳出本主管道转入 `ae:work`；否则必须继续计划阶段。

### 步骤 3：需求审查

仅当步骤 2 产出了需求文档时，运行 `ae:review mode:headless domain:document <requirements-doc-path>`。

审查步骤 2 产出的需求文档。如果步骤 2 未产出需求文档且需求已经足够清晰，跳过本步骤并记录原因；不要无路径调用文档域审查。

**门控：** 如果审查报告 P0/P1 发现，确认是否需要修正后再继续。

### 步骤 4：创建计划

如果需求是纯重构或行为保持型技术债治理，运行 `ae:refactor <requirements-doc-path-or-original-arguments>`。否则运行 `ae:plan <requirements-doc-path-or-original-arguments>`。

当步骤 2 产出了需求文档时，必须把需求文档路径传递给计划技能；未产出需求文档但需求足够清晰时，传递原始用户需求。

**门控：** 验证计划技能在 `ae/plans/` 中产出了计划文件。如果未产出，重新运行对应计划技能。**在计划文件存在之前不得继续步骤 5。** 记录计划文件路径——它将传递给步骤 7 的 `ae:review`。

### 步骤 5：计划审查

运行 `ae:review mode:headless domain:document <plan-path-from-step-4>`

**门控：** 验证计划审查通过。如果审查未通过，根据发现修正计划后重新审查。

### 步骤 6：执行实施

确认 `<plan-path-from-step-4>` 存在并记录为实施基线后再继续。

在调用 `ae:work` 前应用 `ae:lfg` 固定当前工作区策略：不透传 `worktree` 或 `auto`，不询问 worktree 模式，不创建 worktree；若用户输入包含 `--no-worktree` 或“不使用 worktree”，按当前工作区执行记录。Git 写操作授权应尽量在前置澄清阶段一次性取得，执行前只校验实际命令仍落在已授权范围内，避免中途重复询问。

运行 `ae:work`，并明确写明“来自 `ae:lfg`，固定当前工作区执行；不得询问 worktree 模式，不得创建 worktree”。

如果 `ae:work` 在 `ae:lfg` 固定当前工作区策略下仍返回 `worktree_decision: transferred`，视为协议异常并立即停止主管道：报告 `ae:lfg` 不允许本次 `ae:work` 创建或转移 worktree，不得继续步骤 7、步骤 8 或最终功能交付。

如果 `ae:work` 返回 `worktree_decision: cancelled`，当前主管道立即停止：只输出取消状态、已完成/未完成项和不运行后续步骤或最终功能交付的说明。

**门控：** 验证实施工作已执行——存在与计划执行范围一致的文件创建、修改、结构化交付摘要或用户确认来源，并确认没有未授权的范围外变更。代码或可执行逻辑变更必须按代码交付处理；非代码任务不得因没有代码 diff 被阻断，但必须提供可引用产物、追溯、审查或确认证据。

### 步骤 7：结果审查

确认已实际运行验证，并记录 `validation_commands` 及一一对应的 `validation_results`。如果尚未运行验证，先运行验证再审查；`validation_results` 的每条 `command` 必须匹配 `validation_commands`，且正式交付所依赖的验证结果 `exit_code` 必须为 0。非代码产物的验证命令可以是读取产物路径、检查 Markdown/YAML 格式、比对计划验收清单、运行文档专用测试或其他真实可复核检查；不得填入未执行的测试命令。

运行 `ae:review mode:autofix plan:<plan-path-from-step-4>`；若是非代码产物，明确传入产物路径或审查目标，避免按代码差异误判。

传递步骤 4 的计划文件路径，以便 `ae:review` 可以验证需求完整性。

**门控：** 如果审查结论为"不可合并"，根据发现修正后重新审查。

### 步骤 8：浏览器测试

仅当任务产物包含需要浏览器验证的 UI、页面或 HTML 交付时检查浏览器测试需求：

- 如果存在 UI 文件，先运行 `ae:chrome-devtools` / `/ae-chrome-devtools` 动态注册流程；MCP 连接就绪后再运行 `ae:test-browser`
- 如果MCP 注册失败、用户拒绝启动或当前环境无法启动，记录"无法验证：浏览器测试未执行"，不得执行浏览器操作命令
- 如果项目无 UI 文件，跳过此步骤

**门控：** 如果浏览器测试全部失败，输出警告但允许继续。

### 步骤 9：完成

汇总最终交付证据：计划路径、`validation_commands`、一一对应的 `validation_results`、审查状态和证据、Git 操作状态、worktree 决策、浏览器测试状态（如有）和剩余风险。`validation_results` 每条必须包含 `command`、`exit_code`、`output`、`executed_at`，且正式交付所依赖的验证结果 `exit_code` 必须为 0。`worktree_decision` 必须沿用步骤 6 的结果；若结果为 `transferred` 或 `cancelled`，不得进入最终功能交付。审查证据必须绑定当前 worktree、branch、HEAD 和状态摘要；如执行过 Git 写操作，记录命令参数和可验证授权证据，不能只依赖用户授权声明。

最终回复必须遵循 `ae:work` 交付参考中的最终模板分区：已完成、已验证、未验证/无法验证、Git 操作状态、审查状态、剩余风险。

输出 `<promise>DONE</promise>`

---

标准主链路：`ae:prd` → `ae:review mode:headless domain:document`（有需求文档时）→ `ae:plan` / `ae:refactor` → `ae:review mode:headless domain:document` → `ae:work` → `ae:review` → 可选专项验收

从步骤 2 现在开始。记住：先计划，再工作。永远不要跳过计划。

参考：@./references/pipeline.md
参考：@./references/task-routing.md
