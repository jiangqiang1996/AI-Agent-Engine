# AE 用户指导手册

本手册根据 `/ae-help` 的权威输出整理，覆盖 AI Agent Engine 的技能、命令、代理和常见使用方式。

## 推荐入口

| 目标 | 推荐入口 | 说明 |
| --- | --- | --- |
| 查看全部能力 | `/ae-help` | 输出技能、命令和代理清单 |
| 从需求到交付 | `/ae-lfg` | 默认入口，自动驱动主流程 |
| 需求不清楚 | `/ae-brainstorm` | 通过对话澄清需求并生成文档 |
| 已有需求需要计划 | `/ae-plan` | 生成结构化计划 |
| 已有计划需要实现 | `/ae-work` | 按计划执行工作 |
| 纯重构或技术债治理 | `/ae-refactor` | 补充行为保持和测试护栏约束后进入计划 |
| 审查代码或文档 | `/ae-review` | 统一审查入口 |
| 构建前端界面 | `/ae-frontend-design` | 构建设计质量更高的 Web 界面 |
| 目标明确但路径不确定 | `/ae-task-loop` | 循环执行、验证并收敛 |

## 技能清单

AE 提供 18 个技能。技能以 `ae:<name>` 命名，通常对应一个 `/ae-<name>` 命令。

| 技能 | 命令 | 参数 | 说明 |
| --- | --- | --- | --- |
| `ae:ideate` | `/ae-ideate` | `[功能、关注领域或约束]` | 生成并批判性评估关于某个主题的落地想法 |
| `ae:brainstorm` | `/ae-brainstorm` | `[需求描述\|需求文档路径]` | 围绕需求进行头脑风暴并产出需求文档 |
| `ae:document-review` | `/ae-document-review` | `[mode:*] [文档路径]` | 面向文档的专项审查，通过 `ae:review` 统一技能执行 |
| `ae:plan` | `/ae-plan` | `[计划路径\|需求文档路径\|需求描述]` | 基于需求或输入生成 AE 技术计划 |
| `ae:refactor` | `/ae-refactor` | `[重构目标\|计划路径\|需求文档路径\|代码异味描述]` | 重构专项计划入口 |
| `ae:work` | `/ae-work` | `[计划路径\|工作描述]` | 按演进式计划执行工作并尽量委派给子代理 |
| `ae:review` | `/ae-review` | `[mode:*] [domain:code\|domain:document] [from:<ref>] [full] [full:<path>] [session] [plan:<path>] [文档路径]` | 统一审查代码域和文档域 |
| `ae:lfg` | `/ae-lfg` | `[需求描述\|已有产物路径]` | 默认入口，从需求到执行驱动 AE 主流程 |
| `ae:setup` | `/ae-setup` | `—` | 诊断并安装 AE 前端设计所需的外部依赖 |
| `ae:test-browser` | `/ae-test-browser` | `[URL\|路由]` | 使用 agent-browser 执行端到端浏览器测试 |
| `ae:frontend-design` | `/ae-frontend-design` | `[描述\|路径]` | 构建具有设计品质的前端界面 |
| `ae:handoff` | `/ae-handoff` | `—` | 提取当前会话核心结论，创建独立新会话并注入上下文 |
| `ae:prompt-optimize` | `/ae-prompt-optimize` | `[auto] [提示词内容]` | 将随意输入优化为结构化 AI 对话提示词 |
| `ae:task-loop` | `/ae-task-loop` | `[一句话目标描述]` | 循环执行任务并自动验证，直到达成目标后退出 |
| `ae:sql` | `/ae-sql` | `[SQL 语句]` | 通过 JDBC 连接任意数据库并执行 SQL |
| `ae:save-rules` | `/ae-save-rules` | `[规范类型]` | 总结当前会话中有价值的项目规范并保存 |
| `ae:help` | `/ae-help` | `[技能名或关键词]` | 列出技能、命令和代理帮助信息 |
| `ae:update` | `/ae-update` | `[project]` | 拉取 AE 插件最新代码并重新构建 |

## 命令清单

AE 当前提供 54 个命令：20 个基础命令、17 个 `-po` 提示词优化变体、17 个 `-pa` 自动提示词优化变体。

### 基础命令

