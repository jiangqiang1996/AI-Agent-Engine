---
name: ae:my-code-changes
description: "获取指定时间内本人提交的所有代码变更（含本机未提交的），只取最终状态，不输出中间过程"
argument-hint: "since=<date> [until=<date>]"
---

# my-code-changes

## 目标

获取指定时间范围内，当前 git 用户提交的所有代码变更及本机未提交的变更，对每个文件只输出最终状态（从基线到当前的累积 diff），不输出中间提交过程。

## 适用场景

- 用户想回顾自己在某段时间内的所有代码改动
- 用户想汇总自己本周/本月的代码变更
- 用户想在提交 PR 或写周报前查看自己的改动范围

## 不适用场景

- 需要查看他人代码变更
- 需要逐 commit 查看变更历史（本技能只输出最终状态）
- 非 git 仓库

## 输入参数

通过 `$ARGUMENTS` 传入，格式为 `since=<date> [until=<date>]`：

- `since`（必填）：起始时间，支持任何 git 兼容的日期格式，如 `2025-06-01`、`2 weeks ago`
- `until`（选填）：截止时间，省略则到当前时刻；传入未来时间视为当前时刻，此时包含未提交变更

## 执行流程

1. 解析 `since` 和 `until` 参数，`since` 缺失时报错退出。
2. 分别读取项目级 `git config user.name` 和全局级 `git config --global user.name`，去重后作为本人身份。项目级和全局级配置不同时，匹配任一作者的提交均视为本人。
3. 通过 `git log --author="<user1>" --author="<user2>" --since=<since> [until=<until>] --name-only --pretty=format:` 获取用户在时间范围内提交涉及的文件列表。
4. 若截止时间为当前时刻（`until` 未指定或传入未来时间），通过 `git status --porcelain` 获取本机未提交的变更文件列表；若截止时间为过去时间，则仅输出已提交变更。
5. 合并去重，得到所有变更文件。
6. 找到时间范围起点之前的最近 commit 作为基线（`git log --before=<since> -1 --format="%H"`）。
7. 对每个变更文件，执行 `git diff <baseline> -- <file>` 输出从基线到当前工作树的累积 diff。若文件已被删除则标注跳过。
8. 输出汇总：用户身份、时间范围、变更文件数。

## 输出格式

```
User: <name> <<email>>
Range: <since> ~ <until>
Base commit: <hash>
Changed files: N (committed: M, uncommitted: K)
============================================================

--- path/to/file1 [committed] ---
<diff from baseline to working tree>

--- path/to/file2 [committed, uncommitted] ---
<diff from baseline to working tree>

--- path/to/file3 [uncommitted] ---
<diff from baseline to working tree>
```

## 局限性

- `git diff` 基于树状态对比，若同一文件在时间范围内被他人也修改过，diff 中会包含他人的变更部分。这是 git diff 的固有行为，无法通过 `--author` 过滤。
- 二进制文件无法显示有意义的 diff，git 会标注为 binary。
- 文件重命名时，git 可能将其识别为 delete + add，旧文件和新文件都会出现在列表中。

## 脚本

核心逻辑由 `scripts/my-code-changes.mjs` 实现，纯 Node.js ESM，无外部依赖：

```bash
node scripts/my-code-changes.mjs --since=2025-06-01 --until=2025-06-10
```

## 验证

1. 在当前仓库执行脚本，确认能正确列出本人变更文件。
2. 确认未提交的文件也被包含。
3. 确认同一文件多次提交只出现一次，且输出的是累积 diff。
