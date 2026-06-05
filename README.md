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

GALV 结构化设计流程：

```text
/ae-g1-invariants 需求文档路径
/ae-g2-data-model
/ae-g3-global-trace
/ae-a1-contracts
/ae-a2-assoc-trace
/ae-l1-ui-spec
/ae-l2-module-design module=订单
/ae-l3-module-verify module=订单
/ae-v1-e2e-verify
/ae-v2-completeness
```

**什么时候用 GALV 而不是 `/ae-prd` + `/ae-plan`？** 当业务规则复杂、多模块协作、数据一致性要求高时，`ae:prd` + `ae:plan` 的需求→计划路径可能不够——你需要先提取不变量、推导数据模型、定义跨模块契约、完成模块级设计再动手。GALV 就是在需求文档之后、编码之前，用结构化设计替代笼统计划的路径。当需求简单或目标明确时，直接用 `/ae-prd` + `/ae-plan` 即可。

GALV 产出从需求到设计的自闭环产物，任何 AI 代理可据此生成确定性一致的软件。四个字母对应四个阶段：

| 阶段 | 含义 | 技能 | 作用 |
| --- | --- | --- | --- |
| **G** Global | 全局基础 | `/ae-g1-invariants` | 从需求提取业务不变量、划定系统边界、识别模块拆分点 |
| | | `/ae-g2-data-model` | 从不变量推导实体、字段、关系、约束和状态机 |
| | | `/ae-g3-global-trace` | 用测试数据代入数据模型和状态机走通核心业务流程 |
| **A** Association | 跨模块关联 | `/ae-a1-contracts` | 定义模块间数据契约、数据流、共享状态和冲突解决策略 |
| | | `/ae-a2-assoc-trace` | 用具体数据走通跨模块数据流，验证契约自洽 |
| **L** Local | 局部设计 | `/ae-l1-ui-spec` | 生成结构化界面文档描述并验证可还原性（纯后端项目跳过） |
| | | `/ae-l2-module-design` | 为指定模块完成内部逻辑设计，产出设计文档和 DDL |
| | | `/ae-l3-module-verify` | 验证指定模块的数据推演、DDL 落地和文档可还原性 |
| **V** Verification | 终局验证 | `/ae-v1-e2e-verify` | 端到端走通跨模块全链路，验证数据流转和契约闭合 |
| | | `/ae-v2-completeness` | 逐条不变量追踪从声明到实现的证据链，识别断裂和遗漏 |

执行约束：按 G→A→L→V 固定顺序执行；每个技能只读取紧邻前序技能产物，对更上游产物只读；先执行技能禁止读取后续产物；跨技能共享索引 `galv-manifest.yaml`；产物根目录默认 `docs/ae/galv/<项目名>/`。

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
| GALV 不变量提取 | `/ae-g1-invariants` |
| GALV 数据模型 | `/ae-g2-data-model` |
| GALV 全局推演 | `/ae-g3-global-trace` |
| GALV 跨模块契约 | `/ae-a1-contracts` |
| GALV 关联推演 | `/ae-a2-assoc-trace` |
| GALV 界面规格 | `/ae-l1-ui-spec` |
| GALV 模块设计 | `/ae-l2-module-design module=<模块名>` |
| GALV 模块验证 | `/ae-l3-module-verify module=<模块名>` |
| GALV 端到端验证 | `/ae-v1-e2e-verify` |
| GALV 完整性回溯 | `/ae-v2-completeness` |
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
