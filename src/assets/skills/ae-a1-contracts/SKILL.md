---
name: ae:a1-contracts
description: 定义模块间的数据契约、数据流、共享状态和冲突解决策略，确保跨模块协作有据可依。当上游 G1/G2/G3 产物就绪后，需要梳理跨模块依赖并建立契约体系时使用。
---

# A1 跨模块关联映射

## 角色

跨模块契约架构师，负责从上游产物中提取模块间依赖关系，定义可验证的数据契约、数据流、共享状态和冲突解决策略。

## 适用场景

- 上游 G1（不变量/边界/歧义）、G2（数据模型/状态机/DDL）、G3（数据溯源/覆盖）产物已就绪
- 需要识别跨模块数据依赖并建立契约体系
- 需要定义模块间数据流、共享状态和冲突解决策略

## 不适用场景

- 前序技能（G1/G2/G3）产物未就绪时不得执行
- 仅涉及单模块内部逻辑（无跨模块交互）
- 已有契约体系且无需变更

## 产物根目录

所有产物写入**产物根目录**下。默认根目录为 `docs/ae/galv/<项目名>/`。

`<项目名>` 由以下规则确定：
1. 若产物根目录下已存在 `galv-manifest.yaml`，读取其中的 `project_name` 字段作为项目名
2. 若不存在，提示用户先执行上游技能创建 manifest，或由用户手动提供项目名后由本技能创建
3. 后续所有技能必须读取 `galv-manifest.yaml` 获取项目名，禁止自行推断

整个根目录自包含、可移植：内部所有路径均为相对路径，目录可整体移动到任意位置。读取全部阶段产物后，任何 AI 工具可据此生成功能等价、结构等价的软件系统。

本阶段的产物位于根目录下 `a1/` 子目录。

## 产物独占

### 独占产物

只有本技能可以创建或修改（路径相对于产物根目录）：

- `a1/contracts/`（≤3 条契约时可单文件 `a1/contracts.md`）
- `a1/data-flow/`（≤2 条数据流时可单文件 `a1/data-flow.md`）
- `a1/shared-state.md`

### 共享产物

- `galv-manifest.yaml`（首次创建时由当前执行的技能负责，后续技能可读取和追加信息）

对上游产物只读，禁止修改。禁止修改下游技能产物。

## 上游依赖（只读）

紧邻前序技能：**G3（ae:g3-global-trace）**。本技能的直接前序为 G3，G3 的前序为 G2，G2 的前序为 G1。执行顺序：G1→G2→G3→**A1**。

| 前序技能 | 产物 | 用途 |
|---------|------|------|
| G1 | `g1/invariants/`、`g1/boundary.md`、`g1/ambiguities.md` | 获取跨模块不变量和边界约束 |
| G2 | `g2/data-model/`、`g2/state-machines/`、`g2/ddl-verify.sql` | 获取实体关系和状态流转定义 |
| G3 | `g3/data-trace/`、`g3/trace-coverage.md` | 获取数据溯源路径和覆盖情况 |

## 执行流程

### T1 识别跨模块依赖

遍历 `g2/data-model/` 中跨模块引用的实体和关系：

1. 提取所有跨模块引用的实体（外键、API 调用、事件订阅等）
2. 标记每个引用的 source 模块和 target 模块
3. 记录引用类型（同步调用/异步事件/共享存储）
4. 输出依赖清单

### T2 定义数据契约

对每个跨模块交互定义数据契约。契约必须分为以下四类之一：

| 契约类型 | 说明 | 示例 |
|---------|------|------|
| data_ownership | 数据归属：谁是真源、谁是副本 | Order 实体归属订单服务，库存服务持有只读副本 |
| event_flow | 事件流：谁发布、谁订阅、传递保证 | 订单服务发布 OrderCreated 事件，支付服务订阅，at-least-once |
| state_sync | 状态同步：同步方向、一致性级别、延迟上限 | 支付状态从支付服务同步到订单服务，最终一致，最大延迟 5 秒 |
| api_call | 接口调用：请求/响应格式、超时、降级方案 | 订单服务调用库存服务的扣减接口，超时 3 秒，降级为预扣 |

| 字段 | 说明 |
|------|------|
| 契约ID | 格式 `CTR-{序号}` |
| source | 发起方模块 |
| target | 接收方模块 |
| 请求结构 | 请求数据的字段定义 |
| 响应结构 | 响应数据的字段定义 |
| preconditions | 调用前必须满足的条件（可验证） |
| postconditions | 调用后必须保证的条件（可验证） |
| obligations | 双方义务声明 |
| invariant_guards | 跨模块不变量守卫声明 |

### T3 绘制数据流图

对每条跨模块数据流路径定义：

| 字段 | 说明 |
|------|------|
| 流ID | 格式 `DF-{序号}` |
| 路径 | source → 中间节点 → target |
| 模式 | 同步/异步 |
| 数据格式 | 传输中的数据格式 |
| 转换点 | 格式转换或协议转换的位置 |
| 关联契约 | 引用的契约ID |

### T4 定义共享状态

对跨模块共享状态定义：

| 字段 | 说明 |
|------|------|
| 状态ID | 格式 `SS-{序号}` |
| 共享实体 | 共享的数据实体 |
| 共享方式 | 数据库/缓存/事件 |
| 参与模块 | 读写该状态的模块列表及读写类型 |
| 一致性要求 | 强一致/最终一致/会话一致 |
| 关联契约 | 引用的契约ID |

