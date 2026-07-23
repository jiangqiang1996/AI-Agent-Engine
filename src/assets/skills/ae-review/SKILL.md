---
name: ae:review
description: "通用审查入口。全并行发现 + 合并层修复架构：审查子代理全并行调度只找问题，合并层去重、冲突解决、因果分析后生成修复方案。支持代码、文档、设计、原型、配置、技能、命令、测试用例等单一类型及多类型混合范围。"
argument-hint: "[mode] [scenes=<list>] [targets=<list>] [from=<ref>] [full] [full=<path>] [session] [design=<path>] [goals=<text>] [路径...]"
---

# 通用审查

审查回答**质量如何（HOW WELL）**——代码是否正确、安全、可维护；需求/设计/原型/测试用例/配置/资产是否一致、可行、可追溯、可验证。

---

## 置信度门控（替代硬性不镀金）

审查时对每个潜在发现计算置信度分数：

```
confidence = 0.5 × 需求明确提及 + 0.3 × 工程基线必要性 + 0.2 × 缺失后果严重度
```

| 置信度 | 行为 |
|--------|------|
| ≥ 0.8  | 产出（需求明确提及，正常报告为发现） |
| 0.5-0.8 | INFO 报告"建议补充"（需求未提及但工程上必要），用户决定是否纳入 |
| < 0.5  | 不产出，不报告（纯最佳实践优化） |

### 审查需求文档时
- **仅报告或修复阻断项（P0/P1）** - 完全抑制 P2/P3
- **不检查需求未提及的内容是否"应该有"**
- **新增 INFO 工程建议** - 当检测到"需求未提及但工程上必要"的内容时以 INFO 报告

### 审查设计文档时
- **严格按需求范围审查，禁止无边界镀金**
- **需求没有提及的一律不报告为阻断发现**
- **新增 INFO 工程建议** - 当检测到"需求未提及但工程上必要"的内容时以 INFO 报告

### 通用规则
- **需求是唯一真源** - 审查时以需求文档为准，不引入外部最佳实践作为审查标准
- **"应该有"不构成阻断发现** - 只有"需求已提及但实现不正确/不完整"才构成阻断
- **INFO 不阻断** - INFO 级别发现不阻断流程，仅供用户参考决定

---

## 执行流程

**按以下步骤顺序执行。禁止跳步。**

### 步骤 1：参数解析

解析 `$ARGUMENTS`，提取 mode、范围参数、scenes/targets、goals、design 等。

解析规则（三级策略）：
1. 显式命名：`key=value`、`key:value`、`--key=value` 直接绑定，优先级最高
2. 值特征推断：`autofix`/`report-only`/`headless` → mode
3. 顺序兜底：仅 mode 参与推断，其余参数必须显式命名

**冲突检测**：`from=` / `recent=` / `full` / `full=<path>` / `session` 互斥，同时指定时停止并报错。

→ 进入步骤 2。

### 步骤 2：范围确定与锁定

确定审查范围。这是最关键的步骤——范围确定方式决定后续全部流程。

#### 2a. 检查是否触发无变更全量审查

执行 `git status --porcelain` 和 `git diff --quiet`。

**触发条件**：未显式指定任何范围参数且 `git status --porcelain` 输出为空且 `git diff --quiet` 通过。

**触发时立即执行锁定流程**（不可跳过）：

1. **输出锁定声明**："已锁定全量审查模式，禁止执行 git 历史查询命令"
2. **确定审查范围**：审查范围 = 工作区全部文件 - 排除规则 - `ae/prds/` - `ae/designs/`
3. **进入锁定状态**：本次审查全程**禁止**执行以下命令：
   - `git log`（任何参数）
   - `git diff HEAD~N`（任何 N）
   - `git show HEAD~N:path`（任何 N 和 path）
   - `git diff <ref>..<ref>`（任何 ref 对比）
4. **违反处理**：若已执行上述禁止命令，中止当前操作，丢弃已获取的历史查询结果，回退到全量审查流程

**未触发时**：按 `references/scope-detection.md` 优先级 1-3 检测范围。

