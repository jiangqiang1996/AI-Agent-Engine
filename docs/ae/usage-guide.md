# AE 使用指南

本指南详细列出 AI Agent Engine 的所有命令、技能和代理，以及常见使用场景与命令组合。

---

## 一、命令完整清单

AE 的命令分为三类：**基础命令**（18 个）、**提示词优化命令**（`-po` 后缀，17 个）、**提示词优化自动命令**（`-pa` 后缀，17 个），共 **52 个命令**。

所有命令通过 `/ae-<名称>` 触发，后接 `$ARGUMENTS`（用户输入的参数文本）。

### 1.1 基础命令

| 命令 | 参数 | 功能 |
| --- | --- | --- |
| `/ae-lfg` | `[需求描述\|已有产物路径]` | 默认总入口，驱动从需求到执行的完整主链路 |
| `/ae-ideate` | `[功能、关注领域或约束]` | 生成并批判性评估关于某个主题的落地想法 |
| `/ae-brainstorm` | `[需求描述\|需求文档路径]` | 围绕需求进行头脑风暴并产出需求文档 |
| `/ae-review-doc` | `[mode:*] [文档路径]` | 对需求文档进行多角色审查 |
| `/ae-plan` | `[计划路径\|需求文档路径\|需求描述]` | 基于需求或输入生成技术计划 |
| `/ae-review-plan` | `[mode:*] [计划路径]` | 对计划文档进行多角色审查 |
| `/ae-work` | `[计划路径\|工作描述]` | 按演进式计划执行工作并尽量委派给子代理 |
| `/ae-review` | `[mode:*] [plan:\<path\>] [base:\<ref\>]` | 使用分层角色代理和置信度门控对代码改动进行结构化审查 |
| `/ae-task-loop` | `[一句话目标描述]` | 循环执行任务并自动验证，直到达成目标后退出 |
| `/ae-frontend-design` | `[描述\|路径]` | 构建具有设计品质的前端界面 |
| `/ae-setup` | _(无参数)_ | 诊断并安装 AE 前端设计所需的外部依赖 |
| `/ae-test-browser` | `[URL\|路由]` | 使用 agent-browser 执行端到端浏览器测试 |
| `/ae-sql` | `[SQL 语句]` | 通过 JDBC 连接任意数据库并执行 SQL |
| `/ae-handoff` | _(无参数)_ | 会话交接：提取核心结论，创建新会话并注入上下文 |
| `/ae-prompt-optimize` | `[auto] [提示词内容]` | 将用户随意输入优化为结构化 AI 提示词 |
| `/ae-prompt-optimize-auto` | `[提示词内容]` | 提示词优化（auto 模式）：跳过确认直接在新会话中执行 |
| `/ae-save-rules` | `[规范类型]` | 总结当前会话中有价值的项目规范并保存 |
| `/ae-help` | `[技能名或关键词]` | 列出所有可调用的技能和代理的帮助信息 |
| `/ae-update` | `[project]` | 拉取最新代码并重新构建，完成本地更新 |

### 1.2 提示词优化变体命令（`-po` 后缀）

每个 `-po` 命令先调用 `ae:prompt-optimize` 技能优化用户输入，将优化结果作为最终提示词，再调用目标技能。**需要用户确认后才执行**。

