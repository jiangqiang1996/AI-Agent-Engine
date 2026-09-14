---
name: ae-work
description: "实施阶段技能：执行设计文档、交接文件或明确任务，产出代码、文档、测试用例或其他交付物。触发词：实施、执行设计、开发、worktree 继续、继续执行交接文件、隔离工作区实施、目标驱动迭代执行。适用于：按设计并行编排开发实施、中小任务直接实施、隔离工作区继续执行、无人值守迭代闭环；不适用于：需求梳理（用 ae-prd）、维度设计（用 ae-design）、纯代码审查（用 ae-review）、纯测试生成（用 ae-test）。"
---

# 工作执行技能（编排层）

按设计或明确任务高效实施，采用四阶段编排协议，编排层直接并行派发开发 persona 子代理。

## 简介

本技能接收一份设计文档、交接文件或一段描述工作的提示词，按四阶段协议（TaskIntent → ConfirmedContext → DispatchResults → Deliverable）系统化执行。核心目标是**交付可验证结果**；结果可以是代码、文档、测试用例、设计、报告或其他任务产物。

`references/` 下的子流程文件只是内部执行说明，不是独立技能：

1. `references/execution-workflow.md`：执行前验证、design 契约核验准备、串行/并行分组规则、失败处理和汇总职责。
2. `references/dev-routing.md`：4 域开发路由表与 persona prompt 构建要素。
3. `references/verification.md`：真实变更核验、design 契约对照、对齐校验和统一验证。
4. `references/shipping-gate.md`：交付门禁清单、审查证据字段表和最终交付模板。
5. `references/handoff-template.md`：隔离工作区交接文件的可选模板。

## 硬性门禁

以下规则不得只依赖 reference 文件记忆，执行中必须持续满足：

- 修改任何项目文件之前，必须完成输入分流、Git 状态检查和工作区决策。
- 必须实际运行并记录 `git status --short`、`git branch --show-current`、`git log --oneline -1`。
- 单独使用本技能且未显式指定执行位置时，必须按任务大小向用户询问：小任务推荐当前工作区，大任务推荐派 omp task 子代理（`isolated: true`）在隔离工作区实施后 apply/merge 回主工作区。不得自行默认。
- 输入为规范交接文件（`ae/handoffs/*-worktree-handoff.md`）时，必须把交接文件作为唯一必需输入继续执行；不得按裸提示词处理，不得再次创建隔离工作区。交接文件 `design_path` 与 `task_brief` 至少存在一个，均缺失时硬阻断；`design_path` 指向的文件不存在且无 `task_brief` 时停止执行，提示用户确认路径，禁止扫描 `ae/designs/` 寻找替代设计。交接文件引用的需求/设计产物缺失时只记录可选上下文缺失，不阻断。存在性判断必须使用文件系统视角（`ae/handoffs` 可能被 `.gitignore` 忽略），不得依赖 `git status`、`git ls-files` 等 Git 视角。
- **worktree 继续语义**：用户只说"继续执行/worktree 继续"而未给出交接文件路径时，先在当前工作空间用文件系统目录读取复核 `ae/handoffs/` 下匹配 `*-worktree-handoff.md` 的文件（glob 只作辅助线索）；找到唯一交接文件后把它作为唯一任务输入走本技能同一流程；找到多个时列出候选并询问用户；目录不存在或为空时提示用户确认是否在目标工作空间中，并停止。
- 执行后必须由编排层独立运行 Git diff/status 核验真实修改文件，不得只依赖子代理自报。
- 正式交付前必须运行相关验证、完成代码审查或明确无法审查原因，并记录 Git 操作状态。审查证据按 `references/shipping-gate.md` 读取 `ae/reviews/*/metadata.json`，其 `worktree`、`branch`、`head`、`statusSummary` 字段必须与当前 Git 指纹逐项一致，`reviewStatus` 必须为 `passed` 且 `hasBlockingFinding` 为 `false`；不一致视为陈旧证据，不得放行交付。
- 执行 `git add`、`git commit`、创建分支或 `git worktree add` 等任何 Git 写操作前，必须取得用户对目标仓库、目标分支、工作区、完整命令参数和授权来源的明确授权；未授权时只保留工作区变更并汇报建议提交点。
- **存量项目感知**：除非用户明确声明不参考当前项目（如"不读取项目文件"、"全新项目"、"从零开始"、"greenfield"等表述），实施前必须主动感知当前项目技术栈和结构：通过读取依赖清单文件（`package.json`/`go.mod`/`pom.xml`/`Cargo.toml`/`pyproject.toml` 等）识别已有技术栈，通过 glob 扫描源码目录识别已有结构，通过读取项目配置文件（如 `.eslintrc`/`tsconfig.json` 等）和少量入口源码文件识别编码约定。扫描时排除敏感目录和文件（如 `.env*`、`secrets/`、`credentials/`、`*.key`、`*.pem`、`.ssh/`、`.aws/`、`.gnupg/`、`.npmrc`、`.netrc`）。感知在阶段一入口完成后、阶段二交互前执行，感知结果作为调度上下文传入阶段三子代理。有设计时遵循设计契约中指定的技术栈和结构，无设计时遵循感知到的项目已有技术栈、目录结构和编码风格。两种情况下均不得自行更换技术栈或偏离现有约定。用户明确声明不参考时跳过感知，记录豁免原因。

