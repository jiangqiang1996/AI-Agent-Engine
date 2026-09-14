---
name: ae-review
description: "通用审查入口：代码审查、文档审查、设计审查、需求/测试用例/配置审查，支持单一类型及多类型混合范围。全并行发现 + 合并层修复架构：审查子代理全并行只找问题，合并层去重、冲突解决、因果分析后生成修复方案。触发词：审查、代码审查、文档审查、设计审查、review、report-only 只读审查、auto-fix 自动修复。适用：对工作区变更、Git 范围、指定路径或全量文件做质量审查（HOW WELL）并写入审查证明；不适用：执行开发（ae-work）、生成测试（ae-test）、实施修复方案（ae-fix）。"
---

# 通用审查（ae-review）

审查回答**质量如何（HOW WELL）**——代码是否正确、安全、可维护；需求/设计/测试用例/配置/资产是否一致、可行、可追溯、可验证。

调用方式：`/skill:ae-review [mode=...] [范围参数...] [goals=...] [路径...]`。

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

解析用户传入的调用参数，提取 mode、范围参数、goals、design 等。

解析规则（三级策略）：
1. 显式命名：`key=value`、`key:value`、`--key=value` 直接绑定，优先级最高
2. 值特征推断：`autofix`/`report-only`/`headless` → mode
3. 顺序兜底：仅 mode 参与推断，其余参数必须显式命名

**冲突检测**：`from=` / `recent=` / `full` / `full=<path>` / `session` 互斥，同时指定时停止并报错。

→ 进入步骤 2。

### 步骤 2：范围确定与锁定

确定审查范围。这是最关键的步骤——范围确定方式决定后续全部流程。详见 `references/scope-detection.md`。

#### 2a. 检查是否触发无变更全量审查

执行 `git status --porcelain` 和 `git diff --quiet`。

**触发条件**：未显式指定任何范围参数且 `git status --porcelain` 输出为空且 `git diff --quiet` 通过。

**触发时立即执行锁定流程**（不可跳过）：

1. **输出锁定声明**："已锁定全量审查模式，禁止执行 git 历史查询命令"
2. **确定审查范围**：审查范围 = 工作区全部文件 - 排除规则 - `ae/prds/` - `ae/designs/` - `ae/solutions/`
3. **进入锁定状态**：本次审查全程**禁止**执行以下命令：
   - `git log`（任何参数）
   - `git diff HEAD~N`（任何 N）
   - `git show HEAD~N:path`（任何 N 和 path）
   - `git diff <ref>..<ref>`（任何 ref 对比）
4. **违反处理**：若已执行上述禁止命令，中止当前操作，丢弃已获取的历史查询结果，回退到全量审查流程

**未触发时**：按 `references/scope-detection.md` 的优先级检测范围（git status/diff 确定变更文件；`from=<ref>` 时可用 `references/resolve-base.sh` 辅助解析基准）。

#### 2b. 确定范围

| 范围参数 | 行为 |
|---------|------|
| 无参数 + 无变更 | **全量审查**（已锁定，见 2a），reviewMode=full |
| 无参数 + 有变更 | git status/diff 自动检测变更文件，reviewMode=changes |
| `from=<ref>` | Git diff 确定范围，reviewMode=changes |
| `recent=<N>` | 审查最近 N 次提交，reviewMode=changes |
| `full` | 全量扫描项目所有文件，reviewMode=full |
| `full=<path>` | 全量扫描指定路径，reviewMode=full |
| `session` | 审查本次会话变更文件（编排模型依据自身在本会话中的编辑记录列出），reviewMode=changes |
| 路径参数 | 审查指定文件，reviewMode=changes |

→ 进入步骤 3。

### 步骤 3：运行范围分析脚本

`<skill-dir>` 指本技能目录（`ae-omp-plugin/skills/ae-review`）。运行：

```bash
node <skill-dir>/scripts/scope-analyze.mjs \
  --files <逗号分隔相对路径> \
  --mode changes|full \
  [--goals "..."] [--context-hint "..."] [--worktree <abs>]
```

