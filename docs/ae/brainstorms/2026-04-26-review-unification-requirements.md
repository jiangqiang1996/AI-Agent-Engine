---
date: 2026-04-26
topic: review-unification
---

# 审查体系统一重构

## 问题框架

ae:review 和 ae:document-review 是两个独立技能，各自维护独立的 findings schema、综合流水线、代理目录和选择函数。但运行时 ae:review 通过阶段 4b 委派文档审查给 ae:document-review，然后强行做 schema 翻译合并（file=document_path, line=null）。这说明两个技能的分离收益正在被合并成本吞噬。

具体问题：

1. **schema 双轨制**：两套 findings schema（代码：file+line + 4 级 autofix；文档：section + 2 级 autofix）导致综合流水线需要专门的 5.7 翻译步骤，文档发现不参与代码 autofix_class 路由
2. **代理激活双路径**：领域代理（config/infra/database/script）在 `CODE_REVIEWERS` 目录中存在但 `selectCodeReviewers()` 无法激活——SKILL.md 文件路由和选择器函数是两条独立路径，可能静默分叉
3. **冗余代理**：6 对代理存在合并不损失关注点的机会（security/security-lens、adversarial/adversarial-document、product-lens/scope-guardian、step-granularity/batch-operation、kieran-typescript/correctness、agent-native/cli-agent-readiness）
4. **重复基础设施**：两个技能的排除规则、模式规则、综合流水线、子代理模板、工具接口约 70% 重叠
5. **审查盲区**：无代理检查代码-文档一致性和需求-实现可追溯性
6. **ae:lfg 管道耦合脆弱**：ae:lfg 的步骤 3 和步骤 5 硬编码调用 `ae:document-review`，recovery-service.ts 的 `document-review` 阶段在 `RecoveryPhaseSchema` 和 `nextSkillForArtifact`/`resumePhaseForArtifact` 中有多处分支——合并后这些调用点必须无缝衔接

解决方案：**将 ae:review 和 ae:document-review 合并为统一技能，采用声明式激活矩阵、统一 findings schema、聚类代理体系，消除双轨制和冗余基础设施。合并后 ae:lfg 管道不做任何修改即可正常执行。**

## 需求

**统一 Findings Schema**

- R1. 合并代码和文档两套 findings-schema.json 为单一统一 schema，使用 `domain: "code" | "document"` 判别器区分审查域。`domain` 的值必须与 `location.type` 一致——schema 层面增加自定义校验：当 `domain === "code"` 时 `location.type` 必须为 `"code"`，当 `domain === "document"` 时 `location.type` 必须为 `"document"`
- R2. 定位方式 `location` 为联合类型：代码域使用 `{type: "code", file, line}`，文档域使用 `{type: "document", file, section}`——两种定位方式互斥可选
- R3. autofix_class 从当前的 4+2 级（代码：safe_auto/gated_auto/manual/advisory；文档：auto/present）统一为 4 级：`auto`（确定性修复可直接应用）、`gated`（已知修复方案但需人工审批）、`manual`（需人工调查才能确定修复）、`advisory`（仅供参考）
- R4. 映射规则：safe_auto → auto，gated_auto → gated，manual → manual，advisory → advisory，文档 auto → auto，文档 present → gated
- R5. `finding_type` 从文档独有字段变为统一字段，枚举扩展为 `error | omission | pre-existing`（pre-existing 覆盖旧代码域的 `pre_existing: true`）
- R6. `owner` 和 `requires_verification` 保留为代码域可选字段，文档域代理不需要填写
- R7. `deferred_questions` 保留为文档域可选字段，代码域代理不需要填写
- R8. 降级规则：`auto` 类发现无 `suggested_fix` → 降级为 `gated`，在综合流水线输出中标记为 `auto-downgraded-to-gated` 并统计数量，使审查者可感知并修正

**声明式激活矩阵**

- R9. 将 `review-selector.ts` 中的 `selectCodeReviewers()` 和 `selectDocumentReviewers()` 两个命令式 if-链替换为声明式数据表（`REVIEW_MATRIX`），每个审查者行声明：name、domain（`"code" | "document" | "both"`）、alwaysOn、activation conditions
- R10. 选择函数统一为 `selectReviewers(input)`，根据 `input.kind` 和 `input` 中的标志位通过矩阵过滤激活审查者
- R11. 激活条件使用谓词模型（field + operator + value），初始仅支持 `truthy`/`eq`/`oneOf` 三种操作符——`gte` 待有具体消费者（如 changedLines >= N 阈值激活）时再添加
- R12. 领域代理（config/infra/database/script）的激活逻辑纳入矩阵，新增 `hasConfig`/`hasInfra`/`hasDatabase`/`hasScript` 标志位