| 命令 | 等效流程 |
| --- | --- |
| `/ae-lfg-po <描述>` | 优化提示词 → `/ae-lfg <优化后的描述>` |
| `/ae-ideate-po <主题>` | 优化提示词 → `/ae-ideate <优化后>` |
| `/ae-brainstorm-po <需求>` | 优化提示词 → `/ae-brainstorm <优化后>` |
| `/ae-review-doc-po [参数]` | 优化提示词 → `/ae-review-doc <优化后>` |
| `/ae-plan-po <描述>` | 优化提示词 → `/ae-plan <优化后>` |
| `/ae-review-plan-po [参数]` | 优化提示词 → `/ae-review-plan <优化后>` |
| `/ae-work-po <描述>` | 优化提示词 → `/ae-work <优化后>` |
| `/ae-review-po [参数]` | 优化提示词 → `/ae-review <优化后>` |
| `/ae-task-loop-po <目标>` | 优化提示词 → `/ae-task-loop <优化后>` |
| `/ae-frontend-design-po <描述>` | 优化提示词 → `/ae-frontend-design <优化后>` |
| `/ae-setup-po` | 优化提示词 → `/ae-setup` |
| `/ae-test-browser-po [URL]` | 优化提示词 → `/ae-test-browser <优化后>` |
| `/ae-sql-po <SQL>` | 优化提示词 → `/ae-sql <优化后>` |
| `/ae-handoff-po` | 优化提示词 → `/ae-handoff` |
| `/ae-save-rules-po [类型]` | 优化提示词 → `/ae-save-rules <优化后>` |
| `/ae-help-po [关键词]` | 优化提示词 → `/ae-help <优化后>` |
| `/ae-update-po [project]` | 优化提示词 → `/ae-update <优化后>` |

> **注意：** `ae-prompt-optimize` 本身没有 `-po` 变体（避免无限循环）。

### 1.3 提示词优化自动变体命令（`-pa` 后缀）

与 `-po` 相同，但使用 auto 模式，**跳过用户确认直接提交并执行**。适用于对提示词质量有信心或希望快速运行的场景。

| 命令 | 与 `-po` 的区别 |
| --- | --- |
| `/ae-lfg-pa <描述>` | 自动优化并直接执行，无需确认 |
| `/ae-ideate-pa <主题>` | 自动优化并直接执行 |
| `/ae-brainstorm-pa <需求>` | 自动优化并直接执行 |
| `/ae-review-doc-pa [参数]` | 自动优化并直接执行 |
| `/ae-plan-pa <描述>` | 自动优化并直接执行 |
| `/ae-review-plan-pa [参数]` | 自动优化并直接执行 |
| `/ae-work-pa <描述>` | 自动优化并直接执行 |
| `/ae-review-pa [参数]` | 自动优化并直接执行 |
| `/ae-task-loop-pa <目标>` | 自动优化并直接执行 |
| `/ae-frontend-design-pa <描述>` | 自动优化并直接执行 |
| `/ae-setup-pa` | 自动优化并直接执行 |
| `/ae-test-browser-pa [URL]` | 自动优化并直接执行 |
| `/ae-sql-pa <SQL>` | 自动优化并直接执行 |
| `/ae-handoff-pa` | 自动优化并直接执行 |
| `/ae-save-rules-pa [类型]` | 自动优化并直接执行 |
| `/ae-help-pa [关键词]` | 自动优化并直接执行 |
| `/ae-update-pa [project]` | 自动优化并直接执行 |

---

## 二、技能详细清单

18 个技能，以 `ae:xxx` 格式命名，通过 `skill` 工具按需加载。

### 2.1 主流程技能

#### `ae:lfg` — 一键全链路

| 属性 | 说明 |
| --- | --- |
| 命令 | `/ae-lfg [需求描述\|已有产物路径]` |
| 产物 | 完整的代码改动 + 需求文档 + 计划文档 |
| 支持恢复 | 是 |

**适用场景：**
- 新功能开发，需要从需求到代码的完整流程
- 不确定应该从哪个阶段开始
- 跨会话恢复，继续未完成的工作

**不适用场景：**
- 已有明确计划只需执行（用 `ae:work`）
- 只需要代码审查（用 `ae:review`）
- 非软件开发任务（写作、翻译等）

**触发词：** 直接输入 `/ae-lfg` + 需求描述

---

#### `ae:ideate` — 创意构思

| 属性 | 说明 |
| --- | --- |
| 命令 | `/ae-ideate [功能、关注领域或约束]` |
| 产物 | `docs/ae/ideation/` 下的创意文档 |
| 支持恢复 | 否 |

**适用场景：**
- 回答"哪些方向最值得探索？"
- 请求创意生成："给我一些想法"、"帮我构思 X"
- 探索意外方向："有什么可以改进的"、"给我惊喜"
- 在深入头脑风暴之前先探索各种可能方向

