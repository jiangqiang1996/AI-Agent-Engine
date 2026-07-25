---
name: ae:design
description: "设计阶段：澄清设计决策并产出设计文档，含概览、架构、接口、数据模型、测试用例与验收标准，供实施和审查对齐"
argument-hint: "[需求文档路径|design|裸描述] [dimensions=architecture,database] [refactor=true]"
---

# 创建设计契约

**注意：当前年份是 2026 年。** 在为设计文档标注日期时使用此年份。

`ae:prd` 定义**做什么**。`ae:design` 定义**怎么设计**。`ae:work` 执行设计。

`ae:design` 是设计契约冻结阶段，按需产出覆盖完整软件工程的可还原设计契约集。每个契约达到"任意 AI 据此生成一致性产物"的可还原标准。

此工作流的持久输出是一份**设计文档**（`ae/designs/<需求描述名>-YYYY-MM-DD/` 目录，含 `index.md` 自动生成纯索引 + `global.md` 全局设计共识单文件 + `modules/<NN>-<m>/` 下各维度独立文件）。它不是汇报材料；只记录后续实施必须知道的设计决策、架构约束、接口契约、数据模型和实现单元，使 ae:work 不需要再发明这些内容。

此技能不实现代码。它澄清设计决策并记录契约，供 ae:work 执行使用。

**重要：生成的文档中所有文件引用必须使用仓库相对路径（例如 `src/models/user.rb`），绝不能使用绝对路径。**

## 核心原则

1. **先评估维度** - 根据 prd 时段标注和任务特征匹配相应的必产出和选产出维度。
2. **做设计伙伴** - 建议替代方案、质疑假设、探索假设情境，而不是仅仅记录决策。
3. **在此解决设计决策** - 架构选型、接口契约、数据模型、UI/UX 规格属于此工作流。实现单元拆解也在此产出；具体代码实现属于 ae:work 职责。
4. **契约可还原** - 每个维度契约必须达到"任意 AI 据此生成一致性产物"的标准，禁止模糊表述。
5. **合理调整 MVCE 覆盖深度** - 简单的任务获得紧凑的契约集，较大的任务获得更完整的契约集。轻量级任务可省略可选 MVCE（最小可验证契约元素）项，但必产出维度的核心 MVCE 不得省略。**核心 MVCE 判定标准：** 该契约元素缺失会导致 ae:work 无法继续实施或 ae:review 无法验证一致性 → 核心；该契约元素缺失只会降低设计质量但不阻塞下游 → 可选。每个维度的 MVCE 清单中标注 `[核心]` 或 `[可选]`。
6. **跨模块一致性** - global.md 必须记录模块间依赖；同一模块内 api 数据模型必须与 database 一致；ui-ux 数据展示必须与 api 响应字段对齐；跨模块/跨维度映射表（4 类）必须存在且与内容对齐。
7. **只保留对后续执行有用的设计契约** - 不为了"读起来完整"新增无实际约束力的章节；每个章节内容只有在直接影响实现、测试或审查时才记录。
8. **生成时拆分，非生成后拆分** - 子代理直接按模块产出各维度独立文件（modules/<NN>-<m>/ 下各维度文件 ≤ 500 行，超限按语义前缀 + 数字分片（如 `api-1.md`、`api-2.md`...）），不产出大文件再后置拆分。全程无中间大文件，避免 AI 上下文爆炸。采用两阶段调度：阶段 1 全局维度并行（产出 global.md 各章节），阶段 2 模块并行（每模块一个 agent，串行产出各维度独立文件）。`index.md` 为自动生成纯索引文件（无行数限制），`global.md` 为全局设计共识单文件（≤ 300 行，超限按数字顺序分片为 `global-1.md`、`global-2.md`、...）。所有文件超限时禁止压缩内容，必须按数字顺序分片，分片在 `##` 章节边界切分保持片内语义完整，每片不超过行数上限。
9. **子代理产出各维度独立文件** - 不同维度的设计契约由对应的专精子代理产出独立维度文件（写入 global.md 或 modules/<NN>-<m>/ 对应维度文件），而非章节片段合并到单文件。子代理的调度逻辑和输入契约不变，仅输出从"章节片段"改为"独立维度文件"。
10. **使用 ae:grill 追问** - 在产出契约前，推荐使用 `ae:grill` 技能逐个追问设计决策，一问一答推进直到达成共识。用户可选择跳过。
11. **技术栈依赖审查** - 设计中关于技术栈的选型禁止引入长期不活跃或 stars 数量较少的小众依赖。技术选型理由表中每个引入的第三方依赖必须标注其社区活跃度（最近发布时间、stars 量级）和采用理由；优先选择社区活跃、生态成熟、维护稳定的依赖。具体判定标准见 `references/architecture-template.md` 技术选型理由章节。
12. **技术实现路线约束（硬约束）** - 设计阶段必须明确技术实现路线，覆盖前端、后端、数据层、基础设施等各时段：
    - **前端技术栈**：明确前端框架（React/Vue/Angular/Svelte 等）、UI 组件库（Ant Design/Element Plus/MUI 等）、CSS 方案（Tailwind/CSS Modules/Styled Components 等）、路由方案、状态管理方案、构建工具、图标库、字体方案；标注版本范围和选型理由。
    - **后端技术栈**：明确后端语言与框架（Spring Boot/Express/FastAPI/Django 等）、ORM/数据访问层、认证授权方案、API 风格（REST/GraphQL/RPC）、中间件选型；标注版本范围和选型理由。
    - **数据层技术栈**：明确数据库类型与版本（MySQL/PostgreSQL/MongoDB/Redis 等）、缓存方案、消息队列、搜索引擎；标注选型理由。
    - **基础设施技术栈**：明确部署方式（Docker/K8s/Serverless 等）、CI/CD 方案、监控方案、日志方案；标注选型理由。
    - **来源优先级**：若 prd 文档中用户已明确指定技术栈，设计必须遵循该约束，不得擅自更换；若 prd 未指定，设计阶段通过 ae:grill 追问或基于项目已有技术栈推断确定，推断依据必须记录在 ADR 中。
    - **真源位置**：全局技术栈选型决策记录在 global.md 的 ADR 中；前端技术栈详细信息集中在 global.md 的"前端技术栈声明"章节；后端/数据层/基础设施技术栈详细信息记录在 global.md §系统架构中；global.md §实施约束记录环境变量、依赖版本和配置项。各模块文件引用 global.md ADR 中的技术栈决策 ID，不重复记录选型决策。
    - **一致性约束**：技术栈选型确定后，各模块的 api/database/ui-ux/security 章节及 global.md 的 architecture/security/observability/non-functional 章节必须与该选型一致，禁止出现技术栈矛盾（如 architecture 选了 Vue 但某模块 ui-ux 章节引用了 React 专属组件库，或 architecture 选了 MySQL 但 database 章节使用了 PostgreSQL 独有的 JSONB 类型）。
