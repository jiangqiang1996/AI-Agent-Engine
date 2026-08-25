---
name: ae:ocr
description: "通过 ae-ocr 工具调用 OpenCodeReview CLI 的 delegate 委托模式获取代码审查规格（文件清单 + 规则），不调用 LLM。OCR 负责确定性工程，审查由宿主代理执行。"
argument-hint: "[subcommand=preview|rule] [from=main] [to=branch] [paths=...]"
---

# ae:ocr - OpenCodeReview Delegate 代码审查

通过 `ae-ocr` 工具调用 [OpenCodeReview](https://github.com/alibaba/open-code-review) (`ocr`) CLI 的 **delegate 委托模式**获取代码审查规格。OCR 负责确定性工程（文件选择 + 规则匹配），不调用 LLM；审查执行由宿主代理（当前会话 LLM）完成。

## 何时使用

- 代码审查编排：先 preview 获取文件列表，再 rule 获取规则，最后由当前会话 LLM 执行审查
- 审查范围预检：preview 查看哪些文件会被审查、哪些被排除及原因
- 规则检查：rule 查看特定文件适用的审查规则
- 版本检查：version 查看 ocr 版本

## 何时不使用

- 需求/设计/原型文档审查用 `ae:review`
- 非代码文件的审查

## 工作流

### 第一步：获取审查文件清单

通过 `ae-ocr` 工具调用 delegate preview，参数使用 `key=value` 格式：

```
ae-ocr(command="delegate", subcommand="preview")
ae-ocr(command="delegate", subcommand="preview", from="main", to="feature-branch")
ae-ocr(command="delegate", subcommand="preview", commit="abc123")
ae-ocr(command="delegate", subcommand="preview", background="业务上下文描述")
```

输出包含：审查模式（workspace/range/commit）、可审查文件列表、排除文件列表（含排除原因）、变更行数统计。

### 第二步：获取审查规则

从 preview 结果中提取 `reviewable_files` 的文件路径，调用 delegate rule：

```
ae-ocr(command="delegate", subcommand="rule", paths=["file1.ts", "file2.ts"])
```

输出按 glob pattern 分组的规则，每组包含：适用文件列表 + 完整规则文本。不同后缀的文件适用不同规则集（如 .ts 用 TS/JS 规则、.go 用 Go 规则）。

### 第三步：执行审查

宿主代理（当前会话 LLM）基于 preview 的文件清单和 rule 的规则文本，直接执行审查：
1. 读取文件 diff（`git diff` / `git show`）
2. 应用对应规则逐条检查
3. 生成审查发现

## 命令清单

| 命令 | 别名 | 说明 |
|------|------|------|
| `delegate` | `d` | 委托模式：获取审查规格（文件清单 + 规则） |
| `version` | — | 显示 ocr 版本信息 |
| `completion` | — | 生成 shell 补全脚本（bash/zsh/fish/powershell） |

### delegate preview 参数

| 参数 | 说明 |
|------|------|
| `from` | 源 ref（如 `main`），用于 branch diff；需与 `to` 同时使用 |
| `to` | 目标 ref（如 `feature-branch`），用于 branch diff |
| `commit` | 单个 commit hash；与 `from`/`to` 互斥 |
| `background` | 业务/需求上下文（内联文本） |
| `backgroundFile` | 从 Markdown 文件加载业务上下文 |
| `exclude` | 排除模式（逗号分隔 gitignore 风格） |
| `rule` | 自定义规则 JSON 文件路径 |
| `format` | 输出格式 text/json，工具层默认 json（CLI 原生默认 text） |
| `timeout` | 超时分钟数，默认 1 |
| `repo` | Git 仓库根目录，默认当前工作目录 |
| `maxGitProcs` | 最大并发 git 子进程数，默认 16 |

### delegate rule 参数

| 参数 | 说明 |
|------|------|
| `paths` | 要解析规则的文件路径列表（数组，**必填**，至少 1 个） |
| `from` | 源 ref（与 preview 共享） |
| `to` | 目标 ref |
| `commit` | 单个 commit hash；与 `from`/`to` 互斥 |
| `background` | 业务上下文 |
| `backgroundFile` | 从文件加载业务上下文 |
| `exclude` | 排除模式 |
| `rule` | 自定义规则 JSON 文件路径 |
| `format` | 输出格式，工具层默认 json |
| `repo` | Git 仓库根目录，默认当前工作目录 |
| `maxGitProcs` | 最大并发 git 子进程数，默认 16 |

### completion 参数

| 参数 | 说明 |
|------|------|
| `shell` | 目标 shell：bash/zsh/fish/powershell，默认 bash |

### 额外参数透传（args）

`args` 数组追加给 ocr CLI，用于透传官方新增 flag：

```
command=delegate args=["--new-flag","value"]
```

## 常用调用模式

| 场景 | 参数 |
|------|------|
| 预览工作区审查文件 | `command=delegate subcommand=preview` |
| 预览分支 diff | `command=delegate subcommand=preview from=main to=feature-branch` |
| 预览单 commit | `command=delegate subcommand=preview commit=abc123` |
| 带业务上下文 | `command=delegate subcommand=preview background="需求描述"` |
| 获取文件审查规则 | `command=delegate subcommand=rule paths=["src/foo.ts"]` |
| 限制 git 并发 | `command=delegate subcommand=preview maxGitProcs=4` |
| 版本检查 | `command=version` |
| 透传额外参数 | `command=delegate args=["--new-flag"]` |

## 输出格式

### delegate preview 输出

```markdown
## OCR Delegate Preview — 审查文件清单

**审查模式**: workspace
**可审查文件**: 5
**排除文件**: 3

### 可审查文件
- `src/foo.ts` [modified] +20/-4
- `src/bar.ts` [added] +10/-0

### 排除文件
- ~~`docs/README.md`~~ [modified] +8/-8 (unsupported_ext)
```

### delegate rule 输出

```markdown
## OCR Delegate Rule — 审查规则解析

**规则组数**: 2

### 规则组 1: system / `**/*.{ts,js,tsx,jsx}`

**适用文件**:
- `src/foo.ts`

**规则内容**:
（完整规则文本）
```

## 自定义规则

OCR 按以下优先级解析规则：
1. `--rule <path>` 参数（最高）
2. `<repo>/.opencodereview/rule.json`
3. `~/.opencodereview/rule.json`
4. 内置系统默认规则（最低）

规则文件格式见 [OCR 文档](https://github.com/alibaba/open-code-review)。

## 注意事项

- **delegate 模式不调用 LLM** — OCR 只做文件选择和规则匹配，审查由宿主代理执行
- **无需 LLM 配置** — 不需要 API key/baseURL/model，delegate 模式不调用 LLM
- **审查模型 = 当前会话模型** — 保证审查模型与会话模型一致
- **from/to 必须成对使用** — 单独传 from 或 to 会报错；两者需同时指定
- **commit 与 from/to 互斥** — 不能同时指定 commit 和 from/to
- **rule 子命令的 paths 必填** — 至少需要 1 个文件路径，从 preview 的 reviewable_files 中提取
- **工作目录很重要** — delegate preview 操作当前目录的 Git 仓库。用 `repo` 参数指定其他仓库
- **工作区模式包含未跟踪文件** — 直接 `delegate preview` 包含 staged、unstaged 和 untracked 变更
- **排除原因透明** — preview 输出每个排除文件的 `exclude_reason`（unsupported_ext/user_exclude/default_path）

## 验证

审查完成后，验证成功：
1. delegate preview 退出码为 0
2. 获取到可审查文件列表（或确认无变更）
3. delegate rule 退出码为 0
4. 获取到规则组（或确认无匹配规则）

出错时检查 stderr 了解失败原因。

## 引用

- OCR 仓库: https://github.com/alibaba/open-code-review
- NPM 包: https://www.npmjs.com/package/@alibaba-group/open-code-review
- Issue 跟踪: https://github.com/alibaba/open-code-review/issues
