# AI Agent Engine

AI Agent Engine（AE）是面向 opencode 的工程工作流插件，提供从构思、需求、计划、执行、审查到跨会话恢复的一组 AI 辅助能力。

AE 的权威帮助入口是 `/ae-help`。完整用户指导手册见 [docs/ae/usage-guide.md](docs/ae/usage-guide.md)。

## 支持范围

本项目只支持 opencode（[官网](https://opencode.ai)）。

## 安装

AE 支持两种安装模式：

| 模式 | 安装位置 | 生效范围 | 适用场景 |
| --- | --- | --- | --- |
| 全局安装 | `~/.config/opencode/ai-agent-engine` | 所有项目 | 日常开发，所有项目共享 AE |
| 项目级安装 | `<项目根目录>/.opencode/ai-agent-engine` | 仅当前项目 | 特定项目需要独立版本或定制 |

### 全局安装

把下面这句话原样复制给 opencode AI 代理：

```text
Fetch and follow the global install instructions from https://gitee.com/jiangqiang1996/ai-agent-engine/raw/master/.opencode/INSTALL.md
```

### 项目级安装

把下面这句话原样复制给 opencode AI 代理：

```text
Fetch and follow the project-level install instructions from https://gitee.com/jiangqiang1996/ai-agent-engine/raw/master/.opencode/INSTALL.md
```

### 给 AI 代理

按 `.opencode/INSTALL.md` 中的步骤执行安装。根据用户要求选择全局安装或项目级安装，默认为全局安装。

安装前必须检查项目中是否已存在以下可能与 AI Agent Engine 不兼容的插件，如有则向用户发出警告：

| 插件 |
| --- |
| `oh-my-openagent` |
| `oh-my-opencode` |
| `superpowers` |

## 更新

### 全局更新

```text
/ae-update
```

或把下面这句话原样复制给 opencode AI 代理：

```text
Fetch and follow the global update instructions from https://gitee.com/jiangqiang1996/ai-agent-engine/raw/master/.opencode/INSTALL.md
```

### 项目级更新

```text
/ae-update project
```

或把下面这句话原样复制给 opencode AI 代理：

```text
Fetch and follow the project-level update instructions from https://gitee.com/jiangqiang1996/ai-agent-engine/raw/master/.opencode/INSTALL.md
```

## 卸载

### 全局卸载

把下面这句话原样复制给 opencode AI 代理：

```text
Fetch and follow the global uninstall instructions from https://gitee.com/jiangqiang1996/ai-agent-engine/raw/master/.opencode/INSTALL.md
```

### 项目级卸载

把下面这句话原样复制给 opencode AI 代理：

```text
Fetch and follow the project-level uninstall instructions from https://gitee.com/jiangqiang1996/ai-agent-engine/raw/master/.opencode/INSTALL.md
```

## 快速开始

| 目标 | 推荐入口 | 示例 |
| --- | --- | --- |
| 从需求到交付 | `/ae-lfg` | `/ae-lfg 实现文件上传与预览功能` |
| 查看全部能力 | `/ae-help` | `/ae-help` |
| 需求探索 | `/ae-brainstorm` | `/ae-brainstorm 为管理后台添加审计日志` |
| 制定计划 | `/ae-plan` | `/ae-plan docs/ae/brainstorms/xxx-requirements.md` |
| 执行计划 | `/ae-work` | `/ae-work docs/ae/plans/xxx-plan.md` |
| 代码或文档审查 | `/ae-review` | `/ae-review mode:report-only` |
| 前端界面构建 | `/ae-frontend-design` | `/ae-frontend-design 为 SaaS 产品构建着陆页` |
| 浏览器测试 | `/ae-test-browser` | `/ae-test-browser http://localhost:3000` |
| 数据库操作 | `/ae-sql` | `/ae-sql SELECT * FROM users LIMIT 10` |

## 主流程

```text
构思 → 头脑风暴 → 文档审查 → 计划 → 文档审查 → 执行 → 代码审查 → 测试
```

推荐直接使用 `/ae-lfg` 启动完整流程。已有产物时，AE 会优先尝试跨会话恢复；没有可恢复产物时，从需求探索开始。

```text
/ae-lfg 实现用户权限管理模块，支持 RBAC 模型
```

需要更精细控制时，可以逐步执行：

```text
/ae-brainstorm 设计一个多租户数据隔离方案
/ae-review domain:document
/ae-plan
/ae-review domain:document
/ae-work
/ae-review
```

纯重构或技术债治理使用 `/ae-refactor` 进入带约束的计划流程：

```text
/ae-refactor 重构工具注册和技能目录，保持命令行为不变
/ae-review domain:document
/ae-work
/ae-review plan:docs/ae/plans/xxx-plan.md
```

## 能力概览

### 技能

AE 提供 18 个技能，公开命名为 `ae:<name>`，对应命令为 `/ae-<name>`。

| 技能 | 命令 | 说明 |
| --- | --- | --- |
| `ae:ideate` | `/ae-ideate` | 生成并批判性评估关于某个主题的落地想法 |
| `ae:brainstorm` | `/ae-brainstorm` | 围绕需求进行头脑风暴并产出需求文档 |
| `ae:document-review` | `/ae-document-review` | 面向文档的专项审查，统一由 `ae:review` 执行 |
| `ae:plan` | `/ae-plan` | 基于需求或输入生成 AE 技术计划 |
| `ae:refactor` | `/ae-refactor` | 重构专项计划入口 |
| `ae:work` | `/ae-work` | 按演进式计划执行工作 |
| `ae:review` | `/ae-review` | 统一审查代码域和文档域 |
| `ae:lfg` | `/ae-lfg` | 默认入口，从需求到执行驱动主流程 |
| `ae:setup` | `/ae-setup` | 诊断并安装前端设计依赖 |
| `ae:test-browser` | `/ae-test-browser` | 使用 agent-browser 执行浏览器测试 |
| `ae:frontend-design` | `/ae-frontend-design` | 构建具有设计品质的前端界面 |
| `ae:handoff` | `/ae-handoff` | 创建独立新会话并注入上下文 |
| `ae:prompt-optimize` | `/ae-prompt-optimize` | 优化提示词，确认后在新会话执行 |
| `ae:task-loop` | `/ae-task-loop` | 循环执行并自动验证直到达成目标 |
| `ae:sql` | `/ae-sql` | 通过 JDBC 连接数据库并执行 SQL |
| `ae:save-rules` | `/ae-save-rules` | 保存长期项目规范 |
| `ae:help` | `/ae-help` | 列出技能、命令和代理帮助信息 |
| `ae:update` | `/ae-update` | 更新 AE 插件 |

### 命令

AE 当前提供 20 个基础命令、17 个 `-po` 提示词优化变体、17 个 `-pa` 自动提示词优化变体，共 54 个命令。

`/ae-commit` 是基础命令，但没有对应 `ae:<name>` 技能。

### 代理

AE 当前提供 26 个可通过 `@<代理名>` 调用的代理：21 个审查代理、2 个研究代理、3 个工作流代理。

常用代理包括：

| 代理 | 说明 |
| --- | --- |
| `@correctness-reviewer` | 审查逻辑错误、边界情况和实现意图偏差 |
| `@testing-reviewer` | 审查测试覆盖缺口和弱断言 |
| `@standards-reviewer` | 审查项目规范一致性 |
| `@security-reviewer` | 审查安全漏洞或文档安全缺口 |
| `@repo-research-analyst` | 研究仓库结构、文档、约定和实现模式 |
| `@web-researcher` | 执行外部网络研究 |
| `@design-iterator` | 多轮截图分析与 UI 迭代优化 |
| `@figma-design-sync` | 检测并修复 Figma 与实现的视觉差异 |

完整清单请运行：

```text
/ae-help
```

## 文档与产物

| 路径 | 作用 |
| --- | --- |
| `docs/ae/brainstorms/` | 需求文档 |
| `docs/ae/plans/` | 计划文档 |
| `docs/ae/solutions/` | 过往方案与研究沉淀 |
| `.opencode/plugins/` | 插件运行时产物 |
| `.opencode/agents/ae/` | Agent 构建同步产物 |
| `.opencode/commands/` | Command 构建同步产物 |

## 开发

| 操作 | 命令 |
| --- | --- |
| 构建 | `npm run build` |
| 测试 | `npm run test` |
| 类型检查 | `npm run typecheck` |

TypeScript 源码位于 `src/`。受版本控制的 AE 资产真源位于 `src/assets/skills/`、`src/assets/agents/`、`src/assets/rules/` 和 `src/assets/commands/`。
