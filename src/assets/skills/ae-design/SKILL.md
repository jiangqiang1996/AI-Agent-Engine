---
name: ae:design
description: "设计阶段：澄清设计决策并产出设计文档，含概览、架构、接口、数据模型、测试用例与验收标准，供实施和审查对齐"
argument-hint: "[需求文档路径|design|裸描述] [dimensions=architecture,database] [refactor=true]"
---

# 创建设计契约

**注意：当前年份是 2026 年。** 在为设计文档标注日期时使用此年份。

`ae:prd` 定义**做什么**。`ae:design` 定义**怎么设计**。`ae:work` 执行设计。

`ae:design` 是设计契约冻结阶段，按需产出覆盖完整软件工程的可还原设计契约集。每个契约达到"任意 AI 据此生成一致性产物"的可还原标准。

此工作流的持久输出是一份**设计文档**（`ae/designs/<需求描述名>-YYYY-MM-DD/` 目录，含总览层按方向拆分的独立文件 + `modules/<NN>-<m>/` 下各维度独立文件）。它不是汇报材料；只记录后续实施必须知道的设计决策、架构约束、接口契约、数据模型和实现单元，使 ae:work 不需要再发明这些内容。

此技能不实现代码。它澄清设计决策并记录契约，供 ae:work 执行使用。

**重要：生成的文档中所有文件引用必须使用仓库相对路径（例如 `src/models/user.rb`），绝不能使用绝对路径。**

## 核心原则

1. **先评估维度** - 根据 prd 时段标注和任务特征匹配相应的必产出和选产出维度。
2. **做设计伙伴** - 建议替代方案、质疑假设、探索假设情境，而不是仅仅记录决策。
3. **在此解决设计决策** - 架构选型、接口契约、数据模型、UI/UX 规格属于此工作流。实现单元拆解也在此产出；具体代码实现属于 ae:work 职责。
4. **契约可还原** - 每个维度契约必须达到"任意 AI 据此生成一致性产物"的标准，禁止模糊表述。
5. **合理调整 MVCE 覆盖深度** - 简单的任务获得紧凑的契约集，较大的任务获得更完整的契约集。轻量级任务可省略可选 MVCE（最小可验证契约元素）项，但必产出维度的核心 MVCE 不得省略。**核心 MVCE 判定标准：** 该契约元素缺失会导致 ae:work 无法继续实施或 ae:review 无法验证一致性 → 核心；该契约元素缺失只会降低设计质量但不阻塞下游 → 可选。每个维度的 MVCE 清单中标注 `[核心]` 或 `[可选]`。
6. **跨模块一致性** - overview.md 必须记录模块间依赖；同一模块内 api 数据模型必须与 database 一致；ui-ux 数据展示必须与 api 响应字段对齐；跨模块/跨维度映射表（4 类）必须存在且与内容对齐。
7. **只保留对后续执行有用的设计契约** - 不为了"读起来完整"新增无实际约束力的章节；每个章节内容只有在直接影响实现、测试或审查时才记录。
8. **总览层按方向拆分为独立文件** - 全局维度由对应的专精子代理产出独立文件（architecture.md / security.md / observability.md / non-functional.md / design-spec.md），主代理产出 overview.md + constraints.md + cross-mapping.md。模块维度由对应的专精子代理产出独立维度文件（modules/<NN>-<m>/ 下各维度文件）。采用两阶段调度：阶段 1 全局维度并行，阶段 2 模块并行。
9. **子代理产出各维度独立文件** - 不同维度的设计契约由对应的专精子代理产出独立维度文件，而非章节片段合并到单文件。
10. **使用 ae:grill 追问** - 在产出契约前，推荐使用 `ae:grill` 技能逐个追问设计决策，一问一答推进直到达成共识。用户可选择跳过。
11. **技术栈依赖审查** - 设计中关于技术栈的选型禁止引入长期不活跃或 stars 数量较少的小众依赖。技术选型理由表中每个引入的第三方依赖必须标注其社区活跃度（最近发布时间、stars 量级）和采用理由；优先选择社区活跃、生态成熟、维护稳定的依赖。具体判定标准见 `references/architecture-template.md` 技术选型理由章节。
12. **技术实现路线约束（硬约束）** - 设计阶段必须明确技术实现路线，覆盖前端、后端、数据层、基础设施等各时段：
    - **前端技术栈**：明确前端框架（React/Vue/Angular/Svelte 等）、UI 组件库（Ant Design/Element Plus/MUI 等）、CSS 方案（Tailwind/CSS Modules/Styled Components 等）、路由方案、状态管理方案、构建工具、图标库、字体方案；标注版本范围和选型理由。
    - **后端技术栈**：明确后端语言与框架（Spring Boot/Express/FastAPI/Django 等）、ORM/数据访问层、认证授权方案、API 风格（REST/GraphQL/RPC）、中间件选型；标注版本范围和选型理由。
    - **数据层技术栈**：明确数据库类型与版本（MySQL/PostgreSQL/MongoDB/Redis 等）、缓存方案、消息队列、搜索引擎；标注选型理由。
    - **基础设施技术栈**：明确部署方式（Docker/K8s/Serverless 等）、CI/CD 方案、监控方案、日志方案；标注选型理由。
    - **来源优先级**：若 prd 文档中用户已明确指定技术栈，设计必须遵循该约束，不得擅自更换；若 prd 未指定，设计阶段通过 ae:grill 追问或基于项目已有技术栈推断确定，推断依据必须记录在 ADR 中。
    - **真源位置**：全局技术栈选型决策记录在 architecture.md 的 ADR 中；前端技术栈详细信息集中在 architecture.md 的"前端技术栈声明"章节；后端/数据层/基础设施技术栈详细信息记录在 architecture.md 中；constraints.md 记录环境变量、依赖版本和配置项。各模块文件引用 architecture.md ADR 中的技术栈决策 ID，不重复记录选型决策。
    - **一致性约束**：技术栈选型确定后，各模块的 api/database/ui-ux/security 章节及 architecture/security/observability/non-functional 章节必须与该选型一致，禁止出现技术栈矛盾。
