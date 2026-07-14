---
name: ae:design
description: "设计阶段：澄清设计决策并产出设计文档，含概览、架构、接口、数据模型、测试用例与验收标准，供实施和审查对齐"
argument-hint: "[需求文档路径|旧 design|裸描述] [dimensions=architecture,database] [refactor=true]"
---

# 创建设计契约

**注意：当前年份是 2026 年。** 在为设计文档标注日期时使用此年份。

`ae:prd` 定义**做什么**。`ae:design` 定义**怎么设计**。`ae:work` 执行设计。

`ae:design` 是设计契约冻结阶段，按需产出覆盖完整软件工程的可还原设计契约集。每个契约达到"任意 AI 据此生成一致性产物"的可还原标准。

此工作流的持久输出是一份**设计文档**（`ae/designs/<需求描述名>-YYYY-MM-DD/design.md` 元文件 + 各维度独立子文件）。它不是汇报材料；只记录后续实施必须知道的设计决策、架构约束、接口契约、数据模型和实现单元，使 ae:work 不需要再发明这些内容。

此技能不实现代码。它澄清设计决策并记录契约，供 ae:work 执行使用。

**重要：生成的文档中所有文件引用必须使用仓库相对路径（例如 `src/models/user.rb`），绝不能使用绝对路径。**

## 核心原则

1. **先评估维度** - 根据 prd 时段标注和任务特征匹配相应的必产出和选产出维度。
2. **做设计伙伴** - 建议替代方案、质疑假设、探索假设情境，而不是仅仅记录决策。
3. **在此解决设计决策** - 架构选型、接口契约、数据模型、UI/UX 规格属于此工作流。实现单元拆解也在此产出；具体代码实现属于 ae:work 职责。
4. **契约可还原** - 每个维度契约必须达到"任意 AI 据此生成一致性产物"的标准，禁止模糊表述。
5. **合理调整 MVCE 覆盖深度** - 简单的任务获得紧凑的契约集，较大的任务获得更完整的契约集。轻量级任务可省略可选 MVCE（最小可验证契约元素）项，但必产出维度的核心 MVCE 不得省略。**核心 MVCE 判定标准：** 该契约元素缺失会导致 ae:work 无法继续实施或 ae:review 无法验证一致性 → 核心；该契约元素缺失只会降低设计质量但不阻塞下游 → 可选。每个维度的 MVCE 清单中标注 `[核心]` 或 `[可选]`。
6. **跨维度一致性** - overview 必须记录维度间依赖；api 数据模型必须与 database 一致；ui-ux 数据展示必须与 api 响应字段对齐；跨维度映射表（4 类）必须存在且与维度内容对齐。
7. **只保留对后续执行有用的设计契约** - 不为了"读起来完整"新增无实际约束力的章节；每个维度内容只有在直接影响实现、测试或审查时才记录。
8. **强制维度拆分** - 无论文件大小，每个维度必须拆分为独立子文件，不在 design.md 中内联维度内容。子代理直接按 `###` 章节产出二级子文件，脚本负责校验和合并（合并后 ≤ 300 行才合回）。
9. **维度子代理产出** - 不同维度的设计契约由对应的维度专精子代理产出，确保设计质量和专注度。
10. **使用 ae:grill 追问** - 在产出契约前，推荐使用 `ae:grill` 技能逐个追问设计决策，一问一答推进直到达成共识。用户可选择跳过。

## 交互规则

1. **一次只问一个问题** - 不要在一次消息中批量提出多个不相关的问题。
2. **优先使用单选** - 在选择方向、优先级或下一步时使用单选。
3. **谨慎使用多选** - 仅用于可共存的集合（维度选择、技术选型、约束条件）。
4. **使用平台的提问工具** - 优先使用 opencode 的 `question` 工具。

## 输出指引

