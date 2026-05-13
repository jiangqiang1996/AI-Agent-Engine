---
type: worktree-handoff
status: transferred
createdAt: 2026-05-13T16:23:53+08:00
sourceWorktree: D:\Documents\IdeaProjects\ai-agent-engine
targetWorktree: D:\Documents\IdeaProjects\worktrees\deep-refactor-graph-symbol-callchain
branch: feat/deep-refactor-graph-symbol-callchain
head: bee493d
---

# Worktree Handoff: deep-refactor-graph-symbol-callchain

## A->B Startup Proof

- source_session_id: unavailable
- source_worktree: `D:\Documents\IdeaProjects\ai-agent-engine`
- target_worktree: `D:\Documents\IdeaProjects\worktrees\deep-refactor-graph-symbol-callchain`
- branch: `feat/deep-refactor-graph-symbol-callchain`
- head: `bee493d docs(config): 同步资产快照与模型场景清单`
- authorization_source: 当前会话用户选择“创建 worktree”，随后明确选择“授权创建”。
- authorization_scope: 仅授权执行 `git worktree add ..\worktrees\deep-refactor-graph-symbol-callchain -b feat/deep-refactor-graph-symbol-callchain HEAD`。
- covered_command_args: `git worktree add ..\worktrees\deep-refactor-graph-symbol-callchain -b feat/deep-refactor-graph-symbol-callchain HEAD`
- final_command_args: `git worktree add "..\worktrees\deep-refactor-graph-symbol-callchain" -b "feat/deep-refactor-graph-symbol-callchain" HEAD`
- creation_result: Git worktree 创建成功，目标分支为 `feat/deep-refactor-graph-symbol-callchain`，目标 HEAD 为 `bee493d`。
- source_git_status_short: `?? docs/ae/plans/2026-05-13-001-deep-refactor-graph-symbol-callchain-plan.md`
- target_git_status_short_at_creation: clean

## Migrated Artifacts

- plan: `docs/ae/plans/2026-05-13-001-deep-refactor-graph-symbol-callchain-plan.md`
- requirements: `docs/ae/brainstorms/2026-05-12-graph-maintenance-usage-requirements.md`
- design: 由计划文档承载，未提供独立设计文档。

## Execution Baseline

- 计划文档是本次执行的唯一实现基线，进入 B worktree 后不得重新审查、深化或转换本次需求、设计或计划。
- 必须从 `ae:work` 阶段 1 的任务分析继续执行，优先执行计划的 U0 解析器选型与打包决策门。
- U0 未通过前不得删除旧 shallow 主流程，不得把 deep/symbol 设为默认构建结果。
- 验证命令以计划中各实现单元的 `验证` 字段为准；交付前至少运行相关 Vitest、`npm run typecheck` 和必要的 `npm run build`。
- 实现完成后必须进行代码审查或记录无法审查原因，并调用 `ae-gate workflow:work checkpoint:final`。
- 禁止回到 A worktree 写代码、配置、测试或文档；后续所有实现只在目标 B worktree 中进行。

## Continue Prompt

你现在已经位于目标 B worktree：D:\Documents\IdeaProjects\worktrees\deep-refactor-graph-symbol-callchain。请调用 ae:work，并把 D:\Documents\IdeaProjects\worktrees\deep-refactor-graph-symbol-callchain\docs\ae\handoffs\2026-05-13-162353-worktree-handoff.md 作为唯一任务输入；不得按裸提示词处理。需求文档路径为 docs/ae/brainstorms/2026-05-12-graph-maintenance-usage-requirements.md，计划文档路径为 docs/ae/plans/2026-05-13-001-deep-refactor-graph-symbol-callchain-plan.md，设计由计划承载。进入 ae:work 后必须把需求、计划和本交接文件视为已确定执行基线，不得审查或深化本次需求文档、设计文档或计划文档，不得调用需求、设计、计划相关审查或转换技能；直接从阶段 1 的任务分析继续到阶段 2 执行。禁止回到 A worktree D:\Documents\IdeaProjects\ai-agent-engine 写文件。优先执行计划 U0 解析器选型与打包决策门，U0 未通过前不得删除旧 shallow 主流程或默认 deep-only。验证要求以计划各实现单元为准，交付前运行相关 Vitest、npm run typecheck 和必要的 npm run build；实现完成后进行代码审查或记录无法审查原因，并调用 ae-gate workflow:work checkpoint:final。

你现在已经位于目标 B worktree：D:\Documents\IdeaProjects\worktrees\deep-refactor-graph-symbol-callchain。请调用 ae:work，并把 D:\Documents\IdeaProjects\worktrees\deep-refactor-graph-symbol-callchain\docs\ae\handoffs\2026-05-13-162353-worktree-handoff.md 作为唯一任务输入；不得按裸提示词处理。需求文档路径为 docs/ae/brainstorms/2026-05-12-graph-maintenance-usage-requirements.md，计划文档路径为 docs/ae/plans/2026-05-13-001-deep-refactor-graph-symbol-callchain-plan.md，设计由计划承载。进入 ae:work 后必须把需求、计划和本交接文件视为已确定执行基线，不得审查或深化本次需求文档、设计文档或计划文档，不得调用需求、设计、计划相关审查或转换技能；直接从阶段 1 的任务分析继续到阶段 2 执行。禁止回到 A worktree D:\Documents\IdeaProjects\ai-agent-engine 写文件。优先执行计划 U0 解析器选型与打包决策门，U0 未通过前不得删除旧 shallow 主流程或默认 deep-only。验证要求以计划各实现单元为准，交付前运行相关 Vitest、npm run typecheck 和必要的 npm run build；实现完成后进行代码审查或记录无法审查原因，并调用 ae-gate workflow:work checkpoint:final。