13. **优先使用 Mermaid 图示** - 设计文档中的所有图示（系统上下文图、ER 模型、数据流图、部署拓扑图等）优先使用 Mermaid 语法绘制；Mermaid 无法表达的复杂注释场景可使用 ASCII 制图作为降级方案。
14. **页面设计技术栈隔离（硬约束）** - ui-ux 章节中，技术栈信息（前端框架、UI 组件库、CSS 方案、图标库、字体、路由方案、第三方依赖等）必须集中在 global.md 的"前端技术栈声明"章节中统一记录。模块文件中的 §UI/UX 章节禁止散落技术栈或第三方依赖名称，只描述页面结构、交互行为、组件契约和样式片段。技术栈声明章节是技术选型的唯一真源，页面产物通过组件 ID 引用全局组件清单，不直接引用技术栈名称。
15. **页面设计关注组件复用（硬约束）** - ui-ux 章节的详细设计必须主动关注组件复用，而非仅为每个页面独立产出 HTML 片段。设计时必须：（1）扫描项目已有组件资产，优先复用已有组件而非新建；（2）识别跨页面重复的 UI 结构，抽取为共享组件并纳入全局组件清单；（3）对每个组件明确标注来源（已有复用 / 技术栈库引入 / 新建自研）和复用理由；（4）模块 §UI/UX 章节通过组件 ID 引用全局组件，不内联重复的 HTML 结构。组件复用策略集中记录在 global.md 的"组件复用策略"章节，确保 ae:work 实施时不重复造轮子。

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

除位置参数（需求文档路径、design 路径或裸描述）外，本技能支持以下命名参数：

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

