---
type: plan
status: drafted
date: 2026-05-22
title: human-readable-sharding-rework
origin: ae/brainstorms/requirements-human-readable-sharding-rework-requirements.md
depth: deep
---

# 人读与机器可提取分片文档体系改造实施计划

## AI 解析契约
- canonicalKind: plan
- humanEquivalent: true
- stableIdsRequired: true
- implementationUnitsRequired: true
- noImplicitScope: true

## 来源与目标

来源需求：`ae/brainstorms/requirements-human-readable-sharding-rework-requirements.md`。

本计划面向 AE 插件源码仓库实现新的文档体系：`ae:brainstorm`、`ae:plan`、`ae:refactor` 直接产出人读与机器可提取叠加文档；需求、计划和设计文档在模块数量大于 1 或用户明确要求时支持按模块分片；`ae:review` 能基于主文件和分片文件关系构建审查输入；正式能力集中移除旧的文档互转技能和互转等价性审查代理。

本计划不保留 `ae:doc-humanize`、`ae:doc-structure` 或 `doc-equivalence-reviewer` 的兼容入口，不提供历史互转产物迁移脚本或长期兼容路径。

## 范围

### 包含
- 更新需求、计划和设计文档模板，使其同时适合人类阅读和机器提取。
- 新增最小文档提取工具，支持单文件、分片主文件、分片子文件、按 ID 和按模块筛选。
- 更新 `ae:plan`、`ae:refactor`、`ae:review`、`ae:work` 等公开技能提示词中与新文档体系相关的流程。
- 移除 `ae:doc-humanize`、`ae:doc-structure`、`doc-equivalence-reviewer` 的 schema、catalog、模型路由、帮助入口、资产文件、审查选择和测试期望。
- 更新现有文档审查代理，使其在文档域能审查分片文档集合。
- 更新 artifact、恢复、门禁或扫描逻辑，避免分片子文件被误识别为顶层 AE 产物。
- 更新 README、使用指南和资产健康测试，拒绝旧互转能力残留。

### 不包含
- 不实现历史互转产物迁移脚本。
- 不新增专门的分片一致性审查代理。
- 不按功能数量、实现单元数量、文档行数或预估 token 数触发自动分片。
- 不为所有文档强制生成独立设计文件；设计可由计划文档中的设计章节承载。
- 不在本计划阶段直接提交、推送或创建 PR。

### 约束
- 面向插件用户的运行时能力只以 `src/` 下定义为真源；不得只修改 `dist/`。
- 新增工具、技能、命令或代理名称必须从 `src/schemas/ae-asset-schema.ts` 常量和注册链路出发同步维护。
- 所有公开提示、工具描述和错误信息使用中文，并避免把本仓库源码结构描述为下游用户项目的通用前提。
- 需求、计划和设计文档分片触发规则必须一致：仅模块数量大于 1 或用户明确要求。
- 主文件必须保留全局上下文和跨模块关系，不能退化为分片路径列表。
- 子文件必须通过 `parent` 指向主文件，且不能作为恢复、门禁或执行入口的顶层产物。

## 需求追溯

| 需求 ID | 计划响应 |
|---------|----------|
| G1 | U3 |
| G2 | U3, U5 |
| G3 | U3, U4 |
| G4 | U3, U4, U5 |
| G5 | U1, U2, U9 |
| G6 | U3, U5, U8 |
| G7 | U3, U8 |
| G8 | U6, U7 |
| R1 | U3 |
| R2 | U3, U10 |
| R3 | U3, U5 |
| R4 | U3, U10 |
| R5 | U3, U4 |
| R6 | U4 |
| R7 | U4 |
| R8 | U4 |
| R9 | U3, U5 |
| R10 | U3, U5 |
| R11 | U3, U4, U5 |
| R12 | U3, U5 |
| R13 | U3, U4 |
| R14 | U4 |
| R15 | U5 |
| R16 | U6, U7 |
| R17 | U1, U2, U9 |
| R18 | U3, U5 |
| R19 | U3, U5 |
| R20 | U3, U5 |
| R21 | U3, U8 |
| R22 | U6 |
| R23 | U4, U6 |
| R24 | U7 |
| NFR1 | U3, U10 |
| NFR2 | U4 |
| NFR3 | U3, U4 |
| NFR4 | U4, U8 |
| NFR5 | U4, U6 |

