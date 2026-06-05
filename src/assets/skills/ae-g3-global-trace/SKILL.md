---
name: ae:g3-global-trace
description: 全局数据推演：用测试数据代入数据模型和状态机，走通核心业务流程，验证不变量在全局范围内成立。依赖 G1、G2 产物（只读），输出推演场景、测试数据、推演记录和覆盖率报告。
---

# G3 全局数据推演

## 角色

数据推演工程师，负责将 G1 不变量和 G2 数据模型/状态机代入端到端场景，验证全局一致性。

## 适用场景

- 前序技能 ae:g1-invariants 不变量和 ae:g2-data-model 数据模型已完成，需要验证其在业务流程中是否始终成立
- 需要确认状态机迁移路径在真实数据流下可行
- 需要量化不变量和状态迁移的覆盖程度

## 不适用场景

- 前序技能 ae:g1-invariants 或 ae:g2-data-model 产物未就绪时不得执行
- 仅需局部逻辑验证而非全局端到端推演
- 不涉及状态机或不变量的简单查询类需求

## 产物根目录

所有产物写入**产物根目录**下。默认根目录为 `docs/ae/galv/<项目名>/`。

`<项目名>` 由以下规则确定：
1. 若产物根目录下已存在 `galv-manifest.yaml`，读取其中的 `project_name` 字段作为项目名
2. 若不存在，提示用户先执行上游技能创建 manifest，或由用户手动提供项目名后由本技能创建
3. 后续所有技能必须读取 `galv-manifest.yaml` 获取项目名，禁止自行推断

整个根目录自包含、可移植：内部所有路径均为相对路径，目录可整体移动到任意位置。读取全部阶段产物后，任何 AI 工具可据此生成功能等价、结构等价的软件系统。

本阶段的产物位于根目录下 `g3/` 子目录。

## 输入

前序技能：**ae:g1-invariants**、**ae:g2-data-model**（紧邻前序为 ae:g2-data-model）

本技能**只读**以下上游产物，**禁止修改**：

| 上游技能 | 产物路径 | 用途 |
|---------|---------|------|
| ae:g1-invariants | `g1/invariants/` 或 `g1/invariants.md` | 不变量定义，推演检查点来源 |
| ae:g1-invariants | `g1/boundary.md` | 边界约束，测试数据边界值来源 |
| ae:g1-invariants | `g1/ambiguities.md` | 歧义记录，推演需额外关注的风险点 |
| ae:g2-data-model | `g2/data-model/` 或 `g2/data-model.md` | 数据模型，实体关系和约束来源 |
| ae:g2-data-model | `g2/state-machines/` 或 `g2/state-machines.md` | 状态机定义，状态迁移验证来源 |
| ae:g2-data-model | `g2/ddl-verify.sql` | DDL 约束，关系约束验证依据 |

## 执行流程

### T1 设计推演场景

1. 读取 G1 不变量，列出所有需验证的不变量条目
2. 读取 G2 状态机，列出所有需触发的状态迁移路径
3. 针对核心业务流程设计端到端场景，每个场景包含：
   - **场景名称与描述**
   - **初始数据**：场景开始时各实体的数据状态
   - **操作序列**：按业务时序排列的操作步骤
   - **期望结果**：每步操作后的预期状态
   - **不变量检查点**：该场景覆盖的不变量及检查时机
4. 场景设计原则：
   - 优先覆盖核心正向流程
   - 每条不变量至少被 1 个场景覆盖
   - 每个状态迁移至少被 1 个场景触发
   - 包含至少 1 个边界/异常场景

### T2 构造测试数据

1. 读取 G2 数据模型，获取实体定义和字段约束
2. 读取 G1 boundary.md，提取边界值定义
3. 为每个实体构造三类数据：
   - **正常值**：符合所有约束的典型数据
   - **边界值**：触碰边界约束的极限数据
   - **异常值**：违反约束的非法数据（用于验证约束拦截）
4. 测试数据必须可溯源至具体实体和约束
5. 测试数据必须使用 given/when/then 三段式结构：
   - **given**（初始状态）：推演开始前各实体的数据快照
   - **when**（触发操作）：执行什么动作，输入什么参数
   - **then**（预期结果）：操作后各实体的预期状态 + 哪些不变量应被守卫通过

### T3 逐场景推演

1. 按操作序列逐步代入测试数据
2. 每步检查：
   - 实体状态变更是否符合 G2 状态机定义
   - 操作后所有相关不变量是否仍然成立
   - 实体间关系约束是否未被破坏
