# 设计产物输出模板

## 核心原则：生成时拆分，非生成后拆分

- 子代理直接按**功能域**产出多个小文件，不产出大文件再后置拆分
- 每个文件目标 250-300 行，硬上限 300 行，允许最后一个文件较少（尾箱不满）
- 全程无中间大文件，避免 AI 上下文爆炸
- 消除后置拆分脚本（已删除 `pipeline-design-shards.mjs`、`enforce-design-limit.mjs`、`merge-design-shards.mjs`、`check-design-lines.mjs`）

## 两阶段分层调度

### 阶段 1：索引层（每维度 1 次调用，全维度并行）

子代理只产出索引文件 + 共享契约 + 实体分组方案（file-plan），不产出实体细节。

索引文件内容：
- 实体清单（页面/端点组/表/测试套件，每实体一行，含稳定 ID 和名称）
- 共享契约（Token/错误码/认证/路由表/ER 概览...）
- file-plan：按功能域分组的文件生成计划，每文件声明含哪些实体、预算行数

### 阶段 1.5：编排层汇总

主代理读取所有索引文件的 file-plan，汇总待生成文件清单。待生成文件 = 所有维度的 file-plan 中除索引外的文件。

### 阶段 2：分组实体层（每文件 1 次调用，全文件并行）

子代理只接收：该维度索引文件 + 该文件对应的实体清单 + 跨维度引用目标（ID 引用，不加载其他维度的实体文件）。产出 1 个文件，含该组所有实体的精确片段。

### 阶段 3：test-cases 实体层

依赖阶段 2 产出的实体清单，按测试层分组调用。

### 阶段 4：跨维度一致性校验（对应 SKILL.md 阶段 5）

只读索引文件（每个 ≤ 300 行），校验引用完整性，不读实体文件，避免上下文膨胀。

## 分组规则

1. **功能域是分组边界** — 同域实体高内聚，打包到一个文件
2. **单域预算 ≤ 300 → 该域一个文件**
3. **单域预算 > 300 → 该域拆成 2 文件**（按实体排序均分，非按单个实体拆）
4. **允许最后一个文件 < 200 行**（尾箱不满，不强制凑满）
5. **不预防性拆分** — 未超限不拆，只在实际超限时拆成 2
6. **所有维度支持大文件自动拆分** — 默认单文件产出，超 300 行时自动拆分为索引 + 分组实体文件。仅 overview/constraints/traceability/design.md 等根目录文件因结构约束固定单文件
7. **文件名带序号** — 多文件维度的所有文件加 `NN-` 前缀（01=索引，02+按生成顺序）；默认单文件的维度在未触发拆分时不加序号，触发拆分后索引文件加 `01-` 前缀、分组实体文件加 `NN-` 前缀

## 即时校验机制

**每生成一个文件就校验一次，不通过打回重新生成该文件，通过后再生成下一个文件。** 避免最终校验导致大量返工。

- 索引层：串行生成，每生成一个文件立即校验 ≤ 300 行
- 实体层：串行生成，每生成一个文件立即校验行数 ≤ 300
  - 校验通过 → 继续生成下一个文件
  - 校验不通过 → 打回该子代理重新生成（调整分组策略），重新生成后再次校验
  - 最多重试 2 次，仍不通过则报错暂停，由主代理介入调整 file-plan

## 产物目录结构

设计契约产出在 `ae/designs/<需求描述名>-YYYY-MM-DD/` 目录下：

