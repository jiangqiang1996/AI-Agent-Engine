# AE 内置配置

本文说明 AI Agent Engine（AE）在 opencode 插件 `config` 钩子中注入的默认配置，以及用户如何通过可选的 `ae.jsonc` 覆盖这些默认值。这里描述的是 AE 运行时配置入口，不要求业务项目采用本仓库源码结构。

AE 会在插件 `config` 钩子里注入一组最低优先级的默认配置，通过 `ae.jsonc` 管理。当前支持两个顶层配置节点：

| 节点 | 作用 |
| --- | --- |
| `mcp` | 内置 MCP 默认值 |
| `modelScenarios` | 模型场景路由映射 |

## 内置 MCP

AE 会在插件 `config` 钩子里注入一组最低优先级的 MCP 默认值，当前内置配置包含：

| 名称 | 类型 | 作用 |
| --- | --- | --- |
| `context7` | `remote` | 获取最新的库/框架文档 |
| `gh_grep` | `remote` | 搜索真实的 GitHub 代码示例 |

MCP 默认配置由三层可选 `ae.jsonc` 合并而来，并通过本地 `ae.schema.json` 作为 `$schema`。除本节说明的 `mcp` 外，AE 还支持下文说明的 `modelScenarios` 节点。

## 优先级

`ae.jsonc` 的来源和优先级如下：

```text
插件内置 ae.jsonc
  -> 全局 ~/.config/opencode/ae.jsonc
  -> 项目级 .opencode/ae.jsonc
  -> opencode 已传入插件钩子的既有 config.mcp
```

项目级和全局 `ae.jsonc` 是 AE 支持的可选配置入口；项目不存在这些文件时会自然使用低优先级默认值。

三层 builtin 配置的合并规则如下：

1. 对象递归合并，未声明字段保留低优先级值。
2. 数组、标量、`null` 和类型冲突由高优先级整值替换。
3. 三层 builtin 内部同名 MCP 的 `type` 相同时按对象规则合并。
4. 三层 builtin 内部同名 MCP 的 `type` 不同时由高优先级整条替换，避免 `local` 和 `remote` 字段混合。
5. 如果 opencode 已传入插件钩子的既有 `config.mcp` 存在同名 MCP，整条采用 opencode 既有配置，不从 builtin 同名项补字段。

AE 不读取或合并项目级、全局 `opencode.json`；这部分优先级由 opencode 自身在进入插件前处理。

## 禁用内置 MCP

可以在项目级 `.opencode/ae.jsonc` 中只覆盖需要调整的字段：

```jsonc
{
  "mcp": {
    "context7": {
      "enabled": false
    }
  }
}
```

也可以在 `opencode.json` 中声明同名 MCP。此时 opencode 既有配置整条优先，必须写出该 MCP 运行所需字段：

```json
{
  "mcp": {
    "context7": {
      "type": "remote",
      "url": "https://mcp.context7.com/mcp",
      "enabled": false
    }
  }
}
```

## 覆盖内置 MCP

项目级 `.opencode/ae.jsonc` 只能覆盖已有 MCP 的安全字段：

1. `enabled: false` 用于禁用已有 MCP。
2. `timeout` 用于调整超时，必须是 `1000` 到 `120000` 之间的整数毫秒。

```jsonc
{
  "mcp": {
    "gh_grep": {
      "timeout": 10000
    }
  }
}
```

项目级配置不能新增 MCP，不能覆盖 `type`、`url`、`command`、`headers`，也不能把 `enabled` 设置为 `true`。

remote MCP 的最终 URL 当前允许 `http` / `https`，建议优先使用 `https`，避免明文传输暴露请求内容、响应内容或元数据。URL 不能包含内嵌凭证，也不能使用本机、内网、链路本地、云 metadata、运营商级 NAT、benchmark 等特殊用途 IP 字面量。域名会按域名字面量注册；AE 不在配置合并阶段解析 DNS，因此不要把解析到内网或本机地址的域名写入全局 remote MCP。

全局 `~/.config/opencode/ae.jsonc` 可以新增或替换 builtin MCP 条目：

```jsonc
{
  "mcp": {
    "gh_grep": {
      "type": "remote",
      "timeout": 10000
    }
  }
}
```

如果需要把同名远程 MCP 改成本地 MCP，应在全局 `ae.jsonc` 或 opencode 既有 `config.mcp` 中直接替换类型：

```json
{
  "mcp": {
    "context7": {
      "type": "local",
      "command": ["node", "./scripts/context7-mcp.js"],
      "enabled": true
    }
  }
}
```

# 模型场景路由

AE 支持通过 `modelScenarios` 将不同任务场景映射到不同模型，让内置命令和代理在注册时自动注入对应的 `model`。

## 工作原理

AE 内置命令通过 catalog 声明模型场景（如 `/ae-plan` 声明 `deep`、`/ae-help` 声明 `quick`）。内置代理通过各自 Markdown frontmatter 的 `model` 声明模型引用。插件在注册时会查询 `modelScenarios` 配置：命中则注入对应模型；未命中稳定场景时不写入 `model` 字段，继承 opencode 当前默认模型。

## 稳定场景