**不适用场景：**
- 已有明确需求（用 `ae:brainstorm`）
- 已有明确计划（用 `ae:plan`）

**触发词：** "给我一些想法"、"帮我构思 X"、"有什么可以改进的"、"给我惊喜"、"你会改变什么"

---

#### `ae:brainstorm` — 需求探索

| 属性 | 说明 |
| --- | --- |
| 命令 | `/ae-brainstorm [需求描述\|需求文档路径]` |
| 产物 | `docs/ae/brainstorms/` 下的需求文档 |
| 支持恢复 | 是 |

**适用场景：**
- 回答"选定的方向具体意味着什么？"
- 功能想法、问题定义
- 用户描述模糊或宏大的功能需求
- 需要在决定构建什么之前思考各种选项
- 对范围/方向不确定

**不适用场景：**
- 已有明确需求文档（用 `ae:plan` 或 `ae:document-review`）
- 需要创意探索（用 `ae:ideate`）
- 需要直接写代码（用 `ae:work`）

**触发词：** "让我们头脑风暴一下"、"应该构建什么"、"帮我想想 X"

---

#### `ae:document-review` — 文档审查

| 属性 | 说明 |
| --- | --- |
| 命令 | `/ae-review-doc [mode:*] [文档路径]` |
| 参数 | `mode:interactive`（默认）、`mode:headless` |
| 产物 | 审查发现（findings）/ gate 结论 |
| 支持恢复 | 是 |

**适用场景：**
- 需求文档质量校验
- 计划文档质量校验
- 在进入下一阶段前确认文档质量

**不适用场景：**
- 代码审查（用 `ae:review`）
- 文档尚不存在（先用 `ae:brainstorm` 或 `ae:plan` 生成）

---

#### `ae:plan` — 制定计划

| 属性 | 说明 |
| --- | --- |
| 命令 | `/ae-plan [计划路径\|需求文档路径\|需求描述]` |
| 产物 | `docs/ae/plans/` 下的计划文档 |
| 支持恢复 | 是 |

**适用场景：**
- 为多步骤任务创建结构化计划
- 软件功能、研究工作流、活动、学习计划
- 任何受益于结构化分解的目标
- 深化已有计划

**不适用场景：**
- 任务简单直接（直接写代码更快）
- 需要代码审查（用 `ae:review`）
- 还没有需求文档且需求不明确（先用 `ae:brainstorm`）

**触发词：** "计划一下"、"创建计划"、"写技术方案"、"计划实现"、"怎么构建"、"方案是什么"、"拆解一下"、"深化计划"

---

#### `ae:plan-review` — 计划审查

| 属性 | 说明 |
| --- | --- |
| 命令 | `/ae-review-plan [mode:*] [计划路径]` |
| 参数 | `mode:interactive`（默认）、`mode:headless` |
| 产物 | 审查发现（findings）/ gate 结论 |
| 支持恢复 | 是 |

**适用场景：**
- 计划执行前的质量校验
- 验证步骤粒度、批量操作合理性
- 确认是否可以进入执行阶段

**不适用场景：**
- 代码审查（用 `ae:review`）
- 需求文档审查（用 `ae:document-review`）

---

#### `ae:work` — 按计划执行

| 属性 | 说明 |
| --- | --- |
| 命令 | `/ae-work [计划路径\|工作描述]` |
| 产物 | 代码改动 |
| 支持恢复 | 是 |

**适用场景：**
- 有明确计划，按计划执行
- 根据简要描述完成小型任务

**不适用场景：**
- 目标明确但路径不确定（用 `ae:task-loop`）
- 还没有计划（先用 `ae:plan`）
- 只需要代码审查（用 `ae:review`）

---

#### `ae:review` — 代码审查

| 属性 | 说明 |
| --- | --- |
| 命令 | `/ae-review [mode:*] [plan:\<path\>] [base:\<ref\>]` |
| 模式 | `interactive`（默认）、`autofix`、`report-only`、`headless` |
| 产物 | 审查报告 / 自动修复 |
| 支持恢复 | 是 |