```
ae/designs/
└── user-auth-2026-06-24/              # 需求描述名-日期
    ├── design.md                       # 纯索引（< 100 行）
    ├── overview.md                     # 设计总览
    ├── constraints.md                  # 实施约束
    ├── traceability.md                 # 跨维度映射表
    ├── design-spec/                    # 设计规范维度
    │   └── design-spec.md              # 设计读数、三旋钮、设计体系、风格变体、负向设计空间
    ├── architecture/                   # 架构维度
    │   ├── 01-architecture.md          # 索引 + 共享契约 + file-plan
    │   ├── 02-module-boundary.md       # 模块边界 + 依赖方向 + 接口签名
    │   └── 03-data-flow.md             # 数据流伪代码 + 错误传播链 + 跨层状态同步
    ├── api/                            # 接口维度
    │   ├── 01-api.md                   # 索引 + 端点清单 + 认证 + 错误码 + file-plan
    │   ├── 02-endpoints-auth.md        # /auth/* 端点组
    │   ├── 03-endpoints-resource.md    # /resources/* 端点组
    │   └── 04-endpoints-user.md        # /users/* 端点组（尾箱可少）
    ├── database/                       # 数据库维度
    │   ├── 01-database.md              # 索引 + ER 概览 + 范式决策 + file-plan
    │   ├── 02-tables-core.md           # 核心域表 DDL
    │   └── 03-tables-aux.md            # 辅助域表 DDL（尾箱可少）
    ├── ui-ux/                          # UI/UX 维度
    │   ├── 01-ui-ux.md                 # 索引 + 设计读数 + 路由表 + Token + 状态机 + file-plan
    │   ├── 02-pages-auth.md            # 认证域页面：login + register + forgot
    │   ├── 03-pages-resource.md        # 资源域页面：list + detail + form
    │   ├── 04-pages-dashboard.md       # 仪表盘域页面（尾箱可少）
    │   └── 05-components.md            # 全局组件
    ├── test-cases/                     # 测试用例维度
    │   ├── 01-test-cases.md            # 索引 + 覆盖矩阵 + 验收映射 + file-plan
    │   ├── 02-frontend.md              # 前端用例
    │   ├── 03-backend.md               # 后端用例
    │   ├── 04-integration.md           # 集成 + 契约用例
    │   └── 05-non-functional.md        # 性能 + 安全 + 架构 + 可观测性用例
    ├── security/                       # 安全维度（默认单文件；超 300 行自动拆分为 01-security.md + NN-<domain>.md）
    │   └── security.md
    ├── observability/                  # 可观测性维度（默认单文件；超 300 行自动拆分为 01-observability.md + NN-<topic>.md）
    │   └── observability.md
    └── non-functional/                 # 非功能维度（默认单文件；超 300 行自动拆分为 01-non-functional.md + NN-<topic>.md）
        └── non-functional.md
```

**子目录组织规则：** 每个维度的文件放在以维度名命名的子目录中。`design.md` 始终在设计目录根下，为纯索引文件（< 100 行）。`overview.md`、`constraints.md`、`traceability.md` 位于设计目录根下。`design-spec` 产出独立文件 `design-spec/design-spec.md`。

**强制拆分规则：** 无论文件大小，每个维度必须拆分为独立子文件，不在 design.md 中内联维度内容。`design.md` 为纯索引，只保留 frontmatter + Split Manifest + 索引表。

**"需求描述名"来源规则（D12）：**
- prd 文档作为输入时：从 prd 目录名提取（如 `ae/prds/user-auth-2026-06-24/prd.md` → `user-auth`）
- design 作为输入时：从 design 目录名提取（如 `ae/designs/user-auth-2026-06-20/` → `user-auth`）
- 裸描述作为输入时：从用户描述提取关键词转为 kebab-case（如"用户认证系统" → `user-auth`）
- 含特殊字符时强制 kebab-case 转换

**版本演化：** 同一"需求描述名"的多个日期目录共存，旧版本 design.md 的 frontmatter 中 `supersededBy` 指向新版本目录。

---

**frontmatter shards 与 Split Manifest 职责区分：** frontmatter `shards` 列出维度索引文件（`01-<维度名>.md`）、根目录独立文件（overview/constraints/traceability）和单文件维度的独立文件（如 `design-spec/design-spec.md`、`security/security.md`），作为 ae-doc-extract 的索引层入口；Split Manifest 列出全部文件（含分组实体文件 `NN-*.md`），作为完整文件清单。默认单文件的维度（security/observability/non-functional/design-spec）未拆分时在 shards 和 Split Manifest 中均列出对应文件；触发拆分后 shards 列出索引文件（如 `security/01-security.md`），Split Manifest 列出索引 + 所有分组实体。

## design.md 纯索引模板

