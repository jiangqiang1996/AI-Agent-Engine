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
3. **合并层修复流程**：所有代理并行找完问题 → 合并去重 + 冲突解决 + 因果分析 → 生成修复方案 → 执行修复（仅 autofix 模式）
4. **无变更全量审查**（硬约束）：未显式指定范围参数且 `git status --porcelain` 为空且 `git diff --quiet` 通过时，**必须**审查除 `ae/prds/` 和 `ae/designs/` 以外的全量文件，**禁止**回退到最近提交 diff
5. **goals 自动推断**：三级优先级——用户显式传入 > 会话上下文分析 > 未提交变更推断
6. **document-reviewer 支持任意文本类型**：不限于 .md，包括 .txt/.rst/.json/.yaml/.xml 等所有非代码文本
7. **设计文件和需求文件双重审查**：同时被 document-reviewer（文档属性）和维度专属代理（维度内容）审查
8. **design-integrity-reviewer 全并行**：独立读取全部设计文件做跨维度检查，不依赖其他代理输出

## 核心原则

1. **范围先行，审查在后** — 调度任何代理前必须完成范围确定、排除规则应用和用户确认
2. **只读发现** — 所有代理只产出 findings，不做任何修复；修复统一由合并层在汇总阶段执行
3. **证据必须基于实际内容** — 每条 finding 至少包含一项来自实际代码/文档的证据；无证据的泛泛建议必须抑制
4. **排除规则不可绕过** — 敏感文件和 `.opencode/` 始终排除；需求/设计文档默认排除，仅在满足"明确指定"条件时纳入
5. **全并行无串行依赖** — 所有激活代理在同一轮回复中一次性发出 Task 调用
6. **auto vs present 判断标准是可推断确定性** — 能由已知内容推断出唯一最小修复 → auto；需要选择目标、范围、取舍或新增立场 → gated/manual
7. **域协同而非互斥** — `domain` 描述审查对象域：code/document/general；general 表示同一次审查覆盖多种产出物类型，按目标类型分别选择代理并合并发现
8. **图谱新鲜度门控** — 使用 `ae:graph-query` 确定范围或影响面时必须读取 `freshness`；非 fresh 时图谱结果只辅助定位，不作无影响、无依赖或完整覆盖结论证据

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

#### design 契约检测

范围确定后检测是否存在 design 契约：

- 检查 `ae/designs/` 下是否存在与当前审查范围匹配的 design 目录
- 审查范围本身就是 `ae/designs/**` 下的 design 文档时，`hasDesignContract=true`
- `hasDesignContract=true` 时传入 `has_design_contract=true`，激活对应维度专属代理

**设计文件和需求文件双重审查**：当 `ae/designs/` 或 `ae/prds/` 下的文件纳入审查范围时，这些文件同时被 document-reviewer（审查文档属性：格式、结构、完整性）和维度专属代理（审查维度内容：architecture/api/database 等）审查。两类代理全并行执行，互不依赖。

#### 阶段一出口检查清单（产出式门禁）

进入阶段二前，**必须**显式输出以下判定证据。缺少任何一项则禁止继续：

1. **范围判定证据**：列出确定审查范围的方式（用户显式指定 / 无变更全量 / Git diff / 会话变更 / 全量扫描），并附 `git status --porcelain` 和 `git diff --quiet` 的实际输出结果
2. **域判定证据**：列出范围内代码文件数和文档文件数，标注使用的自动域识别规则条目（1-4），输出最终 domain 值
3. **goals 判定证据**：标注 goals 来源（用户显式 / 会话上下文 / 未提交变更推断 / 无），输出推断结果摘要
4. **排除规则应用证据**：列出被排除的文件/目录及排除理由

### 阶段二：交互（Interact）

确认审查范围和参数，输出 `ConfirmedContext`。

- 交互模式：展示范围、排除规则和审查团队预览，让用户确认或修正
- 无头/自动修复模式：跳过用户确认，直接进入调度

