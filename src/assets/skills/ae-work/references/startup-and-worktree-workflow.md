# 启动与 Worktree 工作流

本文件定义 `ae:work` 阶段 1 的启动门禁。修改任何项目文件前必须完成本文件全部适用步骤。

## 读取设计与交接基线

设计文档输入必须完整阅读工作文档，视为决策产物，并检查每个单元的 `Execution note`、`Deferred to Implementation`、`Scope Boundaries`。若用户明确要求 TDD，即使设计无 Execution note 也要遵循。

B worktree 继续执行路径必须解析交接文件并产出 `handoff_context`：目标 B worktree、需求文档路径、设计文档路径、任务详情、图谱目录、AE 项目配置路径、A→B 启动证明和执行基线声明。交接文件是唯一必需文件；需求、设计、图谱目录和 AE 项目配置在 A 端条件必选迁移（上游产物或物理文件存在时必须迁移），design_path 和 task_brief 至少传入一个（有上游 ae:design 产物时优先迁移 design_path；无上游产物时可通过 task_brief 内联任务详情，或生成上下文派生设计并迁移）；B 端只在交接文件引用且当前 B worktree 中真实存在时读取，缺失时降级为可选上下文不阻断继续执行（design_path 和 task_brief 均缺失时硬阻断）。存在性判断必须使用文件系统视角，不得依赖 `git status`、`git ls-files` 或其他会受 `.gitignore` 影响的 Git 视角。继续执行以结构化章节和 `resume_entrypoint` 为真源。

B worktree 继续执行必须校验当前目录和 `git rev-parse --show-toplevel` 输出是否与目标 B worktree 一致；不一致时停止并报告，不得回到 A worktree 写文件。交接文件缺少执行基线声明或启动证明时停止；交接文件未提供需求/设计路径、图谱目录或 AE 项目配置，或引用路径在 B 中不存在时，只记录可选上下文缺失，不得在 B 中补做文档审查或回 A 补迁移。交接文件未提供 `design_path` 且未提供 `task_brief`，或 `design_path` 在 B 中不存在且无 `task_brief` 时停止执行，按 input-routing-workflow 的停止执行规则处理。

## Git 状态检查

必须实际运行以下命令并记录输出，不得凭假设跳过：

```bash
git status --short
git branch --show-current
git log --oneline -1
```

记录当前分支、工作区脏状态、最近提交和可观察 worktree 路径。若 Git 命令失败，记录失败输出和 `git_context: not_git`；显式 `worktree` 模式必须停止或请求用户降级确认，`current-worktree` 可继续当前目录但必须说明风险，`auto` 可降级当前目录并记录 `worktree_decision: not_applicable`。非 Git 场景不得伪造 branch 或 HEAD。

## Worktree 模式解析

- 检查调用方是否显式传入 `worktree`、`current-worktree`、`auto`。
- 兼容输入 `--no-worktree` 映射为 `current-worktree`。
- 每次正式实现型任务在修改项目文件前，都必须先解析 worktree 模式：`worktree`、`current-worktree`、`auto`。
- 显式 `auto` 模式复用阶段 0 的 S3/S4 分流和强制升级停点作为推荐依据：S3 轻量修复、预计不超过 2 个生产文件时推荐 `current-worktree`；S4 多步骤实现、10+ 文件或高风险时推荐 `worktree`，并在最终交付说明 / Git 操作状态中记录推荐依据。
- 如果调用方是 `ae:task-loop`，固定按 `current-worktree` 处理，记录 `worktree_decision: rejected`，不得询问 worktree 模式、不得创建 worktree、不得把未传值补齐为 `auto`。
- 若输入为规范 worktree 交接文件且当前目录匹配目标 B worktree，视为 worktree 模式已由 A→B 启动证明确定，记录 `worktree_decision: created`，不得再次询问 worktree 模式或分支策略，不得再次创建 worktree。
- 单独使用 `ae:work` 且未显式传入 worktree 模式时，必须基于任务上下文给出推荐依据并明确询问是否创建新的 worktree，不得自行推断或默认采用 `auto`；询问必须基于任务大小给出推荐：小任务推荐当前工作区，大任务推荐创建新 worktree。
- S3 轻量修复也必须进入阶段 1，完成准备环境 / worktree 决策后再实现。

## 风险确认

