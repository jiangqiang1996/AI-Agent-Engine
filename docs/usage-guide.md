# AE 用户手册

本手册说明 AI Agent Engine（AE）的常用流程、命令参数、代理分工、工具边界和产物路径。当前运行时实际可用能力以 `/ae-help` 为准。

## 先选入口

| 目标 | 用这个 |
| --- | --- |
| 想多角度发散讨论一个主题 | `/ae-brainstorm` |
| 产出需求文档 | `/ae-prd` |
| 产出设计文档（架构、接口、数据模型、实现单元） | `/ae-design` |
| 已有设计，需要执行 | `/ae-work` |
| 合并分支或 worktree | `/ae-merge-branch` |
| 生成工作总结 | `/ae-work-report` |
| 查看本人代码变更 | `/ae-my-code-changes` |
| 只看风险，不改文件 | `/ae-review mode:report-only` |
| 前端设计、还原、交互或验收 | `/ae-web-forge` |
| 接口测试 | `/ae-api-tester` |
| 数据库查询或操作 | `/ae-sql` |
| Swagger/OpenAPI 联调摘要 | `/ae-swagger-parser` |
| 图片转 Markdown 描述 | `/ae-image` |
| 创建或编辑 DOCX | `/ae-docx` |
| 创建或编辑 PDF | `/ae-pdf` |
| 创建或编辑 PPTX | `/ae-pptx` |
| 创建或编辑 XLSX | `/ae-xlsx` |
| 幻灯片大纲生成 | `/ae-slides-outline` |
| 构建或查询项目关系图谱 | `/ae-graph-build`、`/ae-graph-query` |
| 保存经验 | `/ae-save-experience` |
| 提示词优化 | `/ae-prompt-optimize` |
| 交接到新会话 | `/ae-handoff` |
| 查看完整帮助 | `/ae-help` |

## 经典用法

### 手动阶段流

适合团队希望逐步确认需求、设计和实现的任务。

```text
/ae-brainstorm 设计一个多租户数据隔离方案
/ae-prd
/ae-design
/ae-review domain:document
/ae-work
/ae-review
```

`/ae-brainstorm` 仅做多视角发散讨论，不写文件；需要沉淀为正式需求文档时由 `/ae-prd` 承接。`/ae-design` 在需求之后产出设计文档，包含架构、接口、数据模型、测试用例和实现单元，供 `/ae-work` 直接执行。第一轮文档审查用于发现需求漏洞，第二轮代码审查用于检查实现风险。

### 只审查不修改

适合交付前风险扫描、PR 前自查或文档评审。

```text
/ae-review mode:report-only
/ae-review domain:document ae/designs/example.md
```

`mode:report-only` 只报告发现，不自动修复。`domain:document` 会走文档审查团队，不会把文档当代码 diff 处理。

### 前端与浏览器

```text
/ae-chrome-devtools
/ae-web-forge 实现一个移动端优先的登录页
/ae-web-forge --inspect http://localhost:3000/login
```

只要实际使用 chrome-devtools-mcp 工具，必须先通过 `/ae-chrome-devtools` 完成 chrome-devtools MCP 动态注册并确认连接就绪。`/ae-web-forge` 是前端开发统一入口，自动识别技术栈与可复用资产，通过子代理 `@ui-architect`（视觉设计与实现）、`@logic-weaver`（前端代码实现）、`@browser-inspector`（浏览器验收）自适应组合执行。

### Swagger/OpenAPI

```text
/ae-swagger-parser ./openapi.json method:POST keyword:login mode:detail
```

`mode:overview` 输出接口概览，`mode:detail` 输出单接口或少量接口的联调摘要。该能力不请求业务接口，不生成 SDK，也不自动爬取 Swagger UI 页面中的规格地址。

### 接口测试

```text
/ae-api-tester ./openapi.json
```

以真实业务流程编排为主、接口边界测试为辅的自动化接口测试，支持登录认证与接口请求脚本生成。

### 图片转 Markdown

```text
/ae-image file=./photo.jpg
```

将图片内容转为 Markdown 描述。支持 JPG/PNG/GIF/WebP/BMP 格式。转换结果写入 `ae/markdown/` 子目录。

PDF 文件的 Markdown 读取功能通过 `ae:pdf` 技能的 `to-markdown` 操作；DOCX/PPTX/XLSX 通过 `ae:officecli` 的 `view mode=text` 提取纯文本。

### 探索性修复

```text
/ae-task-loop 修复所有 TypeScript 编译错误
```

适合"执行、观察、修复、再验证"的问题。需求定义不清、范围很大的产品功能，不适合直接丢给 task-loop。

## 技能命令

下表按使用顺序组织，而不是按字母排序。

