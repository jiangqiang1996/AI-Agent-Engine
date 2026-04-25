---
name: ae:review
description: "全能审查技能。支持多种方式确定审查范围（Git 差异、全量文件、指定路径、会话变更等），对文件进行分层角色审查。默认排除需求文档和计划文档，用户明确指定时例外。"
argument-hint: "[mode:*] [from:<ref>] [full] [full:<path>] [session] [plan:<path>]"
---

# 代码审查

代码审查回答**代码质量如何（HOW WELL）**——不是代码做了什么，而是代码是否正确、安全、可维护。

此技能的持久输出是一份**结构化审查报告**，包含按严重级别排序的发现、自动修复结果和覆盖范围。

此技能**默认不审查需求文档和计划文档**——它们由 `ae:document-review` 在核心流程中独立审查，仅在用户明确指定时纳入。此技能**不做产品决策**——发现必须基于代码质量，而非"应该构建什么"。

## 核心原则

1. **范围先行，审查在后** — 在调度任何审查者之前，必须完成范围确定、排除规则应用和用户确认。不得跳过范围确认直接审查。
2. **只读操作** — 代码审查子代理不得编辑项目文件或变更仓库状态。仅 `safe_auto` 修复在综合阶段由编排器应用。
3. **意图驱动** — 每个发现必须对照意图摘要判断相关性。与意图无关的预存问题标记 `pre_existing: true`，不计入审查结论。
4. **证据必须基于代码** — 每个发现至少包含一项来自实际代码的证据。无证据的泛泛建议必须抑制。
5. **排除规则不可绕过** — 敏感文件和 `.opencode/` 始终排除。需求/计划文档默认排除，仅在用户明确指定时纳入。
6. **文档文件委派给 ae:document-review** — ae-review 不直接审查文档文件，一律委派。

## 模式规则

| 模式 | 交互 | 自动修复 | 展示 | 产物 |
|------|------|---------|------|------|
| **交互**（默认） | 询问策略决策 | 仅 `safe_auto` | 完整报告 + 选项 | 写入 |
| **自动修复** | 无 | 仅 `safe_auto` | 仅结果摘要 | 写入 |
| **只读** | 无 | 无 | 完整报告 | 无 |
| **无头** | 无 | 仅 `safe_auto` | 结构化文本 | 写入，返回"审查完成" |

## 排除规则

**始终排除（任何情况下不可覆盖）：**
- 敏感文件：`.env`、`.env.*`（保留 `.env.example`、`.env.template`）——在文件收集阶段即从文件列表中移除，后续任何阶段不可读取或引用
- `.opencode/` 目录下的所有文件
- 受保护产物：`docs/ae/review/*`、`docs/ae/solutions/*`

**默认排除（用户明确指定时纳入）：**
- 需求文档：`docs/ae/brainstorms/` 下的文件
- 计划文档：`docs/ae/plans/` 下的文件

用户意图识别——以下信号视为用户明确要求审查需求/计划文档：
- 对话中明确提到"审查需求文档"、"审查计划文档"等
- `full:<path>` 参数指向 `docs/ae/brainstorms/` 或 `docs/ae/plans/` 目录
- `full:<path>` 参数指向的路径包含需求/计划文档
- 用户在范围确认阶段主动添加了需求/计划文件

## 执行流程

### 阶段 0：参数解析与模式检测

解析 `$ARGUMENTS` 中的可选标记。以 `mode:` 开头的标记是标志，不是 ref——从参数中移除它们。

| 标记 | 效果 |
|------|------|
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

**退出条件：** 模式和范围标记解析完成，无冲突。

### 阶段 1：确定范围

审查范围通过以下方式确定，按参数优先级选择。在进入阶段 2 之前，**必须**完成文件收集、排除规则应用和用户确认。

#### 1a：Git 差异模式（`from:<ref>` 或 `recent:<N>` 或自动检测）

阅读 `references/scope-detection.md` 获取完整的 Git 范围检测流程。

检测完成后：
- 展示基准 ref、变更文件数、变更量，让用户确认或修正
- 未跟踪文件：始终检查。在无头/自动修复模式中仅继续跟踪变更并注明排除

#### 1b：全量扫描模式（`full` 或 `full:<path>`）

不依赖 Git。扫描项目文件系统：

1. 确定扫描根目录：`full` 使用项目根目录，`full:<path>` 使用指定路径
2. 使用 glob 递归列出所有文件
3. 应用排除规则（见上方"排除规则"章节）
4. 排除 `node_modules/`、`.git/`、`dist/`、`build/` 等常见非审查目录
5. 展示文件数和按类型的分布，让用户确认或修正

全量扫描模式下，子代理使用完整文件模式（`Full content:`），不区分主要/次要/预存。

#### 1c：会话变更模式（`session`）

审查本次会话中变更的文件：

