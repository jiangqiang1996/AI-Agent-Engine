---
name: ae:review
description: "通用审查入口。默认自动识别审查场景，支持单一类型（代码、需求、设计、原型、配置、技能、命令、测试用例等）以及多类型混合范围；按场景与目标类型组合专一审查者，分层并行执行。"
argument-hint: "[mode] [domain] [scenes=<list>] [targets=<list>] [from=<ref>] [full] [full=<path>] [session] [design=<path>] [goals=<text>] [路径...]"
---

# 通用审查（编排层）

审查回答**质量如何（HOW WELL）**——代码是否正确、安全、可维护；需求/设计/原型/测试用例/配置/资产是否一致、可行、可追溯、可验证。

此技能是 AE 通用核心流程的审查入口。

此技能支持：

- 用户只给一个产出物（如一份需求、一份设计、一份原型说明、一段代码 diff、一组测试用例、一个配置或一个技能/命令文件）时也能直接审查；
- 用户一次性传入多类型混合范围时，按目标类型分类并合并对应专一审查者；
- 默认 `domain` 自动识别为 `code`、`document` 或 `general`（混合）；用户可显式覆盖 `domain=general` 或通过 `scenes=` / `targets=` 强制场景。

此技能采用四阶段编排协议，通过代码化调度直接并行调用审查专精代理。所有审查任务都必须由专一子代理执行；编排层只负责范围确认、场景归类、调度和聚合。

## 核心原则

1. **范围先行，审查在后** — 在调度任何审查者之前，必须完成范围确定、排除规则应用和用户确认。不得跳过范围确认直接审查。
2. **只读操作** — 审查子代理不得编辑项目文件或变更仓库状态。仅 `auto` 修复在综合阶段由编排器应用。
3. **意图驱动** — 代码域每个发现必须对照意图摘要判断相关性。与意图无关的预存问题标记 `pre_existing: true`，不计入审查结论。
4. **证据必须基于实际内容** — 每个发现至少包含一项来自实际代码/文档的证据。无证据的泛泛建议必须抑制。
5. **排除规则不可绕过** — 敏感文件和 `.opencode/` 始终排除。需求/设计文档默认排除，仅在满足"明确指定"条件时纳入。
6. **auto vs present 的判断标准是可推断确定性** — 判断标准不是"这个修复重要吗？"，而是"能否根据已知内容推断出唯一最小修复"。可由同一文档、同一设计、项目既有规范、稳定模板或明确用户意图推断出的修复 → `auto`；需要选择目标、范围、取舍或新增立场 → `gated`/`manual`。
7. **无法推断时提出补全建议** — `gated`/`manual` 发现不得只停留在问题报告；必须给出可选建议和一个面向用户的补全问题。交互模式下先询问用户，得到明确选择后再修复；自动修复模式只记录问题和建议，不替用户决策；无头模式按审查者推荐方向修复所有带 `suggested_fix` 且不触发安全边界的发现。
8. **域协同而非互斥** — `domain` 仅描述审查对象域：`code`、`document` 或 `general`（混合）。`general` 表示同一次审查覆盖多种产出物类型，由编排层按 `targetTypes` 与 `reviewScenes` 分别选择对应专一审查者并合并发现，但不得让任何一个审查者跨域包办；每种识别出的目标类型至少有一个专一审查者被调度，否则必须显式记录"未覆盖原因"。
9. **图谱新鲜度门控** — 使用 `ae:graph-query` 确定范围或影响面时必须读取 `freshness`；`freshness.status` 不是 `fresh` 时，图谱结果只能辅助定位，不得作为无影响、无依赖、完整覆盖或无需审查的结论证据；需要这类高影响结论时必须刷新图谱，或用真实文件、源码搜索、Git 状态和验证命令补证。

## 模式规则

| 模式 | 交互 | 自动修复 | 展示 | 产物 |
|------|------|---------|------|------|
| **交互**（默认） | 询问策略决策 | 仅 `auto` | 完整报告 + 选项 | 写入 |
| **自动修复** | 无 | 仅 `auto` | 仅结果摘要 | 写入 |
| **只读** | 无 | 无 | 完整报告 | 无 |
| **无头** | 无 | `auto` + 推荐修复 | 结构化文本 | 写入，返回"审查完成" |

## 排除规则

**始终排除（任何情况下不可覆盖）：**
- 敏感文件：`.env`、`.env.*`（保留 `.env.example`、`.env.template`）——在文件收集阶段即从文件列表中移除，后续任何阶段不可读取或引用
- `.opencode/` 目录下的所有文件
- 受保护产物：`ae/reviews/*`、`ae/solutions/*`