3. 记录推演结果：
   - Pass：所有检查通过
   - Fail：标注失败的不变量或状态迁移，记录失败原因
   - Skip：因前置条件未满足而跳过的步骤
4. 失败场景必须定位到具体的不变量编号或状态迁移路径

### T4 计算覆盖率

1. 统计不变量覆盖率：被至少 1 个 pass 场景覆盖的不变量 / 总不变量数
2. 统计状态迁移覆盖率：被至少 1 个 pass 场景触发的迁移 / 总迁移数
3. 输出未覆盖清单：未被任何场景覆盖的不变量和状态迁移
4. 若覆盖率未达 100%，补充场景后重新推演

## 产物独占

**独占产物**：只有本技能可以创建或修改（路径相对于产物根目录）：

- `g3/data-trace/` 或 `g3/data-trace.md`
- `g3/trace-coverage.md`

**共享产物**：`galv-manifest.yaml`（首次创建时由当前执行的技能负责，后续技能可读取和追加信息）

## 产物规格

### `g3/data-trace/` 或 `g3/data-trace.md`

- 场景数量 ≤ 3 时，输出单文件 `g3/data-trace.md`
- 场景数量 > 3 时，输出目录 `g3/data-trace/`，每个场景一个文件
- 目录形式时，`index.md` Frontmatter 必须包含 `type: directory_index` 和 `slices` 字段：

```yaml
type: directory_index
slices:
  - file: trace-{group}.md
    summary: 该组推演场景
    id_range: [SC-001, SC-XXX]
```

- 每个场景文件格式：

```yaml
scenario: 场景名称
description: 场景描述
covers_invariants: [INV-001, INV-002]
covers_transitions: [Order.created->paid, Order.paid->shipped]
given:
  - entity: 实体名
    records:
      - id: 示例数据ID
        fields: { }
when:
  - action: 操作描述
    input: { }
then:
  - expected_state: { }
    invariant_checks:
      - invariant: INV-001
        result: pass
        evidence: 具体验证过程
    transition_checks:
      - transition: Order.created->paid
        result: pass
        evidence: 具体验证过程
final_result: pass | fail
failure_detail: 失败时定位到具体不变量或迁移
```

正文为推演过程的人类阐释。

### `g3/trace-coverage.md`

```yaml
invariant_coverage:
  total: 总不变量数
  covered: 已覆盖数
  rate: 覆盖率
  uncovered:
    - invariant: INV-XXX
      reason: 未覆盖原因
transition_coverage:
  total: 总迁移数
  covered: 已覆盖数
  rate: 覆盖率
  uncovered:
    - transition: 迁移路径
      reason: 未覆盖原因
scenario_summary:
  total: 总场景数
  passed: 通过数
  failed: 失败数
```

正文为覆盖率分析的人类阐释。

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
| G3-K1 | 推演全通过 | 所有场景推演 pass |
| G3-K2 | 不变量覆盖 100% | 每条不变量至少 1 个场景覆盖 |
| G3-K3 | 状态迁移覆盖 100% | 每个状态迁移至少 1 个场景触发 |
| G3-K4 | 失败可定位 | 失败场景可定位到具体不变量或状态迁移 |
| G3-K5 | 文件行数合规 | 所有产物文件不超过 500 行 |
| G3-K6 | 人工审核通过 | 用户确认推演场景合理、覆盖率达标、失败定位准确 |

## 回退说明

| 回退条件 | 目标 | 说明 |
|---------|------|------|
| 不变量本身有问题 | G1 | 不变量定义矛盾或遗漏，需回 G1 修正 |
| 数据模型有问题 | G2 | 实体关系或约束有误，需回 G2 修正 |
| 推演逻辑问题 | 仅重做 G3 | 场景设计或测试数据构造有误，重做 G3 即可 |

## 安全边界

- **只读上游**：禁止修改 G1、G2 的任何产物文件
- **独占产物**：只有本技能可修改 `g3/data-trace/`（或 `g3/data-trace.md`）和 `g3/trace-coverage.md`
- **禁止修改下游**：不修改后续步骤的产物
- **禁止读取后续产物**：本技能禁止读取或引用执行顺序在本技能之后的任何技能产物（A1/A2/L1/L2/L3/V1/V2），以保证回退时后续产物不可见
- **幂等性**：重复执行时覆盖本技能独占产物，不破坏上游产物

## 完成标准

1. 所有验收关卡 G3-K1 至 G3-K6 通过
2. 产物文件行数合规（≤ 500 行）
3. 未覆盖清单为空或已标注为已知风险
4. 失败场景已定位到具体不变量或状态迁移
5. G3-K6 须由用户确认后方可视为本步骤完成
