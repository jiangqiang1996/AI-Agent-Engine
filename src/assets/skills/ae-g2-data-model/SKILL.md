---
name: ae:g2-data-model
description: 从不变量推导实体、字段、关系、约束和状态机，确保每条不变量在数据模型中有对应约束。当 G1 产物就绪且需要定义数据模型时使用。
---

# G2 数据模型

## 角色

数据模型设计师：从 G1 不变量产物推导完整数据模型，确保每条不变量在数据约束中有对应体现。

## 适用场景

- 前序技能 ae:g1-invariants 产物（invariants/、boundary.md、ambiguities.md）已就绪
- 需要定义实体、字段、关系、约束和状态机
- 需要生成可验证的 DDL

## 不适用场景

- 前序技能 ae:g1-invariants 产物未就绪时不得执行
- 仅需调整已有数据模型的局部字段（无需完整推导）
- 不涉及数据约束的纯 UI 或纯流程设计

## 产物根目录

所有产物写入**产物根目录**下。默认根目录为 `docs/ae/galv/<项目名>/`。

`<项目名>` 由以下规则确定：
1. 若产物根目录下已存在 `galv-manifest.yaml`，读取其中的 `project_name` 字段作为项目名
2. 若不存在，提示用户先执行 G1 技能创建 manifest，或由用户手动提供项目名后由本技能创建
3. 后续所有技能必须读取 `galv-manifest.yaml` 获取项目名，禁止自行推断

整个根目录自包含、可移植：内部所有路径均为相对路径，目录可整体移动到任意位置。读取全部阶段产物后，任何 AI 工具可据此生成功能等价、结构等价的软件系统。

本阶段的产物位于根目录下 `g2/` 子目录。

## 产物与独占权

**独占产物**：只有本技能可以创建或修改（路径相对于产物根目录）：

| 产物 | 格式 | 行数上限 |
|------|------|---------|
| `g2/data-model/`（≤3 实体时可单文件 `g2/data-model.md`） | YAML Frontmatter + 正文 | 500 |
| `g2/state-machines/`（≤2 状态机时可单文件 `g2/state-machines.md`） | YAML Frontmatter + 正文 | 500 |
| `g2/ddl-verify.sql` | SQL | 500 |

**共享产物**：`galv-manifest.yaml`（首次创建时由当前执行的技能负责，后续技能可读取和追加信息）

**禁止修改**上游技能产物（G1 的 `g1/invariants/`、`g1/boundary.md`、`g1/ambiguities.md`）和下游技能产物。

## 上游依赖（只读）

紧邻前序技能：**ae:g1-invariants**

| 上游技能 | 产物 | 用途 |
|---------|------|------|
| ae:g1-invariants | `g1/invariants/` | 遍历提取实体、字段、约束 |
| ae:g1-invariants | `g1/boundary.md` | 确定模型边界 |
| ae:g1-invariants | `g1/ambiguities.md` | 识别需澄清的建模歧义 |

## 执行流程

### T1 从不变量推导实体

1. 遍历 `g1/invariants/` 每条不变量，提取涉及的名词作为候选实体
2. 合并同义名词，消除冗余候选
3. 为每个实体确定字段：从不变量中提取该实体相关的属性描述
4. 标注每个实体的归属模块

### T2 定义关系

1. 从不变量中提取实体间的关联描述
2. 确定关系类型（1:1、1:N、M:N）
3. 定义外键字段及关联条件
4. 标注关系的业务语义

### T3 定义约束

将每条不变量映射为数据约束，分三类：

- **字段级约束**：类型、范围、格式、唯一性、非空
- **关系级约束**：基数、级联规则、互斥关系
- **跨实体约束**：CHECK 约束、触发器逻辑

**映射规则**：每条不变量必须至少产生一条约束；若不变量无法直接映射，须在产物中说明转化方式。

### T4 定义状态机

1. 识别有状态迁移的实体（字段值存在有限离散状态集且状态间有条件迁移）
2. 对每个有状态实体定义：
   - 状态列表（含初始状态和终态）
   - 迁移条件（触发事件 + 守卫条件）
   - 迁移副作用（字段变更、事件触发）
3. 无状态实体跳过此步

### T5 映射不变量到约束

将每条不变量映射为数据约束，分三类：

- **字段级约束**：类型、范围、格式、唯一性、非空
- **关系级约束**：基数、级联规则、互斥关系
- **跨实体约束**：CHECK 约束、触发器逻辑

映射规则：每条不变量必须至少产生一条约束；若不变量无法直接映射，须在产物中说明转化方式。每条约束用 trace 字段标注来源不变量的 id。

### T6 标注端/模块归属

每个字段和实体标注端/模块归属：哪些端可以读取、哪些端可以编辑。这决定了 A1 阶段的数据流和权限边界。

```yaml
fields:
  - name: balance
    type: decimal
    module_ownership:
      owner: payment-service
      read_only: [order-service, admin-portal]
      editable: [payment-service]
```

### T7 生成验证 DDL