- **保持输出简洁** - 优先使用简短的章节、简明的要点。
- **使用仓库相对路径** - 引用文件时使用相对路径，绝不使用绝对路径。
- **契约可还原** - 每个维度内容必须足够详细，使任意 AI 能据此生成一致性产物。

## 功能描述

<feature_description> #$ARGUMENTS </feature_description>

**如果上面的功能描述为空，询问用户：** "您想设计什么？请描述您正在考虑的功能、系统或改进，或提供需求文档路径。"

在获得用户的设计描述之前不要继续。

## 参数说明

除位置参数（需求文档路径、旧 design 路径或裸描述）外，本技能支持以下命名参数：

### dimensions

- **格式**：`dimensions=<维度1>,<维度2>,...`
- **作用**：传入时只生成指定维度的设计契约；不传时根据 prd 时段标注、风险信号和任务特征自动选择维度。
- **可选值**：`overview`、`architecture`、`api`、`database`、`ui-ux`、`design-spec`、`test-cases`、`security`、`observability`、`non-functional`
- **默认**：未指定时按阶段 1 的风险维度触发规则自动确定维度清单。
- **使用场景**：用户明确知道只需要部分维度时，跳过不必要的维度触发判定。例如 `dimensions=architecture,database` 只产出架构和数据库维度。
- **约束**：`overview` 始终必产出，即使未在 `dimensions` 中列出也会自动包含。显式指定的维度不得与风险触发强制必产出维度冲突（如风险信号强制必产出 `api` 时，`dimensions` 中不得缺少 `api`）。

### refactor

- **格式**：`refactor=true`
- **作用**：将设计模式切换为重构模式，一步到位完成彻底替换，不考虑兼容性和历史技术债务。
- **默认**：未指定时为常规设计模式。
- **使用场景**：已有系统需要彻底重构或技术债治理时使用。
- **行为差异**：重构模式下，设计契约直接定义目标终态，不为兼容旧实现做任何妥协；实现单元拆解以最短路径达成目标终态为优先；测试用例维度侧重验证目标终态行为。涉及数据库变更时，默认考虑数据脚本迁移（DDL/DML/回填/回滚），除非用户明确声明不考虑数据脚本迁移。

## 维度子代理

每个维度由对应的专精子代理产出设计契约，主代理不直接产出维度内容（overview、实施约束和跨维度映射表除外）：

| 维度 | 子代理 | 产出文件 | 始终内联 |
|------|--------|---------|---------|
| overview | 主代理产出 | design.md（内联） | 是 |
| design-spec | `@ui-design-spec` | 设计决策包（透传给 `@ui-ux-designer`，不产出独立文件） | N/A（透传） |
| ui-ux | `@ui-ux-designer` | `ui-ux/ui-ux-<章节名>.md` 二级子文件 + `ui-ux/ui-ux.md` 引用清单 | 否 |
| architecture | `@architecture-designer` | `architecture/architecture-<章节名>.md` 二级子文件 + `architecture/architecture.md` 引用清单 | 否 |
| api | `@api-designer` | `api/api-<章节名>.md` 二级子文件 + `api/api.md` 引用清单 | 否 |
| database | `@database-designer` | `database/database-<章节名>.md` 二级子文件 + `database/database.md` 引用清单 | 否 |
| test-cases | `@test-cases-designer` | `test-cases/test-cases-<章节名>.md` 二级子文件 + `test-cases/test-cases.md` 引用清单 | 否 |
| security | `@security-designer` | `security/security-<章节名>.md` 二级子文件 + `security/security.md` 引用清单 | 否 |
| observability | `@observability-designer` | `observability/observability-<章节名>.md` 二级子文件 + `observability/observability.md` 引用清单 | 否 |
| non-functional | `@non-functional-designer` | `non-functional/non-functional-<章节名>.md` 二级子文件 + `non-functional/non-functional.md` 引用清单 | 否 |
| 跨维度映射表 | 主代理产出 | design.md（内联） | 是 |

