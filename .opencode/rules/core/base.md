# ai-agent-engine 项目规范

> 本文件为项目总规范入口，所有 AI 代理在开发过程中必须遵循以下规范文件。

## 语言要求

- 所有 AI 提示词必须使用中文
- 代理向用户询问时严格使用中文
- 代码注释使用中文
- Git 提交信息使用中文
- 文档使用中文编写

## 项目概述

- **项目类型**: opencode 插件（Plugin）
- **运行时**: Node.js（ESM 模块系统）
- **语言**: TypeScript（strict 模式）
- **核心依赖**: `@opencode-ai/plugin@1.4.10`、`@opencode-ai/sdk@1.4.10`、`effect@4.x`、`zod@4.x`
- **包管理器**: npm
- **构建工具**: tsc

## opencode 核心概念

本项目为 opencode 生态的一部分，必须遵循以下 opencode 官方概念体系：

### 插件（Plugin）

- 通过 `@opencode-ai/plugin` 包的 `Plugin` 类型导出插件函数
- 插件函数接收 `PluginInput`（含 `client`、`project`、`directory`、`worktree`、`$`）
- 返回 `Hooks` 对象，注册工具、事件处理器、Hook 等
- 放置于 `.opencode/plugins/` 目录或通过 npm 分发

### 工具（Tool）

- 使用 `@opencode-ai/plugin/tool` 的 `tool()` 函数定义
- 参数通过 `tool.schema`（Zod）定义，每个字段必须包含 `.describe()` 中文描述
- `execute` 函数接收参数和 `ToolContext`（含 `sessionID`、`directory`、`worktree`、`abort`、`metadata`、`ask`）
- 返回 `string` 或 `{ output: string, metadata?: Record<string, unknown> }`
- 自定义工具放置于 `.opencode/tools/` 目录，文件名即工具名

### 代理（Agent）

- 分为 **主要代理**（primary）和 **子代理**（subagent）
- 主要代理通过 Tab 键切换，子代理通过 `@` 引用
- 支持配置：`description`、`prompt`、`model`、`temperature`、`steps`、`permission`、`mode`
- 可通过 JSON（`opencode.json` 的 `agent` 字段）或 Markdown（`.opencode/agents/`）定义

### 规则（Rules）

- 通过 `AGENTS.md` 文件提供自定义指令
- 支持项目级（项目根目录）和全局级（`~/.config/opencode/AGENTS.md`）
- `opencode.json` 的 `instructions` 字段支持引用外部文件和 glob 模式

### 技能（Skill）

- 通过 `.opencode/skills/<name>/SKILL.md` 定义
- 必须包含 YAML frontmatter：`name`（必填）、`description`（必填）
- `name` 必须为小写字母数字加连字符，与目录名一致
- 通过 `skill` 工具按需加载

### 命令（Command）

- 通过 `.opencode/commands/<name>.md` 定义
- 支持 `$ARGUMENTS`、`$1`/`$2`/... 占位符
- 支持 `` !`command` `` 注入 Shell 输出
- 支持 `@file` 引用文件内容

### 权限（Permission）

- 三种动作：`allow`（自动运行）、`ask`（需确认）、`deny`（禁止）
- 支持通配符模式：`*` 匹配零或多个字符
- 可按代理覆盖全局权限
- 内置工具权限：`bash`、`edit`、`read`、`glob`、`grep`、`webfetch`、`skill`、`question` 等

### MCP 服务器

- 通过 `opencode.json` 的 `mcp` 字段配置
- 支持 `local`（本地命令启动）和 `remote`（远程 URL）两种类型
- 支持 OAuth 自动认证

## 项目目录结构

```
ai-agent-engine/
├── opencode.json                # opencode 项目配置
├── AGENTS.md                    # 项目规则入口
├── .opencode/
│   ├── rules/                   # 规则文件
│   │   └── core/
│   │       ├── base.md          # 本文件 - 项目总规范
│   │       ├── architecture.md  # 架构设计规范
│   │       ├── code-style.md    # 代码风格规范
│   │       ├── git-workflow.md  # Git 工作流规范
│   │       ├── testing.md       # 测试规范
│   │       └── agent-design.md  # Agent 与工具设计规范
│   ├── plugins/                 # 插件目录
│   ├── tools/                   # 自定义工具
│   ├── agents/                  # 自定义代理
│   ├── commands/                # 自定义命令
│   └── skills/                  # 技能定义
│       └── <name>/
│           └── SKILL.md
└── src/                         # 插件源代码
    ├── index.ts                 # 插件入口
    ├── tools/                   # 工具定义
    ├── hooks/                   # Hook 处理器
    ├── services/                # 业务服务层
    ├── schemas/                 # Zod Schema 定义
    └── utils/                   # 工具函数
```

## 规范文件索引

| 规范文件 | 说明 |
|---------|------|
| [architecture.md](architecture.md) | 架构设计与模块划分规范 |
| [code-style.md](code-style.md) | 代码风格与命名规范 |
| [git-workflow.md](git-workflow.md) | Git 分支策略与提交规范 |
| [testing.md](testing.md) | 测试策略与覆盖率要求 |
| [agent-design.md](agent-design.md) | AI Agent、工具、Hook、Skill 设计规范 |

## 核心原则

1. **严格遵循 opencode 官方规范** - 使用官方 API 和推荐模式
2. **简洁优先** - 避免过度抽象，保持代码可读性
3. **类型安全** - 充分利用 TypeScript 类型系统，使用 Zod 进行运行时校验
4. **Effect 优先** - 使用 Effect 框架处理副作用和错误
5. **单一职责** - 每个模块、函数只做一件事
6. **渐进增强** - 优先使用稳定 API，实验性功能做好降级处理
7. **权限安全** - 敏感操作必须通过权限系统控制