调用 `ae-domain-dispatch-prepare` 工具获取审查团队预览和 prompt 模板。

### 阶段三：调度（Dispatch）

**全并行调度**：所有激活代理在同一轮回复中一次性发出 Task 调用，无串行依赖。

采用代码化调度路径：`ae-domain-dispatch-prepare` → 并行 Task → `ae-domain-dispatch-aggregate`。

**不可降级硬约束**：如果编排层已通过 `ae-domain-dispatch-prepare` 获得非空专精列表（`specialistCount > 0`），不得调用 `@review-domain`，必须走代码化调度路径。

仅当满足**全部**以下条件时，才允许降级为通过 Task 调用 `@review-domain`：
1. 平台硬性技术不支持在同一条消息中发出多个工具调用（需可验证证据）
2. 且 `specialistCount > 20`

**并行调度硬约束**：必须在同一轮回复中一次性发出所有 Task 调用，禁止等上一个 Task 返回后再发出下一个。

每个代理只产出 findings，不做修复。所有代理均可交叉读取代码和文档，确保文档与代码统一。

如果 `specialistCount` 为 0，退化为通过 Task 调用 `@review-domain`。这是唯一允许调用 `@review-domain` 的场景。

所有代理返回后，调用 `ae-domain-dispatch-aggregate` 聚合结果。检查 `dispatchManifest` 和 `guardViolation`：存在违规时以 error 级别标注。

#### 阶段三出口检查清单（产出式门禁）

进入阶段四前，**必须**显式输出以下调度证据。缺少任何一项则禁止继续：

1. **调度完整性证据**：列出 prepare 工具返回的 specialistCount 和实际发出的 Task 调用数，两者必须相等
2. **并行性证据**：确认所有 Task 调用在同一轮回复中发出，未出现串行等待
3. **聚合结果证据**：列出 `ae-domain-dispatch-aggregate` 返回的 findings 总数和 guardViolation 状态

### 阶段四：汇总（Summary）

接收聚合后的 `DomainExecutionResult`，执行合并层修复流程，输出 `Deliverable`。

合并层由 `ae-domain-dispatch-aggregate` 工具固化执行：校验 findings 完整性 → 置信度门控 → 合并去重 + 冲突解决 + 因果分析 → 排序 → 高风险零发现对抗复查。详细步骤和阈值见 `references/synthesis-and-presentation.md`。

#### 自动修复（仅 autofix 模式）

合并层生成修复方案后，仅在 autofix 模式下执行修复：

1. 按修复方案列表逐个执行 `suggested_fix`
2. 每个修复执行后验证是否确实解决了目标 finding 及其派生 finding
3. 修复失败的方案记录错误原因，不回滚已成功的修复
4. 修复结果写入审查报告

交互模式下展示修复方案让用户选择执行；只读和无头模式不执行修复（无头模式按推荐方向修复所有带 suggested_fix 且不触发安全边界的发现）。

#### 写入审查证明与状态

调用 `ae-review-proof` 工具写入结构化审查证明。更新审查状态文件，记录本次审查的运行 ID、时间戳、审查范围、代理列表、发现数量和修复结果。

通用域汇总规则：
- 按 targetTypes 分组展示发现，确保每种类型都有"已覆盖 / 未发现问题 / 未覆盖原因"的明确声明
- 任何一个被调度的子审查 status='failed' 时整体审查为 failed
- 跨目标类型同标题发现按 union 策略去重，保留最高 severity

---

## 包含的参考文件

### 范围检测

@./references/scope-detection.md

### 综合与展示

@./references/synthesis-and-presentation.md

### 审查输出模板

@./references/review-output-template.md

### 代理清单与路由

@./references/persona-catalog.md

@./references/file-routing-table.md

### Finding Schema 与子代理模板

@./references/findings-schema.json

@./references/subagent-template.md

### 基准解析脚本

@./references/resolve-base.sh