全局维度由对应的专精子代理产出章节片段合并到 global.md，模块维度由对应的专精子代理产出独立维度文件，主代理不直接产出维度内容（global.md 全局章节和跨维度映射表除外）：

| 维度 | 子代理 | 产出位置 |
|------|--------|---------|
| overview / 实施约束 / 跨维度映射表 | 主代理产出 | `global.md` §概览 + §实施约束 + §跨维度映射表 |
| design-spec | `@ui-design-spec` | `global.md` §设计规范（含设计读数、三旋钮取值、设计体系选择、风格变体推荐、负向设计空间；同时透传给 `@ui-ux-designer`） |
| architecture | `@architecture-designer` | `global.md` §系统架构 |
| security | `@security-designer` | `global.md` §安全 |
| observability | `@observability-designer` | `global.md` §可观测性 |
| non-functional | `@non-functional-designer` | `global.md` §非功能 |
| api | `@api-designer` | `modules/<NN>-<m>/api.md` |
| database | `@database-designer` | `modules/<NN>-<m>/database.md` |
| ui-ux | `@ui-ux-designer` | `modules/<NN>-<m>/ui-ux.md` |
| test-cases | `@test-cases-designer` | `modules/<NN>-<m>/test-cases.md` |

**产物组织：** `index.md`（自动生成，无行数限制，纯索引）位于设计目录根下。`global.md`（≤ 300 行，全局设计共识单文件）位于设计目录根下，包含 §概览、§系统架构、§安全、§可观测性、§非功能、§设计规范、§实施约束、§跨维度映射表等全局章节。每个模块位于 `modules/<NN>-<m>/` 子目录中（`<NN>` 为零填充数字序号如 01、02、03），子目录名带数字固定顺序。模块下各维度独立文件（`api.md` / `database.md` / `ui-ux.md` / `test-cases.md`，每个 ≤ 500 行），每个维度文件仅当对应维度存在时产出，不存在即显式否定。维度文件内容边界：禁止出现需求条目/验收标准/原型等产品逻辑层内容。

**数字分片：** 各维度文件 ≤ 500 行；超限禁止压缩内容，按语义前缀 + 数字顺序分片（如 `modules/<NN>-<m>/api-1.md`、`api-2.md`...），每片 ≤ 500 行，在 `##` 章节边界切分保持片内语义完整。global.md ≥ 300 行 → 禁止压缩内容，按数字顺序分片为 `global-1.md`、`global-2.md`、...，每片 ≤ 300 行。分片文件名数字固定顺序，`index.md` 记录所有分片文件清单。

**硬性约束：主代理严禁直接产出维度契约内容。** global.md 的全局章节和跨维度映射表由主代理产出，其他维度必须调度对应子代理产出（全局维度产出章节片段合并到 global.md，模块维度产出独立维度文件）。违反此约束属于执行错误。

## 执行流程

### 阶段 0：恢复、识别和路由

#### 0.1 在适当时恢复已有工作

仅从以下来源识别要恢复的设计文档：
- 当前会话上下文中用户明确提到的 design 文件名或路径
- 当前会话中已产出的设计文档
- `ae/designs/` 目录下匹配"需求描述名"的最新日期目录中的 `index.md`

#### 0.2 识别输入来源

按优先级识别输入：

1. **prd 文档** - 用户提供 `ae/prds/<topic>-YYYY-MM-DD/prd.md` 路径或会话中已产出 prd 文档时，作为首选输入。读取 prd 的时段标注（前端/后端/数据/安全/运维等）用于维度触发判定。
2. **design** - 用户提供 `ae/designs/<name>-YYYY-MM-DD/index.md` 路径时，作为版本演化输入。读取 index.md 的 frontmatter（version/supersededBy）和 global.md，作为新版本的基础。
3. **裸描述** - 用户直接描述设计目标时，降级处理。询问用户是否需要先创建 prd，或直接基于裸描述进行设计。

**"需求描述名"来源规则（D12）：**
- prd 文档作为输入时：从 prd 目录名提取（如 `ae/prds/user-auth-2026-06-24/prd.md` → `user-auth`）
- design 作为输入时：从 design 目录名提取（如 `ae/designs/user-auth-2026-06-20/` → `user-auth`）
- 裸描述作为输入时：从用户描述提取关键词转为 kebab-case（如"用户认证系统" → `user-auth`）
- 含特殊字符时强制 kebab-case 转换

