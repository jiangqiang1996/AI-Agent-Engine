# 设计产物输出模板

## 产物目录结构

设计契约产出在 `ae/designs/<需求描述名>-YYYY-MM-DD/` 目录下，每个维度的文件放在以维度名命名的子目录中：

```
ae/designs/
└── user-auth-2026-06-24/              # 需求描述名-日期
    ├── design.md                       # 元文件（含 frontmatter + overview + Split Manifest + 实施约束 + 跨维度映射表）
    ├── architecture/                   # 架构维度子目录
    │   ├── architecture.md             # 引用清单（sub_split: true/false）
    │   ├── architecture-module-boundary.md # 二级子文件（### 章节内容）
    │   └── architecture-tech-selection.md  # 二级子文件
    ├── api/                            # 接口维度子目录
    │   ├── api.md                      # 引用清单
    │   ├── api-endpoints.md            # 二级子文件
    │   ├── api-auth.md                 # 二级子文件
    │   ├── api-errors.md               # 二级子文件
    │   └── api-versions.md             # 二级子文件
    ├── database/                       # 数据库维度子目录
    │   ├── database.md                 # 引用清单（sub_split: true）
    │   ├── database-tables.md          # 二级子文件
    │   └── database-migrations.md      # 二级子文件
    ├── ui-ux/                          # UI/UX 维度子目录
    │   └── ui-ux.md                    # 引用清单（合并后 sub_split: false）
    ├── test-cases/                     # 测试用例维度子目录
    │   └── test-cases.md               # 引用清单（合并后 sub_split: false）
    ├── security/                       # 安全维度子目录
    │   └── security.md                 # 引用清单（合并后 sub_split: false）
    ├── observability/                  # 可观测性维度子目录
    │   └── observability.md            # 引用清单（合并后 sub_split: false）
    └── non-functional/                 # 非功能维度子目录
        └── non-functional.md           # 引用清单（合并后 sub_split: false）
```

**子目录组织规则：** 每个维度的文件放在以维度名命名的子目录中。`design.md` 始终在设计目录根下。维度一级文件（引用清单）和二级子文件均位于对应维度的子目录中。`design-spec` 为透传维度，不产出文件，不创建子目录。

**强制拆分规则：** 无论文件大小，每个维度必须拆分为独立子文件，不在 design.md 中内联维度内容。子代理直接按 `###` 章节产出二级子文件和引用清单。overview、实施约束和跨维度映射表始终内联在 design.md 中。

**"需求描述名"来源规则（D12）：**
- prd 文档作为输入时：从 prd 文件名提取（如 `user-auth-prd.md` → `user-auth`）
- 旧 design 作为输入时：从旧 design 目录名提取（如 `ae/designs/user-auth-2026-06-20/` → `user-auth`）
- 裸描述作为输入时：从用户描述提取关键词转为 kebab-case（如"用户认证系统" → `user-auth`）
- 含特殊字符时强制 kebab-case 转换

**版本演化：** 同一"需求描述名"的多个日期目录共存，新目录的 frontmatter 中 `supersedes` 指向前序版本目录。

---

## design.md 元文件模板

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

- split_files:
  - file: architecture/architecture.md
    lines: 280
    sub_split: false
  - file: api/api.md
    lines: 50
    sub_split: true
  - file: database/database.md
    lines: 30
    sub_split: true
  - file: ui-ux/ui-ux.md
    lines: 280
    sub_split: false
  - file: test-cases/test-cases.md
    lines: 280
    sub_split: false
  - file: security/security.md
    lines: 150
    sub_split: false
  - file: observability/observability.md
    lines: 120
    sub_split: false
  - file: non-functional/non-functional.md
    lines: 100
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
| overview | design.md（内联） | inline | 1.0 |
| architecture | architecture/architecture.md | split | 1.0 |
| api | api/api.md（引用清单） | split | 1.0 |
| api-endpoints | api/api-endpoints.md | sub-split | 1.0 |
| api-auth | api/api-auth.md | sub-split | 1.0 |
| api-errors | api/api-errors.md | sub-split | 1.0 |
| api-versions | api/api-versions.md | sub-split | 1.0 |
| database | database/database.md（引用清单） | split | 1.0 |
| database-tables | database/database-tables.md | sub-split | 1.0 |
| database-migrations | database/database-migrations.md | sub-split | 1.0 |
| ui-ux | ui-ux/ui-ux.md | split | 1.0 |
| test-cases | test-cases/test-cases.md | split | 1.0 |
| security | security/security.md | split | 1.0 |
| observability | observability/observability.md | split | 1.0 |
| non-functional | non-functional/non-functional.md | split | 1.0 |

