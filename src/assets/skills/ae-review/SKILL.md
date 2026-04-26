---
name: ae:review
description: "统一审查技能。支持代码域（Git 差异、全量文件、指定路径、会话变更等）和文档域（需求文档、计划文档、测试文档、通用文档）的分层角色审查。通过 domain 参数切换审查域。"
argument-hint: "[mode:*] [domain:code|domain:document] [from:<ref>] [full] [full:<path>] [session] [plan:<path>] [文档路径]"
---

# 统一审查

审查回答**质量如何（HOW WELL）**——代码是否正确、安全、可维护；文档是否一致、可行、完整。

此技能的持久输出是一份**结构化审查报告**，包含按严重级别排序的发现、自动修复结果和覆盖范围。

## 核心原则

1. **范围先行，审查在后** — 在调度任何审查者之前，必须完成范围确定、排除规则应用和用户确认。不得跳过范围确认直接审查。
2. **只读操作** — 审查子代理不得编辑项目文件或变更仓库状态。仅 `auto` 修复在综合阶段由编排器应用。
3. **意图驱动** — 代码域每个发现必须对照意图摘要判断相关性。与意图无关的预存问题标记 `pre_existing: true`，不计入审查结论。
4. **证据必须基于实际内容** — 每个发现至少包含一项来自实际代码/文档的证据。无证据的泛泛建议必须抑制。
5. **排除规则不可绕过** — 敏感文件和 `.opencode/` 始终排除。需求/计划文档默认排除，仅在满足"明确指定"条件时纳入。
6. **auto vs present 的判断标准是修复确定性** — 判断标准不是"这个修复重要吗？"而是"是否有不止一种合理的修复方式？"。明确正确的修复 → `auto`；需要用户判断 → `gated`/`manual`。
7. **域互斥** — 不支持混合域审查。`domain` 参数为互斥值：`code` 或 `document`。

## 模式规则

| 模式 | 交互 | 自动修复 | 展示 | 产物 |
|------|------|---------|------|------|
| **交互**（默认） | 询问策略决策 | 仅 `auto` | 完整报告 + 选项 | 写入 |
| **自动修复** | 无 | 仅 `auto` | 仅结果摘要 | 写入 |
| **只读** | 无 | 无 | 完整报告 | 无 |
| **无头** | 无 | 仅 `auto` | 结构化文本 | 写入，返回"审查完成" |

## 排除规则

**始终排除（任何情况下不可覆盖）：**
- 敏感文件：`.env`、`.env.*`（保留 `.env.example`、`.env.template`）——在文件收集阶段即从文件列表中移除，后续任何阶段不可读取或引用
- `.opencode/` 目录下的所有文件
- 受保护产物：`docs/ae/review/*`、`docs/ae/solutions/*`

**全域默认排除（域安全需求 R4-R5）：**
- `docs/ae/brainstorms/` 下的文件
- `docs/ae/plans/` 下的文件

**"明确指定"条件——满足任一则纳入：**
1. 用户传入的文件路径指向这些目录下的文件
2. 对话中明确提到"审查需求文档"或"审查计划文档"等语义等价表达
3. `domain:document` 模式下确定性搜索机制（阶段 1）找到了文档——搜索成功等同于明确指定

## 执行流程

### 阶段 0：参数解析与模式检测

解析 `$ARGUMENTS` 中的可选标记。以 `mode:` 或 `domain:` 开头的标记是标志，不是 ref——从参数中移除它们。

| 标记 | 效果 |
|------|------|
| `domain:code` | 代码域审查（默认） |
| `domain:document` | 文档域审查 |
| `mode:autofix` | 自动修复模式 |
| `mode:report-only` | 只读模式 |
| `mode:headless` | 无头模式（程序调用） |
| `from:<ref>` | 使用 Git diff 确定范围，以指定 ref 作为差异基准（`base:<ref>` 映射到 `from:<ref>` 保持兼容） |
| `recent:<N>` | 审查最近 N 次 Git 提交 |
| `full` | 审查项目中所有文件（不依赖 Git） |
| `full:<path>` | 审查指定路径下的所有文件（不依赖 Git） |
| `session` | 审查本次会话中变更的文件 |
| `plan:<path>` | 加载计划用于需求验证 |

**冲突检测：** 以下范围标记互斥，同时指定时停止并报错：`from:` / `recent:` / `full` / `full:<path>` / `session`。

**`domain` 参数传递到后续所有阶段**（排除规则、审查者选择、综合流水线）。

**退出条件：** 模式、域和范围标记解析完成，无冲突。

### 阶段 1：确定范围

#### 代码域（`domain:code`）