| 命令 | 参数 | 用途 | 关键边界 |
| --- | --- | --- | --- |
| `/ae-brainstorm` | `[讨论主题]` | 使用多个子代理从不同视角进行多轮发散讨论并汇总 | 不产出持久文档；需求沉淀转 `/ae-prd` |
| `/ae-prd` | `[目标描述\|需求文档路径]` | 澄清目标、边界、约束、成功标准和待定问题，产出需求文档 | 产物是需求文档 |
| `/ae-design` | `[需求文档路径\|旧 design\|裸描述] [dimensions=...] [refactor=true]` | 产出设计文档，含概览、架构、接口、数据模型、测试用例与实现单元；`refactor=true` 用于重构或技术债治理 | 供实施和审查对齐 |
| `/ae-work` | `[设计路径\|交接文件路径\|工作描述]` | 按设计执行变更并验证 | 交付前检查验证、审查和 Git 授权证据 |
| `/ae-work-report` | `[日报\|周报\|时间段\|提交范围]` | 基于提交和未提交变更生成工作报告 | 不执行 Git 写操作 |
| `/ae-my-code-changes` | `since=<date> [until=<date>]` | 获取指定时间内本人提交的所有代码变更 | 只取最终状态，不输出中间过程 |
| `/ae-merge-branch` | `[来源分支名\|本地 worktree 路径]` | 合并来源分支或 worktree 变更 | 本地 Git 写操作需明确授权 |
| `/ae-review` | `[mode:*] [domain:code\|domain:document] [from:<ref>] [full] [full:<path>] [session] [design:<path>] [路径...]` | 审查代码、文档、设计、全量路径或会话变更 | 代码域和文档域分开处理 |
| `/ae-chrome-devtools` | `[url] [action] [mode] [browser] [port] [task=任务描述]` | 浏览器能力中枢，负责 MCP 动态注册、目标选择和浏览器控制 | 确认 chrome-devtools MCP 连接就绪 |
| `/ae-web-forge` | `[描述\|Figma URL\|截图\|路由] [--design\|--match\|--logic\|--inspect]` | 统一前端能力入口：自由设计、设计还原、交互逻辑、浏览器验收 | 先完成 chrome-devtools MCP 动态注册 |
| `/ae-api-tester` | `[接口文档\|接口描述\|已有脚本路径\|业务流程描述]` | 以真实业务流程编排为主的自动化接口测试 | 支持登录认证与脚本生成 |
| `/ae-handoff` | `—` | 提取上下文并创建独立新会话 | 用于交接 |
| `/ae-task-loop` | `[一句话目标描述]` | 循环执行和验证直到目标达成 | 不适合需求不清的大型功能 |
| `/ae-sql` | `[SQL 语句]` | 通过 JDBC 连接数据库并执行 SQL | 执行前应确认目标库和语句风险 |
| `/ae-swagger-parser` | `[source] [method:<HTTP_METHOD>] [path:<PATH>] [tag:<TAG>] [keyword:<TEXT>] [mode:overview\|detail]` | 解析 Swagger/OpenAPI 并输出联调摘要 | 不请求业务接口 |
| `/ae-image` | `file=图片路径 [format=jpg|png] [outputPath=路径]` | 将本地图片转换为 Markdown 描述 | 支持 JPG/PNG/GIF/WebP/BMP |
| `/ae-graph-build` | `[target:<PATH>] [mode:auto\|full\|incremental] [depth:shallow] [include:<PATH>...] [exclude:<PATH>...]` | 构建或增量维护项目文件关系图谱 | `include` 优先于 `exclude`，但不覆盖安全硬排除 |
| `/ae-graph-query` | `[mode:deps\|impact\|health\|filter\|path\|core\|stats\|pattern] [file:<PATH>] [target:<PATH>]` | 查询依赖、影响范围、核心模块和健康状态 | 图谱缺失时先构建 |
| `/ae-save-experience` | `[经验摘要\|保存目标]` | 保存 solution，并按需提炼 rules | 不把临时结论直接当长期规则 |
| `/ae-prompt-optimize` | `[提示词内容] [mode=auto\|pause]` | 优化提示词并通过 ae-create-session 新开会话自动执行或暂停等待；mode=auto/pause 跳过确认提问 | 禁止与原始逻辑违背 |
| `/ae-agent-creator` | `[代理用途\|代理名称] [--global] [--command]` | 创建或更新 OpenCode 原生代理 | 默认项目级；全局级需显式指定 |
| `/ae-skill-creator` | `<技能名或需求描述> [--global] [--no-command\|--command-only] [--from-session]` | 创建或更新 OpenCode 原生技能和命令 | 支持技能、命令或二者同时创建；`--from-session` 从当前会话沉淀技能 |
| `/ae-help` | `[技能名或关键词]` | 查看运行时能力清单 | 权威只读入口 |
| `/ae-install` | `[global\|project]` | 安装或更新 AE 插件 | 自动判断已装则更新、未装则安装 |
| `/ae-uninstall` | `[global\|project]` | 卸载 AE 插件 | 删除桥接文件和仓库目录 |