**子目录组织：** 每个维度的文件放在以维度名命名的子目录中。`design.md` 始终在设计目录根下，维度一级文件（引用清单）和二级子文件均位于对应维度的子目录中（如 `api/api.md`、`api/api-endpoints.md`）。`design-spec` 为透传维度，不产出文件，不创建子目录。

**硬性约束：主代理严禁直接产出维度契约内容。** overview、实施约束和跨维度映射表由主代理产出，其他维度必须调度对应子代理。违反此约束属于执行错误。

## 执行流程

### 阶段 0：恢复、识别和路由

#### 0.1 在适当时恢复已有工作

仅从以下来源识别要恢复的设计文档：
- 当前会话上下文中用户明确提到的 design 文件名或路径
- 当前会话中已产出的设计文档
- `ae/designs/` 目录下匹配"需求描述名"的最新日期目录中的 `design.md`

#### 0.2 识别输入来源

按优先级识别输入：

1. **prd 文档** - 用户提供 `ae/prds/<name>-prd.md` 路径或会话中已产出 prd 文档时，作为首选输入。读取 prd 的时段标注（前端/后端/数据/安全/运维等）用于维度触发判定。
2. **旧 design** - 用户提供 `ae/designs/<name>/design.md` 路径时，作为版本演化输入。读取旧 design 的 frontmatter（version/supersedes）和 Split Manifest，作为新版本的基础。如果旧 design 无 Split Manifest（旧 unified 状态文档），视为所有维度内联，新版本按强制拆分规则重新拆分所有维度。
3. **裸描述** - 用户直接描述设计目标时，降级处理。询问用户是否需要先创建 prd，或直接基于裸描述进行设计。

**"需求描述名"来源规则（D12）：**
- prd 文档作为输入时：从 prd 文件名提取（如 `user-auth-prd.md` → `user-auth`）
- 旧 design 作为输入时：从旧 design 目录名提取（如 `ae/designs/user-auth-2026-06-20/` → `user-auth`）
- 裸描述作为输入时：从用户描述提取关键词转为 kebab-case（如"用户认证系统" → `user-auth`）
- 含特殊字符时强制 kebab-case 转换

#### 0.3 将源文档作为主要输入

如果存在 prd 文档：阅读它，宣布作为源文档，携带所有内容（目标、范围边界、成功标准、时段标注、决策、待定问题）。不要静默省略源内容。

### 阶段 1：维度触发判定

根据 prd 时段标注和**风险维度**，按 `references/dimension-triggers.md` 中的触发规则确定必产出、条件必产出和显式否定维度。主触发逻辑基于风险维度（不可逆决策和变更影响范围）。仅在风险信号无法识别时，原"任务特征"表作为降级参考（详见 `references/dimension-triggers.md` 降级参考表）。

#### 1.1 读取时段标注与风险信号

从 prd 文档读取"涉及时段"字段和需求条目中的风险信号。如果 prd 无时段标注（旧格式 prd 或裸描述输入），通过交互询问用户确认风险维度。

风险信号识别清单（任一命中即触发对应风险维度，详见 `references/dimension-triggers.md`）：
- **不可逆决策风险**：API 签名变更、数据模型 schema 变更、认证模型变更 → 强制必产出 api、database、security
- **结构性变更风险**：新增模块、跨模块依赖调整、公共配置修改 → 强制必产出 overview、architecture
- **用户界面变更风险**：页面新增、交互流程调整、UI 组件复用 → 强制必产出 overview、design-spec、ui-ux、test-cases
- **数据持久化风险**：新建表、字段变更、迁移脚本 → 强制必产出 overview、database、test-cases
- **用户数据输入**（条件必产出）：涉及用户提交数据 → security 提升为必产出
- **生产部署**（条件必产出）：涉及生产环境部署或变更 → observability 提升为必产出
- **性能敏感**（条件必产出）：涉及高并发/大数据量/实时性 → non-functional 提升为必产出

