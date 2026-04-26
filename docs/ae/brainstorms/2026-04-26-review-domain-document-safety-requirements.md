---
date: 2026-04-26
topic: review-domain-document-safety
---

# 统一审查技能审查文档时的域安全与排除策略

## 问题框架

ae:review 和 ae:document-review 合并为统一技能后，ae:review 同时具备代码审查和文档审查能力。这引入两类安全问题：

1. **域意图混淆**：统一后 ae:review 需要知道"这次是代码审查"还是"文档审查"——否则会错误调度审查者（代码审查者审查文档，或文档审查者审查代码）
2. **需求/计划文档误审**：ae:lfg 步骤 7 的代码审查可能扫到 `docs/ae/brainstorms/` 和 `docs/ae/plans/` 下的文档并重复审查——步骤 3/5 已审查过这些文档

当前 ae:review 默认排除需求/计划文档（用户明确指定时纳入），但 ae:document-review **默认搜索** `docs/ae/brainstorms/` 和 `docs/ae/plans/`。统一后需要一个一致的排除策略。

## 需求

**域意图显式传递**

- R1. 统一后 ae:review SKILL.md 阶段 0 增加 `domain` 参数：`domain:code`（默认）或 `domain:document`。`domain` 参数决定审查意图——代码审查或文档审查，影响排除规则、审查者选择和综合流水线行为
- R2. ae:document-review 命令条目（ae-catalog.ts 中的 DOCUMENT_REVIEW 条目）的 `skillName` 从 `SKILL.DOCUMENT_REVIEW` 改为 `SKILL.REVIEW`，使命令模板自动引用 `ae:review` 技能。同时，DOCUMENT_REVIEW 条目新增 `customTemplate` 字段，值为 `"使用 ae:review 技能以文档域审查模式处理这次请求。domain:document $ARGUMENTS"`。command-registration.ts 的 buildCommandConfig 优先使用 `customTemplate`（如果条目提供了该字段），否则使用默认模板
- R3. ae:review SKILL.md 阶段 0 解析 `domain` 参数后，将域标记传递到后续所有阶段（排除规则、审查者选择、综合流水线）

**全域默认排除需求/计划文档**

- R4. `docs/ae/brainstorms/` 和 `docs/ae/plans/` 目录下的文件在**所有域**（domain:code 和 domain:document）下默认排除，除非满足以下"明确指定"条件之一：
  - 用户传入的文件路径指向这些目录下的文件（如 `full:docs/ae/brainstorms/xxx.md`）
  - 对话中明确提到"审查需求文档"或"审查计划文档"等语义等价表达——由 ae:review SKILL.md 的 LLM 执行逻辑判断意图
  - `domain:document` 模式下的自动搜索机制（R6a）找到了文档——自动搜索成功等同于明确指定
- R5. 统一后 ae:review 的排除规则章节更新：将当前的"默认排除（用户明确指定时纳入）"改为"全域默认排除（明确指定时纳入）"，不再区分 domain

**domain:document 模式下的文档发现机制**

- R6a. `domain:document` 模式且未指定文档路径时，ae:review 阶段 1 执行确定性搜索：在 `docs/ae/brainstorms/` 和 `docs/ae/plans/` 中查找最近修改的文件，作为候选文档。此搜索机制独立于排除规则——排除规则决定"是否纳入"，搜索机制决定"如何找到"，搜索成功等同于明确指定（R4 条件 3）
- R6b. 确定性搜索的具体逻辑：按文件修改时间降序排列 `docs/ae/brainstorms/*-requirements.md` 和 `docs/ae/plans/*.md`，取最近的一个。如果存在多个候选，选择最新文件。如果目录为空，进入 R7a 的交互流程
- R7a. `domain:document` + 交互模式 + 搜索无结果：询问用户要审查哪个文档，支持任意路径输入
- R7b. `domain:document` + 无头模式 + 未指定路径：输出错误信息，不调度代理
- R7c. `domain:document` + ae:lfg 管道模式（disable-model-invocation + 非无头）：使用确定性搜索（R6a），搜索成功直接继续；搜索失败时输出错误信息并终止（与当前 ae:document-review 无头模式行为一致——ae:lfg 管道中 ae:document-review 隐含无头语义）

**域感知的审查者选择**

- R8. `domain:code` 时，选择器仅激活代码域审查者（矩阵中 domain 为 `code` 或 `both` 的条目）
- R9. `domain:document` 时，选择器仅激活文档域审查者（矩阵中 domain 为 `document` 或 `both` 的条目）
- R10. `domain:document` 时，SKILL.md 阶段 2 执行文档类型分类（requirements/plan/test/general），而非代码审查的意图发现

**域感知的综合流水线**

- R11. `domain:code` 审查中产生的 auto 修复 → 自动应用（当前行为不变）
- R12. `domain:document` 审查中产生的 auto 修复 → 自动应用（与当前 ae:document-review 行为一致）。代码域和文档域的 auto 修复安全模型一致——两者都是"确定性修复可直接应用"的语义，区别仅在于修复对象（代码 vs 文档文本），不影响自动应用的安全性

**ae:document-review 命令兼容**

- R14. ae:document-review 命令的参数格式 `[mode:*] [文档路径]` 保持兼容——`mode:*` 和文档路径参数透传给 ae:review，`domain:document` 由命令模板自动注入
- R15. ae:document-review 统一后通过"重定向 SKILL.md"机制兼容——保留 `src/assets/skills/ae-document-review/` 目录，将其 SKILL.md 内容替换为重定向指令（"此技能已合并到 ae:review。请使用 ae:review 技能，并传入 domain:document 参数。"），同时 DOCUMENT_REVIEW catalog 条目的 `skillName` 改为 `SKILL.REVIEW`，`customTemplate` 注入 `domain:document`。`SKILL.DOCUMENT_REVIEW` 常量保留（重定向目录名仍需常量引用），`AeSkillNameSchema` 枚举保留 `'ae:document-review'`，`COMMAND.DOCUMENT_REVIEW` 保留

