---
type: plan
status: drafted
date: 2026-05-09
title: file-graph-tools
origin: docs/ae/brainstorms/2026-05-09-file-graph-tools.md
originFingerprint: 2026-05-09-file-graph-tools
depth: standard
---

# 文件关系图谱工具

## AI 解析契约
- canonicalKind: plan
- humanEquivalent: true
- stableIdsRequired: true
- implementationUnitsRequired: true
- noImplicitScope: true

## 来源与目标

来源：`docs/ae/brainstorms/2026-05-09-file-graph-tools.md`（24 条功能需求、3 条非功能需求、5 条关键决策）。

目标：在 AE 插件中新增文件关系图谱能力——一个构建/维护工具和一个查询工具，支持项目分析和重构迁移场景。

非目标：符号级关系解析、运行时动态依赖分析、可视化图形输出。

## 范围

### 包含
- 两个 opencode 自定义工具：`ae-graph-build`（构建/增量维护）、`ae-graph-query`（查询/健康检查）
- 对应两个技能注册（命令由 `command-registration.ts` 自动从技能条目生成，无需单独命令文件）
- SQLite 持久化（`.ae/graph.db`）
- 配置读写（`.opencode/ae.jsonc` 的 `graph.exclude` 字段）
- 并发安全：WAL 模式 + 版本化快照 + 写锁
- 多语言浅层解析（正则匹配 import/require/include/Markdown 链接/AE 资产引用）
- Git diff 增量更新；非 Git 项目降级全量解析

### 不包含
- 深层 AST 解析（首版不做，控制复杂度；后续可扩展）
- 符号级关系（函数调用链、类继承图）
- 可视化图形输出
- 远程数据库或网络存储

### 约束
- 使用 opencode 自定义工具实现，不引入外部 CLI 依赖
- 运行时不得依赖源码仓库布局，支持"仅桥接文件 + dist"场景
- 工具层错误返回中文可恢复提示，不抛未捕获异常
- 依赖方向：`tools/ → services/ → schemas/ → utils/`

## 需求追溯

| 需求 ID | 计划响应 |
|---------|----------|
| R1 | U3 解析服务 — import/require/include 正则解析 |
| R2 | U3 解析服务 — Markdown 链接解析 |
| R3 | U3 解析服务 — AE 资产引用 `ae:xxx` 解析 |
| R4 | U3 解析服务 — 目录结构关系 |
| R5 | 首版仅浅层正则；深层 AST（re-export、类型引用）推迟到后续版本，首版 `depth` 参数仅接受 `shallow` |
| R6 | U2 存储服务 — files/relations 表 |
| R7 | U2 存储服务 — `.ae/graph.db` |
| R8 | U4 构建工具 — Git diff 增量 / 全量降级 |
| R9 | U1 配置服务 — `graph.exclude` in `.opencode/ae.jsonc` |
| R10 | U4 构建工具 — 运行时检测常见排除目录并 `ctx.ask()` |
| R11 | U1 配置服务 — 确认后自动写入 ae.jsonc |
| R12 | U5 查询工具 — `mode=deps` |
| R13 | U5 查询工具 — `mode=impact` |
| R14 | U5 查询工具 — `mode=health` |
| R15 | U2 存储服务 — WAL + 事务回滚 + 中断恢复 |
| R16 | U4 构建工具 — 幂等增量解析 |
| R17 | U2 存储服务 — 版本化快照读取 |
| R18 | U5 查询工具 — `mode=filter` |
| R19 | U5 查询工具 — `mode=path` |
| R20 | U5 查询工具 — `mode=core` |
| R21 | U5 查询工具 — `mode=stats` |
| R22 | U5 查询工具 — `mode=pattern` |
| R23 | U2 存储服务 — 多会话并发：WAL + busy timeout + 写锁 |
| R24 | U4/U5 工具层 — 路径边界校验 |

**非功能需求追溯：**

| NFR | 计划响应 |
|-----|----------|
| NFR1 | U4 构建工具 — 性能测试：固定 1000 文件 fixture，记录耗时，验证 ≤30 秒 |
| NFR2 | U2 存储服务 — 测试：1000 文件 fixture 的 `.ae/graph.db` 文件大小 ≤10MB |
| NFR3 | 全量测试 — `npm run test` + `npm run build` 在 Windows/macOS/Linux CI 通过；路径处理使用 `toPosixPath()` |

