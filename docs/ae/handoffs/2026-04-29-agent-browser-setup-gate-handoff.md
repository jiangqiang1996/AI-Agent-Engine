# agent-browser setup gate worktree handoff

## 用户目标

- 使用 `ae:work` 执行计划：`docs/ae/plans/2026-04-29-002-feat-agent-browser-setup-gate-plan.md`。
- 目标：统一所有会引导正式流程使用 `agent-browser` 的 AE 技能、代理、命令、工具自然语言，要求先执行 `ae:setup` / `/ae-setup`。

## 已确定决策

- `ae:setup` 是唯一统一前置入口，已安装时快速结束，未安装时安装并复检。
- `ae:setup` 自身是例外，不要求先执行自己。
- `agent-browser` 已安装、`command -v`、`Get-Command`、`where` 或用户口头声明不能替代本轮实际执行过 `ae:setup`。
- `/ae-test-browser` 主路径必须通过命令模板先执行 `ae:setup`；`ae-frontend-design`、`ae-lfg`、`ae-figma-assets` 仅在实际进入浏览器路径时条件触发。
- 直接 `/ae-prompt-optimize` 优化浏览器任务时，目标新会话也必须保留 setup 前置要求，且不得破坏首 token 引用约束。
- 不手工编辑 `dist/` 或 `.opencode/plugins/`；通过 `npm run build` 生成同步产物。

## 已迁移产物

- `docs/ae/plans/2026-04-29-002-feat-agent-browser-setup-gate-plan.md`

## 待办事项

- 从计划实现单元 0 开始，先生成 `docs/ae/plans/2026-04-29-002-agent-browser-inventory.md`。
- 依次执行实现单元 1-14。
- 修改前优先读取计划中引用的真源文件和现有测试文件。
- 代码或文档变更后运行计划验证矩阵中的针对性测试、`npm run typecheck`、`npm run test`、`npm run build`。
- 完成后按 `ae:work` 交付流程进行审查和 `ae-gate workflow:work checkpoint:final`。

## Git / Worktree 状态

- 源 worktree：`E:\Documents\IdeaProjects\ai-agent-engine`
- 目标 worktree：`E:\Documents\IdeaProjects\worktrees\feat-agent-browser-setup-gate`
- 分支：`feat/agent-browser-setup-gate`
- base HEAD：`343ddb6e9449683d97cb72ed33cc8900ba18e8a6`
- 创建命令：`git worktree add -b feat/agent-browser-setup-gate E:\Documents\IdeaProjects\worktrees\feat-agent-browser-setup-gate 343ddb6e9449683d97cb72ed33cc8900ba18e8a6`
- 用户已授权创建该 worktree 和功能分支。

## 继续执行约束

- 必须在目标 worktree 目录重新打开 opencode 后继续实现。
- 当前源会话不得通过 shell 工作目录修改目标 worktree 中的代码、配置、测试或其他项目文件。
- 不要迁移 `docs/ae/gates/*`、`docs/ae/review/*`、`docs/ae/reviews/*` 等运行时证明或审查产物。
- 未经用户明确授权，不要提交、推送、切分支、变基或创建 PR。

## 可复制继续提示词

请在 `E:\Documents\IdeaProjects\worktrees\feat-agent-browser-setup-gate` 目录打开新的 opencode 会话，并发送：

```text
使用 ae:work 继续执行。先读取 docs/ae/handoffs/2026-04-29-agent-browser-setup-gate-handoff.md 和 docs/ae/plans/2026-04-29-002-feat-agent-browser-setup-gate-plan.md，然后从计划实现单元 0 开始完成 agent-browser setup 前置门禁实现、测试、构建、审查和最终 ae-gate。
```