## 四阶段编排协议

### 阶段一：入口（Entry）

解析输入，确定工作意图和约束，输出 `TaskIntent`。

**输入分流**：

| 输入类型 | 识别 | 处理 |
|----------|------|------|
| 设计文档 | 路径指向 `ae/designs/` 下的设计文件或设计目录 | 完整阅读设计，提取实现单元、文件范围和验证命令，识别可并行单元 |
| 交接文件 | `ae/handoffs/*-worktree-handoff.md` 或路径指向规范交接文件 | 解析 frontmatter、`## A→B Startup Proof`、`resume_entrypoint`、`## Migrated Artifacts`、`## Execution Baseline` 为结构化真源；校验当前目录与 `git rev-parse --show-toplevel` 与目标工作区一致；不重新审查、深化或转换需求/设计 |
| 裸提示词 | 工作描述文本 | 先只读定位：识别可能变更的文件、查找测试文件、记录本地模式；只允许读取和搜索，不允许先改文件 |
| 迭代目标 | "迭代执行/无人值守完成 X" 等目标描述 | 进入「迭代执行模式」章节 |

裸提示词任务大小路由：

| 任务大小 | 信号 | 操作 |
|----------|------|------|
| 小任务 | 明确 bug、单点故障、范围可控、预估影响文件不超过 2 个 | 记录定位证据、升级判断和无需设计原因后继续；询问执行位置时推荐当前工作区 |
| 大任务 | 多步骤协作、跨模块、架构决策、需求模糊，或预估影响 3 个及以上文件 | 构建任务列表，标注依赖、文件范围和验证要求；询问执行位置时推荐隔离工作区 |

出现以下任一信号时，不再继续轻路径，建议先走 `/skill:ae-design`：无法稳定列出影响文件范围；涉及认证、授权、数据迁移、外部 API 或 API 契约；引入新抽象或修改公共配置；需要新增流程或用户可见行为决策；需求在定位后仍不清晰。

**Git 状态检查与工作区决策**：按 `references/execution-workflow.md` 执行前验证清单完成 Git 状态检查、风险评估和工作区决策。隔离工作区通过派 omp task 子代理（`isolated: true`）实现：子代理在隔离工作区完成实施，产物经 apply/merge 回到主工作区，编排层在合并后统一核验。用户明确要求持久独立分支工作区且授权 `git worktree add` 具体参数时，才使用 Git worktree；此时可交接任务给新工作空间中的会话，交接文件按 `references/handoff-template.md` 模板生成（可选产物）。

**任务分析**：从设计或定位结果构建待办单元（`todo_units`），标注依赖、文件范围、验证命令；按 `references/execution-workflow.md` 的分组规则判定串行/并行，输出 `execution_strategy`（inline / serial / parallel）。简单任务也必须生成最小单任务 `todo_units`。使用 omp todo 跟踪任务状态。

#### TaskIntent 输出