## 高层技术设计

本次改造分为三条主线。

第一条是资产移除链路：从 schema 常量、catalog、模型路由、命令生成、帮助、审查选择和测试中彻底移除旧互转能力，再删除对应资产文件。这样可以避免目录删除后仍存在公开入口或测试期望。

第二条是新文档契约链路：更新 `ae:brainstorm`、`ae:plan` 和 `ae:refactor` 的模板与执行说明，统一 `brainstorm`、`plan`、`design` 主文件和 `brainstorm-shard`、`plan-shard`、`design-shard` 子文件的 frontmatter、稳定 ID、分片索引、主子引用和可选章节规则。

第三条是消费与审查链路：新增最小提取工具作为确定性解析层，由 `ae:plan` 和 `ae:review` 优先使用；`ae:review` 在编排层构造分片审查输入，把确定性 diagnostics 传给现有文档审查代理，由代理负责语义一致性、可行性、步骤粒度和对抗性风险判断。

### 关键决策
- D1. 先从注册和测试期望移除旧互转能力，再删除旧资产文件 → 理由: 资产入口分布在 schema、catalog、模型路由、审查矩阵和文档中，先断注册能暴露遗漏引用。
- D2. 新增工具命名为 `ae-doc-extract`，服务命名为 `doc-extract-service` → 理由: 工具职责是通用文档提取，不只服务需求，也要支持计划和设计。
- D3. `design` 作为主设计文档类型，`design-shard` 作为辅助分片类型 → 理由: 需求已明确设计文档模板需要进入新体系，子文件不作为顶层恢复入口。
- D4. `is_doc_conversion` 从审查契约公开参数中移除，而不是保留弃用字段 → 理由: 需求明确不提供旧互转能力长期兼容路径。
- D5. 分片确定性检查放在提取服务和审查编排入口复用 → 理由: 路径存在、parent 指向、ID 重复和索引覆盖属于确定性问题，不应交给代理重复推断。
- D6. README 和使用指南同步删除旧命令说明 → 理由: 帮助入口移除后，公开文档保留旧命令会误导用户。

## 专项设计

### 文档类型与分片结构

主文件合法类型：`brainstorm`、`plan`、`design`。

辅助分片类型：`brainstorm-shard`、`plan-shard`、`design-shard`。

主文件必须使用 `sharded: true|false` 标识是否分片；分片主文件必须包含 `shards` 列表；子文件必须包含 `parent` 和 `module`。恢复、门禁、执行入口只接受主文件作为顶层产物，子文件只能被提取工具或审查编排读取。

### 最小提取工具

新增工具建议参数：

```text
path: 文档路径，必须位于当前工作区内
ids: 可选，稳定 ID 列表，支持 R* 和 U*
modules: 可选，模块名列表
includeGlobalContext: 可选，默认 true
```

输出必须包含 `metadata`、`artifacts`、`scope`、`goals`、`requirements`、`implementationUnits`、`designSections`、`constraints`、`questions` 和 `diagnostics`；可选内容存在时再输出 `nonFunctionalRequirements`、`risks`、`decisions`、`entities`、`interfaces`。

### 分片审查输入

`ae:review` 文档域遇到 `sharded: true` 主文件时，应构造统一审查上下文：`rootDocument`、`shards`、`missingShards`、`duplicateIds`、`parentMismatch`、`globalRelations`、`diagnostics`。这些字段进入代理提示词上下文，而不是让每个代理自行发现文件关系。

