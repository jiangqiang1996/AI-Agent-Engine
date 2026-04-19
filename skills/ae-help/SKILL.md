---
name: ae:help
description: "列出 AE 插件中所有可主动调用的技能和代理，以及其帮助描述。"
---

# AE Help

列出当前 AE 插件中所有支持主动调用的技能和代理。

## 第一步：扫描技能

使用 Bash 工具扫描 `skills/` 目录下所有 `SKILL.md` 文件的 frontmatter，提取 `name` 和 `description`：

```bash
ls skills/*/SKILL.md
```

对每个 `SKILL.md` 文件，读取其 frontmatter 中的 `name` 和 `description` 字段。

如果用户传入了参数（如技能名或关键词），只展示匹配的结果；否则展示全部。

## 第二步：扫描代理

使用 Bash 工具扫描 `agents/` 目录下所有 `.md` 文件的 frontmatter，提取 `name` 和 `description`：

```bash
ls agents/*/*.md
```

对每个代理文件，读取其 frontmatter 中的 `name` 和 `description` 字段。

如果用户传入了参数，只展示匹配的结果；否则展示全部。

## 第三步：扫描命令

使用 Bash 工具扫描 `commands/` 目录下所有 `.md` 文件的 frontmatter，提取命令名（文件名去掉 `.md`）、`description` 和 `argument-hint`：

```bash
ls commands/*.md
```

## 第四步：输出结果

按以下格式输出，分组展示：

### 技能（Skill）

使用 `skill` 工具按需加载，或通过命令触发。

| 技能 | 命令 | 说明 |
| --- | --- | --- |
| `ae:brainstorm` | `/ae-brainstorm` | 通过协作对话探索需求和方案... |
| ... | ... | ... |

### 代理（Agent）

通过 `@<代理名>` 在会话中主动调用。

| 代理 | 说明 |
| --- | --- |
| `@correctness-reviewer` | 审查代码中的逻辑错误、边界情况... |
| ... | ... |

### 命令（Command）

直接在输入框输入 `/ae-<名称>` 触发。

| 命令 | 说明 | 参数提示 |
| --- | --- | --- |
| `/ae-brainstorm` | ... | `[功能想法或待探索的问题]` |
| ... | ... | ... |

## 第五步：附加帮助

如果用户传入了特定技能名或代理名作为参数，在列表之外额外展示该条目的详细用法：

- 技能：展示对应 `SKILL.md` 的完整内容
- 代理：展示对应 `.md` 文件的完整内容
- 命令：展示对应命令文件的完整内容

## 匹配规则

参数匹配时，支持以下形式：
- 精确名称：如 `ae:brainstorm`、`correctness-reviewer`、`/ae-lfg`
- 关键词：在 `name` 和 `description` 中做模糊匹配
- 分类关键词：如 `审查`、`研究`、`代码`、`文档` 等自动匹配对应分类
