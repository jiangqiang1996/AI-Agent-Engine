# AI Agent Engine

AI Agent Engine（AE）是 opencode 的工程工作流插件。它提供技能、命令、子代理、工具和内置规则，让 AI 代理按可检查流程完成需求澄清、计划、实现、审查、验证、交接和交付。

AE 不要求业务项目采用本仓库结构。面向用户的运行时能力以 `src/` 下资产为真源，安装后的实际可用能力以 `/ae-help` 为准。

## 快速开始

### 安装

全局安装时，把这句话交给 opencode AI 代理执行：

```text
Fetch and follow the global install instructions from https://gitee.com/jiangqiang1996/ai-agent-engine/raw/master/docs/INSTALL.md
```

项目级安装时，把这句话交给 opencode AI 代理执行：

```text
Fetch and follow the project-level install instructions from https://gitee.com/jiangqiang1996/ai-agent-engine/raw/master/docs/INSTALL.md
```

安装前如果当前 opencode 环境已有 `oh-my-openagent`、`oh-my-opencode` 或 `superpowers`，先确认是否存在命令、规则或插件冲突。

### 验证

重启 opencode 后运行：

```text
/ae-help
/ae-help review
```

能看到技能、命令、代理和模型路由，说明插件已加载。

## 经典用法

从需求直接推进到交付：

```text
/ae-lfg 实现一个带权限校验的文件上传功能
```

手动控制阶段：

```text
/ae-brainstorm 设计一个多租户数据隔离方案
/ae-review domain:document
/ae-plan
/ae-review domain:document
/ae-work
/ae-review
```

只做代码或文档审查：

```text
/ae-review mode:report-only
/ae-review domain:document docs/ae/plans/example.md
```

前端和浏览器验收：

```text
/ae-chrome-devtools
/ae-frontend-design 实现登录页
/ae-test-browser http://localhost:3000/login
```

解析 Swagger/OpenAPI：

```text
/ae-swagger-parser ./openapi.json method:POST keyword:login mode:detail
```

探索性修复：

```text
/ae-task-loop 修复所有 TypeScript 编译错误
```

## 常用入口

| 目标 | 入口 |
| --- | --- |
| 查看当前能力 | `/ae-help` |
| 想法生成 | `/ae-ideate` |
| 需求澄清 | `/ae-brainstorm` |
| 需求文档 | `/ae-prd` |
| 计划生成 | `/ae-plan` |
| 计划执行 | `/ae-work` |
| Worktree 续执行 | `/ae-work-continue` |
| 分支或 worktree 合并 | `/ae-merge-branch` |
| 工作总结 | `/ae-work-report` |
| 重构计划 | `/ae-refactor` |
| 代码或文档审查 | `/ae-review` |
| 前端初版 | `/ae-frontend-design` |
| chrome-devtools 浏览器能力 | `/ae-chrome-devtools` |
| 浏览器验收 | `/ae-test-browser` |
| 自动播放课程 | `/ae-course-auto-player` |
| Swagger/OpenAPI 摘要 | `/ae-swagger-parser` |
| HTML 单文件打包 | `/ae-html-bundle` |
| 静态服务器 | `/ae-static-server` |
| 项目关系图谱 | `/ae-graph-build`、`/ae-graph-query` |
| 探索性修复 | `/ae-task-loop` |
| 数据库操作 | `/ae-sql` |
| 会话交接 | `/ae-handoff` |
| 提示词优化 | `/ae-prompt-optimize` |
| 经验沉淀 | `/ae-save-experience` |
| 创建技能或代理 | `/ae-skill-creator`、`/ae-agent-creator` |
| 更新 AE 插件 | `/ae-update` |

详细参数、命令变体、代理分工、工具边界和产物路径见 [docs/usage-guide.md](docs/usage-guide.md)。配置合并和模型场景路由见 [docs/builtin-config.md](docs/builtin-config.md)。

## 工作规则

