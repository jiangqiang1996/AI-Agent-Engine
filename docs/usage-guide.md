# AE 用户手册

本手册说明 AI Agent Engine（AE）的常用流程、命令参数、命令变体、代理分工、工具边界和产物路径。当前运行时实际可用能力以 `/ae-help` 为准。

## 先选入口

| 目标 | 用这个 |
| --- | --- |
| 不确定要做什么 | `/ae-ideate` |
| 需求还模糊 | `/ae-brainstorm` |
| 想从需求一路做到交付 | `/ae-lfg` |
| 已有需求，需要方案 | `/ae-plan` |
| 已有计划，需要执行 | `/ae-work` |
| 合并分支或 worktree | `/ae-merge-branch` |
| 生成工作总结 | `/ae-work-report` |
| 只看风险，不改文件 | `/ae-review mode:report-only` |
| 审查文档 | `/ae-review domain:document <文档路径>` |
| 重构或技术债治理 | `/ae-refactor` |
| 前端初版 | `/ae-frontend-design` |
| 浏览器验收 | `/ae-test-browser` |
| 数据库查询或操作 | `/ae-sql` |
| Swagger/OpenAPI 联调摘要 | `/ae-swagger-parser` |
| HTML 单文件打包 | `/ae-html-bundle` |
| 构建或查询项目关系图谱 | `/ae-graph-build`、`/ae-graph-query` |
| 提示词太散 | `/ae-prompt-optimize` |
| 保存经验 | `/ae-save-experience` |
| 交接到新会话 | `/ae-handoff` |
| 查看完整帮助 | `/ae-help` |

## 经典用法

### 默认全流程

适合目标明确但还没有需求文档或计划的任务。

```text
/ae-lfg 实现一个带权限校验的文件上传功能
```

`/ae-lfg` 会尝试恢复已有 AE 产物；没有可恢复产物时，从需求澄清开始。正式执行通常会经过需求、计划、工作、审查、验证和交付证据汇总。

### 手动阶段流

适合团队希望逐步确认需求、计划和实现的任务。

```text
/ae-brainstorm 设计一个多租户数据隔离方案
/ae-review domain:document
/ae-plan
/ae-review domain:document
/ae-work
/ae-review
```

第一轮文档审查用于发现需求漏洞，第二轮文档审查用于检查计划可执行性，最后一轮代码审查用于检查实现风险。

### 只审查不修改

适合交付前风险扫描、PR 前自查或文档评审。

```text
/ae-review mode:report-only
/ae-review domain:document ae/plans/example.md
```

`mode:report-only` 只报告发现，不自动修复。`domain:document` 会走文档审查团队，不会把文档当代码 diff 处理。

### 前端与浏览器

```text
/ae-chrome-devtools
/ae-frontend-design 实现一个移动端优先的登录页
/ae-test-browser http://localhost:3000/login
```

只要实际使用 chrome-devtools-mcp 工具，必须先通过 `ae-chrome-devtools-mcp action=check` 校验当前工作区的 chrome-devtools MCP 注册状态；注册缺失或无效时先完成 `/ae-chrome-devtools` MCP 动态注册流程。`/ae-frontend-design` 负责初版界面，`/ae-test-browser` 负责真实浏览器验收；需要贴合 Figma 时使用 `@figma-design-sync`，需要多轮审美打磨时使用 `@design-iterator`。

### Swagger/OpenAPI

```text
/ae-swagger-parser ./openapi.json method:POST keyword:login mode:detail
```

`mode:overview` 输出接口概览，`mode:detail` 输出单接口或少量接口的联调摘要。该能力不请求业务接口，不生成 SDK，也不自动爬取 Swagger UI 页面中的规格地址。

### 探索性修复

```text
/ae-task-loop 修复所有 TypeScript 编译错误
```

适合“执行、观察、修复、再验证”的问题。需求定义不清、范围很大的产品功能，不适合直接丢给 task-loop。

## 技能命令

下表按使用顺序组织，而不是按字母排序。