13. **优先使用 Mermaid 图示** - 设计文档中的所有图示（系统上下文图、ER 模型、数据流图、部署拓扑图等）优先使用 Mermaid 语法绘制；Mermaid 无法表达的复杂注释场景可使用 ASCII 制图作为降级方案。
14. **页面设计技术栈隔离（硬约束）** - ui-ux.md 中，技术栈信息（前端框架、UI 组件库、CSS 方案、图标库、字体、路由方案、第三方依赖等）必须集中在 ui-ux.md 的"技术栈声明"章节中统一记录。模块 pages/ 下页面文件禁止散落技术栈或第三方依赖名称，只描述页面结构、交互行为、组件实例化和样式片段。技术栈声明章节是技术选型的唯一真源，页面产物通过组件 ID 引用全局组件清单，不直接引用技术栈名称。
15. **页面设计关注组件复用（硬约束）** - ui-ux 章节的详细设计必须主动关注组件复用，而非仅为每个页面独立产出 HTML 片段。设计时必须：（1）扫描项目已有组件资产，优先复用已有组件而非新建；（2）识别跨页面重复的 UI 结构，抽取为共享组件并纳入全局组件清单；（3）对每个组件明确标注来源（已有复用 / 技术栈库引入 / 新建自研）和复用理由；（4）页面文件通过组件 ID 引用全局组件，不内联重复的 HTML 结构。组件复用策略集中记录在 ui-ux.md 的"组件复用策略"章节，确保 ae:work 实施时不重复造轮子。
16. **自包含约束（硬约束）** - 设计文档目录完全自包含，禁止引用外部工作空间文件。目录内文件只通过稳定 ID 相互引用。版本演化 = 独立新目录，不指向旧版本目录。
17. **无行数限制** - 单个文件不限制大小，不产出 `index.md`、不分片。
18. **无变更追踪** - 不维护变更链，版本演化 = 独立新目录。
19. **Frontmatter 极简** - 仅保留 `type`、`ids`（有稳定 ID 时）。

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
- **约束**：`overview` 始终必产出，即使未在 `dimensions` 中列出也会自动包含。显式指定的维度不得与风险触发强制必产出维度冲突。

### refactor

