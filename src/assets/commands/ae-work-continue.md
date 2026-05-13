---
description: 在 B worktree 自动查找交接文件并继续 ae:work
model: $deep
subtask: false
---

使用 `ae:work` 技能处理 B worktree 续执行。

当前命令只能用于 A→B worktree 转移后的目标 B 工作空间。

## 执行要求

1. 如果 `$ARGUMENTS` 提供了交接文件路径，先用文件系统工具确认该文件存在，并把它作为唯一任务输入。
2. 如果 `$ARGUMENTS` 为空，在当前工作空间查找 `docs/ae/handoffs` 目录并读取目录项，筛选出文件名匹配 `*-worktree-handoff.md` 的交接文件。
3. 不得只依赖 `glob` 的空结果判断交接文件不存在；`docs/ae/handoffs` 可能被 `.gitignore` 忽略，必须用真实文件系统目录读取或等价 shell 文件系统命令复核。
4. `glob` 只能作为辅助线索；如果 `glob` 找不到候选项，仍必须检查 `docs/ae/handoffs` 目录。
5. 如果只找到一个交接文件，把该文件作为唯一任务输入调用 `ae:work`；不得按裸提示词处理。
6. 如果找到多个交接文件，按文件名或修改时间列出候选项并询问用户选择；用户选择前不得继续执行。
7. 如果目录不存在、目录为空或没有匹配文件，提示用户确认是否在目标 B worktree 中打开 opencode，并停止。
8. 进入 `ae:work` 后必须读取交接文件中的 `## Continue Prompt` 和 A→B 启动证明，沿用其中的需求、计划、执行基线和验证要求。