| 命令 | 参数 | 用途 | 关键边界 |
| --- | --- | --- | --- |
| `/ae-ideate` | `[功能、关注领域或约束]` | 生成并批判性评估多个可落地想法 | 不直接编码 |
| `/ae-brainstorm` | `[需求描述\|需求文档路径]` | 澄清目标、范围、约束、用户流程和成功标准 | 产物是需求文档 |
| `/ae-document-review` | `[mode:*] [文档路径]` | 兼容的文档审查入口 | 实际通过 `ae:review` 文档域执行 |
| `/ae-plan` | `[计划路径\|需求文档路径\|需求描述]` | 把需求拆成技术计划 | 复杂实现前优先使用 |
| `/ae-refactor` | `[重构目标\|计划路径\|需求文档路径\|代码异味描述]` | 以消除技术债为优先约束生成重构计划 | 强调保持外部行为和测试护栏 |
| `/ae-work` | `[计划路径\|交接文件路径\|工作描述]` | 按计划执行变更并验证 | 交付前检查验证、审查和 Git 授权证据 |
| `/ae-work-report` | `[日报\|周报\|时间段\|提交范围]` | 基于提交和未提交变更生成工作报告 | 不执行 Git 写操作 |
| `/ae-merge-branch` | `[来源分支名\|本地 worktree 路径]` | 合并来源分支或 worktree 变更 | 本地 Git 写操作需明确授权 |
| `/ae-review` | `[mode:*] [domain:code\|domain:document] [from:<ref>] [full] [full:<path>] [session] [plan:<path>] [文档路径]` | 审查代码、文档、计划、全量路径或会话变更 | 代码域和文档域分开处理 |
| `/ae-lfg` | `[需求描述\|已有产物路径]` | 默认全流程入口 | 优先恢复已有产物；缺上游时回退到更早阶段 |
| `/ae-chrome-devtools` | `[MCP 注册|浏览器目标|chrome-devtools 工具]` | 浏览器能力中枢，负责 MCP 动态注册、目标选择和浏览器控制 | 确认 chrome-devtools MCP 连接就绪 |
| `/ae-test-browser` | `[URL\|路由]` | 浏览器端到端验收 | 先完成 chrome-devtools MCP 动态注册；不做审美设计 |
| `/ae-frontend-design` | `[描述\|路径]` | 构建前端初版界面 | 不替代完整 E2E 或 Figma 对齐 |
| `/ae-handoff` | `—` | 提取上下文并创建独立新会话 | 用于交接，不用于提示词优化 |
| `/ae-prompt-optimize` | `[auto] [提示词内容]` | 优化提示词并可在新会话执行 | 需要注入历史上下文时用 `/ae-handoff` |
| `/ae-task-loop` | `[一句话目标描述]` | 循环执行和验证直到目标达成 | 不适合需求不清的大型功能 |
| `/ae-sql` | `[SQL 语句]` | 通过 JDBC 连接数据库并执行 SQL | 执行前应确认目标库和语句风险 |
| `/ae-swagger-parser` | `[source] [method:<HTTP_METHOD>] [path:<PATH>] [tag:<TAG>] [keyword:<TEXT>] [mode:overview\|detail]` | 解析 Swagger/OpenAPI 并输出联调摘要 | 不请求业务接口 |
| `/ae-html-bundle` | `[entry:<HTML_PATH>] [output:<HTML_PATH>] [external:keep\|fail]` | 将显式入口 HTML 和本地静态资源打包为自包含 HTML | 不执行项目构建，不联网抓取外链 |
| `/ae-graph-build` | `[target:<PATH>] [mode:auto\|full\|incremental] [depth:shallow] [include:<PATH>...] [exclude:<PATH>...]` | 构建或增量维护项目文件关系图谱 | `include` 优先于 `exclude`，但不覆盖安全硬排除 |
| `/ae-graph-query` | `[mode:deps\|impact\|health\|filter\|path\|core\|stats\|pattern] [file:<PATH>] [target:<PATH>]` | 查询依赖、影响范围、核心模块和健康状态 | 图谱缺失时先构建 |
| `/ae-save-experience` | `[经验摘要\|保存目标]` | 保存 solution，并按需提炼 rules | 不把临时结论直接当长期规则 |
| `/ae-agent-creator` | `[代理用途\|代理名称] [--global] [--command]` | 创建或更新 OpenCode 原生代理 | 默认项目级；全局级需显式指定 |
| `/ae-skill-from-session` | `[目标技能名\|流程关注点\|资产名\|纠偏摘要] [--global] [--no-command]` | 从当前会话沉淀技能 | 写入前确认范围和资产路径 |
| `/ae-skill-creator` | `<技能名或需求描述> [--global] [--no-command\|--command-only]` | 创建或更新 OpenCode 原生技能和命令 | 支持技能、命令或二者同时创建 |
| `/ae-help` | `[技能名或关键词]` | 查看运行时能力清单 | 权威只读入口 |
| `/ae-update` | `[project]` | 更新 AE 插件安装 | 只用于 AE 插件维护语境 |

