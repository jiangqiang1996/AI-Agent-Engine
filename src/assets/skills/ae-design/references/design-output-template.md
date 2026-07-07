# 设计产物输出模板

## 产物目录结构

设计契约产出在 `ae/designs/<需求描述名>-YYYY-MM-DD/` 目录下：

```
ae/designs/
└── user-auth-2026-06-24/          # 需求描述名-日期
    ├── design.md                   # 元文件（含 frontmatter + overview + Split Manifest）
    ├── architecture.md             # 拆分子文件（仅 split 状态时存在）
    ├── api.md                      # 拆分子文件
    ├── database.md                 # 拆分子文件
    ├── ui-ux.md                    # 拆分子文件
    ├── test-cases.md               # 拆分子文件
    ├── security.md                 # 拆分子文件
    ├── observability.md            # 拆分子文件
    └── non-functional.md           # 拆分子文件
```

**"需求描述名"来源规则（D12）：**
- prd 文档作为输入时：从 prd 文件名提取（如 `user-auth-prd.md` → `user-auth`）
- 旧 design 作为输入时：从旧 design 目录名提取（如 `ae/designs/user-auth-2026-06-20/` → `user-auth`）
- 裸描述作为输入时：从用户描述提取关键词转为 kebab-case（如"用户认证系统" → `user-auth`）
- 含特殊字符时强制 kebab-case 转换

**版本演化：** 同一"需求描述名"的多个日期目录共存，新目录的 frontmatter 中 `supersedes` 指向前序版本目录。

---

## design.md 元文件模板

### Unified 状态（所有维度内联）

```markdown
---
version: "1.0"
supersedes: null
last_updated: "2026-06-24"
design_name: "user-auth"
status: "active"
---

# 设计契约：用户认证系统

## Split Manifest

- status: unified
- total_lines: 280
- threshold: 300
- inline_sections:
  - overview
  - implementation_constraints
  - cross_dimension_mapping
  - architecture
  - api
  - database
  - ui-ux
  - test-cases
  - security
  - observability
  - non-functional
- split_files: []

---

## 设计总览

### 设计读数
（一句话声明设计意图、任务类型和设计家族）

### 范围映射
（prd 需求条目 → design 维度的对应关系表）

### 产物清单
（本次产出的维度文件列表和状态）

### 契约版本
- 版本号：1.0
- 前序版本：无
- 变更摘要：初始设计

### 跨维度依赖关系
（记录维度间的一致性约束）

### 设计决策记录（ADR）
（记录关键设计决策和理由，使用稳定 ID ADR-XXX）

---

## 实施约束

### 环境变量清单

| 变量名 | 类型 | 默认值 | 是否必需 | 描述 |
|--------|------|--------|---------|------|
| DATABASE_URL | string | - | 是 | 数据库连接字符串 |
| JWT_SECRET | string | - | 是 | JWT 签名密钥 |
| LOG_LEVEL | enum | INFO | 否 | 日志级别 |

### 依赖版本矩阵

| 依赖名 | 版本范围 | 用途 | 是否生产依赖 |
|--------|---------|------|------------|
| react | ^18.0.0 | UI 框架 | 是 |
| express | ^4.18.0 | HTTP 服务 | 是 |
| vitest | ^1.0.0 | 测试框架 | 否 |

### 配置项清单

| 配置键 | 配置路径 | 默认值 | 环境覆盖 | 描述 |
|--------|---------|--------|---------|------|
| port | server.port | 3000 | PORT | 服务端口 |
| corsOrigins | security.cors | [] | CORS_ORIGINS | 允许的 CORS 来源 |

### 目录结构约定

| 路径 | 用途 |
|------|------|
| src/server/ | 服务端入口 |
| src/routes/ | API 路由 |
| src/services/ | 业务逻辑 |
| src/repositories/ | 数据访问 |
| src/components/ | UI 组件 |

### 构建与运行命令

| 命令 | 用途 |
|------|------|
| npm run build | 构建 |
| npm run dev | 开发模式 |
| npm test | 测试 |
| npm run lint | 代码检查 |

---

## 跨维度映射表

引用 `references/design-dimensions.md` 中定义的 4 类映射模板：

### api-field-to-database-column-mapping
（API 请求/响应字段 ↔ 数据库表字段映射表）

### api-error-to-ui-state-mapping
（API 错误码 ↔ UI 交互状态机映射表）

### test-case-to-contract-coverage
（测试用例 ↔ 维度契约元素覆盖追溯表）

### ui-component-to-api-endpoint-mapping
（UI 组件 ↔ API 端点映射表）

---

## 架构设计
（architecture 维度内容）

---

## 接口设计
（api 维度内容）

---

## 数据库设计
（database 维度内容）

---

## UI/UX 设计
（ui-ux 维度内容）

---

## 测试用例设计
（test-cases 维度内容）

---

## 安全设计
（security 维度内容）

---

## 可观测性设计
（observability 维度内容）

---

## 非功能设计
（non-functional 维度内容）
```

