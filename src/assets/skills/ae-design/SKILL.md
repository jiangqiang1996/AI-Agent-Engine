---
name: ae:design
description: "设计阶段：澄清设计决策并产出设计文档，含概览、架构、接口、数据模型、测试用例与验收标准，供计划和审查对齐"
argument-hint: "[需求文档路径|旧 design|裸描述]"
---

# 创建设计契约

**注意：当前年份是 2026 年。** 在为设计文档标注日期时使用此年份。

`ae:prd` 定义**做什么**。`ae:design` 定义**怎么设计**。`ae:plan` 定义**按什么步骤实现**。`ae:work` 执行计划。

`ae:design` 是设计契约冻结阶段，按需产出覆盖完整软件工程的可还原设计契约集。每个契约达到"任意 AI 据此生成一致性产物"的可还原标准。

此工作流的持久输出是一份**设计文档**（`ae/designs/<需求描述名>-YYYY-MM-DD/design.md` 元文件，含 Split Manifest）。它不是汇报材料；只记录后续规划和实施必须知道的设计决策、架构约束、接口契约和数据模型，使计划阶段不需要再发明这些内容。

此技能不实现代码。它澄清设计决策并记录契约，供后续规划或执行使用。

**重要：生成的文档中所有文件引用必须使用仓库相对路径（例如 `src/models/user.rb`），绝不能使用绝对路径。**

## 核心原则

1. **先评估维度** - 根据 prd 时段标注和任务特征匹配相应的必产出和选产出维度。
2. **做设计伙伴** - 建议替代方案、质疑假设、探索假设情境，而不是仅仅记录决策。
3. **在此解决设计决策** - 架构选型、接口契约、数据模型、UI/UX 规格属于此工作流。详细的实施步骤属于计划阶段。
4. **契约可还原** - 每个维度契约必须达到"任意 AI 据此生成一致性产物"的标准，禁止模糊表述。
5. **合理调整产物规模** - 简单的任务获得紧凑的设计文档或按需拆分。较大的任务获得更完整的契约集。轻量级任务可省略可选 MVCE（最小可验证契约元素）项，但必产出维度的核心 MVCE 不得省略。**核心 MVCE 判定标准：** 该契约元素缺失会导致 ae:plan / ae:work 无法继续实施或 ae:review 无法验证一致性 → 核心；该契约元素缺失只会降低设计质量但不阻塞下游 → 可选。每个维度的 MVCE 清单中标注 `[核心]` 或 `[可选]`。
6. **跨维度一致性** - overview 必须记录维度间依赖；api 数据模型必须与 database 一致；ui-ux 数据展示必须与 api 响应字段对齐；跨维度映射表（4 类）必须存在且与维度内容对齐。
7. **只保留对后续执行有用的设计契约** - 不为了"读起来完整"新增无实际约束力的章节；每个维度内容只有在直接影响实现、测试或审查时才记录。

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
2. **旧 design** - 用户提供 `ae/designs/<name>/design.md` 路径时，作为版本演化输入。读取旧 design 的 frontmatter（version/supersedes）和 Split Manifest，作为新版本的基础。
3. **裸描述** - 用户直接描述设计目标时，降级处理。询问用户是否需要先创建 prd，或直接基于裸描述进行设计。

**"需求描述名"来源规则（D12）：**
- prd 文档作为输入时：从 prd 文件名提取（如 `user-auth-prd.md` → `user-auth`）
- 旧 design 作为输入时：从旧 design 目录名提取（如 `ae/designs/user-auth-2026-06-20/` → `user-auth`）
- 裸描述作为输入时：从用户描述提取关键词转为 kebab-case（如"用户认证系统" → `user-auth`）
- 含特殊字符时强制 kebab-case 转换

#### 0.3 将源文档作为主要输入

如果存在 prd 文档：阅读它，宣布作为源文档，携带所有内容（目标、范围边界、成功标准、时段标注、决策、待定问题）。不要静默省略源内容。

### 阶段 1：维度触发判定

根据 prd 时段标注和**风险维度**，按 `references/design-dimensions.md` 中的触发规则确定必产出、条件必产出和显式否定维度。主触发逻辑基于风险维度（不可逆决策和变更影响范围），原"任务特征"表仅作为降级参考。

#### 1.1 读取时段标注与风险信号