```markdown
---
type: design
status: active
date: "2026-06-24"
title: "用户认证系统"
topic: "user-auth"
version: "1.0"
last_updated: "2026-06-24"
sharded: true
shards:
  - file: overview.md
    module: overview
  - file: constraints.md
    module: constraints
  - file: traceability.md
    module: traceability
  - file: design-spec/design-spec.md
    module: design-spec
  - file: architecture/01-architecture.md
    module: architecture
  - file: api/01-api.md
    module: api
  - file: database/01-database.md
    module: database
  - file: ui-ux/01-ui-ux.md
    module: ui-ux
  - file: test-cases/01-test-cases.md
    module: test-cases
  - file: security/security.md
    module: security
  - file: observability/observability.md
    module: observability
  - file: non-functional/non-functional.md
    module: non-functional
---
# 设计契约：用户认证系统

## Split Manifest

- split_files:
  - file: overview.md
    lines: 150
  - file: constraints.md
    lines: 80
  - file: traceability.md
    lines: 60
  - file: design-spec/design-spec.md
    lines: 120
  - file: architecture/01-architecture.md
    lines: 280
  - file: architecture/02-module-boundary.md
    lines: 280
  - file: architecture/03-data-flow.md
    lines: 250
  - file: api/01-api.md
    lines: 280
  - file: api/02-endpoints-auth.md
    lines: 200
  - file: api/03-endpoints-resource.md
    lines: 280
  - file: api/04-endpoints-user.md
    lines: 180
  - file: database/01-database.md
    lines: 280
  - file: database/02-tables-core.md
    lines: 280
  - file: database/03-tables-aux.md
    lines: 150
  - file: ui-ux/01-ui-ux.md
    lines: 280
  - file: ui-ux/02-pages-auth.md
    lines: 250
  - file: ui-ux/03-pages-resource.md
    lines: 280
  - file: ui-ux/04-pages-dashboard.md
    lines: 180
  - file: ui-ux/05-components.md
    lines: 280
  - file: test-cases/01-test-cases.md
    lines: 280
  - file: test-cases/02-frontend.md
    lines: 280
  - file: test-cases/03-backend.md
    lines: 280
  - file: test-cases/04-integration.md
    lines: 200
  - file: test-cases/05-non-functional.md
    lines: 250
  - file: security/security.md
    lines: 280
  - file: observability/observability.md
    lines: 200
  - file: non-functional/non-functional.md
    lines: 200

## 索引

| 文件 | 维度 | 行数 | 摘要 | 稳定 ID |
|------|------|------|------|---------|
| [overview.md](overview.md) | 设计总览 | 150 | 设计读数、范围映射、ADR | ADR-001~003 |
| [constraints.md](constraints.md) | 实施约束 | 80 | 环境变量、依赖版本 | — |
| [traceability.md](traceability.md) | 跨维度映射表 | 60 | 4 类映射表 | — |
| [design-spec/design-spec.md](design-spec/design-spec.md) | 设计规范 | 120 | 设计读数、三旋钮、设计体系、风格变体、负向设计空间 | — |
| [architecture/01-architecture.md](architecture/01-architecture.md) | 架构-索引 | 280 | 系统上下文图、技术选型、file-plan | ADR-001~003 |
| [architecture/02-module-boundary.md](architecture/02-module-boundary.md) | 架构-模块边界 | 280 | 模块边界、依赖方向、接口签名 | — |
| [architecture/03-data-flow.md](architecture/03-data-flow.md) | 架构-数据流 | 250 | 数据流伪代码、错误传播链、跨层状态同步 | — |
| [api/01-api.md](api/01-api.md) | 接口-索引 | 280 | 端点清单、认证、错误码、file-plan | EP-001~005 |
| [api/02-endpoints-auth.md](api/02-endpoints-auth.md) | 接口-认证端点 | 200 | /auth/* OpenAPI + Schema | EP-001~003 |
| [api/03-endpoints-resource.md](api/03-endpoints-resource.md) | 接口-资源端点 | 280 | /resources/* OpenAPI + Schema | EP-004~005 |
| [api/04-endpoints-user.md](api/04-endpoints-user.md) | 接口-用户端点 | 180 | /users/* OpenAPI + Schema | EP-006 |
| [database/01-database.md](database/01-database.md) | 数据库-索引 | 280 | ER 概览、范式决策、file-plan | T-users,T-resources |
| [database/02-tables-core.md](database/02-tables-core.md) | 数据库-核心表 | 280 | 核心域表 DDL | T-users,T-resources |
| [database/03-tables-aux.md](database/03-tables-aux.md) | 数据库-辅助表 | 150 | 辅助域表 DDL | T-audit-log |
| [ui-ux/01-ui-ux.md](ui-ux/01-ui-ux.md) | UI/UX-索引 | 280 | 设计读数、路由、Token、状态机、file-plan | ST-001~005 |
| [ui-ux/02-pages-auth.md](ui-ux/02-pages-auth.md) | UI/UX-认证页面 | 250 | login + register + forgot HTML+CSS | PAGE-001~003 |
| [ui-ux/03-pages-resource.md](ui-ux/03-pages-resource.md) | UI/UX-资源页面 | 280 | list + detail + form HTML+CSS | PAGE-004~006 |
| [ui-ux/04-pages-dashboard.md](ui-ux/04-pages-dashboard.md) | UI/UX-仪表盘页面 | 180 | overview + settings HTML+CSS | PAGE-007~008 |
| [ui-ux/05-components.md](ui-ux/05-components.md) | UI/UX-组件 | 280 | 全局组件 HTML+CSS+Props | COMP-001~010 |
| [test-cases/01-test-cases.md](test-cases/01-test-cases.md) | 测试-索引 | 280 | 覆盖矩阵、验收映射、file-plan | TC-001~100 |
| [test-cases/02-frontend.md](test-cases/02-frontend.md) | 测试-前端 | 280 | 组件+交互+UI 状态机+无障碍 | TC-FE-* |
| [test-cases/03-backend.md](test-cases/03-backend.md) | 测试-后端 | 280 | API+服务层+数据层 | TC-BE-* |
| [test-cases/04-integration.md](test-cases/04-integration.md) | 测试-集成 | 200 | 集成+契约测试 | TC-INT-*,TC-CT-* |
| [test-cases/05-non-functional.md](test-cases/05-non-functional.md) | 测试-非功能 | 250 | 性能+安全+架构+可观测性 | TC-PT-*,TC-ST-* |
| [security/security.md](security/security.md) | 安全 | 280 | 威胁模型、认证流程、数据分级 | — |
| [observability/observability.md](observability/observability.md) | 可观测性 | 200 | 日志、指标、告警、SLO | — |
| [non-functional/non-functional.md](non-functional/non-functional.md) | 非功能 | 200 | 性能、并发、缓存、容量 | — |

> 以下维度内容已拆分为独立子文件，请参阅 Split Manifest 中的文件列表。
> 子文件路径相对于本 design.md 所在目录。
```