### 旧互转能力移除范围

移除范围至少包括 `SKILL.DOC_HUMANIZE`、`SKILL.DOC_STRUCTURE`、派生命令、`AGENT.DOC_EQUIVALENCE_REVIEWER`、catalog 条目、模型路由、审查矩阵、审查选择条件、prompt optimize 变体排除项、README、使用指南、资产健康测试和相关集成测试。

## 实现单元

### U1. 移除旧互转能力注册入口
- [ ] 目标: 从代码注册真源中移除 `ae:doc-humanize`、`ae:doc-structure` 和 `doc-equivalence-reviewer`。
- [ ] 覆盖需求: G5, R17
- [ ] 所属模块: 资产注册
- [ ] 唯一产出物: schema、catalog、模型路由和审查选择中不再存在旧互转入口。
- [ ] 依赖: 无
- [ ] 文件:
  - `src/schemas/ae-asset-schema.ts`
  - `src/services/ae-catalog.ts`
  - `src/services/asset-model-routing-catalog.ts`
  - `src/services/review-catalog.ts`
  - `src/services/review-selector.ts`
  - `src/tools/ae-review-contract.tool.ts`
  - `src/tools/ae-gate.tool.ts`
  - `src/tools/ae-review-proof.tool.ts`
- [ ] 方法:
  - 删除旧技能常量、旧代理常量和派生引用。
  - 删除旧命令模型路由条目。
  - 删除 `doc-equivalence-reviewer` 的文档域激活逻辑。
  - 删除 `is_doc_conversion` 等互转专用公开参数或 allowlist 项。
- [ ] 需遵循的模式:
  - 资产名称以 `src/schemas/ae-asset-schema.ts` 为真源。
  - `COMMAND_SCENARIOS` 必须覆盖剩余所有命令，不能保留已删除命令。
- [ ] 测试场景:
  - 正常路径: 剩余技能、命令和代理仍能注册。
  - 边界情况: `-po`、`-pa` 变体排除列表不引用已删除技能。
  - 错误路径: 审查契约不再接受互转产物作为专门审查条件。
  - 集成场景: 帮助 catalog 不展示旧技能。
- [ ] 验证:
  - `npm run typecheck`
  - `npx vitest run tests/schemas/ae-asset-schema.test.ts tests/services/ae-catalog.test.ts tests/services/asset-model-routing-catalog.test.ts tests/services/review-catalog.test.ts tests/services/review-selector.test.ts tests/tools/ae-review-contract.tool.test.ts`

### U2. 删除旧互转资产并更新公开文档
- [ ] 目标: 删除旧技能目录、旧代理文件和公开文档中的旧命令说明。
- [ ] 覆盖需求: G5, R17
- [ ] 所属模块: 资产文件与文档
- [ ] 唯一产出物: 仓库中不存在正式可分发的旧互转资产，公开文档不再引导用户调用旧命令。
- [ ] 依赖: U1
- [ ] 文件:
  - `src/assets/skills/ae-doc-humanize/`
  - `src/assets/skills/ae-doc-structure/`
  - `src/assets/agents/review/doc-equivalence-reviewer.md`
  - `README.md`
  - `docs/usage-guide.md`
  - `tests/assets/asset-health.test.ts`
  - `tests/assets/doc-conversion-contract.test.ts`
  - `tests/scripts/postbuild.test.ts`
- [ ] 方法:
  - 删除旧资产目录和旧代理文件。
  - 将资产健康测试从“旧资产应存在”改为“旧资产不得作为正式能力残留”。
  - 将 postbuild 示例中的旧技能目录替换为仍保留的稳定技能目录。
  - 从 README 和使用指南移除 `/ae-doc-humanize`、`/ae-doc-structure`。
- [ ] 需遵循的模式:
  - 不修改 `dist/` 作为真源；构建后再生成产物。
  - 删除文件前确认没有非互转流程仍依赖该资产。