#### 0.3 将源文档作为主要输入

如果存在 prd 文档：阅读它，宣布作为源文档，携带所有内容（目标、范围边界、成功标准、时段标注、决策、待定问题）。不要静默省略源内容。

### 阶段 1：维度触发判定

根据 prd 时段标注和**风险维度**，按 `references/dimension-triggers.md` 中的触发规则确定必产出、条件必产出和显式否定维度。主触发逻辑基于风险维度（不可逆决策和变更影响范围）。仅在风险信号无法识别时，原"任务特征"表作为降级参考（详见 `references/dimension-triggers.md` 降级参考表）。

#### 1.1 读取时段标注与风险信号

从 prd 文档读取"涉及时段"字段和需求条目中的风险信号。如果 prd 无时段标注（非软件任务省略 time_scope 或裸描述输入），通过交互询问用户确认风险维度。

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
- design 上下文（如版本演化）
- 追问范围：所有已确认维度的关键设计决策

`ae:grill` 会沿决策树逐个追问，一问一答推进直到达成共识。追问结束后，将共识清单作为各维度子代理产出的输入。

#### 2.2 追问维度覆盖

`ae:grill` 的追问范围必须覆盖所有已确认维度的关键设计决策：

| 维度 | 追问关注点 |
|------|----------|
| architecture | 技术选型（前端/后端/数据层/基础设施技术栈）、模块划分、通信方式、依赖方向 |
| api | 端点设计、API 风格选型（REST/GraphQL/RPC）、认证方式、版本策略、错误码体系 |
| database | 数据库类型选型、范式级别、分库分表、数据生命周期、敏感字段、缓存/消息队列/搜索引擎选型 |
| ui-ux | 前端框架/UI 组件库/CSS 方案选型、页面布局、组件复用、设计 Token、交互状态机 |
| test-cases | 测试范围、覆盖优先级、测试数据策略 |
| security | 认证模型、授权模型、数据分级、密钥管理 |
| observability | 监控/日志/追踪方案选型、日志结构、监控指标、告警阈值、SLO 目标 |
| non-functional | 性能目标、并发模型、事务边界、缓存策略、容量规划 |

> design-spec 不需要 ae:grill 追问。`@ui-design-spec` 有自己的设计决策推断流程（需求推断 → 旋钮配置 → 设计体系选择 → 风格变体推荐 → 负向设计空间 → 输出），由步骤 1 的风险信号触发后自主执行。

#### 2.3 追问结果带回

`ae:grill` 追问结束后，将共识清单带回本技能，作为各维度子代理产出的输入。追问结果包含：
- 共识清单（每个关键决策的结论和理由）
- 决策依赖图（各决策之间的依赖关系摘要）
- 遗留风险（共识中仍存在的风险或不确定性）

如果用户在 `ae:grill` 阶段选择跳过某些追问，记录跳过原因，相关维度子代理按默认推荐产出。

### 阶段 3：产出 global.md 骨架

主代理产出 global.md 骨架（全局设计共识单文件），包含 §概览、§实施约束、§跨维度映射表骨架，作为后续全局维度子代理产出章节片段和模块子代理产出独立维度文件的锚点。

#### 3.1 产出 §概览（必产出）

global.md §概览按 `references/overview-template.md` 模板产出，包含：
- 设计读数（一句话声明设计意图和美学家族）
- 范围映射（prd 需求 → design 模块的对应关系）
- 产物清单（本次产出的文件列表）
- 契约版本（初始为 1.0，版本演化时递增）
- 跨模块依赖关系（哪些模块之间有一致性约束）
- 设计决策记录（ADR，记录关键设计决策和理由，使用稳定 ID `ADR-XXX`，从 ae:grill 追问结果提炼）
- 跨维度映射表（4 类映射表的引用，详见 `references/cross-dimension-mapping.md`）

> 实施约束（环境变量、依赖版本、配置项、目录结构、构建命令）产出到 global.md §实施约束章节，详见 `references/design-output-template.md`。