**统一 Review Selection Input**

- R13. 合并 `DocumentReviewSelectionInput` 和 `CodeReviewSelectionInput` 为单一 `ReviewSelectionInput`，`kind: "code" | "document"` 作为输入维度之一。跨域共享字段定义一次；代码域独有字段（changedLineCount、hasMigrations、hasCli、hasPrMetadata、hasTypescript）为可选；文档域独有字段（documentType、requirementCount、hasArchitectureDecision、isHighRiskDomain、hasNewAbstraction）为可选；域独有字段在对应 kind 下为条件必填（由矩阵负责校验）
- R14. 跨域共享标志位（hasSecurity、hasUi 等）只定义一次
- R15. ae-review-contract 工具的 execute 函数消除双重分派，直接调用统一的 `selectReviewers()`。工具 args 增加 `has_config`/`has_infra`/`has_database`/`has_script` 四个可选布尔参数，传入统一的 `selectReviewers()`

**代理聚类（29 → 24）**

- R16. 合并 correctness-reviewer + kieran-typescript-reviewer → correctness-reviewer（TS 文件自动启用严格类型审查模式）
- R17. 合并 agent-native-reviewer + cli-agent-readiness-reviewer → agent-native-reviewer（包含 CLI 深度审计段落，消除两阶段激活）
- R18. 合并 security-reviewer + security-lens-reviewer → security-reviewer（跨域，根据 domain 切换审查重点）
- R19. 合并 adversarial-reviewer + adversarial-document-reviewer → adversarial-reviewer（跨域，根据 domain 切换审查重点）
- R20. 合并 product-lens-reviewer + scope-guardian-reviewer → product-scope-reviewer（高相关度的文档域代理）
- R21. 合并 step-granularity-reviewer + batch-operation-reviewer → plan-quality-reviewer（都是计划执行层面的审查）
- R22. 重命名 project-standards-reviewer → standards-reviewer（名称变更，文档域能力待后续迭代扩展）
- R23. 重命名 learnings-researcher → learnings-reviewer（名称变更，文档域能力待后续迭代扩展）
- R24. 新增 traceability-reviewer（跨域，当代码和文档同时存在时检查代码-文档一致性和需求-实现可追溯性）

**代理目录与 stage 统一**

- R25. 将 `src/assets/agents/document-review/` 下的所有代理 .md 文件迁入 `src/assets/agents/review/`
- R26. AgentStageSchema 从 `['document-review', 'review', 'research', 'workflow']` 简化为 `['review', 'research', 'workflow']`。同步更新：RecoveryPhaseSchema 移除 `'document-review'` 枚举值（合并到 `'review'`）；ae-recovery.tool.ts 的 phase 参数枚举同步更新；help-catalog-service.ts 的 stage 标签映射移除 `document-review` 分支，合并到 `review`
- R27. 删除 ae-asset-schema.ts 中被合并代理的常量，新增：PRODUCT_SCOPE_REVIEWER、PLAN_QUALITY_REVIEWER、TRACEABILITY_REVIEWER、STANDARDS_REVIEWER、LEARNINGS_REVIEWER

**技能合并**

- R28. 将 ae:document-review 技能并入 ae:review 技能，删除 `src/assets/skills/ae-document-review/` 目录
- R29. ae:review SKILL.md 采用"核心流程 + 域分支"结构：阶段 0-2 为统一流程，阶段 3 根据文件类型分别路由代码/文档审查者，阶段 4 统一并行调度，阶段 5-7 统一综合流水线
- R30. 删除 ae-asset-schema.ts 中的 SKILL.DOCUMENT_REVIEW 和 COMMAND.DOCUMENT_REVIEW 常量，同时从 AeSkillNameSchema 枚举和 ALL_COMMAND_NAMES 中移除。ae-catalog.ts 的 PHASE_ONE_ENTRIES 中删除 DOCUMENT_REVIEW 技能条目
- R31. ae-catalog.ts 中更新 REVIEW 技能描述以反映统一审查能力
- R32. recovery-service.ts 更新阶段映射：`document-review` 阶段合并到 `review` 阶段，所有 `case 'document-review'` 分支合并到 `case 'review'`，`SKILL.DOCUMENT_REVIEW` 引用替换为 `SKILL.REVIEW`，`nextSkillForArtifact` 和 `resumePhaseForArtifact` 中 `document-review` 的路由逻辑合并到 `review`

