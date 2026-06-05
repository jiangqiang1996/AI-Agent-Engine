---
name: ae:g2-business-scenarios
description: 填补 G1（约束）与 G4（数据模型）之间的功能需求缺口，提取业务场景、定义操作序列、发现字段、标注跨场景依赖。当 G1 产物就绪且需要系统化梳理业务场景时使用。
argument-hint: ""
---

# G2 业务场景分析

## 角色

业务场景分析师，从 G1 不变量产物中系统性地提取业务场景、定义用户操作序列、发现隐含字段、梳理跨场景依赖，为下游 G3 架构设计和 G4 数据模型提供完整的功能需求基线。

## 适用场景

- G1 不变量产物（invariants/、boundary.md、ambiguities.md）已就绪
- 需要从"约束性表述"推导出"功能性行为"
- 需要发现 G1 中未显式声明的字段和实体
- 需要梳理业务场景之间的时序和因果依赖

## 不适用场景

- G1 产物未就绪时不得执行
- 仅需调整已有业务场景的局部描述（无需完整提取）
- 不涉及业务行为的纯数据约束设计

## 输入自动发现

本技能无需用户手动指定输入路径。执行时按以下规则自动发现产物根目录和上游产物：

1. **产物根目录发现**：在工作区 `docs/ae/galv/` 下搜索 `galv-manifest.yaml`，取其 `project_name` 字段定位根目录 `docs/ae/galv/<项目名>/`（若搜索到多个 manifest，提示用户选择目标项目）
2. 若未找到 manifest，提示用户先执行 G1 创建 manifest
3. **上游产物发现**：从产物根目录按上游依赖表自动读取已存在的上游产物文件；缺失时记录警告，不阻断执行
4. 用户也可显式传入项目名覆盖自动发现结果

## 产物根目录

所有产物写入**产物根目录**下。默认根目录为 `docs/ae/galv/<项目名>/`。

`<项目名>` 由以下规则确定：
1. 若产物根目录下已存在 `galv-manifest.yaml`，读取其中的 `project_name` 字段作为项目名
2. 若不存在，在工作区 `docs/ae/galv/` 下搜索已有的 `galv-manifest.yaml` 自动定位
3. 若仍未找到，提示用户先执行 G1 技能创建 manifest

整个根目录自包含、可移植：内部所有路径均为相对路径，目录可整体移动到任意位置。读取全部阶段产物后，任何 AI 工具可据此生成功能等价、结构等价的软件系统。

本阶段的产物位于根目录下 `g2/` 子目录。

## 产物独占

**独占产物**：只有本技能可以创建或修改（路径相对于产物根目录）：

| 产物 | 格式 | 行数上限 |
|------|------|---------|
| `g2/business-scenarios/`（≤3 场景时可单文件 `g2/business-scenarios.md`） | YAML Frontmatter + 正文 | 500 |
| `g2/field-catalog.md` | YAML Frontmatter + 正文 | 500 |
| `g2/roles.md` | YAML Frontmatter + 正文 | 500 |

**共享产物**：`galv-manifest.yaml`（首次创建时由当前执行的技能负责，后续技能可读取和追加信息）

**禁止修改**上游技能产物（G1 的 `g1/invariants/`、`g1/boundary.md`、`g1/ambiguities.md`）和下游技能产物。

## 上游依赖（只读）

紧邻前序技能：**ae:g1-invariants**

| 上游技能 | 产物 | 用途 |
|---------|------|------|
| ae:g1-invariants | `g1/invariants/` | 遍历不变量，提取场景触发条件和约束边界 |
| ae:g1-invariants | `g1/boundary.md` | 确定场景边界，识别外部交互场景 |
| ae:g1-invariants | `g1/ambiguities.md` | 识别场景定义中的歧义风险点 |

## 执行流程

### T1 提取业务场景

1. 读取 G1 产物（`g1/invariants/`、`g1/boundary.md`、`g1/ambiguities.md`），关注关键词："用户可以""系统应当""支持""提供""允许""需要"
2. 识别每个场景的触发者（actor）、触发条件、前置条件、后置条件
3. 为每个场景分配唯一 ID，格式 `BS-{序号}`
4. 标注场景来源（不变量 ID 或用户描述引用）

```yaml
id: BS-001
name: 用户下单
actor: 注册用户
trigger: 用户在商品详情页点击"立即购买"
preconditions:
  - 用户已登录
  - 商品库存 > 0
postconditions:
  - 生成一条 Order 记录，状态为 created
  - 库存预扣减
source_ref: "inv-003"
module: order-service
```

### T2 定义业务操作

1. 为每个场景展开操作序列，按业务时序排列
2. 每个操作标注 input_fields 和 output_fields
3. 操作间标注数据传递关系

```yaml
scenario: BS-001
operations:
  - seq: 1
    action: 校验用户登录状态
    input_fields: [User.sessionId]
    output_fields: [User.id]
  - seq: 2
    action: 查询商品库存
    input_fields: [Product.id]
    output_fields: [Inventory.available]
  - seq: 3
    action: 创建订单
    input_fields: [User.id, Product.id, Order.quantity]
    output_fields: [Order.id, Order.status]
```

### T3 双源字段发现与合并

