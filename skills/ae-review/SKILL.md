---
name: ae:review
description: "使用分层角色代理、置信度门控和合并去重流水线的结构化代码审查。在创建拉取请求前审查代码变更时使用。"
argument-hint: "[留空则审查当前分支，或提供拉取请求链接]"
---

# 代码审查

使用动态选择的审查角色审查代码变更。并行派发子代理获取结构化 JSON，然后合并去重生成单一报告。

## 何时使用

- 创建拉取请求之前
- 在迭代实现过程中完成任务后
- 需要任何代码变更的反馈时
- 可以独立调用
- 可以在更大工作流中作为只读或自动修复审查步骤运行

## 参数解析

解析`$ARGUMENTS`中的以下可选标记。剥离每个识别到的标记，然后将剩余部分解释为拉取请求编号、GitHub URL或分支名称。

| 标记 | 示例 | 效果 |
|-------|---------|--------|
| `mode:autofix` | `mode:autofix` | 选择自动修复模式（见下方模式检测） |
| `mode:report-only` | `mode:report-only` | 选择只读模式 |
| `mode:headless` | `mode:headless` | 选择程序调用的无头模式（见下方模式检测） |
| `base:<sha-or-ref>` | `base:abc1234` 或 `base:origin/main` | 跳过范围检测 —— 直接使用提供的值作为差异基准 |
| `plan:<path>` | `plan:docs/plans/2026-03-25-001-feat-foo-plan.md` | 加载此计划用于需求验证 |

所有标记都是可选的。每个存在的标记意味着需要推断的内容更少。如果不存在，则回退到该阶段的现有行为。

**冲突的模式标记：** 如果参数中出现多个模式标记，请停止并且不要派单代理。如果`mode:headless`是冲突标记之一，则输出无头错误包：`审查失败（无头模式）。原因：模式标记冲突——<mode_a> 与 <mode_b> 无法组合使用。`否则输出通用格式：`审查失败。原因：模式标记冲突——<mode_a> 与 <mode_b> 无法组合使用。`

## 模式检测

| 模式 | 触发时机 | 行为 |
|------|------|----------|
| **交互模式**（默认） | 无模式标记存在 | 审查、自动应用安全自动修复、展示发现结果、询问关于门控发现和手动发现的策略决策，并可选地继续进入修复/推送/拉取请求下一步 |
| **自动修复模式** | 参数中有`mode:autofix` | 无用户交互。审查、仅应用策略允许的`safe_auto`修复、在有限轮次中重新审查、写入运行产物，并在需要时输出剩余下游工作 |
| **只读模式** | 参数中有`mode:report-only` | 严格只读。仅审查和报告，然后停止，不进行编辑、生成产物、创建待办、提交、推送或拉取请求操作 |
| **无头模式** | 参数中有`mode:headless` | 技能间调用的程序模式。静默应用`safe_auto`修复（单轮）、将所有其他发现结果作为结构化文本输出、写入运行产物、跳过待办创建、返回"审查完成"信号。无交互提示。 |

### 自动修复模式规则

- **跳过所有用户询问。** 一旦确定范围，永远不要暂停请求批准或澄清。
- **仅应用`safe_auto -> review-fixer`发现结果。** 保留`gated_auto`、`manual`、`human`和`release`工作未解决。
- **在`.context/ae/ae-review/<run-id>/`下写入运行产物**，总结发现结果、已应用修复、剩余可操作工作和建议输出。
- **仅为所有者为 `downstream-resolver` 的未解决可操作发现结果创建持久待办文件。** 使用创建待办文件功能获取规范目录路径、命名约定、YAML前置元数据结构和模板。每个待办应将发现结果的严重级别映射到待办优先级（`P0`/`P1` → `p1`、`P2` → `p2`、`P3` → `p3`），并设置`status: ready`，因为这些发现结果已经过合成阶段的分类。
- **永远不要从自动修复模式提交、推送或创建拉取请求。** 父工作流负责这些决策。

### 只读模式规则

- **跳过所有用户询问。** 如果差异元数据很少，请保守推断意图。
- **永远不要编辑文件或外化工作。** 不要写入`.context/ae/ae-review/<run-id>/`，不要创建待办文件，不要提交、推送或创建拉取请求。
- **适合并行只读验证。** `mode:report-only`是唯一可以在同一工作副本上与浏览器测试并行运行的模式。
- **不要切换共享工作副本。** 如果调用方传递了显式拉取请求或分支目标，`mode:report-only`必须在隔离的工作副本/工作树中运行，或者停止，而不是运行`gh pr checkout` / `git checkout`。
- **不要在同一工作副本上同时运行可变审查和浏览器测试。** 如果未来的编排器需要修复，请在浏览器测试之后运行可变审查阶段，或者在隔离的工作副本/工作树中运行。

### 无头模式规则

- **跳过所有用户询问。** 永远不要使用平台的 `question` 工具（opencode 的提问工具）或其他交互式提示。如果差异元数据很少，请保守推断意图。
- **需要可确定的差异范围。** 如果无头模式无法确定差异范围（无需用户交互即可确定的分支、拉取请求或`base:`引用），则输出`审查失败（无头模式）。原因：未检测到差异范围。使用分支名称、拉取请求编号或 base:<ref> 重新调用。`并且不派单代理直接停止。
- **仅在单轮中应用`safe_auto -> review-fixer`发现结果。** 无限制的重新审查轮次。保留`gated_auto`、`manual`、`human`和`release`工作未解决，并在结构化输出中返回它们。
- **将所有非自动发现结果作为结构化文本输出。** 使用无头输出包格式（见下方第6阶段），保留每个发现结果的严重级别、autofix_class、所有者、requires_verification、置信度、pre_existing和suggested_fix。从磁盘上的每个代理产物文件中补充详细级别的字段（why_it_matters、evidence[]）（见第6阶段的详细信息丰富）。
- **在`.context/ae/ae-review/<run-id>/`下写入运行产物**，总结发现结果、已应用修复和建议输出。在结构化输出中包含产物路径。
- **不要创建待办文件。** 调用方接收结构化发现结果并自行路由下游工作。
- **不要切换共享工作副本。** 如果调用方传递了显式拉取请求或分支目标，`mode:headless`必须在隔离的工作副本/工作树中运行，或者停止，而不是运行`gh pr checkout` / `git checkout`。停止时输出`审查失败（无头模式）。原因：无法切换共享工作副本。使用 base:<ref> 重新调用以审查当前工作副本，或从隔离工作树运行。`
- **在共享工作副本上不适合并发使用。** 与`mode:report-only`不同，无头模式会修改文件（应用`safe_auto`修复）。调用方不得在同一工作副本上与其他可变操作同时运行无头模式。
- **永远不要从无头模式提交、推送或创建拉取请求。** 调用方负责这些决策。
- **以"审查完成"作为终端信号结束**，以便调用方可以检测完成。如果所有审查角色失败或超时，则输出`代码审查降级（无头模式）。原因：N 个审查角色中有 0 个返回结果。`后跟"审查完成"。