---

## file-plan 机制

### 索引层子代理产出 file-plan

每个维度的索引文件（`<维度名>/01-<维度名>.md`）中包含 file-plan，声明该维度的实体分组方案：

```yaml
# ui-ux/01-ui-ux.md 中的 file-plan
file-plan:
  - file: 02-pages-auth.md
    entities: [PAGE-001, PAGE-002, PAGE-003]
    budget-lines: 250
  - file: 03-pages-resource.md
    entities: [PAGE-004, PAGE-005, PAGE-006]
    budget-lines: 280
  - file: 04-pages-dashboard.md
    entities: [PAGE-007, PAGE-008]
    budget-lines: 180
  - file: 05-components.md
    entities: [COMP-001, COMP-002, COMP-003, COMP-004, COMP-005, COMP-006, COMP-007, COMP-008, COMP-009, COMP-010]
    budget-lines: 280
```

### 分组规则

1. 按功能域归集实体（同域实体高内聚）
2. 估算每域行数预算
3. 单域预算 ≤ 300 → 该域一个文件
4. 单域预算 > 300 → 该域拆成 2 文件（按实体排序均分，非按单个实体拆）
5. 允许最后一个文件 < 200 行（尾箱不满）

---

## 跨维度引用机制

索引文件中声明实体间的引用关系，实体文件通过 ID 引用：

```yaml
# ui-ux/01-ui-ux.md 中的页面清单
pages:
  - id: PAGE-001
    name: home
    route: /
    refs:
      components: [COMP-001, COMP-002]
      api: [EP-GRP-001]
      test-cases: [TC-FE-001]

components:
  - id: COMP-001
    name: button
    file: 05-components.md
```

```yaml
# api/01-api.md 中的端点组清单
endpoint-groups:
  - id: EP-GRP-001
    name: resources
    route-prefix: /api/v1/resources
    refs:
      database: [T-resources]
      ui-ux: [PAGE-002]
```

校验在阶段 4 完成，只读索引文件（每个 ≤ 300 行），不读实体文件。