**适用场景：**
- 提交 PR 前的代码质量检查
- 迭代完成后的质量验证
- 需求完整性校验（配合 `plan:` 参数）

**不适用场景：**
- 文档审查（用 `ae:document-review`）
- 计划审查（用 `ae:plan-review`）

---

### 2.2 辅助工具技能

#### `ae:task-loop` — 目标驱动循环执行

| 属性 | 说明 |
| --- | --- |
| 命令 | `/ae-task-loop [一句话目标描述]` |
| 支持恢复 | 否 |

**适用场景：**
- 修复编译错误、环境搭建、遗留代码修复
- 目标明确但路径不确定的探索性任务
- 需要无人值守运行的循环任务

**不适用场景：**
- 有明确计划（用 `ae:work`）
- 需求不明确（用 `ae:brainstorm`）
- 代码审查（用 `ae:review`）

**退出条件：** 目标达成 / 3 轮无进展 / 30 轮上限 / 不可恢复错误

---

#### `ae:frontend-design` — 前端界面构建

| 属性 | 说明 |
| --- | --- |
| 命令 | `/ae-frontend-design [描述\|路径]` |
| 支持恢复 | 否 |

**适用场景：**
- 着陆页、Web 应用、仪表盘、管理面板
- 组件和交互体验的全新构建或修改
- 需要自动遵循已有设计体系的前端工作

**不适用场景：**
- 后端 API 开发
- 数据库操作
- 非 Web 类型的 UI

---

#### `ae:setup` — 前端依赖安装

| 属性 | 说明 |
| --- | --- |
| 命令 | `/ae-setup`（无参数） |
| 支持恢复 | 否 |

**适用场景：**
- 首次使用前端相关功能前的环境准备
- 安装 `agent-browser` CLI + Chromium

**不适用场景：**
- 非前端任务
- 已安装过依赖的环境

---

#### `ae:test-browser` — 浏览器端到端测试

| 属性 | 说明 |
| --- | --- |
| 命令 | `/ae-test-browser [URL\|路由]` |
| 支持恢复 | 否 |

**适用场景：**
- 验证页面功能是否正常
- 前端代码变更后的回归测试
- 自动检测变更范围并测试受影响页面

**不适用场景：**
- 后端 API 测试
- 单元测试
- 本地开发服务器未启动时

---

#### `ae:sql` — 数据库操作

| 属性 | 说明 |
| --- | --- |
| 命令 | `/ae-sql [SQL 语句]` |
| 支持恢复 | 否 |

**适用场景：**
- 查询数据、检查表结构、执行管理操作
- 支持 MySQL、PostgreSQL、Oracle、SQL Server、SQLite、达梦、人大金仓、openGauss 等所有提供 JDBC 驱动的数据库
- 自动检测 Spring Boot 项目中的数据库配置

**不适用场景：**
- SQL 设计和优化（仅执行器角色）
- 数据库迁移脚本编写
- NoSQL 数据库
- Schema 设计

---

#### `ae:handoff` — 会话交接

| 属性 | 说明 |
| --- | --- |
| 命令 | `/ae-handoff`（无参数） |
| 支持恢复 | 否 |

**适用场景：**
- 需要将当前工作上下文交给其他会话
- 需要开启新会话但不想重复沟通背景
- 团队协作中的上下文传递

**不适用场景：**
- 当前会话内可完成的简单任务
- 不需要保留上下文的独立操作

---

#### `ae:prompt-optimize` — 提示词优化

| 属性 | 说明 |
| --- | --- |
| 命令 | `/ae-prompt-optimize [auto] [提示词内容]` |
| 命令（auto） | `/ae-prompt-optimize-auto [提示词内容]` |
| 支持恢复 | 否 |

**适用场景：**
- 将随意输入优化为结构化 AI 对话提示词
- 不确定如何描述需求时
- 想要更精确地触发特定技能