**稳定 ID 体系：** overview 中的设计条目必须使用稳定 ID，便于 ae:work / ae:review 追溯：
- `ADR-XXX`：架构决策记录（核心）
- `EP-XXX`：API 端点编号（核心，跨维度映射表 ui-component-to-api-endpoint-mapping 依赖）
- `T-XXX`：数据库表名编号，如 `T-users`、`T-orders`（核心，跨维度映射表 api-field-to-database-column-mapping 依赖）
- `TC-XXX`：测试用例编号（核心，跨维度映射表 test-case-to-contract-coverage 依赖）
- `ST-XXX`：UI 交互状态机编号（核心，跨维度映射表 api-error-to-ui-state-mapping 依赖）
- `INT-XXX`：UI 交互行为编号（核心，test-cases 交互覆盖完整性表依赖）
- `BR-XXX`：业务规则编号（核心，test-cases 决策表测试依赖，决策表行号格式 `DT-BR-XXX-N`）

稳定 ID 在 design 文档全生命周期不变；版本演化时新增 ID，不重用已废弃 ID。稳定 ID 体系的完整定义统一在 `references/overview-template.md`，本处为引用提示。

#### 3.2 产出跨维度映射表骨架

在 §概览和 §实施约束之后、其他章节之前，先产出"跨维度映射表"骨架到 global.md §跨维度映射表章节，作为后续章节产出的锚点。骨架包含 4 类映射表的空表头（具体内容在章节产出后填充）：

- `api-field-to-database-column-mapping`：API 请求/响应字段 ↔ 数据库表字段映射表
- `api-error-to-ui-state-mapping`：API 错误码 ↔ UI 交互状态机映射表
- `test-case-to-contract-coverage`：测试用例 ↔ 维度契约元素覆盖追溯表
- `ui-component-to-api-endpoint-mapping`：UI 组件 ↔ API 端点映射表

骨架产出后，每个子代理产出章节片段时同步填充对应映射表行项，确保一致性在产出过程中即时维护。映射表模板详见 `references/cross-dimension-mapping.md`。

### 阶段 4：调度子代理产出契约

按确认的维度清单和新调度策略（全局维度并行 + 模块并行），调度专精子代理产出设计契约章节片段。

#### 4.1 两阶段调度策略（全局维度并行 + 模块并行）

采用两阶段调度（阶段 1 全局维度并行 + 阶段 2 模块并行 + 阶段 3 自动索引与校验），生成时即拆分，全程无中间大文件：

**阶段 1：全局维度并行（每全局维度 1 次调用，全并行）**

全局维度子代理（@architecture-designer、@security-designer、@observability-designer、@non-functional-designer、@ui-design-spec）并行产出 global.md 对应章节片段：
- @architecture-designer → global.md §系统架构
- @security-designer → global.md §安全
- @observability-designer → global.md §可观测性
- @non-functional-designer → global.md §非功能
- @ui-design-spec → global.md §设计规范

各子代理产出章节片段后，主代理合并写入 global.md。global.md ≤ 300 行，超限时禁止压缩内容，按数字顺序分片为 `global-1.md`、`global-2.md`、...，每片 ≤ 300 行。

**阶段 2：模块并行（每模块 1 个 agent，模块内串行产出章节片段）**

按 architecture 章节中的模块划分，每个模块分配一个 agent，所有模块并行执行。每个模块 agent 内部串行产出各维度独立文件 `modules/<NN>-<m>/api.md`、`database.md`、`ui-ux.md`、`test-cases.md`，无需合并：
1. @api-designer → `modules/<NN>-<m>/api.md`
2. @database-designer → `modules/<NN>-<m>/database.md`（依赖 api.md 数据模型）
3. @ui-ux-designer → `modules/<NN>-<m>/ui-ux.md`（依赖 api.md 响应字段）
4. @test-cases-designer → `modules/<NN>-<m>/test-cases.md`（依赖 api.md + database.md + ui-ux.md）

各维度子代理直接产出独立文件，无需合并。各维度文件 ≤ 500 行；超限时禁止压缩内容，按语义前缀 + 数字顺序分片（如 `modules/<NN>-<m>/api-1.md`、`api-2.md`...），每片 ≤ 500 行，在 `##` 章节边界切分保持片内语义完整。

**阶段 3：自动索引 + 一致性校验 + 数字顺序分片**

主代理自动生成 `index.md`（无行数限制，纯索引），执行跨模块一致性校验（阶段 5），对超限模块文件执行数字顺序分片。