## 高层技术设计

```
┌─────────────────────────────────────────────────────────────┐
│                      opencode 会话                           │
│                                                              │
│  用户 → /ae-graph-build ──→ ae-graph-build 工具              │
│                        │                                     │
│                        ▼                                     │
│              graph-config-service                            │
│              graph-parse-service                             │
│              graph-storage-service                           │
│                        │                                     │
│                        ▼                                     │
│                   .ae/graph.db (SQLite WAL)                  │
│                                                              │
│  用户 → /ae-graph-query ──→ ae-graph-query 工具              │
│                        │                                     │
│                        ▼                                     │
│              graph-storage-service (只读 active version)      │
└─────────────────────────────────────────────────────────────┘
```

### 数据流

**构建流程（全量模式）：**
1. 校验路径边界（R24）
2. 读取 `graph.exclude` 配置（R9）
3. 清理 incomplete versions
4. 扫描项目文件，遇到未配置的常见排除目录时 `ctx.ask()`（R10/R11）
5. 解析所有文件关系（R1-R4）
6. 创建新 version，批量写入 files 和 relations
7. 原子标记新 version 为 active（旧 active 置 0）
8. 返回摘要

**构建流程（增量模式）：**
1. 校验路径边界（R24）
2. 读取 `graph.exclude` 配置（R9）
3. 清理 incomplete versions
4. 获取 Git diff 变更文件列表（`git diff --name-status HEAD`）（R8）
5. 将旧 active version 的全部数据复制到新 version（保证完整性）
6. 删除新 version 中变更文件相关的 files 和 relations
7. 仅重新解析变更文件，插入新数据（R16 幂等）
8. 原子标记新 version 为 active
9. 返回摘要
10. 非 Git 项目：降级全量模式并在返回中提示

**查询流程：**
1. 校验路径边界
2. 打开数据库只读连接
3. 读取 active version 的图谱数据
4. 执行查询算法
5. 返回结构化结果

### 关键决策
- D1. 使用 SQLite（`better-sqlite3`）WAL 模式 → 理由: 持久化、并发安全、WAL 支持读写不阻塞
- D2. 版本化快照：每次构建写入新 version，查询只读 active version → 理由: 满足 R17/R23，查询不读半成品
- D2b. 增量构建时先复制旧 active version 到新 version，再替换变更文件相关数据 → 理由: 保证新 version 始终是完整图谱，查询不会丢失未变更部分
- D3. 配置存储在 `.opencode/ae.jsonc` 的 `graph` 字段 → 理由: 沿用现有 AE 项目级配置体系（`builtin-opencode-config-service.ts:257`）
- D4. 首版仅浅层正则解析 → 理由: 控制复杂度，避免引入 ts-morph/tree-sitter 等重依赖
- D5. 非相对路径 import 记录为 `external` 关系类型，不参与文件级影响范围 → 理由: package import 无法映射到工作区内文件
- D6. 首版引入 `better-sqlite3` → 理由: 同步 API、原生 WAL 支持、事务管理成熟；若安装/编译失败则暂停整个功能

## 专项设计

### 数据库设计

**数据库文件：** `<worktree>/.ae/graph.db`

**表结构：**

```sql
-- 图谱版本表
CREATE TABLE graph_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_root TEXT NOT NULL,
  scope_root TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 0,
  file_count INTEGER NOT NULL DEFAULT 0,
  relation_count INTEGER NOT NULL DEFAULT 0,
  exclude_rules TEXT,  -- JSON: 本次构建使用的排除规则快照
  git_ref TEXT,        -- 本次增量基于的 Git ref
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(workspace_root, scope_root, id)
);

-- 文件节点表
CREATE TABLE files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  version_id INTEGER NOT NULL REFERENCES graph_versions(id),
  relative_path TEXT NOT NULL,
  file_type TEXT NOT NULL,       -- 'source' | 'document' | 'config' | 'directory' | 'asset'
  language TEXT,                 -- 'typescript' | 'python' | 'markdown' | null
  size_bytes INTEGER,
  UNIQUE(version_id, relative_path)
);

-- 关系边表
CREATE TABLE relations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  version_id INTEGER NOT NULL REFERENCES graph_versions(id),
  source_path TEXT NOT NULL,
  target_path TEXT NOT NULL,
  relation_type TEXT NOT NULL,   -- 'import' | 'require' | 'include' | 'link' | 'ae_ref' | 'directory' | 'external'
  metadata TEXT,                 -- JSON: 行号、原始引用文本等
  UNIQUE(version_id, source_path, target_path, relation_type)
);

-- 索引
CREATE INDEX idx_files_version ON files(version_id);
CREATE INDEX idx_files_path ON files(version_id, relative_path);
CREATE INDEX idx_relations_version ON relations(version_id);
CREATE INDEX idx_relations_source ON relations(version_id, source_path);
CREATE INDEX idx_relations_target ON relations(version_id, target_path);
CREATE INDEX idx_graph_versions_active ON graph_versions(workspace_root, scope_root, is_active);

-- 唯一部分索引：确保同一 (workspace_root, scope_root) 只有一个 active version
CREATE UNIQUE INDEX uq_graph_versions_active ON graph_versions(workspace_root, scope_root)
WHERE is_active = 1;
```

