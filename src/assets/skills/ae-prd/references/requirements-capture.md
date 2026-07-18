# 需求捕获

此内容在阶段 3 开始时加载——在协作对话产生了值得保留的持久决策之后。

---

此文档是给 AI 工作流使用的需求数据文档，不是 PRD 汇报材料。只包含规划需要良好执行的内容，跳过对范围没有价值的章节。

需求数据文档用于产品定义和范围控制。**不要**包含实现细节（库、Schema、端点、文件布局），除非需求讨论本身是技术性的且这些细节是决策的主题。

需求文档同时面向人读和 AI 工作流。结构应偏向稳定、显式、可解析：保留固定章节名、稳定 ID、验收条件、范围边界和待定问题分类。文档正文必须自包含，避免依赖额外转换技能；当需求跨越多个模块时，全局上下文、范围和跨模块关系拆分为独立子文件（如 `scope.md`、`decisions.md`），`prd.md` 仅保留索引指向这些子文件。给 AI 的文档不需要干系人、用户画像、背景介绍、业务价值、市场论证或类似汇报型内容，除非这些内容直接改变范围或验收条件。

**非简单工作的必需内容：**
- 问题框架
- 带有稳定 ID 的具体需求或预期行为
- 范围边界
- 成功标准

**在有实质帮助时包含：**
- 关键决策及其理由
- 依赖或假设
- 待定问题
- 考虑过的替代方案

**产物结构：** 需求文档以目录形式产出，所有子文件放于同一个需求目录下：

```
ae/prds/<topic>-YYYY-MM-DD/
├── prd.md                        # 纯索引（< 100 行）
├── problem.md                    # ## 问题框架
├── scope.md                      # ## 范围边界
├── requirements-<module>.md      # ## 需求 > ### 模块（每个模块一个文件）
├── non-functional.md             # ## 非功能需求
├── success-criteria.md           # ## 成功标准
├── decisions.md                  # ## 关键决策
├── dependencies.md               # ## 依赖 / 假设
└── open-questions.md             # ## 待定问题
```

**原生分片产出规则：** 每个 `##` 章节产出一个独立文件。需求章节内按 `###` 子章节（模块）拆分时，每个 `###` 对应一个 `requirements-<module>.md` 文件。`prd.md` 为纯索引，只保留 frontmatter + 索引表，不内联实质内容。

**prd.md 索引文件模板：**

```markdown
---
type: prd
status: drafted
date: YYYY-MM-DD
topic: <kebab-case-topic>
time_scope: [frontend, backend, data, security, ops]
origin: <上游路径，若无则删除此行>
originFingerprint: <上游指纹，若无则删除此行>
format: human-readable-requirements
sharded: true
shards:
  - file: problem.md
    module: problem
  - file: scope.md
    module: scope
  - file: requirements-auth.md
    module: auth
    requirements: [R1, R2, R3, R4, R5]
  - file: success-criteria.md
    module: success-criteria
---

# <主题标题>

## 索引

| 文件 | 章节 | 行数 | 摘要 | 稳定 ID |
|------|------|------|------|---------|
| [problem.md](problem.md) | 问题框架 | 45 | 一句话摘要 | — |
| [scope.md](scope.md) | 范围边界 | 30 | In/Out 摘要 | — |
| [requirements-auth.md](requirements-auth.md) | 用户认证 | 120 | 登录/注册/密码重置 | R1-R5 |
| [success-criteria.md](success-criteria.md) | 成功标准 | 25 | 5 个可验证标准 | — |
```

**章节子文件模板：**

```markdown
---
type: prd-shard
status: drafted
section: "problem"
parent: "prd.md"
module: "problem"
heading_chain: "用户认证系统 > 问题框架"
---

## 问题框架

[当前问题、目标变化、成功判断和必要范围背景]
```

需求子文件按模块命名（如 `requirements-auth.md`），frontmatter 中 `section` 和 `module` 为模块名，`heading_chain` 包含完整路径上下文。

**Frontmatter 字段填写指引：**

| 字段 | 值 | 说明 |
|------|-----|------|
| `type` | `prd` | 固定值，LLM 不需选择 |
| `status` | `drafted` | 默认值，文档通过审查后由后续技能更新为 `review-passed` |
| `date` | `YYYY-MM-DD` | 当前日期 |
| `topic` | `<kebab-case-topic>` | 主题的 kebab-case 形式 |
| `time_scope` | `[frontend, backend, data, security, ops]` | 涉及时段列表，用于触发下游 ae:design 维度自动产出。可选值：`frontend`、`backend`、`data`、`security`、`ops`、`mobile`、`infra` 等；非软件任务省略此字段 |
| `origin` | 上游产物路径 | 仅在有上游产物时填写，否则删除此行。必须使用仓库相对路径 |
| `originFingerprint` | 上游指纹 | 仅在有上游产物时填写，否则删除此行。值为上游产物 `date` + `-` + `topic` 的 kebab-case 拼接；若上游没有 `topic`，则使用 `date` + `-` + `title` |
| `sharded` | `true` | 目录结构下始终为 `true`，`prd.md` 为纯索引文件 |

**章节子文件 frontmatter：**