## 非技能基础命令

| 命令                                 | 用途 | 边界 |
|------------------------------------| --- | --- |
| `/ae-work-continue`                | 在 B worktree 查找交接文件并继续执行 `ae:work` | 仅用于 A→B worktree 转移后的目标工作空间；多个交接文件时先让用户选择 |
| `/ae-commit`                       | 智能提交当前变更 | 只做本地提交；不等同于 push、PR、跳过 hooks 或改 Git 配置 |
| `/ae-remove-local-branch-worktree` | 安全清理本地分支、worktree 和对应本地目录 | 删除分支、worktree 或目录前必须确认目标和风险 |

## 审查代理

一般用户优先用 `/ae-review`，让 AE 自动选择代理。需要手动指定时，可在会话中使用 `@<代理名>`。

AE 采用 13 代理全并行架构，所有激活代理在同一轮一次性发出 Task 调用，只找问题不做修复；合并层负责去重、冲突解决、因果分析和修复方案生成。

| 代理 | 关注点 |
| --- | --- |
| `@ocr-reviewer` | 代码审查主引擎：bug、安全、性能、可维护性、测试覆盖、代码风格 |
| `@document-reviewer` | 文档审查主引擎：内部一致性、可行性、产品视角、步骤粒度、需求质量和证据核验 |
| `@architecture-design-reviewer` | 架构视角分析代码变更，检查架构边界、跨模块依赖和系统级抽象 |
| `@api-design-reviewer` | 审查接口契约破坏性变更和兼容性 |
| `@database-design-reviewer` | 审查数据迁移方案与执行细节（含数据库审查） |
| `@ui-ux-design-reviewer` | 审查 UI/UX 设计维度的交互流程完整性、状态覆盖、与需求的一致性以及原型完整性 |
| `@test-cases-design-reviewer` | 审查测试用例维度的结构完整性、覆盖完备性、步骤可执行性、结果可验证性和需求对齐程度 |
| `@security-design-reviewer` | 文档域安全审查：评估设计文档中的安全缺口、认证授权假设、数据暴露和威胁模型 |
| `@observability-design-reviewer` | 审查可观测性维度产物：日志规范、指标体系、告警规则、健康检查和 SLO/SLI 定义 |
| `@non-functional-design-reviewer` | 审查非功能维度产物：性能目标、并发模型、事务边界、缓存策略和容量规划 |
| `@design-integrity-reviewer` | 审查设计文档与需求的一致性、设计维度完整性、架构与数据模型可行性和安全设计覆盖 |
| `@traceability-reviewer` | 审查需求-设计-原型-实现-测试链路追溯，识别断裂引用、孤儿条目和未声明延期 |
| `@goal-alignment-reviewer` | 对照审查目标逐条校验变更是否达成，识别未达成项和偏离 |

## 研究与流程代理

| 代理 | 用途 | 边界 |
| --- | --- | --- |
| `@repo-research-analyst` | 研究仓库结构、文档、约定和实现模式 | 只做仓库研究，不替代实现 |
| `@web-researcher` | 做外部网络研究、竞品扫描和跨领域类比 | 用于外部上下文，不读取本地私有代码 |
| `@spec-flow-analyzer` | 分析规格、设计或功能描述中的用户流程缺口 | 不直接写代码 |
| `@ui-architect` | 视觉设计与实现：自由设计或设计稿还原，根据输入自动切换模式 | 先完成 chrome-devtools MCP 动态注册；不负责接口联调 |
| `@logic-weaver` | 前端代码实现：交互逻辑、API联调、状态管理、组件开发、重构、性能优化 | 不负责视觉设计 |
| `@browser-inspector` | 端到端浏览器测试与回归验证 | 先完成 chrome-devtools MCP 动态注册；不做审美设计迭代 |

## 域代理

域代理由 `ae:review` 或 `ae:work` 等技能自动调度，用户一般不需要手动指定。

| 代理 | 用途 | 边界 |
| --- | --- | --- |
| `@review-domain` | 审查域代理：选择审查者、并行调度、综合审查发现 | 不直接执行审查，由 `/ae-review` 调度 |
| `@development-domain` | 开发域代理：分析任务、选择专精代理、协调并行/流水线执行 | 不直接实现功能，由 `/ae-work` 调度 |
| `@frontend-dev` | 前端开发专精代理：处理 UI 组件、样式、交互逻辑和响应式设计 | 由开发域代理调度 |
| `@backend-dev` | 后端开发专精代理：处理 API、数据层、业务逻辑和中间件 | 由开发域代理调度 |
| `@debug-fix` | 调试修复专精代理：处理错误分析、根因定位、修复实现和回归验证 | 由开发域代理调度 |

