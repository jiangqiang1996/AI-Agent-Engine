---
name: ae:review
description: "通用审查入口。全并行发现 + 合并层修复架构：13 个代理全并行调度只找问题，合并层去重、冲突解决、因果分析后生成修复方案。支持代码、文档、设计、原型、配置、技能、命令、测试用例等单一类型及多类型混合范围。"
argument-hint: "[mode] [domain] [scenes=<list>] [targets=<list>] [from=<ref>] [full] [full=<path>] [session] [design=<path>] [goals=<text>] [路径...]"
---

# 通用审查（编排层）

审查回答**质量如何（HOW WELL）**——代码是否正确、安全、可维护；需求/设计/原型/测试用例/配置/资产是否一致、可行、可追溯、可验证。

此技能是 AE 通用核心流程的审查入口，采用**全并行发现 + 合并层修复**架构。

## 架构概览

1. **全并行架构**：代码、文档、设计三层所有代理全并行调度，无串行依赖
2. **审查只找问题**：所有代理只产出 findings，不做修复
3. **合并层修复流程**：所有代理并行找完问题 → 合并去重 + 冲突解决 + 因果分析（修复 A 解决 B）→ 生成修复方案 → 执行修复（仅 autofix 模式）
4. **无变更全量审查**（硬约束）：未显式指定范围参数且 `git status --porcelain` 为空且 `git diff --quiet` 通过时，**必须**审查除 `ae/prds/` 和 `ae/designs/` 以外的全量文件，**禁止**回退到最近提交 diff
5. **goals 自动推断**：三级优先级——用户显式传入 > 会话上下文分析 > 未提交变更推断
6. **document-reviewer 支持任意文本类型**：不限于 .md，包括 .txt/.rst/.json/.yaml/.xml 等所有非代码文本
7. **设计文件和需求文件双重审查**：同时被 document-reviewer（文档属性）和维度专属代理（维度内容）审查
8. **design-integrity-reviewer 全并行**：独立读取全部设计文件做跨维度检查，不依赖其他代理输出

## 13 个代理清单

| 代理 | 层 | 激活条件 |
|------|---|---------|
| ocr-reviewer | 代码 | 代码变更 OR 无变更全量 |
| document-reviewer | 文档 | 任何文本文件变更 |
| architecture-design-reviewer | 设计维度 | `ae/designs/` 含 architecture 产物 |
| api-design-reviewer | 设计维度 | `ae/designs/` 含 api 产物 |
| database-design-reviewer | 设计维度 | `ae/designs/` 含 database 产物 |
| ui-ux-design-reviewer | 设计维度 | `ae/designs/` 含 ui-ux/design-spec 产物 |
| test-cases-design-reviewer | 设计维度 | `ae/designs/` 含 test-cases 产物 |
| security-design-reviewer | 设计维度 | `ae/designs/` 含 security 产物 |
| observability-design-reviewer | 设计维度 | `ae/designs/` 含 observability 产物 |
| non-functional-design-reviewer | 设计维度 | `ae/designs/` 含 non-functional 产物 |
| design-integrity-reviewer | 完整性 | `ae/designs/` 含 2+ 维度产物 |
| traceability-reviewer | 跨域 | 多类型混合范围 |
| goal-alignment-reviewer | 跨域 | goals 参数存在 OR 会话上下文可提取目标 OR 未提交变更可推断目标 |

## 核心原则

1. **范围先行，审查在后** — 调度任何代理前必须完成范围确定、排除规则应用和用户确认
2. **只读发现** — 所有 13 个代理只产出 findings，不做任何修复；修复统一由合并层在汇总阶段执行
3. **证据必须基于实际内容** — 每条 finding 至少包含一项来自实际代码/文档的证据；无证据的泛泛建议必须抑制
4. **排除规则不可绕过** — 敏感文件和 `.opencode/` 始终排除；需求/设计文档默认排除，仅在满足"明确指定"条件时纳入
5. **全并行无串行依赖** — 所有激活代理在同一轮回复中一次性发出 Task 调用；design-integrity-reviewer 独立读取全部设计文件，不依赖其他代理输出
6. **合并层负责修复决策** — 合并层执行去重、冲突解决、因果分析（遍历 causes/caused_by 依赖图），生成修复方案；仅 autofix 模式执行修复
7. **auto vs present 判断标准是可推断确定性** — 能由已知内容推断出唯一最小修复 → auto；需要选择目标、范围、取舍或新增立场 → gated/manual
8. **域协同而非互斥** — `domain` 描述审查对象域：code/document/general；general 表示同一次审查覆盖多种产出物类型，按目标类型分别选择代理并合并发现
9. **图谱新鲜度门控** — 使用 `ae:graph-query` 确定范围或影响面时必须读取 `freshness`；非 fresh 时图谱结果只辅助定位，不作无影响、无依赖或完整覆盖结论证据