**版本生命周期：**
1. 创建新 `graph_versions` 记录，`is_active=0`
2. 写入 files 和 relations
3. 更新 `file_count` / `relation_count`
4. 原子 `UPDATE graph_versions SET is_active=1 WHERE id=?`，同时将旧 active version 的 `is_active` 置 0
5. 查询始终 `WHERE is_active=1`

**并发策略：**
- `PRAGMA journal_mode=WAL` — 允许读写并发
- `PRAGMA busy_timeout=10000` — 写锁等待 10 秒
- 写操作使用 `BEGIN IMMEDIATE` 事务
- 两个构建并发时：先到的获取写锁，后到的等待 busy timeout；等待期间轮询 active version 是否已更新
- 等待逻辑：最多重试 3 次（每次等待 busy_timeout），每次重试前检查是否有新 active version 出现；若检测到新 active version，说明前一个构建已完成，当前构建可基于新数据继续或直接返回"图谱已是最新"
- 全部重试超时后返回中文提示："已有构建进行中且未在预期时间内完成，请稍后重试"

**中断恢复：**
- 写入中途进程终止 → 旧 active version 不受影响
- 重新执行时：检查 `is_active=0` 且 `created_at` 超过 10 分钟的 incomplete version → 删除清理
- 然后正常创建新 version

### 接口设计

**ae-graph-build 工具参数：**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `target` | string | 否 | 当前 worktree | 目标目录，必须在 worktree 内 |
| `mode` | enum | 否 | `auto` | `full`=全量、`incremental`=Git diff 增量、`auto`=有 Git 用增量否则全量 |
| `depth` | enum | 否 | `shallow` | `shallow`=正则匹配（首版唯一支持值） |

**ae-graph-query 工具参数：**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `mode` | enum | 是 | — | 查询模式 |
| `file` | string | 否 | — | 目标文件路径（deps/impact/path 模式使用） |
| `target` | string | 否 | — | 目标文件路径（path 模式使用） |
| `relation_type` | string | 否 | — | 关系类型筛选（filter 模式） |
| `file_type` | string | 否 | — | 文件类型筛选（filter 模式）：`source`/`document`/`config`/`directory`/`asset` |
| `directory` | string | 否 | — | 目录路径筛选（filter 模式） |
| `limit` | number | 否 | 50 | 结果数量上限 |
| `top` | number | 否 | 10 | Top N（core 模式使用） |
| `pattern_type` | string | 否 | `all` | pattern 模式：`cycle`=循环链、`long`=长链、`all`=全部 |

**查询模式说明：**

| mode | 功能 | 必填参数 | 输出 |
|------|------|----------|------|
| `deps` | 文件依赖和被依赖 | `file` | 直接依赖列表 + 反向依赖列表 |
| `impact` | 影响范围分析 | `file` | 完整影响链（直接 + 间接） |
| `health` | 健康检查 | 无 | 循环依赖链 + 孤立文件列表 |
| `filter` | 条件筛选 | `relation_type` 或 `file_type` 或 `directory` | 匹配的文件/关系列表 |
| `path` | 最短依赖路径 | `file` + `target` | 最短路径 |
| `core` | 核心模块识别 | 无 | Top N 入度最高的文件 |
| `stats` | 关系统计 | 无 | 按类型分组统计 |
| `pattern` | 模式匹配 | 无（可选 `pattern_type`） | 循环链、长链（长度>阈值 5），可通过 `pattern_type` 筛选 |