## 严重级别

所有审查者使用P0-P3：

| 级别 | 含义 | 动作 |
|-------|---------|--------|
| **P0** | 严重故障、可利用漏洞、数据丢失/损坏 | 合并前必须修复 |
| **P1** | 正常使用中可能遇到的高影响缺陷、违反契约 | 应该修复 |
| **P2** | 有明显负面影响的中等问题（边界情况、性能回归、可维护性陷阱） | 如果简单则修复 |
| **P3** | 低影响、范围窄、小改进 | 用户自行决定 |

## 动作路由

严重级别回答**紧迫性**。路由回答**下一步谁行动**以及**此技能是否可以修改工作副本**。

| `autofix_class` | 默认所有者 | 含义 |
|-----------------|---------------|---------|
| `safe_auto` | `review-fixer` | 当当前模式允许修改时，适合技能内修复器的本地确定性修复 |
| `gated_auto` | `downstream-resolver` 或 `human` | 存在具体修复方案，但会改变行为、契约、权限或其他敏感边界，默认情况下不应自动应用 |
| `manual` | `downstream-resolver` 或 `human` | 应移交而不是在技能内修复的可操作工作 |
| `advisory` | `human` 或 `release` | 只读输出，如经验教训、发布说明或剩余风险 |

路由规则：
- **合成阶段拥有最终路由权。** 角色提供的路由元数据是输入，不是最终决定。
- **出现分歧时选择更保守的路由。** 合并后的发现结果可以从`safe_auto`变为`gated_auto`或`manual`，但没有更强证据时不得反向变化。
- **只有`safe_auto -> review-fixer`会自动进入技能内修复队列。**
- **`requires_verification: true`表示修复未完成，需要针对性测试、重点重新审查或操作验证。**

## 审查者

分层条件审查角色，查看下方包含的角色目录以获取完整清单。

**固定审查者（每次审查都包含）：**

| 代理 | 关注点 |
|-------|-------|
| `correctness-reviewer` | 逻辑错误、边界情况、状态错误、错误传播 |
| `testing-reviewer` | 覆盖率缺口、弱断言、脆弱测试 |
| `maintainability-reviewer` | 耦合、复杂度、命名、死代码、抽象债务 |
| `project-standards-reviewer` | AGENTS.md合规 -- 前置元数据、引用、命名、可移植性 |
| `agent-native-reviewer` | 验证新功能可被代理访问 |

**跨领域条件审查者（根据差异选择）：**

| 代理 | 当差异涉及以下内容时选择 |
|-------|---------------------------|
| `security-reviewer` | 认证、公共端点、用户输入、权限 |
| `performance-reviewer` | 数据库查询、数据转换、缓存、异步操作 |
| `api-contract-reviewer` | 路由、序列化器、类型签名、版本控制 |
| `data-migrations-reviewer` | 迁移、模式变更、回填 |
| `reliability-reviewer` | 错误处理、重试、超时、后台作业 |
| `adversarial-reviewer` | 差异>=50行非测试/非生成/非锁文件变更，或认证、支付、数据变更、外部API |
| `cli-readiness-reviewer` | CLI命令定义、参数解析、CLI框架使用、命令处理程序实现 |
| `previous-comments-reviewer` | 审查已有审查评论或讨论的拉取请求 |

**栈特定条件审查者（根据差异选择）：**

| 代理 | 当差异涉及以下内容时选择 |
|-------|---------------------------|
| `kieran-python-reviewer` | Python模块、端点、脚本或服务 |
| `kieran-typescript-reviewer` | TypeScript组件、服务、钩子、工具函数或共享类型 |

## 审查范围

每次审查会生成所有5个固定角色，然后添加适合差异的跨领域和栈特定条件角色。模型会自动调整规模：小的配置变更不触发条件角色，共 5 个审查角色。

## 受保护产物

以下路径是AE流水线产物，任何审查者都不得标记为删除、移除或加入gitignore：

- `docs/brainstorms/*` -- 由ae:brainstorm创建的需求文档
- `docs/plans/*.md` -- 由ae:plan创建的计划文件（带有进度复选框的活文档）
- `docs/solutions/*.md` -- 在流水线过程中创建的解决方案文档

如果审查者标记这些目录中的任何文件进行清理或移除，请在合成阶段丢弃该发现结果。

## 如何运行

### 第1阶段：确定范围

计算差异范围、文件列表和差异。通过将命令尽可能合并来减少权限提示。

**如果提供了`base:`参数（快速路径）：**

调用方已经知道差异基准。跳过所有基准分支检测、远程解析和合并基础计算。直接使用提供的值：

```
BASE_ARG="{base_arg}"
BASE=$(git merge-base HEAD "$BASE_ARG" 2>/dev/null) || BASE="$BASE_ARG"
```

然后生成与其他路径相同的输出：

```
echo "BASE:$BASE" && echo "FILES:" && git diff --name-only $BASE && echo "DIFF:" && git diff -U10 $BASE && echo "UNTRACKED:" && git ls-files --others --exclude-standard
```

此路径适用于任何引用 —— SHA、`origin/main`、分支名称。自动调用方（ae:work、lfg、slfg）应优先使用此路径以避免检测开销。**不要将`base:`与拉取请求编号或分支目标结合使用。** 如果同时存在，请停止并报错：`不能将 base: 与拉取请求编号或分支目标一起使用 —— base: 表示当前工作副本已经是正确的分支。单独传递 base:，或单独传递目标，让范围检测解析基准。`这避免了差异基准来自一个来源而代码和元数据来自另一个来源的范围/意图不匹配。

