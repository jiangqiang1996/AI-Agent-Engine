# AE 内置 MCP

AE 会在插件 `config` 钩子里注入一组最低优先级的 MCP 默认值，当前内置配置包含：

| 名称 | 类型 | 作用 |
| --- | --- | --- |
| `context7` | `remote` | 获取最新的库/框架文档 |
| `gh_grep` | `remote` | 搜索真实的 GitHub 代码示例 |

默认配置由三层可选 `builtin-opencode.jsonc` 合并而来，并通过本地 `builtin-opencode.schema.json` 作为 `$schema`。当前已知配置节点是 opencode 官方 `mcp` 节点；后续新增其他 builtin 配置节点时可在同一文件中扩展。

## 优先级

`builtin-opencode.jsonc` 的来源和优先级如下：

```text
插件内置 builtin-opencode.jsonc
  -> 全局 ~/.config/opencode/builtin-opencode.jsonc
  -> 项目级 .opencode/builtin-opencode.jsonc
  -> opencode 已传入插件钩子的既有 config.mcp
```

项目级和全局 `builtin-opencode.jsonc` 是 AE 支持的可选配置入口；项目不存在这些文件时会自然使用低优先级默认值。

三层 builtin 配置的合并规则如下：

1. 对象递归合并，未声明字段保留低优先级值。
2. 数组、标量、`null` 和类型冲突由高优先级整值替换。
3. 三层 builtin 内部同名 MCP 的 `type` 相同时按对象规则合并。
4. 三层 builtin 内部同名 MCP 的 `type` 不同时由高优先级整条替换，避免 `local` 和 `remote` 字段混合。
5. 如果 opencode 已传入插件钩子的既有 `config.mcp` 存在同名 MCP，整条采用 opencode 既有配置，不从 builtin 同名项补字段。

AE 不读取或合并项目级、全局 `opencode.json`；这部分优先级由 opencode 自身在进入插件前处理。

## 禁用内置 MCP

可以在项目级 `.opencode/builtin-opencode.jsonc` 中只覆盖需要调整的字段：

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

项目级 `.opencode/builtin-opencode.jsonc` 只能覆盖已有 MCP 的安全字段：

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

remote MCP 的最终 URL 只允许 `http` / `https`，不能包含内嵌凭证，也不能使用本机、内网、链路本地、云 metadata、运营商级 NAT、benchmark 等特殊用途 IP 字面量。域名会按域名字面量注册；AE 不在配置合并阶段解析 DNS，因此不要把解析到内网或本机地址的域名写入全局 remote MCP。

全局 `~/.config/opencode/builtin-opencode.jsonc` 可以新增或替换 builtin MCP 条目：

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

如果需要把同名远程 MCP 改成本地 MCP，应在全局 `builtin-opencode.jsonc` 或 opencode 既有 `config.mcp` 中直接替换类型：

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