| 命令 | 说明 |
| --- | --- |
| `/ae-ideate` | 生成并批判性评估关于某个主题的落地想法 |
| `/ae-brainstorm` | 围绕需求进行头脑风暴并产出需求文档 |
| `/ae-document-review` | 面向文档的专项审查，通过 `ae:review` 统一技能执行 |
| `/ae-plan` | 基于需求或输入生成 AE 技术计划 |
| `/ae-refactor` | 重构专项计划入口 |
| `/ae-work` | 按演进式计划执行工作并尽量委派给子代理 |
| `/ae-review` | 统一审查代码域和文档域 |
| `/ae-lfg` | 默认入口，从需求到执行驱动 AE 主流程 |
| `/ae-setup` | 诊断并安装 AE 前端设计所需的外部依赖 |
| `/ae-test-browser` | 使用 agent-browser 执行端到端浏览器测试 |
| `/ae-frontend-design` | 构建具有设计品质的前端界面 |
| `/ae-handoff` | 会话交接，创建独立新会话并注入上下文 |
| `/ae-prompt-optimize` | 提示词优化，确认后在新会话中执行 |
| `/ae-prompt-optimize-auto` | 提示词优化 auto 模式，跳过确认直接执行 |
| `/ae-task-loop` | 循环执行任务并自动验证，直到达成目标后退出 |
| `/ae-sql` | 通过 JDBC 连接任意数据库并执行 SQL |
| `/ae-save-rules` | 总结当前会话中有价值的项目规范并保存 |
| `/ae-help` | 列出技能、命令和代理帮助信息 |
| `/ae-update` | 拉取 AE 插件最新代码并重新构建 |
| `/ae-commit` | 智能提交变更，遵循项目 Git 提交规范 |

### 提示词优化命令

`-po` 命令会先优化提示词，再调用目标技能。适合需求描述不够清晰但希望先确认优化结果的场景。

| 命令 | 说明 |
| --- | --- |
| `/ae-ideate-po` | 先优化提示词，再用 `/ae-ideate` |
| `/ae-brainstorm-po` | 先优化提示词，再用 `/ae-brainstorm` |
| `/ae-document-review-po` | 先优化提示词，再用 `/ae-document-review` |
| `/ae-plan-po` | 先优化提示词，再用 `/ae-plan` |
| `/ae-refactor-po` | 先优化提示词，再用 `/ae-refactor` |
| `/ae-work-po` | 先优化提示词，再用 `/ae-work` |
| `/ae-review-po` | 先优化提示词，再用 `/ae-review` |
| `/ae-lfg-po` | 先优化提示词，再用 `/ae-lfg` |
| `/ae-setup-po` | 先优化提示词，再用 `/ae-setup` |
| `/ae-test-browser-po` | 先优化提示词，再用 `/ae-test-browser` |
| `/ae-frontend-design-po` | 先优化提示词，再用 `/ae-frontend-design` |
| `/ae-handoff-po` | 先优化提示词，再用 `/ae-handoff` |
| `/ae-task-loop-po` | 先优化提示词，再用 `/ae-task-loop` |
| `/ae-sql-po` | 先优化提示词，再用 `/ae-sql` |
| `/ae-save-rules-po` | 先优化提示词，再用 `/ae-save-rules` |
| `/ae-help-po` | 先优化提示词，再用 `/ae-help` |
| `/ae-update-po` | 先优化提示词，再用 `/ae-update` |

### 自动提示词优化命令

`-pa` 命令使用 auto 模式优化提示词，并跳过确认直接执行目标技能。

| 命令 | 说明 |
| --- | --- |
| `/ae-ideate-pa` | 先优化提示词，再自动执行 `/ae-ideate` |
| `/ae-brainstorm-pa` | 先优化提示词，再自动执行 `/ae-brainstorm` |
| `/ae-document-review-pa` | 先优化提示词，再自动执行 `/ae-document-review` |
| `/ae-plan-pa` | 先优化提示词，再自动执行 `/ae-plan` |
| `/ae-refactor-pa` | 先优化提示词，再自动执行 `/ae-refactor` |
| `/ae-work-pa` | 先优化提示词，再自动执行 `/ae-work` |
| `/ae-review-pa` | 先优化提示词，再自动执行 `/ae-review` |
| `/ae-lfg-pa` | 先优化提示词，再自动执行 `/ae-lfg` |
| `/ae-setup-pa` | 先优化提示词，再自动执行 `/ae-setup` |
| `/ae-test-browser-pa` | 先优化提示词，再自动执行 `/ae-test-browser` |
| `/ae-frontend-design-pa` | 先优化提示词，再自动执行 `/ae-frontend-design` |
| `/ae-handoff-pa` | 先优化提示词，再自动执行 `/ae-handoff` |
| `/ae-task-loop-pa` | 先优化提示词，再自动执行 `/ae-task-loop` |
| `/ae-sql-pa` | 先优化提示词，再自动执行 `/ae-sql` |
| `/ae-save-rules-pa` | 先优化提示词，再自动执行 `/ae-save-rules` |
| `/ae-help-pa` | 先优化提示词，再自动执行 `/ae-help` |
| `/ae-update-pa` | 先优化提示词，再自动执行 `/ae-update` |