审查范围通过以下方式确定，按参数优先级选择。在进入阶段 2 之前，**必须**完成文件收集、排除规则应用和用户确认。

##### 1a：Git 差异模式（`from:<ref>` 或 `recent:<N>` 或自动检测）

阅读 `references/scope-detection.md` 获取完整的 Git 范围检测流程。

检测完成后：
- 展示基准 ref、变更文件数、变更量，让用户确认或修正
- 未跟踪文件：始终检查。在无头/自动修复模式中仅继续跟踪变更并注明排除

##### 1b：全量扫描模式（`full` 或 `full:<path>`）

不依赖 Git。扫描项目文件系统：

1. 确定扫描根目录：`full` 使用项目根目录，`full:<path>` 使用指定路径
2. 使用 glob 递归列出所有文件
3. 应用排除规则（见上方"排除规则"章节）
4. 排除 `node_modules/`、`.git/`、`dist/`、`build/` 等常见非审查目录
5. 展示文件数和按类型的分布，让用户确认或修正

全量扫描模式下，子代理使用完整文件模式（`Full content:`），不区分主要/次要/预存。

##### 1c：会话变更模式（`session`）

审查本次会话中变更的文件：

1. 回顾当前会话上下文，识别所有被创建、修改或删除的文件
2. 对于已存在的文件，读取当前内容作为审查输入
3. 如果会话上下文中包含变更前的 diff 信息，一并提供给子代理
4. 展示变更文件列表，让用户确认或修正

##### 1d：自动检测（无范围参数时）

按优先级尝试：

1. **Git 自动检测**：阅读 `references/scope-detection.md`，按优先级执行范围检测流程（状态文件 → 项目配置 → resolve-base.sh → 友好降级）
2. **非 Git 项目**：如果项目不是 Git 仓库（无 `.git` 目录），回退到全量扫描模式

**退出条件：** 文件列表已确定，排除规则已应用，用户已确认范围（无头/自动修复模式下跳过用户确认）。

#### 文档域（`domain:document`）

- **指定文档路径**（参数中非标志标记视为路径）→ 使用指定路径
- **未指定路径 + 交互模式** → 确定性搜索：在 `docs/ae/brainstorms/` 和 `docs/ae/plans/` 中查找最近修改的文件
  - 搜索成功 → 纳入文档（等同于"明确指定"条件 3），展示搜索结果让用户确认（"找到最近修改的文档 X，是否审查此文档？"）
  - **局限性：** 搜索按修改时间降序返回最新文件，不一定是用户意图审查的文件。交互模式下搜索结果需展示给用户确认
  - 搜索无结果 → 询问用户要审查哪个文档
- **未指定路径 + 无头模式** → 输出错误信息，**立即终止**
- **未指定路径 + ae:lfg 管道模式**（disable-model-invocation）→ 确定性搜索；搜索失败输出错误并终止

**退出条件：** 文档路径已确定，文档已读取。

### 阶段 2：意图发现与分类

#### 代码域

**意图发现：** 结合对话上下文编写 2-3 行意图摘要，传递给每个审查者。

**计划发现（需求验证）：** 按优先级检查：`plan:` 参数 → 自动发现 `docs/ae/plans/` 中的最近计划。记录置信度标记（`explicit`/`inferred`）。

#### 文档域

通过分析文档内容（而非路径）判断类型：

- **requirements** — 关注构建什么和为什么构建。特征：包含需求列表（R1、R2...编号）、问题框架、成功标准
- **plan** — 关注如何构建。特征：包含实现步骤、架构决策、技术方案
- **test** — 关注如何验证。特征：包含测试用例、验收标准、测试步骤与预期结果、边界与异常场景描述
- **general** — 通用文档。不匹配以上三种时的默认分类

分类信号（按优先级）：
1. **frontmatter**：`topic` 字段暗示内容主题
2. **标题结构**：包含"需求"、"问题框架"→ requirements；包含"实现步骤"、"架构"→ plan；包含"测试用例"、"验收标准"、"预期结果"→ test
3. **路径提示**（辅助）：`docs/ae/brainstorms/` → 倾向 requirements；`docs/ae/plans/` → 倾向 plan

**退出条件：** 代码域——意图摘要已编写，计划发现已完成；文档域——文档类型已分类。

### 阶段 3：审查者选择

调用 `ae-review-contract` 工具，传入 `domain` 维度。

- `domain:code` → 代码域审查者：阅读 `references/file-routing-table.md` 和 `references/persona-catalog.md`
- `domain:document` → 文档域审查者

**不要在阶段 2 完成之前调用此工具。**

#### 代码域审查者选择