- [ ] 测试场景:
  - 正常路径: postbuild 仍复制保留资产。
  - 边界情况: 全文搜索旧命令只允许出现在历史需求或测试断言拒绝列表中。
  - 错误路径: catalog 不引用不存在的资产路径。
  - 集成场景: 帮助输出无旧命令。
- [ ] 验证:
  - `npx vitest run tests/assets/asset-health.test.ts tests/services/help-catalog-service.integration.test.ts tests/services/command-registration.test.ts tests/scripts/postbuild.test.ts`
  - `npm run build`

### U3. 更新需求、计划和设计文档模板
- [ ] 目标: 让 `ae:brainstorm`、`ae:plan`、`ae:refactor` 原生生成新人读与机器可提取文档，支持单文件和按模块分片。
- [ ] 覆盖需求: G1, G2, G3, G4, G6, G7, R1, R2, R3, R4, R5, R9, R10, R11, R12, R13, R18, R19, R20, R21, NFR1, NFR3
- [ ] 所属模块: 文档模板
- [ ] 唯一产出物: 新模板明确主文件、子文件、稳定 ID、条件章节和分片触发规则。
- [ ] 依赖: U1
- [ ] 文件:
  - `src/assets/skills/ae-brainstorm/SKILL.md`
  - `src/assets/skills/ae-brainstorm/references/requirements-capture.md`
  - `src/assets/skills/ae-plan/SKILL.md`
  - `src/assets/skills/ae-plan/references/plan-template.md`
  - `src/assets/skills/ae-refactor/SKILL.md`
- [ ] 方法:
  - 替换旧“机器文档与人读文档互转”等价要求。
  - 增加 `format: human-readable-requirements|human-readable-plan|human-readable-design`。
  - 增加 `sharded`、`shards`、`parent`、`module` 规则。
  - 明确多数章节为条件可选，不生成无内容占位章节。
  - 为 `U*` 实现单元补充唯一产出物字段。
- [ ] 需遵循的模式:
  - 技能正文必须保留角色、适用场景、执行流程、输入处理、输出要求、安全边界和验证方式。
  - 列举 AE 技能时保持文件内既有分组风格，不机械打散语义。
- [ ] 测试场景:
  - 正常路径: 单文件需求和计划模板含稳定 ID 和必选章节。
  - 边界情况: 分片模板只按模块或用户要求触发。
  - 错误路径: 模板不再引用旧互转技能。
  - 集成场景: `ae:plan` 模板仍能被 `ae:work` 读取实现单元。
- [ ] 验证:
  - `npx vitest run tests/assets/ae-plan-artifact-text.test.ts tests/assets/asset-health.test.ts`
  - 按需新增模板文本测试后运行对应测试。

### U4. 新增最小文档提取工具
- [ ] 目标: 提供 `ae-doc-extract` 工具，确定性读取单文件和分片文档，支持局部上下文提取。
- [ ] 覆盖需求: G3, R5, R6, R7, R8, R11, R13, R14, R23, NFR2, NFR3, NFR4, NFR5
- [ ] 所属模块: 工具与服务
- [ ] 唯一产出物: 可注册调用的文档提取工具及其服务测试。
- [ ] 依赖: U3
- [ ] 文件:
  - `src/schemas/ae-asset-schema.ts`
  - `src/tools/index.ts`
  - `src/tools/ae-doc-extract.tool.ts`
  - `src/services/doc-extract-service.ts`
  - `tests/tools/ae-doc-extract.tool.test.ts`
  - `tests/services/doc-extract-service.test.ts`
- [ ] 方法:
  - 使用 Zod 定义参数：`path`、`ids`、`modules`、`includeGlobalContext`。
  - 校验输入路径位于当前工作区内。
  - 解析 frontmatter 和 Markdown 稳定 ID 段落。
  - 输入 `sharded: true` 主文件时读取 `shards` 列表；筛选条件可通过索引命中子文件。
  - 输入子文件时返回子文件内容和 `parent` 诊断。
  - 输出缺失分片、重复 ID、parent mismatch、索引覆盖不足等 diagnostics。