**如果参数中提供了PR编号或GitHub URL：**

如果`mode:report-only`或`mode:headless`处于活动状态，**不要**在共享工作副本上运行`gh pr checkout <编号或URL>`。对于`mode:report-only`，告诉调用方：`mode:report-only 无法切换共享工作副本以审查拉取请求目标。在该拉取请求的隔离工作树/工作副本中运行，或在已检出分支上不带目标参数运行只读模式。`对于`mode:headless`，输出`审查失败（无头模式）。原因：无法切换共享工作副本。使用base:<ref>重新调用以审查当前工作副本，或从隔离工作树运行。`除非审查已经在隔离的工作副本中运行，否则在此处停止。

首先，在切换分支前验证工作树是干净的：

```
git status --porcelain
```

如果输出非空，请告知用户：`当前分支上有未提交的变更。在审查拉取请求之前请暂存或提交它们，或使用独立模式（无参数）按原样审查当前分支。`在工作树干净之前不要继续检出。

然后检出PR分支，以便角色代理可以读取实际代码（而不是当前工作副本）：

```
gh pr checkout <number-or-url>
```

然后获取PR元数据。捕获基准分支名称和PR基准仓库标识，而不仅仅是分支名称：

```
gh pr view <number-or-url> --json title,body,baseRefName,headRefName,url
```

使用返回的PR URL中的仓库部分作为`<base-repo>`（例如，从`https://github.com/your-org/your-repo/pull/123`获取`your-org/your-repo`）。

然后计算与PR基准分支的本地差异，以便重新审查也包含本地修复提交和未编辑的变更。替换元数据中的PR基准分支（此处显示为`<base>`）和从PR URL派生的PR基准仓库标识（此处显示为`<base-repo>`）。从PR的实际基准仓库解析基准引用，而不是假设`origin`指向该仓库：

```
PR_BASE_REMOTE=$(git remote -v | awk 'index($2, "github.com:<base-repo>") || index($2, "github.com/<base-repo>") {print $1; exit}')
if [ -n "$PR_BASE_REMOTE" ]; then PR_BASE_REMOTE_REF="$PR_BASE_REMOTE/<base>"; else PR_BASE_REMOTE_REF=""; fi
PR_BASE_REF=$(git rev-parse --verify "$PR_BASE_REMOTE_REF" 2>/dev/null || git rev-parse --verify <base> 2>/dev/null || true)
if [ -z "$PR_BASE_REF" ]; then
  if [ -n "$PR_BASE_REMOTE_REF" ]; then
    git fetch --no-tags "$PR_BASE_REMOTE" <base>:refs/remotes/"$PR_BASE_REMOTE"/<base> 2>/dev/null || git fetch --no-tags "$PR_BASE_REMOTE" <base> 2>/dev/null || true
    PR_BASE_REF=$(git rev-parse --verify "$PR_BASE_REMOTE_REF" 2>/dev/null || git rev-parse --verify <base> 2>/dev/null || true)
  else
    if git fetch --no-tags https://github.com/<base-repo>.git <base> 2>/dev/null; then
      PR_BASE_REF=$(git rev-parse --verify FETCH_HEAD 2>/dev/null || true)
    fi
    if [ -z "$PR_BASE_REF" ]; then PR_BASE_REF=$(git rev-parse --verify <base> 2>/dev/null || true); fi
  fi
fi
if [ -n "$PR_BASE_REF" ]; then BASE=$(git merge-base HEAD "$PR_BASE_REF" 2>/dev/null) || BASE=""; else BASE=""; fi
```

```
if [ -n "$BASE" ]; then echo "BASE:$BASE" && echo "FILES:" && git diff --name-only $BASE && echo "DIFF:" && git diff -U10 $BASE && echo "UNTRACKED:" && git ls-files --others --exclude-standard; else echo "ERROR: Unable to resolve PR base branch <base> locally. Fetch the base branch and rerun so the review scope stays aligned with the PR."; fi
```

从`gh pr view`中提取PR标题/正文、基准分支和PR URL，然后从本地命令中提取基准标记、文件列表、差异内容和`UNTRACKED:`列表。检出后不要使用`gh pr diff`作为审查范围 —— 它仅反映远程PR状态，在推送之前会遗漏本地修复提交。如果尝试获取后仍无法从PR的实际基准仓库解析基准引用，请停止而不是回退到`git diff HEAD`；没有PR基准分支的PR审查是不完整的。

**如果参数中提供了分支名称：**

检出指定分支，然后将其与基准分支进行差异比较。替换提供的分支名称（此处显示为`<branch>`）。

如果`mode:report-only`或`mode:headless`处于活动状态，**不要**在共享工作副本上运行`git checkout <branch>`。对于`mode:report-only`，告诉调用方：`mode:report-only 无法切换共享工作副本以审查其他分支。在`<branch>`的隔离工作树/工作副本中运行，或不带目标参数在当前工作副本上运行只读模式。`对于`mode:headless`，输出`审查失败（无头模式）。原因：无法切换共享工作副本。使用base:<ref>重新调用以审查当前工作副本，或从隔离工作树运行。`除非审查已经在隔离的工作副本中运行，否则在此处停止。

首先，在切换分支前验证工作树是干净的：

```
git status --porcelain
```

如果输出非空，请告知用户：`当前分支上有未提交的变更。在审查其他分支之前请暂存或提交它们，或提供拉取请求编号代替。`在工作树干净之前不要继续检出。

```
git checkout <branch>
```

然后检测审查基准分支并计算合并基础。运行`references/resolve-base.sh`脚本，它处理支持fork的远程解析和多回退检测（PR元数据 → `origin/HEAD` → `gh repo view` → 常见分支名称）：

```
RESOLVE_OUT=$(bash references/resolve-base.sh) || { echo "ERROR: resolve-base.sh failed"; exit 1; }
if [ -z "$RESOLVE_OUT" ] || echo "$RESOLVE_OUT" | grep -q '^ERROR:'; then echo "${RESOLVE_OUT:-ERROR: resolve-base.sh produced no output}"; exit 1; fi
BASE=$(echo "$RESOLVE_OUT" | sed 's/^BASE://')
```

如果脚本输出错误，请停止而不是回退到`git diff HEAD`；没有基准分支的分支审查只会显示未提交的变更，并会静默遗漏分支上的所有已提交工作。