| 场景 | 用途 | 典型模型特征 |
| --- | --- | --- |
| `quick` | 快速响应（`/ae-help`、`/ae-prompt-optimize`） | 低延迟、低成本 |
| `standard` | 常规任务（`/ae-ideate`、`/ae-brainstorm`、`/ae-sql`） | 平衡性能与质量 |
| `deep` | 深度推理（`/ae-plan`、`/ae-work`、`/ae-review`、`/ae-lfg`） | 强推理、长上下文 |
| `vision` | 视觉任务（`/ae-test-browser`、`/ae-frontend-design`） | 支持图片输入 |

允许使用自定义场景键，但 AE 内置资产首版只依赖上述四个稳定场景。

## 配置方式

在 `ae.jsonc` 中添加 `modelScenarios` 字段，将场景键映射到模型标识字符串：

```jsonc
{
  "modelScenarios": {
    "quick": "openrouter/google/gemini-2.5-flash",
    "standard": "openrouter/anthropic/claude-sonnet-4",
    "deep": "openrouter/anthropic/claude-sonnet-4",
    "vision": "openrouter/google/gemini-2.5-flash"
  }
}
```

值必须是非空字符串，不支持 fallback、capabilities、params 或动态路由策略。

Agent Markdown 和命令 Markdown 的 frontmatter 也可以声明 `model`：

```yaml
---
description: 示例代理或命令
model: $deep
---
```

- `model: $deep` 这类 `$` 前缀的值会按 `modelScenarios.deep` 解析。
- `model: anthropic/claude-sonnet-4-20250514`、`model: standard` 这类不以 `$` 开头的值会直接透传给 opencode，不由 AE 校验是否存在。
- `$quick`、`$standard`、`$deep`、`$vision` 等稳定场景未配置时不会写入 `model` 字段，继承 opencode 当前默认模型。
- 自定义 `$` 变量未配置时会将变量字符串原样作为 `model` 传给 opencode，不由 AE 提示或校验是否存在。

## 三层优先级

`modelScenarios` 与 MCP 配置共用同一套 `ae.jsonc` 三层合并机制：

```text
插件内置 ae.jsonc（无默认 modelScenarios）
  -> 全局 ~/.config/opencode/ae.jsonc
  -> 项目级 .opencode/ae.jsonc
```

项目级覆盖全局，全局覆盖插件内置。未配置的场景键继承 opencode 当前默认模型。

完整覆盖链路如下：

| 来源 | 作用 |
| --- | --- |
| 插件内置 `ae.jsonc` | 最低优先级默认配置；当前不提供默认 `modelScenarios` |
| 全局 `~/.config/opencode/ae.jsonc` | 提供跨项目默认模型场景 |
| 项目级 `.opencode/ae.jsonc` | 覆盖当前项目的模型场景 |
| 命令或代理 Markdown frontmatter | 本地重写内置命令/代理时，可用 `model` 覆盖该资产的默认场景引用 |
| `opencode.json` 中显式 `command` / `agent` `model` | 最终覆盖 AE 场景路由 |

## 覆盖与降级

- 用户在 `opencode.json` 的 `command` 或 `agent` 中显式指定 `model` 时，用户配置最终覆盖场景路由。
- 项目级或全局命令 Markdown 重写内置命令时，可通过 frontmatter `model` 覆盖该命令的默认场景路由。
- 未配置任何 `modelScenarios` 时，内置命令和代理声明的 `$quick`、`$standard`、`$deep` 或 `$vision` 不会写入最终 `model` 字段，继承 opencode 当前默认模型。
- `vision` 仅表示视觉任务场景，首版不探测模型是否支持图像输入。

## 内置资产场景清单

| 资产 | 场景 |
| --- | --- |
| `/ae-ideate`、`/ae-brainstorm`、`/ae-setup`、`/ae-handoff`、`/ae-sql`、`/ae-swagger-parser`、`/ae-save-experience`、`/ae-skill-from-session`、`/ae-update`、`/ae-ideate-po`、`/ae-brainstorm-po`、`/ae-ideate-pa`、`/ae-brainstorm-pa` | `standard` |
| `/ae-document-review`、`/ae-plan`、`/ae-refactor`、`/ae-work`、`/ae-merge-branch`、`/ae-review`、`/ae-lfg`、`/ae-task-loop`、`/ae-plan-po`、`/ae-refactor-po`、`/ae-work-po`、`/ae-lfg-po`、`/ae-task-loop-po`、`/ae-plan-pa`、`/ae-refactor-pa`、`/ae-work-pa`、`/ae-lfg-pa`、`/ae-task-loop-pa` | `deep` |
| `/ae-prompt-optimize`、`/ae-prompt-optimize-auto`、`/ae-help` | `quick` |
| `/ae-test-browser`、`/ae-frontend-design`、`/ae-frontend-design-po`、`/ae-frontend-design-pa` | `vision` |
| `@repo-research-analyst`、`@web-researcher` | `standard` |
| `@design-iterator`、`@figma-design-sync` | `vision` |
| 其他内置代理 | `deep`（默认） |
| 未列出的内置命令 | 继承 opencode 当前默认模型 |
