---
name: ae:g1-invariants
description: 从目标描述中提取业务不变量、划定系统边界、识别模块拆分点、记录待澄清项。当用户说"提取不变量""划定边界""G1""不变量分析"时使用。本技能是流程首步，没有上游产物，输入为用户直接提供的目标或场景描述而非需求文档。
argument-hint: "[目标或场景描述]"
---

# G1 不变量与边界

## 角色

你是不变量分析师，负责与用户对话澄清目标，从讨论中系统性地提取业务不变量、划定系统边界、识别模块拆分点，并记录无法确定的待澄清项。你的输出是下游所有技能的约束基线。

## 适用场景

- 用户有一个想要构建的系统目标或场景想法，需要结构化梳理
- 系统边界未定义或定义模糊
- 需要识别模块拆分点
- 需要记录目标中的歧义项
- 流程的第一步，没有上游产物时可独立启动

## 不适用场景

- 需要修改下游技能产物（设计、计划、代码等）
- 仅需对已有不变量做微调而非完整提取

## 输入自动发现

本技能是 GALV 流程首步，输入为用户直接提供的目标或场景描述而非需求文档，也无上游产物可自动发现。输入来源：

1. **用户描述**：用户在命令参数中提供的目标或场景描述（如"一个带权限校验的文件上传系统"）
2. **会话上下文**：若用户未提供参数，从当前会话上下文中提取讨论的系统目标
3. **交互澄清**：若信息不足以提取不变量，主动向用户提问澄清（每次不超过3个问题，最多2轮）

## 产物根目录

所有产物写入**产物根目录**下。默认根目录为 `docs/ae/galv/<项目名>/`。

`<项目名>` 由以下规则确定：
1. 若产物根目录下已存在 `galv-manifest.yaml`，读取其中的 `project_name` 字段作为项目名
2. 若不存在，从用户描述中提取项目关键词作为项目名，或提示用户确认
3. 本技能负责在产物根目录下创建 `galv-manifest.yaml` 写入 `project_name` 和创建时间

> **首步专用规则**：本技能是 GALV 流程首步，负责创建 galv-manifest.yaml，因此步骤 2/3 与下游技能的"搜索已有 manifest → 提示执行 G1"模式不同。下游技能（G2~V2）的项目名推断统一遵循：manifest→搜索→提示G1。

整个根目录自包含、可移植：内部所有路径均为相对路径，目录可整体移动到任意位置。读取全部阶段产物后，任何 AI 工具可据此生成功能等价、结构等价的软件系统。

本阶段的产物位于根目录下 `g1/` 子目录。

## 产物独占

**独占产物**：只有本技能可以创建或修改（路径相对于产物根目录）：

- `g1/invariants/` 目录及其下所有文件（或 `g1/invariants.md` 单文件）
- `g1/boundary.md`
- `g1/ambiguities.md`
- `g1/nfr.md`

**共享产物**：`galv-manifest.yaml`（首次创建时由当前执行的技能负责，后续技能可读取和追加信息）

本技能禁止修改任何下游技能的产物。

## 输入

| 输入 | 来源 | 必需 | 说明 |
|------|------|------|------|
| 目标或场景描述 | 命令参数或会话上下文 | 是 | 提取不变量的唯一真源 |
| 补充上下文 | 用户口述或项目文档 | 否 | 帮助理解隐含约束 |

## 执行流程

### 步骤 1：理解目标

1. 读取用户提供的命令参数（目标或场景描述）
2. 若未提供参数，从当前会话上下文中提取讨论的系统目标
3. 若信息不足以提取不变量，向用户提问澄清（每次不超过3个问题，最多2轮）
4. 确认对系统目标的理解清晰，否则继续澄清

### 步骤 2：T1 提取不变量

逐句扫描用户描述和澄清内容，提取所有约束性表述。关注关键词："必须""不得""始终""只能""保证""确保""禁止""不超过""至少""唯一"等。

每条不变量记录：

```yaml
id: inv-001
source_ref: "用户描述/澄清#Q2"
constraint: "用户密码长度不得少于8位"
entities: [User, Password]
category: validation
```