1. 为每个实体生成 `CREATE TABLE` 语句
2. 添加完整约束定义：`PRIMARY KEY`、`FOREIGN KEY`、`CHECK`、`UNIQUE`、`NOT NULL`
3. 状态机约束用 `CHECK` 实现合法状态值枚举和合法迁移校验
4. 跨实体约束用 `CHECK` 或触发器注释说明

### T8 标注性能暗示

为以下场景标注性能需求（不是可选的，是必须的）：

- 高频查询的字段 → 需要索引
- 低延迟要求的操作 → 需要缓存
- 高并发写入的实体 → 需要锁策略
- 批量导入场景 → 标注数据量级

```yaml
performance_hints:
  - field: User.balance
    hint: 高频查询，需要索引
    index: idx_user_balance
  - entity: Order
    hint: 高并发写入，需要乐观锁
    lock_strategy: optimistic
```

### T9 执行 DDL 验证

1. 在数据库中执行 `ddl-verify.sql` 建表
2. 插入合法数据，验证约束不误拒
3. 插入非法数据（违反每类约束各一条），验证约束正确拒绝
4. 记录验证结果

若 DDL 验证失败，回到 T5 修正 DDL；若发现不变量本身有问题，记录并回退到 G1。

## 产物格式

### g2/data-model/ 或 g2/data-model.md

目录形式时，`index.md` Frontmatter 必须包含 `type: directory_index` 和 `slices` 字段：

```yaml
type: directory_index
slices:
  - file: entities-{domain}.md
    summary: 该域实体定义
    id_range: [EntityA, EntityB]
entities:
  - name: 实体名
    module: 归属模块
    fields:
      - name: 字段名
        type: 数据类型
        constraints: [约束列表]
        module_ownership:
          owner: 归属模块
          read_only: [只读副本模块列表]
          editable: [可编辑模块列表]
        performance_hints:
          - hint: 性能需求描述
            index: 建议索引名
    source_invariants: [INV-001, INV-002]
relationships:
  - source: 源实体
    target: 目标实体
    type: "1:N"
    foreign_key: 外键字段
    condition: 关联条件
    source_invariants: [INV-003]
constraints:
  - id: C-001
    type: field | relation | cross_entity
    target: 实体名.字段名
    definition: CHECK (字段 > 0)
    source_invariant: INV-001
    trace: INV-001
```

正文为人类阐释：实体设计理由、关系语义说明、约束映射解释。

### g2/state-machines/ 或 g2/state-machines.md

目录形式时，`index.md` Frontmatter 必须包含 `type: directory_index` 和 `slices` 字段：

```yaml
type: directory_index
slices:
  - file: sm-{entity}.md
    summary: 该实体状态迁移定义
    id_range: [EntityName]
state_machines:
  - entity: 实体名
    states: [draft, active, closed]
    initial: draft
    transitions:
      - from: draft
        to: active
        guard: 守卫条件
        side_effect: 副作用描述
        source_invariant: INV-004
```

正文为人类阐释：状态业务语义、迁移触发场景。

### g2/ddl-verify.sql

标准 SQL，每条 `CREATE TABLE` 附注释标注对应实体和来源不变量。

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
| G2-K1 | 不变量有约束 | 每条不变量在 g2/data-model/ 中有对应约束且 trace 字段标注不变量 id |
| G2-K2 | CRUD 覆盖完整 | 每个实体的创建/读取/更新/删除路径存在或明确标注不适用 |
| G2-K3 | 实体归属明确 | 每个实体和字段标注端/模块归属（module_ownership） |
| G2-K4 | 状态机完整 | 有状态实体有完整状态机定义，无死锁，无不可达状态 |
| G2-K5 | 无孤儿字段 | 每个字段至少被一个端/模块引用 |
| G2-K6 | DDL 验证通过 | 建表成功，约束生效 |
| G2-K7 | 无遗漏实体 | 不变量涉及的所有名词均被建模 |
| G2-K8 | 性能暗示已标注 | 每个高频查询/高并发/低延迟场景有 performance_hints |
| G2-K9 | 文件行数合规 | 所有产物文件不超过 500 行 |
| G2-K10 | 人工审核通过 | 用户确认实体建模合理、约束映射正确、状态机定义完整 |

## 回退说明

| 发现问题 | 回退目标 |
|---------|---------|
| 不变量缺失或矛盾 | 回 G1 修正 |
| 数据模型内部问题（约束遗漏、关系错误） | 仅重做 G2 |

## 安全边界

- 只读访问 G1 产物，不得修改
- 不得修改下游技能产物
- 本技能禁止读取或引用执行顺序在本技能之后的任何技能产物（G3/A1/A2/L1/L2/L3/V1/V2），以保证回退时后续产物不可见
- DDL 验证使用独立测试环境，不得在生产环境执行
- 发现歧义时记录但不直接修改上游原文

## 验证方式

1. 逐条检查 G2-K1 至 G2-K6
2. DDL 验证须有实际执行结果作为证据
3. 不变量与约束的映射须可追溯（约束中标注 source_invariant）
4. G2-K7 须由用户确认后方可视为本步骤完成