| 字段 | 值 | 说明 |
|------|-----|------|
| `section` | `<章节名kebab>` | 该文件对应的章节标识 |
| `parent` | `prd.md` | 指向同目录下的索引文件 |
| `heading_chain` | `主题 > 章节 > 子章节` | 完整标题路径，保证单文件可独立理解 |

**分片规则：**

需求文档以目录形式产出，所有子文件放于同一个需求目录下。`prd.md` 为纯索引文件（< 100 行），只保留 frontmatter + 索引表。每个 `##` 章节对应一个独立文件，需求章节内按 `###` 子章节（模块）拆分时每个模块对应一个 `requirements-<module>.md` 文件。

每个子文件 frontmatter 包含 `section`、`parent`（指向 `prd.md`）和 `heading_chain`（完整标题路径），保证单文件可独立理解。子文件只承载本章节内容，不作为恢复、规划或执行入口的顶层产物。

兜底脚本 `enforce-shard-limit.mjs` 在 LLM 产出的极少数文件超标时介入，按 `###` → `####` → 段落空行 → 硬切降级链递归处理，注入 heading chain 保证语义可追溯。

对于**标准**和**深入**需求探索，通常需要一份需求数据文档。

对于**轻量**需求探索，保持文档紧凑。当用户只需要简短对齐时，跳过文档创建。

只要创建需求数据文档，就必须使用稳定 ID（`R1`、`R2`、`R3`），以便规划、审查和 `ae-doc-extract` 可以无歧义地引用。每个需求条目应包含验收条件，使用 `→ 验收:` 语法，让 `ae:design` 可直接提取验收条件而无需推断。

非功能需求使用 `NFR1`、`NFR2` 稳定 ID；关键决策使用 `D1`、`D2` 稳定 ID。待定问题在文本中应显式标注影响的需求 ID 和问题类型，避免后续阶段推断。

当需求跨越多个不同关注点时，在需求部分的加粗主题标题下分组。分组依据是逻辑主题的不同，而非需求数量。需求保留其原始稳定 ID。每个关注点对应一个独立的 `requirements-<module>.md` 文件，放入同一个需求目录下。

当工作简单时，保留固定章节名，但省略没有实质内容的可选章节。简短且结构稳定的需求数据文档好于臃肿的。

在最终确定之前，检查：
- 如果这个需求探索现在结束，`ae:design` 还需要发明什么？
- 是否有任何需求依赖于声称在范围之外的东西？
- 是否有任何未解决的项目实际上是产品决策而非规划问题？
- 是否有不应该出现的实现细节泄漏了进来？
- 是否有不应该出现的汇报型内容泄漏了进来，例如干系人、用户画像、业务价值、市场论证或背景介绍？
- 是否有任何需求声称基础设施不存在而该声明尚未对照代码库验证？
- 是否有一个低成本的变更会使这显著更有用？
- 视觉辅助是否能帮助读者比纯文字更快地理解需求？
- 每个需求条目是否都有明确的验收条件？
- `一致性检查` 中的数量是否与正文一致？
- 是否保留了足够稳定 ID，使 `ae-doc-extract` 可按 ID 或模块提取所需上下文？

如果规划需要发明产品行为、范围边界或成功标准，需求探索还没有完成。

 在写入之前确保 `ae/prds/` 目录存在。需求文档以目录形式产出，目录名为 `<topic>-YYYY-MM-DD`。

如果文档包含待定问题：
- 仅对真正阻塞规划的问题使用 `规划前需解决`
- 当技术问题在规划中更好回答时，将其放在 `推迟到规划` 下
- 显式地向前传递推迟的问题，而不是将它们视为失败

## 视觉辅助

视觉辅助以内容模式为条件，而非以深度分类为条件。

**何时包含：**

| 需求描述的是... | 视觉辅助 | 放置位置 |
|---|---|---|
| 多步骤用户工作流或流程 | Mermaid 流程图（`flowchart`） | 在问题框架之后，或大量流程放在独立的 `## 用户流程` 标题下 |
| 3+ 种行为模式、变体或状态 | Markdown 比较表 | 在需求部分内 |
| 3+ 个交互参与者 | Mermaid 关系图（`graph` 或 `sequenceDiagram`） | 在问题框架之后，或独立的 `## 架构` 标题下 |
| 多个竞争方案 | 比较表 | 在方案探索阶段 |

**何时跳过：**
- 文字已经清晰地传达了概念
- 图表只是以视觉形式重述需求，没有增加理解价值
- 视觉描述的是实现架构、数据 Schema 或代码结构（属于 `ae:design`）

**格式选择：**
- **Mermaid**（默认且优先）用于所有流程图、关系图和时序图——使用 `flowchart TB` 保持窄幅，使用 `sequenceDiagram` 展示交互时序，使用 `graph` 展示参与者关系
- **Markdown 表格**用于模式/变体比较
- Mermaid 无法表达的复杂注释场景可使用 ASCII 制图作为降级方案
- 保持图表与内容成比例
- 在相关位置内联放置
- 仅概念层面——用户流程、信息流、模式比较
- 文字是权威的：视觉辅助与文字不一致时以文字为准