### 契约版本
- 版本号：1.0
- 前序版本：无
- 变更摘要：初始设计

### 跨维度依赖关系
（记录维度间的一致性约束）

### 设计决策记录（ADR）
（记录关键设计决策和理由，使用稳定 ID ADR-XXX，从 ae:grill 追问结果提炼）

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

### 一级拆分（强制）

#### 触发条件

**无论 design.md 总行数大小，所有维度必须拆分为独立子文件。** design.md 自身豁免 300 行校验，作为导航索引文件，只保留 overview、实施约束、跨维度映射表和 Split Manifest。

#### 拆分步骤

1. **产出 overview 和跨维度映射表骨架** - 主代理产出 overview、实施约束和跨维度映射表骨架，内联在 design.md 中
2. **调度维度子代理** - 按产出顺序逐个调度维度专精子代理，子代理直接按 `###` 章节产出二级子文件和引用清单
3. **Split Manifest 更新** - 记录每个维度文件的 file、lines、sub_split 状态

#### 始终内联的章节

以下章节永远不拆出，始终内联在 design.md 中：
- overview（设计总览）
- implementation_constraints（实施约束）
- cross_dimension_mapping（跨维度映射表）
- Split Manifest

### 二级拆分

#### 产出方式

子代理直接按 `###` 章节产出二级子文件，不产出完整维度文件。每个 `###` 章节对应一个二级子文件。

#### 二级子文件命名

- 文件名：`<维度名>-<章节名>.md`（如 `api-endpoints.md`、`api-auth.md`、`api-errors.md`）
- 维度名和章节名均使用 kebab-case
- 文件位于对应维度的子目录中（如 `api/api-endpoints.md`）
- 章节名取自 `###` 标题的 kebab-case 形式（如 `### 端点清单` → `endpoints`、`### 认证授权` → `auth`）

#### 拆分停止条件

- 已拆分到 `###` 章节级的文件不再继续拆分，其行数不参与校验
- 即使某个 `###` 章节内容本身超过 300 行，也不继续拆分

### 校验与合并机制

使用 ae:design 技能目录下的 `scripts/pipeline-design-shards.mjs` 完成校验和合并：

- **校验**：一级拆分文件（`<维度名>.md`）行数 ≤ 300 行，design.md 和二级子文件豁免
- **合并**：二级子文件合并后 ≤ 300 行 → 合并回父文件；> 300 行 → 保持拆分
- **用法**：`node <ae-design技能目录>/scripts/pipeline-design-shards.mjs <design目录路径> [--threshold N]`

### 示例

假设各维度子代理产出二级子文件：
- overview: 150 行（始终内联，不拆出）
- implementation_constraints: 80 行（始终内联，不拆出）
- cross_dimension_mapping: 60 行（始终内联，不拆出）
- architecture: 子代理产出 2 个二级子文件
  - architecture/architecture-module-boundary.md: 150 行
  - architecture/architecture-tech-selection.md: 130 行
  - architecture/architecture.md（引用清单）: 12 行
- api: 子代理产出 4 个二级子文件
  - api/api-endpoints.md: 180 行
  - api/api-auth.md: 120 行
  - api/api-errors.md: 90 行
  - api/api-versions.md: 60 行
  - api/api.md（引用清单）: 50 行
- database: 子代理产出 2 个二级子文件
  - database/database-tables.md: 200 行
  - database/database-migrations.md: 100 行
  - database/database.md（引用清单）: 30 行
- ui-ux: 子代理产出 1 个二级子文件
  - ui-ux/ui-ux.md（引用清单）: 280 行（仅 1 个章节，引用清单即完整内容）
- test-cases: 子代理产出 1 个二级子文件
  - test-cases/test-cases.md（引用清单）: 280 行
- security: 子代理产出 1 个二级子文件
  - security/security.md（引用清单）: 150 行

