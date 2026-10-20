---
name: ae-design
description: 设计阶段：创建新设计或修改已有设计，澄清设计决策并产出设计文档，含概览、架构、接口、数据模型、测试用例与验收标准，供实施和审查对齐
license: GPL-3.0-or-later
compatibility: 需要 Node.js 18+ 以运行本技能附带脚本；其余依赖见正文"环境要求"章节
metadata:
  author: ae-skills
  version: 1.0.0
  ae-group: 需求与设计
---

# 创建或修改设计契约

**注意：当前年份是 2026 年。** 在为设计文档标注日期时使用此年份。

`ae-prd` 定义**做什么**。`ae-design` 定义**怎么设计**。`ae-work` 执行设计。

`ae-design` 统一处理创建新设计和修改已有设计：输入指向已有设计文档时，读取该设计作为基础并全量重新生成；输入为 prd 文档或新描述时，创建新设计。定版是人为约定，无需技术标记——用户通过选择 `ae-design`（修改已有）或重新运行 `ae-design`（创建新设计）表达当前状态。

`ae-design` 是设计契约冻结阶段，按需产出覆盖完整软件工程的可还原设计契约集。每个契约达到"任意 AI 据此生成一致性产物"的可还原标准。

持久产物是一份**设计文档**（`ae/design/<需求描述名>-YYYY-MM-DD/` 目录，含总览层按方向拆分的独立文件 + `modules/<NN>-<m>/` 下各维度独立文件）。它不是汇报材料；只记录后续实施必须知道的设计决策、架构约束、接口契约、数据模型和实现单元，使 ae-work 不需要再发明这些内容。

本技能不实现代码。它澄清设计决策并记录契约，供 ae-work 执行使用。

**重要：产物中所有文件引用必须使用仓库相对路径（例如 `src/models/user.rb`），绝不能使用绝对路径。**

## 何时使用

- 用户要新建一份设计契约（系统、模块、接口、数据模型、UI 规格、测试用例）。
- 用户要修改已有设计：传入已有设计文档路径作为基础，全量重新生成。
- 上游已有 prd 文档，需要把需求转成可实施的设计契约。
- 需求触发了不可逆决策（API 签名、schema、认证模型、模块划分），需要冻结设计口径。

## 何时不使用

- 需求本身还没澄清 —— 先用 `ae-prd` 定义"做什么"。
- 只想写代码 —— 直接用 `ae-work` 执行已有设计。
- 只需要一次性问答、调研或说明材料 —— 本技能产出的是契约集。
- 与软件设计无关的任务。

## 输入契约

### 功能描述

<用户输入>

（用户输入为本次任务描述。若为空，先向用户询问："您想设计什么？请描述您正在考虑的功能、系统或改进，或提供需求文档路径。"）

在获得用户的设计描述之前不要继续。

### 参数说明

除位置参数（需求文档路径、design 路径或裸描述）外，支持以下命名参数：

#### dimensions

- **格式**：`dimensions=<维度1>,<维度2>,...`
- **作用**：传入时只生成指定维度的设计契约；不传时根据 prd 时段标注、风险信号和任务特征自动选择维度。
- **可选值**：`overview`、`architecture`、`api`、`database`、`ui-ux`、`design-spec`、`test-cases`、`security`、`observability`、`non-functional`
- **默认**：未指定时按阶段 1 的风险维度触发规则自动确定维度清单。
- **使用场景**：用户明确知道只需要部分维度时，跳过不必要的维度触发判定。
- **约束**：`overview` 始终必产出，即使未在 `dimensions` 中列出也会自动包含。显式指定的维度不得与风险触发强制必产出维度冲突。

#### refactor

- **格式**：`refactor=true`
- **作用**：将设计模式切换为重构模式，一步到位完成彻底替换，不考虑兼容性和历史技术债务。
- **默认**：未指定时为常规设计模式。
- **使用场景**：已有系统需要彻底重构或技术债治理时使用。
- **行为差异**：重构模式下，设计契约直接定义目标终态，不为兼容旧实现做任何妥协；实现单元拆解以最短路径达成目标终态为优先；测试用例维度侧重验证目标终态行为。涉及数据库变更时，默认考虑数据脚本迁移（DDL / DML / 回填 / 回滚），除非用户明确声明不考虑数据脚本迁移。

### 输入识别

按优先级识别输入来源：