```typescript
{
  stage: 'entry',
  intent: '工作意图标签（如：实现功能 X、修复 Bug Y、重构模块 Z）',
  domain: 'development',
  constraints: ['排除规则', '工作区约束', '验证要求'],
  rawInput: '原始输入',
  timestamp: 'ISO 时间戳'
}
```

### 阶段二：交互（Interact）

确认工作范围和执行策略，输出 `ConfirmedContext`。

- 交互模式：展示任务分解、执行策略和预览，让用户确认或修正。
- 迭代执行模式：成功条件确认后锁死，循环体内禁止再向用户提问。
- 交接文件输入：按交接文件中的 `resume_entrypoint` 继续，跳过重新确认。

#### ConfirmedContext 输出

```typescript
{
  stage: 'interact',
  confirmedParams: { 执行策略、待办单元、并行分组 },
  exclusions: ['排除的文件和范围'],
  boundaries: ['安全边界和操作限制'],
  timestamp: 'ISO 时间戳'
}
```

### 阶段三：调度（Dispatch）

按 `references/dev-routing.md` 的 4 域路由表确定本次任务命中的开发 persona：根据顶层布尔标记（`has_ui`、`has_security`、`has_api`，均未命中时默认后端）路由到 frontend-dev、backend-dev、frontend-fix persona 及 security 关注点，由编排层**自行构建 persona prompt**（角色行 + 关注点清单 + 任务上下文），一轮并行派发通用 omp task 子代理。不注册 developer 代理，不使用任何选择脚本。

**调度硬约束**：

- 无论命中多少个 persona，都必须在**同一轮**中一次性发出全部 task 派发，禁止等上一个返回后再发下一个（串行伪并行是常见错误）；平台确实不支持多派发时（需可验证证据）才退化为逐个串行，且不得跳过任何一个 persona。
- 每个 task 派发的 prompt 必须包含：按 `references/dev-routing.md` 构建的 persona prompt、任务描述（待办单元、允许文件、禁止文件、实现要求）、已确认的参数和约束、设计文档相关内容（如有）、验证要求、存量项目感知结果（技术栈/可复用资产/实现约束）。
- 每个 task 派发必须携带 `outputSchema` 收敛结构化结果：

```json
{
  "type": "object",
  "properties": {
    "status": { "enum": ["completed", "partial", "failed"] },
    "output": { "type": "string", "description": "变更摘要：文件路径列表 + 每个文件的变更说明" },
    "evidence": { "type": "string", "description": "验证证据：执行的验证命令、结果和阻塞问题（无则写'无'）" }
  },
  "required": ["status", "output", "evidence"]
}
```

- 需要与主工作区隔离的实施（大任务、脏工作区、用户要求）使用 `isolated: true` 派发，产物经 apply/merge 回到主工作区后再进入阶段四核验；同一并行组内多个隔离子代理的合并冲突由编排层在合并后统一解决。

**顺序集成**：并行阶段完成后，若存在跨 persona 产出需要集成：检查各子代理返回的文件列表是否有跨代理文件冲突；如有冲突，派一个通用 task 子代理（backend-fix persona prompt）解决集成问题；无冲突则跳过。

**聚合规则（内联，merge 策略）**：不调用任何聚合工具或脚本，由编排层直接合并——`output` 按 persona 顺序串接为总变更摘要，`evidence` 串接为总证据清单，`status` 取最差值（failed > partial > completed）。某个子代理返回 `failed` 或 `partial` 时，用已完成的结果继续聚合，记录失败原因，按 `references/execution-workflow.md` 的失败处理规则重试。记录派发清单（dispatched / skipped 及跳过原因）；实际派发数少于路由命中数时，在汇总阶段报告不一致。校验为报告性质，不阻断后续流程。

#### DispatchResults 输出

```typescript
{
  stage: 'dispatch',
  personaResults: [{ persona, status, output, evidence }],
  dispatched: ['实际派发的 persona'],
  skipped: [{ persona, reason }],
  timestamp: 'ISO 时间戳'
}
```

### 阶段四：汇总（Summary）

完成验证和交付，输出 `Deliverable`。

按 `references/verification.md` 核验真实变更范围（独立运行 Git diff/status）、design 契约对照、对齐校验和统一验证。发现越权或污染修改时停止并请求用户决策，不得自动覆盖或回滚。

