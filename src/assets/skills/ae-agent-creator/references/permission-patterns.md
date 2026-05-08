# 权限模式参考

## 基本原则

- 默认不放宽权限。
- 只为代理职责需要的工具开放能力。
- 敏感操作、Git 写操作、网络写操作应保留用户确认。
- 浏览器能力必须先在当前会话完成 `ae:setup`；setup 失败时停止浏览器流程并记录无法验证，不提供绕过方式。

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

浏览器代理或命令的提示词必须先要求当前会话完成 `ae:setup`。未完成 setup 前，不得执行任何 `agent-browser` 命令。

```yaml
permission:
  bash:
    "*": ask
    "agent-browser*": ask
```

## 禁止默认配置

- 不默认允许推送远程、强制推送、硬重置、清理未跟踪文件等 Git 写操作。
- 如代理确实需要 Git 写操作，必须先绑定目标仓库、目标分支、工作区、完整命令参数和授权来源；没有用户明确授权时停止。
- 不默认允许删除文件、覆盖文件或绕过 hooks。
- 不把 `*`: `allow` 作为通用模板。
- 不在没有用户明确授权时执行远程写操作。