#### 2b. 确定范围

| 范围参数 | 行为 |
|---------|------|
| 无参数 + 无变更 | **全量审查**（已锁定，见 2a），reviewMode=full |
| 无参数 + 有变更 | 按 `references/scope-detection.md` 自动检测，reviewMode=changes |
| `from=<ref>` | Git diff 确定范围，reviewMode=changes |
| `recent=<N>` | 审查最近 N 次提交，reviewMode=changes |
| `full` | 全量扫描项目所有文件，reviewMode=full |
| `full=<path>` | 全量扫描指定路径，reviewMode=full |
| `session` | 审查本次会话变更文件，reviewMode=changes |
| 路径参数 | 审查指定文件，reviewMode=changes |

→ 进入步骤 3。

### 步骤 3：调用 ae-review-scope-analyze 工具

调用 `ae-review-scope-analyze` 工具，传入：

| 参数 | 值 |
|------|-----|
| `files` | 步骤 2 确定的审查文件路径列表 |
| `reviewMode` | 步骤 2b 确定的 `changes` 或 `full` |
| `goals` | 用户通过 `goals=<text>` 传入的审查目标（有则透传，无则工具自动从上下文、文件路径、目录结构、设计维度、测试覆盖等多维度推断详细目标） |
| `contextHint` | 上下文提示（如"会话变更"、"全量审查"、"首次提交"等） |
| `worktree` | 当前工作区根目录绝对路径（用于工具内部读取文档内容分析维度） |

工具内部完成全部代理选择逻辑（包括子会话内容分析），直接返回最终代理列表。

工具返回：

| 字段 | 说明 |
|------|------|
| `agents` | 需要调度的审查代理名列表 |
| `tasks` | 每个代理的 prompt 模板 |
| `agentReasons` | 每个代理的激活理由 |
| `reviewFiles` | 实际需要审查的文件列表（排除后） |
| `excludedFiles` | 被排除的文件列表 |
| `goals` | 审查目标（可能为空） |
| `extraPrompt` | 额外审查提示词，用于补充审查范围说明 |
| `stats` | 统计信息（totalFiles、codeFiles、docFiles、excludedFiles、agentCount） |

→ 进入步骤 4。

### 步骤 4：出口检查清单（产出式门禁）

显式输出以下判定证据。**缺少任何一项则禁止继续。**

1. **范围判定证据**：列出确定审查范围的方式，并附 `git status --porcelain` 和 `git diff --quiet` 的实际输出结果
2. **代理选择证据**：列出 `ae-review-scope-analyze` 返回的 agents 清单及 agentReasons
3. **goals 判定证据**：标注 goals 来源（用户显式 / 工具推断 / 无），输出推断结果摘要
4. **排除规则应用证据**：列出 `excludedFiles` 及排除理由
5. **禁止命令自检证据**：确认未执行 git log / diff HEAD~N / show HEAD~N 等历史查询命令

→ 进入步骤 5。

### 步骤 5：交互确认

- **交互模式**：展示范围、排除规则和审查团队预览（来自步骤 3 的 agents + agentReasons），让用户确认或修正
- **无头/自动修复模式**：跳过用户确认，直接进入调度

→ 进入步骤 6。

### 步骤 6：全并行调度

在**同一轮回复**中一次性发出所有 Task 调用。**禁止等上一个 Task 返回后再发出下一个。**

**调度硬约束（不可违反）**：
1. **必须严格按工具返回的 `agents` 列表调度** — 编排层不得自行增减代理。工具返回几个代理就调度几个，不得以"审查对象不涉及该维度"等理由跳过工具返回的代理
2. **禁止自行筛选** — 即使编排层认为某些代理不适用，也必须调度。工具内部已负责代理选择逻辑，编排层的职责是执行而非判断
3. **禁止遗漏** — `agents` 列表中的每个代理都必须发出对应的 Task 调用，实际发出的 Task 数量必须等于 `agents.length`

