# 权限模式参考

## 基本原则

- 默认不放宽权限。
- 只为代理职责需要的工具开放能力。
- 敏感操作、Git 写操作、网络写操作应保留用户确认。
- 浏览器能力必须先通过 `ae:chrome-devtools` 技能完成浏览器 MCP 动态注册并确认连接就绪；`ae:chrome-devtools` 是浏览器 MCP 的唯一管理入口，不应直接调用 `ae-chrome-devtools-mcp` 工具。MCP 未就绪时使用 `ae:chrome-devtools` 完成注册，注册失败时停止浏览器流程并记录无法验证，不提供绕过方式。

## 更新敏感变化确认

更新既有代理时，以下 frontmatter 字段变化必须展示在草案中：

- `mode`
- `tools`
- `permission`
- `model`
- `temperature`
- `top_p`
- `steps`
- `hidden`

以下变化必须单独确认，不能混在普通草案确认中：

- `mode` 从 `subagent` 扩大为 `primary` 或 `all`。
- 新增工具、移除工具禁用项，或把 `tools` / `permission` 从拒绝、询问改为允许。
- 新增或放宽 destructive Git、删除文件、覆盖文件、绕过提交钩子、远程写操作、网络写操作或外部副作用指令。
- 新增浏览器命令或 chrome-devtools-mcp 工具调用；浏览器流程仍必须先通过 `ae:chrome-devtools` 技能完成 MCP 注册确认。
- 删除旧正文中的安全边界、确认要求或禁止事项。

敏感变化不只看 frontmatter；正文新增、删除或重写 destructive Git、远程写操作、浏览器命令、权限放宽和外部副作用指令时，也必须列入敏感变化并单独确认。

## 只读研究代理

```yaml
tools:
  write: false
  edit: false
permission:
  bash:
    "*": ask
    "git status --short": allow
    "git diff --stat": allow
    "git log --oneline -5": allow
  webfetch: ask
```

## 代码编辑代理

```yaml
permission:
  edit: ask
  bash:
    "*": ask
    "<项目测试命令>": allow
    "<项目类型检查命令>": allow
```

## 测试执行代理

```yaml
permission:
  edit: ask
  bash:
    "*": ask
    "<项目测试命令>": allow
    "<项目单测命令>": allow
    "<项目类型检查命令>": allow
```

使用精确命令授权。不要使用前缀通配 `allow`；带 shell 连接符、重定向、管道、环境变量赋值或额外子命令的变体必须保持 `ask`。

## 浏览器验证代理

浏览器代理或命令的提示词必须先要求通过 `ae:chrome-devtools` 技能完成浏览器 MCP 动态注册并确认连接就绪。未通过注册确认前，不得执行任何 chrome-devtools-mcp 工具调用。

```yaml
permission:
  bash:
    "*": ask
    "chrome-devtools_*": ask
```

## 禁止默认配置

- 不默认允许推送远程、强制推送、硬重置、清理未跟踪文件等 Git 写操作。
- 如代理确实需要 Git 写操作，必须先绑定目标仓库、目标分支、工作区、完整命令参数和授权来源；没有用户明确授权时停止。
- 不默认允许删除文件、覆盖文件或绕过 hooks。
- 不把 `*`: `allow` 作为通用模板。
- 不在没有用户明确授权时执行远程写操作。