| 参数 | 值 |
|------|-----|
| `--files` | 步骤 2 确定的审查文件路径列表（相对仓库根目录，逗号分隔） |
| `--mode` | 步骤 2b 确定的 `changes` 或 `full` |
| `--goals` | 用户通过 `goals=<text>` 传入的审查目标（有则透传；无则脚本自动从上下文、文件路径、目录结构、设计维度、测试覆盖等多维度推断详细目标） |
| `--context-hint` | 上下文提示（如"会话变更"、"全量审查"、"首次提交"等） |
| `--worktree` | 当前工作区根目录绝对路径 |

脚本 stdout 输出 JSON：

| 字段 | 说明 |
|------|------|
| `agents` | 需要调度的审查代理名列表 |
| `tasks` | 每个代理的任务条目：`{agent, registered, prompt, files}`（`registered:true` 仅 ocr-reviewer） |
| `agentReasons` | 每个代理的激活理由 |
| `reviewFiles` | 实际需要审查的文件列表（排除后） |
| `excludedFiles` | 被排除的文件列表 |
| `goals` | 审查目标（可能为空） |
| `extraPrompt` | 额外审查提示词，用于补充审查范围说明 |
| `contentAnalysisCandidates` | 需编排模型内联判定维度的非设计文档列表（见下） |
| `stats` | 统计信息（totalFiles、codeFiles、docFiles、excludedFiles、agentCount） |

**维度内联补充判定（脚本不含 LLM 分支）**：脚本对 `ae/designs/` 下的设计文档按路径关键词匹配维度；**非设计文档的维度识别由编排模型内联完成**——当 `contentAnalysisCandidates` 非空时，读取这些文档的头部内容（标题、目录、首节），对照 `references/persona-catalog.md` 的激活条件判断是否涉及架构/API/数据模型/UI/测试用例/安全/可观测性/非功能维度，需要时补充激活对应 persona（补一条 agentReasons 证据，说明"编排模型内容分析检测到 <维度> 维度"）。

→ 进入步骤 4。

### 步骤 4：出口检查清单（产出式门禁）

显式输出以下判定证据。**缺少任何一项则禁止继续。**

1. **范围判定证据**：列出确定审查范围的方式，并附 `git status --porcelain` 和 `git diff --quiet` 的实际输出结果
2. **代理选择证据**：列出脚本返回的 agents 清单及 agentReasons（含编排模型内联补充的维度）
3. **goals 判定证据**：标注 goals 来源（用户显式 / 脚本推断 / 无），输出推断结果摘要
4. **排除规则应用证据**：列出 `excludedFiles` 及排除理由
5. **禁止命令自检证据**：确认未执行 git log / diff HEAD~N / show HEAD~N 等历史查询命令

→ 进入步骤 5。

### 步骤 5：交互确认

- **交互模式**：展示范围、排除规则和审查团队预览（来自步骤 3 的 agents + agentReasons），让用户确认或修正
- **auto-fix/无头/report-only 模式**：跳过用户确认，直接进入调度

→ 进入步骤 6。

### 步骤 6：全并行调度

按 `tasks[]` 在**同一轮**一次性派出所有 omp task 子代理（单个 `tasks[]` 批量调用）。**禁止等上一个子代理返回后再派出下一个，禁止分批次。**

**派发规则**：

| tasks[] 条目 | 派发方式 |
|-------------|---------|
| `agent: "ocr-reviewer"`（`registered: true`） | omp task 子代理，`agent: "ocr-reviewer"`（已注册代理），prompt 原样传入 `tasks[].prompt` |
| 其余全部 persona | **通用 task 子代理 + 构建好的 prompt + outputSchema**：prompt 原样传入 `tasks[].prompt`（必要时按 `references/persona-catalog.md` 补充该 persona 的完整检查清单），outputSchema 使用 `references/findings-schema.json` |