**全域默认排除（域安全需求 R4-R5）：**
- `ae/prds/` 下的文件
- `ae/designs/` 下的文件

**"明确指定"条件——满足任一则纳入：**
1. 用户传入的文件路径指向这些目录下的文件
2. 对话中明确提到"审查需求文档"或"审查设计文档"等语义等价表达
3. `domain=document` 模式下确定性搜索机制（阶段 1）找到了文档——搜索成功等同于明确指定
4. `domain=general` 模式下用户提供的混合范围中显式包含 `ae/prds/` 或 `ae/designs/` 路径——纳入对应目标类型的审查者

## 四阶段编排协议

### 阶段一：入口（Entry）

解析参数，确定审查域和范围，输出 `TaskIntent`。

#### 参数解析

解析 `$ARGUMENTS` 中的可选标记。以 `mode=` 或 `domain=` 开头的标记是标志，不是 ref——从参数中移除它们。

参数解析规则（三级策略）：
1. 显式命名：`key=value`、`key:value`、`--key=value` 直接绑定，优先级最高
2. 值特征推断：按值的模式自动匹配参数类型（仅在参数意图上下文中生效）

   | 值模式 | 推断为 |
   |--------|--------|
   | autofix / report-only / headless | mode |
   | code / document / general | domain |

   ❌ 否定示例：`审查 headless 模式的文档` 中的 headless 不推断为 mode

3. 顺序兜底：仅 mode 和 domain 参与推断，其余参数（from/recent/design/goals/scenes/targets）必须显式命名

| 标记 | 效果 |
|------|------|
| `domain=code` | 强制代码域审查 |
| `domain=document` | 强制文档域审查 |
| `domain=general` | 强制混合范围审查（多类型协同）；省略 `domain` 时由编排层根据范围自动识别 |
| `scenes=<list>` / `reviewScenes=<list>` | 显式覆盖审查场景，逗号分隔，可选值：`code`、`requirements`、`design`、`prototype`、`test-case`、`config`、`asset`、`general-document` |
| `targets=<list>` / `targetTypes=<list>` | 显式覆盖目标产出物类型，逗号分隔，可选值：`code`、`requirements`、`design`、`prototype`、`test-case`、`config`、`asset`、`document` |
| `mode=autofix` | 自动修复模式 |
| `mode=report-only` | 只读模式 |
| `mode=headless` | 无头模式（程序调用） |
| `from=<ref>` | 使用 Git diff 确定范围，以指定 ref 作为差异基准 |
| `recent=<N>` | 审查最近 N 次 Git 提交 |
| `full` | 审查项目中所有文件（不依赖 Git） |
| `full=<path>` | 审查指定路径下的所有文件（不依赖 Git） |
| `session` | 审查本次会话中变更的文件 |
| `design=<path>` | 加载设计用于需求验证 |
| `goals=<text>` | 传入审查目标（成功条件列表），激活 goal-alignment-reviewer 逐条校验变更是否达成目标 |

**内部调用约定**：当本技能被其他技能自动调用时，所有参数必须使用显式命名格式（如 `mode=autofix domain=document`），不依赖值特征推断。

**冲突检测：** 以下范围标记互斥，同时指定时停止并报错：`from=` / `recent=` / `full` / `full=<path>` / `session`。

#### 范围确定

阅读 `references/scope-detection.md` 获取完整的 Git 范围检测流程。

##### 自动域识别

未显式指定 `domain` 时，按以下顺序识别：

1. 若用户传入路径仅包含 `ae/prds/`、`ae/designs/` 或其他 `.md` 文档 → `domain=document`。
2. 若范围仅含代码、配置、脚本或基础设施文件，且不含上述文档类型 → `domain=code`。
3. 若同一次范围内既包含代码/配置/资产，又包含需求、设计、原型或测试用例文档 → `domain=general`。
4. 自动识别失败或证据不足时回退到 `domain=code`，并在交互模式下提示用户确认。

代码域范围确定：

1. **Git 差异模式**（`from=<ref>` 或 `recent=<N>` 或自动检测）→ 按优先级检测，展示变更文件让用户确认
2. **全量扫描模式**（`full` 或 `full=<path>`）→ 扫描项目文件，应用排除规则，让用户确认
3. **会话变更模式**（`session`）→ 识别会话变更文件，让用户确认
4. **自动检测**（无范围参数时）→ 按 Git 自动检测优先级尝试，非 Git 项目回退全量扫描

文档域范围确定：