1. 回顾当前会话上下文，识别所有被创建、修改或删除的文件
2. 对于已存在的文件，读取当前内容作为审查输入
3. 如果会话上下文中包含变更前的 diff 信息，一并提供给子代理
4. 展示变更文件列表，让用户确认或修正

#### 1d：自动检测（无范围参数时）

按优先级尝试：

1. **Git 自动检测**：阅读 `references/scope-detection.md`，按优先级执行范围检测流程（状态文件 → 项目配置 → resolve-base.sh → 友好降级）
2. **非 Git 项目**：如果项目不是 Git 仓库（无 `.git` 目录），回退到全量扫描模式

**退出条件：** 文件列表已确定，排除规则已应用，用户已确认范围（无头/自动修复模式下跳过用户确认）。

### 阶段 2：意图发现与计划发现

**意图发现：** 结合对话上下文编写 2-3 行意图摘要，传递给每个审查者。

**计划发现（需求验证）：** 按优先级检查：`plan:` 参数 → 自动发现 `docs/ae/plans/` 中的最近计划。记录置信度标记（`explicit`/`inferred`）。

**退出条件：** 意图摘要已编写，计划发现已完成（无论是否找到计划）。

### 阶段 3：文件路由与审查者选择

阅读 `references/file-routing-table.md` 和 `references/persona-catalog.md`。**不要在阶段 2 完成之前加载这些文件。**

1. 每个文件按扩展名/文件名匹配路由（支持无扩展名文件按文件名 glob 匹配）
2. **默认排除的文件**（需求文档和计划文档，且用户未明确指定审查）：从文件列表中移除，不参与任何审查；若用户明确指定，则纳入文档文件列表
3. **文档文件**（.md .rst .adoc .org .txt）：收集到文档文件列表，委派给 ae:document-review
4. **代码文件** → 匹配路由组 → 确定基础审查者和条件审查者
5. **领域代理激活：** 当文件匹配特定路由组时，自动激活对应领域代理：
   - 配置文件路由（.json/.yaml/.yml/.toml/.xml）→ `config-reviewer`
   - 基础设施路由（Dockerfile/CI/Terraform/Makefile）→ `infra-reviewer`
   - 数据库路由（*.sql/.prisma/迁移文件）→ `database-reviewer`
   - 脚本路由（.sh/.bash/.ps1/.bat/.cmd）→ `script-reviewer`
6. 分析代码文件内容特征（大小、主题、深度）→ 代理判断激活条件审查者
7. 多个文件属于不同路由时，合并所有活跃审查者（含领域代理），去重后统一派发
8. 在派发前公布团队并附理由

为 `project-standards` 角色查找所有相关 AGENTS.md 文件路径。

**退出条件：** 审查团队已确定并公布，代码文件列表和文档文件列表已分离。

### 阶段 4a：生成代码审查子代理

使用中层模型。生成唯一运行 ID。

阅读 `references/subagent-template.md` 构建每个子代理的提示。**不要在阶段 3 完成之前加载此文件。**

填入变量：

| 变量 | 值 |
|------|-----|
| `{persona_file}` | 代理 markdown 文件完整内容 |
| `{schema}` | 发现 schema 内容 |
| `{intent_summary}` | 阶段 2 输出 |
| `{file_list}` | 变更文件列表 |
| `{content}` | diff 内容或完整文件内容或会话变更内容 |
| `{content_mode_label}` | 增量审查时为 `Diff:`，全量审查时为 `Full content:`，会话变更模式时为 `Session changes:` |
| `{run_id}` | 运行标识符 |
| `{reviewer_name}` | 审查者名称 |

所有角色子代理作为并行子代理生成。角色子代理相对于项目是**只读**的。每个代理将完整 JSON 写入 `docs/ae/review/{run_id}/{reviewer_name}.json`，返回精简 JSON。

**错误处理：** 如果代理失败或超时，使用已完成代理的发现继续。在覆盖范围部分注明失败的代理。

**退出条件：** 所有代码审查子代理已返回结果（或超时处理完成）。

### 阶段 4b：委派文档审查

对阶段 3 收集的文档文件列表，逐个调用 `Skill("ae:document-review", "mode:headless <文件路径>")`。

ae-document-review 返回结构化发现，将其合并到统一报告中：
- 将 ae-document-review 的发现转换为 ae-review 的 findings schema 格式
- 文档类发现的 `file` 设为文档路径，`line` 设为 null，`section` 保留原始章节信息
- 文档类发现的 `autofix_class` 和 `severity` 保留 ae-document-review 的原始判断

如果文档文件数量较多（>5），提示用户确认是否全部审查或选择关键文档。

**退出条件：** 所有文档审查结果已合并（或无文档文件需要审查）。

### 阶段 5-7：综合、展示和审查后

所有代理返回后，阅读 `references/synthesis-and-presentation.md` 了解综合流水线（验证、置信度门控、去重、跨审查者一致、解决分歧、规范化路由、划分工作、排序）、展示和审查后流程。**不要在阶段 4a 和 4b 完成之前加载此文件。**

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
