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
- total_lines: 850
- threshold: 1800
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
- total_lines: 2500
- threshold: 1800
- inline_sections:
  - overview
  - implementation_constraints
  - cross_dimension_mapping
  - split_manifest
- split_files:
  - file: architecture.md
    section: architecture
    lines: 380
  - file: api.md
    section: api
    lines: 520
  - file: database.md
    section: database
    lines: 350
  - file: ui-ux.md
    section: ui-ux
    lines: 420
  - file: test-cases.md
    section: test-cases
    lines: 280
  - file: security.md
    section: security
    lines: 150

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
| api | api.md | split | 1.0 |
| database | database.md | split | 1.0 |
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

### 触发条件

`design.md` 总行数超过 **1800 行** 时触发拆分。

**阈值调整说明：** 原阈值为 1500 行。新增"实施约束"和"跨维度映射表"两个始终内联的章节后，design.md 基础行数有所增长，因此将阈值从 1500 调整为 1800，避免轻量级设计过早触发拆分。

### 拆分步骤

1. **统计各维度章节行数** - 从 design.md 中统计每个 `## 维度名` 章节的行数
2. **按行数从大到小排序** - 优先拆出行数最多的维度
3. **逐个拆出** - 将维度章节内容移动到独立子文件，design.md 中保留引用说明
4. **overview、实施约束、跨维度映射表始终内联** - 这三个章节永远不拆出
5. **Split Manifest 更新** - 更新 design.md 中的 Split Manifest 章节，记录拆分状态

### 拆分停止条件

- design.md 剩余行数 ≤ 1800 行时停止拆分
- 或仅剩 overview、实施约束、跨维度映射表和 Split Manifest 时停止

### 示例

假设 design.md 有 2500 行，各维度行数：
- overview: 150 行（不拆）
- implementation_constraints: 80 行（不拆，始终内联）
- cross_dimension_mapping: 60 行（不拆，始终内联）
- architecture: 380 行 → 拆出
- api: 520 行 → 拆出
- database: 350 行 → 拆出
- ui-ux: 420 行 → 拆出
- test-cases: 280 行 → 拆出
- security: 150 行 → 拆出
- observability: 0 行（未产出）
- non-functional: 0 行（未产出）

拆出 architecture + api + database + ui-ux + test-cases + security 后：
- design.md 剩余：150 (overview) + 80 (实施约束) + 60 (跨维度映射表) + 50 (Split Manifest + 引用说明) = 340 行 ≤ 1800
- 拆分停止

---

## 子文件命名规则和 frontmatter 规范

### 子文件命名

- 文件名：`<维度名>.md`（如 `architecture.md`、`api.md`、`database.md`）
- 维度名使用 kebab-case（如 `ui-ux.md`、`test-cases.md`、`non-functional.md`）
- 文件位于 design.md 同级目录

### 子文件 frontmatter

每个拆分子文件包含 frontmatter，其中 `contract_elements` 记录该子文件的 MVCE（最小可验证契约元素）清单，供 ae:review 的 auto 修复快速识别该子文件应有的契约元素：

```markdown
---
design_name: "user-auth"
design_version: "1.0"
section: "architecture"
parent: "design.md"
contract_elements: [module_boundary, dependency_direction, layering_rule, data_flow, tech_selection, error_propagation, cross_layer_sync, negative_space]
last_updated: "2026-06-24"
---

# 架构设计
（维度内容）
```

`contract_elements` 字段为可选；ae:review 遇到缺失时降级为手动检查。各维度的 contract_elements 取值参考 `references/design-dimensions.md` 中对应维度的"契约元素（MVCE）"章节。

**命名规则：** `contract_elements` 使用 snake_case 英文标识，从 MVCE 元素的中文名称按"动词+名词"或"名词组合"规则转换（如"模块边界表"→`module_boundary`、"错误传播链"→`error_propagation`）。命名应保持简洁、可读、可机器匹配。

### 子文件引用方式

design.md 中对拆分子文件的引用：

```markdown
---

## 架构设计

> 本维度内容已拆分至 `architecture.md`。

---

## 接口设计

> 本维度内容已拆分至 `api.md`。
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
