---
name: ae-my-code-changes
description: 汇总指定时间范围内"我自己"的代码变更（含本机未提交的改动），每个文件只输出从基线到当前工作树的最终累积 diff，不展开中间提交过程。Use when the user wants to review their own changes over a period, summarize a week of work, or prepare a PR description. 触发关键词：我的改动、我的代码变更、这段时间改了什么、提交记录汇总、my code changes、my commits、diff summary、changelog of my work.
license: GPL-3.0-or-later
compatibility: 需要 Node.js 18+（运行 scripts/my-code-changes.mjs）与 git（PATH 上可用，且当前目录是 git 仓库）。脚本零外部依赖。
metadata:
  author: ae-skills
  version: 1.0.0
  ae-group: 元能力
---

# ae-my-code-changes — 我的代码变更

把"某段时间内我改了哪些文件"汇总成一份可读的最终态 diff。

## 何时使用

- 用户想回顾自己在某段时间内的所有代码改动。
- 用户要汇总本周 / 本月的代码变更量。
- 用户在提 PR 或写周报前，想先看自己改动的范围。

## 何时不使用

- 想看别人的提交 —— 本技能只筛当前 git 用户。
- 想逐个 commit 复盘历史 —— 本技能只输出最终状态，不展开中间过程。
- 当前目录不是 git 仓库。

## 身份识别

脚本用两个来源确定"本人"，取并集后去重：

1. 项目级 `git config user.name`
2. 全局级 `git config --global user.name`

两者配置不同时，匹配**任一**作者的提交都算本人提交。两者都取不到时，脚本以非零退出码结束并提示 `Cannot determine git user.name from either local or global config.`。

提交归属用 `git log --author` 过滤；邮箱（`git config user.email` / `git config --global user.email`）只用于在输出里展示，不参与匹配。

## 用法

```bash
node scripts/my-code-changes.mjs --since=<日期> [--until=<日期>]
```

| 参数 | 必填 | 说明 |
|------|------|------|
| `--since` | 是 | 起始时间 |
| `--until` | 否 | 截止时间；省略或传未来时间表示"到当前时刻" |

**注意：必须用 `--since=值` 的等号写法**，`--since 值` 不会被识别。

日期用任何 git 能解析的格式：

```bash
node scripts/my-code-changes.mjs --since=2026-06-01
node scripts/my-code-changes.mjs --since="2 weeks ago"
node scripts/my-code-changes.mjs --since=2026-06-01 --until=2026-06-10
```

纯日期（`YYYY-MM-DD`）会被补成当天 `00:00:00`，避免部分平台上日期匹配不到。

**截止时间的两种语义**：

- 省略 `until`，或传入未来时间 → 范围一直到现在，**并且**包含本机未提交的改动。
- 传入过去时间 → 只统计已提交的改动，未提交部分被排除（输出里会显式说明）。

## 执行流程

脚本内部做的事，按顺序：

1. 解析 `--since` / `--until`，缺 `since` 直接报错退出。
2. 读取项目级与全局级 `user.name`，去重后作为本人身份。
3. `git log --since=... --author=... [--until=...] --name-only` 取时间范围内的提交文件列表。
4. 截止时间落在当前时刻时，额外用 `git status --porcelain` 取未提交改动的文件列表。
5. 合并去重得到全部变更文件。
6. 用 `git log --before=<since> -1` 找到时间范围起点之前的最近提交作为基线；仓库里没有更早的提交时，用空树作为基线。
7. 逐个文件执行 `git diff <基线> -- <文件>`，得到从基线到当前工作树的累积 diff。
8. 打印汇总头部与逐文件的 diff。

## 输出格式

```
User: <name> <<email>>
Range: <since> ~ now
Base: <hash>
Changed files: N (committed: M, uncommitted: K)
============================================================

--- path/to/file1 [committed] ---
<从基线到工作树的累积 diff>

--- path/to/file2 [committed, uncommitted] ---
<从基线到工作树的累积 diff>
```

补充说明：

- `Base` 显示 `(empty tree — before repo history)` 表示该时间范围之前仓库还没有任何提交。
- 截止时间是过去时间时，额外打印 `(uncommitted changes excluded — --until is a past date)`。
- 范围内没有找到提交时，额外打印 `Note: No commits found for ...` 与 `Repo commit span: <最早提交> ~ <最晚提交>`，便于校正时间范围。
- 文件被删掉时标注 `(file deleted in working tree, showing last committed content)`；未提交就被删掉的文件标注 `(uncommitted file deleted in working tree)`。
- 某个文件相对基线没有差异时标注 `(no diff from base)`。
- 每个文件只出现一次，标签组合反映它是否同时出现在已提交与未提交列表里。

## 产物与日志

脚本把结果打到**标准输出**，不写文件，也不接受 `--output` 参数。落盘由调用方完成：

| 类别 | 路径 |
|------|------|
| 持久产物（变更汇总） | `ae/my-code-changes/<名称>-<时间戳>.md` |
| 日志 | `ae/logs/my-code-changes/` |

做法：先用宿主的命令执行能力跑脚本并把标准输出重定向到 `ae/my-code-changes/` 下的文件，再把同一次运行的命令、时间范围、退出码记进 `ae/logs/my-code-changes/`。产物正文保持脚本的原始格式（头部 + 逐文件 diff），便于回溯。

## 局限性

- `git diff` 基于树状态对比，同一文件在时间范围内若被他人也改过，diff 里会包含他人的改动部分。这是 git diff 的固有行为，无法用 `--author` 过滤。
- 二进制文件无法显示有意义的 diff，git 会标注为 binary。
- 文件重命名可能被 git 识别成 delete + add，旧路径与新路径会各自出现一次。
- 增量区间按提交时间与作者过滤，与"文件当前内容"是两件事：基线之后被回滚掉的改动不会出现在 diff 里。

## 校验

1. 在当前仓库跑一次脚本，确认能正确列出本人变更文件。
2. 确认未提交的文件也被包含（`until` 省略时）。
3. 确认同一文件多次提交只出现一次，且输出的是累积 diff。
