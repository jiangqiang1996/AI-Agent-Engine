---
name: ae:review
description: "基于文件类型路由表驱动的结构化审查。非文档文件由代码审查者审查，文档文件委派给 ae-document-review。"
argument-hint: "[mode:*] [from:<ref>] [plan:<path>]"
---

# 代码审查

基于文件类型路由表驱动的审查。非文档文件（源代码、配置、基础设施等）由代码审查者审查，文档文件（.md/.rst 等）委派给 ae-document-review 技能处理。

## 何时使用

- 创建拉取请求之前
- 迭代实现过程中完成任务后
- 可独立调用或在更大工作流中运行

## 阶段 0：参数解析与模式检测

解析 `$ARGUMENTS` 中的可选标记。以 `mode:` 开头的标记是标志，不是 ref——从参数中移除它们。

| 标记 | 效果 |
|------|------|
| `mode:autofix` | 自动修复模式 |
| `mode:report-only` | 只读模式 |
| `mode:headless` | 无头模式（程序调用） |
| `from:<ref>` | 跳过范围检测，直接使用作为差异基准（`base:<ref>` 映射到 `from:<ref>` 保持兼容） |
| `recent:<N>` | 审查最近 N 次提交，跳过范围检测 |
| `full` | 审查所有 Git 跟踪文件 |
| `full:<path>` | 审查指定路径下的所有 Git 跟踪文件 |
| `plan:<path>` | 加载计划用于需求验证 |

**冲突的模式标记：** 停止并报错。

| 模式 | 行为 |
|------|------|
| **交互**（默认） | 审查、自动应用安全修复、展示发现、询问策略决策、可选修复/推送/PR |
| **自动修复** | 无用户交互。仅应用 `safe_auto` 修复、写入运行产物 |
| **只读** | 严格只读。仅审查和报告 |
| **无头** | 程序模式。静默应用 `safe_auto`、结构化文本输出、写入运行产物、返回"审查完成" |

## 阶段 1：确定范围

**如果提供了 `from:`、`recent:<N>`、`full` 或 `full:<path>` 参数：** 直接使用指定范围，跳过所有自动检测。

**否则：** 阅读 `references/scope-detection.md`，按优先级执行范围检测流程（状态文件 → 项目配置 → resolve-base.sh → 友好降级）。

检测完成后：
- 展示基准 ref、变更文件数、变更量，让用户确认或修正
- 未跟踪文件：始终检查。在无头/自动修复模式中仅继续跟踪变更并注明排除
- 敏感文件排除：`.env`、`.env.*`（保留 `.env.example`、`.env.template`）等密钥文件在文件收集阶段即从变更列表中移除，后续任何阶段不可读取或引用

## 阶段 2：意图发现与计划发现

**意图发现：** 结合对话上下文编写 2-3 行意图摘要，传递给每个审查者。

**计划发现（需求验证）：** 按优先级检查：`plan:` 参数 → 自动发现 `docs/ae/plans/` 中的最近计划。记录置信度标记（`explicit`/`inferred`）。

## 阶段 3：文件路由与审查者选择

阅读 `references/file-routing-table.md` 和 `references/persona-catalog.md`。

1. 审查范围确定后，每个变更文件按扩展名/文件名匹配路由（支持无扩展名文件按文件名 glob 匹配）
2. **文档文件**（.md .rst .adoc .org .txt）→ 收集到文档文件列表，不参与代码审查者选择
3. **非文档文件** → 匹配路由组 → 确定基础审查者和条件审查者
4. **领域代理激活：** 当文件匹配特定路由组时，自动激活对应领域代理：
   - 配置文件路由（.json/.yaml/.yml/.toml/.xml）→ `config-reviewer`
   - 基础设施路由（Dockerfile/CI/Terraform/Makefile）→ `infra-reviewer`
   - 数据库路由（*.sql/.prisma/迁移文件）→ `database-reviewer`
   - 脚本路由（.sh/.bash/.ps1/.bat/.cmd）→ `script-reviewer`
5. 分析非文档文件内容特征（大小、主题、深度）→ 代理判断激活条件审查者
6. 多个文件属于不同路由时，合并所有活跃审查者（含领域代理），去重后统一派发
7. 在派发前公布团队并附理由

为 `project-standards` 角色查找所有相关 AGENTS.md 文件路径。

## 阶段 4a：生成代码审查子代理

使用中层模型。生成唯一运行 ID。

使用 `references/subagent-template.md` 构建每个子代理的提示，填入变量：

| 变量 | 值 |
|------|-----|
| `{persona_file}` | 代理 markdown 文件完整内容 |
| `{scope_rules}` | 范围规则内容 |
| `{schema}` | 发现 schema 内容 |
| `{intent_summary}` | 阶段 2 输出 |
| `{file_list}` | 变更文件列表 |
| `{content}` | diff 内容或完整文件内容（全项目审查时） |
| `{run_id}` | 运行标识符 |
| `{reviewer_name}` | 审查者名称 |

所有角色子代理作为并行子代理生成。角色子代理相对于项目是**只读**的。每个代理将完整 JSON 写入 `docs/ae/review/{run_id}/{reviewer_name}.json`，返回精简 JSON。

**错误处理：** 如果代理失败或超时，使用已完成代理的发现继续。在覆盖范围部分注明失败的代理。

## 阶段 4b：委派文档审查

对阶段 3 收集的文档文件列表，逐个调用 `Skill("ae:document-review", "mode:headless <文件路径>")`。

ae-document-review 返回结构化发现，将其合并到统一报告中：
- 将 ae-document-review 的发现转换为 ae-review 的 findings schema 格式
- 文档类发现的 `file` 设为文档路径，`line` 设为 null，`section` 保留原始章节信息
- 文档类发现的 `autofix_class` 和 `severity` 保留 ae-document-review 的原始判断

如果文档文件数量较多（>5），提示用户确认是否全部审查或选择关键文档。

## 阶段 5-7：综合、展示和审查后

所有代理返回后，阅读 `references/synthesis-and-presentation.md` 了解综合流水线（验证、置信度门控、去重、跨审查者一致、解决分歧、规范化路由、划分工作、排序）、展示和审查后流程。不要在代理调度完成之前加载此文件。

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