#### 4.2 并行子代理调度

**阶段 1 调度（全局维度并行）：** 在同一轮回复中一次性发出所有全局维度的 Task 调用。每个子代理传入：
- prd 内容摘要
- ae:grill 追问结果
- global.md §概览上下文（稳定 ID 体系）
- 契约模板路径

子代理产出章节片段返回，主代理合并写入 global.md 对应章节。即时校验 global.md ≤ 300 行。

**阶段 2 调度（模块并行，模块内串行）：** 从 global.md §系统架构读取模块划分，为每个模块创建一个 agent。所有模块 agent 并行启动，每个 agent 内部串行调用 4 个维度子代理：

每个维度子代理传入：
- prd 内容摘要
- ae:grill 追问结果
- global.md 上下文（§概览 + §系统架构 + §安全 + §设计规范，提供全局上下文和共享契约）
- 该模块的实体清单
- 跨模块引用目标（ID 引用，不加载其他模块的文件）

子代理产出各维度独立文件返回，直接写入对应维度文件 `modules/<NN>-<m>/<dimension>.md`。即时校验行数 ≤ 500 行，超限标记待语义前缀 + 数字顺序分片。

**阶段 3 调度（自动索引 + 校验 + 分片）：** 主代理汇总所有模块文件，生成 index.md，执行一致性校验（阶段 5），对超限模块执行数字顺序分片。

子代理产出后返回：
- 章节片段内容（全局维度）或独立维度文件内容（模块维度）
- 稳定 ID 列表
- 跨维度映射表行项

#### 4.3 主代理汇总

**所有子代理执行完毕后**，主代理统一汇总：
- 生成 index.md（自动索引，无行数限制，记录 global.md + 所有 modules/<NN>-<m>/ 下各维度文件的清单和章节索引）
- 更新 global.md §概览的产物清单
- 更新跨维度映射表对应行项
- 记录稳定 ID 列表
- 检查跨模块一致性（字段对齐、状态机映射等）

**关键约束：** index.md 和 global.md §跨维度映射表由主代理在所有子代理执行完毕之后单独生成，子代理不直接修改 index.md。

#### 4.4 行数校验（即时校验，非最终校验）

**生成时拆分原则：** 子代理直接按模块产出独立维度文件，不产出大文件再后置拆分。

**即时校验机制：**
- global.md：全局维度章节合并后即时校验 ≤ 300 行，超限禁止压缩内容，按数字顺序分片为 `global-1.md`、`global-2.md`、...，每片 ≤ 300 行
- modules/<NN>-<m>/ 各维度文件即时校验 ≤ 500 行
  - 校验通过 → 完成
  - 校验不通过 → 禁止压缩内容，按语义前缀 + 数字顺序分片（如 `modules/<NN>-<m>/api-1.md`、`api-2.md`...），每片 ≤ 500 行，在 `##` 章节边界切分保持片内语义完整
- index.md：无行数限制

**语义前缀 + 数字顺序分片：** 各维度文件 ≥ 500 行时，禁止压缩内容，按语义前缀 + 数字顺序分片为：
- `modules/<NN>-<m>/api-1.md`（api 第 1 片，≤ 500 行）
- `modules/<NN>-<m>/api-2.md`（api 第 2 片，≤ 500 行）
- `modules/<NN>-<m>/database-1.md`（database 第 1 片，≤ 500 行）
- ...以此类推

global.md ≥ 300 行时，禁止压缩内容，按数字顺序分片为 `global-1.md`、`global-2.md`、...，每片 ≤ 300 行。

分片在 `##` 章节边界切分，保持片内语义完整。分片文件名数字固定顺序，`index.md` 记录所有分片文件清单。

**保留的机制：**
- 即时行数校验（每生成一个文件校验一次，超限按数字顺序分片，禁止压缩内容）
- heading_chain（跨文件语义追溯）
- 跨模块引用校验（阶段 5，只读索引）

产物结构规范见 `references/design-output-template.md`。

### 阶段 5：跨模块一致性校验

产出全部章节后，执行跨模块一致性校验（结构守门 + 轻量语义守门，覆盖模块间映射）：

**结构守门（映射表存在性与完整性）：**

