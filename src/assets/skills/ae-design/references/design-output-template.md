# 设计产物输出模板

## 核心原则：index + global + modules 三层结构

- 产物采用 L0 索引 + 全局共识 + 模块级设计三层结构
- `index.md` 自动生成，无行数限制，只含 frontmatter + 模块清单 + Split Manifest
- `global.md` 单文件，≤ 300 行，含全局设计共识（设计读数、架构、跨模块映射等）；超限禁止压缩，按数字顺序分片
- `modules/` 下按模块组织，每个模块位于 `modules/<NN>-<m>/` 子目录（`<NN>` 为零填充数字序号如 01、02、03），子目录名带数字固定顺序；含 `api.md` / `database.md` / `ui-ux.md` / `test-cases.md` 独立维度文件，每个 ≤ 500 行，超限按语义前缀 + 数字分片（如 `api-1.md`、`api-2.md`...）
- 全程无中间大文件，避免 AI 上下文爆炸

> 注意：本模板描述的是产物组织方式，不是维度拆分规则。维度拆分规则见 SKILL.md 核心原则 8（生成时拆分，非生成后拆分）。超限处理统一采用数字顺序分片，禁止压缩内容。

## 产物目录结构

设计契约产出在 `ae/designs/<topic>-YYYY-MM-DD/` 目录下：

```
ae/designs/
└── user-auth-2026-06-24/              # topic-日期
    ├── index.md                        # L0 索引（自动生成，无行数限制）
    ├── global.md                       # 全局设计共识（单文件，≤ 300 行）
    └── modules/
        ├── 01-auth/                    # 模块子目录（数字序号 + 模块名）
        │   ├── api.md                  # API 维度（≤ 500 行）
        │   ├── database.md             # Database 维度（≤ 500 行）
        │   ├── ui-ux.md                # UI/UX 维度（≤ 500 行）
        │   └── test-cases.md           # Test Cases 维度（≤ 500 行）
        ├── 02-resource/                # 模块子目录
        │   ├── api-1.md                # 大模块 API 分片第 1 片（≤ 500 行）
        │   ├── api-2.md                # 大模块 API 分片第 2 片（≤ 500 行）
        │   ├── database.md             # Database 维度（≤ 500 行）
        │   ├── ui-ux.md                # UI/UX 维度（≤ 500 行）
        │   └── test-cases.md           # Test Cases 维度（≤ 500 行）
        └── 03-audit/                   # 模块子目录
            ├── api.md                  # API 维度（≤ 500 行）
            └── test-cases.md           # Test Cases 维度（≤ 500 行）
```

### 数字分片规则

| 文件 | 行数上限 | 超限处理 |
|------|---------|---------|
| global.md | ≤ 300 行 | 禁止压缩，按数字顺序分片为 `global-1.md`、`global-2.md`、...，每片 ≤ 300 行 |
| modules/<NN>-<m>/api.md | ≤ 500 行 | 禁止压缩，按语义前缀 + 数字顺序分片为 `modules/<NN>-<m>/api-1.md`、`api-2.md`、...，每片 ≤ 500 行 |
| modules/<NN>-<m>/database.md | ≤ 500 行 | 禁止压缩，按语义前缀 + 数字顺序分片为 `modules/<NN>-<m>/database-1.md`、`database-2.md`、...，每片 ≤ 500 行 |
| modules/<NN>-<m>/ui-ux.md | ≤ 500 行 | 禁止压缩，按语义前缀 + 数字顺序分片为 `modules/<NN>-<m>/ui-ux-1.md`、`ui-ux-2.md`、...，每片 ≤ 500 行 |
| modules/<NN>-<m>/test-cases.md | ≤ 500 行 | 禁止压缩，按语义前缀 + 数字顺序分片为 `modules/<NN>-<m>/test-cases-1.md`、`test-cases-2.md`、...，每片 ≤ 500 行 |

模块子目录名格式：`<NN>-<module-name>`，`<NN>` 为零填充两位数字序号（01、02、03、...），按 architecture 章节中模块划分顺序编号。分片在 `##` 章节边界切分，保持片内语义完整。分片文件名数字固定顺序，`index.md` 记录所有分片文件清单。

### "需求描述名"来源规则（D12）

- prd 文档作为输入时：从 prd 目录名提取（如 `ae/prds/user-auth-2026-06-24/prd.md` → `user-auth`）
- design 作为输入时：从 design 目录名提取（如 `ae/designs/user-auth-2026-06-20/` → `user-auth`）
- 裸描述作为输入时：从用户描述提取关键词转为 kebab-case（如"用户认证系统" → `user-auth`）
- 含特殊字符时强制 kebab-case 转换