从 prd 文档读取"涉及时段"字段和需求条目中的风险信号。如果 prd 无时段标注（旧格式 prd 或裸描述输入），通过交互询问用户确认风险维度。

风险信号识别清单（任一命中即触发对应风险维度）：
- **不可逆决策风险**：API 签名变更、数据模型 schema 变更、认证模型变更 → 强制必产出 api、database、security
- **结构性变更风险**：新增模块、跨模块依赖调整、公共配置修改 → 强制必产出 architecture
- **用户界面变更风险**：页面新增、交互流程调整、UI 组件复用 → 强制必产出 ui-ux
- **数据持久化风险**：新建表、字段变更、迁移脚本 → 强制必产出 database

#### 1.2 风险维度触发规则

按风险维度主触发逻辑确定维度清单：

| 风险维度 | 触发条件 | 必产出维度 | 条件必产出规则 |
|---------|---------|-----------|--------------|
| 不可逆决策 | API 签名/schema/认证模型变更 | api、database、security | - |
| 结构性变更 | 新增模块/跨模块依赖/公共配置 | overview、architecture | - |
| 用户界面变更 | 页面/交互/组件变更 | overview、ui-ux、test-cases | - |
| 数据持久化 | 新建表/字段变更/迁移 | overview、database、test-cases | - |
| 用户数据输入 | 涉及用户提交数据 | - | security 提升为必产出 |
| 生产部署 | 涉及生产环境部署或变更 | - | observability 提升为必产出 |
| 性能敏感 | 涉及性能敏感逻辑（高并发/大数据量/实时性） | - | non-functional 提升为必产出 |

**降级参考表**（仅在风险信号无法识别时使用）：

| 任务特征 | 必产出维度 | 选产出维度 |
|---------|-----------|-----------|
| 纯前端 UI 任务 | overview、ui-ux、test-cases | architecture、security |
| 纯后端 API 任务 | overview、api、architecture、test-cases | database、security、observability、non-functional |
| 全栈功能任务 | overview、ui-ux、api、architecture、database、test-cases | security、observability、non-functional |
| 数据迁移/重构任务 | overview、database、architecture、test-cases | api、observability |
| 基础设施/DevOps 任务 | overview、architecture、observability | security、non-functional |
| 非软件任务 | overview、test-cases | 按需 |

#### 1.3 显式否定机制

对于未触发且不适用的维度，必须显式否定，消除"默认值黑洞"：

- 格式：`<维度名>: explicitly-omitted`
- 含义：该维度不是本设计关注点，使用最简默认实现，不产出独立契约
- 示例：`security: explicitly-omitted` 表示安全不是本设计关注点，使用最简默认（HTTPS + 基础认证），不产出 security.md
- 必产出维度不得使用显式否定；显式否定需在 overview 的范围映射中记录理由

#### 1.4 确认维度清单

向用户呈现触发的维度清单（必产出 + 条件必产出 + 显式否定候选），允许用户：
- 确认默认触发的维度
- 勾选额外的选产出维度
- 移除不适用的必产出维度（需说明理由）
- 对不适用的选产出维度标注显式否定

**维度确认后的追问衔接：** 维度清单确认后、产出契约之前，如果存在多个相互依赖的设计决策尚未敲定（如架构选型影响 api 契约、数据模型影响接口设计），提示用户："设计方向上仍有相互依赖的未解决决策，是否使用 `ae:grill` 逐个追问直到达成共识？"用户接受后转交 `ae:grill` 处理当前维度清单和已有 prd 内容，追问结果带回本技能继续阶段 2。如果设计决策已清晰或用户选择跳过，直接进入阶段 2。

### 阶段 2：按维度产出契约

按确认的维度清单逐个产出设计契约。每个维度遵循 `references/design-dimensions.md` 中的契约模板。

#### 2.1 产出 overview（必产出）

overview 始终内联在 `design.md` 中，包含：
- 设计读数（一句话声明设计意图和美学家族）
- 范围映射（prd 需求 → design 维度的对应关系）
- 产物清单（本次产出的维度文件列表）
- 契约版本（初始为 1.0，版本演化时递增）
- 跨维度依赖关系（哪些维度之间有一致性约束）
- 设计决策记录（ADR，记录关键设计决策和理由，使用稳定 ID `ADR-XXX`）
- 跨维度映射表（4 类映射表的引用，详见 `references/design-dimensions.md`）
- 实施约束（环境变量、依赖版本、配置项、目录结构、构建命令，详见 `references/design-output-template.md`）