## 非技能基础命令

| 命令 | 用途 | 边界 |
| --- | --- | --- |
| `/ae-work-continue` | 在 B worktree 查找交接文件并继续执行 `ae:work` | 仅用于 A→B worktree 转移后的目标工作空间；多个交接文件时先让用户选择 |
| `/ae-commit` | 智能提交当前变更 | 只做本地提交；不等同于 push、PR、跳过 hooks 或改 Git 配置 |
| `/remove-local-branch-worktree` | 安全清理本地分支、worktree 和对应本地目录 | 删除分支、worktree 或目录前必须确认目标和风险 |

## 命令变体

`-po` 表示 prompt optimize：先优化提示词，确认后执行。`-pa` 表示 prompt auto：优化后跳过确认直接执行。

| 基础命令 | 确认执行 | 自动执行 |
| --- | --- | --- |
| `/ae-ideate` | `/ae-ideate-po` | `/ae-ideate-pa` |
| `/ae-brainstorm` | `/ae-brainstorm-po` | `/ae-brainstorm-pa` |
| `/ae-plan` | `/ae-plan-po` | `/ae-plan-pa` |
| `/ae-refactor` | `/ae-refactor-po` | `/ae-refactor-pa` |
| `/ae-work` | `/ae-work-po` | `/ae-work-pa` |
| `/ae-lfg` | `/ae-lfg-po` | `/ae-lfg-pa` |
| `/ae-task-loop` | `/ae-task-loop-po` | `/ae-task-loop-pa` |
| `/ae-frontend-design` | `/ae-frontend-design-po` | `/ae-frontend-design-pa` |

没有列出的命令不提供 `-po` 或 `-pa` 变体。

## 审查代理

一般用户优先用 `/ae-review`，让 AE 自动选择代理。需要手动指定时，可在会话中使用 `@<代理名>`。

| 代理 | 关注点 |
| --- | --- |
| `@correctness-reviewer` | 逻辑错误、边界情况、状态管理、错误传播 |
| `@testing-reviewer` | 测试覆盖、断言质量、边界用例 |
| `@standards-reviewer` | 项目规范、命名、工具选择、跨平台可移植性 |
| `@maintainability-reviewer` | 过早抽象、耦合、死代码、重复和命名问题 |
| `@security-reviewer` | 认证授权、输入处理、数据暴露和攻击面 |
| `@api-contract-reviewer` | API、请求响应类型、序列化和导出类型签名 |
| `@reliability-reviewer` | 错误处理、重试、超时、后台任务和异步处理 |
| `@performance-reviewer` | 数据库查询、循环密集转换、缓存和 I/O 路径 |
| `@architecture-strategist` | 架构模式、设计完整性和结构性重构 |
| `@pattern-recognition-specialist` | 设计模式、反模式、命名规范和重复代码 |
| `@data-migrations-reviewer` | 迁移、schema 变更、数据转换和回填脚本 |
| `@previous-comments-reviewer` | 已有 PR 评论或审查讨论是否处理 |
| `@agent-native-reviewer` | UI、工具或代理配置是否支持代理对等操作 |
| `@adversarial-reviewer` | 大 diff、高风险领域或复杂文档的对抗式审查 |
| `@coherence-reviewer` | 文档内部一致性、术语漂移和结构歧义 |
| `@feasibility-reviewer` | 技术方案依赖缺口、迁移风险和可实现性 |
| `@product-lens-reviewer` | 产品价值、战略后果、范围和复杂度 |
| `@design-lens-reviewer` | 信息架构、交互状态、用户流程和设计决策缺口 |
| `@step-granularity-reviewer` | 计划步骤粒度、唯一产物和批量操作方式 |
| `@test-case-reviewer` | 测试用例文档覆盖、步骤和可验证结果 |
| `@research-reviewer` | 历史方案、外部最佳实践和框架文档 |

## 研究与流程代理

| 代理 | 用途 | 边界 |
| --- | --- | --- |
| `@repo-research-analyst` | 研究仓库结构、文档、约定和实现模式 | 只做仓库研究，不替代实现 |
| `@web-researcher` | 做外部网络研究、竞品扫描和跨领域类比 | 用于外部上下文，不读取本地私有代码 |
| `@spec-flow-analyzer` | 分析规格、计划或功能描述中的用户流程缺口 | 不直接写代码 |
| `@design-iterator` | 对已有可运行 UI 做多轮截图、分析和审美优化 | 先完成 chrome-devtools MCP 动态注册；不从零创建完整页面 |
| `@figma-design-sync` | 按 Figma 或设计图片修复 Web 实现视觉偏差 | 先完成 chrome-devtools MCP 动态注册；不自由发挥设计方向 |