成功后生成差异：

```
echo "BASE:$BASE" && echo "FILES:" && git diff --name-only $BASE && echo "DIFF:" && git diff -U10 $BASE && echo "UNTRACKED:" && git ls-files --others --exclude-standard
```

你仍然可以使用`gh pr view`获取额外的拉取请求元数据，包括标题、正文和关联的问题，但如果没有PR存在也不要失败。

**如果没有参数（当前分支独立模式）：**

使用与分支模式相同的`references/resolve-base.sh`脚本检测审查基准分支并计算合并基础：

```
RESOLVE_OUT=$(bash references/resolve-base.sh) || { echo "ERROR: resolve-base.sh failed"; exit 1; }
if [ -z "$RESOLVE_OUT" ] || echo "$RESOLVE_OUT" | grep -q '^ERROR:'; then echo "${RESOLVE_OUT:-ERROR: resolve-base.sh produced no output}"; exit 1; fi
BASE=$(echo "$RESOLVE_OUT" | sed 's/^BASE://')
```

如果脚本输出错误，请停止而不是回退到`git diff HEAD`；没有基准分支的独立审查只会显示未提交的变更，并会静默遗漏分支上的所有已提交工作。

成功后生成差异：

```
echo "BASE:$BASE" && echo "FILES:" && git diff --name-only $BASE && echo "DIFF:" && git diff -U10 $BASE && echo "UNTRACKED:" && git ls-files --others --exclude-standard
```

使用`git diff $BASE`（不带`..HEAD`）将合并基础与工作树进行差异比较，其中包含已提交、暂存和未暂存的变更。

**未跟踪文件处理：** 始终检查`UNTRACKED:`列表，即使`FILES:`/`DIFF:`非空。未跟踪文件在暂存前不在审查范围内。如果列表非空，请告知用户哪些文件被排除。如果其中任何文件需要审查，请停止并告知用户先执行`git add`然后重新运行。只有当用户故意仅审查跟踪变更时才继续。在`mode:headless`或`mode:autofix`中，不要停下来询问 —— 仅继续审查跟踪变更，并在输出的覆盖范围部分注明排除的未跟踪文件。

### 第2阶段：意图发现

了解变更试图实现的目标。意图来源取决于采用的第1阶段路径：

**PR/URL模式：** 使用`gh pr view`元数据中的PR标题、正文和关联问题。如果正文内容较少，可以使用PR的提交消息补充。

**分支模式：** 使用第1阶段解析的合并基础运行`git log --oneline ${BASE}..<branch>`。

**独立模式（当前分支）：** 运行：

```
echo "BRANCH:" && git rev-parse --abbrev-ref HEAD && echo "COMMITS:" && git log --oneline ${BASE}..HEAD
```

结合对话上下文（计划部分摘要、PR描述），编写2-3行的意图摘要：

```
意图：通过替换多层速率查找简化计税。不得免税处理中的边界情况回归。
```

将此传递给每个审查者的生成提示中。意图影响**每个审查者的审查严格程度**，而不是选择哪些审查者。

**当意图不明确时：**
- **交互模式：** 使用平台的交互式question工具询问一个问题：`这些变更的主要目标是什么？`在确定意图之前不要生成审查者。
- **自动修复/只读/无头模式：** 从分支名称、差异、PR元数据和调用方上下文中保守推断意图。在覆盖范围或结论推理中注明不确定性，而不是阻塞。

### 第2b阶段：计划发现（需求验证）

定位计划文档，以便第6阶段可以验证需求完整性。按优先级检查以下来源 —— 找到第一个匹配项即停止：

1. **`plan:`参数。** 如果调用方传递了计划路径，请直接使用。读取文件确认其存在。
2. **PR正文。** 如果在第1阶段获取了PR元数据，请扫描正文以查找匹配`docs/plans/*.md`的路径。如果恰好找到一个匹配项且文件存在，则将其用作`plan_source: explicit`。如果出现多个计划路径，则视为不明确 —— 降级为`plan_source: inferred`，用于磁盘上存在的最新匹配项，如果不存在或没有与PR标题/意图明确相关的匹配项则跳过。在使用之前始终验证所选文件存在 —— PR描述中过时或复制的计划链接很常见。
3. **自动发现。** 从分支名称中提取2-3个关键词（例如，`feat/onboarding-skill` → `onboarding`、`skill`）。使用glob匹配`docs/plans/*`并过滤包含这些关键词的文件名。如果恰好找到一个匹配项，则使用它。如果有多个匹配项或匹配看起来不明确（例如，可能匹配许多计划的通用关键词如`review`、`fix`、`update`），**跳过自动发现** —— 错误的计划比没有计划更糟糕。如果没有匹配项，则跳过。

**置信度标记：** 记录计划的发现方式：
- `plan:`参数 → `plan_source: explicit`（高置信度）
- 单个明确的PR正文匹配 → `plan_source: explicit`（高置信度）
- 多个/不明确的PR正文匹配 → `plan_source: inferred`（较低置信度）
- 自动发现单个明确匹配 → `plan_source: inferred`（较低置信度）

如果找到计划，请读取其**需求跟踪**（R1、R2等）和**实现单元**（复选框项）。存储提取的需求列表和`plan_source`供第6阶段使用。如果没有找到计划，不要阻塞审查 —— 需求验证是附加的，不是必需的。

### 第3阶段：选择审查者

读取第1阶段的差异和文件列表。5个固定角色是自动包含的。对于下面角色目录中的每个跨领域和栈特定条件角色，决定差异是否需要该角色。这是代理判断，不是关键词匹配。

**条件选择的文件类型感知：** 指令散文文件（Markdown技能定义、JSON模式、配置文件）是产品代码，但不会从运行时导向的审查者中受益。对抗性审查者的技术（竞争条件、级联故障、滥用案例）针对可执行代码行为。对于仅更改指令散文文件的差异，除非散文描述了认证、支付或数据变更行为，否则跳过对抗性审查者。仅计算可执行代码行数以符合行数阈值。

**`previous-comments`仅适用于拉取请求。** 仅当第1阶段收集了拉取请求元数据（参数中提供了拉取请求编号或URL，或`gh pr view`为当前分支返回了元数据）时才选择此角色。对于没有关联拉取请求的独立分支审查，请完全跳过它 —— 没有先前的评论需要检查。