**调度硬约束（不可违反）**：
1. **必须严格按脚本返回的 `agents` 列表调度** — 编排层不得自行增减代理（步骤 3 的内联维度补充除外，且必须记录 agentReasons 证据）。脚本返回几个代理就调度几个，不得以"审查对象不涉及该维度"等理由跳过
2. **禁止自行筛选** — 即使编排层认为某些代理不适用，也必须调度。代理选择逻辑已在脚本 + 内联补充判定中完成，调度层的职责是执行而非判断
3. **禁止遗漏** — `agents` 列表中的每个代理都必须派出对应的 omp task 子代理，实际派发数量必须等于 `agents.length`

每个子代理的 prompt 已由脚本完整构建，包含：
1. 代理的角色提示词（来自 `tasks[].prompt`）
2. 该代理应审查的文件列表（已嵌入 prompt 中，每个代理只收到与自己职责相关的文件）
3. 审查模式说明（changes/full）
4. 审查目标（`goals`，非空时）

编排层只需将 `tasks[].prompt` 原样传入对应的 task 子代理即可，不需要自行拼接文件列表或提示词。

**子代理输出契约**（findings schema，详见 `references/findings-schema.json`）：每个发现含 `title`、`severity`（P0-P3）、`domain`（可选）、`location`（代码域 file+line / 文档域 file+section）、`why_it_matters`、`finding_type`、`confidence`、`evidence`（至少 1 项基于实际内容的证据）、`causes`、`caused_by`、`suggested_fix`（可选）。抑制阈值：代码域 0.60、文档域 0.50（0.50+ 的 P0 除外）。子代理只找问题不做修复，不编辑项目文件；未发现问题时返回空 findings 数组。

每个代理只产出 findings，不做修复。所有代理均可交叉读取代码和文档。

→ 进入步骤 7。

### 步骤 7：合并结果（内联合并层）

**无聚合脚本**——由编排模型按 `references/synthesis-rules.md` 的文字规则内联执行合并层：

1. **校验**：按 findings schema 检查每个子代理返回的 JSON，丢弃缺少必填字段的发现
2. **置信度门控**：按域应用抑制阈值与 INFO 分级
3. **指纹去重**：`normalize(file) + normalize(location.type) + normalize(location.line|section) + normalize(title)` 生成指纹，跨代理去重；**同一问题保留最高严重级别和最高置信度**，合并证据；建议方向相反的不合并，转入冲突解决
4. **冲突解决**：同题不同 severity 取最高；方向相反保留双方并标记 conflict
5. **因果分析**：遍历 causes/caused_by 构建依赖图，识别根因发现，标记 auto_resolved_by
6. **排序**：严重级别 → 置信度 → 文件路径 → 行号/章节；根因发现排同级前列
7. **高风险零发现对抗**：高风险信号（security/migration/api）+ 全部代理空 findings + 变更行数 ≥ 50 时，触发对抗式补充审查，结果重新进入合并层

→ 进入步骤 8。

### 步骤 8：出口检查清单（产出式门禁）

显式输出以下调度证据。**缺少任何一项则禁止继续。**

1. **调度完整性证据**：列出步骤 3 返回的 agents 数量和实际派出的 omp task 子代理数，两者必须相等（含内联补充的维度代理）
2. **并行性证据**：确认所有子代理在同一轮批量派出
3. **合并结果证据**：列出 findings 总数、去重合并数、冲突标记数、auto_resolved 链

→ 进入步骤 9。

### 步骤 9：汇总与修复

按 `references/review-output-template.md` 生成完整审查报告（含可解析行，见步骤 10）。修复方案生成与展示规则详见 `references/synthesis-rules.md`。

**自动修复**（仅 auto-fix/无头模式）：按修复方案逐个执行 `suggested_fix`，根因优先；每个修复后验证是否解决了目标 finding。应用前复核每项不触发受保护产物、安全边界或互斥建议。

**对齐校验清单**（可选）：当审查对象涉及"设计对齐需求、源码对齐设计"的交付链路时，按 `references/align-verify-checklist.md` 逐项校验对齐证据。

→ 进入步骤 10。

### 步骤 10：写入审查证明与状态