## 工具层能力

工具通常由技能或代理调用，用户一般不用直接调用。

| 工具 | 作用 | 不做什么 |
| --- | --- | --- |
| `ae-recovery` | 根据 AE 产物判断恢复阶段、后续技能和回退技能 | 不修改产物 |
| `ae-review-contract` | 根据审查类型、范围特征和模式生成审查团队 | 不执行审查代理 |
| `ae-chrome-devtools-mcp` | 检查或动态注册 chrome-devtools MCP | 不安装 chrome-devtools-mcp，不替代真实 MCP 注册 |
| `ae-help` | 生成当前运行时帮助 | 不修改配置 |
| `ae-handoff` | 创建独立新会话并注入上下文 | 不做普通提示词优化 |
| `ae-prompt-optimize` | 把优化后的提示词提交到新会话执行 | 不注入系统级历史上下文 |
| `ae-swagger-parser` | 解析 Swagger/OpenAPI 规格 | 不请求业务接口 |
| `ae-html-bundle` | 打包显式入口 HTML 和本地静态资源 | 不执行项目构建或联网抓取外链 |
| `ae-graph-build` | 构建或增量维护项目文件关系图谱 | 不分析运行时动态依赖或符号级调用链 |
| `ae-graph-query` | 查询图谱中的依赖、影响范围、核心模块和健康状态 | 不构建图谱 |
| `ae-task-analyzer` | 分析任务单元、文件范围和并行组 | 不修改项目文件 |
| `ae-doc-extract` | 从人读需求、计划或设计文档及其分片中提取结构化上下文 | 不生成、转换或迁移文档 |
| `ae-worktree-handoff` | 生成 A→B worktree 转移交接文件 | 不创建新会话 |

## 前端能力怎么选

| 场景 | 顺序 |
| --- | --- |
| 有设计稿但没有页面 | `/ae-frontend-design` → `@figma-design-sync` → `/ae-test-browser` |
| 已有页面，需要贴合 Figma | `@figma-design-sync` → `/ae-test-browser` |
| 没有设计稿，但要提升视觉质量 | `/ae-frontend-design` → `@design-iterator` → `/ae-test-browser` |
| 只验证功能流程 | `/ae-test-browser` |

浏览器相关路径都必须先校验当前工作区 chrome-devtools MCP 注册状态；注册缺失或无效时先完成 `/ae-chrome-devtools` MCP 动态注册流程。

## 产物路径

| 路径 | 作用 |
| --- | --- |
| `ae/prds/` | 需求文档 |
| `ae/plans/` | 计划文档 |
| `ae/solutions/` | 历史方案、研究和经验沉淀 |
| `.opencode/rules/` | 项目长期规则，可由经验沉淀流程写入 |
| `.opencode/ae.jsonc` | 项目级 AE 配置 |

这些是 AE 工作流产物和可选配置入口，不代表业务项目必须采用本源码仓库结构。

## 配置速记

AE 默认提供 `context7` 和 `gh_grep` 两个远程 MCP。项目级 `.opencode/ae.jsonc` 和全局 `~/.config/opencode/ae.jsonc` 可覆盖允许字段。

模型场景配置示例：

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

`quick` 适合帮助和提示词优化，`standard` 适合常规任务，`deep` 适合计划、工作和审查，`vision` 适合浏览器截图和前端视觉任务。完整合并规则见 [builtin-config.md](builtin-config.md)。

## 安全边界

| 边界 | 说明 |
| --- | --- |
| Git 写操作 | 提交、拉取、重置、清理、变基、推送都需要明确授权；`/ae-commit` 只代表本地提交 |
| 远程协作 | 用户侧流程不提供 push、创建 PR、创建 Issue 或 Release 的远程写流程 |
| 浏览器操作 | 实际执行任何 chrome-devtools-mcp 工具前必须先校验 chrome-devtools MCP 注册状态；注册缺失或无效时先完成 `/ae-chrome-devtools` MCP 动态注册流程 |
| 插件维护 | `/ae-update` 面向 AE 插件安装或源码维护，不是普通业务项目更新流程 |

## 查看最新帮助

```text
/ae-help
/ae-help review
/ae-help frontend
```