**ae:lfg 管道无缝衔接**

- R33. 合并后 ae:lfg SKILL.md 不做任何修改——步骤 3 `ae:document-review` 和步骤 5 `ae:document-review` 必须仍然可调用。通过 `/ae-document-review` 命令别名实现：命令指向 `ae:review` 技能并自动注入 `domain:document` 上下文参数
- R34. ae:lfg references/pipeline.md 中 `ae:document-review` 条目保持不变——命令别名保证语义一致
- R35. ae-recovery 工具在 `ae:lfg` 管道中仍能正确恢复——`RecoveryPhaseSchema` 移除 `document-review` 后，`ae:lfg` 步骤 3/5 的恢复请求通过 `review` 阶段路由到 `SKILL.REVIEW`

**统一综合流水线**

- R36. 合并代码 10 步和文档 8 步综合流水线为统一 9 步流水线：校验 → 置信度门控 → 去重 → 共识提升 → 残余风险提升 → 解决分歧 → autofix 提升 → 路由划分 → 排序。域特定逻辑（残余风险提升和 autofix 提升）参数化为步骤内部行为而非流水线分支——代码域在残余风险提升和 autofix 提升步骤中执行简化逻辑（跳过或最小化），文档域执行完整逻辑
- R37. 去重指纹基于统一 location 对象：`normalize(location.file) + normalize(location.type) + (location.type === "code" ? normalize(location.line) : normalize(location.section)) + normalize(title)`
- R38. 置信度阈值可配置（默认代码 0.60、文档 0.50），P0 例外 0.50+ 保留
- R39. 删除旧流水线中的 5.7 文档发现合并步骤——统一 schema 后此步骤不再需要
- R40. 统一迭代优化机制：流水线保留迭代优化步骤，文档域激活（当前行为），代码域暂不启用，待验证效果后再决定是否扩展

**统一子代理模板**

- R41. 合并两套 subagent-template.md 为统一模板，使用 `domain` 变量区分代码/文档分支
- R42. 代码域模板变量：intent_summary、file_list、content、content_mode_label、run_id、reviewer_name
- R43. 文档域模板变量：document_type、document_path、document_content
- R44. 共享变量：persona_file、schema、domain

**重构回归验证**

- R45. 为每对合并代理建立**基线 findings 快照**：合并前对两个原代理各收集最近 5 次实际审查的输入-输出对（或构造代表性测试用例），作为回归基线
- R46. 合并后对相同输入运行新代理，对比 findings 覆盖率：要求每个原代理的独立关注点在新输出中有 ≥95% 的覆盖（标题/证据语义匹配，非精确字符串匹配）
- R47. 跨域代理（R18 security、R19 adversarial）需分别对代码域和文档域输入运行回归测试，验证合并后代理在单一域的审查覆盖率不低于合并前对应专用代理的覆盖率
- R48. 新增代理（R24 traceability-reviewer）需定义最小可行职责边界（具体检查项列表），若规划阶段无法定义则从本次重构范围移出，作为独立增强提案
- R49. 为声明式激活矩阵编写**穷举激活测试**：对 REVIEW_MATRIX 中每个审查者行，验证其激活条件在所有标志位组合下的行为与原 `selectCodeReviewers()` + `selectDocumentReviewers()` 等价
- R50. 为合并/新增代理编写集成测试：验证跨域激活、findings 输出符合统一 schema、autofix_class 路由正确性
- R51. **ae:lfg 管道端到端验证**：合并完成后执行完整的 `ae:lfg` 管道（从 brainstorm 到 review），验证步骤 3/5 的文档审查和步骤 7 的代码审查均正常执行，无需修改 ae:lfg SKILL.md

**代理名别名与向后兼容**

- R52. 建立代理名别名映射表（旧名 → 新名），写入 `src/services/agent-alias-map.ts`，供恢复服务解析旧审查产物时使用
- R53. 恢复服务在读取历史审查产物时，遇到旧代理名通过别名映射解析，映射失败时降级（跳过该代理的恢复）而非报错
- R54. 旧格式 findings 数据（代码 4 级 autofix、文档 2 级 autofix）不做迁移，视为历史记录。综合流水线在读取旧产物时按 R4 映射规则将旧 autofix_class 转换为新 4 级格式

## 成功标准