### 版本演化

同一"需求描述名"的多个日期目录共存，旧版本 index.md 的 frontmatter 中 `supersededBy` 指向新版本目录。

---

## index.md 模板

```markdown
---
type: design
status: active
date: "2026-06-24"
title: "用户认证系统"
topic: "user-auth"
version: "1.0"
last_updated: "2026-06-24"
---
# 设计契约：用户认证系统

## 模块清单

| 模块 | 文件 | 行数 | 摘要 | 稳定 ID |
|------|------|------|------|---------|
| global | [global.md](global.md) | 280 | 设计读数、全局架构、跨模块映射 | ADR-001~003 |
| auth | [modules/01-auth/api.md](modules/01-auth/api.md) | 180 | 认证模块 API | EP-001~003 |
| auth | [modules/01-auth/database.md](modules/01-auth/database.md) | 90 | 认证模块数据库 | T-users |
| auth | [modules/01-auth/ui-ux.md](modules/01-auth/ui-ux.md) | 50 | 认证模块 UI/UX | — |
| auth | [modules/01-auth/test-cases.md](modules/01-auth/test-cases.md) | 100 | 认证模块测试用例 | TC-* |
| resource | [modules/02-resource/api-1.md](modules/02-resource/api-1.md) | 480 | 资源模块 API 第 1 片 | EP-004~006 |
| resource | [modules/02-resource/api-2.md](modules/02-resource/api-2.md) | 200 | 资源模块 API 第 2 片 | EP-007~008 |
| resource | [modules/02-resource/database.md](modules/02-resource/database.md) | 150 | 资源模块数据库 | T-resources |
| resource | [modules/02-resource/ui-ux.md](modules/02-resource/ui-ux.md) | 350 | 资源模块 UI/UX | PAGE-003~006 |
| resource | [modules/02-resource/test-cases.md](modules/02-resource/test-cases.md) | 120 | 资源模块测试用例 | TC-* |
| audit | [modules/03-audit/api.md](modules/03-audit/api.md) | 80 | 审计模块 API | — |
| audit | [modules/03-audit/test-cases.md](modules/03-audit/test-cases.md) | 100 | 审计模块测试用例 | T-audit-log |

## Split Manifest

- split_files:
  - file: global.md
    lines: 280
  - file: modules/01-auth/api.md
    lines: 180
  - file: modules/01-auth/database.md
    lines: 90
  - file: modules/01-auth/ui-ux.md
    lines: 50
  - file: modules/01-auth/test-cases.md
    lines: 100
  - file: modules/02-resource/api-1.md
    lines: 480
  - file: modules/02-resource/api-2.md
    lines: 200
  - file: modules/02-resource/database.md
    lines: 150
  - file: modules/02-resource/ui-ux.md
    lines: 350
  - file: modules/02-resource/test-cases.md
    lines: 120
  - file: modules/03-audit/api.md
    lines: 80
  - file: modules/03-audit/test-cases.md
    lines: 100

> index.md 为自动生成的纯索引，不含设计内容。设计内容分布在 global.md 和 modules/ 下。
```

---

## global.md 模板