| 规则 | 说明 |
| --- | --- |
| 需求不清先澄清 | 复杂实现前先产出需求或计划，避免直接编码 |
| 审查先定范围 | 代码域和文档域分开处理，按范围选择审查代理 |
| 交付必须验证 | `/ae-work` 和 `/ae-lfg` 交付前检查验证、审查和 Git 授权证据 |
| 浏览器先注册 MCP | 当前会话使用 chrome-devtools-mcp 工具前必须先完成 `/ae-chrome-devtools` 动态注册或通过 MCP 注册状态校验 |
| Git 写操作需授权 | 提交、拉取、重置、清理、变基、推送等都需要明确授权；`/ae-commit` 不等同于 push |
| 远程写操作不默认提供 | 用户侧流程不提供 push、创建 PR、创建 Issue 或 Release 的可复制流程 |

## 资产快照

| 类型 | 当前快照 | 真源 |
| --- | ---: | --- |
| 技能 | 30 | `src/assets/skills/`、`src/services/ae-catalog.ts` |
| 命令 | 52 | `src/services/command-registration.ts`、`src/assets/commands/` |
| 代理 | 33 | `src/assets/agents/`、`src/services/agent-registration.ts` |
| 工具 | 18 | `src/tools/` |
| 规则 | 5 | `src/assets/rules/` |
| 内置配置 | 1 | `src/assets/config/ae.jsonc` |

该表是文档快照，不替代 `/ae-help`。

## 配置

AE 默认注入两个远程 MCP：

| 名称 | 作用 |
| --- | --- |
| `context7` | 获取库/框架文档 |
| `gh_grep` | 搜索真实 GitHub 代码示例 |

可选配置入口：

| 路径 | 作用 |
| --- | --- |
| `.opencode/ae.jsonc` | 当前项目覆盖 AE 内置配置 |
| `~/.config/opencode/ae.jsonc` | 当前用户的全局默认配置 |

示例：

```jsonc
{
  "$schema": "https://raw.giteeusercontent.com/jiangqiang1996/ai-agent-engine/raw/master/src/assets/config/ae.schema.json",
  "modelScenarios": {
    "quick": "provider/fast-model",
    "standard": "provider/default-model",
    "deep": "provider/strong-model",
    "vision": "provider/vision-model"
  }
}
```

完整规则见 [docs/builtin-config.md](docs/builtin-config.md)。

## 更新与卸载

全局更新：

```text
/ae-update
```

项目级更新：

```text
/ae-update project
```

`/ae-update` 面向 AE 插件安装或源码维护目录。涉及 `git reset --hard`、`git clean`、`git pull` 等本地 Git 写操作前，必须确认目标仓库和授权范围。

卸载时，把对应指令交给 opencode AI 代理执行：

```text
Fetch and follow the global uninstall instructions from https://gitee.com/jiangqiang1996/ai-agent-engine/raw/master/docs/INSTALL.md
```

```text
Fetch and follow the project-level uninstall instructions from https://gitee.com/jiangqiang1996/ai-agent-engine/raw/master/docs/INSTALL.md
```

## 开发

本仓库是 AE opencode 插件源码仓库。`dist/` 是构建产物，`.opencode/plugins/` 是本仓库调试桥接目录，不代表业务项目必须具备的结构。

| 操作 | 命令 |
| --- | --- |
| 安装依赖 | `npm install` |
| 构建 | `npm run build` |
| 测试 | `npm run test` |
| 类型检查 | `npm run typecheck` |

| 路径 | 作用 |
| --- | --- |
| `src/index.ts` | server 插件入口 |
| `src/tui.ts` | TUI 插件入口 |
| `src/assets/skills/` | 技能提示词和参考文件 |
| `src/assets/commands/` | Markdown 命令 |
| `src/assets/agents/` | 子代理提示词 |
| `src/assets/rules/` | 注入用户会话的规则 |
| `src/tools/` | opencode 工具定义 |
| `src/services/` | 注册、门禁、审查、配置和解析服务 |
| `src/schemas/` | 资产常量和输入 schema |

## 文档入口

| 入口                                               | 内容                         |
|--------------------------------------------------|----------------------------|
| [docs/usage-guide.md](docs/usage-guide.md)       | 用户手册、经典用法、能力说明、代理、工具、产物路径  |
| [docs/builtin-config.md](docs/builtin-config.md) | MCP、`ae.jsonc`、模型场景路由和覆盖规则 |
| [docs/INSTALL.md](docs/INSTALL.md)                 | 安装、更新、卸载代理执行说明             |
| `/ae-help`                                       | 当前运行时权威帮助                  |