- **格式**：`refactor=true`
- **作用**：将设计模式切换为重构模式，一步到位完成彻底替换，不考虑兼容性和历史技术债务。
- **默认**：未指定时为常规设计模式。
- **使用场景**：已有系统需要彻底重构或技术债治理时使用。
- **行为差异**：重构模式下，设计契约直接定义目标终态，不为兼容旧实现做任何妥协；实现单元拆解以最短路径达成目标终态为优先；测试用例维度侧重验证目标终态行为。涉及数据库变更时，默认考虑数据脚本迁移（DDL/DML/回填/回滚），除非用户明确声明不考虑数据脚本迁移。

## 维度子代理

全局维度由对应的专精子代理产出独立文件，模块维度由对应的专精子代理产出独立维度文件，主代理不直接产出维度内容（overview.md + constraints.md + cross-mapping.md 除外）：

| 维度 | 子代理 | 产出位置 |
|------|--------|---------|
| overview / 实施约束 / 跨维度映射表 | 主代理产出 | `overview.md` + `constraints.md` + `cross-mapping.md` |
| design-spec | `@ui-design-spec` | `design-spec.md`（含设计读数、三旋钮取值、设计体系选择、风格变体推荐、负向设计空间；同时透传给 `@ui-ux-designer`） |
| architecture | `@architecture-designer` | `architecture.md` |
| security | `@security-designer` | `security.md` |
| observability | `@observability-designer` | `observability.md` |
| non-functional | `@non-functional-designer` | `non-functional.md` |
| api | `@api-designer` | `modules/<NN>-<m>/api.md` |
| database | `@database-designer` | `modules/<NN>-<m>/database.md` |
| ui-ux | `@ui-ux-designer` | `modules/<NN>-<m>/ui-ux.md` + `modules/<NN>-<m>/pages/*.md` |
| test-cases | `@test-cases-designer` | `modules/<NN>-<m>/test-cases.md` |

**产物组织：** `overview.md` 位于设计目录根下，包含设计读数、跨模块一致性约束、模块清单与边界。每个全局方向独立文件（`architecture.md` / `security.md` / `observability.md` / `non-functional.md` / `design-spec.md` / `constraints.md` / `cross-mapping.md`）位于设计目录根下。每个模块位于 `modules/<NN>-<m>/` 子目录中（`<NN>` 为零填充数字序号如 01、02、03），子目录名带数字固定顺序。模块下各维度独立文件（`api.md` / `database.md` / `ui-ux.md` / `test-cases.md`），每个维度文件仅当对应维度存在时产出，不存在即省略。涉及 UI 时，模块下 `pages/` 目录包含每个页面的独立文件。维度文件内容边界：禁止出现需求条目/验收标准/原型等产品逻辑层内容。

**硬性约束：主代理严禁直接产出维度契约内容。** overview.md、constraints.md 和 cross-mapping.md 由主代理产出，其他维度必须调度对应子代理产出独立文件。违反此约束属于执行错误。

## 执行流程

### 阶段 0：恢复、识别和路由

#### 0.1 在适当时恢复已有工作

仅从以下来源识别要恢复的设计文档：
- 当前会话上下文中用户明确提到的 design 文件名或路径
- 当前会话中已产出的设计文档
- `ae/designs/` 目录下匹配"需求描述名"的最新日期目录中的 `overview.md`

#### 0.2 识别输入来源

按优先级识别输入：

1. **prd 文档** - 用户提供 `ae/prds/<topic>-YYYY-MM-DD/overview.md` 路径或会话中已产出 prd 文档时，作为首选输入。读取 prd 的时段标注（前端/后端/数据/安全/运维等）用于维度触发判定。
2. **design** - 用户提供 `ae/designs/<name>-YYYY-MM-DD/overview.md` 路径时，作为版本演化输入。读取 overview.md 和 architecture.md，作为新版本的基础。
3. **裸描述** - 用户直接描述设计目标时，降级处理。询问用户是否需要先创建 prd，或直接基于裸描述进行设计。

**"需求描述名"来源规则：**
- prd 文档作为输入时：从 prd 目录名提取（如 `ae/prds/user-auth-2026-06-24/overview.md` → `user-auth`）
- design 作为输入时：从 design 目录名提取（如 `ae/designs/user-auth-2026-06-20/` → `user-auth`）
- 裸描述作为输入时：从用户描述提取关键词转为 kebab-case（如"用户认证系统" → `user-auth`）
- 含特殊字符时强制 kebab-case 转换

#### 0.3 将源文档作为主要输入