**不适用场景：**
- 提示词本身已经很清晰
- 需要在当前会话内继续工作（优化后会在新会话执行）

---

#### `ae:save-rules` — 保存项目规范

| 属性 | 说明 |
| --- | --- |
| 命令 | `/ae-save-rules [规范类型]` |
| 支持恢复 | 否 |

**适用场景：**
- 会话中产生了值得长期保存的项目规范
- 编码约定、架构决策、设计模式约定
- 后续所有会话自动加载这些规范

**不适用场景：**
- 一次性的任务特定操作
- 配置值和调试步骤

---

#### `ae:help` — 查看帮助

| 属性 | 说明 |
| --- | --- |
| 命令 | `/ae-help [技能名或关键词]` |
| 支持恢复 | 否 |

**适用场景：**
- 查看所有可用技能和代理
- 按名称或关键词搜索特定功能
- 了解某个技能的详细用法

---

#### `ae:update` — 更新插件

| 属性 | 说明 |
| --- | --- |
| 命令 | `/ae-update [project]` |
| 支持恢复 | 否 |

**适用场景：**
- 拉取 AE 插件最新代码并重新构建
- 全局更新（默认）或项目级更新（`project` 参数）

**不适用场景：**
- 首次安装（用 INSTALL.md 中的安装指令）

---

## 三、常见使用场景

### 场景 1：从需求到交付的完整流程

这是 AE 最核心的使用方式，适合新功能开发或较大重构。

```text
# 一键全链路（推荐新手）
/ae-lfg 实现用户权限管理模块，支持 RBAC 模型

# 等效的逐步推进
/ae-brainstorm 设计一个多租户数据隔离方案
/ae-review-doc
/ae-plan
/ae-review-plan
/ae-work
/ae-review
```

**流程说明：**
1. `ae:brainstorm` 通过对话澄清需求，产出需求文档（`docs/ae/brainstorms/`）
2. `ae:document-review` 多角色审查需求文档质量
3. `ae:plan` 基于需求生成结构化实现计划（`docs/ae/plans/`）
4. `ae:plan-review` 审查计划可行性
5. `ae:work` 按计划逐步实现代码
6. `ae:review` 提交前代码审查

---

### 场景 2：跨会话恢复

关闭会话后重新打开，从中断处继续。

```text
# 直接使用 lfg，自动检测已有产物并恢复
/ae-lfg

# 也可以从特定阶段恢复
/ae-plan              # 恢复到计划阶段
/ae-work              # 恢复到执行阶段
```

**恢复规则：**
- 无产物 → 回到 `ae:brainstorm`
- 单一候选 → 自动恢复
- 多个候选 → 要求选择
- 审查失败 → 停留当前阶段修复

---

### 场景 3：创意构思 → 头脑风暴

在深入之前先探索方向。

```text
# 先构思有哪些方向值得探索
/ae-ideate 如何提升插件的性能

# 选定方向后深入探索
/ae-brainstorm 优化插件启动速度，减少冷启动时间

# 继续后续流程
/ae-plan
/ae-work
```

**阶段关系：** `ae:ideate`（哪些方向值得探索？）→ `ae:brainstorm`（选定方向意味着什么？）→ `ae:plan`（如何实现？）

---

### 场景 4：前端设计与验证

完整的端到端前端工作流。

```text
# 1. 首次使用需安装依赖
/ae-setup

# 2. 构建前端界面
/ae-frontend-design 为 SaaS 产品构建着陆页

# 3. 如果效果不满意，多轮迭代
@design-iterator 对英雄区进行 10 轮迭代优化，参考 Stripe 的设计风格

# 4. 有 Figma 设计稿时，检查还原度
@figma-design-sync 对比 Figma 设计稿与 http://localhost:3000 的差异

# 5. 功能完成后，浏览器测试
/ae-test-browser http://localhost:3000
```

---

### 场景 5：代码审查

提交 PR 前的质量保障。