- [ ] 需遵循的模式:
  - 工具描述第一行不超过 50 字，并说明适用/不适用场景。
  - 工具层捕获错误并返回中文可恢复提示，不抛出未捕获异常。
  - 服务层不依赖工具层。
- [ ] 测试场景:
  - 正常路径: 单文件需求提取成功。
  - 边界情况: 分片主文件按模块筛选只读匹配分片。
  - 错误路径: 缺失分片、重复 ID、parent 不一致进入 diagnostics。
  - 集成场景: 计划文档中的 `U*` 可被按 ID 提取。
- [ ] 验证:
  - `npx vitest run tests/tools/ae-doc-extract.tool.test.ts tests/services/doc-extract-service.test.ts tests/schemas/ae-asset-schema.test.ts`
  - `npm run typecheck`

### U5. 更新 `ae:plan` 和 `ae:refactor` 消费新文档
- [ ] 目标: 规划入口优先通过提取工具读取结构化需求，并按需读取原文补充语义。
- [ ] 覆盖需求: G2, G4, G6, R3, R9, R10, R11, R12, R15, R18, R19, R20
- [ ] 所属模块: 规划工作流
- [ ] 唯一产出物: `ae:plan` 和 `ae:refactor` 流程不再依赖旧机器专用需求文档或互转产物。
- [ ] 依赖: U4
- [ ] 文件:
  - `src/assets/skills/ae-plan/SKILL.md`
  - `src/assets/skills/ae-plan/references/plan-template.md`
  - `src/assets/skills/ae-refactor/SKILL.md`
  - `tests/assets/ae-plan-artifact-text.test.ts`
- [ ] 方法:
  - 在 `ae:plan` 输入处理阶段说明优先调用 `ae-doc-extract`。
  - 明确分片需求主文件和模块筛选处理。
  - 保留读取原文作为语义补充，不把工具输出当作完整替代。
  - `ae:refactor` 继续产出 `type: plan`，并保留行为保持要求和回滚信号。
- [ ] 需遵循的模式:
  - 计划文档必须让 `ae:work` 能直接读取实现单元执行。
  - 不把设计文档作为旧互转产物处理。
- [ ] 测试场景:
  - 正常路径: 新需求文档可进入计划流程。
  - 边界情况: 分片主文件默认读取全局上下文和相关分片。
  - 错误路径: 提取工具 diagnostics 不被静默忽略。
  - 集成场景: refactor 仍生成 `type: plan`。
- [ ] 验证:
  - `npx vitest run tests/assets/ae-plan-artifact-text.test.ts tests/assets/asset-health.test.ts`

### U6. 更新 `ae:review` 分片审查契约
- [ ] 目标: 文档域审查由编排层构建分片审查输入，并移除互转等价性审查路径。
- [ ] 覆盖需求: G8, R16, R22, R23, NFR5
- [ ] 所属模块: 审查编排
- [ ] 唯一产出物: `ae:review` 文档域能向代理提供 `rootDocument`、`shards`、`missingShards`、`duplicateIds`、`parentMismatch`、`globalRelations`、`diagnostics`。
- [ ] 依赖: U4
- [ ] 文件:
  - `src/assets/skills/ae-review/SKILL.md`
  - `src/tools/ae-review-contract.tool.ts`
  - `src/services/review-selector.ts`
  - `src/services/review-catalog.ts`
  - `tests/tools/ae-review-contract.tool.test.ts`
  - `tests/services/review-selector.test.ts`
  - `tests/services/review-catalog.test.ts`
- [ ] 方法:
  - 移除 `doc-equivalence` 和 `is_doc_conversion` 语义。
  - 增加分片审查输入契约说明。
  - 复用提取服务或等价确定性逻辑生成 diagnostics。
  - 默认审查全部分片，用户显式指定模块时允许局部审查。