`/ae-prompt-optimize` 本身没有 `-po` 或 `-pa` 变体，避免循环优化。

## 常见场景

### 从需求到交付

```text
/ae-lfg 实现用户权限管理模块，支持 RBAC 模型
```

等效的逐步推进流程：

```text
/ae-brainstorm 设计一个多租户数据隔离方案
/ae-review domain:document
/ae-plan
/ae-review domain:document
/ae-work
/ae-review
```

### 重构与技术债治理

```text
/ae-refactor recovery-service 逻辑分支过多，想拆分职责并保持行为不变
/ae-review domain:document
/ae-work docs/ae/plans/xxx-plan.md
/ae-review plan:docs/ae/plans/xxx-plan.md
```

### 跨会话恢复

```text
/ae-lfg
/ae-plan
/ae-work
```

恢复行为：

| 场景 | 行为 |
| --- | --- |
| 无产物 | 回到上游阶段，通常从 `ae:brainstorm` 开始 |
| 单一候选 | 自动恢复 |
| 多个候选 | 要求显式选择 |
| 审查失败 | 停留在当前阶段，先修复再继续 |

### 前端设计与验证

```text
/ae-setup
/ae-frontend-design 为 SaaS 产品构建着陆页
@design-iterator 对英雄区进行 10 轮迭代优化，参考 Stripe 的设计风格
@figma-design-sync 对比 Figma 设计稿与 http://localhost:3000 的差异
/ae-test-browser http://localhost:3000
```

### 代码审查

```text
/ae-review
/ae-review mode:report-only
/ae-review mode:autofix
/ae-review from:main
/ae-review plan:docs/ae/plans/xxx-plan.md
```

审查模式：

| 模式 | 行为 |
| --- | --- |
| `interactive` | 标准交互式审查，默认模式 |
| `headless` | 程序化静默模式 |
| `report-only` | 只输出报告，不修改文件 |
| `autofix` | 自动修复安全可修复的问题 |

### 文档审查

```text
/ae-review domain:document
/ae-document-review
/ae-review domain:document mode:report-only docs/ae/plans/xxx-plan.md
```

`/ae-document-review` 是兼容命令，面向文档审查时优先理解为 `/ae-review domain:document`。

### 探索性调试与修复

```text
/ae-task-loop 修复所有 TypeScript 编译错误
/ae-task-loop 让测试套件全部通过
/ae-task-loop 将项目从 Webpack 迁移到 Vite
```

`ae:work` 适合已有计划的执行，`ae:task-loop` 适合目标明确但路径不确定的任务。

### 数据库操作

```text
/ae-sql SELECT * FROM users WHERE status = 'active' LIMIT 10
/ae-sql DESCRIBE orders
/ae-sql ALTER TABLE users ADD COLUMN last_login_at TIMESTAMP
```

`ae:sql` 支持 MySQL、PostgreSQL、Oracle、SQL Server、SQLite、达梦、人大金仓、openGauss 等提供 JDBC 驱动的数据库，并可自动检测 Spring Boot 数据库配置。

### 提示词优化

```text
/ae-prompt-optimize 帮我搞一下那个用户登录的东西
/ae-prompt-optimize-auto 优化一下性能
/ae-plan-po 搞个权限系统
/ae-lfg-pa 加个文件上传功能
```

### 会话交接与规范沉淀

```text
/ae-handoff
/ae-save-rules
```

`/ae-handoff` 用于创建独立新会话并注入当前上下文。`/ae-save-rules` 用于把会话中沉淀出的长期项目规范保存到 `.opencode/rules/`。

## 代理清单

所有代理通过 `@<代理名>` 在会话中主动调用。

### 审查代理