### 安全设计
- 路径边界：所有输入路径必须通过 `isInsideRoot(worktree, target)` 校验
- 排除敏感文件：`.env*`、`.git`、凭证文件默认排除且不可配置为包含
- 符号链接：解析时检测循环，超过深度阈值（10）则跳过并 warning
- 配置写入：通过 `ctx.ask()` 获得用户确认后才写入 `.opencode/ae.jsonc`

### 性能设计
- 文件扫描：复用 `ae-task-analyzer.tool.ts` 的 `collectSourceFiles()` 模式
- 批量写入：使用事务批量 INSERT，不在逐条 INSERT 外开事务
- 查询限制：默认 `limit=50`，避免大项目返回过多结果
- 路径规范化：缓存 `toPosixPath()` 结果避免重复转换

## 影响面
- `src/schemas/ae-asset-schema.ts` — 新增 TOOL/SKILL/COMMAND 常量
- `src/tools/index.ts` — 注册两个新工具
- `src/services/ae-catalog.ts` — 注册两个新技能/命令
- `src/assets/skills/` — 新增两个技能目录
- `src/assets/commands/` — 新增两个命令文件（可选）
- `package.json` — 新增 `better-sqlite3` 依赖
- `.opencode/ae.jsonc` — 新增 `graph.exclude` 配置字段（运行时读写）

## 实现单元

### U1. 依赖验证与配置服务
- [ ] 目标: 验证 `better-sqlite3` 在当前环境可安装/编译，创建配置读写服务
- [ ] 覆盖需求: R9, R11
- [ ] 依赖: 无
- [ ] 文件:
  - `package.json`（新增依赖）
  - `src/services/graph-config-service.ts`（新增）
  - `tests/services/graph-config-service.test.ts`（新增）
- [ ] 方法:
  - 安装 `better-sqlite3`，运行 `npm run build` + `npm run typecheck` 验证编译通过
  - 创建 `graph-config-service.ts`，提供 `loadGraphConfig(worktree)` 和 `saveGraphExcludeRule(worktree, rule)` 函数
  - 配置路径沿用 `builtin-opencode-config-service.ts` 的 `resolveBuiltinOpencodeConfigPaths()` 模式，读取 `.opencode/ae.jsonc`
  - JSONC 读取使用 `strip-json-comments`，写入时保留注释（读取 → 解析 → 合并 → 写回）
  - 写入时使用 `ctx.ask()` 确认
- [ ] 需遵循的模式:
  - `src/services/builtin-opencode-config-service.ts` — 配置层读取/合并模式
  - `src/tools/ae-swagger-parser.tool.ts` — `ctx.ask()` 确认模式
- [ ] 测试场景:
  - 正常路径: 读取已有 `graph.exclude` 配置
  - 边界情况: ae.jsonc 不存在时创建、有注释的 JSONC 读写
  - 错误路径: JSONC 解析失败返回中文提示
  - 集成场景: 保存排除规则后重新读取验证
- [ ] 验证:
  - `npx vitest run tests/services/graph-config-service.test.ts`
  - `npm run typecheck`

### U2. SQLite 存储服务
- [ ] 目标: 创建图谱数据的 SQLite 存储层，支持版本化快照、并发安全和中断恢复
- [ ] 覆盖需求: R6, R7, R15, R16, R17, R23
- [ ] 依赖: U1
- [ ] 文件:
  - `src/services/graph-storage-service.ts`（新增）
  - `tests/services/graph-storage-service.test.ts`（新增）
