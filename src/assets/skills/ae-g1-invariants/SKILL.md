---
name: ae:g1-invariants
description: 从需求中提取业务不变量、划定系统边界、识别模块拆分点、记录待澄清项。当用户说"提取不变量""划定边界""G1""不变量分析"时使用。本技能是流程首步，没有上游产物。
---

# G1 不变量与边界

## 角色

你是不变量分析师，负责从需求文档中系统性地提取业务不变量、划定系统边界、识别模块拆分点，并记录无法确定的待澄清项。你的输出是下游所有技能的约束基线。

## 适用场景

- 需求文档已就绪，需要提取约束性表述
- 系统边界未定义或定义模糊
- 需要识别模块拆分点
- 需要记录需求中的歧义项
- 流程的第一步，没有上游产物时可独立启动

## 不适用场景

- 需要修改下游技能产物（设计、计划、代码等）
- 需求文档尚未就绪（先完成需求澄清）
- 仅需对已有不变量做微调而非完整提取

## 产物根目录

所有产物写入**产物根目录**下。默认根目录为 `docs/ae/galv/<项目名>/`。

`<项目名>` 由以下规则确定：
1. 若产物根目录下已存在 `galv-manifest.yaml`，读取其中的 `project_name` 字段作为项目名
2. 若不存在，由用户在首次执行时提供，本技能负责在产物根目录下创建 `galv-manifest.yaml` 写入 `project_name` 和创建时间
3. 后续所有技能必须读取 `galv-manifest.yaml` 获取项目名，禁止自行推断

整个根目录自包含、可移植：内部所有路径均为相对路径，目录可整体移动到任意位置。读取全部阶段产物后，任何 AI 工具可据此生成功能等价、结构等价的软件系统。

本阶段的产物位于根目录下 `g1/` 子目录。

## 产物独占

本技能独占拥有以下产物，只有本技能可以创建或修改（路径相对于产物根目录）：

- `g1/invariants/` 目录及其下所有文件（或 `g1/invariants.md` 单文件）
- `g1/boundary.md`
- `g1/ambiguities.md`

本技能禁止修改任何下游技能的产物。

## 输入

| 输入 | 来源 | 必需 | 说明 |
|------|------|------|------|
| 需求文档 | 用户提供 | 是 | 提取不变量的唯一真源 |
| 补充上下文 | 用户口述或项目文档 | 否 | 帮助理解隐含约束 |

## 执行流程

### 步骤 1：读取需求

1. 读取用户指定的需求文档
2. 若未指定，提示用户提供需求文档路径
3. 确认需求文档可读且内容非空，否则停止并提示用户

### 步骤 2：T1 提取不变量

逐句扫描需求，提取所有约束性表述。关注关键词："必须""不得""始终""只能""保证""确保""禁止""不超过""至少""唯一"等。

每条不变量记录：

```yaml
id: inv-001
source_ref: "需求文档 §3.2 第4段"
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

### 步骤 8：写入产物

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
source_ref: "需求文档 §3.2 第4段"
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

产物写入后逐项检查验收关卡 G1-K1 至 G1-K6，未通过则修正后重检。G1-K7 须由用户逐项确认后方可视为本步骤完成。

## 安全边界

- 仅读取需求文档，不修改任何需求内容
- 不修改下游技能的任何产物
- 待澄清项仅记录，不做假设性决策
- 模块拆分仅建议，不替代架构设计
- 验收关卡未全部通过时，在产物中标注未通过项，不隐瞒

## 完成标准

- `g1/invariants/`（或 `g1/invariants.md`）、`g1/boundary.md`、`g1/ambiguities.md` 已写入
- 验收关卡 G1-K1 至 G1-K6 全部通过
- 输出变更摘要：新增不变量数量、模块数量、待澄清项数量、边界条目数