如果存在 prd 文档：阅读它，宣布作为源文档，携带所有内容（目标、范围边界、成功标准、时段标注、决策、待定问题）。不要静默省略源内容。

### 阶段 1：维度触发判定

根据 prd 时段标注和**风险维度**，按 `references/dimension-triggers.md` 中的触发规则确定必产出、条件必产出和显式否定维度。主触发逻辑基于风险维度（不可逆决策和变更影响范围）。仅在风险信号无法识别时，原"任务特征"表作为降级参考。

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

对于未触发且不适用的维度，不产出对应文件即可。文件不存在即表示该维度不适用。

#### 1.4 确认维度清单

向用户呈现触发的维度清单（必产出 + 条件必产出），允许用户：
- 确认默认触发的维度
- 勾选额外的选产出维度
- 移除不适用的必产出维度（需说明理由）

### 阶段 2：使用 ae:grill 追问设计决策

维度清单确认后、产出契约之前，**推荐使用 `ae:grill` 技能逐个追问设计决策**。向用户确认是否使用 ae:grill：

- 用户确认使用 → 转交 ae:grill 追问
- 用户选择跳过 → 跳过追问，按已有 prd 需求和维度清单直接产出契约，记录跳过原因

#### 2.1 转交 ae:grill

调用 `ae:grill` 技能时，将以下上下文格式化为文本描述作为 $ARGUMENTS 传入：
- 当前维度清单（必产出 + 条件必产出）
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

> design-spec 不需要 ae:grill 追问。`@ui-design-spec` 有自己的设计决策推断流程。

#### 2.3 追问结果带回

`ae:grill` 追问结束后，将共识清单带回本技能，作为各维度子代理产出的输入。追问结果包含：
- 共识清单（每个关键决策的结论和理由）
- 决策依赖图（各决策之间的依赖关系摘要）
- 遗留风险（共识中仍存在的风险或不确定性）

如果用户在 `ae:grill` 阶段选择跳过某些追问，记录跳过原因，相关维度子代理按默认推荐产出。

### 阶段 3：产出 overview.md 骨架

主代理产出 overview.md 骨架，包含设计读数、跨模块一致性约束、模块清单与边界，作为后续全局维度子代理产出独立文件和模块子代理产出独立维度文件的锚点。

#### 3.1 产出 overview.md（必产出）

overview.md 按 `references/overview-template.md` 模板产出，包含：
- 设计读数（一句话声明设计意图和美学家族）
- 跨模块一致性约束
- 产物清单（本次产出的文件列表）
- 跨模块依赖关系（哪些模块之间有一致性约束）
- 设计决策记录（ADR，记录关键设计决策和理由，使用稳定 ID `ADR-XXX`，从 ae:grill 追问结果提炼）
- 跨维度映射表引用（详见 `references/cross-dimension-mapping.md`）

> 实施约束（环境变量、依赖版本、配置项、目录结构、构建命令）产出到 `constraints.md`，详见 `references/design-output-template.md`。

**稳定 ID 体系：** overview 中的设计条目必须使用稳定 ID，便于 ae:work / ae:review 追溯：
- `ADR-XXX`：架构决策记录（核心）
- `EP-XXX`：API 端点编号（核心）
- `T-XXX`：数据库表名编号（核心）
- `TC-XXX`：测试用例编号（核心）
- `ST-XXX`：UI 交互状态机编号（核心）
- `INT-XXX`：UI 交互行为编号（核心）
- `BR-XXX`：业务规则编号（核心）

稳定 ID 在 design 文档全生命周期不变。稳定 ID 体系的完整定义统一在 `references/overview-template.md`。

#### 3.2 产出 cross-mapping.md 骨架

主代理产出 cross-mapping.md 骨架，包含 4 类映射表的空表头（具体内容在章节产出后填充）：

- `api-field-to-database-column-mapping`：API 请求/响应字段 ↔ 数据库表字段映射表
- `api-error-to-ui-state-mapping`：API 错误码 ↔ UI 交互状态机映射表
- `test-case-to-contract-coverage`：测试用例 ↔ 维度契约元素覆盖追溯表
- `ui-component-to-api-endpoint-mapping`：UI 组件 ↔ API 端点映射表