## 工具层能力

工具通常由技能或代理调用，用户一般不用直接调用。

| 工具 | 作用 | 不做什么 |
| --- | --- | --- |
| `ae-recovery` | 根据 AE 产物判断恢复阶段、后续技能和回退技能 | 不修改产物 |
| `ae-review-contract` | 根据审查类型、范围特征和模式生成审查团队 | 不执行审查代理 |
| `ae-chrome-devtools-mcp` | 检查或动态注册 chrome-devtools MCP（内部工具） | 用户应通过 `/ae-chrome-devtools` 命令操作浏览器能力；不安装 chrome-devtools-mcp，不替代真实 MCP 注册 |
| `ae-help` | 生成当前运行时帮助 | 不修改配置 |
| `ae-handoff` | 创建独立新会话并注入上下文 | 不做提示词优化 |
| `ae-swagger-parser` | 解析 Swagger/OpenAPI 规格 | 不请求业务接口 |
| `ae-image` | 将本地图片转换为 Markdown 描述 | 不支持远程 URL，不处理音频/视频 |
| `ae-graph-build` | 构建或增量维护项目文件关系图谱 | 不分析运行时动态依赖或符号级调用链 |
| `ae-graph-query` | 查询图谱中的依赖、影响范围、核心模块和健康状态 | 不构建图谱 |
| `ae-task-analyzer` | 分析任务单元、文件范围和并行组 | 不修改项目文件 |
| `ae-doc-extract` | 从人读需求或设计文档及其分片中提取结构化上下文 | 不生成、转换或迁移文档 |
| `ae-worktree-handoff` | 生成 A→B worktree 转移交接文件 | 不创建新会话 |
| `ae-create-session` | 创建独立新会话，可选注入上下文或自动执行 | 不做会话级上下文交接 |
| `ae-domain-catalog` | 查询域代理目录，获取域代理和专精代理信息 | 不执行域代理调度 |
| `ae-domain-dispatch-prepare` | 预计算专精代理列表、协调策略和 prompt 模板 | 不执行域代理调度 |
| `ae-domain-dispatch-aggregate` | 将专精代理结果按策略聚合为 DomainExecutionResult | 单一代理执行无需聚合 |
| `ae-review-proof` | 写入 ae:review 结构化审查证明 | 不替代真实代码或文档审查 |
| `ae-timer` | 倒计时等待工具，暂停会话指定时长后继续 | 不用于轮询或精确毫秒级定时 |
| `ae-async-bash` | 在后台启动长期运行的命令并立即返回 | 不等待命令完成，不获取退出码 |

## 前端能力怎么选

| 场景 | 顺序 |
| --- | --- |
| 有设计稿但没有页面 | `/ae-web-forge --match` |
| 已有页面，需要贴合 Figma | `/ae-web-forge --match` → `/ae-web-forge --inspect` |
| 没有设计稿，但要提升视觉质量 | `/ae-web-forge --design` → `/ae-web-forge --inspect` |
| 只验证功能流程 | `/ae-web-forge --inspect` |

浏览器相关路径都必须先完成 chrome-devtools MCP 动态注册并确认连接就绪。

## 产物路径

| 路径 | 作用 |
| --- | --- |
| `ae/prds/` | 需求文档 |
| `ae/designs/` | 设计文档 |
| `ae/solutions/` | 历史方案、研究和经验沉淀 |
| `ae/graphs/` | 项目文件关系图谱 |
| `ae/reviews/` | 审查证明 |
| `ae/markdown/` | 文件转 Markdown 产物 |
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
    "vision": "provider/vision-model",
    "audio": "provider/audio-model",
    "video": "provider/video-model"
  }
}
```

`quick` 适合帮助和快速查询，`standard` 适合常规任务，`deep` 适合计划、工作和审查，`vision` 适合浏览器截图和前端视觉任务，`audio` 适合音频任务，`video` 适合视频任务。完整合并规则见 [builtin-config.md](builtin-config.md)。

## 安全边界

| 边界 | 说明 |
| --- | --- |
| Git 写操作 | 提交、拉取、重置、清理、变基、推送都需要明确授权；`/ae-commit` 只代表本地提交 |
| 远程协作 | 用户侧流程不提供 push、创建 PR、创建 Issue 或 Release 的远程写流程 |
| 浏览器操作 | 实际执行任何 chrome-devtools-mcp 工具前必须先通过 `/ae-chrome-devtools` 完成 MCP 动态注册并确认连接就绪 |
| 插件维护 | `/ae-install`、`/ae-uninstall` 面向 AE 插件安装或源码维护，不是普通业务项目更新流程 |

## 查看最新帮助

```text
/ae-help
/ae-help review
/ae-help frontend
```