1. 从 G1 不变量中提取显式声明的字段（origin: derived）
2. 从业务场景操作中提取隐含推断的字段（origin: inferred）
3. 合并去重，形成统一字段目录

```yaml
fields:
  - name: Order.status
    type: enum
    enum_values: [created, paid, shipped, closed]
    origin: derived
    source_invariant: inv-003
  - name: Order.quantity
    type: integer
    constraints: ">= 1"
    origin: inferred
    source_scenario: BS-001
```

### T4 定义用户角色与权限

1. 从场景的 actor 字段归纳用户角色
2. 定义每个角色可执行的操作和可访问的数据范围
3. 标注角色间的继承和互斥关系

```yaml
roles:
  - id: ROLE-001
    name: 注册用户
    operations: [BS-001, BS-002, BS-005]
    data_access:
      read: [Order.own, Product.public]
      write: [Order.own]
  - id: ROLE-002
    name: 管理员
    inherits: ROLE-001
    operations: [BS-001, BS-002, BS-003, BS-004, BS-005]
```

### T5 标注跨场景依赖

1. 识别场景间的时序依赖（场景 B 必须在场景 A 完成后才能执行）
2. 识别场景间的因果依赖（场景 A 的输出是场景 B 的输入）
3. 构建依赖图，验证无环

```yaml
dependencies:
  - from: BS-001
    to: BS-002
    type: temporal
    description: 支付必须在下单之后
  - from: BS-001
    to: BS-006
    type: causal
    description: 订单ID 是退款场景的输入
```

### T6 写入产物

按产物规格写入文件（路径相对于产物根目录）。

**`g2/business-scenarios/`** 或 **`g2/business-scenarios.md`**：业务场景总清单及操作序列

目录形式时，`index.md` Frontmatter 必须包含 `type: directory_index` 和 `slices` 字段：

```yaml
type: directory_index
slices:
  - file: bs-{group}.md
    summary: 该组业务场景
    id_range: [BS-001, BS-XXX]
scenarios:
  - id: BS-001
    name: 用户下单
    module: order-service
    source_ref: "inv-003"
```

正文为场景设计理由和操作语义的人类阐释。

**`g2/field-catalog.md`**：双源合并字段目录

**`g2/roles.md`**：用户角色与权限定义

### T7 产物审查

调用 `ae:review mode=autofix domain=document g2/`，仅审查 `g2/` 目录下的本技能产物，最多重试 3 次。

## 单轨格式规则

所有产物文件采用 Markdown + YAML Frontmatter 单轨格式：

- Frontmatter 为机器可读的唯一真源，正文为人类阐释
- 正文不允许出现 Frontmatter 中不存在的实体名、字段名、规则名
- 正文只允许包含：Frontmatter 字段的业务含义解释、设计决策的理由、用户确认记录
- 如需补充信息，必须先在 Frontmatter 中添加对应条目，再在正文中解释
- 每条 Frontmatter 条目可标注 `origin` 字段：`derived`（从上游推导，可信度最高）、`inferred`（AI 推断补充，需人工确认）、`asserted`（人类断言，最可靠）

## 验收关卡

| 编号 | 检查项 | 通过标准 |
|------|--------|---------|
| G2-K1 | 场景覆盖完整 | G1 产物中每个"用户可以""系统应当"表述有对应场景 |
| G2-K2 | 操作字段闭合 | 每个操作的 input_fields 和 output_fields 在 field-catalog.md 中有对应条目 |
| G2-K3 | 字段双源闭合 | field-catalog.md 中 derived 字段可溯源至不变量，inferred 字段可溯源至场景操作 |
| G2-K4 | 角色覆盖完整 | 每个场景的 actor 在 roles.md 中有对应角色定义 |
| G2-K5 | 依赖无环 | 跨场景依赖图无环 |
| G2-K6 | 歧义已闭合 | g1/ambiguities.md 中影响场景定义的歧义项已裁定 |
| G2-K7 | 文件行数合规 | 所有产物文件不超过 500 行 |
| G2-K8 | 产物审查通过 | ae:review autofix 审查通过 |
| G2-K9 | 人工审核通过 | 用户确认场景提取无遗漏、操作定义无歧义、字段发现完整 |

## 回退说明

| 发现问题 | 回退目标 |
|---------|---------|
| 不变量遗漏导致场景不完整 | 回 G1 补充不变量 |
| 场景定义内部问题 | 仅重做 G2 |

## 安全边界

- 只读访问 G1 产物，不得修改
- 不得修改下游技能产物
- 本技能禁止读取或引用执行顺序在本技能之后的任何技能产物（G3/G4/G5/A1/A2/L1/L2/L3/V1/V2），以保证回退时后续产物不可见
- 歧义项仅记录和标注影响，不做假设性决策
- 验收关卡未全部通过时，在产物中标注未通过项，不隐瞒

## 完成标准

- `g2/business-scenarios/`（或 `g2/business-scenarios.md`）、`g2/field-catalog.md`、`g2/roles.md` 已写入
- 验收关卡 G2-K1 至 G2-K8 全部通过
- G2-K9 须由用户确认后方可视为本步骤完成
- 输出变更摘要：新增场景数量、字段数量、角色数量、依赖条目数