骨架产出后，每个子代理产出独立文件时同步填充对应映射表行项，确保一致性在产出过程中即时维护。映射表模板详见 `references/cross-dimension-mapping.md`。

### 阶段 4：调度子代理产出契约

按确认的维度清单和新调度策略（全局维度并行 + 模块并行），调度专精子代理产出设计契约独立文件。

#### 4.1 两阶段调度策略（全局维度并行 + 模块并行）

采用两阶段调度（阶段 1 全局维度并行 + 阶段 2 模块并行 + 阶段 3 自动校验），全程无中间大文件：

**阶段 1：全局维度并行（每全局维度 1 次调用，全并行）**

全局维度子代理（@architecture-designer、@security-designer、@observability-designer、@non-functional-designer、@ui-design-spec）并行产出独立文件：
- @architecture-designer → `architecture.md`
- @security-designer → `security.md`
- @observability-designer → `observability.md`
- @non-functional-designer → `non-functional.md`
- @ui-design-spec → `design-spec.md`

**阶段 2：模块并行（每模块 1 个 agent，模块内串行产出各维度独立文件）**

按 architecture.md 中的模块划分，每个模块分配一个 agent，所有模块并行执行。每个模块 agent 内部串行产出各维度独立文件：
1. @api-designer → `modules/<NN>-<m>/api.md`
2. @database-designer → `modules/<NN>-<m>/database.md`（依赖 api.md 数据模型）
3. @ui-ux-designer → `modules/<NN>-<m>/ui-ux.md` + `modules/<NN>-<m>/pages/*.md`（依赖 api.md 响应字段）
4. @test-cases-designer → `modules/<NN>-<m>/test-cases.md`（依赖 api.md + database.md + ui-ux.md）

**阶段 3：自动校验 + 一致性校验**

主代理执行跨模块一致性校验（阶段 5），更新 cross-mapping.md。

#### 4.2 并行子代理调度

**阶段 1 调度（全局维度并行）：** 在同一轮回复中一次性发出所有全局维度的 Task 调用。每个子代理传入：
- prd 内容摘要
- ae:grill 追问结果
- overview.md 上下文（稳定 ID 体系）
- 契约模板路径

子代理产出独立文件返回。

**阶段 2 调度（模块并行，模块内串行）：** 从 architecture.md 读取模块划分，为每个模块创建一个 agent。所有模块 agent 并行启动，每个 agent 内部串行调用维度子代理：

每个维度子代理传入：
- prd 内容摘要
- ae:grill 追问结果
- overview.md + architecture.md + design-spec.md 上下文（提供全局上下文和共享契约）
- 该模块的实体清单
- 跨模块引用目标（ID 引用，不加载其他模块的文件）

子代理产出各维度独立文件返回。

#### 4.3 主代理汇总

**所有子代理执行完毕后**，主代理统一汇总：
- 更新 overview.md 的产物清单
- 更新 cross-mapping.md 对应行项
- 记录稳定 ID 列表
- 检查跨模块一致性（字段对齐、状态机映射等）

#### 4.4 主代理产出 constraints.md + cross-mapping.md

主代理产出：
- `constraints.md`：环境变量、依赖版本、配置项、目录结构、构建命令
- `cross-mapping.md`：4 类跨维度映射表 + 跨模块映射

### 阶段 5：跨模块一致性校验

产出全部文件后，执行跨模块一致性校验（结构守门 + 轻量语义守门，覆盖模块间映射）：

**结构守门：**

1. **4 类映射表存在且非空** - api-field-to-database-column-mapping、api-error-to-ui-state-mapping、test-case-to-contract-coverage、ui-component-to-api-endpoint-mapping 必须存在且非空（维度未产出时省略对应映射表）
2. **cross-mapping.md ↔ 实际内容一致性** - 映射表必须与实际产出的文件内容对齐
3. **overview.md 依赖关系完整性** - overview.md 记录的跨模块依赖必须覆盖实际存在的一致性约束
4. **test-cases 覆盖完整性** - 各模块 test-cases.md 必须覆盖该模块 api.md + database.md + ui-ux.md 的关键场景

**轻量语义守门：**