每个 Task 调用的 prompt 已由工具完整构建，包含：
1. 代理的角色提示词（来自 `tasks[].prompt`）
2. 该代理应审查的文件列表（已嵌入 prompt 中，每个代理只收到与自己职责相关的文件）
3. 审查模式说明（changes/full）
4. 审查目标（`goals`，非空时）

编排层只需将 `tasks[].prompt` 原样传入对应的 Task 调用即可，不需要自行拼接文件列表或提示词。

每个代理只产出 findings，不做修复。所有代理均可交叉读取代码和文档。

→ 进入步骤 7。

### 步骤 7：聚合结果

调用 `ae-specialist-aggregate` 聚合所有代理结果（strategy: union）。

→ 进入步骤 8。

### 步骤 8：出口检查清单（产出式门禁）

显式输出以下调度证据。**缺少任何一项则禁止继续。**

1. **调度完整性证据**：列出步骤 3 返回的 agents 数量和实际发出的 Task 调用数，两者必须相等
2. **并行性证据**：确认所有 Task 调用在同一轮回复中发出
3. **聚合结果证据**：列出 findings 总数和 dispatchManifest 状态

→ 进入步骤 9。

### 步骤 9：汇总与修复

执行合并层修复流程：校验 → 置信度门控 → 合并去重 + 冲突解决 + 因果分析 → 排序 → 高风险零发现对抗复查。详见 `references/synthesis-and-presentation.md`。

**自动修复**（仅 autofix 模式）：按修复方案逐个执行 `suggested_fix`，每个修复后验证是否解决了目标 finding。

→ 进入步骤 10。

### 步骤 10：写入审查证明与状态

调用 `ae-review-proof` 写入结构化审查证明。更新审查状态文件。

---

## 模式规则

| 模式 | 交互 | 自动修复 | 展示 | 产物 |
|------|------|---------|------|------|
| **交互**（默认） | 询问策略决策 | 仅 `auto` | 完整报告 + 选项 | 写入 |
| **自动修复** | 无 | 仅 `auto` | 仅结果摘要 | 写入 |
| **只读** | 无 | 无 | 完整报告 | 无 |
| **无头** | 无 | `auto` + 推荐修复 | 结构化文本 | 写入，返回"审查完成" |

## 排除规则

**始终排除：**
- 敏感文件：`.env`、`.env.*`（保留 `.env.example`、`.env.template`）
- `.opencode/` 目录下的所有文件
- 受保护产物：`ae/reviews/*`、`ae/solutions/*`

**默认排除：**
- `ae/prds/` 下的文件
- `ae/designs/` 下的文件

**"明确指定"条件——满足任一则纳入：**
1. 用户传入的文件路径指向这些目录下的文件
2. 对话中明确提到"审查需求文档"或"审查设计文档"等语义等价表达
3. 用户提供的范围中显式包含 `ae/prds/` 或 `ae/designs/` 路径

## 参数参考

| 标记 | 效果 |
|------|------|
| `scenes=<list>` | 显式覆盖审查场景，逗号分隔 |
| `targets=<list>` | 显式覆盖目标产出物类型，逗号分隔 |
| `mode=autofix` | 自动修复模式 |
| `mode=report-only` | 只读模式 |
| `mode=headless` | 无头模式 |
| `from=<ref>` | 使用 Git diff 确定范围 |
| `recent=<N>` | 审查最近 N 次 Git 提交 |
| `full` | 审查项目中所有文件 |
| `full=<path>` | 审查指定路径下的所有文件 |
| `session` | 审查本次会话中变更的文件 |
| `design=<path>` | 加载设计用于需求验证 |
| `goals=<text>` | 传入审查目标（成功条件列表） |

---

## 包含的参考文件

### 范围检测

@./references/scope-detection.md

### 综合与展示

@./references/synthesis-and-presentation.md

### 审查输出模板

@./references/review-output-template.md

### 代理清单与路由

@./references/persona-catalog.md

@./references/file-routing-table.md

### Finding Schema 与子代理模板

@./references/findings-schema.json

@./references/subagent-template.md

### 基准解析脚本

@./references/resolve-base.sh