### T5 定义冲突解决策略

**并发写入冲突**：检测方式（乐观锁/悲观锁/版本号）、解决规则（last-write-wins/merge/custom）、重试策略

**数据不一致**：检测方式（定时校验/事件触发/对账）、修复规则

### T6 编写契约模拟用例

为每条契约编写可模拟用例：给定输入数据，期望输出数据。模拟用例的作用是验证契约描述无歧义——如果两个人对同一输入推算出不同输出，说明契约描述有歧义，需要补全。

```yaml
simulation_cases:
  - id: SIM-001
    contract_id: CTR-001
    given:
      source_module: 模块A
      input_data: { orderId: "O-001", amount: 100.00 }
    expect:
      target_module: 模块B
      output_data: { status: "created", balance: 900.00 }
```

每条契约至少 1 个模拟用例。

## 产物格式

### a1/contracts/ 或 a1/contracts.md

```
a1/contracts/
  index.md              ← 契约总清单
  contract-{id}.md      ← 按契约拆分
``

`index.md` 格式：

```yaml
type: directory_index
slices:
  - file: contract-{id}.md
    summary: 该契约定义
    id_range: [CTR-001]
kind: contract-index
upstream:
  g1: [g1/invariants/, g1/boundary.md, g1/ambiguities.md]
  g2: [g2/data-model/, g2/state-machines/, g2/ddl-verify.sql]
  g3: [g3/data-trace/, g3/trace-coverage.md]
contracts:
  - id: CTR-001
    source: 模块A
    target: 模块B
    summary: 简述
    file: contract-CTR-001.md
```

`contract-{id}.md` 格式：

```yaml
kind: contract
id: CTR-001
type: data_ownership | event_flow | state_sync | api_call
source: 模块A
target: 模块B
request:
  field1: { type: string, required: true, description: 描述 }
response:
  field1: { type: number, required: true, description: 描述 }
preconditions:
  - PC-001: 条件描述（可验证）
postconditions:
  - POC-001: 条件描述（可验证）
obligations:
  source: [义务1, 义务2]
  target: [义务1]
invariant_guards:
  - invariant_id: INV-001
    guard: 守卫机制描述
simulation_cases:
  - id: SIM-001
    given: { 输入数据 }
    expect: { 期望输出数据 }
```

### a1/data-flow/ 或 a1/data-flow.md

```yaml
kind: data-flow-index
flows:
  - id: DF-001
    path: [模块A, 中间件, 模块B]
    mode: 同步/异步
    contract: CTR-001
```

### a1/shared-state.md

```yaml
kind: shared-state
states:
  - id: SS-001
    entity: 实体名
    sharing: 数据库/缓存/事件
    participants:
      - module: 模块A
        access: read/write
    consistency: 强一致/最终一致
    contract: CTR-001
conflicts:
  - id: CF-001
    shared_state: SS-001
    detection: 检测方式
    resolution: 解决规则
    retry: { max: 3, backoff: exponential }
inconsistencies:
  - id: IC-001
    shared_state: SS-001
    detection: 检测方式
    repair: 修复规则
```

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
| A1-K1 | 依赖有契约 | 每个跨模块依赖有对应契约 |
| A1-K2 | 契约可验证 | 每条契约的 pre/post conditions 可验证 |
| A1-K3 | 契约引用可解析 | 每条契约的 payload 引用可解析到 g2/data-model/ 子文件 Frontmatter 中的实体/字段 |
| A1-K4 | 数据流完整 | 所有跨模块数据流路径有定义 |
| A1-K5 | 冲突有策略 | 共享状态的冲突有解决策略 |
| A1-K6 | 共享状态有归属 | 每个共享状态有唯一权威归属方和冲突解决规则 |
| A1-K7 | 无孤儿数据 | 每个实体的每个字段至少出现在一个模块的职责范围内 |
| A1-K8 | 不变量有守卫 | 跨模块不变量在契约中有守卫声明 |
| A1-K9 | 文件行数合规 | 所有产物文件不超过 500 行 |
| A1-K10 | 人工审核通过 | 用户确认契约定义合理、数据流完整、冲突解决策略可行 |

## 回退说明

| 问题类型 | 回退目标 |
|---------|---------|
| 模块拆分不合理 | 回 G1 |
| 数据模型不支持 | 回 G2 |
| 契约内部问题 | 仅重做 A1 |

## 单模块系统简化规则

当系统仅包含单个模块（即无跨模块交互）时：

- A1 仍需执行，但产物可以为空
- 任务是"确认无跨模块关联"——显式确认没有关联比跳过步骤更安全
- 如果后续新增模块，已有产物的回退链路是完整的
- 输出 `a1/contracts/index.md` 中标注 `single_module: true`，其余产物文件可不创建

## 安全边界

- 禁止修改任何非独占产物
- 禁止在契约中引入上游不变量以外的约束
- 产物文件超过 500 行时必须拆分
- 上游产物缺失时禁止臆造内容，必须报告并等待上游就绪
- A1-K7 须由用户确认后方可视为本步骤完成
- 本技能禁止读取或引用执行顺序在本技能之后的任何技能产物（A2/L1/L2/L3/V1/V2），以保证回退时后续产物不可见