> design-spec 没有独立的风险信号触发条目，它作为 ui-ux 的附属维度出现在必产出列表中。当 ui-ux 被触发时，design-spec 自动作为其前置依赖执行。

#### 1.2 风险维度触发规则

按风险维度主触发逻辑确定维度清单，详见 `references/dimension-triggers.md`。

#### 1.3 显式否定机制

对于未触发且不适用的维度，必须显式否定，消除"默认值黑洞"：

- 格式：`<维度名>: explicitly-omitted`
- 含义：该维度不是本设计关注点，使用最简默认实现，不产出独立契约
- 必产出维度不得使用显式否定；显式否定需在 overview 的范围映射中记录理由

#### 1.4 确认维度清单

向用户呈现触发的维度清单（必产出 + 条件必产出 + 显式否定候选），允许用户：
- 确认默认触发的维度
- 勾选额外的选产出维度
- 移除不适用的必产出维度（需说明理由）
- 对不适用的选产出维度标注显式否定

### 阶段 2：使用 ae:grill 追问设计决策

维度清单确认后、产出契约之前，**推荐使用 `ae:grill` 技能逐个追问设计决策**。向用户确认是否使用 ae:grill：

- 用户确认使用 → 转交 ae:grill 追问
- 用户选择跳过 → 跳过追问，按已有 prd 需求和维度清单直接产出契约，记录跳过原因

#### 2.1 转交 ae:grill

调用 `ae:grill` 技能时，将以下上下文格式化为文本描述作为 $ARGUMENTS 传入（ae:grill 接受文本/路径输入，不支持结构化接口）：
- 当前维度清单（必产出 + 条件必产出 + 显式否定）
- prd 内容摘要（目标、范围边界、成功标准、时段标注）
- 已有 design 上下文（如版本演化）
- 追问范围：所有已确认维度的关键设计决策

`ae:grill` 会沿决策树逐个追问，一问一答推进直到达成共识。追问结束后，将共识清单作为各维度子代理产出的输入。

#### 2.2 追问维度覆盖

`ae:grill` 的追问范围必须覆盖所有已确认维度的关键设计决策：

| 维度 | 追问关注点 |
|------|----------|
| architecture | 技术选型、模块划分、通信方式、依赖方向 |
| api | 端点设计、认证方式、版本策略、错误码体系 |
| database | 范式级别、分库分表、数据生命周期、敏感字段 |
| ui-ux | 页面布局、组件复用、设计 Token、交互状态机 |
| test-cases | 测试范围、覆盖优先级、测试数据策略 |
| security | 认证模型、授权模型、数据分级、密钥管理 |
| observability | 日志结构、监控指标、告警阈值、SLO 目标 |
| non-functional | 性能目标、并发模型、缓存策略、容量规划 |

> design-spec 不需要 ae:grill 追问。`@ui-design-spec` 有自己的设计决策推断流程（需求推断 → 旋钮配置 → 设计体系选择 → 风格变体推荐 → 负向设计空间 → 输出），由步骤 1 的风险信号触发后自主执行。

#### 2.3 追问结果带回

`ae:grill` 追问结束后，将共识清单带回本技能，作为各维度子代理产出的输入。追问结果包含：
- 共识清单（每个关键决策的结论和理由）
- 决策依赖图（各决策之间的依赖关系摘要）
- 遗留风险（共识中仍存在的风险或不确定性）

如果用户在 `ae:grill` 阶段选择跳过某些追问，记录跳过原因，相关维度子代理按默认推荐产出。

### 阶段 3：产出 overview 和跨维度映射表骨架

主代理产出 overview 和跨维度映射表骨架，作为后续维度子代理产出的锚点。

#### 3.1 产出 overview（必产出，始终内联）