```text
# 交互式审查（默认）
/ae-review

# 只看报告不修改
/ae-review mode:report-only

# 自动修复安全类问题
/ae-review mode:autofix

# 指定 diff 基线
/ae-review base:main

# 结合计划做需求完整性校验
/ae-review plan:docs/ae/plans/xxx-plan.md
```

**也可以单独调用专业审查代理：**

```text
@correctness-reviewer 审查这段代码的逻辑正确性
@security-reviewer 检查是否有安全漏洞
@performance-reviewer 分析性能热点
@architecture-strategist 评估架构方案
```

---

### 场景 6：计划创建与深化

创建计划并审查质量。

```text
# 基于已有需求文档创建计划
/ae-plan docs/ae/brainstorms/xxx-requirements.md

# 审查计划
/ae-review-plan

# 深化计划（通过交互式审查发现盲点）
/ae-plan docs/ae/plans/xxx-plan.md
```

---

### 场景 7：探索性调试与修复

目标明确但路径不确定的任务。

```text
# 修复编译错误
/ae-task-loop 修复所有 TypeScript 编译错误

# 让测试通过
/ae-task-loop 让测试套件全部通过

# 环境迁移
/ae-task-loop 将项目从 Webpack 迁移到 Vite
```

**与 `ae:work` 的区别：** `ae:work` 有明确计划按计划执行，`ae:task-loop` 目标明确但无计划，循环探索直到达成。

---

### 场景 8：数据库操作

直接查询和操作数据库。

```text
# 查询数据
/ae-sql SELECT * FROM users WHERE status = 'active' LIMIT 10

# 查看表结构
/ae-sql DESCRIBE orders

# 执行 DDL（需确认）
/ae-sql ALTER TABLE users ADD COLUMN last_login_at TIMESTAMP
```

---

### 场景 9：会话交接

将工作上下文交给新会话或团队成员。

```text
# 交接当前会话
/ae-handoff

# 也可以配合提示词优化
/ae-handoff-po
```

---

### 场景 10：提示词优化

不确定如何描述需求时，让 AI 帮你优化。

```text
# 手动确认模式
/ae-prompt-optimize 帮我搞一下那个用户登录的东西

# auto 模式（跳过确认）
/ae-prompt-optimize-auto 优化一下性能

# 变体命令：先优化再执行
/ae-plan-po 搞个权限系统
/ae-lfg-pa 加个文件上传功能
```

---

## 四、命令组合使用

### 4.1 提示词优化 + 目标技能

当你不确定如何精确描述需求时，使用 `-po` 或 `-pa` 变体：

```text
# 优化后需确认
/ae-plan-po 搞个权限系统

# 优化后自动执行
/ae-lfg-pa 加个文件上传功能
```

**内部流程：** `ae:prompt-optimize` 优化输入 → 将优化结果传递给目标技能。

### 4.2 主链路 + 代码审查

完成功能开发后进行质量保障：

```text
/ae-lfg 实现搜索功能
# ... 完成后 ...
/ae-review mode:report-only
```

### 4.3 头脑风暴 + 文档审查 + 计划

逐步推进的精细控制模式：

```text
/ae-brainstorm 设计缓存策略
/ae-review-doc
/ae-plan
/ae-review-plan
```

### 4.4 前端设计 + 迭代 + 测试

前端完整工作流：

```text
/ae-setup
/ae-frontend-design 构建管理后台仪表盘
@design-iterator 优化仪表盘的视觉层次
/ae-test-browser http://localhost:3000
```

### 4.5 研究代理辅助决策

在关键决策点调用研究代理获取外部信息：

```text
# 在 brainstorm 阶段研究竞品
@web-researcher 对比 Zod 和 Valibot 的性能

# 在 plan 阶段查询框架文档
@framework-docs-researcher Effect 框架的 Layer 用法

# 查看项目内已有经验
@learnings-researcher 总结项目中的错误处理模式
```

---

## 五、代理速查表

所有代理通过 `@<代理名>` 调用，输入自由文本描述任务。

### 5.1 文档审查代理（9 个）

