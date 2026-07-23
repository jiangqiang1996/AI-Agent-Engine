# 设计产物输出模板

## 核心原则：index + global + modules 三层结构

- 产物采用 L0 索引 + 全局共识 + 模块级设计三层结构
- `index.md` 自动生成，≤ 100 行，只含 frontmatter + 模块清单 + Split Manifest
- `global.md` 单文件，≤ 300 行，含全局设计共识（设计读数、架构、跨模块映射等）
- `modules/` 下按模块组织，每模块自适应粒度：小模块单文件（< 500 行），大模块拆分（≥ 500 行）
- 全程无中间大文件，避免 AI 上下文爆炸

> 注意：本模板描述的是产物组织方式，不是维度拆分规则。维度拆分规则见 SKILL.md 核心原则 8（生成时拆分，非生成后拆分）。无论文件大小，每个维度必须拆分为独立子文件这一旧规则已废弃，当前采用自适应粒度。

## 产物目录结构

设计契约产出在 `ae/designs/<topic>-YYYY-MM-DD/` 目录下：

```
ae/designs/
└── user-auth-2026-06-24/              # topic-日期
    ├── index.md                        # L0 索引（自动生成，≤ 100 行）
    ├── global.md                       # 全局设计共识（单文件，≤ 300 行）
    └── modules/
        ├── auth.md                     # 小模块：单文件（< 500 行）
        ├── resource/                   # 大模块：自适应拆分（≥ 500 行）
        │   ├── module.md               # API + Database
        │   ├── ui-ux.md                # UI/UX
        │   └── test-cases.md           # Test Cases
        └── audit.md                    # 小模块：单文件
```

### 自适应粒度规则

| 模块规模 | 产出形式 | 文件 |
|---------|---------|------|
| < 500 行 | 单文件 | `modules/<m>.md`（含 §API + §Database + §UI/UX + §Test Cases 全部章节） |
| ≥ 500 行 | 拆分 | `modules/<m>/module.md`（§API + §Database）+ `modules/<m>/ui-ux.md`（§UI/UX）+ `modules/<m>/test-cases.md`（§Test Cases） |

拆分阈值以模块总行数（API + Database + UI/UX + Test Cases）为准。拆分后 `module.md` 仍可超 500 行（含 API + Database），但不再进一步拆分——模块是设计最小内聚单元。

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
| auth | [modules/auth.md](modules/auth.md) | 320 | 认证模块（单文件） | EP-001~003, T-users |
| resource | [modules/resource/module.md](modules/resource/module.md) | 480 | 资源模块 API + Database | EP-004~006, T-resources |
| resource | [modules/resource/ui-ux.md](modules/resource/ui-ux.md) | 350 | 资源模块 UI/UX | PAGE-003~006 |
| resource | [modules/resource/test-cases.md](modules/resource/test-cases.md) | 400 | 资源模块测试用例 | TC-* |
| audit | [modules/audit.md](modules/audit.md) | 180 | 审计模块（单文件） | T-audit-log |

## Split Manifest

- split_files:
  - file: global.md
    lines: 280
  - file: modules/auth.md
    lines: 320
  - file: modules/resource/module.md
    lines: 480
  - file: modules/resource/ui-ux.md
    lines: 350
  - file: modules/resource/test-cases.md
    lines: 400
  - file: modules/audit.md
    lines: 180

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

## 全局非功能约束

（性能、安全、可观测性等跨模块约束，按需产出）

## 负向设计空间

- **禁止循环依赖**：模块间依赖必须形成 DAG
- **禁止跨模块直接访问数据层**：模块间只能通过接口调用，不得直接访问其他模块的数据库表
- **禁止 ADR 无理由**：每条 ADR 必须包含"理由"和"后果"字段
- **禁止稳定 ID 重用**：废弃的 ADR-XXX、EP-XXX、TC-XXX 等 ID 不得在新版本中重用
```

---

## 行数校验

- `index.md` ≤ 100 行（自动生成，豁免人工校验）
- `global.md` ≤ 300 行
- `modules/<m>.md`（单文件）< 500 行
- `modules/<m>/module.md` 无硬上限（含 API + Database，但建议 ≤ 500 行）
- `modules/<m>/ui-ux.md` ≤ 500 行
- `modules/<m>/test-cases.md` ≤ 500 行

每生成一个文件就校验一次，不通过打回重新生成该文件。

---

## frontmatter shards 职责

`index.md` frontmatter `shards` 列出所有设计文件（global.md + modules/ 下所有文件），作为 ae-doc-extract 的索引层入口。Split Manifest 列出全部文件及行数，作为完整文件清单。

### 子文件 frontmatter

```markdown
---
type: design-shard
status: active
section: "resource"
parent: "index.md"
module: "resource"
heading_chain: "设计契约 > 资源模块 > API + Database"
---
```

模块级章节片段（拆分后的 `module.md`/`ui-ux.md`/`test-cases.md`）的 `section` 为 `<模块名>-<章节>`，`heading_chain` 为 `设计契约 > <模块名> > <章节名>`。

---

## 跨模块引用机制

模块间引用通过稳定 ID（EP-XXX、T-XXX、ST-XXX、COMP-XXX、PAGE-XXX、TC-XXX）松耦合，不直接加载其他模块文件。跨模块映射收敛到 `global.md` §跨模块映射，只保留模块间关系。

校验时只读 `index.md` + `global.md`（合计 ≤ 400 行），不读模块文件，避免上下文膨胀。