## 模式规则

| 模式 | 交互 | 自动修复 | 展示 | 产物 |
|------|------|---------|------|------|
| **交互**（默认） | 询问策略决策 | 仅 `auto` | 完整报告 + 选项 | 写入 |
| **自动修复** | 无 | 仅 `auto` | 仅结果摘要 | 写入 |
| **只读** | 无 | 无 | 完整报告 | 无 |
| **无头** | 无 | `auto` + 推荐修复 | 结构化文本 | 写入，返回"审查完成" |

## 排除规则

**始终排除（任何情况下不可覆盖）：**
- 敏感文件：`.env`、`.env.*`（保留 `.env.example`、`.env.template`）——文件收集阶段即移除
- `.opencode/` 目录下的所有文件
- 受保护产物：`ae/reviews/*`、`ae/solutions/*`

**全域默认排除：**
- `ae/prds/` 下的文件
- `ae/designs/` 下的文件

**"明确指定"条件——满足任一则纳入：**
1. 用户传入的文件路径指向这些目录下的文件
2. 对话中明确提到"审查需求文档"或"审查设计文档"等语义等价表达
3. `domain=document` 模式下确定性搜索机制找到了文档
4. `domain=general` 模式下用户提供的混合范围中显式包含 `ae/prds/` 或 `ae/designs/` 路径

## Finding Schema

每条 finding 包含 causes/caused_by 字段用于因果分析：

```json
{
  "reviewer": "string",
  "findings": [{
    "title": "简短问题标题",
    "severity": "P0|P1|P2|P3",
    "domain": "code|document",
    "location": { "file": "...", "line"|"section": "..." },
    "why_it_matters": "影响和故障模式描述",
    "finding_type": "error|omission|pre-existing",
    "evidence": ["基于实际内容的证据"],
    "confidence": 0.0-1.0,
    "causes": ["finding_id_1"],
    "caused_by": ["finding_id_2"],
    "suggested_fix": "具体修复方案"
  }]
}
```

- `causes`：本 finding 可能导致的其他 finding ID 列表
- `caused_by`：导致本 finding 的其他 finding ID 列表
- 合并层通过遍历 causes/caused_by 依赖图执行因果分析，识别"修复 A 即解决 B"的链式关系

## 四阶段编排协议

### 阶段一：入口（Entry）

解析参数，确定审查域和范围，推断 goals，输出 `TaskIntent`。

#### 参数解析

解析 `$ARGUMENTS` 中的可选标记。以 `mode=` 或 `domain=` 开头的标记是标志，不是 ref。

参数解析规则（三级策略）：
1. 显式命名：`key=value`、`key:value`、`--key=value` 直接绑定，优先级最高
2. 值特征推断：按值的模式自动匹配参数类型

   | 值模式 | 推断为 |
   |--------|--------|
   | autofix / report-only / headless | mode |
   | code / document / general | domain |

3. 顺序兜底：仅 mode 和 domain 参与推断，其余参数必须显式命名

