---
name: ae:review
description: "统一审查技能。支持代码域（Git 差异、全量文件、指定路径、会话变更等）和文档域（需求文档、计划文档、测试文档、通用文档）的分层角色审查。通过 domain 参数切换审查域。"
argument-hint: "[mode:*] [domain:code|domain:document] [from:<ref>] [full] [full:<path>] [session] [plan:<path>] [goals:<text>] [文档路径]"
---

# 统一审查（编排层）

审查回答**质量如何（HOW WELL）**——代码是否正确、安全、可维护；文档是否一致、可行、完整。

此技能采用四阶段编排协议，将审查调度委托给审查域代理。

## 核心原则

1. **范围先行，审查在后** — 在调度任何审查者之前，必须完成范围确定、排除规则应用和用户确认。不得跳过范围确认直接审查。
2. **只读操作** — 审查子代理不得编辑项目文件或变更仓库状态。仅 `auto` 修复在综合阶段由编排器应用。
3. **意图驱动** — 代码域每个发现必须对照意图摘要判断相关性。与意图无关的预存问题标记 `pre_existing: true`，不计入审查结论。
4. **证据必须基于实际内容** — 每个发现至少包含一项来自实际代码/文档的证据。无证据的泛泛建议必须抑制。
5. **排除规则不可绕过** — 敏感文件和 `.opencode/` 始终排除。需求/计划文档默认排除，仅在满足"明确指定"条件时纳入。
6. **auto vs present 的判断标准是可推断确定性** — 判断标准不是"这个修复重要吗？"，而是"能否根据已知内容推断出唯一最小修复"。可由同一文档、同一计划、项目既有规范、稳定模板或明确用户意图推断出的修复 → `auto`；需要选择目标、范围、取舍或新增立场 → `gated`/`manual`。
7. **无法推断时提出补全建议** — `gated`/`manual` 发现不得只停留在问题报告；必须给出可选建议和一个面向用户的补全问题。交互模式下先询问用户，得到明确选择后再修复；自动修复模式只记录问题和建议，不替用户决策；无头模式按审查者推荐方向修复所有带 `suggested_fix` 且不触发安全边界的发现。
8. **域互斥** — 不支持混合域审查。`domain` 参数为互斥值：`code` 或 `document`。
9. **图谱新鲜度门控** — 使用 `ae:graph-query` 确定范围或影响面时必须读取 `freshness`；`freshness.status` 不是 `fresh` 时，图谱结果只能辅助定位，不得作为无影响、无依赖、完整覆盖或无需审查的结论证据；需要这类高影响结论时必须刷新图谱，或用真实文件、源码搜索、Git 状态和验证命令补证。

## 模式规则

| 模式 | 交互 | 自动修复 | 展示 | 产物 |
|------|------|---------|------|------|
| **交互**（默认） | 询问策略决策 | 仅 `auto` | 完整报告 + 选项 | 写入 |
| **自动修复** | 无 | 仅 `auto` | 仅结果摘要 | 写入 |
| **只读** | 无 | 无 | 完整报告 | 无 |
| **无头** | 无 | `auto` + 推荐修复 | 结构化文本 | 写入，返回"审查完成" |

## 排除规则

**始终排除（任何情况下不可覆盖）：**
- 敏感文件：`.env`、`.env.*`（保留 `.env.example`、`.env.template`）——在文件收集阶段即从文件列表中移除，后续任何阶段不可读取或引用
- `.opencode/` 目录下的所有文件
- 受保护产物：`ae/reviews/*`、`ae/solutions/*`

**全域默认排除（域安全需求 R4-R5）：**
- `ae/prds/` 下的文件
- `ae/plans/` 下的文件

**"明确指定"条件——满足任一则纳入：**
1. 用户传入的文件路径指向这些目录下的文件
2. 对话中明确提到"审查需求文档"或"审查计划文档"等语义等价表达
3. `domain:document` 模式下确定性搜索机制（阶段 1）找到了文档——搜索成功等同于明确指定

## 四阶段编排协议

### 阶段一：入口（Entry）

解析参数，确定审查域和范围，输出 `TaskIntent`。

#### 参数解析

解析 `$ARGUMENTS` 中的可选标记。以 `mode:` 或 `domain:` 开头的标记是标志，不是 ref——从参数中移除它们。

| 标记 | 效果 |
|------|------|
| `domain:code` | 代码域审查（默认） |
| `domain:document` | 文档域审查 |
| `mode:autofix` | 自动修复模式 |
| `mode:report-only` | 只读模式 |
| `mode:headless` | 无头模式（程序调用） |
| `from:<ref>` | 使用 Git diff 确定范围，以指定 ref 作为差异基准 |
| `recent:<N>` | 审查最近 N 次 Git 提交 |
| `full` | 审查项目中所有文件（不依赖 Git） |
| `full:<path>` | 审查指定路径下的所有文件（不依赖 Git） |
| `session` | 审查本次会话中变更的文件 |
| `plan:<path>` | 加载计划用于需求验证 |
| `goals:<text>` | 传入审查目标（成功条件列表），激活 goal-alignment-reviewer 逐条校验变更是否达成目标 |

**冲突检测：** 以下范围标记互斥，同时指定时停止并报错：`from:` / `recent:` / `full` / `full:<path>` / `session`。

#### 范围确定

阅读 `references/scope-detection.md` 获取完整的 Git 范围检测流程。

代码域范围确定：

