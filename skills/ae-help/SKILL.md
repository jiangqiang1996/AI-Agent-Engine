---
name: ae:help
description: "列出 AE 插件中所有可主动调用的技能和代理，以及其帮助描述。"
argument-hint: "[技能名或关键词]"
---

# AE 帮助信息

列出当前 AE 插件中所有支持主动调用的技能和代理。

## 第一步：扫描技能

扫描 `skills/` 目录下所有 `SKILL.md` 文件的 frontmatter，提取 `name` 和 `description`：

```bash
ls skills/*/SKILL.md
```

如果用户传入了参数（如技能名或关键词），只展示匹配的结果；否则展示全部。

## 第二步：扫描代理

扫描 `agents/` 目录下所有 `.md` 文件的 frontmatter，提取 `name` 和 `description`：

```bash
ls agents/*/*.md
```

如果用户传入了参数，只展示匹配的结果；否则展示全部。

## 第三步：扫描命令

扫描 `commands/` 目录下所有 `.md` 文件，提取命令名、`description` 和 `argument-hint`：

```bash
ls commands/*.md
```

## 第四步：输出结果

按以下格式分组展示：

### 技能

| 技能 | 命令 | 说明 |
| --- | --- | --- |
| `ae:ideate` | `/ae-ideate` | 生成并批判性评估关于某个主题的落地想法 |

### 代理

通过 `@<代理名>` 在会话中主动调用。

| 代理 | 说明 |
| --- | --- |
| `@correctness-reviewer` | 审查代码中的逻辑错误... |

### 命令

| 命令 | 说明 | 参数提示 |
| --- | --- | --- |
| `/ae-brainstorm` | ... | `[功能想法或待探索的问题]` |

## 第五步：附加帮助

如果用户传入了特定技能名或代理名作为参数，在列表之外额外展示该条目的完整内容。

## 匹配规则

参数匹配时支持：
- 精确名称：如 `ae:brainstorm`、`correctness-reviewer`、`/ae-lfg`
- 关键词：在 `name` 和 `description` 中做模糊匹配
- 分类关键词：如 `审查`、`研究`、`代码` 等自动匹配对应分类
