---
description: 安全清理本地分支、worktree 及其对应的本地目录
model: $standard
subtask: false
---

安全清理当前仓库中的本地分支、关联 worktree 及其对应的本地目录。必须根据 `$ARGUMENTS` 判断清理范围，并在执行任何删除前取得用户明确授权。

## 输入处理

- `$ARGUMENTS` 为空：候选范围为当前分支之外的其余所有本地分支、关联 worktree 和对应本地目录。
- `$ARGUMENTS` 为一个本地分支名：候选范围为该本地分支、该分支关联的 worktree 和对应本地目录。
- `$ARGUMENTS` 为一个 worktree 名或路径：候选范围为匹配到的 worktree、该 worktree 当前绑定的本地分支和该 worktree 本地目录。
- `$ARGUMENTS` 为一个本地文件或目录路径：候选范围为包含该路径的 worktree、本地分支和对应本地目录。
- `$ARGUMENTS` 只能指定一个目标；如果传入多个目标或无法唯一匹配，必须停止并请求用户明确目标。

## 执行目标

- 只操作本地 worktree、本地分支和本地文件系统路径。
- 不操作任何远程分支，不执行 push，不创建 PR。
- 定向模式下，在通过风险检查并获得授权后，删除与匹配目标相关的三类对象：worktree、本地分支、本地文件路径。
- 空参数模式下，在确认后删除当前分支之外的其余所有本地分支、关联 worktree 和对应本地目录。
- 三类删除步骤互相独立；获得授权后，某一步失败不能阻止继续尝试其他已授权删除步骤，但最终必须报告每一步结果。

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
- `$ARGUMENTS` 的解析结果：空参数、分支名、worktree 名、worktree 路径或本地文件路径。
- 候选删除的本地分支名。
- 候选删除的 worktree 路径。
- 候选删除的本地文件或目录路径。
- 候选 worktree 是否存在未提交变更、未跟踪文件或未推送提交。

### 2. 目标解析

按以下规则解析 `$ARGUMENTS`：

- 空参数：从 `git worktree list --porcelain` 和 `git branch --format="%(refname:short)"` 中选出当前分支之外的本地分支及其 worktree。
- 分支名：必须能在本地分支列表中唯一匹配；如果该分支是当前分支，必须停止并请求用户确认是否真的要删除当前分支相关路径。
- worktree 名或路径：必须能在 `git worktree list --porcelain` 中唯一匹配；匹配后读取该 worktree 的 `branch` 字段确定本地分支。
- 本地文件或目录路径：必须先确认路径存在，再定位它所属的 worktree；不能仅凭路径字符串猜测。
- 若目标没有关联分支、关联 worktree 或可删除的本地路径，仍应将已识别对象保留为候选，并在清单中标注缺失项。

### 3. 风险检查

删除前必须逐项检查候选对象：

- 对每个候选 worktree 运行 `git status --short`。
- 对每个候选分支确认是否仍被 worktree 占用。
- 对每个候选分支检查是否存在未合并到当前分支的提交。
- 对每个候选本地路径确认它位于当前仓库 worktree 范围内，避免删除仓库外路径。
- 如存在未提交变更、未跟踪文件、未合并提交或路径不明确，必须停止并说明风险，不能自动删除。

### 4. 授权确认

执行任何 `git worktree remove`、`git branch -d`、`git branch -D`、`Remove-Item` 或其他文件删除命令前，必须向用户展示完整候选清单和将要执行的完整命令，并取得明确授权。

授权必须覆盖：

- 目标仓库路径。
- 要删除的 worktree 路径。
- 要删除的本地分支名。
- 要删除的本地文件或目录路径。
- 每一条具体 Git 或文件删除命令。
- 是否允许强制删除分支、worktree 或本地文件路径。

未获得明确授权时，只输出建议命令，不执行删除。

### 5. 执行清理

获得授权后按步骤独立执行；每一步失败都记录失败原因，然后继续尝试后续已授权步骤：

```bash
git worktree remove <候选 worktree 路径>
git branch -d <候选分支名>
Remove-Item -LiteralPath <候选本地文件或目录路径> -Recurse
git worktree prune
```

仅当用户明确授权强制清理时，才允许使用：

```bash
git worktree remove --force <候选 worktree 路径>
git branch -D <候选分支名>
Remove-Item -LiteralPath <候选本地文件或目录路径> -Recurse -Force
```

禁止默认执行 `git reset --hard`、`git clean -fd`、覆盖 checkout、rebase、push、force push 或修改 Git 配置；禁止使用 `--no-verify` 等方式跳过 Git hooks，也不得省略本文档要求的风险检查、授权确认或结果验证。

### 6. 验证结果

清理后运行：

```bash
git worktree list --porcelain
git branch --format="%(refname:short)"
git status --short --branch
```

最终回复必须包含：

- 已删除、删除失败和未尝试删除的 worktree 路径。
- 已删除、删除失败和未尝试删除的本地分支。
- 已删除、删除失败和未尝试删除的本地文件或目录路径。
- 每个失败项的原因。
- 实际执行过的命令。
- 验证命令与结果摘要。

## 安全边界

- 不删除远程分支，不执行 push，不创建 PR。
- 不修改 Git 配置，不跳过 hooks。
- 不把“用户想清理”视为强制删除授权；强制删除必须单独确认。
- 空参数模式必须先展示候选清单并确认，不能静默删除当前分支之外的所有对象。
- 删除当前分支、当前 worktree 或当前工作目录下的文件前，必须单独进行高风险确认。
- 文件删除只能针对已解析出的相关 worktree 或用户明确指定且位于仓库 worktree 范围内的本地路径。