- 指定文档路径 → 使用指定路径
- 未指定路径 + 交互模式 → 搜索 `ae/prds/` 和 `ae/designs/` 中最近修改的文件
- 未指定路径 + 无头模式 → 输出错误，立即终止

通用域（`domain=general`）范围确定：

- 必须显式提供路径或显式范围标记（`from=`、`recent=`、`full`、`full=<path>`、`session`），不进行无路径的盲扫
- 路径列表按文件特征分桶为不同 `targetTypes` 与 `reviewScenes`：
  - `ae/prds/**`、`requirements`、`prd` 命名 → `requirements`
  - `ae/designs/**`、`design`、`plan`、`spec` 命名或 frontmatter `type: design` → `design`
  - `prototype`、`mock` 命名 → `prototype`
  - `tests/**`、`test-case`、frontmatter `type: test` → `test-case`
  - `*.json(c)`、`*.yaml`、`*.toml`、`.env.example`、`.env.template` → `config`；`.opencode/` 与真实 `.env*` 仍按排除规则处理
  - 内置技能/代理/命令资产目录（如 OpenCode 项目内的 `assets/skills/**`、`assets/agents/**`、`assets/commands/**`） → `asset`
  - 其余源码、脚本、基础设施 → `code`
  - 其余 `.md` → `general-document`
- 用户通过 `scenes=` / `targets=` 显式覆盖时优先使用用户提供的归类，但必须保留实际范围内确实存在的目标类型；不存在的类型必须在汇总阶段记录"未覆盖原因"。

如果文档 frontmatter 包含 `sharded: true`，先调用 `ae-doc-extract` 构建分片审查上下文；上下文至少保留 `rootDocument`、`shards`、`missingShards`、`duplicateIds`、`parentMismatch`、`globalRelations` 和 `diagnostics` 语义。

#### 意图发现

- 代码域：结合对话上下文编写 2-3 行意图摘要；检查 `design=` 参数或自动发现最近设计；`goals=` 参数内容作为审查目标注入子代理上下文
- 文档域：通过分析文档内容判断类型（requirements/design/test/general）；`goals=` 参数内容作为审查目标注入子代理上下文
- 通用域（`domain=general`）：分别为每种识别出的目标类型生成意图摘要；调度阶段按 `reviewScenes` 与 `targetTypes` 分别选择审查者，最终在汇总阶段统一聚合发现并按目标类型声明覆盖

#### design 契约检测

在范围确定后检测是否存在 design 契约，用于激活一致性审查者。

**检测规则：**
- 检查 `ae/designs/` 下是否存在与当前审查范围匹配的 design 目录
- 匹配条件：审查范围包含实现代码且 `ae/designs/` 下存在 design 目录（按设计路径、需求描述名或时间戳匹配）
- 审查范围本身就是 `ae/designs/**` 下的 design 文档时，`hasDesignContract=true`（审查 design 文档本身）

**flag 传入：** 当 `hasDesignContract=true` 时，在调用 `ae-review-contract` 工具或 `ae-domain-dispatch-prepare` 时传入 `has_design_contract=true`，激活以下一致性审查者：
- 任意实现代码 → `design-consistency-reviewer`（覆盖 database/security/architecture 等维度一致性）
- UI 实现代码 → `ui-consistency-reviewer`（激活条件：`hasDesignContract` 或 `hasUi`）
- 测试代码 → `test-coverage-reviewer`
- 审查 design 文档本身（`targetTypes` contains `design`）→ `design-consistency-reviewer`
- 存在 `api.md` + API 实现代码 → `api-contract-reviewer`（复用现有）

**内部调用约定：** 当本技能被其他技能以 `mode=headless` 调用时（技能内 review 闭环），不输出"下一步推荐技能"引导，仅返回审查结果（status/findings/summary）给调用方，由调用方自身负责下一步引导。

#### TaskIntent 输出

```typescript
{
  stage: 'entry',
  intent: '审查意图标签',
  domain: 'code' | 'document' | 'general',
  reviewScenes?: Array<'code' | 'requirements' | 'design' | 'prototype' | 'test-case' | 'config' | 'asset' | 'general-document'>,
  targetTypes?: Array<'code' | 'requirements' | 'design' | 'prototype' | 'test-case' | 'config' | 'asset' | 'document'>,
  constraints: ['排除规则', '模式约束'],
  rawInput: '原始参数',
  timestamp: 'ISO 时间戳'
}
```

### 阶段二：交互（Interact）

确认审查范围和参数，输出 `ConfirmedContext`。

- 交互模式：展示范围、排除规则和审查团队预览，让用户确认或修正
- 无头/自动修复模式：跳过用户确认，直接进入调度