5. **api ↔ database 字段对齐** - 同模块内 API 请求/响应字段与 Database 表字段逐行对齐
6. **api 错误码 ↔ ui-ux 状态机映射一致性** - API 定义的所有错误码必须在映射表中有对应行项
7. **test-cases 用例 ↔ 契约元素覆盖追溯** - 每个 P0/P1 用例至少有 1 条追溯记录
8. **ui-ux ↔ api 端点对齐** - 提交数据的交互组件必须映射到对应 api 端点
9. **实施约束与 architecture/api 一致性** - constraints.md 的目录结构约定与 architecture.md 模块边界表对齐

**模块间逻辑协调性：**

10. **architecture ↔ api** - architecture.md 模块边界与各模块 api.md 接口分组一致
11. **security ↔ database** - security.md 数据分级与各模块 database.md 敏感字段标注对齐
12. **observability ↔ architecture** - observability.md 指标体系覆盖 architecture.md 关键数据流
13. **non-functional ↔ architecture** - non-functional.md 性能目标与 architecture.md 技术选型可行
14. **design-spec ↔ ui-ux** - `design-spec.md` 独占设计读数（三旋钮、设计体系、风格变体、负向设计空间），`ui-ux.md` 不得出现设计读数和负向设计空间
15. **技术栈选型 ↔ 各章节契约** - 技术实现路线约束中确定的技术栈选型必须与各章节契约一致

发现不一致时，在此阶段修复后再进入 review 闭环。

### 阶段 6：技能内 review 闭环

产出 design 契约集后，强制调用 `ae:review` 审查本技能产物，形成技能内闭环。

#### 6.1 调用 ae:review

调用方式：
```
ae:review mode=headless domain=document <design-dir>/overview.md
```

审查者：`design-integrity-reviewer`（激活条件：hasDesignContract=true）

传入参数：
- `has_design_contract=true`
- `document_type=design`
- `targets=<产出的文件列表：overview.md, architecture.md, ..., modules/**/*.md>`

ae:review 内部调用时不输出下一步引导，由 ae:design 自身负责。

#### 6.2 置信度门控

设计阶段适用置信度门控，替代硬性不镀金判定。每个潜在的设计发现/建议计算置信度：

```
confidence = 0.5 × 需求明确提及 + 0.3 × 工程基线必要性 + 0.2 × 缺失后果严重度
```

- **confidence ≥ 0.8** → 产出为正式发现（P0/P1/P2）
- **0.5 ≤ confidence < 0.8** → 产出为 INFO 级别工程建议（不阻断，供参考）
- **confidence < 0.5** → 不产出

**审查范围约束（硬约束）：** 审查设计文档时严格按需求范围，禁止无边界镀金。

#### 6.3 auto 修复范围

ae:review 的 auto 修复范围：
- 章节缺失（必产出维度未产出或章节不完整）
- token 定义不全
- 契约字段模糊
- 跨模块不一致

#### 6.4 收敛协议

按收敛协议执行：
- **上限 2 轮** - 最多执行 2 轮 review → auto 修复 → review 循环
- **收敛定义** - 无新增 P0/P1 发现即为收敛
- **未收敛处理** - 2 轮后仍有新增 P0/P1，回退用户澄清

### 阶段 7：下一步推荐技能引导

review 闭环收敛后，显式提示用户下一步推荐技能。

#### 7.1 是否进入 ae:work 判定

设计契约闭环通过后默认进入 `ae:work`。设计中的实现单元、文件范围和验证要求直接作为 ae:work 的输入。

#### 7.2 引导语

| 审查结论 | 推荐下一步技能 | 引导语 |
|---------|---------------|--------|
| 通过 + 复杂任务 | **ae:work** | "设计契约已就绪。任务较复杂，建议使用 `ae:work` 按多单元编排执行。" |
| 通过 + 简单任务 | **ae:work** | "设计契约已就绪。任务较简单，可直接使用 `ae:work` 执行。" |
| 阻断 | **ae:design**（继续） | "设计契约可还原性不达标，已修复/待补充，请继续完善。" |

## 安全边界

- **不做代码实施** - 只记录设计契约和实现单元，不产出可执行代码
- **不生成实际测试代码** - 只设计测试用例契约，不写测试代码
- **不画真实视觉稿** - ui-ux 章节用结构化描述（布局家族、组件契约、token），不画像素级视觉稿
- **不扩展需求边界** - prd 冻结后，design 不得擅自扩展范围，越界项回退 prd 决策
- **主代理不直接产出维度契约** - 除 overview.md、constraints.md 和 cross-mapping.md 外，维度契约必须由对应子代理产出
- **技术栈选型必须经过审查** — 引入的第三方依赖必须标注社区活跃度和采用理由