### Split 状态（维度拆分为子文件）

```markdown
---
version: "1.0"
supersedes: null
last_updated: "2026-06-24"
design_name: "user-auth"
status: "active"
---

# 设计契约：用户认证系统

## Split Manifest

- status: split
- total_lines: 340
- threshold: 300
- inline_sections:
  - overview
  - implementation_constraints
  - cross_dimension_mapping
  - split_manifest
- split_files:
  - file: architecture.md
    section: architecture
    lines: 280
    sub_split: false
  - file: api.md
    section: api
    lines: 50
    sub_split: true
    sub_files:
      - file: api-endpoints.md
        section: api-endpoints
        lines: 180
      - file: api-auth.md
        section: api-auth
        lines: 120
      - file: api-errors.md
        section: api-errors
        lines: 90
      - file: api-versions.md
        section: api-versions
        lines: 60
  - file: database.md
    section: database
    lines: 30
    sub_split: true
    sub_files:
      - file: database-tables.md
        section: database-tables
        lines: 200
      - file: database-migrations.md
        section: database-migrations
        lines: 100
  - file: ui-ux.md
    section: ui-ux
    lines: 280
    sub_split: false
  - file: test-cases.md
    section: test-cases
    lines: 280
    sub_split: false
  - file: security.md
    section: security
    lines: 150
    sub_split: false

---

## 设计总览
（overview 内容，始终内联）

### 设计读数
（一句话声明设计意图、任务类型和设计家族）

### 范围映射
（prd 需求条目 → design 维度的对应关系表）

### 产物清单

| 维度 | 文件 | 状态 | 版本 |
|------|------|------|------|
| overview | design.md（内联） | split | 1.0 |
| architecture | architecture.md | split | 1.0 |
| api | api.md（引用清单） | split | 1.0 |
| api-endpoints | api-endpoints.md | sub-split | 1.0 |
| api-auth | api-auth.md | sub-split | 1.0 |
| api-errors | api-errors.md | sub-split | 1.0 |
| api-versions | api-versions.md | sub-split | 1.0 |
| database | database.md（引用清单） | split | 1.0 |
| database-tables | database-tables.md | sub-split | 1.0 |
| database-migrations | database-migrations.md | sub-split | 1.0 |
| ui-ux | ui-ux.md | split | 1.0 |
| test-cases | test-cases.md | split | 1.0 |
| security | security.md | split | 1.0 |

### 契约版本
- 版本号：1.0
- 前序版本：无
- 变更摘要：初始设计

### 跨维度依赖关系
（记录维度间的一致性约束）

### 设计决策记录（ADR）
（记录关键设计决策和理由，使用稳定 ID ADR-XXX）

---

## 实施约束
（始终内联，不参与拆分）

### 环境变量清单
（变量名、类型、默认值、是否必需、描述）

### 依赖版本矩阵
（依赖名、版本范围、用途、是否生产依赖）

### 配置项清单
（配置键、配置路径、默认值、环境覆盖、描述）

### 目录结构约定
（关键目录和文件的仓库相对路径、用途说明）

### 构建与运行命令
（构建命令、开发命令、测试命令、lint 命令）

---

## 跨维度映射表
（始终内联，不参与拆分，作为维度间一致性的单一真源锚点）

### api-field-to-database-column-mapping
（API 请求/响应字段 ↔ 数据库表字段映射表）

### api-error-to-ui-state-mapping
（API 错误码 ↔ UI 交互状态机映射表）

### test-case-to-contract-coverage
（测试用例 ↔ 维度契约元素覆盖追溯表）

### ui-component-to-api-endpoint-mapping
（UI 组件 ↔ API 端点映射表）

---

> 以下维度内容已拆分为独立子文件，请参阅 Split Manifest 中的文件列表。
> 子文件路径相对于本 design.md 所在目录。
```