可使用 `ae-review-contract` 或 `ae-domain-dispatch-prepare` 工具获取审查团队预览。`ae-domain-dispatch-prepare` 同时返回每个专精的 prompt 模板，供阶段三直接调度使用。

#### ConfirmedContext 输出

```typescript
{
  stage: 'interact',
  confirmedParams: { 审查范围、文件列表、模式等 },
  exclusions: ['排除的文件和目录'],
  boundaries: ['安全边界和操作限制'],
  timestamp: 'ISO 时间戳'
}
```

### 阶段三：调度（Dispatch）

采用代码化调度：编排层直接通过 Task 工具并行调用审查专精代理，不经过 @review-domain 中转。

**不可降级硬约束**（来自 `@review-domain` 域代理定义，编排层必须遵守）：

> 如果编排层已通过 `ae-domain-dispatch-prepare` 获得非空专精列表（`specialistCount > 0`），**不得调用 `@review-domain`**，必须走代码化调度路径（步骤 3.1 → 3.2 → 3.3）。

无论专精数量多少（即使 10 个以上），都必须直接 Task 调度全部专精。以下理由**均不构成**降级为 `@review-domain` 的条件：
- 上下文成本 / token 经济顾虑
- 根因已定位、审查动力下降
- "伪并行"或平台疑似不支持多工具调用（需真实证据）

仅当满足**全部**以下条件时，才允许降级为通过 Task 调用 `@review-domain`：
1. 平台**硬性技术不支持**在同一条消息中发出多个工具调用（需可验证证据，不是 LLM 主观判断）
2. 且 `specialistCount > 20`（逐个串行发出 20 个以上 Task 不现实）

不满足上述条件时，即使 `specialistCount` 高达 20，也必须逐个串行发出全部 Task 调用，**不得跳过任何一个专精代理**，**不得降级为调用域代理**。

#### 步骤 3.1：准备调度

调用 `ae-domain-dispatch-prepare` 工具，传入 domain、intent、constraints 以及顶层布尔标记（has_security、has_api 等）。工具返回：
- `tasks`：每个选中专精代理的 agent 名、prompt 模板和能力描述
- `strategy`：协调策略（review 域为 parallel + union）
- `specialistCount`：选中数量
- `consistencyWarnings`：domain/kind 一致性校验警告数组（空数组表示无冲突）；编排层应展示给用户并据此复核调度参数
- `dispatchGuard`：调度门禁结构，包含降级违规检测使用的 domainAgentName 和 specialistCount；编排层不得绕过此门禁调用域代理

如果 `specialistCount` 为 0，退化为通过 Task 调用 `@review-domain`，构造 `DomainCallRequest` 传入。这是**唯一**允许调用 `@review-domain` 的场景。

#### 步骤 3.2：并行调度专精代理

在同一轮回复中，使用 Task 工具并行调用 `tasks` 数组中的每个专精代理。

**并行调度硬约束**：你必须在同一轮回复中一次性发出所有 Task 工具调用，禁止等上一个 Task 返回后再发出下一个。

**平台并行行为说明**：OpenCode Task 工具支持在同一条消息中发出多个调用时并行执行。如果你的回复仅包含一个 Task 调用，它将串行执行——这是导致"伪并行"的常见原因。务必在同一条回复中包含所有 Task 调用。

**串行降级（非域代理降级）**：如果平台硬性不支持多工具调用（需可验证证据），退化为逐个串行发出全部 Task 调用。**不得因此跳过任何一个专精代理**，**不得因此降级为调用 `@review-domain`**（除非同时满足上方"专精 > 20"条件）。

每个 Task 调用的 prompt 必须包含：

1. 专精代理的 prompt 模板（来自 prepare 工具的 `tasks[].prompt`）
2. 代理 markdown 文件内容（通过 `@{reviewer_name}` 引用对应代理）
3. 审查上下文（变量替换后的 subagent-template 内容）：

代码域变量映射：

| 变量 | 值 |
|------|-----|
| `{domain}` | `code` |
| `{intent_summary}` | 阶段一输出 |
| `{file_list}` | 变更文件列表 |
| `{content}` | diff 内容或完整文件内容 |
| `{content_mode_label}` | 增量/全量/会话变更 |
| `{success_criteria}` | `goals:` 参数提供的审查目标文本，无 `goals:` 时为空 |
| `{run_id}` | 运行标识符 |

文档域变量映射：

| 变量 | 值 |
|------|-----|
| `{domain}` | `document` |
| `{document_type}` | requirements/design/test/general |
| `{document_path}` | 文档路径 |
| `{document_content}` | 完整文本或分片上下文 |
| `{success_criteria}` | `goals:` 参数提供的审查目标文本，无 `goals:` 时为空 |
| `{run_id}` | 运行标识符 |