```markdown
---
type: design-shard
status: active
section: "global"
parent: "index.md"
module: "global"
heading_chain: "设计契约 > 全局设计共识"
---
# 全局设计共识

## 设计读数

（一句话声明设计意图和美学家族）

## 契约版本

- 版本号：1.0（初始）或递增
- 前序版本：无（初始）或前序版本号
- 变更摘要：本次变更概述

## 跨模块一致性约束

（声明模块间必须遵守的一致性约束）

| 约束 | 涉及模块 | 约束内容 | 验证方式 |
|------|---------|---------|---------|
| 认证传递 | auth, resource | resource 模块所有端点必须校验 auth 模块签发的 token | 集成测试 TC-INT-002 |
| 审计写入 | auth, resource, audit | 所有写操作必须同步写入 audit 模块的审计日志 | 集成测试 TC-INT-AUDIT-* |

## 系统架构

（详见 architecture-template.md）

### 技术选型

| 决策点 | 选项 | 选择 | 理由 |
|--------|------|------|------|
| 前端框架 | React/Vue/Svelte | React 19 | 生态成熟、团队熟悉 |
| 后端框架 | Express/Fastify/NestJS | Fastify | 高性能、TypeScript 原生支持 |
| 数据层 | PostgreSQL/MySQL | PostgreSQL | 支持 JSONB、全文搜索 |
| 基础设施 | Docker/K8s | Docker Compose | 单机部署满足当前规模 |

### ADR 真源

#### ADR-001: [决策标题]
- **状态：** 已采纳
- **背景：** [决策背景]
- **决策：** [具体决策]
- **理由：** [选择理由]
- **后果：** [预期后果]

### 系统上下文图

（Mermaid graph 绘制系统与外部系统边界）

### 模块清单与边界

| 模块 | 职责 | 对外接口 | 依赖模块 |
|------|------|---------|---------|
| auth | 认证授权 | login, verifyToken | — |
| resource | 资源管理 | CRUD /resources | auth |
| audit | 审计日志 | writeLog | — |

### 跨模块依赖关系图

（Mermaid graph 绘制模块间依赖，必须为 DAG）

### 全局数据流

（Mermaid flowchart 或 sequenceDiagram 绘制跨模块数据流）

## 安全

（详见 security-template.md）

## 可观测性

（详见 observability-template.md）

## 跨模块映射

（详见 cross-dimension-mapping.md §跨模块映射）

### 模块间接口映射

| 源模块 | 目标模块 | 接口 | 调用方向 |
|--------|---------|------|---------|
| resource | auth | verifyToken(token) | resource → auth |

### 模块间数据一致性

| 一致性约束 | 涉及模块 | 机制 |
|-----------|---------|------|
| 用户删除后资源级联 | auth, resource | ON DELETE CASCADE |
| 所有写操作审计 | auth, resource, audit | 同步写入 audit_log |

## 非功能

（详见 non-functional-template.md）

（性能、并发、缓存等跨模块约束，按需产出）

## 负向设计空间

- **禁止循环依赖**：模块间依赖必须形成 DAG
- **禁止跨模块直接访问数据层**：模块间只能通过接口调用，不得直接访问其他模块的数据库表
- **禁止 ADR 无理由**：每条 ADR 必须包含"理由"和"后果"字段
- **禁止稳定 ID 重用**：废弃的 ADR-XXX、EP-XXX、TC-XXX 等 ID 不得在新版本中重用
```

---

## 行数校验

- `index.md` 无行数限制
- `global.md` ≤ 300 行；超限禁止压缩，按数字顺序分片为 `global-1.md`、`global-2.md`、...，每片 ≤ 300 行
- `modules/<NN>-<m>/api.md` ≤ 500 行；超限禁止压缩，按语义前缀 + 数字顺序分片为 `modules/<NN>-<m>/api-1.md`、`api-2.md`、...，每片 ≤ 500 行
- `modules/<NN>-<m>/database.md` ≤ 500 行；超限禁止压缩，按语义前缀 + 数字顺序分片为 `modules/<NN>-<m>/database-1.md`、`database-2.md`、...，每片 ≤ 500 行
- `modules/<NN>-<m>/ui-ux.md` ≤ 500 行；超限禁止压缩，按语义前缀 + 数字顺序分片为 `modules/<NN>-<m>/ui-ux-1.md`、`ui-ux-2.md`、...，每片 ≤ 500 行
- `modules/<NN>-<m>/test-cases.md` ≤ 500 行；超限禁止压缩，按语义前缀 + 数字顺序分片为 `modules/<NN>-<m>/test-cases-1.md`、`test-cases-2.md`、...，每片 ≤ 500 行

分片在 `##` 章节边界切分，保持片内语义完整。分片文件名数字固定顺序。每生成一个文件就校验一次，不通过则分片，禁止压缩内容。

---

## frontmatter shards 职责

`index.md` frontmatter `shards` 列出所有设计文件（global.md + modules/ 下所有文件），作为 ae-doc-extract 的索引层入口。Split Manifest 列出全部文件及行数，作为完整文件清单。

### 子文件 frontmatter

```markdown
---
type: design-shard
status: active
section: "resource-api"
parent: "index.md"
module: "resource"
heading_chain: "设计契约 > 资源模块 > API"
---
```

模块级维度文件（`modules/<NN>-<m>/api.md`/`database.md`/`ui-ux.md`/`test-cases.md`）的 `section` 为 `<模块名>-<维度名>`，`heading_chain` 为 `设计契约 > <模块名> > <维度名>`。模块级分片文件（如 `modules/<NN>-<m>/api-1.md`/`api-2.md`/...）的 `section` 为 `<模块名>-api-<片号>`，`heading_chain` 为 `设计契约 > <模块名> > API > 第 <片号> 片`。

---

## 跨模块引用机制

模块间引用通过稳定 ID（EP-XXX、T-XXX、ST-XXX、COMP-XXX、PAGE-XXX、TC-XXX）松耦合，不直接加载其他模块文件。跨模块映射收敛到 `global.md` §跨模块映射，只保留模块间关系。

校验时只读 `index.md` + `global.md`，不读模块文件，避免上下文膨胀。
