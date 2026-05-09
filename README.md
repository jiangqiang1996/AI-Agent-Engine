# AI Agent Engine

AI Agent Engine（AE）是一个面向 [opencode](https://opencode.ai) 的工程工作流插件。它把一组技能、命令、子代理、工具和内置规则注册到 opencode 中，帮助 AI 代理更稳定地完成软件工程任务：从想法探索、需求澄清、计划拆解、实现执行，到代码/文档审查、浏览器验收、跨会话交接和交付门禁。

AE 不试图替代项目自身的工程规范，也不要求用户项目采用本仓库的源码结构。它更像是一套可复用的 AI 工程协作层：为代理提供流程、角色分工、证据要求和安全边界，让常见开发任务更少依赖临场发挥。

## 适合谁

| 读者 | AE 能提供的帮助 |
| --- | --- |
| 使用 opencode 日常开发的个人开发者 | 用 `/ae-lfg` 或分阶段命令把模糊需求推进到可验证交付 |
| 希望 AI 更稳地执行复杂任务的工程团队 | 通过计划、审查、门禁和交接减少跳步、漏验证、越权 Git 操作 |
| 需要审查代码或方案文档的人 | 使用分层审查代理覆盖正确性、测试、安全、架构、可维护性、产品和可行性等角度 |
| 维护 API、前端或数据库相关项目的人 | 使用 Swagger/OpenAPI 摘要、浏览器验收、SQL 辅助和专项审查代理 |
| 想扩展 opencode 工作流的人 | 参考 `src/assets/` 中的技能、命令、代理、规则和 `src/tools/` 中的工具实现 |

## 核心能力

| 能力 | 入口 | 说明 |
| --- | --- | --- |
| 默认工程管道 | `/ae-lfg` | 从需求开始，按需恢复已有产物，依次推进需求、计划、实现、审查、验证和最终门禁 |
| 想法与需求 | `/ae-ideate`、`/ae-brainstorm` | 生成可落地想法，或围绕目标、边界、约束和成功标准澄清需求 |
| 计划与重构 | `/ae-plan`、`/ae-refactor` | 生成结构化计划；重构场景会强调保持外部行为、分阶段迁移和测试护栏 |
| 执行与交付 | `/ae-work`、`/ae-work-report`、`/ae-task-loop` | 按计划工作，生成日报/周报，或在探索性修复中循环执行与验证 |
| 代码与文档审查 | `/ae-review`、`/ae-document-review` | 支持 Git diff、全量扫描、会话变更和文档域审查，按范围选择审查代理 |
| 前端与浏览器验收 | `/ae-frontend-design`、`/ae-test-browser`、`@figma-design-sync`、`@design-iterator` | 构建前端初版、执行浏览器验收、按设计稿修正视觉偏差或多轮打磨已有 UI |
| 接口与数据辅助 | `/ae-swagger-parser`、`/ae-sql` | 解析 Swagger/OpenAPI 生成联调摘要；通过 JDBC 执行数据库查询或操作 |
| 会话与提示词 | `/ae-handoff`、`/ae-prompt-optimize` | 创建带上下文的新会话，或把随意输入整理成更适合 AI 执行的提示词 |
| 经验与流程沉淀 | `/ae-save-experience`、`/ae-skill-from-session` | 保存可复用 solution 与长期 rules，或从当前会话创建或更新技能 |
| 插件维护 | `/ae-update` | 更新 AE 插件安装仓库 |

安装后可用 `/ae-help` 查看当前运行时实际注册的技能、命令、代理和模型场景路由。该输出由运行时代码生成，是核对可用能力的权威入口。

## 快速开始

### 1. 安装

AE 当前只支持 opencode。支持全局安装和项目级安装：

| 模式 | 安装位置 | 生效范围 | 适用场景 |
| --- | --- | --- | --- |
| 全局安装 | `~/.config/opencode/ai-agent-engine` | 所有项目 | 日常开发，所有项目共享 AE |
| 项目级安装 | `<项目根目录>/.opencode/ai-agent-engine` | 当前项目 | 特定项目需要独立版本或定制 |

全局安装时，把下面这句话交给 opencode AI 代理执行：

```text
Fetch and follow the global install instructions from https://gitee.com/jiangqiang1996/ai-agent-engine/raw/master/.opencode/INSTALL.md
```

项目级安装时，把下面这句话交给 opencode AI 代理执行：

```text
Fetch and follow the project-level install instructions from https://gitee.com/jiangqiang1996/ai-agent-engine/raw/master/.opencode/INSTALL.md
```

安装前应检查当前 opencode 环境中是否已安装 `oh-my-openagent`、`oh-my-opencode` 或 `superpowers`。如存在，先向用户说明潜在冲突，再继续安装。

### 2. 验证安装

重启 opencode 后运行：

```text
/ae-help
/ae-help review
```

如果能看到技能、命令和代理清单，说明插件已被 opencode 加载。

### 3. 开始使用

最常用入口是 `/ae-lfg`：

```text
/ae-lfg 实现一个带权限校验的文件上传功能
```

如果你想手动控制阶段，可以按下面的顺序推进：

```text
/ae-brainstorm 设计一个多租户数据隔离方案
/ae-review domain:document
/ae-plan
/ae-review domain:document
/ae-work
/ae-review
```

更多场景、命令变体、代理说明和产物路径见 [docs/usage-guide.md](docs/usage-guide.md)。

## 资产清单

公开资产以 `src/` 为真源，并由插件运行时注册到 opencode。下表是当前版本快照；安装后的实际可用清单以 `/ae-help` 为准：

| 类型 | 数量 | 真源 | 说明 |
| --- | ---: | --- | --- |
| 技能 | 当前快照 24 | `src/assets/skills/`、`src/services/ae-catalog.ts` | 面向用户的工作流入口，可通过 `/ae-*` 命令触发 |
| 命令 | 当前快照 46 | `src/services/command-registration.ts`、`src/assets/commands/` | 包含基础命令、`-po` 提示词优化变体、`-pa` 自动优化变体和 `/ae-commit` |
| 代理 | 当前快照 26 | `src/assets/agents/`、`src/services/agent-registration.ts` | 按审查、研究、工作流分组，通过 `@<代理名>` 调用 |
| 工具 | 当前快照 7 | `src/tools/` | 供技能和代理调用的结构化工具，如恢复、审查契约、门禁、帮助、交接和 Swagger 解析 |
| 规则 | 当前快照 4 | `src/assets/rules/` | 注入到会话中的 AI 编码、执行护栏、全局开发和浏览器 setup 前置规则 |
| 内置配置 | 当前快照 1 | `src/assets/config/ae.jsonc` | 默认 MCP 配置，项目级/全局 `ae.jsonc` 可按规则覆盖 |

主要技能包括：`ae:ideate`、`ae:brainstorm`、`ae:plan`、`ae:refactor`、`ae:work`、`ae:work-report`、`ae:review`、`ae:lfg`、`ae:setup`、`ae:test-browser`、`ae:frontend-design`、`ae:handoff`、`ae:prompt-optimize`、`ae:task-loop`、`ae:sql`、`ae:swagger-parser`、`ae:save-experience`、`ae:skill-from-session`、`ae:help`、`ae:update` 等。完整说明以 `/ae-help` 为准。

## 工作方式

AE 的设计重点不是“多一个命令集合”，而是把 AI 工程任务拆成可检查的阶段：

1. 先确定任务类型和范围，避免把问答、审查、提交和实现混在一起。
2. 需求不清时先澄清或生成需求文档，复杂实现前先生成计划。
3. 审查前先确定范围和审查团队，代码域与文档域互斥处理。
4. 实现后要求运行相关验证；浏览器能力在使用 `agent-browser` 前必须先完成 `/ae-setup`。
5. `/ae-lfg` 和 `/ae-work` 的正式交付会通过 `ae-gate` 检查计划、验证、审查和 Git 授权证据。
6. 对 Git 写操作保持保守：提交、推送、变基、重置、清理等操作都必须有明确授权；`/ae-commit` 只做本地提交，不等同于 push 或创建 PR。

## 能力边界

AE 的公开能力按真实实现有以下边界：

| 边界 | 说明 |
| --- | --- |
| 只支持 opencode | 当前插件入口、命令、工具和配置都基于 opencode 插件机制 |
| 不保证零交互 | 默认会尽量减少不必要询问，但需求不清、授权不足、风险较高或需要用户决策时会停下确认 |
| 不替代真实验证 | 门禁工具只检查证据是否存在，不会代替测试、构建、浏览器验收或代码审查本身 |
| 不默认执行远程写操作 | 用户侧能力不会提供 push、创建 PR、创建 Release 等远程写流程；本地 Git 写操作也需要授权 |
| 浏览器能力有前置 setup | 任何实际 `agent-browser` 调用前，当前会话必须先完成 `/ae-setup` |
| 项目配置是可选入口 | `.opencode/rules/` 和 `.opencode/ae.jsonc` 是受支持的可选用户配置，不是所有项目的必备结构 |
| 插件维护能力有专门语境 | `/ae-update` 可以引用 AE 安装仓库；普通用户项目流程不应依赖本源码仓库布局 |

## 配置

AE 默认注入两个远程 MCP：

| 名称 | 作用 |
| --- | --- |
| `context7` | 获取库/框架文档 |
| `gh_grep` | 搜索真实 GitHub 代码示例 |

项目可以通过 `.opencode/ae.jsonc` 覆盖允许的字段，全局默认值可放在 `~/.config/opencode/ae.jsonc`。AE 还支持 `modelScenarios`，把 `quick`、`standard`、`deep`、`vision` 等任务场景映射到不同模型。详细合并优先级、覆盖限制和降级行为见 [docs/builtin-config.md](docs/builtin-config.md)。

## 更新与卸载

全局更新：

```text
/ae-update
```

项目级更新：

```text
/ae-update project
```

`/ae-update` 会对 AE 插件安装仓库执行本地 Git 更新、依赖安装和构建。涉及 `git reset --hard`、`git clean`、`git pull` 等写操作前，必须确认目标是 AE 插件安装仓库并取得明确授权。

卸载时，把对应指令交给 opencode AI 代理执行：

```text
Fetch and follow the global uninstall instructions from https://gitee.com/jiangqiang1996/ai-agent-engine/raw/master/.opencode/INSTALL.md
```

```text
Fetch and follow the project-level uninstall instructions from https://gitee.com/jiangqiang1996/ai-agent-engine/raw/master/.opencode/INSTALL.md
```

## 开发与贡献

本仓库是 AE opencode 插件源码仓库。面向插件用户的可分发能力以 `src/` 下定义为真源：

| 路径 | 作用 |
| --- | --- |
| `src/index.ts` | server 插件入口，注册技能路径、命令、代理、MCP、规则和工具 |
| `src/assets/skills/` | 技能提示词和参考文件 |
| `src/assets/commands/` | Markdown 命令文件，如 `/ae-commit` |
| `src/assets/agents/` | 子代理提示词 |
| `src/assets/rules/` | 注入到用户会话的运行时规则 |
| `src/assets/config/` | 内置 `ae.jsonc` 与 schema |
| `src/tools/` | opencode 工具定义 |
| `src/services/` | 注册、目录、门禁、审查选择、Swagger 解析等服务逻辑 |
| `src/schemas/` | 资产常量与输入 schema |

常用开发命令：

| 操作 | 命令 |
| --- | --- |
| 安装依赖 | `npm install` |
| 构建 | `npm run build` |
| 测试 | `npm run test` |
| 类型检查 | `npm run typecheck` |

`dist/` 是构建产物，不应手工维护。`.opencode/plugins/` 是本仓库调试当前开发中插件的桥接目录，不代表下游用户项目必须具备的结构。

## 文档

| 文件或入口 | 职责 |
| --- | --- |
| `README.md` | 项目定位、快速开始、核心能力、边界、配置和开发入口 |
| [docs/usage-guide.md](docs/usage-guide.md) | 用户手册：常用工作流、命令变体、代理、工具和产物路径 |
| [docs/builtin-config.md](docs/builtin-config.md) | 内置 MCP、`ae.jsonc`、模型场景路由与覆盖规则 |
| `.opencode/INSTALL.md` | 安装、更新、卸载的代理执行说明 |
| `/ae-help` | 运行时权威帮助：当前实际可用的技能、命令、代理和模型路由 |
