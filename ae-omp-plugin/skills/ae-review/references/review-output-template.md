# 审查输出模板

全并行架构下的审查输出格式。发现按严重级别分组，包含合并层因果分析结果和修复结果。

**重要：** 使用管道符分隔的 markdown 表格。不要使用 ASCII 制表符。

## 审查证明可解析行（步骤 10 依赖，必须保留）

`scripts/review-proof.mjs` 从审查输出中解析审查证据，用于与当前 git 指纹逐项比对。**每份写入证明的审查报告末尾必须包含以下 5 行**（标签拼写固定，冒号后为值；标签行允许 `**加粗**`、`- ` 列表前缀，值必须是单行）：

```markdown
review_status: passed
worktree: D:/Documents/IdeaProjects/AI-Agent-Engine
branch: main
head: 3f9a1c2e8b4d5a6f7e8d9c0b1a2f3e4d5c6b7a89
status_summary: M src/foo.ts; ?? src/bar.ts
```

| 行 | 取值 | 归一规则 |
|----|------|---------|
| `review_status` | `passed` 或 `failed`（`pass`/`fail` 也被接受） | 无阻断级发现（P0/P1/P2/critical/high/medium）时为 passed |
| `worktree` | `git rev-parse --show-toplevel` 输出原样 | win32 下大小写不敏感比对 |
| `branch` | 当前分支名 | 优先从 `git status --porcelain --branch` 的 `## ` 行解析（`## main...origin/main` → `main`），回退 `git rev-parse --abbrev-ref HEAD` |
| `head` | `git rev-parse HEAD` 完整 sha | 原样 |
| `status_summary` | `git status --porcelain --branch` 输出的单行归一值 | 见下 |

### status_summary 单行归一规则

1. 取 `git status --porcelain --branch` 输出
2. **去掉 `## ` 开头的分支行**
3. 去掉空行
4. 每行 trim
5. 过滤以 `ae/evidence/`、`ae/reviews/`、`ae/handoffs/`、`ae/screenshots/` 开头的条目（审查运行时产物）
6. 用 `; `（分号+空格）连接成**一行**
7. **无任何变更时写 `clean`**（脚本将 clean/no changes/no output 归一为空串后比对）

脚本会把 `;` 还原成换行，与指纹侧的多行归一文本用同一函数比对——两侧一致即可通过。

### 替代形态：整体 JSON

审查输出也可以是单个 JSON 对象（脚本先尝试 JSON 解析，失败再按标签文本解析），键名与语义等价：

```json
{
  "reviewStatus": "passed",
  "worktree": "D:/Documents/IdeaProjects/AI-Agent-Engine",
  "branch": "main",
  "head": "3f9a1c2e...",
  "statusSummary": "M src/foo.ts\n?? src/bar.ts",
  "findings": []
}
```

`reviewStatus`/`review_status`/`status`/`conclusion` 任一作为状态键；`statusSummary` 可为多行文本或 `; ` 单行；`findings` 数组用于阻断级检测（passed 时不得含 severity 为 P0/P1/P2/critical/high/medium 的项）。二选一即可，不要同时输出两种形态导致解析歧义（JSON 优先）。

### 采集时序要求（必须遵守）

- `status_summary`、`head`、`branch` 必须在写 metadata.json（运行 review-proof.mjs）**之前**采集
- **审查报告生成后到脚本运行前，不得改动工作树**——否则指纹不一致会被脚本拒绝（设计意图：防陈旧报告冒充）
- `review_status: passed` 时，报告**正文**也不得出现 `[P0]`/`[P1]`/`[P2]`/`critical`/`high`/`medium` 形式的阻断级发现行（脚本正则会检测正文并拒绝）
- **`<source-output-file>` 建议写到工作树之外**（如系统临时目录）：若把它写进仓库内未跟踪路径，该文件自身会出现在 `git status --porcelain` 里、被计入指纹，而先前记录的 `status_summary` 未包含它，导致不一致被拒。必须写入仓库内时，`status_summary` 要在报告落盘之后再采集，或确保该路径落在被过滤的 `ae/reviews/` 等运行时目录下