栈特定角色是累加的。TypeScript API差异可能需要`kieran-typescript`加上`api-contract`和`reliability`。

在生成之前公布团队：

```
审查团队：
- correctness（固定）
- testing（固定）
- maintainability（固定）
- project-standards（固定）
- agent-native-reviewer（固定）
- security -- routes.rb中的新端点接受用户提供的重定向URL
- data-migrations -- 添加了迁移2026-03-03_add_index_to_orders
```

这是进度报告，不是阻塞确认。

### 第3b阶段：发现项目标准路径

在生成子代理之前，为`project-standards`角色查找所有相关标准文件的文件路径（不是内容）。使用原生文件搜索/glob工具定位：

1. 使用原生文件搜索工具（例如opencode中的Glob）查找仓库中的所有`**/AGENTS.md`。
2. 过滤出目录是至少一个变更文件的祖先路径的文件。标准文件管理其下的所有文件（例如，`.opencode/rules/core/AGENTS.md`适用于`.opencode/rules/core/`下的所有内容）。

将生成的路径列表在审查上下文中的`<standards-paths>`块内传递给`project-standards`角色（见第4阶段）。角色自行读取文件，仅定位与变更文件类型相关的部分。这使编排器的工作成本很低（仅路径发现），并避免用审查者可能不完全需要的内容膨胀子代理提示。

### 第4阶段：生成子代理

#### 模型分层

角色子代理执行聚焦的、限定范围的工作，应使用快速的中层模型来降低成本和延迟，同时不牺牲审查质量。编排器本身保持在默认（最强大）模型上。

对所有角色子代理使用平台的中层模型。在opencode中，在Task工具调用中传递`model: "sonnet"`。在其他平台上，使用等效的中层模型。如果平台没有模型覆盖机制或可用模型名称未知，请省略模型参数，让代理继承默认值 —— 在父模型上运行的有效审查比无法识别的模型名称导致的分派失败更好。

#### 运行ID

在分派任何代理之前生成唯一的运行标识符。此ID将所有代理产物文件和审查后运行产物限定在同一目录中。

```bash
RUN_ID=$(date +%Y%m%d-%H%M%S)-$(head -c4 /dev/urandom | od -An -tx1 | tr -d ' ')
mkdir -p ".context/ae/ae-review/$RUN_ID"
```

将`{run_id}`传递给每个角色子代理，以便它们可以将完整分析写入`.context/ae/ae-review/{run_id}/{reviewer_name}.json`。

**只读模式：** 跳过运行ID生成和目录创建。不要向代理传递`{run_id}`。代理仅返回紧凑JSON，不写入文件，符合只读模式的无写入约定。

#### 生成

派单子代理时省略`mode`参数，以便应用用户配置的权限设置。不要传递`mode: "auto"`。

使用下方包含的子代理模板将每个选定的角色审查者作为并行子代理生成。每个角色子代理接收：

1. 其角色文件内容（身份、失败模式、校准、抑制条件）
2. 下方差异范围参考中的共享差异范围规则
3. 下方发现结果模式中的JSON输出契约
4. PR元数据：审查PR时的标题、正文和URL（否则为空字符串）。在`<pr-context>`块中传递，以便审查者可以对照声明的意图验证代码
5. 审查上下文：意图摘要、文件列表、差异
6. 产物文件路径的运行ID和审查者名称
7. **仅适用于`project-standards`：** 第3b阶段的标准文件路径列表，包装在附加到审查上下文的`<standards-paths>`块中

角色子代理相对于项目是**只读**的：它们审查并返回结构化JSON。它们不编辑项目文件或提出重构建议。唯一允许的写入是将完整分析保存到输出契约中指定的`.context/`产物路径。

这里的只读意味着**不可变**，而不是"没有shell访问权限"。审查子代理在需要收集证据或验证范围时可以使用非可变检查命令，包括面向读取的`git` / `gh`使用，例如`git diff`、`git show`、`git blame`、`git log`和`gh pr view`。它们不得编辑项目文件、更改分支、提交、推送、创建PR或以其他方式修改工作副本或仓库状态。

每个角色子代理将完整JSON（所有模式字段）写入`.context/ae/ae-review/{run_id}/{reviewer_name}.json`，并仅返回包含合并层级字段的紧凑JSON：

```json
{
  "reviewer": "security",
  "findings": [
    {
      "title": "User-supplied ID in account lookup without ownership check",
      "severity": "P0",
      "file": "orders_controller.rb",
      "line": 42,
      "confidence": 0.92,
      "autofix_class": "gated_auto",
      "owner": "downstream-resolver",
      "requires_verification": true,
      "pre_existing": false,
      "suggested_fix": "Add current_user.owns?(account) guard before lookup"
    }
  ],
  "residual_risks": [...],
  "testing_gaps": [...]
}
```

详细层级字段（`why_it_matters`、`evidence`）仅存在于产物文件中。`suggested_fix`在两个层级中都是可选的 —— 存在时包含在紧凑返回中，以便编排器具有自动应用决策的修复上下文。如果文件写入失败，紧凑返回仍然提供合并所需的所有内容。

### 第5阶段：合并发现结果

将多个审查者的紧凑JSON返回转换为一个去重的、置信度门控的发现结果集。紧凑返回包含合并层级字段（标题、严重级别、文件、行、置信度、autofix_class、所有者、requires_verification、pre_existing）加上可选的suggested_fix。详细层级字段（why_it_matters、evidence）存储在磁盘上的每个代理产物文件中，此阶段不加载。

1. **验证。** 检查每个紧凑返回的必需顶层字段和每个发现结果字段，以及值约束。丢弃格式错误的返回或发现结果。记录丢弃计数。
   - **顶层必需：** reviewer（字符串）、findings（数组）、residual_risks（数组）、testing_gaps（数组）。如果任何字段缺失或类型错误，则丢弃整个返回。
   - **每个发现结果必需：** title、severity、file、line、confidence、autofix_class、owner、requires_verification、pre_existing
   - **值约束：**
     - severity: P0 | P1 | P2 | P3
     - autofix_class: safe_auto | gated_auto | manual | advisory
     - owner: review-fixer | downstream-resolver | human | release
     - confidence: 数值，0.0-1.0
     - line: 正整数
     - pre_existing、requires_verification: 布尔值
   - 此处不要对照完整模式验证 —— 完整模式（包括why_it_matters和evidence）适用于磁盘上的产物文件，而不是紧凑返回。
