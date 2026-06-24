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
5. **合理调整产物规模** - 简单的任务获得紧凑的设计文档或按需拆分。较大的任务获得更完整的契约集。
6. **跨维度一致性** - overview 必须记录维度间依赖；api 数据模型必须与 database 一致；ui-ux 数据展示必须与 api 响应字段对齐。
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

不得将文件名含 `-lfg` 的文档（ae:lfg 管道产物）作为可恢复候选。若未来恢复逻辑扩展为目录扫描，应始终排除文件名含 `-lfg` 的文件。

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

根据 prd 时段标注和任务特征，按 `references/design-dimensions.md` 中的触发规则确定必产出和选产出维度。

#### 1.1 读取时段标注

从 prd 文档读取"涉及时段"字段。如果 prd 无时段标注（旧格式 prd 或裸描述输入），通过交互询问用户确认任务特征。

#### 1.2 匹配任务特征

按以下规则匹配（详见 `references/design-dimensions.md`）：

| 任务特征 | 必产出维度 | 选产出维度 |
|---------|-----------|-----------|
| 纯前端 UI 任务 | overview、ui-ux、test-cases | architecture、security |
| 纯后端 API 任务 | overview、api、architecture、test-cases | database、security、observability、non-functional |
| 全栈功能任务 | overview、ui-ux、api、architecture、database、test-cases | security、observability、non-functional |
| 数据迁移/重构任务 | overview、database、architecture、test-cases | api、observability |
| 基础设施/DevOps 任务 | overview、architecture、observability | security、non-functional |
| 非软件任务 | overview、test-cases | 按需 |

#### 1.3 确认维度清单

向用户呈现触发的维度清单，允许用户：
- 确认默认触发的维度
- 勾选额外的选产出维度
- 移除不适用的必产出维度（需说明理由）

### 阶段 2：按维度产出契约

按确认的维度清单逐个产出设计契约。每个维度遵循 `references/design-dimensions.md` 中的契约模板。

#### 2.1 产出 overview（必产出）

overview 始终内联在 `design.md` 中，包含：
- 设计读数（一句话声明设计意图和美学家族）
- 范围映射（prd 需求 → design 维度的对应关系）
- 产物清单（本次产出的维度文件列表）
- 契约版本（初始为 1.0，版本演化时递增）
- 跨维度依赖关系（哪些维度之间有一致性约束）
- 设计决策记录（ADR，记录关键设计决策和理由）

#### 2.2 产出其他维度

按维度清单逐个产出契约。每个维度的具体内容模板见 `references/design-dimensions.md`。

产出顺序建议：overview → architecture → api → database → ui-ux → security → observability → non-functional → test-cases

**关键约束：**
- 每个维度契约必须达到可还原标准
- 跨维度数据必须一致（如 api 响应字段与 database 表字段对齐）
- 模糊表述必须在此阶段消除（如"高性能"需量化为具体指标）

#### 2.3 维度拆分决策

产出全部维度后，评估 `design.md` 总行数：
- **≤ 1500 行**：所有维度内联在 `design.md` 中，Split Manifest 状态为 `unified`
- **> 1500 行**：按章节行数从大到小拆出为独立子文件，overview 始终内联，Split Manifest 状态为 `split`

拆分规则和子文件命名规范见 `references/design-output-template.md`。

### 阶段 3：跨维度一致性校验

产出全部维度后，执行跨维度一致性校验：

1. **api ↔ database 一致性** - api 请求/响应字段必须与 database 表字段对齐（字段名、类型、约束）
2. **ui-ux ↔ api 一致性** - ui-ux 数据展示必须与 api 响应字段对齐（字段名、类型、可选性）
3. **overview 依赖关系完整性** - overview 记录的跨维度依赖必须覆盖实际存在的一致性约束
4. **test-cases 覆盖完整性** - test-cases 必须覆盖所有必产出维度的关键场景

发现不一致时，在此阶段修复后再进入 review 闭环。

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
