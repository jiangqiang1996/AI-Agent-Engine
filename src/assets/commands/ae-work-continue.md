---
description: 在 B worktree 自动查找交接文件并继续 ae:work
model: $deep
subtask: false
---

使用 `ae:work` 技能处理 B worktree 续执行。本命令只是交接文件查找/选择包装；找到唯一交接文件后，必须调用 `ae:work` 并把该交接文件作为唯一任务输入。

当前命令只能用于 A→B worktree 转移后的目标 B 工作空间。

规范交接文件格式：`ae/handoffs/*-worktree-handoff.md`。

## 执行要求

1. 如果 `$ARGUMENTS` 提供了交接文件路径，先用文件系统工具确认该文件存在，并把它作为唯一任务输入。
2. 如果 `$ARGUMENTS` 为空，在当前工作空间查找 `ae/handoffs` 目录并读取目录项，筛选出文件名匹配 `*-worktree-handoff.md` 的交接文件。
3. 不得只依赖 `glob` 的空结果判断交接文件不存在；`ae/handoffs` 可能被 `.gitignore` 忽略，必须用真实文件系统目录读取或等价 shell 文件系统命令复核。
4. `glob` 只能作为辅助线索；如果 `glob` 找不到候选项，仍必须检查 `ae/handoffs` 目录。
5. 如果只找到一个交接文件，把该文件作为唯一任务输入调用 `ae:work`；不得按裸提示词处理，不得维护独立续执行流程。
6. 如果找到多个交接文件，按文件名或修改时间列出候选项并询问用户选择；用户选择前不得继续执行。
7. 如果目录不存在、目录为空或没有匹配文件，提示用户确认是否在目标 B worktree 中打开 opencode，并停止。
8. 进入 `ae:work` 后必须读取交接文件中的 A→B 启动证明、执行基线、`resume_entrypoint` 和验证要求。
9. 对 `/ae-work-continue` 来说，交接文件是唯一必需文件；需求文档、计划文档、设计文档、图谱目录和 AE 项目配置只在交接文件明确引用且当前 B worktree 中真实存在时作为可选上下文。
10. 如果交接文件引用的需求/计划/设计路径、图谱目录或 AE 项目配置不存在，不得把续执行判定为失败，不得回到 A worktree 查找或补迁移；记录可选上下文缺失，并从交接文件的启动证明、执行基线和验证要求手动构建待办继续执行。
11. 最终 `ae-gate workflow:work checkpoint:final` 无 `plan_path` 时，必须传入 `handoff_path` 指向本交接文件；`notes` 只能补充执行基线说明，不得把 B 续执行描述为无需计划。