2. **置信度门控。** 抑制置信度低于0.60的发现结果。例外：置信度0.50+的P0发现结果通过门控 —— 关键但不确定的问题不得静默丢弃。记录抑制计数。这符合角色指令和模式的置信度阈值。
3. **去重。** 计算指纹：`normalize(file) + line_bucket(line, +/-3) + normalize(title)`。当指纹匹配时合并：保留最高严重级别、保留最高置信度、记录哪些审查者标记了它。
4. **跨审查者一致。** 当2个以上独立审查者标记相同问题（相同指纹）时，将合并后的置信度提高0.10（上限为1.0）。跨审查者的一致意见是强信号——独立审查者收敛到相同问题比任何单个审查者的置信度更可靠。在输出的审查者列中注明一致性（例如，"security, correctness"）。
5. **分离预先存在的问题。** 将`pre_existing: true`的发现结果提取到单独的列表中。
6. **解决分歧。** 当审查者标记相同代码区域但在严重级别、autofix_class或所有者上存在分歧时，在审查者列中注明分歧（例如，"security (P0), correctness (P1) -- 保留P0"）。这种透明度帮助用户理解发现结果如此路由的原因。
7. **规范化路由。** 对于每个合并后的发现结果，设置最终的`autofix_class`、`owner`和`requires_verification`。如果审查者存在分歧，保留最保守的路由。合成阶段可以将发现结果从`safe_auto`缩小到`gated_auto`或`manual`，但没有新证据不得扩大。
8. **划分工作。** 构建三个集合：
   - 技能内修复队列：仅`safe_auto -> review-fixer`
   - 剩余可操作队列：未解决的`gated_auto`或`manual`发现结果，其所有者是`downstream-resolver`
   - 只读队列：`advisory`发现结果加上任何所有者为`human`或`release`的输出
9. **排序。** 按严重级别（先P0）→ 置信度（降序）→ 文件路径 → 行号排序。
10. **收集覆盖数据。** 合并审查者的剩余风险和测试缺口。
11. **保留代理产物。** 将agent-native、schema-drift和deployment-verification输出与合并的发现结果集一起保留。不要仅仅因为非结构化代理输出与角色JSON模式不匹配就丢弃它们。

### 第6阶段：合成并展示

使用审查输出模板中**以管道分隔的markdown表格展示发现结果**来组装最终报告。表格格式是交互模式下发现结果行的强制要求 —— 不要将发现结果渲染为自由文本块或水平线分隔的散文。其他报告部分（已应用修复、经验教训、覆盖范围等）使用项目符号列表，并在结论前使用`---`分隔符，如模板所示。

1. **头部。** 范围、意图、模式、带有每个条件理由的审查团队。
2. **发现结果。** 渲染为按严重级别分组的管道分隔表格（`### P0 -- 严重`、`### P1 -- 高`、`### P2 -- 中等`、`### P3 -- 低`）。每个发现结果行显示`#`、文件、问题、审查者、置信度和合成路由。省略空的严重级别。永远不要将发现结果渲染为自由文本块或编号列表。
3. **需求完整性。** 仅当在第2b阶段找到计划时包含。对于计划中的每个需求（R1、R2等）和实现单元，报告差异中是否出现相应工作。使用简单的检查清单：已满足 / 未处理 / 部分处理。路由取决于`plan_source`：
   - **`explicit`**（调用方提供或PR正文）：将未处理的需求标记为P1发现结果，`autofix_class: manual`，`owner: downstream-resolver`。这些进入剩余可操作队列，可以成为待办事项。
   - **`inferred`**（自动发现）：将未处理的需求标记为P3发现结果，`autofix_class: advisory`，`owner: human`。这些仅保留在报告中 —— 没有待办事项，没有自主后续操作。推断的计划匹配是提示，不是契约。
   当没有找到计划时完全省略此部分 —— 不要提及计划不存在。
4. **已应用修复。** 仅当此调用中运行了修复阶段时包含。
5. **剩余可操作工作。** 当未解决的可操作发现结果已移交或应移交时包含。
6. **预先存在的问题。** 单独部分，不计入结论。
7. **经验教训和过去解决方案。** 展示learnings-researcher结果：如果过去的解决方案相关，将其标记为"已知模式"并链接到docs/solutions/文件。
8. **代理原生缺口。** 展示agent-native-reviewer结果。如果没有发现缺口则省略此部分。
9. **模式漂移检查。** 如果schema-drift-detector运行了，总结是否发现漂移。如果存在漂移，列出不相关的模式对象和所需的清理命令。如果干净，简要说明。
10. **部署说明。** 如果deployment-verification-agent运行了，展示关键的通过/不通过项：阻塞的预部署检查、最重要的验证查询、回退注意事项和监控重点区域。保持检查清单可操作，而不是将其放入覆盖范围。
11. **覆盖范围。** 抑制计数、剩余风险、测试缺口、失败/超时的审查者，以及非交互模式携带的任何意图不确定性。
12. **结论。** 可合并 / 修复后可合并 / 不可合并。适用时的修复顺序。当`explicit`计划有未处理的需求时，结论必须反映这一点 —— 代码干净但缺少计划需求的PR是"不可合并"，除非遗漏是故意的。当`inferred`计划有未处理的需求时，在结论推理中注明，但不要单独以此阻塞。

不要包含时间估算。

**格式验证：** 在交付报告之前，验证发现结果部分使用管道分隔的表格行（`| # | 文件 | 问题 | ... |`）而不是自由文本。如果你发现自己将发现结果渲染为用水平线或项目符号分隔的散文块，请停止并重新格式化为表格。

### 无头输出格式

在`mode:headless`中，用结构化文本包替换交互式管道分隔表格报告。该包遵循与document-review的无头输出相同的结构模式（完成头部、元数据块、按autofix_class分组的发现结果、尾部部分），同时使用ae:review自己的章节标题和每个发现结果字段。