- [ ] 方法:
  - 使用 `better-sqlite3` 打开 `.ae/graph.db`
  - 首次打开时执行 `PRAGMA journal_mode=WAL` + `PRAGMA busy_timeout=10000`
  - 创建表结构：`graph_versions`、`files`、`relations`
  - 提供 `createVersion(worktree, scopeRoot)` → 返回 versionId
  - 提供 `insertFiles(versionId, files[])` 和 `insertRelations(versionId, relations[])` — 使用事务批量写入
  - 提供 `activateVersion(versionId)` — 原子切换 active version（使用 `UPDATE ... SET is_active=0 WHERE is_active=1` + `UPDATE ... SET is_active=1 WHERE id=?` 在同一事务中）
  - 提供 `getActiveVersion(worktree, scopeRoot)` → 返回 active version 的图谱数据
  - 提供 `copyVersion(sourceVersionId, targetVersionId)` — 将旧 version 的 files 和 relations 复制到新 version（增量构建使用）
  - 提供 `deleteVersionData(versionId, filePaths[])` — 删除指定 version 中指定文件相关的 files 和 relations
  - 提供 `cleanupIncompleteVersions(worktree, scopeRoot)` — 删除超过 10 分钟的非 active version
  - 提供 `closeDatabase()` — 正常关闭连接
  - 中断恢复：重新执行时先调用 `cleanupIncompleteVersions()`，再正常构建
- [ ] 需遵循的模式:
  - `better-sqlite3` 的 WAL + `BEGIN IMMEDIATE` + `busy_timeout` 模式
  - 事务使用 `db.transaction()` 包裹批量操作
- [ ] 测试场景:
  - 正常路径: 创建 version → 插入数据 → activate → 查询 active；增量构建：copyVersion → deleteVersionData → 插入新数据 → activate
  - 边界情况: 重复 activate 幂等、空数据 version、copyVersion 后数据完整性验证
  - 错误路径: busy timeout 超时返回中文提示、数据库文件损坏时建议删除重建、唯一约束冲突
  - 集成场景: 并发写入模拟（两个写操作交错，验证 busy_timeout 重试机制和 active version 唯一性）
- [ ] 验证:
  - `npx vitest run tests/services/graph-storage-service.test.ts`
  - `npm run typecheck`

### U3. 文件关系解析服务
- [ ] 目标: 创建文件关系解析引擎，支持代码导入、Markdown 链接、AE 资产引用和目录结构关系
- [ ] 覆盖需求: R1, R2, R3, R4, R24
- [ ] 依赖: U1
- [ ] 文件:
  - `src/services/graph-parse-service.ts`（新增）
  - `tests/services/graph-parse-service.test.ts`（新增）
- [ ] 方法:
  - `parseFileRelations(worktree, files[], config)` → 返回 `ParsedRelation[]`
  - 代码导入解析：正则匹配 `import ... from '...'`、`require('...')`、`include` 等
    - 相对路径：解析为工作区内文件节点
    - 非相对路径：记录为 `external` 关系类型
  - Markdown 链接解析：正则匹配 `[text](path)` 和 `[text][ref]`
    - 仅匹配相对路径链接，过滤 URL（`http://`、`https://`）
  - AE 资产引用解析：正则匹配 `ae:xxx`、`/ae-xxx`
    - 资产节点使用类型前缀：`skill:ae:work`、`command:/ae-work`
  - 目录结构关系：每个文件 → 其父目录的 `directory` 关系
  - 路径解析：使用 `path.resolve()` + `toPosixPath()` + `isInsideRoot()` 校验
  - 跳过无法读取的文件并收集 warning
- [ ] 需遵循的模式:
  - `src/tools/ae-task-analyzer.tool.ts` — 文件扫描、排除、路径安全
  - `src/utils/path-utils.ts` — `toPosixPath()`、`isInsideRoot()`
  - `src/services/swagger-service.ts` — 深度/节点数限制、循环检测
- [ ] 测试场景:
  - 正常路径: TS/JS import、Python import、Markdown 链接、AE 引用
  - 边界情况: 空文件、无引用文件、Windows 反斜杠路径、符号链接
  - 错误路径: 文件不可读（权限）、超大文件（>1MB 跳过）、路径越界
  - 集成场景: 多语言混合项目解析
- [ ] 验证:
  - `npx vitest run tests/services/graph-parse-service.test.ts`
  - `npm run typecheck`

### U4. ae-graph-build 工具
- [ ] 目标: 创建图谱构建/维护工具，支持全量和增量解析，运行时排除确认
- [ ] 覆盖需求: R8, R10, R11, R16, R24
- [ ] 依赖: U1, U2, U3
- [ ] 文件:
  - `src/tools/ae-graph-build.tool.ts`（新增）
  - `tests/tools/ae-graph-build.tool.test.ts`（新增）