1. **prd 文档** - 用户给出 `ae/prd/<topic>-YYYY-MM-DD/overview.md` 路径，或会话中已有 prd 文档时，作为首选输入。读取 prd 的时段标注用于维度触发判定。
2. **design** - 用户给出 `ae/design/<name>-YYYY-MM-DD/overview.md` 路径时，作为修改已有设计的输入。读取 overview.md 和 architecture.md，作为全量重新生成的基础。
3. **裸描述** - 用户直接描述设计目标时降级处理：询问用户是否需要先创建 prd，或直接基于裸描述进行设计。

**"需求描述名"来源规则：**

- prd 文档作为输入时：从 prd 目录名提取（如 `ae/prd/user-auth-2026-06-24/overview.md` → `user-auth`）
- design 作为输入时：从 design 目录名提取（如 `ae/design/user-auth-2026-06-20/` → `user-auth`）
- 裸描述作为输入时：从用户描述提取关键词转为 kebab-case（如"用户认证系统" → `user-auth`）
- 含特殊字符时强制 kebab-case 转换

如果存在 prd 文档：阅读它，宣布作为源文档，携带所有内容（目标、范围边界、成功标准、时段标注、决策、待定问题）。不要静默省略源内容。

### 核心原则与交互规则

20 条核心原则（先评估维度、契约可还原、跨模块一致性、技术实现路线约束、页面技术栈隔离、组件复用、自包含、存量项目感知等）见 `references/design-principles.md`，执行前逐条自检。

交互规则：一次只问一个问题；选择方向 / 优先级 / 下一步时优先单选，多选仅用于可共存集合；提问时使用宿主的交互式提问能力（常见别名 AskUserQuestion / question）。输出保持简洁，引用文件一律用仓库相对路径。

## 执行工作流

### 阶段 0：恢复、识别和路由

- 仅从以下来源识别要恢复的设计文档：当前会话上下文中用户明确提到的 design 文件名或路径；当前会话中已产出的设计文档；`ae/design/` 目录下匹配"需求描述名"的最新日期目录中的 `overview.md`。
- 创建新设计 vs 修改已有设计：输入指向已有 design 路径时，读取该设计作为基础并全量重新生成；输入为 prd 文档或新描述时，创建新设计。

### 阶段 1：维度触发判定

按 `references/dimension-triggers.md` 的触发规则确定必产出、条件必产出和显式否定维度。主触发逻辑基于风险维度（不可逆决策和变更影响范围），仅在风险信号无法识别时，"任务特征"表作为降级参考。

风险信号识别清单（任一命中即触发对应风险维度）：

- **不可逆决策风险**：API 签名变更、数据模型 schema 变更、认证模型变更 → 强制必产出 api、database、security
- **结构性变更风险**：新增模块、跨模块依赖调整、公共配置修改 → 强制必产出 overview、architecture
- **用户界面变更风险**：页面新增、交互流程调整、UI 组件复用 → 强制必产出 overview、design-spec、ui-ux、test-cases
- **数据持久化风险**：新建表、字段变更、迁移脚本 → 强制必产出 overview、database、test-cases
- **用户数据输入**（条件必产出）：涉及用户提交数据 → security 提升为必产出
- **生产部署**（条件必产出）：涉及生产环境部署或变更 → observability 提升为必产出
- **性能敏感**（条件必产出）：涉及高并发 / 大数据量 / 实时性 → non-functional 提升为必产出

> design-spec 没有独立的风险信号触发条目，它作为 ui-ux 的附属维度出现在必产出列表中。当 ui-ux 被触发时，design-spec 自动作为其前置依赖执行。

从 prd 读取"涉及时段"字段和需求条目中的风险信号；prd 无时段标注时，通过交互询问用户确认风险维度。

**显式否定机制：** 对于未触发且不适用的维度，不产出对应文件即可。文件不存在即表示该维度不适用。

**确认维度清单：** 向用户呈现触发的维度清单（必产出 + 条件必产出），允许用户确认默认触发维度、勾选额外的选产出维度，或移除不适用的必产出维度（需说明理由）。

### 阶段 2：ae-grill 追问设计决策

维度清单确认后、产出契约之前，推荐使用 `ae-grill` 技能逐个追问设计决策，一问一答推进直到达成共识。

- 用户确认使用 → 转交 ae-grill 追问
- 用户选择跳过 → 跳过追问，按已有 prd 需求和维度清单直接产出契约，记录跳过原因

追问范围、上下文移交格式与追问结果带回方式见 `references/grill-handoff.md`。

### 阶段 3：产出 overview.md 骨架