```
Code review complete (headless mode).

Scope: <scope-line>
Intent: <intent-summary>
Reviewers: <reviewer-list with conditional justifications>
Verdict: <Ready to merge | Ready with fixes | Not ready>
Artifact: .context/ae/ae-review/<run-id>/

Applied N safe_auto fixes.

Gated-auto findings (concrete fix, changes behavior/contracts):

[P1][gated_auto -> downstream-resolver][needs-verification] File: <file:line> -- <title> (<reviewer>, confidence <N>)
  Why: <why_it_matters>
  Suggested fix: <suggested_fix or "none">
  Evidence: <evidence[0]>
  Evidence: <evidence[1]>

Manual findings (actionable, needs handoff):

[P1][manual -> downstream-resolver] File: <file:line> -- <title> (<reviewer>, confidence <N>)
  Why: <why_it_matters>
  Evidence: <evidence[0]>

Advisory findings (report-only):

[P2][advisory -> human] File: <file:line> -- <title> (<reviewer>, confidence <N>)
  Why: <why_it_matters>

Pre-existing issues:
[P2][gated_auto -> downstream-resolver] File: <file:line> -- <title> (<reviewer>, confidence <N>)
  Why: <why_it_matters>

Residual risks:
- <risk>

Learnings & Past Solutions:
- <learning>

Agent-Native Gaps:
- <gap description>

Schema Drift Check:
- <drift status>

Deployment Notes:
- <deployment note>

Testing gaps:
- <gap>

Coverage:
- Suppressed: <N> findings below 0.60 confidence (P0 at 0.50+ retained)
- Untracked files excluded: <file1>, <file2>
- Failed reviewers: <reviewer>

Review complete
```

**详细信息丰富（仅无头模式）：** 无头包包含`Why:`、`Evidence:`和`Suggested fix:`行。合并后（第5阶段），仅为经过去重和置信度门控的发现结果从`.context/ae/ae-review/{run_id}/`读取每个代理产物文件。
   - **字段层级：** `Why:`和`Evidence:`是详细层级 —— 从每个代理产物文件加载。`Suggested fix:`是合并层级 —— 直接从紧凑返回使用，无需查找产物。
   - **产物匹配：** 对于每个存活的发现结果，在贡献审查者的产物文件中查找其详细层级字段。在每个贡献审查者的产物中匹配`file + line_bucket(line, +/-3)`（与第5阶段去重中使用的容差相同）。当多个产物条目落在行桶中时，对合并发现结果的标题和每个候选条目的标题应用`normalize(title)`作为决胜条件。
   - **审查者顺序：** 按照合并发现结果的审查者列表中出现的顺序尝试贡献审查者；使用第一个匹配项。
   - **无匹配回退：** 如果没有产物文件包含匹配项（所有写入失败，或发现结果是在合并期间合成的），则省略该发现结果的`Why:`和`Evidence:`行，并在覆盖范围中注明缺口。`Suggested fix:`行仍然可以从紧凑返回填充，因为它是合并层级的。

**格式化规则：**
- `[needs-verification]`标记仅出现在`requires_verification: true`的发现结果上。
- `Artifact:`行向调用方提供完整运行产物的路径，以便机器可读访问完整的发现结果模式。文本包是主要移交方式；产物用于调试和完整保真度访问。
- 所有者为`release`的发现结果出现在建议部分（它们是操作/发布项，不是代码修复）。
- `pre_existing: true`的发现结果无论autofix_class如何都出现在预先存在的问题部分。
- 结论出现在元数据头部（与交互模式中结论在底部的顺序不同，此处做了刻意调整），以便程序调用方首先获得结论。
- 省略任何零项的部分。
- 如果所有审查者失败或超时，输出`Code review degraded (headless mode). Reason: 0 of N reviewers returned results.`后跟"Review complete"。
- 以"审查完成"作为终端信号结束，以便调用方可以检测完成。

## 质量门

在交付审查之前，验证：

1. **每个发现结果都是可操作的。** 重读每个发现结果。如果它说"考虑"、"可能想要"或"可以改进"而没有具体修复，请用特定动作重写。模糊的发现结果浪费工程时间。
2. **没有因未仔细阅读代码而导致的误报。** 对于每个发现结果，验证实际读取了周围的代码。检查"错误"是否在同一函数的其他地方处理，"未使用的导入"是否在类型注解中使用，"缺少的空检查"是否由调用方保护。
3. **严重级别校准正确。** 样式挑剔永远不是P0。SQL注入永远不是P3。重新检查每个严重级别分配。
4. **行号准确。** 对照文件内容验证每个引用的行号。指向错误行的发现结果比没有发现结果更糟糕。
5. **受保护产物得到尊重。** 丢弃任何建议删除或gitignore`docs/brainstorms/`、`docs/plans/`或`docs/solutions/`中文件的发现结果。
6. **发现结果不重复linter输出。** 不要标记项目linter/格式化程序会捕获的内容（缺少分号、错误缩进）。专注于语义问题。

## 语言感知条件

当差异明确需要时，此技能使用栈特定的审查代理。保持这些代理有主见。它们不是通用语言检查器；它们在固定角色和跨领域角色之上添加独特的审查视角。

不要仅根据文件扩展名机械地生成它们。触发条件是该栈中有意义的变更行为、架构或UI状态。

## 审查后

### 模式驱动的审查后流程

展示发现结果和结论（第6阶段）后，按模式路由下一步。审查和合成在每种模式下保持不变；只有变更和移交行为变化。

#### 步骤1：构建动作集

- **干净审查**意味着抑制和分离预先存在的问题后零发现结果。当审查干净时跳过修复/移交阶段。
- **修复队列：** 路由到`safe_auto -> review-fixer`的最终发现结果。
- **剩余可操作队列：** 未解决的`gated_auto`或`manual`发现结果，其最终所有者是`downstream-resolver`。
- **只读队列：** `advisory`发现结果和任何所有者为`human`或`release`的输出。
- **永远不要将仅建议输出转换为修复工作或待办事项。** 部署说明、剩余风险和发布拥有的项保留在报告中。

#### 步骤2：按模式选择策略

**交互模式**