## 验证方式

- 技能内 review 闭环通过（无新增 P0/P1）
- 跨模块一致性校验通过
- 每个章节契约达到可还原标准
- 技术实现路线约束满足
- ae:grill 追问完成（或用户明确选择跳过）
- 置信度门控已应用

## 产物结构

产物目录结构、overview.md 模板和各维度文件模板详见 `references/design-output-template.md`。产物目录结构如下：

```
ae/designs/<name>-YYYY-MM-DD/
├── overview.md                     # 设计读数、跨模块一致性约束、模块清单
├── architecture.md                 # 系统架构
├── security.md                     # 安全（可选）
├── observability.md                # 可观测性（可选）
├── non-functional.md               # 非功能（可选）
├── design-spec.md                  # 设计规范（可选，涉及 UI 时）
├── constraints.md                  # 实施约束
├── cross-mapping.md                # 跨维度映射表
└── modules/
    └── <NN>-<module-name>/
        ├── api.md                  # API 契约
        ├── database.md             # 数据库契约
        ├── ui-ux.md                # 路由表 + 设计 Token + 组件清单 + 组件定义 + 状态机 + 无障碍 + 组件复用策略
        ├── pages/                   # 每个页面独立文件（涉及 UI 时）
        │   ├── <NN>-<page-name>.md   # 组件放置、字段到组件映射、页面级状态机、页面级响应式行为
        │   └── ...
        └── test-cases.md           # 测试用例契约
```

**各文件内容边界：**

| 文件 | 内容 |
|------|------|
| `overview.md` | 设计读数、跨模块一致性约束、产物清单 |
| `architecture.md` | 技术选型、ADR、模块清单与边界、系统上下文图、跨模块依赖关系图、全局数据流 |
| `security.md` | 威胁模型、认证授权、数据分级、密钥管理 |
| `observability.md` | 日志规范、指标体系、告警规则、SLO/SLI |
| `non-functional.md` | 性能目标、并发模型、事务边界、缓存策略、容量规划 |
| `design-spec.md` | 设计读数（三旋钮）、设计体系选择、风格变体推荐、负向设计空间 |
| `constraints.md` | 环境变量、依赖版本、配置项、目录结构、构建命令 |
| `cross-mapping.md` | 4 类跨维度映射表 + 跨模块映射 |
| `api.md` | 端点清单、TypeScript interface、错误码、版本策略、幂等性 |
| `database.md` | ER 模型、表结构、关系与外键、迁移策略、敏感字段 |
| `ui-ux.md` | 路由表、技术栈声明、设计 Token、组件清单、组件定义、交互状态机总表、无障碍要求、组件复用策略 |
| `pages/<NN>-<page-name>.md` | 页面 ID、路由、组件放置与布局、字段到组件映射、页面级交互状态机、页面级响应式行为 |
| `test-cases.md` | 覆盖矩阵、P0-P3 用例、行为契约规格、维度覆盖追溯 |

**Frontmatter（极简）：**

| 文件 | frontmatter |
|------|------------|
| `overview.md` | `type: design-overview` |
| `architecture.md` | `type: design-architecture`, `ids` |
| `security.md` | `type: design-security`, `ids` |
| `observability.md` | `type: design-observability`, `ids` |
| `non-functional.md` | `type: design-non-functional`, `ids` |
| `design-spec.md` | `type: design-spec`, `ids` |
| `constraints.md` | `type: design-constraints` |
| `cross-mapping.md` | `type: design-cross-mapping` |
| `api.md` | `type: design-api`, `ids` |
| `database.md` | `type: design-database`, `ids` |
| `ui-ux.md` | `type: design-ui-ux`, `ids` |
| `pages/<NN>-<page-name>.md` | `type: design-page`, `ids` |
| `test-cases.md` | `type: design-test-cases`, `ids` |

**去重规则：** `design-spec.md` 独占设计读数（三旋钮、设计体系、风格变体、负向设计空间）；`ui-ux.md` 不再重复设计读数，只含代码级 UI 设计内容。

设计维度契约模板详见 `references/` 目录下各维度的独立模板文件。