**稳定 ID 体系：** overview 中的设计条目必须使用稳定 ID，便于 ae:plan / ae:work / ae:review 追溯：
- `ADR-XXX`：架构决策记录（核心）
- `EP-XXX`：API 端点编号（核心，跨维度映射表 ui-component-to-api-endpoint-mapping 依赖）
- `T-XXX`：数据库表名编号，如 `T-users`、`T-orders`（核心，跨维度映射表 api-field-to-database-column-mapping 依赖）
- `TC-XXX`：测试用例编号（核心，跨维度映射表 test-case-to-contract-coverage 依赖）
- `ST-XXX`：UI 交互状态机编号（核心，跨维度映射表 api-error-to-ui-state-mapping 依赖）

稳定 ID 在 design 文档全生命周期不变；版本演化时新增 ID，不重用已废弃 ID。每个前缀对应一个跨维度映射表的追溯目标，移除任一前缀会破坏对应映射表的追溯逻辑。

#### 2.2 产出跨维度映射表骨架

在 overview 和实施约束之后、其他维度之前，先产出"跨维度映射表"骨架，作为后续维度产出的锚点。骨架包含 4 类映射表的空表头（具体内容在维度产出后填充）：

- `api-field-to-database-column-mapping`：API 请求/响应字段 ↔ 数据库表字段映射表
- `api-error-to-ui-state-mapping`：API 错误码 ↔ UI 交互状态机映射表
- `test-case-to-contract-coverage`：测试用例 ↔ 维度契约元素覆盖追溯表
- `ui-component-to-api-endpoint-mapping`：UI 组件 ↔ API 端点映射表

骨架产出后，每个维度产出时同步填充对应映射表行项，确保维度间一致性在产出过程中即时维护，而非事后校验补漏。映射表模板详见 `references/design-dimensions.md` 的"跨维度映射"章节。

#### 2.3 产出其他维度

按维度清单逐个产出契约。每个维度的具体内容模板见 `references/design-dimensions.md`。

产出顺序建议：overview → 实施约束 → 跨维度映射表骨架 → architecture → api → database → ui-ux → test-cases → security → observability → non-functional → 填充跨维度映射表

**关键约束：**
- 每个维度契约必须达到可还原标准
- 跨维度数据必须一致（如 api 响应字段与 database 表字段对齐）
- 模糊表述必须在此阶段消除（如"高性能"需量化为具体指标）
- 每个维度产出后同步更新跨维度映射表对应行项
- 设计条目必须使用稳定 ID：ADR-XXX（决策）、TC-XXX（测试用例）、EP-XXX（API 端点）、T-XXX（数据库表）、ST-XXX（UI 状态机）

#### 2.4 维度拆分决策

产出全部维度后，评估 `design.md` 总行数：
- **≤ 300 行**：所有维度内联在 `design.md` 中，Split Manifest 状态为 `unified`
- **> 300 行**：全部维度拆出为独立子文件，overview、实施约束和跨维度映射表始终内联，Split Manifest 状态为 `split`

拆分后，对每个维度子文件再次评估行数：
- **维度子文件 ≤ 300 行**：保持为独立子文件，不继续拆分
- **维度子文件 > 300 行**：按 `###` 子章节拆出为二级子文件 `<维度名>-<章节名>.md`；已拆分到章节级的文件不再继续拆分，其行数不参与校验

使用 `<ae-design路径>/scripts/check-design-lines.mjs` 校验所有非章节级文件行数，超出 300 行的文件需重新拆分。

拆分规则、子文件命名规范、Split Manifest 格式和二级拆分细则见 `references/design-output-template.md`。

### 阶段 3：跨维度一致性校验

产出全部维度后，执行跨维度一致性校验（覆盖维度间映射）：