- [ ] 需遵循的模式:
  - `ae-review-contract` 工具只返回审查契约，不替代真实审查。
  - 确定性完整性问题和代理语义发现要在报告中区分。
- [ ] 测试场景:
  - 正常路径: 分片主文件生成完整审查上下文。
  - 边界情况: 用户指定模块时只构建模块审查范围但保留全局上下文。
  - 错误路径: 缺失分片作为 diagnostics 和审查证据出现。
  - 集成场景: 不再选择 `doc-equivalence-reviewer`。
- [ ] 验证:
  - `npx vitest run tests/tools/ae-review-contract.tool.test.ts tests/services/review-selector.test.ts tests/services/review-catalog.test.ts tests/assets/asset-health.test.ts`

### U7. 更新现有文档审查代理的分片职责
- [ ] 目标: 不新增代理，扩展现有文档审查代理对分片文档集合的语义审查能力。
- [ ] 覆盖需求: G8, R16, R24
- [ ] 所属模块: 审查代理
- [ ] 唯一产出物: 现有代理提示词覆盖分片审查职责，且 catalog 不注册互转等价性代理。
- [ ] 依赖: U6
- [ ] 文件:
  - `src/assets/agents/review/coherence-reviewer.md`
  - `src/assets/agents/review/feasibility-reviewer.md`
  - `src/assets/agents/review/step-granularity-reviewer.md`
  - `src/assets/agents/review/adversarial-reviewer.md`
  - `src/assets/agents/review/product-lens-reviewer.md`
  - `src/services/review-catalog.ts`
  - `tests/services/review-catalog.test.ts`
  - `tests/assets/asset-health.test.ts`
- [ ] 方法:
  - `coherence-reviewer` 增加 ID、术语、父子引用、索引和跨模块关系一致性检查。
  - `feasibility-reviewer` 增加分片发现、批处理、恢复、缺失分片降级和上下文预算可行性检查。
  - `step-granularity-reviewer` 增加分片边界、分片级产出物、分片级验证和跨文件依赖检查。
  - `adversarial-reviewer` 增加缺失分片、重复 ID、模块归属不清、主文件退化为路径列表等失败场景。
  - `product-lens-reviewer` 仅在分片影响范围、复杂度或产品决策时激活。
- [ ] 需遵循的模式:
  - 更新既有代理时最小修改，保留仍有效的职责、流程、边界和输出格式。
  - 不把确定性文件系统检查重复写成代理主职责。
- [ ] 测试场景:
  - 正常路径: 文档域审查团队仍能覆盖语义审查。
  - 边界情况: 存在分片不必然激活 product-lens-reviewer。
  - 错误路径: 旧互转代理不再作为候选代理出现。
  - 集成场景: 资产健康检查通过。
- [ ] 验证:
  - `npx vitest run tests/services/review-catalog.test.ts tests/assets/asset-health.test.ts`

### U8. 适配 artifact、恢复和门禁对分片类型的处理
- [ ] 目标: 分片子文件作为辅助文件参与提取和审查，但不被当作顶层 AE 产物恢复或执行。
- [ ] 覆盖需求: G6, G7, R18, R21, NFR4
- [ ] 所属模块: 产物扫描与恢复
- [ ] 唯一产出物: `brainstorm-shard`、`plan-shard`、`design-shard` 被识别为辅助类型，恢复入口以主文件为准。
- [ ] 依赖: U3, U4
- [ ] 文件:
  - `src/schemas/artifact-schema.ts`
  - `src/services/artifact-store.ts`
  - `src/services/recovery-service.ts`
  - `src/services/gate-service.ts`
  - `tests/schemas/artifact-schema.test.ts`
  - `tests/services/recovery-service.test.ts`
  - `tests/services/gate-service.test.ts`