根据 Git 状态、worktree 模式和任务大小向用户展示风险评估并等待确认；若调用方是 `ae:task-loop`，本步骤只记录固定当前工作区执行的风险，不询问、不创建 worktree。

未创建 worktree 不等于允许直接在默认分支实现；若当前在默认分支继续当前工作区，必须二次确认风险，并在最终交付说明中记录该风险接受证据。

| 场景 | 必须说明的风险 | 必须提供的选项 |
|------|----------------|----------------|
| 默认分支 + 脏工作区 | 当前在默认分支 `{branch}` 上，工作区有未提交变更。在默认分支做功能开发会污染历史。 | 创建 worktree / 创建功能分支 / 继续当前工作区（需二次确认风险） / 取消 |
| 默认分支 + 干净工作区 | 当前在默认分支 `{branch}` 上。 | 创建 worktree / 创建功能分支 / 继续当前工作区（需二次确认风险） / 取消 |
| 功能分支 + 脏工作区 | 当前在功能分支 `{branch}` 上，工作区有未提交变更。 | 创建 worktree / 继续当前工作区 / 取消 |
| 功能分支 + 干净工作区 | 当前在功能分支 `{branch}` 上。 | 创建 worktree / 继续当前工作区 / 取消 |

用户选择取消时，立即终止 `ae:work`，只输出取消状态和 `worktree_decision: cancelled`，不得修改任何文件。

若用户选择创建功能分支，必须先取得用户对具体 Git 写命令参数的明确授权，并把该命令纳入后续 `git_operations`、`git_operation_args` 和 `git_authorization_evidence`；授权不足时不得创建分支。

## Worktree 创建与 A→B 转移

仅当用户选择创建 worktree 时执行本节。创建 worktree 前必须获得用户对具体 `git worktree add` 命令参数的明确授权。

- 本地目录固定为 `../worktrees/<name>`，`<name>` 使用分支名或任务名净化后的短名。
- 创建 B 后，A 会话不得再写入 A worktree 的任何文件，也不得在 B 中修改代码、测试或其他项目文件；仅允许迁移真实存在且已确定为执行基线的需求/设计产物、`ae/graphs/`、`.opencode/ae.jsonc`（A 端条件必选迁移义务）以及 design_path 或 task_brief（至少一个），以及写入唯一规范交接文件。
- A 会话只允许在 B 写入真实存在且已确定为执行基线的需求/设计产物、`ae/graphs/`、`.opencode/ae.jsonc`、design_path（含上下文派生设计）或 task_brief（内联任务详情），以及唯一规范交接文件 `ae/handoffs/<timestamp>-worktree-handoff.md`。A 端迁移义务：需求/设计产物、`ae/graphs/`、`.opencode/ae.jsonc` 在 A worktree 中真实存在时必须迁移到 B（即使路径被 `.gitignore` 忽略），design_path 和 task_brief 至少传入一个（有上游 ae:design 产物时优先迁移 design_path；无上游 ae:design 产物时可通过 task_brief 内联任务详情，或生成上下文派生设计并迁移）；迁移前必须用文件系统工具或等价 shell 文件系统命令确认源路径存在并复制；不得用 `git status`、`git ls-files`、Git diff 或图谱结果判断它们不存在；其中 `.opencode/ae.jsonc` 只能作为已确定的 AE 项目配置上下文迁移并在交接文件中显式记录；未迁移的需求/设计、图谱或 AE 项目配置产物不在交接文件中出现，不得声称已复制。

### 上下文派生设计生成（无上游设计时必需）

当 A 会话准备创建 B worktree 交接，但当前任务没有上游 `ae:design` 产物时，A 会话必须在交接前内联生成上下文派生设计文件，或通过 `task_brief` 将任务详情直接写入交接文件。此步骤是 `design_path` 和 `task_brief` 至少一个的强制补位，不得跳过。

**触发条件**：A 会话准备调用 `ae-worktree-handoff` 工具，但当前任务无上游 `ae:design` 产物（即 `ae/designs/` 中没有与当前任务对应的设计文件）。

**生成要求**：

