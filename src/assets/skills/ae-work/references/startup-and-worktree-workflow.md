# 启动与 Worktree 工作流

本文件定义 `ae:work` 阶段 1 的启动门禁。修改任何项目文件前必须完成本文件全部适用步骤。

## 读取计划与交接基线

计划文档输入必须完整阅读工作文档，视为决策产物，并检查每个单元的 `Execution note`、`Deferred to Implementation`、`Scope Boundaries`。若用户明确要求 TDD，即使计划无 Execution note 也要遵循。

B worktree 续执行路径必须解析交接文件并产出 `handoff_context`：目标 B worktree、需求文档路径、计划文档路径、设计文档路径（如有）、A→B 启动证明、执行基线声明和 Continue Prompt。

B worktree 续执行必须校验当前目录和 `git rev-parse --show-toplevel` 输出是否与目标 B worktree 一致；不一致时停止并报告，不得回到 A worktree 写文件。交接文件缺少执行基线声明、启动证明或必要路径时停止，不得在 B 中补做文档审查。

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
- 如果调用方是 `ae:lfg` 或 `ae:task-loop`，固定按 `current-worktree` 处理，记录 `worktree_decision: rejected`，不得询问 worktree 模式、不得创建 worktree、不得把未传值补齐为 `auto`。
- 若输入为规范 worktree 交接文件，或 Continue Prompt 引用了规范交接文件且当前目录匹配目标 B worktree，视为 worktree 模式已由 A→B 启动证明确定，记录 `worktree_decision: created`，不得再次询问 worktree 模式或分支策略。
- 单独使用 `ae:work` 且未显式传入三值中的任何一个时，必须向用户询问，不得自行推断或默认采用 `auto`；询问必须基于任务大小给出推荐：小任务推荐当前工作区，大任务推荐创建新 worktree。

## 风险确认

根据 Git 状态、worktree 模式和任务大小向用户展示风险评估并等待确认；若调用方是 `ae:lfg` 或 `ae:task-loop`，本步骤只记录固定当前工作区执行的风险，不询问、不创建 worktree。

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
- 创建 B 后，A 会话不得再写入 A worktree 的任何文件，也不得在 B 中修改代码、配置、测试或其他项目文件。
- A 会话只允许在 B 写入当前任务已确定的需求/计划/设计产物，以及唯一规范交接文件 `docs/ae/handoffs/<timestamp>-worktree-handoff.md`。
- 交接文件路径不得使用 `docs/ae/handoff-*.md`、A worktree 路径或其他等价路径；写错位置时必须停止并报告流程失败，不得继续实现。
- 交接文件必须包含 `## Continue Prompt` 章节，章节内容必须是一段可直接复制到新会话执行的完整提示词，而不是摘要、清单或让用户自行拼装的说明。
- 先生成唯一规范产物 `canonical_continue_prompt`；`## Continue Prompt`、交接文件最后一句、A 会话最后回复和 A→B 启动证明都必须逐字复制该字符串，不得分别改写。
- `## Continue Prompt` 和交接文件最后一句话必须使用固定调用形态：`你现在已经位于目标 B worktree：<B绝对路径>。请调用 ae:work，并把 <交接文件路径> 作为唯一任务输入；不得按裸提示词处理。...`
- 继续提示词必须明确交接文件路径、需求/计划/设计文件路径（或说明设计由计划承载）、禁止回到 A worktree 写文件、进入 `ae:work` 后必须把需求/计划/设计视为已确定执行基线、不得审查或深化本次任务的需求文档/设计文档/计划文档、不得调用需求/设计/计划相关审查或转换技能、直接从阶段 1 的任务分析继续到阶段 2 执行、验证要求、实现后的代码审查要求和最终门禁要求。
- 创建 B worktree、迁移产物并写入规范交接 Markdown 后，立即停止 `ae:work` 阶段 2-4；终止状态必须记录并返回 `worktree_decision: transferred`，供 `ae:lfg` 等调用方识别停点；不得调用最终交付门禁，不得进入普通交付模板。
- A 会话最后回复只能输出 B worktree 路径、交接 Markdown 路径和与交接文件 `## Continue Prompt` 完全一致的继续提示词；不得输出“已完成/已验证/未验证/Git 操作状态/门禁结果/剩余风险”等普通交付分区。
- A→B 启动证明必须包含 `source_session_id`（运行时可见时记录；不可见时写 `unavailable` 并记录可引用的消息或会话证据）、A 的可观察 worktree 路径、`target_worktree`、branch、HEAD、授权来源、授权覆盖范围、`covered_command_args`、`final_command_args`、创建结果、已迁移产物清单、需求/计划/设计执行基线声明和完整继续提示词。

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