1. **Git 差异模式**（`from:<ref>` 或 `recent:<N>` 或自动检测）→ 按优先级检测，展示变更文件让用户确认
2. **全量扫描模式**（`full` 或 `full:<path>`）→ 扫描项目文件，应用排除规则，让用户确认
3. **会话变更模式**（`session`）→ 识别会话变更文件，让用户确认
4. **自动检测**（无范围参数时）→ 按 Git 自动检测优先级尝试，非 Git 项目回退全量扫描

文档域范围确定：

- 指定文档路径 → 使用指定路径
- 未指定路径 + 交互模式 → 搜索 `ae/prds/` 和 `ae/plans/` 中最近修改的文件
- 未指定路径 + 无头模式 → 输出错误，立即终止

如果文档 frontmatter 包含 `sharded: true`，先调用 `ae-doc-extract` 构建分片审查上下文；上下文至少保留 `rootDocument`、`shards`、`missingShards`、`duplicateIds`、`parentMismatch`、`globalRelations` 和 `diagnostics` 语义。

#### 意图发现

- 代码域：结合对话上下文编写 2-3 行意图摘要；检查 `plan:` 参数或自动发现最近计划；`goals:` 参数内容作为审查目标注入子代理上下文
- 文档域：通过分析文档内容判断类型（requirements/plan/test/general）；`goals:` 参数内容作为审查目标注入子代理上下文

#### TaskIntent 输出

```typescript
{
  stage: 'entry',
  intent: '审查意图标签',
  domain: 'code' | 'document',
  constraints: ['排除规则', '模式约束'],
  rawInput: '原始参数',
  timestamp: 'ISO 时间戳'
}
```

### 阶段二：交互（Interact）

确认审查范围和参数，输出 `ConfirmedContext`。

- 交互模式：展示范围、排除规则和审查团队预览，让用户确认或修正
- 无头/自动修复模式：跳过用户确认，直接进入调度

可使用 `ae-review-contract` 工具获取审查团队预览（仅供展示，实际调度由审查域代理决定）。

#### ConfirmedContext 输出

```typescript
{
  stage: 'interact',
  confirmedParams: { 审查范围、文件列表、模式等 },
  exclusions: ['排除的文件和目录'],
  boundaries: ['安全边界和操作限制'],
  timestamp: 'ISO 时间戳'
}
```

### 阶段三：调度（Dispatch）

通过 Task 工具调用审查域代理（`@review-domain`），传入 `DomainCallRequest`。

审查域代理负责：
1. 根据审查域和条件标记选择审查者
2. 并行调度审查专精代理
3. 综合所有审查发现
4. 返回 `DomainExecutionResult`

传入审查域代理的 prompt 必须包含：
- 审查任务描述（含范围、意图、域类型）
- 已确认的参数和约束
- 代码域：文件列表、diff/完整内容、意图摘要
- 文档域：文档内容、文档类型、分片上下文

代码域变量映射：

| 变量 | 值 |
|------|-----|
| `{domain}` | `code` |
| `{intent_summary}` | 阶段一输出 |
| `{file_list}` | 变更文件列表 |
| `{content}` | diff 内容或完整文件内容 |
| `{content_mode_label}` | 增量/全量/会话变更 |
| `{success_criteria}` | `goals:` 参数提供的审查目标文本，无 `goals:` 时为空 |
| `{run_id}` | 运行标识符 |

文档域变量映射：

| 变量 | 值 |
|------|-----|
| `{domain}` | `document` |
| `{document_type}` | requirements/plan/test/general |
| `{document_path}` | 文档路径 |
| `{document_content}` | 完整文本或分片上下文 |
| `{success_criteria}` | `goals:` 参数提供的审查目标文本，无 `goals:` 时为空 |
| `{run_id}` | 运行标识符 |

**错误处理：** 如果域代理返回 `failed` 或 `partial`，使用已完成的结果继续综合。

**标志映射规则：** `goals:` 参数存在时，`ae-review-contract` 的 `has_goal_alignment` 和 `DomainCallRequest.domainContext` 的 `hasGoalAlignment` 必须设为 `true`，以激活 goal-alignment-reviewer。

#### 调度一致性校验

接收 `DomainExecutionResult` 后，检查 `dispatchManifest`：

- 若 `dispatchManifest.dispatched` 数量少于 `selectedSpecialists` 数量，在汇总阶段报告不一致，列出被跳过的专精和跳过原因
- 若 `dispatchManifest` 缺失，跳过校验并记录"无法校验"
- 校验仅为报告性质，不阻断后续流程

#### DispatchResults 输出

```typescript
{
  stage: 'dispatch',
  domainResults: [DomainExecutionResult],
  timestamp: 'ISO 时间戳'
}
```

### 阶段四：汇总（Summary）

接收 `DomainExecutionResult`，格式化为用户可读的审查报告，输出 `Deliverable`。

阅读 `references/synthesis-and-presentation.md` 了解综合流水线（校验、置信度门控、去重、共识提升、残余风险提升、解决分歧、autofix 提升、路由划分、排序）、展示和审查后流程。

#### Deliverable 输出

```typescript
{
  stage: 'summary',
  description: '审查报告描述',
  validationResults: ['验证结果'],
  artifacts: ['审查报告路径'],
  timestamp: 'ISO 时间戳'
}
```

---

## 包含的参考文件

### 范围检测

@./references/scope-detection.md

### 综合与展示

@./references/synthesis-and-presentation.md

### 审查输出模板

@./references/review-output-template.md

### 基准解析脚本

@./references/resolve-base.sh