- [ ] 方法:
  - 工具 ID: `ae-graph-build`
  - 参数: `target?`、`mode?`（auto/full/incremental）、`depth?`（shallow）
  - 流程:
    1. 校验 `target` 在 worktree 内（R24）
    2. 调用 `graph-config-service` 读取排除配置
    3. 清理 incomplete versions
    4. 判断模式：
       - **全量模式**：调用 `collectSourceFiles()` 扫描文件
       - **增量模式**：获取 Git diff 变更文件列表（`git diff --name-status HEAD`）（R8）
    5. 扫描过程中遇到常见排除目录且未配置时调用 `ctx.ask()` 确认（R10），确认后保存配置（R11）
    6. 创建新 version：
       - **增量模式**：先调用 `copyVersion()` 将旧 active 复制到新 version，再调用 `deleteVersionData()` 删除变更文件相关数据
       - **全量模式**：直接创建空 version
    7. 仅解析变更文件（增量）或全部文件（全量）的关系（R1-R4）
    8. 批量插入新关系到新 version（R16 幂等）
    9. 原子 `activateVersion()`（R15/R17/R23）
    10. 返回摘要 JSON：文件数、关系数、排除规则、耗时、数据库路径、模式
  - 非 Git 项目：降级全量模式并在返回中提示
- [ ] 需遵循的模式:
  - `src/tools/ae-task-analyzer.tool.ts` — 工具结构、文件扫描、路径安全
  - `src/tools/ae-swagger-parser.tool.ts` — `ctx.ask()` 确认、中文错误提示
  - 工具描述格式：第一行摘要（≤50字）→ 空行 → 功能说明 → 适用/不适用场景
- [ ] 测试场景:
  - 正常路径: 全量构建一个 fixture 项目、增量更新一个文件（验证旧数据保留 + 新数据替换）
  - 边界情况: 空项目、Git diff 为空（返回"无变更"）、非 Git 项目降级、增量构建后未变更文件仍存在
  - 错误路径: 目标路径越界、数据库写入失败、用户拒绝排除确认、Git 命令不可用
  - 集成场景: 连续两次增量构建结果一致（幂等性）、全量后增量结果与全量一致
- [ ] 验证:
  - `npx vitest run tests/tools/ae-graph-build.tool.test.ts`
  - `npm run typecheck`

### U5. ae-graph-query 工具
- [ ] 目标: 创建图谱查询工具，支持多种查询模式
- [ ] 覆盖需求: R12, R13, R14, R18, R19, R20, R21, R22, R24
- [ ] 依赖: U2
- [ ] 文件:
  - `src/tools/ae-graph-query.tool.ts`（新增）
  - `tests/tools/ae-graph-query.tool.test.ts`（新增）
- [ ] 方法:
  - 工具 ID: `ae-graph-query`
  - 参数: `mode`（deps/impact/health/filter/path/core/stats/pattern）、`file?`、`target?`、`relation_type?`、`file_type?`、`directory?`、`limit?`、`top?`、`pattern_type?`
  - 路径边界校验（R24）：所有路径参数（`file`、`target`、`directory`）必须通过 `isInsideRoot(worktree, path)` 校验；校验失败返回中文提示
  - 各模式实现:
    - `deps`: 查询 `relations` 表中 `source_path=file` 和 `target_path=file` 的记录
    - `impact`: 反向 BFS/DFS 遍历 `target_path=file` 的所有关系，收集影响链，循环检测使用 visited set
    - `health`: 遍历所有关系检测循环（DFS + 回溯标记）；孤立文件 = files 表中无任何 relation 的文件节点
    - `filter`: 按 `relation_type`、`file_type` 或 `directory` 前缀筛选；返回节点列表或边列表
    - `path`: BFS 最短路径从 source 到 target
    - `core`: 按 `target_path` 分组计数，取 Top N
    - `stats`: 按 `relation_type` 分组 COUNT
    - `pattern`: 根据 `pattern_type` 筛选：`cycle` = 循环链、`long` = 路径长度 > 阈值（默认 5）的依赖链、`all` = 全部
  - 数据库不存在时返回"请先执行 ae-graph-build 构建图谱"
  - 结果默认 limit=50，按路径字典序稳定排序
- [ ] 需遵循的模式:
  - 工具描述格式同 U4
  - 中文可恢复错误提示
