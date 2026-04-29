# AE 内置 MCP

AE 会在插件 `config` 钩子里注入一组最低优先级的内置 MCP 默认值，当前包含：

| 名称 | 类型 | 作用 |
| --- | --- | --- |
| `context7` | `remote` | 获取最新的库/框架文档 |
| `gh_grep` | `remote` | 搜索真实的 GitHub 代码示例 |

内置默认配置使用 `src/assets/config/builtin-opencode.jsonc`，并通过本地 `builtin-opencode.schema.json` 作为 `$schema`。当前配置文件顶层只允许 `$schema` 和 opencode 官方 `mcp` 节点，不包含其他 opencode 配置或 AE 私有字段；后续新增其他内置配置节点时可在同一文件中扩展。

## 优先级

内置 MCP 只作为默认值，不覆盖进入插件钩子前已经存在的 `config.mcp`：

```text
插件内置 MCP
  -> 用户已有的 global / project / 其他更高层 config.mcp
```

同名项的合并规则如下：

1. `type` 相同：字段级浅合并，便于只覆盖 `enabled`、`timeout`、`headers` 等字段。
2. `type` 不同：整条替换，避免 `local` 和 `remote` 字段混合。

## 禁用内置 MCP

可以在 `opencode.json` 中把对应项的 `enabled` 设为 `false`：

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

可以保留同名条目，只覆盖需要调整的字段：

```json
{
  "mcp": {
    "gh_grep": {
      "type": "remote",
      "url": "https://mcp.grep.app",
      "timeout": 10000,
      "enabled": true
    }
  }
}
```

如果需要把同名远程 MCP 改成本地 MCP，也可以直接替换类型：

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