1. **4 类映射表存在且非空** - api-field-to-database-column-mapping、api-error-to-ui-state-mapping、test-case-to-contract-coverage、ui-component-to-api-endpoint-mapping 必须存在且非空（维度未产出时标注 N/A 并说明理由）
2. **global.md 跨维度映射表 ↔ 实际内容一致性** - 映射表必须与实际产出的章节内容对齐
3. **global.md 依赖关系完整性** - global.md 记录的跨模块依赖必须覆盖实际存在的一致性约束
4. **test-cases 覆盖完整性** - 各模块 test-cases.md 必须覆盖该模块 api.md + database.md + ui-ux.md 的关键场景

**轻量语义守门（映射表行项内容对齐）：**

5. **api ↔ database 字段对齐** - 同模块内 §API 请求/响应字段与 §Database 表字段逐行对齐：字段名映射完整、类型可无损转换（不可无损转换的必须标注转换规则）、`required` ↔ `NOT NULL` 约束对齐
6. **api 错误码 ↔ ui-ux 状态机映射一致性** - §API 定义的所有错误码必须在映射表中有对应行项；映射的 UI 状态必须是 §UI/UX 状态机中实际存在的状态；状态转换路径在状态机中有定义且闭合
7. **test-cases 用例 ↔ 契约元素覆盖追溯** - 每个 P0/P1 用例至少有 1 条追溯记录，追溯的契约元素 ID 必须在实际章节中存在
8. **ui-ux ↔ api 端点对齐** - 提交数据的交互组件必须映射到对应 api 端点；组件"所需字段"与 api 响应字段对齐（字段名、可选性）
9. **实施约束与 architecture/api 一致性** - global.md §实施约束的目录结构约定与 §系统架构模块边界表对齐、环境变量清单与认证授权流程对齐

**模块间逻辑协调性（映射表之外的一致性约束）：**

10. **architecture ↔ api** - global.md §系统架构模块边界与各模块 §API 接口分组一致
11. **security ↔ database** - global.md §安全数据分级与各模块 §Database 敏感字段标注对齐
12. **observability ↔ architecture** - global.md §可观测性指标体系覆盖 §系统架构关键数据流
13. **non-functional ↔ architecture** - global.md §非功能性能目标与 §系统架构技术选型可行
14. **design-spec ↔ ui-ux** - 各模块 §UI/UX 章节中的设计读数、三旋钮取值和负向设计空间必须与 global.md §设计规范产出的设计决策包一致；design-spec 是 ui-ux 的前置依赖，产出 global.md §设计规范供审查追溯，同时透传给 `@ui-ux-designer`
15. **技术栈选型 ↔ 各章节契约** - 技术实现路线约束（核心原则 12）中确定的前端/后端/数据层/基础设施技术栈选型必须与各章节契约一致：§系统架构模块边界与后端技术栈匹配、§API 接口风格与后端 API 风格选型匹配、§Database 表结构与数据层技术栈选型匹配、§UI/UX 技术栈声明与前端技术栈选型匹配、§安全认证授权模型与后端认证授权选型匹配、§可观测性监控/日志方案与基础设施技术栈选型匹配、§非功能并发模型/缓存策略与后端/数据层技术栈选型匹配

发现不一致时，在此阶段修复后再进入 review 闭环。映射表缺失时补全，映射表与内容不一致时以内容为准更新映射表。语义对齐问题（字段类型不兼容、状态机路径断裂、追溯 ID 不存在等）在此阶段修复，减少 review 阶段发现量。

### 阶段 6：技能内 review 闭环

产出 design 契约集后，强制调用 `ae:review` 审查本技能产物，形成技能内闭环。

#### 6.1 调用 ae:review

调用方式：
```
ae:review mode=headless domain=document <design-dir>/index.md
```

审查者：`design-integrity-reviewer`（激活条件：hasDesignContract=true）

传入参数：
- `has_design_contract=true`
- `document_type=design`
- `targets=<产出的文件列表：index.md, global.md, modules/**/*.md>`

ae:review 内部调用时不输出下一步引导（D13），由 ae:design 自身负责。

#### 6.2 置信度门控（替代硬性不镀金）

设计阶段适用置信度门控，替代硬性不镀金判定。每个潜在的设计发现/建议计算置信度：

```
confidence = 0.5 × 需求明确提及 + 0.3 × 工程基线必要性 + 0.2 × 缺失后果严重度
```

