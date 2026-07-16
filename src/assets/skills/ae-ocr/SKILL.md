---
name: ae:ocr
description: "通过 ae-ocr 工具调用 OpenCodeReview (ocr) CLI 执行 AI 代码审查。自动从 opencode provider 配置获取 LLM 凭据，支持 OCR 所有命令（review/scan/config/llm/rules/viewer/session/version）。输出结构化审查发现，按 severity 分组。适用于代码变更审查、代码与目标期望一致性验证。"
argument-hint: "[command=review] [from=main] [to=branch] [background=...] [路径...]"
---

# ae:ocr - OpenCodeReview 代码审查

通过 `ae-ocr` 工具调用 [OpenCodeReview](https://github.com/alibaba/open-code-review) (`ocr`) CLI 执行 AI 代码审查。ocr 二进制随插件自动安装，LLM 凭据自动从 opencode provider 配置获取，无需手动配置。

## 何时使用

- 审查 Git 代码变更（staged/unstaged/untracked、branch diff、单 commit）
- 审查整个文件或目录（无 Git 历史场景）
- 审查代码与目标期望是否一致（通过 `background` 参数传入需求上下文）
- 管理 OCR 配置、检查 LLM 连通性、查看审查会话

## 何时不使用

- 需求/设计/原型文档审查用 `ae:review`
- 非代码文件的审查

## 工作流

### 第一步：收集业务上下文

分析审查目标（commit、branch 或工作区变更），提取简明业务上下文。通过 `background` 参数传入，提升审查质量。

如果项目中存在 `ae/prds/` 或 `ae/designs/` 产物，可提取需求和验收标准作为上下文，审查代码是否实现了预期功能。

### 第二步：执行代码审查

通过 `ae-ocr` 工具调用，参数使用 `key=value` 格式。**始终传入业务上下文**（当可用时）。

**输出模式**：始终使用 `--audience agent`（工具默认）以抑制进度 UI，仅输出最终摘要。不要使用 `--audience human`，它会流式输出进度 UI 污染输出。

### 第三步：分类和报告

对审查输出中的每条发现，按优先级分类并报告：

- **High**: 明显 bug、安全问题、明确错误或有充分依据的修复建议
- **Medium**: 合理但依赖上下文的建议、风格/性能优化、需手动实现的修复
- **Low**: 可能的误报、上下文不足、吹毛求疵或无意义的建议（静默丢弃）

按优先级分组展示所有发现。

### 第四步：修复

应用修复前，检查用户是否要求自动修复：

- 用户明确要求"审查并修复"时，继续自动修复
- 用户只要求"审查"时，先征求许可再修改

修复时：
- 聚焦 High 和 Medium 优先级项
- 安全且明确的修复直接应用
- 复杂修复清晰描述需要做什么
- 提交前始终与用户确认修复

## 命令清单

支持 OCR 所有命令。`command=auto`（默认）时根据参数自动推断。

| 命令 | 说明 |
|------|------|
| `review` | 基于 Git diff 审查代码变更 |
| `scan` | 审查整个文件或目录（无需 Git diff） |
| `config` | 管理 OCR 配置（set/unset/provider/model） |
| `llm` | LLM 工具（test/providers） |
| `rules` | 检查规则匹配 |
| `viewer` | 启动 WebUI 会话查看器（阻塞型服务） |
| `session` | 列出/查看审查会话 |
| `version` | 显示版本信息 |

### review 参数

| 参数 | 说明 |
|------|------|
| `from` | 源 ref（如 `main`），用于 branch diff |
| `to` | 目标 ref（如 `feature-branch`），用于 branch diff |
| `commit` | 单个 commit hash |
| `background` | 业务/需求上下文 |
| `backgroundFile` | 从 Markdown 文件加载业务上下文（最多 8000 字符） |
| `rule` | 自定义规则 JSON 文件路径 |
| `exclude` | 排除模式（逗号分隔 gitignore 风格） |
| `timeout` | 超时分钟数，默认 10 |
| `concurrency` | 并发文件审查数，默认 8 |
| `model` | 覆盖 LLM 模型 |
| `preview` | 预览将审查的文件（不调用 LLM） |
| `resume` | 从之前的审查会话恢复 |
| `audience` | 输出受众，默认 `agent` |

### scan 参数

| 参数 | 说明 |
|------|------|
| `path` | 扫描路径（逗号分隔） |
| `exclude` | 排除模式 |
| `noPlan` | 跳过 per-file PLAN 预处理 |
| `noDedup` | 跳过 per-batch 去重 |
| `noSummary` | 跳过项目级摘要 |
| `batch` | 批处理策略：none/by-language/by-directory |
| `maxTokensBudget` | token 总量上限 |
| `preview` | 预览将扫描的文件（不调用 LLM） |

### config 参数

| 参数 | 说明 |
|------|------|
| `configSubcommand` | 子命令：set/unset/provider/model |
| `key` | set/unset 的键名 |
| `value` | set 的值 |

### llm 参数

通过 `args=["test"]` 或 `args=["providers"]` 指定子命令。

### rules 参数

| 参数 | 说明 |
|------|------|
| `path` | 要检查的文件路径 |

### session 参数

| 参数 | 说明 |
|------|------|
| `sessionSubcommand` | 子命令：list/show |
| `sessionId` | show 的会话 ID |
| `limit` | list 限制数量 |
| `json` | 输出 JSON 格式 |

### viewer 参数

| 参数 | 说明 |
|------|------|
| `addr` | 监听地址，默认 localhost:5483 |

### 高级参数（review/scan 通用）

| 参数 | 说明 |
|------|------|
| `tools` | 自定义工具配置 JSON 文件路径 |
| `maxTools` | 每个文件最大工具调用轮次（0=模板默认，最小 10） |
| `maxGitProcs` | 最大并发 git 子进程数，默认 16 |

### 直接透传

通过 `args` 参数数组可透传任意 OCR CLI 参数，如 `args=["--from","main","--to","feature"]`。

## 常用调用模式

| 场景 | 参数 |
|------|------|
| 审查当前工作区变更 | `command=review` |
| 审查 branch diff | `command=review from=main to=feature-branch` |
| 审查单 commit | `command=review commit=abc123` |
| 审查与目标一致性 | `command=review background="需求描述..."` |
| 全文件扫描 | `command=scan path=src/` |
| 预览将审查的文件 | `command=review preview=true` |
| 检查 LLM 连通性 | `command=llm args=["test"]` |
| 列出审查会话 | `command=session sessionSubcommand=list` |
| 查看规则匹配 | `command=rules path=src/Foo.java` |

## 输出格式

每个发现包含：
- `path`: 文件路径
- `start_line` / `end_line`: 行范围（均为 0 表示定位失败）
- `content`: 审查意见
- `category`: bug/security/performance/maintainability/test/style/documentation/other
- `severity`: critical/high/medium/low
- `suggestion_code`: 可选的修复建议
- `existing_code`: 可选的原始代码片段
- `thinking`: 可选的 LLM 推理过程

审查结果按 severity 分组返回：

```markdown
## OCR 代码审查结果

**审查文件数**: N
**发现问题数**: X high / Y medium / Z low

### High Priority

- **`path/to/file.java:42`** [bug] — 问题描述
  > 建议修复: `修复代码`
```

审查无问题时输出："审查完成 — N 个文件未发现问题。"

### 处理定位失败的发现

当 `start_line` 和 `end_line` 均为 `0` 时，表示定位失败：
1. 阅读发现内容理解问题
2. 检查发现中提到的目标文件
3. 根据发现上下文定位相关代码段
4. 将修复或建议应用到正确位置

## 自定义规则

OCR 按以下优先级解析规则：
1. `--rule <path>` 参数（最高）
2. `<repo>/.opencodereview/rule.json`
3. `~/.opencodereview/rule.json`
4. 内置系统默认规则（最低）

默认情况下，首个匹配的用户规则替换内置系统规则。设置 `merge_system_rule: true` 可同时包含系统规则和用户规则。

规则文件格式：

```json
{
  "rules": [
    {
      "path": "**/*.java",
      "rule": "All new methods must validate required parameters for null",
      "merge_system_rule": true
    },
    {
      "path": "**/*mapper*.xml",
      "rule": "Check SQL for injection risks and missing closing tags"
    }
  ]
}
```

通过 `command=rules path=src/Foo.java` 可预览某文件命中的规则。

## 注意事项

- **工作目录很重要** — `ocr review` 操作当前目录的 Git 仓库。用 `repo` 参数指定其他仓库。
- **工作区模式包含未跟踪文件** — 直接 `ocr review` 包含 staged、unstaged 和 untracked 变更。需要更窄范围时选择性 stage。
- **大 diff 可能触发 token 限制** — 大文件 diff 可能被截断。默认 `MAX_TOKENS` 为 58888。
- **50 行触发 Plan 阶段** — 超过 50 行变更的 diff 会先执行风险分析阶段，增加延迟但提升质量。
- **不要使用 `--audience human`** — 它会流式输出进度 UI 污染输出。始终使用 `--audience agent`（工具默认）。
- **评论语言跟随配置** — 默认中文，可通过 OCR 配置设为 English 或 Chinese。

## 验证

审查完成后，验证成功：
1. 命令退出码为 0
2. 生成了审查发现（或出现"No comments generated"消息）
3. 警告（如有）显示在 stderr 中

出错时检查 stderr 警告了解哪些文件失败及原因。

## 引用

- OCR 仓库: https://github.com/alibaba/open-code-review
- NPM 包: https://www.npmjs.com/package/@alibaba-group/open-code-review
- Issue 跟踪: https://github.com/alibaba/open-code-review/issues
