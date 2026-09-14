# ocr CLI 用法卡（open-code-review）

代码审查的上游 CLI：[open-code-review](https://github.com/alibaba/open-code-review)（`ocr`）。**直调 CLI，无包装层**——CLI 原生输出 Markdown（text 默认格式即 Markdown）、原生参数校验、原生退出码。delegate 委托模式只做确定性工程（文件选择 + 规则匹配），**不调用 LLM、无需 API key/baseURL/model**；审查执行由代理自身完成。

## 前置条件与自检

- **Git ≥ 2.41**
- `ocr` 已全局安装。第一步自检：

```bash
ocr version
```

未安装或不在 PATH 时提示安装：

```bash
npm i -g @alibaba-group/open-code-review
```

## delegate 两步流程（preview → rule → 自行审查）

### 第一步：获取审查文件清单

```bash
# 工作区变更（staged + unstaged + untracked，无 Git ref 时）
ocr delegate preview

# 分支 diff（from/to 必须成对）
ocr delegate preview --from main --to feature-branch

# 单 commit（与 --from/--to 互斥）
ocr delegate preview --commit abc123

# 带业务上下文 / 排除模式 / 自定义规则 / 指定仓库
ocr delegate preview --background "需求描述" --exclude "docs/**,*.md" --rule rules.json --repo /abs/path
```

输出（Markdown）包含：审查模式（workspace/range/commit）、可审查文件列表（`reviewable_files`，含变更统计）、排除文件列表（含排除原因 `exclude_reason`：unsupported_ext/user_exclude/default_path）、变更行数统计、merge_base 等字段。

### 第二步：获取审查规则

从 preview 结果中提取可审查文件路径，解析规则（paths 必填，至少 1 个）：

```bash
ocr delegate rule file1.ts file2.go
```

输出按 glob pattern 分组的规则（如 `**/*.{ts,js,tsx,jsx}`），每组含：适用文件列表 + 完整规则文本。不同后缀适用不同规则集。

### 第三步：执行审查

代理基于 preview 的文件清单和 rule 的规则文本直接执行审查：读取文件 diff（`git diff` / `git show`）→ 应用对应规则逐条检查 → 生成审查发现（findings schema）。

## 参数总表

| 参数 | 说明 |
|------|------|
| `--from` | 源 ref（如 `main`），用于 branch diff；**需与 `--to` 成对使用** |
| `--to` | 目标 ref（如 `feature-branch`） |
| `--commit` | 单个 commit hash；**与 `--from`/`--to` 互斥** |
| `--background` | 业务/需求上下文（内联文本）；另有从 Markdown 文件加载上下文的 background-file 形式 |
| `--exclude` | 排除模式（逗号分隔 gitignore 风格） |
| `--rule` | 自定义规则 JSON 文件路径 |
| `--repo` | Git 仓库根目录，默认当前工作目录 |
| `--format` | text/json，**默认 text 且输出即 Markdown**（优先使用默认） |

## 补充命令（delegate 之外）

| 命令 | 说明 |
|------|------|
| `ocr scan --preview` | **无 diff 全文件预检**：全文件扫描模式的文件预检，不依赖 git diff，输出总文件数/将审查文件清单。适合全量审查（full 模式）前确认范围 |
| `ocr rules check <path>` | 单文件规则速查：输出 File/Source/Pattern/Rule |
| `ocr session list` | 审查会话回放列表（另有 session viewer 提供 WebUI 查看器） |
| `ocr version` | 版本自检 |

注意：`--audience agent` 是 scan 子命令的 flag，**delegate 子命令不支持**（传入报 unknown flag），勿混用。

## 规则解析优先级

1. `--rule <path>` 参数（最高）
2. `<repo>/.opencodereview/rule.json`
3. `~/.opencodereview/rule.json`
4. 内置系统默认规则（最低）

规则文件格式见 [OCR 文档](https://github.com/alibaba/open-code-review)。

## 错误处理

- 参数错误由 CLI 原生校验并报错，**退出码 1**，错误信息可直接读懂并重试。常见：`Error: --to is required when --from is specified`（from/to 未成对）、`requires at least 1 argument(s)`（rule 缺 paths）、`only one review mode allowed`（commit 与 from/to 同传）、`read background file ... cannot find`（文件不存在）
- 成功退出码 0；出错时检查 stderr 了解失败原因
- 工作目录很重要：delegate preview 操作当前目录的 Git 仓库，其他仓库用 `--repo` 指定

## 验证

审查规格获取成功：① `ocr delegate preview` 退出码 0 且拿到可审查文件列表（或确认无变更）；② `ocr delegate rule` 退出码 0 且拿到规则组（或确认无匹配规则）。

## 引用

- OCR 仓库: https://github.com/alibaba/open-code-review
- NPM 包: https://www.npmjs.com/package/@alibaba-group/open-code-review
- Issue 跟踪: https://github.com/alibaba/open-code-review/issues