| 标记 | 效果 |
|------|------|
| `domain=code` | 强制代码域审查 |
| `domain=document` | 强制文档域审查 |
| `domain=general` | 强制混合范围审查；省略时由编排层自动识别 |
| `scenes=<list>` | 显式覆盖审查场景，逗号分隔 |
| `targets=<list>` | 显式覆盖目标产出物类型，逗号分隔 |
| `mode=autofix` | 自动修复模式 |
| `mode=report-only` | 只读模式 |
| `mode=headless` | 无头模式 |
| `from=<ref>` | 使用 Git diff 确定范围 |
| `recent=<N>` | 审查最近 N 次 Git 提交 |
| `full` | 审查项目中所有文件 |
| `full=<path>` | 审查指定路径下的所有文件 |
| `session` | 审查本次会话中变更的文件 |
| `design=<path>` | 加载设计用于需求验证 |
| `goals=<text>` | 传入审查目标（成功条件列表） |

**冲突检测：** `from=` / `recent=` / `full` / `full=<path>` / `session` 互斥，同时指定时停止并报错。

#### 范围确定

阅读 `references/scope-detection.md` 获取完整的 Git 范围检测流程。

**无变更全量审查**（硬约束）：当未显式指定任何范围参数（`from=` / `recent=` / `full` / `full=<path>` / `session` 均不存在）且 `git status --porcelain` 输出为空且 `git diff --quiet` 通过时，**必须**审查除 `ae/prds/` 和 `ae/designs/` 以外的全量文件。**禁止**回退到最近提交 diff、使用 `git log` 缩窄范围或审查最近 N 次提交。用户可通过显式范围参数覆盖。详见 `references/scope-detection.md` 优先级 0。

##### 自动域识别

未显式指定 `domain` 时，按以下顺序识别：

1. 路径仅含 `ae/prds/`、`ae/designs/` 或其他文档 → `domain=document`
2. 范围仅含代码、配置、脚本或基础设施文件 → `domain=code`
3. 范围既含代码/配置/资产，又含需求、设计、原型或测试用例文档 → `domain=general`
4. 自动识别失败时回退到 `domain=code`，交互模式下提示用户确认

代码域范围确定：
1. **Git 差异模式**（`from=` 或 `recent=` 或自动检测）→ 检测变更文件，展示让用户确认
2. **全量扫描模式**（`full` 或 `full=<path>`）→ 扫描项目文件，应用排除规则
3. **会话变更模式**（`session`）→ 识别会话变更文件
4. **自动检测**（无范围参数时）→ 先检测 Git 未提交变更（`git status --porcelain` + `git diff --quiet`）；两者均通过时**立即触发无变更全量审查**（见上方硬约束段落），不得回退到最近提交 diff；有未提交变更时按 `references/scope-detection.md` 优先级 1-3 检测

文档域范围确定：
- 指定文档路径 → 使用指定路径
- 未指定路径 + 交互模式 → 搜索 `ae/prds/` 和 `ae/designs/` 中最近修改的文件
- 未指定路径 + 无头模式 → 输出错误，立即终止

通用域范围确定：
- 必须显式提供路径或范围标记，不进行无路径盲扫
- 路径列表按文件特征分桶为不同 targetTypes 与 reviewScenes
- 用户通过 `scenes=` / `targets=` 显式覆盖时优先使用

如果文档 frontmatter 包含 `sharded: true`，先调用 `ae-doc-extract` 构建分片审查上下文。

#### goals 自动推断

三级优先级：

1. **用户显式传入**：`goals=<text>` 参数存在时直接使用，优先级最高
2. **会话上下文分析**：无显式 goals 时，分析当前会话上下文提取用户陈述的目标和成功条件
3. **未提交变更推断**：无会话上下文目标时，从未提交变更的 commit message、diff 内容和变更文件模式推断审查目标

推断结果注入 goal-alignment-reviewer 上下文作为 `{success_criteria}`。三级均无结果时不激活 goal-alignment-reviewer。

#### 变更分析

对变更范围执行分类分析，按文件类型拆分为代码与配置组和文档组，分别产出目标摘要和文件列表。文件分类用于产出针对性的审查目标摘要，**不限制子代理的可读范围**——所有代理均可读取项目中的任何文件做交叉参照。

| 分组 | 包含文件 | 产出变量 |
|------|---------|---------|
| **代码与配置** | 代码、配置文件和测试文件 | `{code_intent}` + `{code_files}` |
| **文档** | `.md`/`.txt`/`.rst`/`.json`/`.yaml`/`.xml` 等所有非代码文本文件 | `{doc_intent}` + `{doc_files}` |