---

## 子文件命名规则和 frontmatter 规范

### 索引文件命名

- 文件名：`01-<维度名>.md`（如 `01-architecture.md`、`01-api.md`、`01-database.md`）
- 维度名使用 kebab-case（如 `01-ui-ux.md`、`01-test-cases.md`）
- 文件位于以维度名命名的子目录中
- 单文件维度不加序号（如 `security/security.md`）；触发拆分后索引文件加 `01-` 前缀、分组实体文件加 `NN-` 前缀

### 分组实体文件命名

- 文件名：`NN-<功能域名>.md`（如 `02-endpoints-auth.md`、`03-tables-core.md`、`02-pages-resource.md`）
- NN 为两位序号，从 02 开始（01 为索引文件），按生成顺序递增
- 功能域名使用 kebab-case
- 文件位于对应维度的子目录中（维度名由子目录表达，文件名不重复维度名前缀）
- 分组实体文件由即时校验机制保障 ≤ 300 行（每生成一个文件立即校验）

### 索引文件 frontmatter

```markdown
---
type: design-shard
status: active
section: "architecture"
parent: "design.md"
module: "architecture"
layer: index
heading_chain: "设计契约 > 架构设计"
---

# 架构设计

（索引 + 共享契约 + file-plan）
```

### 分组实体文件 frontmatter

```markdown
---
type: design-shard
status: active
section: "api-endpoints-auth"
parent: "01-api.md"
module: "api"
layer: entity-group
heading_chain: "设计契约 > 接口设计 > 认证端点组"
---

# 接口设计 - 认证端点组

（该组所有端点的 OpenAPI + Schema + 示例）
```

各维度的契约元素（MVCE）清单由 `ae:review` 遇到缺失时降级为手动检查，不再在 frontmatter 中声明。

### 子文件引用方式

design.md 中对维度索引文件的引用：

```markdown
---

## 架构设计

> 本维度内容已拆分至 `architecture/01-architecture.md`，实体文件详见 Split Manifest。
```

### 维度索引文件中的实体文件引用

```markdown
---

## 接口设计

> 本维度已按功能域分组，内容分布在以下文件中：

- [认证端点组](02-endpoints-auth.md) — /auth/* 端点
- [资源端点组](03-endpoints-resource.md) — /resources/* 端点
- [用户端点组](04-endpoints-user.md) — /users/* 端点
```

> 引用清单中的子文件链接使用相对路径（相对于引用清单所在子目录）。

---

## 行数校验（即时校验，非最终校验）

**每生成一个文件就校验一次，不通过打回重新生成该文件，通过后再生成下一个文件。** 避免最终校验导致大量返工。

### 索引层校验

索引层串行生成，每生成一个文件立即校验 ≤ 300 行。

### 实体层校验（串行生成 + 即时校验）

实体层按 file-plan 顺序串行生成，每生成一个文件立即校验：
- 校验通过 → 继续生成下一个文件
- 校验不通过 → 打回该子代理重新生成（调整分组策略），重新生成后再次校验
- 最多重试 2 次，仍不通过则报错暂停，由主代理介入调整 file-plan

校验规则：
- 所有文件（索引文件 + 分组实体文件 + overview/constraints/traceability）行数 ≤ 300 行
- `design.md` 豁免（纯索引 < 100 行）

**消除的机制：**
- ❌ 后置拆分脚本（已删除 `pipeline-design-shards.mjs`、`enforce-design-limit.mjs`、`merge-design-shards.mjs`、`check-design-lines.mjs`）
- ❌ 生成后合并回父文件
- ❌ 递归兜底硬切
- ❌ 最终统一校验（改为即时校验）

**保留的机制：**
- ✅ 即时行数校验（每生成一个文件校验一次，超限打回重生）
- ✅ heading_chain（跨文件语义追溯）
- ✅ Split Manifest（记录文件清单）
- ✅ 跨维度引用校验（阶段 4，只读索引）

---

## 跨维度一致性校验

拆分后，跨维度一致性校验只读索引文件（每个 ≤ 300 行），不读实体文件：
- 读取 Split Manifest 获取文件列表
- 读取所有维度的索引文件，获取实体清单和引用关系
- 执行 SKILL.md 阶段 5 定义的全部校验项（14 项，以 SKILL.md 为权威来源，本文件不重复列举）