- **confidence ≥ 0.8** → 产出为正式发现（P0/P1/P2）
- **0.5 ≤ confidence < 0.8** → 产出为 INFO 级别工程建议（不阻断，供参考）
- **confidence < 0.5** → 不产出

**审查范围约束（硬约束）：** 审查设计文档时严格按需求范围，禁止无边界镀金。需求（prd）没有提及的一律不报告为发现。仅在需求范围内按置信度门控产出发现和建议。

#### 6.3 auto 修复范围

ae:review 的 auto 修复范围：
- 章节缺失（必产出维度未产出或章节不完整）
- token 定义不全（§UI/UX 章节的设计 token 缺失字段）
- 契约字段模糊（如"高性能"未量化、"适当缓存"未定义策略）
- 跨模块不一致（§API 与 §Database 字段不对齐等）

#### 6.4 收敛协议（D9）

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
- **不画真实视觉稿** - §UI/UX 章节用结构化描述（布局家族、组件契约、token），不画像素级视觉稿
- **不扩展需求边界** - prd 冻结后，design 不得擅自扩展范围，越界项回退 prd 决策
- **主代理不直接产出维度契约** - 除 global.md 全局章节和跨维度映射表外，维度契约必须由对应子代理产出（全局维度产出章节片段，模块维度产出独立维度文件）
- **技术栈选型必须经过审查** — 引入的第三方依赖必须标注社区活跃度和采用理由，禁止引入长期不活跃或小众依赖（见核心原则 11、12）

## 验证方式

- 技能内 review 闭环通过（无新增 P0/P1）
- 跨模块一致性校验通过
- 每个章节契约达到可还原标准
- 技术实现路线约束满足（前端/后端/数据层/基础设施各层技术栈已明确且章节间无矛盾）
- ae:grill 追问完成（或用户明确选择跳过），设计决策已达成共识或已记录跳过原因
- 置信度门控已应用（≥0.8 产出发现，0.5-0.8 INFO 建议，<0.5 不产出）

## 产物结构

产物目录结构、index.md 纯索引模板、global.md 模板和 modules/<NN>-<m>/ 下各维度文件模板详见 `references/design-output-template.md`。产物目录结构如下：

```
ae/designs/<name>-YYYY-MM-DD/
├── index.md              # 自动生成纯索引（无行数限制）
├── global.md             # 全局设计共识单文件（≤ 300 行，超限数字分片）
│   ├── §概览
│   ├── §系统架构          # @architecture-designer 产出
│   ├── §安全              # @security-designer 产出
│   ├── §可观测性          # @observability-designer 产出
│   ├── §非功能            # @non-functional-designer 产出
│   ├── §设计规范          # @ui-design-spec 产出
│   ├── §实施约束
│   └── §跨维度映射表
└── modules/
    ├── 01-<m1>/          # 模块子目录（数字序号 + 模块名）
    │   ├── api.md        # @api-designer 产出（≤ 500 行，超限 → api-1.md...）
    │   ├── database.md   # @database-designer 产出（≤ 500 行，超限 → database-1.md...）
    │   ├── ui-ux.md      # @ui-ux-designer 产出（≤ 500 行，超限 → ui-ux-1.md...）
    │   └── test-cases.md # @test-cases-designer 产出（≤ 500 行，超限 → test-cases-1.md...）
    ├── 02-<m2>/
    │   ├── api.md
    │   ├── database.md
    │   ├── ui-ux.md
    │   └── test-cases.md
    └── ...
```

**模块各维度文件内容边界：** `api.md` 含 §API；`database.md` 含 §Database；`ui-ux.md` 含 §UI/UX；`test-cases.md` 含 §Test Cases。每个维度文件仅当对应维度存在时产出，不存在即显式否定。禁止出现需求条目/验收标准/原型等产品逻辑层内容。

**数字分片：** 各维度文件 ≤ 500 行；超限禁止压缩内容，按语义前缀 + 数字顺序分片（如 `modules/<NN>-<m>/api-1.md`、`api-2.md`...），每片 ≤ 500 行。global.md ≥ 300 行 → 禁止压缩内容，按数字顺序分片为 `global-1.md`、`global-2.md`、...，每片 ≤ 300 行。分片在 `##` 章节边界切分，分片文件名数字固定顺序。

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
