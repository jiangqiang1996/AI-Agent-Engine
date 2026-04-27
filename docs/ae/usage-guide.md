# AE 用户指导手册

本手册说明 AI Agent Engine（AE）安装后的使用方式，包括场景流程、命令变体、代理选择、参数和产物路径。安装、更新、卸载和开发信息只放在 [README.md](../../README.md) 中，本文不重复维护。

命令、参数、技能和代理的最新权威清单始终以 `/ae-help` 输出为准。

## 目录

- [推荐入口](#推荐入口)
- [主流程](#主流程)
- [常见场景](#常见场景)
- [前端设计与验证](#前端设计与验证)
- [命令与变体](#命令与变体)
- [代理使用](#代理使用)
- [参数速查](#参数速查)
- [产物路径](#产物路径)
- [获取最新帮助](#获取最新帮助)

## 推荐入口

| 目标 | 推荐入口 | 说明 |
| --- | --- | --- |
| 查看全部能力 | `/ae-help` | 输出技能、命令和代理清单 |
| 从需求到交付 | `/ae-lfg` | 默认入口，自动驱动主流程 |
| 需求不清楚 | `/ae-brainstorm` | 通过对话澄清需求并生成文档 |
| 生成计划 | `/ae-plan` | 基于需求或输入生成结构化计划 |
| 执行计划 | `/ae-work` | 按计划执行工作 |
| 纯重构或技术债治理 | `/ae-refactor` | 补充行为保持和测试护栏约束后进入计划 |
| 审查代码或文档 | `/ae-review` | 统一审查入口 |
| 构建前端界面 | `/ae-frontend-design` | 构建前端初版界面并做一轮视觉验证 |
| 浏览器验收 | `/ae-test-browser` | 使用 agent-browser 验证页面渲染和交互，不负责审美或 Figma 对齐 |
| 数据库操作 | `/ae-sql` | 通过 JDBC 连接数据库并执行 SQL |

## 主流程

推荐直接使用 `/ae-lfg` 启动完整流程：

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

主流程关系：

```text
ae:lfg
  → ae:brainstorm
  → ae:review domain:document
  → ae:plan 或 ae:refactor
  → ae:review domain:document
  → ae:work
  → ae:review
```

## 常见场景

### 需求探索

```text
/ae-brainstorm 为管理后台添加审计日志
```

适合需求还不够清楚、需要先讨论目标、范围、约束和成功标准的场景。

### 计划制定

```text
/ae-plan docs/ae/brainstorms/xxx-requirements.md
```

适合已有需求文档或较明确的任务描述，需要拆解实现单元、风险和验证方式的场景。

### 重构与技术债治理

```text
/ae-refactor recovery-service 逻辑分支过多，想拆分职责并保持行为不变
/ae-review domain:document
/ae-work docs/ae/plans/xxx-plan.md
/ae-review plan:docs/ae/plans/xxx-plan.md
```

`/ae-refactor` 不直接改代码，它先把目标转换为“保持外部行为、分阶段迁移、带测试护栏”的计划约束。

### 代码或文档审查

```text
/ae-review
/ae-review mode:report-only
/ae-review domain:document docs/ae/plans/xxx-plan.md
/ae-review plan:docs/ae/plans/xxx-plan.md
```

`/ae-document-review` 是兼容入口，面向文档审查时优先理解为 `/ae-review domain:document`。

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

### 探索性调试与修复

```text
/ae-task-loop 修复所有 TypeScript 编译错误
/ae-task-loop 让测试套件全部通过
```

`ae:work` 适合已有计划的执行，`ae:task-loop` 适合目标明确但路径不确定、需要循环尝试和验证的任务。

### 数据库操作

```text
/ae-sql SELECT * FROM users WHERE status = 'active' LIMIT 10
/ae-sql DESCRIBE orders
```

`ae:sql` 支持 MySQL、PostgreSQL、Oracle、SQL Server、SQLite、达梦、人大金仓、openGauss 等提供 JDBC 驱动的数据库，并可自动检测 Spring Boot 数据库配置。

### 会话交接与规范沉淀

```text
/ae-handoff
/ae-save-rules
```

`/ae-handoff` 用于创建独立新会话并注入当前上下文。`/ae-save-rules` 用于把会话中沉淀出的长期项目规范保存到 `.opencode/rules/`。

## 前端设计与验证

前端相关能力按目标选择入口：

| 场景 | 推荐入口 | 使用时机 | 不负责 |
| --- | --- | --- | --- |
| 从需求构建或改造 Web 界面 | `/ae-frontend-design` | 需要设计方向、前端实现和一轮视觉验证时 | 完整 E2E 测试、多轮视觉打磨、Figma 像素级还原 |
| 验证页面渲染和交互是否正常 | `/ae-test-browser` | 页面已可访问，需要检查路由、关键元素、表单、点击、错误状态时 | 定义视觉风格、审美打磨、Figma 对齐 |
| 对已有 UI 做多轮视觉打磨 | `@design-iterator` | 没有 Figma 约束，但希望基于截图逐轮优化视觉层级、间距、排版和质感时 | 从零设计完整页面、完整浏览器测试、业务逻辑修复 |
| 对齐 Figma 设计稿 | `@figma-design-sync` | 已有 Figma URL 和 Web URL，需要对比设计稿与实现差异并修复时 | 自由发挥设计方向、无 Figma 依据的审美迭代、完整 E2E 测试 |

推荐组合顺序是条件性建议，不是固定流水线：简单任务完成且无后续风险时可以直接结束。

1. 从需求做界面：先用 `/ae-frontend-design` 完成设计实现和一轮视觉验证。
2. 从 Figma 落地界面：已有 Figma 标准时，优先用 `@figma-design-sync` 对齐现有 Web 实现；如果还没有实现，先用 `/ae-frontend-design` 建立最小页面实现，再用 `@figma-design-sync` 对齐。
3. 验证功能可用性：界面实现或 Figma 对齐后，如需要真实交互验收，用 `/ae-test-browser` 验证页面渲染、路由和关键交互。
4. 继续提升视觉质量：没有 Figma 约束、且用户明确希望继续打磨时，用 `@design-iterator` 做多轮小步视觉优化。
5. 迭代后回归验证：`@design-iterator` 或 `@figma-design-sync` 修改了布局或交互后，再按需运行 `/ae-test-browser`。

无 Figma，从需求设计并打磨界面：

```text
/ae-setup
/ae-frontend-design 为 SaaS 产品构建着陆页
@design-iterator 对英雄区进行 10 轮迭代优化，参考 Stripe 的设计风格
/ae-test-browser http://localhost:3000
```

有 Figma，按设计稿还原并验证：

```text
/ae-setup
/ae-frontend-design 根据 Figma 设计稿建立可运行的最小页面实现
@figma-design-sync 对比 Figma 设计稿与 http://localhost:3000 的差异
/ae-test-browser http://localhost:3000
```

如果已有明确 Figma 设计稿，优先使用 `@figma-design-sync` 做约束式对齐；如果没有可运行 Web 实现，先用 `/ae-frontend-design` 建立最小实现，再回到 `@figma-design-sync`。如果没有 Figma 约束但想继续提升视觉表现，使用 `@design-iterator` 做开放式优化。`/ae-test-browser` 的截图用于测试证据和失败定位，不替代视觉设计判断。

## 命令与变体

AE 的公开技能以 `ae:<name>` 命名，通常对应 `/ae-<name>` 命令。完整清单运行 `/ae-help` 获取。

核心命令分组：

| 分组 | 命令 |
| --- | --- |
| 主流程 | `/ae-ideate`、`/ae-brainstorm`、`/ae-plan`、`/ae-refactor`、`/ae-work`、`/ae-review`、`/ae-lfg` |
| 前端与浏览器 | `/ae-setup`、`/ae-frontend-design`、`/ae-test-browser` |
| 辅助工具 | `/ae-task-loop`、`/ae-sql`、`/ae-handoff`、`/ae-save-rules`、`/ae-help`、`/ae-update` |
| 提示词优化 | `/ae-prompt-optimize`、`/ae-prompt-optimize-auto` |
| Git 辅助 | `/ae-commit` |

多数技能命令支持提示词优化变体：

| 变体 | 作用 | 示例 |
| --- | --- | --- |
| `-po` | 先优化提示词，再确认执行 | `/ae-plan-po 搞个权限系统` |
| `-pa` | auto 模式优化提示词并直接执行 | `/ae-lfg-pa 加个文件上传功能` |

示例：`/ae-plan-po` 表示先优化提示词，再调用 `/ae-plan`；`/ae-work-pa` 表示优化后自动调用 `/ae-work`。`/ae-prompt-optimize` 本身没有 `-po` 或 `-pa` 变体，避免循环优化。

## 代理使用

所有代理通过 `@<代理名>` 在会话中主动调用。完整清单运行 `/ae-help` 获取。

常用代理：

| 类别 | 代理 | 说明 |
| --- | --- | --- |
| 审查 | `@correctness-reviewer` | 审查逻辑错误、边界情况和实现意图偏差 |
| 审查 | `@testing-reviewer` | 审查测试覆盖缺口和弱断言 |
| 审查 | `@standards-reviewer` | 根据项目标准审计变更 |
| 审查 | `@security-reviewer` | 审查安全漏洞或文档安全缺口 |
| 研究 | `@repo-research-analyst` | 研究仓库结构、文档、约定和实现模式 |
| 研究 | `@web-researcher` | 执行外部网络研究 |
| 工作流 | `@spec-flow-analyzer` | 分析规格说明和功能描述的用户流程完整性 |
| 工作流 | `@design-iterator` | 通过多轮截图、分析、改进循环优化 UI 设计 |
| 工作流 | `@figma-design-sync` | 检测并修复 Web 实现与 Figma 设计之间的视觉差异 |

## 参数速查

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

## 获取最新帮助

```text
/ae-help
/ae-help review
/ae-help frontend
```