- [ ] 方法:
  - 若 artifact schema 需要枚举辅助类型，则明确区分顶层产物和辅助分片。
  - 扫描 `ae/brainstorms/`、`ae/plans/` 时忽略分片子文件作为恢复候选。
  - 门禁仍要求主需求或主计划路径，必要时通过提取 diagnostics 暴露分片问题。
- [ ] 需遵循的模式:
  - 不把分片子文件当作独立 `ae:work` 执行基线。
  - 诊断缺失分片时返回可恢复中文提示。
- [ ] 测试场景:
  - 正常路径: 主文件可恢复。
  - 边界情况: 子文件存在但不成为最近顶层产物。
  - 错误路径: 主文件引用缺失子文件时 diagnostics 可见。
  - 集成场景: gate 仍能基于主计划路径运行。
- [ ] 验证:
  - `npx vitest run tests/schemas/artifact-schema.test.ts tests/services/recovery-service.test.ts tests/services/gate-service.test.ts`

### U9. 更新旧互转引用的测试和全仓搜索约束
- [ ] 目标: 把旧互转能力的引用从“应存在”改为“正式能力不得残留”。
- [ ] 覆盖需求: G5, R17
- [ ] 所属模块: 测试与质量门禁
- [ ] 唯一产出物: 测试套件不再要求旧互转能力存在，并能发现不应存在的正式入口残留。
- [ ] 依赖: U1, U2
- [ ] 文件:
  - `tests/assets/doc-conversion-contract.test.ts`
  - `tests/assets/asset-health.test.ts`
  - `tests/services/command-registration.test.ts`
  - `tests/services/help-catalog-service.integration.test.ts`
  - `tests/services/asset-model-routing-catalog.test.ts`
  - `tests/services/review-selector.test.ts`
  - `tests/services/review-catalog.test.ts`
  - `tests/tools/ae-gate.tool.test.ts`
- [ ] 方法:
  - 删除或重写 `doc-conversion-contract` 测试。
  - 移除旧技能命令注册断言。
  - 移除 gate 和 proof 中旧代理 allowlist 断言。
  - 添加全仓可分发资产检查，确保 `src/assets/skills/ae-doc-humanize`、`src/assets/skills/ae-doc-structure`、`src/assets/agents/review/doc-equivalence-reviewer.md` 不存在。
- [ ] 需遵循的模式:
  - 历史需求文档可保留旧名称作为背景，不应成为正式资产残留判断失败原因。
  - 测试描述使用中文。
- [ ] 测试场景:
  - 正常路径: 当前正式能力测试通过。
  - 边界情况: README 或 docs 中旧命令残留会被测试发现。
  - 错误路径: catalog 引用已删除资产会失败。
  - 集成场景: 全量测试通过。
- [ ] 验证:
  - `npx vitest run tests/assets/asset-health.test.ts tests/services/command-registration.test.ts tests/services/help-catalog-service.integration.test.ts tests/services/asset-model-routing-catalog.test.ts tests/services/review-selector.test.ts tests/services/review-catalog.test.ts tests/tools/ae-gate.tool.test.ts`

### U10. 补充新文档体系契约测试
- [ ] 目标: 用测试锁定新人读与机器可提取文档体系的关键约束。
- [ ] 覆盖需求: R2, R4, NFR1
- [ ] 所属模块: 契约测试
- [ ] 唯一产出物: 新文档模板和分片契约测试覆盖关键文本与结构。
- [ ] 依赖: U3, U4, U6
- [ ] 文件:
  - `tests/assets/human-readable-doc-contract.test.ts`
  - `tests/tools/ae-doc-extract.tool.test.ts`
  - `tests/services/doc-extract-service.test.ts`
- [ ] 方法:
  - 新增模板文本测试，断言分片触发条件不包含功能数量、实现单元数量或行数。
  - 断言主文件模板要求保留模块关系、跨模块流程、共享数据或接口边界。
  - 断言可选章节不要求生成空壳占位。
  - 断言分片审查契约包含 diagnostics 字段。