主流程产出 overview.md 骨架，作为后续全局维度与模块维度角色卡的锚点。overview.md 按 `references/overview-template.md` 产出，包含：

- 设计读数（一句话声明设计意图和美学家族）
- 跨模块一致性约束
- 产物清单（本次产出的文件列表）
- 跨模块依赖关系（哪些模块之间有一致性约束）
- 设计决策记录（ADR，稳定 ID `ADR-XXX`，从 ae-grill 追问结果提炼）
- 跨维度映射表引用（详见 `references/cross-dimension-mapping.md`）

**稳定 ID 体系：** `ADR-XXX`（架构决策）、`EP-XXX`（API 端点）、`T-XXX`（数据库表）、`TC-XXX`（测试用例）、`ST-XXX`（UI 交互状态机）、`INT-XXX`（UI 交互行为）、`BR-XXX`（业务规则）、`COMP-XXX`（UI 组件）、`PAGE-XXX`（页面）。稳定 ID 在 design 文档全生命周期不变，完整定义见 `references/overview-template.md`。

同时产出 cross-mapping.md 骨架，包含 4 类映射表的空表头（内容在章节产出后填充）：`api-field-to-database-column-mapping`、`api-error-to-ui-state-mapping`、`test-case-to-contract-coverage`、`ui-component-to-api-endpoint-mapping`。映射表模板详见 `references/cross-dimension-mapping.md`。

### 阶段 4：调度角色卡产出契约

角色卡索引、并行 / 降级范式与调度顺序见 `references/role-dispatch.md`。

| 维度 | 角色卡 | 产出位置 |
|------|--------|---------|
| overview / 实施约束 / 跨维度映射表 | 主流程产出（不调度角色卡） | `overview.md` + `constraints.md` + `cross-mapping.md` |
| design-spec | `references/roles/spec-author.md` | `design-spec.md` |
| architecture | `references/roles/architecture-designer.md` | `architecture.md` |
| security | `references/roles/security-designer.md` | `security.md` |
| observability | `references/roles/observability-designer.md` | `observability.md` |
| non-functional | `references/roles/non-functional-designer.md` | `non-functional.md` |
| api | `references/roles/api-designer.md` | `modules/<NN>-<m>/api.md` |
| database | `references/roles/database-designer.md` | `modules/<NN>-<m>/database.md` |
| ui-ux | `references/roles/ui-designer.md` | `modules/<NN>-<m>/ui-ux.md` + `modules/<NN>-<m>/pages/*.md` |
| test-cases | `references/roles/test-cases-designer.md` | `modules/<NN>-<m>/test-cases.md` |

**全局维度并行**（architecture / security / observability / non-functional / design-spec），**模块并行**（单个模块内部按 api → database → ui-ux → test-cases 串行）。

若宿主支持子代理派发能力，将上述角色卡**并行**分派，每卡一份独立上下文；若不支持，则在当前会话内**顺序**执行同一批角色卡，产出格式不变。

**硬性约束：主流程严禁直接产出维度契约内容。** overview.md、constraints.md 和 cross-mapping.md 由主流程产出，其他维度必须由对应角色卡产出独立文件。违反此约束属于执行错误。

### 阶段 5：跨模块一致性校验

按 `references/consistency-checks.md` 执行结构守门（4 类映射表存在且非空、映射表与实际内容一致、overview 依赖关系完整、test-cases 覆盖完整）与轻量语义守门（api ↔ database 字段对齐、错误码 ↔ 状态机映射、用例 ↔ 契约元素追溯、ui-ux ↔ api 端点对齐、实施约束一致）。

发现不一致时，在此阶段修复后再进入 review 闭环。

### 阶段 6：技能内 review 闭环

产出 design 契约集后，强制调用 `ae-review` 审查本技能产物，形成技能内闭环。置信度门控、auto 修复范围与收敛协议见 `references/review-loop.md`。

### 阶段 7：下一步推荐技能引导

review 闭环收敛后，显式提示用户下一步推荐技能。设计契约闭环通过后默认进入 `ae-work`，设计中的实现单元、文件范围和验证要求直接作为 ae-work 的输入。

| 审查结论 | 推荐下一步技能 | 引导语 |
|---------|---------------|--------|
| 通过 + 复杂任务 | **ae-work** | "设计契约已就绪。任务较复杂，建议使用 `ae-work` 按多单元编排执行。" |
| 通过 + 简单任务 | **ae-work** | "设计契约已就绪。任务较简单，可直接使用 `ae-work` 执行。" |
| 阻断 | **ae-design**（继续） | "设计契约可还原性不达标，已修复/待补充，请继续完善。" |