按 `references/shipping-gate.md` 完成代码审查（调用 `/skill:ae-review`）、审查证据门禁核验、最终检查和交付。

在最终交付前必须汇总以下证据：

- 设计路径或交接文件路径（如有）；无设计路径时的无需设计原因、定位证据和升级判断
- 本次实际运行的测试、构建、类型检查、lint 等验证命令，及每条命令对应的真实执行结果（`command`、`exit_code`、`output`、`executed_at`）
- 代码审查状态；未运行时说明原因
- 本次会话执行过的 Git 写操作；没有则明确说明无；如有，列出命令参数和授权证据
- 工作区决策（当前工作区、隔离工作区已合并、已交接或已取消）
- 如审查状态为通过或失败，列出审查证据来源（`ae/reviews/<run-id>/metadata.json` 路径及指纹比对结果）

最终回复必须包含以下分区：已完成、已验证、未验证/无法验证、Git 操作状态、审查状态、剩余风险。分区格式和使用规则见 `references/shipping-gate.md`。

#### Deliverable 输出

```typescript
{
  stage: 'summary',
  description: '交付物描述',
  validationResults: ['验证结果'],
  artifacts: ['变更文件列表', '审查报告路径'],
  timestamp: 'ISO 时间戳'
}
```

## 隔离工作区与交接

默认隔离手段是 omp task 子代理的 `isolated: true` 隔离工作区 + apply/merge：子代理在隔离副本中实施，编排层审阅其变更后 apply/merge 回主工作区，再统一进入阶段四核验。此路径不产生交接文件。

仅当用户明确要求持久独立分支工作区（Git worktree）并授权具体 `git worktree add` 命令参数时，才走 A→B 转移：

1. A 会话取得新工作区后，不得再实施代码；只允许迁移真实存在且已确定为执行基线的需求/设计产物（文件系统视角判断存在性，即使被 `.gitignore` 忽略也必须迁移），`design_path` 和 `task_brief` 至少一个（有上游 `/skill:ae-design` 产物时优先迁移 design_path；无上游产物时通过 task_brief 内联任务详情，或按 `references/handoff-template.md` 的说明生成上下文派生设计后迁移）。
2. 按 `references/handoff-template.md` 模板在**新工作区**写入唯一规范交接文件 `ae/handoffs/<timestamp>-worktree-handoff.md`；未迁移的产物不得出现在交接文件中，禁止声称已复制。
3. A 会话最后回复只输出目标工作区路径、交接文件路径和简短交接提示（提示用户在新工作空间中调用本技能并把交接文件作为唯一任务输入）；记录终止状态为"执行已转移"，不得进入普通交付模板，不得输出"已完成/已验证"等交付分区。
4. B 端在新工作空间中把交接文件作为唯一必需输入调用本技能，走同一四阶段流程；对 B 端来说需求/设计文档只在交接文件明确引用且真实存在时作为可选上下文。

## 迭代执行模式

目标驱动的无人值守迭代闭环，适用于探索性调试、环境搭建、遗留代码修复等无明确设计的任务；有明确设计时走标准四阶段协议。

**核心原则**：

1. **交互全部前置**：准备阶段解决所有用户问题；成功条件确认后锁死，此后循环体内禁止任何形式提问，遇到歧义自行选择最优解。
2. **成功条件驱动**：基于目标解读和项目状态推导 3-8 条可客观验证的成功条件，格式 `SC-N: 描述 [verify: 验证命令或检查方式]`。涉及代码变更时成功条件必须覆盖边界类别：正常路径、空值/缺失、边界值、错误路径、幂等性（如适用），每类至少一条。
3. **子代理隔离实施**：每轮实施派通用 omp task 子代理执行（persona prompt 按 `references/dev-routing.md` 构建），主会话仅保留子代理返回的结构化摘要（outputSchema 同上），不保留其内部搜索、编辑和验证中间过程；禁止在主会话内直接编辑文件或运行实施命令。
4. **审查闭环**：每轮变更后调用 `/skill:ae-review`（autofix 语义），审查发现驱动下一轮修复。
5. **omp todo 跟踪**：成功条件和轮次状态用 omp todo 维护，每轮更新达成状态。