```markdown
## 审查结果

**域：** code
**范围：** from=abc123 -> 工作树（14 个文件，342 行）
**意图：** 添加订单导出端点
**模式：** autofix

**审查代理：** ocr-reviewer, security-design-reviewer, api-design-reviewer, goal-alignment-reviewer
**路由覆盖：** 源代码(12) 配置(1) 基础设施(1)

### P0 -- 关键

| # | 文件 | 问题 | 代理 | 置信度 | 因果 |
|---|------|------|------|--------|------|
| 1 | `orders_controller.rb:42` | 账户查询缺少归属检查 | security-design | 0.92 | 根因 |
| 2 | `orders_controller.rb:42` | 未授权访问风险 | security-design | 0.88 | ← #1 |

### P1 -- 高

| # | 文件 | 问题 | 代理 | 置信度 | 因果 |
|---|------|------|------|--------|------|
| 3 | `export_service.rb:87` | 全量加载无上限 | ocr | 0.85 | 根因 |
| 4 | `config/database.yml` | 连接池未配置 | ocr | 0.80 | 根因 |

### 因果分析

- 修复 #1（缺少归属检查）将自动解决 #2（未授权访问风险）
- 实际需修复：3 项（#1、#3、#4），自动消除：1 项（#2）

### 已应用修复

- #1：添加账户归属检查
- #3：添加分页保护
- #4：配置连接池上限

### 剩余可操作工作

无

### 预存问题

| # | 文件 | 问题 | 代理 |
|---|------|------|------|
| 1 | `orders_controller.rb:12` | 宽泛的 rescue | ocr |

### 覆盖情况

| 路由 | 文件数 | 代理 |
|------|--------|------|
| 源代码 | 12 | ocr-reviewer, security-design-reviewer, api-design-reviewer |
| 配置 | 1 | ocr-reviewer |
| 基础设施 | 1 | ocr-reviewer |

- 已抑制：2 个低于 0.60 置信度的发现
- 合并去重：3 个跨代理重复发现已合并
- 残余风险：导出端点无速率限制

---

> **结论：** 修复后可用
>
> **理由：** 1 个关键认证绕过必须修复，修复后自动消除 1 个下游发现。
>
> **修复顺序：** P0(#1) → P1(#3) → P1(#4)

review_status: failed
worktree: D:/Documents/IdeaProjects/AI-Agent-Engine
branch: feature/order-export
head: 3f9a1c2e8b4d5a6f7e8d9c0b1a2f3e4d5c6b7a89
status_summary: M src/orders_controller.rb; M src/export_service.rb; M config/database.yml
```

## 文档域示例

```markdown
## 审查结果

**域：** document
**文档：** ae/designs/feat-user-auth-2026-03-15/overview.md
**类型：** design
**审查代理：** document-reviewer, architecture-design-reviewer, security-design-reviewer, design-integrity-reviewer

已应用 3 个自动修复。2 个发现待处理。

### 已应用的自动修复

- 统一术语为"pipeline"（document-reviewer）
- 修复交叉引用：第 4 节引用"第 3.2 节"应为"第 3.1 节"（design-integrity）
- 补充缺失的认证流程步骤（security-design-reviewer）

### P0——必须修复

| # | 章节 | 问题 | 代理 | 置信度 | 因果 |
|---|------|------|------|--------|------|
| 1 | 需求追踪表 | 目标声明"离线支持"但技术方案假设持续在线 | design-integrity | 0.92 | 根因 |

### P1——应该修复

| # | 章节 | 问题 | 代理 | 置信度 | 因果 |
|---|------|------|------|--------|------|
| 2 | 实现单元 3 | 提出自定义认证但未提及现有配置 | architecture-design-reviewer | 0.85 | 根因 |

### 因果分析

- 无自动消除关系，两项发现需独立修复

### 残余风险

| # | 风险 | 来源 |
|---|------|------|
| 1 | 数据变更的迁移回滚策略未涉及 | architecture-design-reviewer |

### 覆盖范围

| 代理 | 状态 | 发现 | 自动修复 | 待处理 | 残余 |
|------|------|------|----------|--------|------|
| document-reviewer | 已完成 | 2 | 1 | 0 | 0 |
| architecture-design-reviewer | 已完成 | 2 | 0 | 1 | 1 |
| security-design-reviewer | 已完成 | 1 | 1 | 0 | 0 |
| design-integrity-reviewer | 已完成 | 2 | 1 | 1 | 0 |

review_status: failed
worktree: D:/Documents/IdeaProjects/AI-Agent-Engine
branch: feature/user-auth-design
head: 8c7b6a5f4e3d2c1b0a9f8e7d6c5b4a3f2e1d0c9b
status_summary: M ae/designs/feat-user-auth-2026-03-15/overview.md
```

## 格式规则

### 通用规则

- **管道符分隔的 markdown 表格**用于发现
- **按严重度分组**：`### P0 -- 关键` 等
- **始终包含位置**（代码域：file:line；文档域：章节）
- **代理列**显示标记的代理名称（表格内可使用缩写如 `ocr`、`security-design`，完整名称在审查代理行和覆盖表中使用）
- **因果列**显示因果分析结果：`根因` 或 `← #N`（被 #N 自动解决）
- **因果分析章节**：展示根因发现和自动消除关系
- **已应用修复章节**：列出合并层修复流程实际应用的修复
- **结论使用引用块**
- **水平线**（`---`）分隔发现与结论
- **可解析行**：报告末尾必须附上述 5 行证据行（写入证明时；report-only 模式可省略）

### 代码域特有

- **路由覆盖行**：展示各路由覆盖的文件数
- **预存问题**：标记 `finding_type: "pre-existing"` 的发现单独展示
- **合并去重统计**：展示跨代理去重数量

### 文档域特有

- **摘要行**：始终展示。省略为零的子句
- **P0-P3 章节**：仅包含有发现的章节
- **残余风险**：如无则省略
- **覆盖范围**：始终包含。发现 = 自动修复 + 待处理

## 无头模式格式

不使用表格。发现使用 `[severity] File: <file:line|section> -- <title> [caused_by: #N|root]` 格式，带 Evidence 行。因果分析以 `Root causes: #1, #3` / `Auto-resolved: #2 (by #1)` 格式输出。结论在头部。末尾同样附 5 行证据行。
