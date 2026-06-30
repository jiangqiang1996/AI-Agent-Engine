---
name: ae-plugin-agent-creator
description: 用于创建或更新 AE 插件内置代理，要求遵守 ae:agent-creator 约定和本仓库内置代理注册结构。
---

# AE 插件内置代理创建与更新器

使用本技能帮助维护 `ai-agent-engine` 源码仓库中的 AE 内置代理。它是当前仓库项目级 OpenCode 技能，不是 AE 插件内置技能，也不面向普通下游项目分发。

## 适用场景

- 用户要求为 AE 插件新增内置代理、审查者、研究代理或工作流代理。
- 用户要求更新 `src/assets/agents/` 下既有 AE 内置代理的职责、触发场景、权限、工具、工作流或输出格式。
- 用户要求同步内置代理注册、agent catalog、帮助输出或相关测试。
- 用户明确要求创建的代理需要同时遵守 `ae:agent-creator` 和当前 AE 插件内置代理结构。

## 不适用场景

- 创建普通项目级或全局级 OpenCode 代理；这类任务使用 `ae:agent-creator`。
- 创建或更新 OpenCode 原生技能；这类任务使用 `ae:skill-creator` 或 `ae-plugin-skill-creator`，从当前会话沉淀技能使用 `ae:skill-creator --from-session`。

## 范围边界

- 本技能自身路径：`.opencode/skills/ae-plugin-agent-creator/SKILL.md`。
- 本技能只服务当前 `ai-agent-engine` 源码仓库，不写入 `src/assets/skills/` 作为可分发内置能力。
- 被创建或更新的 AE 内置代理路径：`src/assets/agents/<stage>/<agent-name>.md`。
- 内置代理名称使用 `lower-kebab`，文件名为 `<agent-name>.md`。
- 内置代理 stage 使用 `review`、`research` 或 `workflow`，并同步 `src/schemas/ae-asset-schema.ts` 的 `AGENT` 常量和 `src/services/ae-catalog.ts` 中的 required/gilded agent 列表。
- 普通项目级命令绑定规则不适用于 AE 内置代理；除非用户明确要求新增项目级调试入口，否则不要为内置代理创建 `.opencode/commands/` 或 `src/assets/commands/` 命令文件。
- 不把 `src/`、`dist/`、`.opencode/plugins/` 或本仓库构建命令写成普通下游项目要求；这些只属于 AE 插件源码维护语境。

## 输入处理

1. 识别用户是新增内置代理、更新内置代理，还是只需要解释内置代理结构。
2. 未明确目标时必须询问：新增内置代理、更新内置代理，或补充内置代理注册/测试；不要把普通项目级代理的“项目级/全局级/同级命令”模式套用到 AE 内置代理。
3. 将被创建的内置代理名规范化为 `lower-kebab`；发现空格、大写、下划线、点号或路径片段时先要求确认或改名。
4. 根据职责选择 stage：代码或文档审查用 `review`，外部或仓库研究用 `research`，流程执行或视觉工作流用 `workflow`。
5. 读取 `ae:agent-creator` 当前 `SKILL.md` 及其 references，继承仍适用的 OpenCode 原生代理结构、frontmatter 和更新草案要求。
6. 读取相近的内置代理、`ae-asset-schema.ts`、`ae-catalog.ts` 和必要的选择逻辑文件，确认当前仓库结构后再编辑。

## 创建流程

1. 确认目标 `src/assets/agents/<stage>/<agent-name>.md` 不存在；若存在，转入更新流程，不覆盖。
2. 新建内置代理 Markdown 文件，frontmatter 至少包含 `name`、`description` 和 `mode`；`name` 必须等于文件名去掉 `.md` 后的代理名。
3. 默认使用 `mode: subagent`；只有代理确实需要主会话入口时才使用 `primary` 或 `all`，并说明原因。
4. 正文必须包含 `Role`、`When To Use`、`Workflow`、`Output` 和 `Boundaries`，需要时补充 `When Not To Use`、`Inputs`、`Failure Handling` 或 `Quality Bar`。
5. 权限和工具按最小需要配置；不要为了“完整”而写入所有可选 frontmatter 字段。
6. 在 `src/schemas/ae-asset-schema.ts` 中新增或确认 `AGENT` 常量，值与文件名一致。
7. 同步 `src/services/ae-catalog.ts` 中的 required/gilded agent 列表，确保帮助输出、审查团队选择或工作流委派能发现该代理。
8. 补充或更新相关测试，至少覆盖 agent schema、catalog/注册可发现性，以及新增代理的分类或触发规则。

## 更新流程

1. 先读取既有代理文件、相关注册/catalog、schema 常量和可能的审查选择逻辑。
2. 列出 frontmatter 变化、正文结构变化、权限或工具变化、注册变化和测试变化。
3. 涉及删除职责、扩大 `mode`、放宽工具或权限、增加 Git 写操作、浏览器命令、网络访问或外部副作用时，必须单独确认。
4. 做最小编辑，保留仍有效的职责、触发场景、边界、禁用项、工作流和输出契约。
5. 更新完成后检查代理 frontmatter description、catalog 描述和触发选择逻辑是否一致。

## 输出要求

交付时说明：

- 创建或更新的是 AE 插件内置代理，不是普通项目级或全局级代理。
- 代理文件路径、stage、mode 和是否触及权限或工具。
- 触及的 schema、catalog、选择逻辑和测试文件。
- 已运行的结构校验、测试、类型检查或构建命令。
- 未验证项、Git 操作状态和剩余风险。

## 验证方式

- 结构校验：优先使用 `ae:agent-creator` 提供的 agent 校验脚本检查目标代理文件；若该脚本只支持普通路径，也可直接传入 `src/assets/agents/<stage>/<agent-name>.md`。
- 相关测试：运行覆盖 agent schema、agent catalog、审查选择或工作流委派的 Vitest 用例。
- 类型检查：涉及 TypeScript 注册链路时运行 `npm run typecheck`。
- 构建验证：涉及运行时资产复制、注册链路或帮助输出时优先运行 `npm run build`。

## 禁止事项

- 不把本技能自身加入 `src/assets/skills/`、`src/schemas/ae-asset-schema.ts`、`src/services/ae-catalog.ts` 或模型路由。
- 不写入 `.opencode/agents/` 或 `~/.config/opencode/agents/`，除非用户明确改为创建普通项目级或全局级代理。
- 不把普通项目代理创建流程误写成 AE 内置代理流程。
- 不新增旧式 `ae:agent-updater` 或平行更新入口。
- 不跳过 `src/schemas/ae-asset-schema.ts`、代理注册/catalog 和相关测试同步。
- 不默认放宽权限，不默认允许 destructive Git 操作、远程写操作、浏览器命令或外部副作用。
- 不跳过浏览器能力的 `ae:chrome-devtools` 前置要求；任何实际使用 chrome-devtools-mcp 工具的流程都必须先完成 MCP 动态注册校验。