document-reviewer 支持任意文本类型，不限于 .md。

#### design 契约检测

范围确定后检测是否存在 design 契约：

- 检查 `ae/designs/` 下是否存在与当前审查范围匹配的 design 目录
- 审查范围本身就是 `ae/designs/**` 下的 design 文档时，`hasDesignContract=true`
- `hasDesignContract=true` 时传入 `has_design_contract=true`，激活对应维度专属代理

**设计文件和需求文件双重审查**：当 `ae/designs/` 或 `ae/prds/` 下的文件纳入审查范围时，这些文件同时被 document-reviewer（审查文档属性：格式、结构、完整性）和维度专属代理（审查维度内容：architecture/api/database 等）审查。两类代理全并行执行，互不依赖。

#### TaskIntent 输出

```typescript
{
  stage: 'entry',
  intent: '审查意图标签',
  domain: 'code' | 'document' | 'general',
  reviewScenes?: string[],
  targetTypes?: string[],
  goals?: string[],
  constraints: ['排除规则', '模式约束'],
  rawInput: '原始参数',
  timestamp: 'ISO 时间戳'
}
```

### 阶段二：交互（Interact）

确认审查范围和参数，输出 `ConfirmedContext`。

- 交互模式：展示范围、排除规则和审查团队预览（13 个代理中激活的子集），让用户确认或修正
- 无头/自动修复模式：跳过用户确认，直接进入调度

可使用 `ae-review-contract` 或 `ae-domain-dispatch-prepare` 工具获取审查团队预览。`ae-domain-dispatch-prepare` 同时返回每个专精的 prompt 模板，供阶段三直接调度使用。

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

**全并行调度**：所有激活代理在同一轮回复中一次性发出 Task 调用，无串行依赖。

采用代码化调度路径：`ae-domain-dispatch-prepare` → 并行 Task → `ae-domain-dispatch-aggregate`。

**不可降级硬约束**：如果编排层已通过 `ae-domain-dispatch-prepare` 获得非空专精列表（`specialistCount > 0`），不得调用 `@review-domain`，必须走代码化调度路径。

仅当满足**全部**以下条件时，才允许降级为通过 Task 调用 `@review-domain`：
1. 平台硬性技术不支持在同一条消息中发出多个工具调用（需可验证证据）
2. 且 `specialistCount > 20`

#### 步骤 3.1：准备调度

调用 `ae-domain-dispatch-prepare`，传入 domain、intent、constraints 以及顶层布尔标记。工具返回 tasks 数组、strategy、specialistCount 和 dispatchGuard。

如果 `specialistCount` 为 0，退化为通过 Task 调用 `@review-domain`。这是唯一允许调用 `@review-domain` 的场景。

#### 步骤 3.2：全并行调度

在同一轮回复中，使用 Task 工具并行调用 `tasks` 数组中的每个代理。

**并行调度硬约束**：必须在同一轮回复中一次性发出所有 Task 调用，禁止等上一个 Task 返回后再发出下一个。

每个代理只产出 findings，不做修复。每个 Task 调用的 prompt 必须包含：

1. 代理的 prompt 模板（来自 prepare 工具的 `tasks[].prompt`）
2. 代理 markdown 文件内容（通过 `@{reviewer_name}` 引用）
3. 审查上下文（变量替换后的内容）

变量映射按代理职责注入：

- **ocr-reviewer**：`{code_intent}` + `{code_files}`（含测试文件）
- **document-reviewer**：`{doc_intent}` + `{doc_files}`（支持任意文本类型）
- **设计维度代理**（architecture/api/database/ui-ux/test-cases/security/observability/non-functional）：`{doc_intent}` + `{doc_files}` + 对应维度产物路径
- **design-integrity-reviewer**：全部设计文件路径（独立读取，不依赖其他代理输出）
- **traceability-reviewer**：`{full_intent}` + `{full_files}`（多类型混合范围）
- **goal-alignment-reviewer**：`{full_intent}` + `{full_files}` + `{success_criteria}`