| 代理 | 说明 |
| --- | --- |
| `@coherence-reviewer` | 审查文档内部一致性、术语漂移和结构性问题 |
| `@feasibility-reviewer` | 评估技术方法的可实现性、架构冲突和迁移风险 |
| `@product-lens-reviewer` | 从产品视角审查前提、战略后果、范围对齐和复杂度 |
| `@adversarial-reviewer` | 跨域对抗式审查，构造故障场景或质疑前提假设 |
| `@design-lens-reviewer` | 审查信息架构、交互状态、用户流程和 AI 模板化风险 |
| `@security-reviewer` | 审查代码漏洞或文档安全缺口 |
| `@step-granularity-reviewer` | 审查计划步骤粒度和多文件操作方式 |
| `@test-case-reviewer` | 审查测试用例文档的结构、覆盖、执行和验证质量 |
| `@research-reviewer` | 搜索历史方案、外部最佳实践和框架文档 |
| `@correctness-reviewer` | 审查逻辑错误、边界情况、状态管理 bug 和实现意图偏差 |
| `@testing-reviewer` | 审查测试覆盖缺口、弱断言、脆弱测试和边界覆盖 |
| `@standards-reviewer` | 根据项目标准审计变更 |
| `@agent-native-reviewer` | 审查 opencode 代理操作能力对等性和 CLI 代理就绪度 |
| `@api-contract-reviewer` | 审查 API 路由、请求响应类型、序列化和导出类型签名的契约变更 |
| `@reliability-reviewer` | 审查错误处理、重试、超时、后台任务和异步处理器可靠性 |
| `@maintainability-reviewer` | 审查过早抽象、不必要间接层、死代码、耦合和重复 |
| `@performance-reviewer` | 审查数据库查询、循环密集转换、缓存和 I/O 密集路径性能 |
| `@architecture-strategist` | 从架构视角检查模式合规性和设计完整性 |
| `@pattern-recognition-specialist` | 分析设计模式、反模式、命名规范和重复代码 |
| `@data-migrations-reviewer` | 审查迁移文件、schema 变更、数据转换和回填脚本 |
| `@previous-comments-reviewer` | 检查已有审查评论是否在当前 diff 中得到处理 |

### 研究代理

| 代理 | 说明 |
| --- | --- |
| `@repo-research-analyst` | 对仓库结构、文档、约定和实现模式进行全面研究 |
| `@web-researcher` | 执行迭代式网络研究，返回结构化外部参考信息 |

### 工作流代理

| 代理 | 说明 |
| --- | --- |
| `@spec-flow-analyzer` | 分析规格说明和功能描述的用户流程完整性与缺口 |
| `@design-iterator` | 通过多轮截图、分析、改进循环优化 UI 设计 |
| `@figma-design-sync` | 检测并修复 Web 实现与 Figma 设计之间的视觉差异 |

## 参数参考

| 入口 | 常用参数 | 说明 |
| --- | --- | --- |
| `/ae-review` | `domain:code` | 代码审查，默认域 |
| `/ae-review` | `domain:document` | 文档审查 |
| `/ae-review` | `mode:interactive` | 交互式审查，默认模式 |
| `/ae-review` | `mode:headless` | 静默程序化模式 |
| `/ae-review` | `mode:report-only` | 只读报告模式 |
| `/ae-review` | `mode:autofix` | 自动修复安全可修复问题 |
| `/ae-review` | `from:<ref>` | 指定 Git diff 基线 |
| `/ae-review` | `full` | 全量扫描 |
| `/ae-review` | `full:<path>` | 指定路径全量扫描 |
| `/ae-review` | `session` | 审查会话变更 |
| `/ae-review` | `plan:<path>` | 结合计划做需求完整性校验 |
| `/ae-update` | `project` | 项目级更新；无参数为全局更新 |
| `/ae-prompt-optimize` | `auto` | 跳过确认直接执行优化后的提示词 |

## 产物路径

| 路径 | 作用 |
| --- | --- |
| `docs/ae/brainstorms/` | 需求文档 |
| `docs/ae/plans/` | 计划文档 |
| `docs/ae/solutions/` | 历史方案、组织知识和研究沉淀 |
| `.opencode/rules/` | 长期项目规范 |
| `.opencode/plugins/` | 插件构建产物 |
| `.opencode/agents/ae/` | Agent 同步产物 |
| `.opencode/commands/` | Command 同步产物 |

## 技能关系

```text
ae:lfg
  → ae:brainstorm
  → ae:review domain:document
  → ae:plan 或 ae:refactor
  → ae:review domain:document
  → ae:work
  → ae:review

ae:ideate → ae:brainstorm
ae:frontend-design → @design-iterator → /ae-test-browser
ae:task-loop → 按目标在 work、brainstorm、review 等能力之间路由
```

## 获取最新帮助

本文档用于长期阅读和场景化指导。命令、参数和代理的最新权威清单始终以 `/ae-help` 输出为准。

```text
/ae-help
/ae-help review
/ae-help frontend
```
