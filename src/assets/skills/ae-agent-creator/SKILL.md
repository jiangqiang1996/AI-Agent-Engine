---
name: ae:agent-creator
description: "创建 OpenCode 原生代理，默认项目级，支持显式全局级和可选同级命令"
argument-hint: "[代理用途|代理名称] [--global] [--command]"
---

# OpenCode 代理创建器

创建或调整 OpenCode 原生代理。默认创建项目级代理，仅在用户明确要求全局代理或传入 `--global` 时创建全局代理。

## 适用场景

- 用户要求创建新的 OpenCode agent、subagent、primary agent 或专用助手。
- 用户要求为代理创建快捷命令、同名命令或 `/xxx` 入口。
- 用户要求更新既有代理的职责、权限、工具或工作流。

## 默认决策

- 默认 scope：项目级，目标路径为 `.opencode/agents/<name>.md`。
- 显式全局 scope：仅在用户明确说全局或传入 `--global` 时使用 `~/.config/opencode/agents/<name>.md`。
- 默认 mode：`subagent`，并在 frontmatter 中显式写入 `mode: subagent`。
- 可选命令：默认不创建；仅当用户明确要求命令、快捷入口或传入 `--command` 时创建同级命令。
- 命令绑定：命令 frontmatter 必须使用 `agent: <name>`，正文必须保留 `$ARGUMENTS`。

## 路径边界

- 普通用户代理只写入 `.opencode/agents/` 或 `~/.config/opencode/agents/`。
- 普通用户命令只写入 `.opencode/commands/` 或 `~/.config/opencode/commands/`。
- `src/assets/agents/` 只属于 AE 插件源码维护语境，不是普通用户代理创建路径。
- 不要求用户项目存在本仓库的 `src/`、`dist/`、`.opencode/plugins/` 或 `docs/ae/` 结构。

## 工作流

1. 理解代理用途：确认代理名称、职责、适用场景、不适用场景、是否需要工具或权限限制。
2. 选择 scope：没有明确全局要求时使用项目级；全局写入前说明最终目标路径。
3. 选择 mode：没有明确要求时使用 `subagent`；只有主会话行为代理才使用 `primary`，两者都需要时谨慎使用 `all`。
4. 初始化文件：优先运行 `scripts/init_agent.mjs` 生成基础代理；需要命令时添加 `--command`。
5. 编辑代理正文：让代理提示词包含角色、适用场景、工作流、输出要求和边界，不写成万能助手。
6. 校验结果：运行 `scripts/quick_validate.mjs <agent-file-or-dir>`，修复所有可恢复问题。
7. 交付说明：报告创建路径、mode、是否创建命令、验证命令与结果。

## 初始化命令

项目级代理：

```bash
node <skill-dir>/scripts/init_agent.mjs code-reviewer
```

项目级代理和同级命令：

```bash
node <skill-dir>/scripts/init_agent.mjs code-reviewer --command
```

全局代理：

```bash
node <skill-dir>/scripts/init_agent.mjs code-reviewer --global
```

`<skill-dir>` 表示本技能目录。执行时可以使用当前技能资产中的实际脚本路径。
如需传入来自用户原文的 `--description`，优先通过工具或脚本参数数组传递；不要把未转义的用户文本拼接进可复制 shell 命令。

## 参考资料

- 需要 OpenCode 代理字段规范时，读取 `references/opencode-agent-conventions.md`。
- 需要设计代理职责和正文时，读取 `references/agent-design-patterns.md`。
- 需要配置 `tools` 或 `permission` 时，读取 `references/permission-patterns.md`。

## 禁止事项

- 不生成已弃用的 `maxSteps` 字段，使用 `steps`。
- 不默认创建命令。
- 不默认放宽权限，不默认允许 destructive Git 操作或远程写操作。
- 不跳过浏览器能力的 `ae:setup` 前置要求。
- 不把 AE 插件源码仓库结构当作普通用户项目要求。