overview 始终内联在 `design.md` 中，按 `references/overview-template.md` 模板产出，包含：
- 设计读数（一句话声明设计意图和美学家族）
- 范围映射（prd 需求 → design 维度的对应关系）
- 产物清单（本次产出的维度文件列表）
- 契约版本（初始为 1.0，版本演化时递增）
- 跨维度依赖关系（哪些维度之间有一致性约束）
- 设计决策记录（ADR，记录关键设计决策和理由，使用稳定 ID `ADR-XXX`，从 ae:grill 追问结果提炼）
- 跨维度映射表（4 类映射表的引用，详见 `references/cross-dimension-mapping.md`）

> 实施约束（环境变量、依赖版本、配置项、目录结构、构建命令）是 design.md 的独立章节，不属于 overview 维度，详见 `references/design-output-template.md`。

**稳定 ID 体系：** overview 中的设计条目必须使用稳定 ID，便于 ae:work / ae:review 追溯：
- `ADR-XXX`：架构决策记录（核心）
- `EP-XXX`：API 端点编号（核心，跨维度映射表 ui-component-to-api-endpoint-mapping 依赖）
- `T-XXX`：数据库表名编号，如 `T-users`、`T-orders`（核心，跨维度映射表 api-field-to-database-column-mapping 依赖）
- `TC-XXX`：测试用例编号（核心，跨维度映射表 test-case-to-contract-coverage 依赖）
- `ST-XXX`：UI 交互状态机编号（核心，跨维度映射表 api-error-to-ui-state-mapping 依赖）

稳定 ID 在 design 文档全生命周期不变；版本演化时新增 ID，不重用已废弃 ID。稳定 ID 体系的完整定义统一在 `references/overview-template.md`，本处为引用提示。

#### 3.2 产出跨维度映射表骨架

在 overview 和实施约束之后、其他维度之前，先产出"跨维度映射表"骨架，作为后续维度产出的锚点。骨架包含 4 类映射表的空表头（具体内容在维度产出后填充）：

- `api-field-to-database-column-mapping`：API 请求/响应字段 ↔ 数据库表字段映射表
- `api-error-to-ui-state-mapping`：API 错误码 ↔ UI 交互状态机映射表
- `test-case-to-contract-coverage`：测试用例 ↔ 维度契约元素覆盖追溯表
- `ui-component-to-api-endpoint-mapping`：UI 组件 ↔ API 端点映射表

骨架产出后，每个维度子代理产出时同步填充对应映射表行项，确保维度间一致性在产出过程中即时维护。映射表模板详见 `references/cross-dimension-mapping.md`。

### 阶段 4：调度维度子代理产出契约

按确认的维度清单和并行分组策略，调度维度专精子代理产出设计契约。

#### 4.1 并行分组策略

维度按依赖关系分为三个并行波次：

**并行波次 0（前置依赖，串行）：**
- design-spec（@ui-design-spec）→ 产出设计决策包（设计读数、三旋钮、设计体系、风格变体、负向设计空间），为 ui-ux 提供前置依赖

> design-spec 为透传维度，不产出独立文件。波次 0 完成后，设计决策包作为上下文传递给波次 1 的 ui-ux 子代理。

**并行波次 1（全部并行，依赖波次 0）：**
- architecture（@architecture-designer）→ 为 api/database 提供模块边界和分层规则
- database（@database-designer）→ 为 api 提供表结构（T-XXX）用于字段对齐
- api（@api-designer）→ 与 database 字段对齐，为 ui-ux 提供端点
- ui-ux（@ui-ux-designer）→ 接收波次 0 的 design-spec 决策包，与 api 端点对齐
- security（@security-designer）→ 与 api/database 对齐
- observability（@observability-designer）→ 与 architecture/api 对齐
- non-functional（@non-functional-designer）→ 与 architecture/database 对齐

波次 1 中所有维度子代理一次性并行调度，不等待其他维度完成。每个子代理从 overview 获取稳定 ID（T-XXX、EP-XXX、ADR-XXX、ST-XXX 等）和跨维度上下文，基于 overview 预分配的稳定 ID 独立产出契约。即使有关联的维度（如 api 和 database）也并行产出，跨维度一致性在阶段 5 校验。