所有代理均可交叉读取代码和文档，确保文档与代码统一。

#### 步骤 3.3：聚合结果

所有代理返回后，调用 `ae-domain-dispatch-aggregate`，传入：
- `strategy`：`union`
- `results`：每个代理的执行结果
- `dispatchedAgents`：实际调度的代理名称列表
- `expectedSpecialistCount`：prepare 工具返回的 specialistCount

工具返回 `DomainExecutionResult`，包含聚合后的发现和 dispatchManifest。

#### 调度一致性校验

接收结果后检查 `dispatchManifest` 和 `guardViolation`：
- `guardViolation` 存在时以 error 级别标注降级违规
- dispatched 数量少于 specialistCount 时报告不一致
- 校验为报告性质，不阻断后续流程

```typescript
{
  stage: 'dispatch',
  domainResults: [DomainExecutionResult],
  timestamp: 'ISO 时间戳'
}
```

### 阶段四：汇总（Summary）

接收 `DomainExecutionResult`，执行合并层修复流程，输出 `Deliverable`。

#### 综合流水线（5 步）

**步骤 1：校验**

校验所有 findings 的完整性：每条 finding 必须有 title、severity、location、evidence。缺失必填字段的 finding 标记为 invalid 并过滤。

**步骤 2：置信度门控**

按 confidence 值过滤低置信度发现。代码域默认阈值 0.60，文档域默认阈值 0.50，低于阈值的 finding 标记为 `low_confidence` 并降级展示。交互模式下展示给用户确认是否保留。

**步骤 3：合并去重 + 冲突解决 + 因果分析（合并层）**

这是合并层核心步骤：

1. **合并去重**：跨代理同标题/同位置的 finding 合并，保留最高 severity，合并 evidence
2. **冲突解决**：不同代理对同一位置给出矛盾结论时，按代理权威性和证据充分性取舍，记录冲突解决过程
3. **因果分析**：遍历所有 findings 的 `causes` 和 `caused_by` 字段构建依赖图，识别链式关系——"修复 A 即解决 B"。标记根因 finding（无 caused_by 的 finding）和派生 finding
4. **生成修复方案**：基于因果分析结果，按根因优先级生成修复方案。每个修复方案包含：目标 finding、修复动作（来自 suggested_fix）、预期解决的派生 finding 列表

**步骤 4：排序**

按 severity（P0 > P1 > P2 > P3）→ confidence 降序 → 根因优先（caused_by 为空的 finding 排前）排序。

**步骤 5：高风险零发现对抗**

如果所有 findings 均为 P3/low 且审查范围包含高风险变更（安全边界、数据迁移、API 契约变更、架构决策），触发对抗性复查：重新审视变更范围，检查是否存在被遗漏的高风险问题。对抗结果追加到 findings 列表。

#### 自动修复（仅 autofix 模式）

合并层生成修复方案后，仅在 autofix 模式下执行修复：

1. 按修复方案列表逐个执行 `suggested_fix`
2. 每个修复执行后验证是否确实解决了目标 finding 及其派生 finding
3. 修复失败的方案记录错误原因，不回滚已成功的修复
4. 修复结果写入审查报告

交互模式下展示修复方案让用户选择执行；只读和无头模式不执行修复（无头模式按推荐方向修复所有带 suggested_fix 且不触发安全边界的发现）。

#### 写入审查证明

调用 `ae-review-proof` 工具写入结构化审查证明：
- `review_run_id`：运行标识符
- `review_status`：passed/failed
- `findings`：合并后的发现列表
- `source_review_output`：包含可解析的 status、worktree、branch、HEAD 和 statusSummary

#### 更新状态文件

更新审查状态文件，记录本次审查的运行 ID、时间戳、审查范围、代理列表、发现数量和修复结果。

通用域汇总规则：
- 按 targetTypes 分组展示发现，确保每种类型都有"已覆盖 / 未发现问题 / 未覆盖原因"的明确声明
- 任何一个被调度的子审查 status='failed' 时整体审查为 failed
- 跨目标类型同标题发现按 union 策略去重，保留最高 severity
- `source_review_output` 必须包含可解析的 targetCoverage 摘要

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
