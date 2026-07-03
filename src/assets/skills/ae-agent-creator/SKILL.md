---
name: ae:agent-creator
description: "创建或更新 OpenCode 原生代理，默认项目级，支持显式全局级和可选同级命令"
argument-hint: "[代理用途|代理名称] [--global] [--command]"
---

# OpenCode 代理创建与更新器

创建或更新 OpenCode 原生代理。默认处理项目级代理，仅在用户明确要求全局代理或传入 `--global` 时处理全局代理。

## 参数说明

| 参数 | 必填 | 说明 |
|------|------|------|
| 代理用途或代理名称 | 是 | 描述代理用途，或小写短横线格式的代理名称 |
| `--global` | 否 | 创建全局级代理，影响当前用户所有项目 |
| `--command` | 否 | 同时创建同级命令入口 |

参数解析规则：`--global`、`--command` 为标志参数，直接识别；其余输入作为代理名称或用途描述。

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
- 更新既有代理：不使用初始化脚本覆盖旧文件；必须先读取旧内容、展示更新草案并等待用户明确确认。

## 路径边界

- 普通用户代理只写入 `.opencode/agents/` 或 `~/.config/opencode/agents/`。
- 普通用户命令只写入 `.opencode/commands/` 或 `~/.config/opencode/commands/`。
- `src/assets/agents/` 只属于 AE 插件源码维护语境，不是普通用户代理创建路径。
- 不要求用户项目存在本仓库的 `src/`、`dist/`、`.opencode/plugins/` 或 `ae/` 结构。

## 工作流

1. 理解意图：区分创建新代理、更新既有代理，或用户意图不清需要先澄清。
2. 确认代理名称与 scope：没有明确全局要求时优先项目级；全局写入前说明目标路径和影响范围。
3. 定位同名候选：同时检查项目级和全局级同名代理，按 reference 中的目标解析规则处理冲突。
4. 选择 mode：没有明确要求时使用 `subagent`；只有主会话行为代理才使用 `primary`，两者都需要时谨慎使用 `all`。
5. 进入创建或更新分支。

### 创建分支

1. 目标不存在且没有同名全局冲突时，优先运行 `scripts/init_agent.mjs` 生成基础代理；需要命令时添加 `--command`。
2. 如果项目级目标不存在但全局级存在同名代理，先说明影子代理风险，询问创建项目级影子代理、改为更新全局代理、换名或取消。
3. 如果目标已存在，停止初始化并询问改为更新、换名或取消；`init_agent.mjs` 拒绝覆盖既有目标是预期安全语义。
4. 编辑代理正文：让代理提示词包含角色、适用场景、工作流、输出要求和边界，不写成万能助手。

### 更新分支

1. 定位候选：未指定 scope 时列出项目级和全局级候选；两个都存在时让用户选择，选择全局时再次确认影响范围。
2. 读取旧文件：读取既有代理和必要的同级命令，把旧内容作为本轮会话内恢复依据。
3. 识别变更：整理职责、名称、输入约定、frontmatter、正文段落、工具和权限的变化；OpenCode 支持的 agent frontmatter 均可保留或按需写入，但不要为了“完整”而同时配置所有可选字段。
4. 展示草案：至少包含目标路径、scope、frontmatter 变化表、正文增删摘要、将删除或重写的旧段落、敏感变化、命令检查结果和确认问题。
5. 敏感确认：`mode`、`tools`、`permission`、`model`、`temperature`、`top_p`、`steps`、`disable`、`prompt`、`hidden`、`color` 和其他模型选项变化必须展示；`mode` 扩大触发范围、工具或权限放宽、destructive Git、远程写操作、浏览器命令和外部副作用指令变化必须单独确认。
6. 最小编辑：只在用户明确确认后写入，优先保留仍有效的职责边界、禁用项、工作流和输出契约。

### 命令检查

1. 默认只检查同级同名命令：项目级代理对应 `.opencode/commands/<name>.md`，全局级代理对应 `~/.config/opencode/commands/<name>.md`。
2. 当代理职责、名称或输入约定变化时，在同一 scope 的命令目录中搜索 `agent: <name>` 的非同名绑定并报告风险。
3. 命令存在时检查 `agent: <name>`、`$ARGUMENTS` 和描述是否仍匹配代理职责；如使用 `subtask` 或 `model`，确认它们仍符合命令目标；命令不存在时只报告“未发现同级命令”。
4. 默认不创建或重写命令；只有用户明确要求同步时，才展示命令草案并确认写入。

### 校验与交付

1. 运行 `scripts/quick_validate.mjs <agent-file-or-dir>`，修复所有可恢复问题。
2. 校验失败时报告失败原因；涉及语义、权限或命令绑定变化的修复必须再次确认。
3. 交付说明：报告创建或更新路径、mode、是否触及命令、验证命令与结果。
4. 普通代理更新不处理 AE 内置代理注册链路；需要固化为 AE 内置代理时应进入专门维护流程。

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
- 更新既有代理前，必须读取上述 reference 中的 scope、草案、敏感变化和最小编辑规则。

## 禁止事项

- 不生成已弃用的 `maxSteps` 字段，使用 `steps`。
- 不默认创建命令。
- 不默认放宽权限，不默认允许 destructive Git 操作或远程写操作。
- 不跳过浏览器能力的 chrome-devtools MCP 门禁要求。
- 不把 AE 插件源码仓库结构当作普通用户项目要求。
- 不新增或引导寻找 `ae:agent-updater`；创建与更新都由 `ae:agent-creator` 承接。
- 不把 `ae:install` 描述为代理内容更新器；它只属于 AE 插件安装或源码维护能力。