---

## 拆分规则

### 一级拆分

#### 触发条件

`design.md` 总行数超过 **300 行** 时触发一级拆分。`design.md` 自身豁免 300 行校验，但作为导航索引文件，超过 300 行时必须将所有维度章节拆出。

#### 拆分步骤

1. **统计 design.md 总行数** - 包含 frontmatter、Split Manifest、overview、实施约束、跨维度映射表和所有维度章节
2. **≤ 300 行** - 所有维度内联在 design.md 中，Split Manifest 状态为 `unified`，无需拆分
3. **> 300 行** - 全部维度章节拆出为独立子文件，Split Manifest 状态为 `split`
4. **design.md 保留内容** - frontmatter + Split Manifest + overview + 实施约束 + 跨维度映射表 + 引用说明
5. **Split Manifest 更新** - 记录每个拆出文件的 file、section、lines、sub_split 状态

#### 始终内联的章节

以下章节永远不拆出，始终内联在 design.md 中：
- overview（设计总览）
- implementation_constraints（实施约束）
- cross_dimension_mapping（跨维度映射表）
- Split Manifest

#### 拆分停止条件

- design.md 仅剩 overview + 实施约束 + 跨维度映射表 + Split Manifest + 引用说明时停止

### 二级拆分

#### 触发条件

一级拆分后，某个维度子文件（如 `api.md`）行数超过 **300 行** 时触发二级拆分。

#### 拆分步骤

1. **统计维度子文件行数** - 包含 frontmatter 和维度正文
2. **≤ 300 行** - 保持为独立子文件，不继续拆分
3. **> 300 行** - 按 `###` 子章节拆出为二级子文件
4. **维度子文件变为引用清单** - 原 `<维度名>.md` 只保留 frontmatter + 引用说明，正文移至二级子文件
5. **Split Manifest 更新** - 在 `sub_files` 中记录每个二级子文件

#### 二级子文件命名

- 文件名：`<维度名>-<章节名>.md`（如 `api-endpoints.md`、`api-auth.md`、`api-errors.md`）
- 维度名和章节名均使用 kebab-case
- 文件位于 design.md 同级目录
- 章节名取自 `###` 标题的 kebab-case 形式（如 `### 端点清单` → `endpoints`、`### 认证授权` → `auth`）

#### 拆分停止条件

- 已拆分到 `###` 章节级的文件不再继续拆分，其行数不参与校验
- 即使某个 `###` 章节内容本身超过 300 行，也不继续拆分

### 校验机制

使用 `<ae-design路径>/scripts/check-design-lines.mjs` 校验产物文件行数：

- **校验范围**：一级拆分文件（`<维度名>.md`），不包括 design.md 和二级子文件（`<维度名>-<章节名>.md`）
- **校验规则**：一级拆分文件行数 ≤ 300 行
- **失败处理**：校验脚本退出码 1 时，对超标文件重新拆分
- **用法**：`node <ae-design路径>/scripts/check-design-lines.mjs <design目录路径> [--threshold N]`

### 示例

假设 design.md 有 2500 行，各维度行数：
- overview: 150 行（不拆，始终内联）
- implementation_constraints: 80 行（不拆，始终内联）
- cross_dimension_mapping: 60 行（不拆，始终内联）
- architecture: 280 行 → 拆出，≤ 300 不再二级拆分
- api: 520 行 → 拆出，> 300 触发二级拆分
  - api-endpoints.md: 180 行
  - api-auth.md: 120 行
  - api-errors.md: 90 行
  - api-versions.md: 60 行
  - api.md（引用清单）: 50 行
- database: 350 行 → 拆出，> 300 但已是独立维度文件，按 `###` 二级拆分
  - database-tables.md: 200 行
  - database-migrations.md: 100 行
  - database.md（引用清单）: 30 行
- ui-ux: 280 行 → 拆出，≤ 300 不再二级拆分
- test-cases: 280 行 → 拆出，≤ 300 不再二级拆分
- security: 150 行 → 拆出，≤ 300 不再二级拆分

拆分后 design.md 剩余：150 (overview) + 80 (实施约束) + 60 (跨维度映射表) + 50 (Split Manifest + 引用说明) = 340 行

校验脚本只检查 architecture.md (280)、database.md (30, 引用清单)、ui-ux.md (280)、test-cases.md (280)、security.md (150)，全部 ≤ 300，校验通过。api-endpoints.md 等二级子文件跳过校验。

