# OpenCode 代理规范摘要

## 路径

- 项目级代理：`.opencode/agents/<name>.md`。
- 全局代理：`~/.config/opencode/agents/<name>.md`。
- Markdown 文件名就是代理名，例如 `code-reviewer.md` 对应 `code-reviewer`。
- AE 插件源码中的 `src/assets/agents/` 只用于维护内置代理，不是普通用户代理路径。

## 必填字段

- `description`：代理用途和触发场景的简短描述。
- `mode`：代理模式，建议显式写入，避免默认 `all` 带来过宽触发范围。

## 常用可选字段

- `model`：覆盖代理使用的模型。
- `temperature`：控制随机性，分析类代理通常使用较低值。
- `top_p`：控制响应多样性，可作为温度替代。
- `tools`：启用或禁用工具。
- `permission`：控制 `edit`、`bash`、`webfetch` 等权限。
- `hidden`：只适用于 `mode: subagent`，用于从自动补全菜单隐藏代理。
- `steps`：限制最大代理迭代次数。

## 模式选择

- `subagent`：适合按需委派的专业代理，是本技能默认值。
- `primary`：适合用户直接切换并持续对话的主代理。
- `all`：同时作为主代理和子代理可用，只有明确需要两种入口时才使用。

## 命令绑定

- 项目级命令：`.opencode/commands/<name>.md`。
- 全局命令：`~/.config/opencode/commands/<name>.md`。
- 命令 frontmatter 使用 `agent: <name>` 绑定代理。
- 若命令应强制作为子任务运行，可以设置 `subtask: true`。
- 命令正文保留 `$ARGUMENTS`，用于透传用户参数。

## 字段边界

- 不生成 `maxSteps`，该字段已弃用，应使用 `steps`。
- `hidden` 仅用于 `mode: subagent`。
- 不指定 `mode` 时 OpenCode 默认可能为 `all`，因此本技能生成文件时必须显式写入 `mode`。