1. **api ↔ database 一致性** - api 请求/响应字段必须与 database 表字段对齐（字段名、类型、约束）
2. **ui-ux ↔ api 一致性** - ui-ux 数据展示必须与 api 响应字段对齐（字段名、类型、可选性）
3. **overview 依赖关系完整性** - overview 记录的跨维度依赖必须覆盖实际存在的一致性约束
4. **test-cases 覆盖完整性** - test-cases 必须覆盖所有必产出维度的关键场景
5. **api 错误码 ↔ ui-ux 交互状态机映射一致性** - api 错误码必须在 ui-ux 交互状态机中有对应的状态转换和用户提示（映射表 `api-error-to-ui-state-mapping` 必须存在且非空）
6. **test-cases 用例 ↔ 维度契约元素覆盖追溯** - 每个 P0/P1 用例必须追溯到至少一个维度的契约元素（映射表 `test-case-to-contract-coverage` 必须存在且非空，每条 P0/P1 用例至少有一条追溯记录）
7. **overview 跨维度映射表 ↔ 实际维度内容一致性** - overview 的跨维度映射表必须与实际维度产出的内容对齐（4 类映射表必须存在且与维度内容一致）
8. **跨维度映射表完整性** - 4 类映射表必须存在且非空（维度未产出时标注 N/A 并说明理由）
9. **实施约束与 architecture/api 一致性** - 目录结构约定与模块边界表对齐、环境变量清单与认证授权流程对齐

发现不一致时，在此阶段修复后再进入 review 闭环。映射表缺失时补全，映射表与维度内容不一致时以维度内容为准更新映射表。

### 阶段 4：技能内 review 闭环

产出 design 契约集后，强制调用 `ae:review` 审查本技能产物，形成技能内闭环。

#### 4.1 调用 ae:review

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

#### 4.2 auto 修复范围

ae:review 的 auto 修复范围：
- 章节缺失（必产出维度未产出或章节不完整）
- token 定义不全（ui-ux 维度的设计 token 缺失字段）
- 契约字段模糊（如"高性能"未量化、"适当缓存"未定义策略）
- 跨维度不一致（api 与 database 字段不对齐等）

#### 4.3 收敛协议（D9）

按收敛协议执行：
- **上限 2 轮** - 最多执行 2 轮 review → auto 修复 → review 循环
- **收敛定义** - 无新增 P0/P1 发现即为收敛
- **未收敛处理** - 2 轮后仍有新增 P0/P1，回退用户澄清，不继续盲目修复

### 阶段 5：下一步推荐技能引导

review 闭环收敛后，显式提示用户下一步推荐技能。

#### 5.1 plan 触发判定

按以下规则评估是否需要 plan：

触发 ae:plan 当且仅当满足任一：
- 涉及 ≥3 个文件改动
- 涉及 ≥2 个模块/层级（如前端+后端+数据库）
- 存在实现顺序依赖（如 UI 依赖 API 契约）
- 存在可并行的独立任务
- 有明确技术风险需预判
- 涉及数据迁移
- 涉及破坏性变更

否则：ae:design → ae:work 直接执行

#### 5.2 引导语

| 审查结论 | 推荐下一步技能 | 引导语 |
|---------|---------------|--------|
| 通过 + 复杂任务 | **ae:plan** | "设计契约已就绪。任务较复杂，建议使用 `ae:plan` 拆解执行路径。" |
| 通过 + 简单任务 | **ae:work** | "设计契约已就绪。任务较简单，可直接使用 `ae:work` 执行。" |
| 阻断 | **ae:design**（继续） | "设计契约可还原性不达标，已修复/待补充，请继续完善。" |

## 安全边界

- **不写实现代码** - 只记录设计契约，不产出可执行代码
- **不做实施步骤拆解** - 步骤拆解属于 ae:plan 职责
- **不替代 plan** - design 定义"怎么设计"，plan 定义"按什么步骤实现"
- **不生成实际测试代码** - 只设计测试用例契约，不写测试代码
- **不画真实视觉稿** - UI/UX 维度用结构化描述（布局家族、组件契约、token），不画像素级视觉稿
- **不扩展需求边界** - prd 冻结后，design 不得擅自扩展范围，越界项回退 prd 决策

## 验证方式

- 技能内 review 闭环通过（无新增 P0/P1）
- 跨维度一致性校验通过
- 每个维度契约达到可还原标准

## 产物结构

产物目录结构、design.md 元文件模板、Split Manifest 格式详见 `references/design-output-template.md`。

设计维度契约模板详见 `references/design-dimensions.md`。