---

## 子文件命名规则和 frontmatter 规范

### 一级子文件命名

- 文件名：`<维度名>.md`（如 `architecture.md`、`api.md`、`database.md`）
- 维度名使用 kebab-case（如 `ui-ux.md`、`test-cases.md`、`non-functional.md`）
- 文件位于 design.md 同级目录

### 二级子文件命名

- 文件名：`<维度名>-<章节名>.md`（如 `api-endpoints.md`、`api-auth.md`、`database-tables.md`）
- 章节名取自 `###` 标题的 kebab-case 形式
- 文件位于 design.md 同级目录（不创建子目录）
- 二级子文件跳过行数校验

### 一级子文件 frontmatter

每个拆分子文件包含 frontmatter，其中 `contract_elements` 记录该子文件的 MVCE（最小可验证契约元素）清单，供 ae:review 的 auto 修复快速识别该子文件应有的契约元素：

```markdown
---
design_name: "user-auth"
design_version: "1.0"
section: "architecture"
parent: "design.md"
contract_elements: [module_boundary, dependency_direction, layering_rule, data_flow, tech_selection, error_propagation, cross_layer_sync, negative_space]
sub_split: false
last_updated: "2026-06-24"
---

# 架构设计
（维度内容）
```

### 二级子文件 frontmatter

二级拆分子文件使用 `sub_split: true` 标记父文件已二级拆分，自身包含 `section` 字段标识所属章节：

```markdown
---
design_name: "user-auth"
design_version: "1.0"
section: "api-endpoints"
parent: "api.md"
dimension: "api"
last_updated: "2026-06-24"
---

# 接口设计 - 端点清单
（章节内容）
```

`contract_elements` 字段为可选；ae:review 遇到缺失时降级为手动检查。各维度的 contract_elements 取值参考 `references/design-dimensions.md` 中对应维度的"契约元素（MVCE）"章节。

**命名规则：** `contract_elements` 使用 snake_case 英文标识，从 MVCE 元素的中文名称按"动词+名词"或"名词组合"规则转换（如"模块边界表"→`module_boundary`、"错误传播链"→`error_propagation`）。命名应保持简洁、可读、可机器匹配。

### 子文件引用方式

design.md 中对一级拆分子文件的引用：

```markdown
---

## 架构设计

> 本维度内容已拆分至 `architecture.md`。

---

## 接口设计

> 本维度内容已拆分至 `api.md`，其中部分章节已二级拆分，详见 Split Manifest。
```

### 二级拆分后维度文件的引用方式

维度子文件二级拆分后，原 `<维度名>.md` 变为引用清单：

```markdown
---
design_name: "user-auth"
design_version: "1.0"
section: "api"
parent: "design.md"
sub_split: true
last_updated: "2026-06-24"
---

# 接口设计

> 本维度已按章节二级拆分，内容分布在以下子文件中：

- [端点清单](api-endpoints.md)
- [认证授权](api-auth.md)
- [错误码体系](api-errors.md)
- [版本策略](api-versions.md)
```

### 跨维度一致性校验

拆分后，跨维度一致性校验需要读取所有子文件：
- 读取 Split Manifest 获取子文件列表
- 逐个读取子文件内容
- 执行以下校验项（与 SKILL.md 阶段 3 一致，共 9 项）：
  1. api ↔ database 一致性（字段名、类型、约束对齐）
  2. ui-ux ↔ api 一致性（数据展示与响应字段对齐）
  3. overview 依赖关系完整性（跨维度依赖覆盖实际一致性约束）
  4. test-cases 覆盖完整性（覆盖所有必产出维度的关键场景）
  5. api 错误码 ↔ ui-ux 交互状态机映射一致性（映射表 api-error-to-ui-state-mapping 存在且非空）
  6. test-cases 用例 ↔ 维度契约元素覆盖追溯（映射表 test-case-to-contract-coverage 存在且非空，每条 P0/P1 用例至少有 1 条追溯记录）
  7. overview 跨维度映射表 ↔ 实际维度内容一致性（4 类映射表存在且与维度内容一致）
  8. 跨维度映射表完整性（4 类映射表必须存在且非空）
  9. 实施约束与 architecture/api 一致性（目录结构约定与模块边界表对齐、环境变量清单与认证授权流程对齐）