- 文件路径：`ae/designs/<timestamp>-<sanitized-task-name>/design.md`，命名格式与 `ae:design` 产出一致
- 文件格式：YAML frontmatter（`type: design`、`status: drafted`、`date`、`title`、`depth: standard`、`format: human-readable-design`）+ 正文结构
- frontmatter 必须包含 `sharded: false`
- 正文必须包含：来源与目标、范围（包含/不包含/约束）、需求追溯、高层技术设计（关键决策）、实现单元（每个单元含目标、覆盖需求、唯一产出物、依赖、文件、方法、需遵循的模式、测试场景、验证命令）、风险与应对、一致性检查

**内容要求**：

- 详细但不镀金：只记录 A 会话已确定的任务上下文、实现方案和验证要求，不添加未讨论的功能或抽象
- 不蔓延：实现单元的范围与 A 会话已确认的任务边界一致
- 不遗漏：所有 A 会话讨论过的实现步骤都必须记录

**与 `ae:design` 技能的区别**：

- 上下文派生设计是轻量内联生成，不触发 `ae:design` 的深度澄清、头脑风暴或交互式深化
- 不调用 `ae:design` 技能；A 会话直接从已确定的任务上下文结构化写入文件
- 设计状态为 `drafted`，不需要 `ae:design` 的状态流转

**迁移要求**：

- 生成后必须迁移到 B worktree，并在交接文件的 `design_path` 中引用
- B worktree 中 `design_path` 指向的文件必须真实存在

### 交接文件生成（必须调用工具）

- **禁止自行拼接交接 Markdown**，必须调用 `ae-worktree-handoff` 工具生成交接文件。
- 继续执行入口必须写入 A→B 启动证明和执行基线，B worktree 通过 `ae:work <交接文件>` 读取结构化交接文件继续。
- A→B 启动证明必须包含 source_session_id、source_worktree、target_worktree、branch、head、授权来源、命令参数、创建结果、迁移产物状态和执行基线；迁移产物状态只列出实际迁移的需求/设计、`ae/graphs/` 和 `.opencode/ae.jsonc`，未迁移的不出现。
- 调用工具时传入所有必填参数；工具会按固定模板生成 Markdown、写入目标 B worktree 并返回 A 会话最终回复使用的简短交接提示。
- `source_session_id`：运行时可见时记录；不可见时传 `unavailable`，并**同时**传入 `session_evidence`（可引用的消息或会话证据），否则工具会返回错误。
- `design_path` 和 `task_brief` 至少传入一个：有设计文档时传 design_path 并迁移到 B worktree；无设计文档时必须通过 task_brief 将任务详情写入交接文件，确保 B worktree 无需读取 A worktree 任何文件即可执行。
- `execution_baseline`：描述进入 B 后必须遵守的基线约束，例如"必须从 ae:work 阶段 1 的任务分析继续执行，优先执行设计的 U0 决策门"。
- `verification_requirements`：描述交付前必须运行的验证命令和标准，例如"交付前至少运行相关 Vitest、npm run typecheck 和必要的 npm run build"。

### A 会话终止行为

- A 会话最后回复**必须逐字使用**工具返回的简短交接提示（userInstruction）；不得改写、缩写或重组。
- A 会话最后回复只能输出 B worktree 路径、交接 Markdown 路径和简短交接提示；不得输出"已完成/已验证/未验证/Git 操作状态/审查状态/剩余风险"等普通交付分区。
- 创建 B worktree、迁移产物并调用工具写入规范交接 Markdown 后，立即停止 `ae:work` 阶段 2-4；终止状态必须记录并返回 `worktree_decision: transferred`，供 `ae:task-loop` 等调用方识别停点；不得进入普通交付模板。

### 交接后确认清单

工具调用成功后，A 会话确认以下 3 点即可终止：

1. 工具返回成功（无错误提示）
2. A 会话最后回复逐字使用了工具返回的简短交接提示
3. 交接文件路径符合 `ae/handoffs/<timestamp>-worktree-handoff.md` 格式

## 输出契约

本阶段必须输出 `work_context`：

```json
{
  "worktree_mode": "worktree|current-worktree|auto",
  "worktree_decision": "created|rejected|transferred|cancelled|not_applicable",
  "branch": "可观察分支或 unavailable",
  "head": "可观察 HEAD 或 unavailable",
  "worktree": "可观察 worktree 路径",
  "git_status_short": "命令输出",
  "recommendation_basis": "任务大小和推荐依据",
  "git_authorization_evidence": []
}
```