- 自动应用`safe_auto -> review-fixer`发现结果，无需询问。根据定义这些是安全的。
- 仅当安全修复后仍有`gated_auto`或`manual`发现结果时，**使用平台的阻塞question工具**询问策略问题。不要替换为会话式开放式问题。根据实际剩余内容调整选项：

  **当存在`gated_auto`发现结果时**（有或没有`manual`）：
  ```
  安全修复已应用。我该如何处理剩余的发现结果？
  1. 审查并批准特定的门控修复（推荐）
  2. 留作剩余工作
  3. 仅报告 -- 不采取进一步行动
  ```

  **当仅剩余`manual`发现结果时**（无`gated_auto`）：
  ```
  安全修复已应用。剩余的发现结果需要手动解决。我该怎么做？
  1. 留作剩余工作（推荐）
  2. 仅报告 -- 不采取进一步行动
  ```

     如果没有可用的阻塞式提问工具，将适用的编号选项显示为文本，并等待用户选择后再继续。
- 如果安全修复后没有剩余的`gated_auto`或`manual`发现结果，则完全跳过策略问题 —— 报告修复内容并继续下一步。
- 仅在用户明确批准特定项后，才将`gated_auto`发现结果包含在修复队列中。不要仅根据严重级别扩大队列。

**自动修复模式**

- 不询问问题。
- 仅应用`safe_auto -> review-fixer`队列。
- 保留`gated_auto`、`manual`、`human`和`release`项未解决。
- 仅为最终所有者是`downstream-resolver`的未解决可操作发现结果准备剩余工作。

**只读模式**

- 不询问问题。
- 不要构建修复队列。
- 不要创建剩余待办事项或`.context`产物。
- 在第6阶段后停止。所有内容保留在报告中。

**无头模式**

- 不询问问题。
- 仅在单轮中应用`safe_auto -> review-fixer`队列。不要进入有限重新审查循环（步骤3）。生成一个修复子代理，应用修复，然后直接进入步骤4。
- 保留`gated_auto`、`manual`、`human`和`release`项未解决 —— 它们出现在结构化文本输出中。
- 输出无头输出包（见第6阶段）而不是交互式报告。
- 写入运行产物（步骤4）但不创建待办文件。
- 在结构化文本输出和"Review complete"信号后停止。不提交/推送/PR。

#### 步骤3：使用一个修复器和有限轮次应用修复

- 为当前工作副本中的当前修复队列恰好生成一个修复子代理。该修复器在一致的代码树上一次性应用所有批准的变更并运行相关的针对性测试。
- 不要针对同一工作副本分散多个修复器。并行修复器需要隔离的工作树/分支和刻意的合并回退。
- 修复落地后仅重新审查变更范围。
- 用`max_rounds: 2`限制循环。如果第二轮后仍有问题，停止并将它们作为剩余工作移交或报告为未解决。
- 如果任何应用的发现结果有`requires_verification: true`，则在针对性验证运行之前，该轮次未完成。
- 不要在同一工作副本上与浏览器测试同时启动可变审查轮次。未来需要两者的编排器必须要么在并行阶段运行`mode:report-only`，要么将可变审查隔离在自己的工作副本/工作树中。

#### 步骤4：输出产物和下游移交

- 在交互、自动修复和无头模式下，在`.context/ae/ae-review/<run-id>/`下写入每次运行的产物，包含：
  - 合成的发现结果（第5阶段的合并输出）
  - 已应用的修复
  - 剩余可操作工作
  - 仅建议输出
  每个代理的完整详细JSON文件（`{reviewer_name}.json`）已从第4阶段分派后存在于此目录中。
- 还在发现结果旁边写入`metadata.json`，以便下游技能可以验证产物与当前分支和HEAD匹配。最小字段：
  ```json
  {
    "run_id": "<run-id>",
    "branch": "<git branch --show-current at dispatch time>",
    "head_sha": "<git rev-parse HEAD at dispatch time>",
    "verdict": "<Ready to merge | Ready with fixes | Not ready>",
    "completed_at": "<ISO 8601 UTC timestamp>"
  }
  ```
  在分派时（任何自动修复落地之前）捕获`branch`和`head_sha`，并在结论最终确定后写入文件。此文件是附加的 —— 早于此字段的现有产物仍然有效，下游技能在缺失时回退到文件修改时间。
- 在自动修复模式下，仅为最终所有者是`downstream-resolver`的未解决可操作发现结果创建持久待办文件。使用创建待办文件功能获取规范目录路径、命名约定、YAML前置元数据结构和模板。每个待办应将发现结果的严重级别映射到待办优先级（`P0`/`P1` → `p1`、`P2` → `p2`、`P3` → `p3`），并设置`status: ready`，因为这些发现结果已经过合成阶段的分类。
- 不要为`advisory`发现结果、`owner: human`、`owner: release`或受保护产物清理建议创建待办事项。
- 如果仅剩余建议输出，不要创建待办事项。
- 交互模式可以在修复后提供外化剩余可操作工作的选项，但完成审查不需要这样做。

#### 步骤5：最终下一步

**仅交互模式：** 修复-审查周期完成后（干净结论或用户选择停止），根据进入模式提供下一步。已知时重用第1阶段解析的审查基准/默认分支；不要仅硬编码`main`/`master`。

- **PR模式（通过拉取请求编号/URL进入）：**
  - **推送修复** -- 提交到现有拉取请求分支
  - **退出** -- 暂时完成
- **分支模式（无PR的功能分支，且不是解析的审查基准/默认分支）：**
  - **创建拉取请求（推荐）** -- 推送并打开拉取请求
  - **不创建拉取请求继续** -- 留在分支上
  - **退出** -- 暂时完成
- **在解析的审查基准/默认分支上：**
  - **继续** -- 进行下一步
  - **退出** -- 暂时完成

如果选择"创建拉取请求"：首先使用`git push --set-upstream origin HEAD`发布分支，然后使用`gh pr create`，标题和摘要从分支变更派生。
如果选择"推送修复"：使用`git push`推送分支以更新现有拉取请求。

**自动修复、只读和无头模式：** 在报告、产物输出和剩余工作移交后停止。不要提交、推送或创建拉取请求。

## 回退

如果平台不支持并行子代理，则顺序运行审查者。其他所有内容（阶段、输出格式、合并流水线）保持不变。

---

## 包含的参考

### 角色目录

@./references/persona-catalog.md

### 子代理模板

@./references/subagent-template.md

### 差异范围规则

@./references/diff-scope.md

### 发现结果模式

@./references/findings-schema.json

### 审查输出模板

@./references/review-output-template.md