1. **先采集 git 指纹，再生成报告**：在写 metadata.json 之前执行 `git rev-parse --show-toplevel`、`git rev-parse HEAD`、`git status --porcelain --branch`，并按 `references/review-output-template.md` 的归一规则得到 status_summary 单行值。**审查期间（报告生成后到脚本运行前）不得改动工作树**——否则指纹不一致会被脚本拒绝（这是设计意图，防陈旧报告）。
2. 将步骤 9 的完整审查输出（必须含模板要求的可解析行）原样写入临时文件 `<source-output-file>`。
3. 运行：

```bash
node <skill-dir>/scripts/review-proof.mjs \
  --run-id <id> \
  --status passed|failed \
  --summary "..." \
  --source-output-file <审查输出文件> \
  [--findings-file <json>] [--target-coverage-file <json>] [--repo <abs>]
```

脚本校验链：run-id 白名单（字母/数字/点/下划线/短横线，非 `.`/`..`）；`passed` 时 findings 不得含 P0/P1/P2/critical/high/medium（且报告正文不得出现该级别的阻断发现行）；采集当前 git 指纹（rev-parse HEAD、branch、status --porcelain 汇总，15s 超时）；source-output 解析出的 status/worktree/branch/head/status_summary 必须与当前指纹逐项一致；计算 source 输出 sha256；写入 `ae/reviews/<run-id>/metadata.json`。成功时 stdout 输出 `{ok:true, path, reviewOutputHash, metadata}`（退出码 0）；任何校验失败输出 `{ok:false, reason}`（退出码 1），此时按 reason 修正后重试，禁止手写 metadata.json。

**防伪降级说明**：脚本运行在普通进程中，**不做会话历史防伪校验**（无法核验 source 输出确实出自本会话子代理），防伪强度降级为 **git 指纹一致性校验**——source 输出中的 worktree/branch/head/status_summary 必须与写入时刻的真实仓库状态逐项一致，防止陈旧报告或跨工作区报告冒充本次审查。`--source-output-file` 的内容必须来自本会话真实审查输出（流程约束）；交付门禁的真证据仍是同会话真实子代理输出 + metadata.json 审计件。

`metadata.json` 字段（冻结，ae-work 交付门禁依赖）：`generatedBy:"ae-review"`、`proofKind:"ae-review-proof"`、`reviewRunIdOrMessageRef`、`sourceReviewRef`、`worktree`、`branch`、`head`、`statusSummary`、`reviewStatus`、`hasBlockingFinding`、`targetCoverage?`、`reviewOutputHash`。

---

## 模式规则

| 模式 | 交互 | 自动修复 | 展示 | 产物 |
|------|------|---------|------|------|
| **交互**（默认） | 询问策略决策 | 仅 `auto` | 完整报告 + 选项 | 写入 |
| **auto-fix**（`mode=autofix`） | 无 | 仅 `auto` | 仅结果摘要 | 写入 |
| **report-only**（`mode=report-only`，只读） | 无 | 无 | 完整报告 | 无 |
| **无头**（`mode=headless`） | 无 | `auto` + 推荐修复 | 结构化文本 | 写入，返回"审查完成" |

## auto-fix 模式（快速审查并自动修复）

`mode=autofix` 用于"审查 + 立即修复"的一体化流程（对应原 ae-review-auto 用法）。

### 审查范围默认值

当调用参数中未明确指定审查范围时，按以下优先级确定：

1. **当前会话存在文件变更**：审查当前会话中产生的变更文件（编排模型依据自身编辑记录列出）
2. **当前会话无文件变更，但工作空间存在未提交文件**：审查所有未提交的文件（git status/diff）
3. **其他情况**：按步骤 2 的范围规则由本技能自行决定

### 目的导向审查纪律

1. 针对审查范围内的每一个文件，基于当前会话上下文分析其本次变更的目的
2. 以目的为导向审查：核对目标是否正确实现，是否存在残留文件没有正确修改，并识别当前变更本身是否有必要、是否已经镀金
3. 变更目的本身没有价值时，需区分用户有意为之的变更，深入分析是否为镀金，避免将用户有意决策误判为镀金
4. 修复每一个发现时，时刻反问自己：为什么要这么修复？是否直接服务于已确认的目标？是否引入了目标之外的功能、抽象或灵活性？是否蔓延到无直接因果的代码？任一为"是"且无依据时，收敛范围或仅警示

