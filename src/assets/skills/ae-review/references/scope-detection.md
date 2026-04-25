# 范围检测

审查范围的确定流程。按以下优先级执行。

## 状态文件

审查完成后将当前 HEAD 的 commit hash 和时间戳写入 `.opencode/review-state.json`（本地存储，不提交到仓库）。

状态文件格式：
```json
{ "branch": "<branch-name>", "lastReviewed": "<commit-hash>", "lastReviewTime": "<ISO-8601>" }
```

读取时校验：当前分支名与 `branch` 字段是否匹配。不匹配则视为首次运行（防止跨分支状态混淆）。

## 检测优先级

### 优先级 1：显式指定

`from:<ref>` 参数存在时，直接使用指定 ref 作为基准，跳过所有检测。`base:<ref>` 映射到 `from:<ref>` 保持兼容。

### 优先级 2：状态文件

状态文件存在且 `lastReviewed` 有效时：

| 条件 | 行为 |
|------|------|
| HEAD == lastReviewed 且无暂存/未暂存/未跟踪变更 | **审查最近 10 次提交**（`recent:10`） |
| HEAD == lastReviewed 但有工作区变更 | 仅审查工作区变更 |
| HEAD ≠ lastReviewed | `git diff lastReviewed..HEAD` + 工作区变更 |

用户可通过 `from:<ref>` 或项目配置选择不触发全项目审查。

### 优先级 3：首次运行

状态文件不存在时，按顺序尝试：

1. 项目配置 `review.defaultBase` 存在 → 用它做 merge-base
2. 运行 `references/resolve-base.sh` 自动检测（平台无关）→ 用检测结果
3. 都失败 → 友好降级（提供选项：审查最近 N 次提交 / 仅审查工作区 / 手动指定 / 查看提交历史）

## 范围参数

支持外部传入范围参数，跳过自动检测：

- `from:<ref>` — 从指定 commit hash 或分支名开始审查（`base:<ref>` 映射到 `from:` 保持兼容）。输入必须为合法 Git ref 格式，拒绝包含 shell 元字符（`;|&$\`` 等）的输入以防注入
- `recent:<N>` — 审查最近 N 次提交。N 必须为正整数，无效输入回退到默认值 10 并提示用户
- `full` — 审查所有 Git 跟踪文件（受全局排除约束）
- `full:<path>` — 审查指定路径下的所有 Git 跟踪文件（受全局排除约束）

## 状态文件更新

审查完成后更新状态文件：
- 将当前 HEAD commit hash 写入 `lastReviewed`
- 更新 `lastReviewTime` 为当前时间

## 范围分类

### 主要（直接变更的内容）

新增或修改的行。使用完全置信度。

### 次要（紧邻的周围代码）

与变更行处于同一函数或代码块中的未变更代码。如果变更引入的 bug 只有通过阅读上下文才能发现，则报告。

### 预存（与本次变更无关）

未触及且不与之交互的未变更代码。标记 `pre_existing: true`，不计入审查结论。

**规则：** 如果在不含该 diff 时也会标记同一问题，则它是预存的。如果 diff 使问题变得新相关，则它是次要的。