## 成功标准

- ae:lfg 步骤 3 文档审查需求文档：正常执行，确定性搜索找到文档，正确选择文档审查者，产出的发现与统一前等价
- ae:lfg 步骤 5 文档审查计划文档：正常执行，确定性搜索找到文档，正确选择文档审查者，产出的发现与统一前等价
- ae:lfg 步骤 7 代码审查：不审查需求/计划文档（排除规则生效），仅审查代码文件
- 非管道场景：`/ae-review` 默认不审查 `docs/ae/brainstorms/` 和 `docs/ae/plans/`
- 非管道场景：`/ae-review full:docs/ae/brainstorms/xxx.md` 明确指定时审查该需求文档
- 非管道场景：`/ae-document-review` 进入文档审查模式，确定性搜索 `docs/ae/brainstorms/` 和 `docs/ae/plans/` 中的最近文档，不误用代码审查逻辑

## 范围边界

- 不修改 ae:lfg SKILL.md 和 ae:lfg references/pipeline.md——命令别名 + 域参数 + 确定性搜索保证兼容
- 不改变 ae:review 的四种审查模式（interactive/autofix/report-only/headless）
- 不改变文档类型分类逻辑（requirements/plan/test/general 的判断依据）
- 删除 R13 混合域审查场景——`domain` 参数设计为互斥值（domain:code 或 domain:document），不支持混合域。同一次审查只能产生单一域的发现

## 关键决策

- **全域默认排除而非仅代码域排除**：`docs/ae/brainstorms/` 和 `docs/ae/plans/` 在所有域下默认排除，避免文档审查模式下无意扫描整个产物目录。`domain:document` 模式通过确定性搜索机制（R6a）找到文档，搜索成功等同于明确指定
- **确定性搜索而非 LLM 推断**：ae:lfg 管道步骤 3/5 不传文档路径，统一后 ae:review 的 `domain:document` 模式通过文件系统搜索（R6a）而非 LLM 从会话历史推断来找到文档——这是确定性机制，不依赖 LLM 的会话理解能力
- **显式 domain 参数而非文件类型推断**：显式参数消除歧义，避免"全是 .md 文件"的误判场景
- **customTemplate 字段而非硬编码分支**：command-registration.ts 为需要定制模板的 catalog 条目新增 `customTemplate` 可选字段，避免在模板生成逻辑中增加硬编码分支
- **保留 ae-document-review/ 重定向目录 + SKILL.DOCUMENT_REVIEW 常量**：opencode 技能加载按 `<skillsDir>/<skillSlug>/SKILL.md` 目录解析。ae:lfg 步骤 3/5 调用 `ae:document-review` 时，opencode 需要找到 `ae-document-review/SKILL.md` 目录。保留该目录（内容替换为重定向指令）+ 保留 `SKILL.DOCUMENT_REVIEW` 常量（用于目录名引用）。同时 DOCUMENT_REVIEW catalog 条目的 `skillName` 改为 `SKILL.REVIEW` + `customTemplate` 注入 `domain:document`，确保 `/ae-document-review` 命令路由到 ae:review 技能

## 依赖 / 假设

- 假设 command-registration.ts 可以增加 `customTemplate` 可选字段支持，且不影响现有条目的模板生成
- 假设 `domain:document` 模式下的确定性搜索（R6a）在 ae:lfg 的 disable-model-invocation 模式下可以正常执行文件系统操作
- 假设保留 `src/assets/skills/ae-document-review/` 重定向目录不会与 ae:review 技能加载产生冲突——两个目录各有独立 SKILL.md，重定向 SKILL.md 仅在用户直接调用 `ae:document-review` 时被加载
- 依赖审查体系统一重构计划（`docs/ae/plans/2026-04-26-refactor-review-unification-plan.md`）的 U1-U8 实现单元先行完成

## 与审查体系统一重构计划的交互

此需求文档的 R2、R15 对统一重构计划有以下影响：

| 统一计划单元 | 影响项 | 变更 |
|-------------|--------|------|
| U1 (Schema 常量) | SKILL.DOCUMENT_REVIEW | **保留**（重定向目录名仍需常量引用）。AeSkillNameSchema 保留 `'ae:document-review'` |
| U4 (ae-review-contract) | 无变更 | — |
| U8 (统一 SKILL.md) | 阶段 0 | 增加 `domain` 参数解析 |
| U8 (统一 SKILL.md) | 阶段 1 | `domain:document` 时执行确定性搜索（R6a） |
| U8 (统一 SKILL.md) | 排除规则 | 全域默认排除 + 明确指定条件（R4-R5） |
| U8 (统一 SKILL.md) | ae-document-review 目录 | 保留，内容替换为重定向 SKILL.md |
| U9 (ae-catalog) | DOCUMENT_REVIEW 条目 | `skillName` 改为 `SKILL.REVIEW`，新增 `customTemplate` 字段 |

## 待定问题

### 推迟到规划

- [影响 R2][技术] `customTemplate` 字段在 AeAssetEntrySchema 中的定义和校验规则
- [影响 R6a][技术] 确定性搜索的"最近文件"判定标准：文件修改时间 vs frontmatter.date vs Git 提交时间
- [影响 R7c][技术] ae:lfg 管道模式（disable-model-invocation 但非 headless）的精确行为定义——是否需要 SKILL.md 增加 `pipeline` 模式标识

## 下一步

-> /ae-plan