auto-fix 模式跳过步骤 5 交互确认，其余步骤照常执行；修复在步骤 9 按因果排序应用，随后步骤 10 写入证明。

## 排除规则

**始终排除（脚本强制，不可覆盖）：**
- 敏感文件：`.env`、`.env.*`（保留 `.env.example`、`.env.template`）——在文件收集阶段即移除，后续任何阶段不可读取或引用其内容
- `node_modules/` 目录下的所有文件
- `ae/reviews/`、`ae/handoffs/`、`ae/logs/`、`ae/screenshots/`、`ae/markdown/`、`ae/documents/`、`ae/reports/` 目录下的所有文件

**默认排除（用户显式指定时可纳入）：**
- `ae/prds/` 下的文件
- `ae/designs/` 下的文件
- `ae/solutions/` 下的文件

**"明确指定"条件——满足任一则纳入：**
1. 用户传入的文件路径指向这些目录下的文件
2. 对话中明确提到"审查需求文档"、"审查设计文档"、"审查经验沉淀"等语义等价表达
3. 用户提供的范围中显式包含 `ae/prds/`、`ae/designs/` 或 `ae/solutions/` 路径

## 参数参考

| 标记 | 效果 |
|------|------|
| `mode=autofix` | auto-fix 自动修复模式 |
| `mode=report-only` | 只读模式，仅报告不修复不写产物 |
| `mode=headless` | 无头模式，供其他技能内部调用 |
| `from=<ref>` | 使用 Git diff 确定范围 |
| `recent=<N>` | 审查最近 N 次 Git 提交 |
| `full` | 审查项目中所有文件 |
| `full=<path>` | 审查指定路径下的所有文件 |
| `session` | 审查本次会话中变更的文件 |
| `design=<path>` | 加载设计用于需求验证 |
| `goals=<text>` | 传入审查目标（成功条件列表） |
| 路径参数 | 审查指定文件 |

## 质量门

1. 每个发现都是可操作的
2. 没有因未仔细阅读代码/内容导致的误报
3. 严重级别校准正确
4. 位置信息准确（代码发现：行号；文档发现：章节）
5. 受保护产物得到尊重（丢弃任何建议删除 `ae/prds/`、`ae/designs/`、`ae/solutions/` 中文件的发现）
6. 发现不重复 linter 输出
7. 因果链无环依赖（合并层已保证）

## 禁止事项

- 子代理不得执行修复，只找问题；修复统一由合并层与步骤 9 处理
- 不要重写整个文件/文档来修复一个小问题
- 不要添加用户未讨论过的新功能/新章节
- 不要创建单独的审查文件或添加元数据章节到源文件
- report-only 模式不应用任何修复、不写产物

---

## 包含的参考文件

以下文件位于 `<skill-dir>/references/`，按需读取：

- `scope-detection.md` — 范围检测优先级、范围分类（主要/次要/预存）、非 Git 项目降级
- `synthesis-rules.md` — 合并层文字规则：置信度门控、指纹去重、冲突解决、因果分析、排序、修复方案生成、模式驱动展示
- `review-output-template.md` — 审查输出模板（含步骤 10 依赖的可解析行，必须保留）
- `persona-catalog.md` — 12 个审查 persona 的角色、激活条件与完整检查清单；ocr-reviewer 为已注册代理
- `findings-schema.json` — 子代理统一输出 schema（步骤 6 outputSchema）
- `align-verify-checklist.md` — 对齐校验清单（设计↔需求↔源码↔测试）
- `ocr-cli.md` — 上游 ocr CLI 用法卡（ocr-reviewer 代理与直审场景参考）
- `resolve-base.sh` — 审查基准分支解析脚本（首次运行辅助，输出 `BASE:<sha>`）