- [ ] 需遵循的模式:
  - 测试应验证对用户可见的契约，而不是绑定脆弱排版。
  - 避免用过宽正则误判历史需求文档中的旧背景描述。
- [ ] 测试场景:
  - 正常路径: 新模板契约存在。
  - 边界情况: 分片触发条件只来自模块数量和用户明确要求。
  - 错误路径: 旧互转描述出现在正式模板时失败。
  - 集成场景: 提取服务 diagnostics 与模板契约一致。
- [ ] 验证:
  - `npx vitest run tests/assets/human-readable-doc-contract.test.ts tests/tools/ae-doc-extract.tool.test.ts tests/services/doc-extract-service.test.ts`

### U11. 全量验证与构建
- [ ] 目标: 验证整个插件源码仓库在移除旧资产并新增工具后仍可类型检查、测试和构建。
- [ ] 覆盖需求: 所有需求
- [ ] 所属模块: 交付验证
- [ ] 唯一产出物: 验证命令通过记录。
- [ ] 依赖: U1, U2, U3, U4, U5, U6, U7, U8, U9, U10
- [ ] 文件:
  - 全仓库
- [ ] 方法:
  - 先跑局部测试定位失败，再跑全量验证。
  - 构建后只检查生成产物，不手工维护 `dist/`。
- [ ] 需遵循的模式:
  - 交付前至少运行相关测试、`npm run typecheck` 和 `npm run build`；无法运行时说明原因。
- [ ] 测试场景:
  - 正常路径: 全量测试通过。
  - 边界情况: postbuild 生成调试桥接文件不破坏运行时独立性。
  - 错误路径: 任何旧资产残留导致相关测试失败。
  - 集成场景: 插件入口加载剩余资产成功。
- [ ] 验证:
  - `npm run typecheck`
  - `npm run test`
  - `npm run build`

## 风险与应对

| 风险 | 影响 | 应对措施 |
|------|------|----------|
| 旧互转能力引用分散，遗漏导致构建或帮助入口不一致 | 高 | 先断 schema/catalog/model routing，再用测试和搜索反向验证 |
| 新提取工具过度解析 Markdown，导致实现复杂且脆弱 | 中 | 第一版只做稳定 ID、frontmatter、固定标题和分片索引的最小提取 |
| 分片子文件被恢复或门禁误当作顶层产物 | 高 | 在 artifact/recovery/gate 层明确区分主文件和辅助分片 |
| 主文件模板退化为路径索引 | 高 | 模板和测试强制保留模块关系、跨模块流程、共享数据或接口边界 |
| 审查代理重复执行确定性检查 | 中 | 确定性检查写入 diagnostics，代理只基于诊断做语义审查 |
| 移除旧命令影响用户习惯 | 中 | README 和使用指南明确当前正式能力，不提供迁移路径但可在发布说明中说明移除范围 |

## 待定问题

### 执行前需解决
- Q1. 是否需要把 `ae-doc-extract` 暴露为用户可直接调用的公开工具帮助项，还是只作为技能内部工具使用？建议公开，因为需求要求后续 LLM 能复用最小提取能力。
- Q2. 是否新增独立 `tests/assets/human-readable-doc-contract.test.ts`，还是重写现有 `doc-conversion-contract.test.ts` 为新契约测试？建议新增新文件并删除旧互转契约测试，避免旧语义残留。

### 推迟到执行
- Q3. 具体 Markdown 解析实现是否引入 YAML/frontmatter 现有工具函数，执行时以仓库现有依赖和工具函数为准。
- Q4. `originFingerprint` 是否在新模板中继续要求由 `ae:plan` 生成，执行时根据现有 fingerprint 服务决定。

## 等价性检查
- implementationUnitsCount: 11
- tracedRequirementsCount: 32
- decisionsCount: 6
- risksCount: 6