后续如需修改设计：再次运行 `ae-design`，传入已有设计路径作为基础。

## 输出契约

### 产物目录结构

```
ae/design/<name>-YYYY-MM-DD/
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
        ├── ui-ux.md                # 路由表 + 技术栈声明 + 设计 Token + 组件清单 + 组件定义 + 交互状态机总表 + 无障碍 + 组件复用策略
        ├── pages/                  # 每个页面独立文件（涉及 UI 时）
        │   ├── <NN>-<page-name>.md
        │   └── ...
        └── test-cases.md           # 测试用例契约
```

完整模板见 `references/design-output-template.md`；各维度模板见 `references/` 目录下各维度的独立模板文件。

### 各文件内容边界

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

### Frontmatter 与去重

各产物文件 frontmatter 仅保留 `type` 与 `ids`（有稳定 ID 时）。各文件的 `type` 取值与 `ids` 内容详见 `references/design-output-template.md`。

**去重规则：** `design-spec.md` 独占设计读数（三旋钮、设计体系、风格变体、负向设计空间）；`ui-ux.md` 不再重复设计读数，只含代码级 UI 设计内容。

### 写入边界

- 本技能只写 `ae/design/`。
- 允许读取 `ae/prd/` 等上游目录作为输入。

## 安全边界

- **不做代码实施** - 只记录设计契约和实现单元，不产出可执行代码。
- **不生成实际测试代码** - 只设计测试用例契约，不写测试代码。
- **不画真实视觉稿** - ui-ux 章节用结构化描述（布局家族、组件契约、token），不画像素级视觉稿。
- **不扩展需求边界（硬约束）** - 设计范围以用户明确提及的需求为限，无论输入是 prd 文档还是裸描述。prd 冻结后越界项回退 prd 决策。确有必要但用户未提及的设计项，须先征得用户同意方可纳入，不得自行加入。
- **主流程不直接产出维度契约** - 除 overview.md、constraints.md 和 cross-mapping.md 外，维度契约必须由对应角色卡产出。
- **技术栈选型必须经过审查** - 引入的第三方依赖必须标注社区活跃度和采用理由。
- **产物自包含** - 设计文档目录内文件只通过稳定 ID 相互引用，不引用外部工作空间文件；所有文件引用使用仓库相对路径。
- **凭证脱敏** - 感知项目现状时屏蔽密钥、token、连接字符串中的凭证部分。

## 完成判据

- 技能内 review 闭环通过（无新增 P0 / P1）。
- 跨模块一致性校验通过（见 `references/consistency-checks.md`）。
- 每个章节契约达到可还原标准。
- 技术实现路线约束满足（前端 / 后端 / 数据层 / 基础设施四类技术栈齐全，且各章节与之一致）。
- ae-grill 追问完成（或用户明确选择跳过并已记录原因）。
- 置信度门控已应用。
- 产物目录自包含，且只写入 `ae/design/`。

## 参考索引

| 文件 | 内容 |
|------|------|
| `references/design-principles.md` | 20 条核心原则、交互规则、输出指引 |
| `references/dimension-triggers.md` | 维度触发规则（风险维度 + 降级参考表） |
| `references/grill-handoff.md` | ae-grill 追问范围与上下文移交 |
| `references/role-dispatch.md` | 角色卡索引、并行 / 降级范式、调度顺序 |
| `references/roles/` | 9 张角色卡（职责 / 触发条件 / 输入契约 / 输出契约 / 工作流） |
| `references/consistency-checks.md` | 跨模块一致性校验清单 |
| `references/review-loop.md` | review 闭环、置信度门控、收敛协议 |
| `references/design-output-template.md` | 产物目录结构与各文件模板 |
| `references/overview-template.md` | overview 维度契约模板 |
| `references/cross-dimension-mapping.md` | 跨维度 / 跨模块映射表模板 |
| `references/architecture-template.md` | architecture 维度模板 |
| `references/api-template.md` | api 维度模板 |
| `references/database-template.md` | database 维度模板 |
| `references/ui-ux-template.md` | ui-ux / design-spec 维度模板 |
| `references/test-cases-template.md` | test-cases 维度模板 |
| `references/security-template.md` | security 维度模板 |
| `references/observability-template.md` | observability 维度模板 |
| `references/non-functional-template.md` | non-functional 维度模板 |
