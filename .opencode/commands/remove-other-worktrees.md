---
description: 安全清理 master 以外的本地 worktree 和分支
model: $standard
subtask: false
---

安全清理当前仓库中 `master` 以外的本地 worktree、本地分支及对应本地目录。

## 执行目标

- 保留当前仓库的 `master` 分支和它绑定的 worktree。
- 移除所有非 `master` 本地分支绑定的 worktree。
- 在 worktree 移除成功后，再删除对应的非 `master` 本地分支。
- 如果不存在非 `master` 的本地分支或 worktree，只报告无需操作，不执行删除。

## 执行流程

### 1. 状态盘点

先只读检查当前仓库状态，不做任何删除：

```bash
git status --short --branch
git worktree list --porcelain
git branch --format="%(refname:short)"
```

识别并展示：

- 当前仓库路径和当前分支。
- 将保留的 `master` 分支及其 worktree。
- 候选删除的非 `master` 本地分支。
- 候选删除的非 `master` worktree 路径。
- 候选 worktree 是否存在未提交变更、未跟踪文件或未推送提交。

### 2. 风险检查

删除前必须逐项检查候选对象：

- 对每个候选 worktree 运行 `git status --short`。
- 对每个候选分支确认是否仍被 worktree 占用。
- 对每个候选分支检查是否存在未合并到 `master` 的提交。
- 如存在未提交变更、未跟踪文件、未合并提交或路径不明确，必须停止并说明风险，不能自动删除。

### 3. 授权确认

执行任何 `git worktree remove`、`git branch -d`、`git branch -D` 或文件删除命令前，必须向用户展示完整候选清单和将要执行的完整命令，并取得明确授权。

授权必须覆盖：

- 目标仓库路径。
- 要删除的 worktree 路径。
- 要删除的本地分支名。
- 每一条具体 Git 或文件删除命令。
- 是否允许强制删除分支或 worktree。

未获得明确授权时，只输出建议命令，不执行删除。

### 4. 执行清理

获得授权后按顺序执行：

```bash
git worktree remove <候选 worktree 路径>
git branch -d <候选分支名>
git worktree prune
```

仅当用户明确授权强制清理时，才允许使用：

```bash
git worktree remove --force <候选 worktree 路径>
git branch -D <候选分支名>
```

禁止默认执行 `git reset --hard`、`git clean -fd`、覆盖 checkout、rebase、push、force push 或修改 Git 配置。

### 5. 验证结果

清理后运行：

```bash
git worktree list --porcelain
git branch --format="%(refname:short)"
git status --short --branch
```

最终回复必须包含：

- 已删除的 worktree 路径和分支。
- 已保留的 `master` worktree。
- 未删除的候选项及原因。
- 实际执行过的命令。
- 验证命令与结果摘要。

## 安全边界

- 不删除 `master` 分支或它绑定的 worktree。
- 不删除远程分支，不执行 push，不创建 PR。
- 不修改 Git 配置，不跳过 hooks。
- 不把“用户想清理”视为强制删除授权；强制删除必须单独确认。
- 如果当前仓库没有 `master` 分支，必须停止并询问用户是否改用其他保留分支，不能自行改用 `main` 或当前分支。