通用域变量映射（`domain=general`）：

| 变量 | 值 |
|------|-----|
| `{domain}` | `general` |
| `{review_scene}` | 当前专精所属审查场景：code/requirements/design/prototype/test-case/config/asset/general-document |
| `{target_type}` | 当前专精负责的目标产出物类型 |
| `{intent_summary}` | 该目标类型对应的意图摘要 |
| `{file_list}` | 该目标类型对应的文件列表 |
| `{content}` | 该目标类型对应的内容片段（diff、源码或文档文本） |
| `{success_criteria}` | `goals:` 参数提供的审查目标文本，无 `goals:` 时为空 |
| `{run_id}` | 运行标识符 |

通用域调度规则：

- 同一目标类型可以有多个专一审查者并行；不同目标类型之间互相独立调度
- 每种识别出的 `targetTypes` 至少调度一个对应专一审查者；缺失映射时记录 `skipReasons`
- 不允许任何单一审查者跨目标类型综述发现，必须由编排层在阶段四聚合

**标志映射规则：** `goals:` 参数存在时，`ae-domain-dispatch-prepare` 的 `has_goal_alignment` 必须设为 `true`，以激活 goal-alignment-reviewer。

#### 步骤 3.3：聚合结果

所有专精代理返回后，调用 `ae-domain-dispatch-aggregate` 工具，传入：
- `strategy`：`union`（审查域固定）
- `results`：每个专精代理的执行结果（status、output、evidence）
- `dispatchedAgents`：实际调度的专精代理名称列表
- `skippedAgents`：选中但未调度的专精代理名称列表（通常为空）
- `skipReasons`：跳过原因
- `expectedSpecialistCount`：步骤 3.1 中 `ae-domain-dispatch-prepare` 返回的 `specialistCount`（用于降级违规检测）

工具返回 `DomainExecutionResult`，包含聚合后的发现、证据和 dispatchManifest。

**错误处理：** 如果某个专精代理返回 `failed` 或 `partial`，使用已完成的结果继续聚合，记录失败原因。

#### 调度一致性校验

接收 `DomainExecutionResult` 后，检查 `dispatchManifest` 和 `guardViolation`：

- 若返回结果包含 `guardViolation` 字段，**必须**在汇总阶段报告中以 `error` 级别标注降级违规，完整展示 `guardViolation.message`，并检查编排层是否错误降级
- 若 `dispatchManifest.dispatched` 数量少于 prepare 工具返回的 `specialistCount`，在汇总阶段报告不一致，列出被跳过的专精和跳过原因
- 若 `dispatchManifest.dispatched` 仅含域代理名（review-domain）但 `specialistCount > 0`，标记为"降级违规"，需审查编排层决策
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

接收 `DomainExecutionResult`，格式化为用户可读的审查报告，输出 `Deliverable`。

阅读 `references/synthesis-and-presentation.md` 了解综合流水线（校验、置信度门控、去重、共识提升、残余风险提升、解决分歧、autofix 提升、路由划分、排序）、展示和审查后流程。

通用域（`domain=general`）汇总规则：

- 调用 `ae-review-contract` 时传入 `targets=` 即可获得 `targetCoverage` 字段（每个目标类型对应 `{ status, reviewers[] }`）
- 按 `targetTypes` 分组展示发现，确保每种类型都有"已覆盖 / 未发现问题 / 未覆盖原因"的明确声明；`status='uncovered'` 时必须给出未覆盖原因
- 任何一个被调度的子审查 `status='failed'` 时整体审查必须为 `failed`；存在 `partial` 时整体为 `partial`，其余情况为 `success`
- 跨目标类型出现同标题发现时按聚合策略 `union` 去重，保留最高严重级别
- `source_review_output` 必须包含可解析的 `targetCoverage` 摘要，便于 `ae-review-proof` 解析

#### Deliverable 输出

```typescript
{
  stage: 'summary',
  description: '审查报告描述',
  validationResults: ['验证结果'],
  artifacts: ['审查报告路径'],
  targetCoverage?: Record<string, { status: 'covered' | 'uncovered', reviewers: string[], reason?: string }>,
  timestamp: 'ISO 时间戳'
}
```

---

## 包含的参考文件

### 范围检测

@./references/scope-detection.md

### 综合与展示

@./references/synthesis-and-presentation.md

### 审查输出模板

@./references/review-output-template.md

### 基准解析脚本

@./references/resolve-base.sh