**并行波次 2（依赖波次 1）：**
- test-cases（@test-cases-designer）→ 依赖所有其他维度的契约元素进行覆盖追溯，在波次 1 全部完成后调度

#### 4.2 并行子代理调度

**波次 0 调度（串行）：** 调度 `@ui-design-spec` 子代理，传入以下上下文：
- **prd 内容摘要**：需求条目、目标、范围边界、时段标注
- **ae:grill 追问结果**：设计相关的已确认决策
- **overview 上下文**：设计读数、范围映射、稳定 ID 体系

波次 0 完成后，设计决策包作为上下文传递给波次 1 的 ui-ux 子代理。

**波次 1 调度（全部并行）：** 在**同一轮回复中一次性发出所有 Task 调用**，启动波次 1 的全部维度子代理。每个子代理传入以下上下文：
- **prd 内容摘要**：需求条目、目标、范围边界、时段标注
- **ae:grill 追问结果**：该维度相关的已确认设计决策
- **overview 上下文**：设计读数、范围映射、跨维度依赖关系、稳定 ID 体系
- **契约模板路径**：`references/<维度名>-template.md`
- **跨维度依赖**：overview 中预分配的稳定 ID 和契约元素（不依赖其他维度的实际产出）
- **设计决策包**（仅 `@ui-ux-designer`）：从波次 0 的 `@ui-design-spec` 产出获取设计决策包参数

子代理直接按 `###` 章节产出二级子文件，不产出完整维度文件：
- 二级子文件路径：`<维度名>/<维度名>-<章节名kebab>.md`
- 二级子文件 frontmatter：`{ section: <章节名kebab>, parent: <维度名>.md }`
- 二级子文件正文：该 `###` 章节内容（含 `###` 标题行）

同时产出 `<维度名>/<维度名>.md` 引用清单文件：
- frontmatter：`{ section: <维度名>, parent: design.md, sub_split: true }`
- 正文：子文件引用列表

波次 1 全部子代理返回后，再调度波次 2 的 test-cases 子代理，传入以下上下文：
- **prd 内容摘要**：需求条目、目标、范围边界、时段标注
- **ae:grill 追问结果**：测试相关的已确认决策
- **overview 上下文**：设计读数、范围映射、跨维度依赖关系、稳定 ID 体系
- **契约模板路径**：`references/test-cases-template.md`
- **所有波次 1 维度的稳定 ID 和契约元素**：architecture、api、database、ui-ux、security、observability、non-functional 的产出契约元素

子代理产出后返回：
- 产出文件路径列表（二级子文件 + 引用清单）
- 稳定 ID 列表
- 跨维度映射表行项

#### 4.3 主代理汇总

**所有子代理执行完毕后**，主代理统一汇总，生成元数据文件：
- 更新 design.md 的 Split Manifest（记录每个维度文件的 file、lines、sub_split 状态，路径包含子目录）
- 更新 design.md 的产物清单
- 更新跨维度映射表对应行项
- 记录稳定 ID 列表
- 检查跨维度一致性（字段对齐、状态机映射等）

**关键约束：** design.md 的 Split Manifest、产物清单和跨维度映射表由主代理在所有子代理执行完毕之后单独生成，子代理不直接修改 design.md。

#### 4.4 维度校验与合并

**强制拆分规则：** 每个维度必须拆分为独立子文件，不在 design.md 中内联维度内容。overview、实施约束和跨维度映射表始终内联在 design.md 中。design-spec 维度为透传维度，不产出独立文件，不参与拆分规则和行数校验。

子代理已直接产出二级子文件。运行流水线脚本：

    node <ae-design技能目录>/scripts/pipeline-design-shards.mjs <design目录路径>