流水线脚本执行后：
1. 校验：所有引用清单文件 ≤ 300 行，通过
2. 合并：architecture（合并后 280 行 ≤ 300）→ 合并回 architecture/architecture.md；api（合并后 450 行 > 300）→ 保持拆分；database（合并后 280 行 ≤ 300）→ 合并回 database/database.md
3. 最终校验：architecture/architecture.md (280)、api/api.md (50, 引用清单)、database/database.md (280)、ui-ux/ui-ux.md (280)、test-cases/test-cases.md (280)、security/security.md (150)，全部 ≤ 300，通过

---

## 子文件命名规则和 frontmatter 规范

### 一级子文件命名

- 文件名：`<维度名>.md`（如 `architecture.md`、`api.md`、`database.md`）
- 维度名使用 kebab-case（如 `ui-ux.md`、`test-cases.md`、`non-functional.md`）
- 文件位于以维度名命名的子目录中（如 `architecture/architecture.md`、`api/api.md`）

### 二级子文件命名

- 文件名：`<维度名>-<章节名>.md`（如 `api-endpoints.md`、`api-auth.md`、`database-tables.md`）
- 章节名取自 `###` 标题的 kebab-case 形式
- 文件位于对应维度的子目录中（如 `api/api-endpoints.md`、`database/database-tables.md`）
- 二级子文件跳过行数校验

### 一级子文件 frontmatter

每个拆分子文件包含 frontmatter，使用 `section`、`parent`、`sub_split` 三个字段：

```markdown
---
section: "architecture"
parent: "design.md"
sub_split: false
---

# 架构设计
（维度内容）
```

### 二级子文件 frontmatter

二级子文件包含 `section` 字段标识所属章节，`parent` 指向维度文件：

```markdown
---
section: "api-endpoints"
parent: "api.md"
---

# 接口设计 - 端点清单
（章节内容）
```

各维度的契约元素（MVCE）清单由 `ae:review` 遇到缺失时降级为手动检查，不再在 frontmatter 中声明。

### 子文件引用方式

design.md 中对一级拆分子文件的引用：

```markdown
---

## 架构设计

> 本维度内容已拆分至 `architecture/architecture.md`。

---

## 接口设计

> 本维度内容已拆分至 `api/api.md`，其中部分章节已二级拆分，详见 Split Manifest。
```

### 二级拆分后维度文件的引用方式

维度子文件二级拆分后，原 `<维度名>/<维度名>.md` 变为引用清单：

```markdown
---
section: "api"
parent: "design.md"
sub_split: true
---

# 接口设计

> 本维度已按章节二级拆分，内容分布在以下子文件中：

- [端点清单](api-endpoints.md)
- [认证授权](api-auth.md)
- [错误码体系](api-errors.md)
- [版本策略](api-versions.md)
```

> 引用清单中的子文件链接使用相对路径（相对于引用清单所在子目录），如 `api/api.md` 中的链接指向同目录下的 `api-endpoints.md`。

### 跨维度一致性校验

拆分后，跨维度一致性校验需要读取所有子文件：
- 读取 Split Manifest 获取子文件列表
- 逐个读取子文件内容
- 执行以下校验项（与 SKILL.md 阶段 5 一致，以 SKILL.md 为准）：
  1. api ↔ database 一致性（字段名、类型、约束对齐）
  2. ui-ux ↔ api 一致性（数据展示与响应字段对齐）
  3. overview 依赖关系完整性（跨维度依赖覆盖实际一致性约束）
  4. test-cases 覆盖完整性（覆盖所有必产出维度的关键场景）
  5. api 错误码 ↔ ui-ux 交互状态机映射一致性（映射表 api-error-to-ui-state-mapping 存在且非空）
  6. test-cases 用例 ↔ 维度契约元素覆盖追溯（映射表 test-case-to-contract-coverage 存在且非空，每条 P0/P1 用例至少有 1 条追溯记录）
  7. overview 跨维度映射表 ↔ 实际维度内容一致性（4 类映射表存在且与维度内容一致）
  8. 跨维度映射表完整性（4 类映射表必须存在且非空）
  9. 实施约束与 architecture/api 一致性（目录结构约定与模块边界表对齐、环境变量清单与认证授权流程对齐）
  10. architecture ↔ api（模块边界与接口分组一致）
  11. security ↔ database（数据分级与敏感字段标注对齐）
  12. observability ↔ architecture（指标体系覆盖关键数据流）
  13. non-functional ↔ architecture（性能目标与技术选型可行）
  14. design-spec ↔ ui-ux（ui-ux 契约中的设计读数、三旋钮取值和负向设计空间与 design-spec 产出的设计决策包一致）
