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
- inline_sections:
  - overview
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
（记录关键设计决策和理由）

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
- total_lines: 2100
- threshold: 1500
- inline_sections:
  - overview
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
（记录关键设计决策和理由）

---

> 以下维度内容已拆分为独立子文件，请参阅 Split Manifest 中的文件列表。
> 子文件路径相对于本 design.md 所在目录。
```

---

## 拆分规则

### 触发条件

`design.md` 总行数超过 **1500 行** 时触发拆分。

### 拆分步骤

1. **统计各维度章节行数** - 从 design.md 中统计每个 `## 维度名` 章节的行数
2. **按行数从大到小排序** - 优先拆出行数最多的维度
3. **逐个拆出** - 将维度章节内容移动到独立子文件，design.md 中保留引用说明
4. **overview 始终内联** - 设计总览章节永远不拆出
5. **Split Manifest 更新** - 更新 design.md 中的 Split Manifest 章节，记录拆分状态

### 拆分停止条件

- design.md 剩余行数 ≤ 1500 行时停止拆分
- 或仅剩 overview 和 Split Manifest 时停止

### 示例

假设 design.md 有 2100 行，各维度行数：
- overview: 150 行（不拆）
- architecture: 380 行 → 拆出
- api: 520 行 → 拆出
- database: 350 行 → 拆出
- ui-ux: 420 行 → 拆出
- test-cases: 280 行 → 拆出
- security: 150 行 → 拆出
- observability: 0 行（未产出）
- non-functional: 0 行（未产出）

拆出 architecture + api + database + ui-ux + test-cases + security 后：
- design.md 剩余：150 (overview) + 50 (Split Manifest + 引用说明) = 200 行 ≤ 1500
- 拆分停止

---

## 子文件命名规则和 frontmatter 规范

### 子文件命名

- 文件名：`<维度名>.md`（如 `architecture.md`、`api.md`、`database.md`）
- 维度名使用 kebab-case（如 `ui-ux.md`、`test-cases.md`、`non-functional.md`）
- 文件位于 design.md 同级目录

### 子文件 frontmatter

每个拆分子文件包含 frontmatter：

```markdown
---
design_name: "user-auth"
design_version: "1.0"
section: "architecture"
parent: "design.md"
last_updated: "2026-06-24"
---

# 架构设计
（维度内容）
```

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
- 执行 api ↔ database、ui-ux ↔ api、overview 依赖关系完整性、test-cases 覆盖完整性校验