脚本自动完成：
1. **校验**：所有一级维度文件（引用清单）行数 ≤ 300 行
2. **合并**：对每个已二级拆分的维度，计算合并后行数；合并后 ≤ 300 行 → 合并回父文件；> 300 行 → 保持拆分

合并由脚本执行，LLM 不介入。

拆分规则、子文件命名规范、Split Manifest 格式和二级拆分细则见 `references/design-output-template.md`。

### 阶段 5：跨维度一致性校验

产出全部维度后，执行跨维度一致性校验（结构守门 + 轻量语义守门，覆盖维度间映射）：

**结构守门（映射表存在性与完整性）：**

1. **4 类映射表存在且非空** - api-field-to-database-column-mapping、api-error-to-ui-state-mapping、test-case-to-contract-coverage、ui-component-to-api-endpoint-mapping 必须存在且非空（维度未产出时标注 N/A 并说明理由）
2. **overview 跨维度映射表 ↔ 实际维度内容一致性** - 映射表必须与实际维度产出的内容对齐
3. **overview 依赖关系完整性** - overview 记录的跨维度依赖必须覆盖实际存在的一致性约束
4. **test-cases 覆盖完整性** - test-cases 必须覆盖所有必产出维度的关键场景

**轻量语义守门（映射表行项内容对齐）：**

5. **api ↔ database 字段对齐** - api 请求/响应字段与 database 表字段逐行对齐：字段名映射完整、类型可无损转换（不可无损转换的必须标注转换规则）、`required` ↔ `NOT NULL` 约束对齐
6. **api 错误码 ↔ ui-ux 状态机映射一致性** - api 维度定义的所有错误码必须在映射表中有对应行项；映射的 UI 状态必须是 ui-ux 状态机中实际存在的状态；状态转换路径在状态机中有定义且闭合
7. **test-cases 用例 ↔ 维度契约元素覆盖追溯** - 每个 P0/P1 用例至少有 1 条追溯记录，追溯的契约元素 ID 必须在实际维度文件中存在
8. **ui-ux ↔ api 端点对齐** - 提交数据的交互组件必须映射到对应 api 端点；组件"所需字段"与 api 响应字段对齐（字段名、可选性）
9. **实施约束与 architecture/api 一致性** - 目录结构约定与模块边界表对齐、环境变量清单与认证授权流程对齐

**维度间逻辑协调性（映射表之外的一致性约束）：**

10. **architecture ↔ api** - 模块边界与 api 接口分组一致
11. **security ↔ database** - security 数据分级与 database 敏感字段标注对齐
12. **observability ↔ architecture** - observability 指标体系覆盖 architecture 关键数据流
13. **non-functional ↔ architecture** - non-functional 性能目标与 architecture 技术选型可行
14. **design-spec ↔ ui-ux** - ui-ux 契约中的设计读数、三旋钮取值和负向设计空间必须与 design-spec 产出的设计决策包一致；design-spec 是 ui-ux 的前置依赖，ui-ux 产出时引用决策包参数保证一致性

发现不一致时，在此阶段修复后再进入 review 闭环。映射表缺失时补全，映射表与维度内容不一致时以维度内容为准更新映射表。语义对齐问题（字段类型不兼容、状态机路径断裂、追溯 ID 不存在等）在此阶段修复，减少 review 阶段发现量。

### 阶段 6：技能内 review 闭环

产出 design 契约集后，强制调用 `ae:review` 审查本技能产物，形成技能内闭环。

#### 6.1 调用 ae:review

调用方式：
```
ae:review mode=headless domain=document <design-dir>/design.md
```

审查者：`design-consistency-reviewer`（激活条件：hasDesignContract=true）

传入参数：
- `has_design_contract=true`
- `document_type=design`
- `targets=<产出的维度文件列表>`

ae:review 内部调用时不输出下一步引导（D13），由 ae:design 自身负责。

#### 6.2 auto 修复范围