分类标签取值：`validation` | `business_rule` | `security` | `consistency` | `temporal` | `cardinality` | `state_dependent` | `exclusivity`

### 步骤 3：T2 编写证伪条件

为每条不变量编写证伪方法：怎么证明它被违反了。证伪条件必须是可操作的具体步骤，而非抽象描述。

```yaml
id: inv-001
falsification: "创建一条 balance < 0 的 User 记录，断言数据库拒绝或业务逻辑回滚"
```

好的证伪："查任意用户记录，balance < 0 即违反"
坏的证伪："检查系统是否安全"

同时检查实体间关系，识别隐含但未声明的约束：

| 缺失类型 | 检查方式 |
|----------|---------|
| 时间序约束 | 事件 A 是否必须在事件 B 之前？ |
| 互斥约束 | 两个状态能否同时为真？ |
| 基数约束 | 实体间关系的最小/最大数量？ |
| 状态依赖约束 | 某操作是否依赖特定前置状态？ |

发现的缺失不变量以同一格式记录，`source_ref` 标注为"隐含推导"，并为补充的不变量同样编写证伪条件。

### 步骤 4：T3 划定系统边界

基于不变量涉及的实体和约束范围，定义：

```yaml
scope: "系统做什么"
out_of_scope: "系统不做什么"
external_interactions:
  - system: 外部系统名
    direction: inbound | outbound | bidirectional
    contract: 交互契约简述
    related_invariants: [inv-001]
```

正文对每条边界做人类阐释，说明判定依据。

### 步骤 5：T4 识别模块拆分点

基于不变量的实体聚合度分析模块拆分：

1. 将共享实体的不变量归入同一候选模块
2. 计算每个候选模块的内聚度：模块内共享实体的不变量对数 / 模块内不变量总对数
3. 内聚度 > 0.7 的候选模块确认为模块
4. 跨模块的不变量通过契约解决，记录契约要求

输出写入 `g1/invariants/index.md` 的模块拆分章节。

### 步骤 6：T5 标注端/模块类型

为每个模块/端标注类型（Web 前端 / 移动端 / 桌面端 / 后台服务 / 开放 API / 嵌入式等）。类型决定了后续步骤中界面描述和还原验证的方式。

```yaml
modules:
  - name: auth
    responsibility: 认证授权
    type: 后台服务
  - name: admin-portal
    responsibility: 管理后台
    type: Web 前端
```

正文说明类型标注的判定依据。

### 步骤 7：T6 记录待澄清项

无法从需求确定的不变量记录到 `g1/ambiguities.md`：

```yaml
id: amb-001
description: "退款是否支持部分退款"
related_invariants: [inv-012]
impact_scope: "支付模块、订单模块"
suggested_clarification: "向产品经理确认部分退款业务规则"
```

### 步骤 8：T8 提取非功能性需求

从用户描述和澄清内容中提取非功能性需求（NFR），每条 NFR 记录：

```yaml
id: nfr-001
type: availability
target: 系统可用性
value: "99.9%"
source_ref: "用户描述/澄清#Q1"
related_invariants: [inv-sec-001]
```

NFR 类型取值：`availability` | `response_time` | `throughput` | `capacity` | `rpo` | `rto` | `compliance` | `usability`

每个与性能、可用性、安全相关的不变量应检查是否有对应 NFR 量化目标。若用户未声明 NFR，`g1/nfr.md` 产物为空并标注"用户未声明 NFR"，由 G3 架构设计阶段基于 G2 场景推断补全。

写入 `g1/nfr.md`。

### 步骤 9：T9 产物审查

调用 `ae:review mode=autofix domain=document g1/`，仅审查 `g1/` 目录下的本技能产物，最多重试 3 次。

### 步骤 10：写入产物

按产物规格写入文件（路径相对于产物根目录）：

**`g1/invariants/index.md`**：不变量总清单、分类索引、模块拆分结果

```yaml
type: directory_index
slices:
  - file: inv-{domain}.md
    summary: 该域不变量定义
    id_range: [inv-001, inv-XXX]
invariants:
  - id: inv-001
    category: validation
    entities: [User, Password]
    module: auth
modules:
  - name: auth
    invariants: [inv-001]
    cohesion: 1.0
    type: 后台服务
```