- [ ] 测试场景:
  - 正常路径: deps/impact/health/filter/path/core/stats/pattern 各模式在 fixture 数据上查询
  - 边界情况: 文件不存在于图谱、空图谱、循环依赖图、path 参数为空
  - 错误路径: 数据库不存在、mode 参数非法、路径越界（R24）、file 参数不在 worktree 内
  - 集成场景: build 后 query 验证数据一致性
- [ ] 验证:
  - `npx vitest run tests/tools/ae-graph-query.tool.test.ts`
  - `npm run typecheck`

### U6. 技能和命令注册
- [ ] 目标: 注册 `ae:graph-build` 和 `ae:graph-query` 技能/命令
- [ ] 覆盖需求: 全部（入口层）
- [ ] 依赖: U4, U5
- [ ] 文件:
  - `src/schemas/ae-asset-schema.ts`（修改）
  - `src/services/ae-catalog.ts`（修改）
  - `src/tools/index.ts`（修改）
  - `src/assets/skills/ae-graph-build/SKILL.md`（新增）
  - `src/assets/skills/ae-graph-query/SKILL.md`（新增）
- [ ] 方法:
  - `ae-asset-schema.ts`: 在 `TOOL` 对象中新增 `AE_GRAPH_BUILD` 和 `AE_GRAPH_QUERY`；在 `SKILL` 对象中新增 `GRAPH_BUILD` 和 `GRAPH_QUERY`；在 `COMMAND` 中自动派生；在 `AeSkillNameSchema` 枚举中新增
  - `ae-catalog.ts`: 在 `PHASE_ONE_ENTRIES` 中新增两个条目，按用户流程排序放在 `SWAGGER_PARSER` 之后
  - `tools/index.ts`: 导入并注册两个新工具
  - 技能 `SKILL.md`: 包含角色、适用场景、执行流程、验证方式
  - 命令：由 `command-registration.ts` 自动从技能条目生成默认模板（`使用 ${skillName} 技能处理这次请求...`），无需单独创建 `.md` 命令文件
- [ ] 需遵循的模式:
  - `src/assets/skills/ae-swagger-parser/SKILL.md` — 技能文件结构
  - `ae-catalog.ts` 现有条目格式
- [ ] 测试场景:
  - 正常路径: 工具注册表包含两个新工具 ID
  - 边界情况: 常量值不冲突
  - 错误路径: 无
  - 集成场景: `ae-help` 能列出两个新技能
- [ ] 验证:
  - `npm run typecheck`
  - `npm run build`
  - `npx vitest run tests/` 全量测试

## 风险与应对

| 风险 | 影响 | 应对措施 |
|------|------|----------|
| `better-sqlite3` 编译失败 | 整个功能无法实现 | U1 前置验证；失败则暂停功能，不堆砌后续实现 |
| 多会话并发写入数据库锁冲突 | 用户体验差 | WAL + busy_timeout=10s + 重试 3 次 + 中文提示；超时后返回明确建议 |
| Git diff 不准确（rename/未跟踪文件） | 增量更新遗漏 | 增量模式遇到 rename 时标记 warning；无法可靠判断时建议用户执行全量 |
| 解析规则误匹配（注释中的 import、字符串中的链接） | 产生虚假依赖边 | 首版接受一定误匹配率；结果中标记 confidence=regex；后续可通过 AST 优化 |
| R5 深层 AST 推迟导致用户期望不满足 | 首版功能不完整 | 在 SKILL.md 和工具描述中明确说明首版仅支持浅层解析 |
| 大项目性能 | 超过 30 秒 | 文件数超阈值（5000）时在构建前提示预计耗时；跳过 >1MB 文件 |

## 待定问题

### 执行前需解决
- 无（所有阻塞问题已在计划中通过默认决策解决）

### 推迟到执行
- Q1. 深层 AST 解析（ts-morph）是否在后续版本引入 → 取决于首版用户反馈
- Q2. `better-sqlite3` 在 opencode 插件打包环境中的兼容性 → U1 验证决定
- Q3. import 路径解析（TS path alias、monorepo workspace）→ 首版仅解析相对路径，后续扩展

## 等价性检查
- implementationUnitsCount: 6
- tracedRequirementsCount: 24
- tracedNonFunctionalRequirementsCount: 3
- decisionsCount: 7
- risksCount: 6

## 下一步
-> /ae-work