| 代理 | 功能 |
| --- | --- |
| `@coherence-reviewer` | 审查文档内部一致性 |
| `@feasibility-reviewer` | 评估方案落地可行性 |
| `@product-lens-reviewer` | 从产品价值与用户视角审查 |
| `@scope-guardian-reviewer` | 审查范围是否蔓延 |
| `@adversarial-document-reviewer` | 对文档做对抗式压力测试（条件性激活） |
| `@design-lens-reviewer` | 审查界面与交互设计约束（条件性激活） |
| `@security-lens-reviewer` | 审查文档中的安全边界（条件性激活） |
| `@step-granularity-reviewer` | 审查计划步骤是否拆解至最小单元 |
| `@batch-operation-reviewer` | 审查多文件操作是否可脚本化批量执行 |

### 5.2 代码审查代理（16 个）

| 代理 | 激活方式 | 功能 |
| --- | --- | --- |
| `@correctness-reviewer` | 常驻 | 审查逻辑正确性与边界条件 |
| `@testing-reviewer` | 常驻 | 审查测试覆盖与断言质量 |
| `@project-standards-reviewer` | 常驻 | 审查是否遵守项目规范 |
| `@maintainability-reviewer` | 常驻 | 审查可维护性与抽象合理性 |
| `@security-reviewer` | 条件性 | 基于 OWASP 标准执行安全漏洞审计 |
| `@performance-reviewer` | 条件性 | 审查算法复杂度、缓存策略及前端渲染性能 |
| `@adversarial-reviewer` | 条件性 | 对抗式构造故障场景 |
| `@api-contract-reviewer` | 条件性 | 审查接口契约破坏性变更 |
| `@reliability-reviewer` | 条件性 | 审查故障恢复与可靠性 |
| `@data-migrations-reviewer` | 条件性 | 审查数据迁移方案与执行细节 |
| `@kieran-typescript-reviewer` | 条件性 | 按严格 TS 标准审查实现 |
| `@previous-comments-reviewer` | 条件性 | 复查历史审查评论处理情况 |
| `@agent-native-reviewer` | 按需 | 审查代理操作友好性 |
| `@architecture-strategist` | 按需 | 从架构视角分析代码变更 |
| `@pattern-recognition-specialist` | 按需 | 分析设计模式、反模式和重复代码 |
| `@cli-agent-readiness-reviewer` | 按需 | 评估 CLI 对代理的友好程度 |

### 5.3 研究代理（5 个）

| 代理 | 功能 |
| --- | --- |
| `@repo-research-analyst` | 研究仓库结构与已有模式 |
| `@learnings-researcher` | 提炼已有经验与文档知识 |
| `@best-practices-researcher` | 收集社区最佳实践与框架文档 |
| `@framework-docs-researcher` | 收集框架、库或依赖的完整文档 |
| `@web-researcher` | 搜索并总结网络信息 |

### 5.4 工作流代理（3 个）

| 代理 | 功能 |
| --- | --- |
| `@design-iterator` | 推动多轮 UI 设计迭代 |
| `@figma-design-sync` | 同步 Figma 设计稿与代码实现 |
| `@spec-flow-analyzer` | 分析阶段流转和边界情况 |

---

## 六、技能依赖关系

```
ae:lfg ───┬─→ ae:setup（首次使用前端功能时）
           ├─→ ae:brainstorm ──→ ae:document-review
           │                 └──→ ae:plan ──→ ae:work ──→ ae:review
           ├─→ ae:plan-review ──→ ae:document-review
           └─→ ae:test-browser（有 UI 文件变更时）

ae:ideate ─────→ ae:brainstorm（构思后引导进入头脑风暴）
ae:task-loop ──→ ae:work / ae:brainstorm / ae:review（按目标路由）
ae:frontend-design ──→ @design-iterator（多轮迭代时）
                     ──→ /ae-test-browser（功能验证时）
```

**阶段依赖链：**
- `work` → 依赖 `plan` → 依赖 `brainstorm`
- `review` → 依赖代码变更，可直接执行
- `plan-review` → 依赖 `plan` 产物