ae:review 的 auto 修复范围：
- 章节缺失（必产出维度未产出或章节不完整）
- token 定义不全（ui-ux 维度的设计 token 缺失字段）
- 契约字段模糊（如"高性能"未量化、"适当缓存"未定义策略）
- 跨维度不一致（api 与 database 字段不对齐等）

#### 6.3 收敛协议（D9）

按收敛协议执行：
- **上限 2 轮** - 最多执行 2 轮 review → auto 修复 → review 循环
- **收敛定义** - 无新增 P0/P1 发现即为收敛
- **未收敛处理** - 2 轮后仍有新增 P0/P1，回退用户澄清，不继续盲目修复

### 阶段 7：下一步推荐技能引导

review 闭环收敛后，显式提示用户下一步推荐技能。

#### 7.1 是否进入 ae:work 判定

设计契约闭环通过后默认进入 `ae:work`。设计中的实现单元、文件范围和验证要求直接作为 ae:work 的输入。

以下信号仅作为 ae:work 编排参考，不阻断进入：
- 涉及 ≥3 个文件改动 → ae:work 按多单元并行编排
- 涉及 ≥2 个模块/层级（如前端+后端+数据库）→ ae:work 按跨域代理协调
- 存在实现顺序依赖（如 UI 依赖 API 契约）→ ae:work 按串行策略
- 存在可并行的独立任务 → ae:work 按并行策略
- 涉及数据迁移或破坏性变更 → ae:work 标注高风险

所有情况下，设计闭环通过后都进入 ae:work；ae:work 不再触发本技能重新生成实现单元。

#### 7.2 引导语

| 审查结论 | 推荐下一步技能 | 引导语 |
|---------|---------------|--------|
| 通过 + 复杂任务 | **ae:work** | "设计契约已就绪。任务较复杂，建议使用 `ae:work` 按多单元编排执行。" |
| 通过 + 简单任务 | **ae:work** | "设计契约已就绪。任务较简单，可直接使用 `ae:work` 执行。" |
| 阻断 | **ae:design**（继续） | "设计契约可还原性不达标，已修复/待补充，请继续完善。" |

## 安全边界

- **不做代码实施** - 只记录设计契约和实现单元，不产出可执行代码
- **不生成实际测试代码** - 只设计测试用例契约，不写测试代码
- **不画真实视觉稿** - UI/UX 维度用结构化描述（布局家族、组件契约、token），不画像素级视觉稿
- **不扩展需求边界** - prd 冻结后，design 不得擅自扩展范围，越界项回退 prd 决策
- **主代理不直接产出维度契约** - 除 overview 和跨维度映射表外，维度契约必须由对应子代理产出

## 验证方式

- 技能内 review 闭环通过（无新增 P0/P1）
- 跨维度一致性校验通过
- 每个维度契约达到可还原标准
- ae:grill 追问完成（或用户明确选择跳过），设计决策已达成共识或已记录跳过原因

## 产物结构

产物目录结构、design.md 元文件模板、Split Manifest 格式详见 `references/design-output-template.md`。每个维度的文件放在以维度名命名的子目录中（如 `api/api.md`），Split Manifest 中的 file 路径包含子目录前缀。

设计维度契约模板详见 `references/` 目录下各维度的独立模板文件：
- `references/dimension-triggers.md` - 维度触发规则
- `references/overview-template.md` - 设计总览模板
- `references/ui-ux-template.md` - UI/UX 设计模板
- `references/architecture-template.md` - 架构设计模板
- `references/api-template.md` - 接口设计模板
- `references/database-template.md` - 数据库设计模板
- `references/test-cases-template.md` - 测试用例设计模板
- `references/security-template.md` - 安全设计模板
- `references/observability-template.md` - 可观测性设计模板
- `references/non-functional-template.md` - 非功能设计模板
- `references/cross-dimension-mapping.md` - 跨维度映射表模板
- `references/design-output-template.md` - 设计产物输出模板