1. 每个文件按扩展名/文件名匹配路由（支持无扩展名文件按文件名 glob 匹配）
2. **默认排除的文件**（需求文档和计划文档，且未满足"明确指定"条件）：从文件列表中移除，不参与任何审查
3. **文档文件**（.md .rst .adoc .org .txt）：收集到文档文件列表，作为文档域发现单独调度
4. **代码文件** → 匹配路由组 → 确定基础审查者和条件审查者
5. **合并领域关注点：** 领域代理已合并到常驻/条件审查者中：
   - 配置文件路由（.json/.yaml/.yml/.toml/.xml）→ `standards-reviewer`（含配置文件审查）
   - 基础设施路由（Dockerfile/CI/Terraform/Makefile）→ `reliability-reviewer`（含基础设施审查）
   - 数据库路由（*.sql/.prisma/迁移文件）→ `data-migrations-reviewer`（含数据库审查）
   - 脚本路由（.sh/.bash/.ps1/.bat/.cmd）→ `maintainability-reviewer`（含脚本审查）
6. 分析代码文件内容特征（大小、主题、深度）→ 代理判断激活条件审查者
7. 多个文件属于不同路由时，合并所有活跃审查者（含领域代理），去重后统一派发
8. 在派发前公布团队并附理由

为 `standards` 角色查找所有相关 AGENTS.md 文件路径。

#### 文档域审查者选择

始终包含：`coherence-reviewer`、`feasibility-reviewer`

条件角色激活：
- **product-lens** — 文档对构建什么和为什么构建做出可质疑的主张，或具有战略影响力
- **design-lens** — 文档包含 UI/UX 内容、用户流程或交互描述
- **security** — 文档包含认证/授权、公共 API、数据处理或第三方集成
- **product-lens** — 文档包含多个优先级层级、大量需求（>=5 个）、弹性目标或与目标不一致的范围语言
- **adversarial** — 文档超过 5 个独立需求、包含重要架构决策、高风险领域或新抽象提议
- **test-case** — 文档类型为 test

**退出条件：** 审查团队已确定并公布。

### 阶段 4：并行调度

使用中层模型。生成唯一运行 ID。

阅读 `references/subagent-template.md` 构建每个子代理的提示。**不要在阶段 3 完成之前加载此文件。**

#### 代码域变量

| 变量 | 值 |
|------|-----|
| `{domain}` | `code` |
| `{persona_file}` | 代理 markdown 文件完整内容 |
| `{schema}` | 发现 schema 内容 |
| `{intent_summary}` | 阶段 2 输出 |
| `{file_list}` | 变更文件列表 |
| `{content}` | diff 内容或完整文件内容或会话变更内容 |
| `{content_mode_label}` | 增量审查时为 `Diff:`，全量审查时为 `Full content:`，会话变更模式时为 `Session changes:` |
| `{run_id}` | 运行标识符 |
| `{reviewer_name}` | 审查者名称 |

#### 文档域变量

| 变量 | 值 |
|------|-----|
| `{domain}` | `document` |
| `{persona_file}` | 代理 markdown 文件完整内容 |
| `{schema}` | 发现 schema 内容 |
| `{document_type}` | "requirements"、"plan"、"test" 或 "general" |
| `{document_path}` | 文档路径 |
| `{document_content}` | 文档完整文本 |
| `{run_id}` | 运行标识符 |
| `{reviewer_name}` | 审查者名称 |

向每个文档域代理传递**完整文档**——不要按章节拆分。

所有角色子代理作为并行子代理生成。角色子代理相对于项目是**只读**的。每个代理将完整 JSON 写入 `docs/ae/review/{run_id}/{reviewer_name}.json`，返回精简 JSON。

**错误处理：** 如果代理失败或超时，使用已完成代理的发现继续。在覆盖范围部分注明失败的代理。

**退出条件：** 所有审查子代理已返回结果（或超时处理完成）。

### 阶段 5-7：综合、展示和审查后

所有代理返回后，阅读 `references/synthesis-and-presentation.md` 了解综合流水线（校验、置信度门控、去重、共识提升、残余风险提升、解决分歧、autofix 提升、路由划分、排序）、展示和审查后流程。**不要在阶段 4 完成之前加载此文件。**

---

## 包含的参考文件

### 范围检测

@./references/scope-detection.md

### 文件路由表

@./references/file-routing-table.md

### 角色目录

@./references/persona-catalog.md

### 子代理模板

@./references/subagent-template.md

### 发现 Schema

@./references/findings-schema.json

### 综合与展示

@./references/synthesis-and-presentation.md

### 审查输出模板

@./references/review-output-template.md

### 基准解析脚本

@./references/resolve-base.sh