**循环体**（上限 30 轮，瓶颈阈值为连续 3 轮无新增达成的成功条件）：

1. **子代理实施**：变更触发来源为双重路径——(a) 上轮审查有未通过项 → 审查发现摘要作为本轮触发；(b) 审查通过但成功条件未全部达成 → 未达成条件作为本轮触发。子代理 prompt 必须包含项目上下文（项目类型/技术栈/可复用资产/实现约束）、用户原始目标文本、成功条件列表（标注 ✅/❌）、本轮触发、约束（只针对未达成条件变更，禁止修复与目标无关的发现，变更后运行相关验证命令）。
2. **审查**：调用 `/skill:ae-review`，把成功条件列表作为 goals 传入以激活逐条目标对齐校验。
3. **退出判定**：对每个未达成的成功条件执行其 verify 方法，通过则标记达成并记录证据。**独立校验两项**：① 审查无阻断发现；② 成功条件全部达成（verify 全通过，非由审查结论蕴含）。两项同时满足 → 全部通过退出。不满足时按优先级：瓶颈计数 ≥ 3 → 瓶颈退出；轮次 ≥ 30 → 上限退出；否则回到第 1 步。
4. **测试失败分诊**：验证或审查中出现测试失败时，派 `agent: "test-triage"` 子代理分诊根因（production/test/env/design-drift），按其返回的 dispatchTarget 决定修复路径（self-fix / manual / 派前端或后端修复 persona / 回 `/skill:ae-design`）。

**退出处理**（允许交互）：

- **全部通过 ✅**：输出 DONE，逐条列出每条成功条件的通过证据（文件路径、代码片段或测试结果），随后走阶段四交付门禁。
- **瓶颈退出 ⚠️ / 上限退出 ⚠️**：展示诊断摘要（总轮次、通过/未通过条件及受阻原因、最近 3 轮变更摘要、审查发现重复模式），向用户提供选项：继续尝试 / 结束任务 / 切换方案。

子代理返回错误、未产出有效变更或结果不可解析时，计入瓶颈计数（+1），不中止管道；记录失败原因后继续退出判定。

## 对齐校验（设计-源码-测试）

当任务是"把源码对齐到设计"（如设计变更后回归、或用户要求对齐校验）时，按以下清单在阶段一/阶段四中执行，全程禁止镀金、一步到位：

1. **定位真源**：确定当前设计真源（用户指定路径或 `ae/designs/` 按目录名日期后缀降序取最新）与需求真源（设计 `overview.md` 或 frontmatter 引用的需求路径，或按名称前缀在 `ae/prds/` 匹配）。设计真源无法确定时停止并提示用户先产出设计或显式提供路径。
2. **源码对齐设计**：以设计为准，设计空缺时以需求为准（"设计空缺"指设计目录中不存在对应模块的设计文件，或文件未覆盖该模块/维度）。若设计仅覆盖部分模块，只对齐设计提及的模块，禁止删除或修改设计未提及的模块及其源码。
3. **测试对齐**：从设计 `modules/<NN>-<m>/test-cases.md` 提取用例清单，与现有测试脚本做 diff 对齐（用例新增则补测试、删除则删测试、修改则改测试逻辑），不新增设计未声明的测试；执行细节走 `/skill:ae-test`。
4. **失败修复**：测试失败时按 `references/dev-routing.md` 路由修复 persona（前端问题 → frontend-fix，后端问题 → backend-fix），或派 `agent: "test-triage"` 分诊；修复以设计为准，设计空缺时以需求为准。
5. 范围内前一步骤未通过不进入下一步骤；所有验证结果进入阶段四统一证据汇总。

## 核心原则

- **快速启动，快速执行** — 澄清一次，然后执行
- **设计是向导** — 遵循已有模式和引用；无设计时遵循当前项目已有模式和约定（见硬性门禁"存量项目感知"条目）
- **持续测试** — 每次变更后测试，非最后
- **质量内建** — 遵循模式、编写测试、交付前 lint
- **交付完整功能** — 标记所有任务完成，不留 80% 功能
- **证据交付** — 最终回复必须引用验证命令、审查状态和 Git 操作状态
