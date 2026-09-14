# 交接文件模板（Git worktree A→B 转移，可选产物）

本模板仅在用户明确要求持久独立分支工作区（Git worktree）并授权具体 `git worktree add` 命令参数时使用。默认的隔离手段是 omp task 子代理 `isolated: true` 隔离工作区 + apply/merge，该路径**不产生交接文件**。

A 会话创建 B worktree 后不得继续实现，只允许：迁移真实存在且已确定为执行基线的需求/设计产物（文件系统视角判断存在性，即使被 `.gitignore` 忽略也必须迁移，不得用 `git status`、`git ls-files`、Git diff 判断不存在），并按本模板在 B worktree 写入唯一规范交接文件 `ae/handoffs/<timestamp>-worktree-handoff.md`。禁止把未迁移的产物写入交接文件，禁止声称已复制。

## 必填要素校验

生成交接文件前逐项确认以下要素齐备（缺任一项不得生成）：

- `source_session_id`：会话标识运行时可见时记录；不可见时写 `unavailable`，并同时提供 `session_evidence`（可引用的消息或会话证据）。
- `source_worktree` / `target_worktree`：源与目标工作区绝对路径；`target_worktree` 必须是 A 项目根目录同级的 `../worktrees/<name>` 直接子目录，`<name>` 使用分支名或任务名净化后的短名。
- `branch` / `head` / `head_message`：B worktree 的分支、HEAD sha 和提交信息。
- `authorization_source` / `authorization_scope` / `covered_command_args` / `final_command_args`：授权来源、授权范围、授权覆盖的命令参数和实际执行的完整命令参数。
- `creation_result`：`git worktree add` 的实际执行结果。
- `design_path` 和 `task_brief` **至少一个**：有上游 `/skill:ae-design` 产物时优先迁移 design_path；无上游产物时通过 task_brief 内联任务详情，或生成上下文派生设计（见文末）后迁移。
- `execution_baseline`：进入 B 后必须遵守的基线约束，例如"必须从任务分析阶段继续执行，优先执行设计的 U0 决策门"。
- `verification_requirements`：交付前必须运行的验证命令和标准，例如"交付前至少运行相关测试、typecheck 和必要的构建"。

## 交接文件模板

`<timestamp>` 格式为 `YYYY-MM-DD-HHmmssSSS`；占位符按必填要素填值；`task_brief` 章节仅在无 `design_path` 时保留。

```markdown
---
type: worktree-handoff
status: transferred
createdAt: <ISO 时间戳>
sourceWorktree: <source_worktree>
targetWorktree: <target_worktree>
branch: <branch>
head: <head>
---

## A→B Startup Proof

- source_session_id: <source_session_id>
- session_evidence: <仅 source_session_id 为 unavailable 时提供>
- source_worktree: `<source_worktree>`
- target_worktree: `<target_worktree>`
- branch: `<branch>`
- head: `<head> <head_message>`
- authorization_source: <authorization_source>
- authorization_scope: <authorization_scope>
- covered_command_args: `<covered_command_args>`
- final_command_args: `<final_command_args>`
- creation_result: <creation_result>
- migrated_artifacts:
  - requirements: `<requirements_path>`（仅实际迁移时列出）
  - design: `<design_path>`（仅实际迁移时列出）
  - task_brief: 内联于交接文件（无 design_path 时作为执行输入）
  - ae_config: `<ae_config_path>`（仅实际迁移时列出）
- execution_baseline: <execution_baseline>
- resume_entrypoint: 在目标 B worktree 中调用 ae-work 技能，并把 <交接文件相对路径> 作为唯一任务输入

## Migrated Artifacts

- requirements: `<requirements_path>`
- design: `<design_path>`
- task_brief: 内联于交接文件 Task Brief 章节
- ae_config: `<ae_config_path>`

## Task Brief

> 当 design_path 未迁移或不存在时，以下任务详情是 B worktree 执行的唯一输入。
> B worktree 无需读取 A worktree 的任何文件，直接依据以下内容执行。

<task_brief 全文>

## Execution Baseline

- 设计文档是本次执行的实现基线；进入 B worktree 后不得重新审查、深化或转换本次需求或设计。（无 design_path 时改为：task_brief 是本次执行的实现基线）
- <execution_baseline>
- 验证命令：<verification_requirements>
- 续执行入口：在目标 B worktree 中调用 ae-work 技能，并把 <交接文件相对路径> 作为唯一任务输入。
- 实现完成后必须进行代码审查或记录无法审查原因，并在最终回复中列出验证、审查和 Git 操作状态。
- 禁止回到 A worktree <source_worktree> 写代码、配置、测试或文档；后续所有实现只在目标 B worktree 中进行。
```

各章节填写规则：

- `## Migrated Artifacts` 只列出实际迁移的条目；未迁移的需求/设计或项目配置产物不得出现。
- `## Task Brief` 章节仅在有 `task_brief` 时保留；有 `design_path` 且无 task_brief 时删除整个章节。
- `resume_entrypoint` 与 Execution Baseline 的续执行入口保持一致，指向交接文件相对路径。

## A 会话终止行为

- 交接文件写入成功后，A 会话最后回复只能输出：目标 B worktree 路径、交接文件路径和以下简短交接提示（不得改写、缩写或重组）：

```text
执行已转移到新的 B worktree。

目标工作空间：<target_worktree>
交接文件：<交接文件相对路径>

请在目标工作空间中启动会话，然后调用 ae-work 技能，并把交接文件作为唯一任务输入。
```

- A 会话不得输出"已完成/已验证/未验证/Git 操作状态/审查状态/剩余风险"等普通交付分区；终止状态记录为"执行已转移 / 等待用户在 B 重启"，`worktree_decision: transferred`。
- 终止前确认清单：① 交接文件写入成功且路径符合 `ae/handoffs/<timestamp>-worktree-handoff.md` 格式；② 最后回复使用了上述简短交接提示；③ 必填要素全部落值。

## 上下文派生设计生成（无上游设计时可选）

当 A 会话准备交接但当前任务没有上游 `/skill:ae-design` 产物时，可通过 `task_brief` 直接内联任务详情（首选，轻量），或内联生成上下文派生设计文件并迁移：

- 目录路径：`ae/designs/<topic>-YYYY-MM-DD/`，命名格式与 `/skill:ae-design` 产出一致。
- 文件格式：YAML frontmatter（`type: design-overview`，`status: drafted`）+ 正文。
- 正文必须包含：来源与目标、范围（包含/不包含/约束）、需求追溯、高层技术设计（关键决策）、实现单元（每个单元含目标、覆盖需求、唯一产出物、依赖、文件、方法、需遵循的模式、测试场景、验证命令）、风险与应对、一致性检查。
- 内容要求：详细但不镀金——只记录 A 会话已确定的任务上下文、实现方案和验证要求，不添加未讨论的功能或抽象；实现单元范围与已确认的任务边界一致；所有讨论过的实现步骤都必须记录。
- 这是轻量内联生成，不触发 `/skill:ae-design` 的深度澄清和交互式深化，不需要设计状态流转。
- 生成后必须迁移到 B worktree，并在交接文件的 `design_path` 中引用；B worktree 中 `design_path` 指向的文件必须真实存在。