- 单一 ae:review 技能可同时审查代码和文档文件，无需委派
- 统一 findings schema 覆盖所有审查场景，零 schema 翻译步骤
- 声明式激活矩阵与原双选择函数行为等价（R49 穷举测试通过）
- 代理数量从 29 降至 24，每对合并代理回归覆盖率 ≥95%（R46-R47）
- 综合流水线为单一 9 步流程，无域特定翻译层
- 所有现有测试通过，合并/新增代理有对应测试覆盖（R50）
- **ae:lfg 管道无需修改即可正常执行**：步骤 3/5 文档审查、步骤 7 代码审查、ae-recovery 恢复均正常（R51）
- 旧审查产物可读取，旧代理名可解析（R52-R53）

## 范围边界

- 合并代理时需将原有审查指令完整保留到新 persona 中——合并是扩展而非替换，不丢弃任何已有审查关注点
- 不改变 4 种审查模式（interactive、autofix、report-only、headless）
- 不改变严重级别（P0-P3）
- 不改变子代理并行调度的核心机制
- 不在此次重构中实现级联调度或严重度短路（留给后续优化）
- 不改变 resolve-base.sh 和范围检测逻辑（前一轮需求已覆盖）
- 不改变排除规则的核心内容（代码级排除规则统一覆盖文档）
- 不修改 ae:lfg SKILL.md 和 ae:lfg references/pipeline.md——命令别名保证无缝衔接
- standards-reviewer 和 learnings-reviewer 本轮仅重命名，文档域扩展能力留待后续迭代
- traceability-reviewer 若规划阶段无法定义最小可行职责边界，则从本轮范围移出

## 关键决策

- **4 级 autofix 代替 4+2 级**：保留 gated（已知修复待审批）与 manual（需人工调查）的语义区分，统一为 4 级结构让两域共享同一分类体系
- **跨域代理而非双代理**：security 和 adversarial 的分析框架在代码/文档域间高度重叠——用 domain 判别器替代代理分裂，并在 persona 中定义域特定审查段落要求确保深度不稀释
- **声明式矩阵而非命令式 if-链**：可维护性优先——添加审查者时矩阵文件为最小变更集（矩阵 + 代理 .md + ae-asset-schema 常量），不再需要修改选择器函数逻辑
- **location 联合类型而非双 schema**：统一 schema 消除翻译层，差异通过判别器保留
- **命令别名而非技能别名**：ae:lfg 调用 `ae:document-review` 命令，通过命令别名指向 `ae:review` 技能实现无缝衔接，避免修改 ae:lfg
- **domain 由 location.type 派生**：避免 domain 与 location.type 双判别器不一致问题

## 依赖 / 假设

- 假设 opencode 的 skill 加载机制支持 SKILL.md 中根据 domain 分支读取不同 references 文件——**此假设需在规划前验证**，若不成立则 R29 改为：将两套 references 合并为单一文件（用标题分区），由 SKILL.md 的 LLM 执行逻辑根据文件类型选择性加载子文件
- 假设代理目录从 document-review/ 迁入 review/ 后，构建流程的同步机制能正确处理
- 依赖 ae-asset-schema.ts 常量变更后所有引用文件同步更新
- 依赖 opencode 命令机制支持别名（一个命令名指向另一个技能）——若不支持，需在 ae-catalog.ts 中保留 DOCUMENT_REVIEW 条目并将其 skillFile 指向 ae:review 的 SKILL.md

## 待定问题

### 规划前需解决

- [影响 R33][用户决策] 合并后 `/ae-document-review` 命令是否通过 opencode 原生命令别名机制实现，还是在 ae-catalog.ts 中保留 DOCUMENT_REVIEW 条目指向 ae:review 的 SKILL.md？
- [影响 R29][前置验证] opencode SKILL.md 是否支持根据 domain 分支读取不同 references 文件？若不支持，替代方案是什么？
- [影响 R24][用户决策] traceability-reviewer 的最小可行职责边界：能否在规划前定义具体检查项（如需求 ID 在代码注释中的引用率、文档 API 端点与代码路由的对应关系），还是移出本轮范围？

### 推迟到规划

- [影响 R36][技术] 统一综合流水线的置信度阈值配置机制：硬编码常量 vs reviewPolicy 配置文件 vs opencode.json 扩展
- [影响 R41][技术] 统一子代理模板中 domain 分支的具体实现方式（if-else vs 条件 include）
- [影响 R45-R46][技术] 基线 findings 快照的存储格式和语义匹配算法

## 下一步

-> /ae-plan