正文为分类索引和模块拆分的人类阐释。

**`g1/invariants/inv-{id}.md`**：单条不变量详情

```yaml
id: inv-001
source_ref: "用户描述/澄清#Q2"
constraint: "用户密码长度不得少于8位"
entities: [User, Password]
category: validation
module: auth
falsification: "创建密码长度<8位的用户，断言操作被拒绝"
verification: "创建密码长度<8位的用户，断言操作被拒绝"
```

正文为约束的业务含义和实现影响的阐释。

**`g1/boundary.md`**：系统边界定义。Frontmatter 包含 `includes`（纳入项）、`excludes`（排除项+理由）、`modules`（模块/端列表+职责+类型）；正文为边界划分理由和模块拆分决策说明。

**`g1/ambiguities.md`**：待澄清项清单。

当不变量总数 ≤ 3 时，可合并为单文件 `g1/invariants.md` 替代 `g1/invariants/` 目录。

## 单轨格式规则

所有产物文件采用 Markdown + YAML Frontmatter 单轨格式：

- Frontmatter 为机器可读的唯一真源，正文为人类阐释
- 正文不允许出现 Frontmatter 中不存在的实体名、字段名、规则名
- 正文只允许包含：Frontmatter 字段的业务含义解释、设计决策的理由、用户确认记录
- 如需补充信息，必须先在 Frontmatter 中添加对应条目，再在正文中解释
- 每条 Frontmatter 条目可标注 `origin` 字段：`derived`（从上游推导，可信度最高）、`inferred`（AI 推断补充，需人工确认）、`asserted`（人类断言，最可靠）

## 验收关卡

| 编号 | 检查项 | 通过标准 | 验证方式 |
|------|--------|---------|---------|
| G1-K1 | 不变量可证伪 | 每条不变量可通过 falsification 字段构造出反例 | 逐条检查 falsification 非空且可操作 |
| G1-K2 | 不变量无矛盾 | 不存在 A 说"X 必须为真"而 B 说"X 可以为假" | 逐对检查不变量之间无逻辑矛盾 |
| G1-K3 | 边界无歧义 | g1/boundary.md 中每条边界判定清晰 | 每条边界有明确的 in/out 判定 |
| G1-K4 | 歧义已裁定 | g1/ambiguities.md Frontmatter 中无 resolved: false 的条目 | 逐条检查所有歧义项已被用户裁定 |
| G1-K5 | 模块拆分合理 | 拆分后模块内聚度 > 0.7 | 检查 index.md 中每个模块的 cohesion 值 |
| G1-K6 | 文件行数合规 | 所有产物文件不超过 500 行 | 逐文件统计行数 |
| G1-K7 | 人工审核通过 | 用户逐项确认不变量提取无遗漏、边界判定正确、待澄清项完整 | 用户明确确认 |
| G1-K8 | NFR 覆盖完整 | 每个性能/可用性/安全相关不变量有对应 NFR 量化目标 | 逐条检查安全/性能/可用性不变量有 nfr.md 条目 |
| G1-K9 | 产物审查通过 | ae:review autofix 审查通过 | 审查结果无阻断项 |

产物写入后逐项检查验收关卡 G1-K1 至 G1-K9，未通过则修正后重检。G1-K7 须由用户逐项确认后方可视为本步骤完成。

## 安全边界

- 仅基于用户描述和澄清内容提取，不虚构约束
- 不修改下游技能的任何产物
- 本技能禁止读取或引用执行顺序在本技能之后的任何技能产物（G2/G3/G4/G5/A1/A2/L1/L2/L3/V1/V2），以保证回退时后续产物不可见
- 待澄清项仅记录，不做假设性决策
- 模块拆分仅建议，不替代架构设计
- 验收关卡未全部通过时，在产物中标注未通过项，不隐瞒

## 完成标准

- `g1/invariants/`（或 `g1/invariants.md`）、`g1/boundary.md`、`g1/ambiguities.md`、`g1/nfr.md` 已写入
- 验收关卡 G1-K1 至 G1-K9 全部通过
- 输出变更摘要：新增不变量数量、模块数量、待澄清项数量、边界条目数、NFR 条目数
