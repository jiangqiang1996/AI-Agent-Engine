# AI Agent Engine

AE 是一套面向 opencode 的工程工作流插件：以 `ae:help` 技能为帮助入口，`/ae-help` 为默认发现命令，围绕需求、计划、执行、审查和跨会话恢复建立可持续的工程闭环。

## 支持范围

本项目**只支持 opencode**（[官网](https://opencode.ai)）。

## 安装

AE 支持两种安装模式：

| 模式 | 安装位置 | 生效范围 | 适用场景 |
| --- | --- | --- | --- |
| **全局安装** | `~/.config/opencode/ai-agent-engine` | 所有项目 | 日常开发，所有项目共享 AE |
| **项目级安装** | `<项目根目录>/.opencode/ai-agent-engine` | 仅当前项目 | 特定项目需要独立版本或定制 |

### 全局安装

把下面这句话原样复制给你的 **opencode AI 代理**：

```text
Fetch and follow the global install instructions from https://gitee.com/jiangqiang1996/ai-agent-engine/raw/master/.opencode/INSTALL.md
```

### 项目级安装

把下面这句话原样复制给你的 **opencode AI 代理**：

```text
Fetch and follow the project-level install instructions from https://gitee.com/jiangqiang1996/ai-agent-engine/raw/master/.opencode/INSTALL.md
```

### 给 AI 代理

按 `.opencode/INSTALL.md` 中的步骤执行安装。根据用户要求选择全局安装（1.1）或项目级安装（1.2），默认为全局安装。

安装前必须检查项目中是否已存在以下可能与 AI Agent Engine 不兼容的插件，如有则向用户发出警告：
- `oh-my-openagent`
- `oh-my-opencode`
- `superpowers`

## 更新

### 全局更新

```text
/ae-update
```

或把下面这句话原样复制给你的 **opencode AI 代理**：

```text
Fetch and follow the global update instructions from https://gitee.com/jiangqiang1996/ai-agent-engine/raw/master/.opencode/INSTALL.md
```

### 项目级更新

```text
/ae-update project
```

或把下面这句话原样复制给你的 **opencode AI 代理**：

```text
Fetch and follow the project-level update instructions from https://gitee.com/jiangqiang1996/ai-agent-engine/raw/master/.opencode/INSTALL.md
```

## 卸载

### 全局卸载

把下面这句话原样复制给你的 **opencode AI 代理**：

```text
Fetch and follow the global uninstall instructions from https://gitee.com/jiangqiang1996/ai-agent-engine/raw/master/.opencode/INSTALL.md
```

### 项目级卸载

把下面这句话原样复制给你的 **opencode AI 代理**：

```text
Fetch and follow the project-level uninstall instructions from https://gitee.com/jiangqiang1996/ai-agent-engine/raw/master/.opencode/INSTALL.md
```

---

> **详细使用指南：** 完整的命令清单（含 `-po`/`-pa` 变体）、技能详解、常见场景和命令组合请参阅 [docs/ae/usage-guide.md](docs/ae/usage-guide.md)。

---

## 快速开始

| 推荐入口 | 用途 | 无产物时行为 | 有产物时行为 |
| --- | --- | --- | --- |
| `/ae-lfg` | 默认总入口，驱动从需求到执行的完整主链路 | 从 `ae:brainstorm` 开始 | 优先恢复到对应阶段 |

直接输入 `/ae-lfg 你想构建的功能描述` 即可启动完整工程管道。

---

## 开发场景与使用方式

### 一、从需求到交付的完整链路

适用于：新功能开发、较大重构、需要经过完整工程流程的任务。

#### 主链路流程

```
需求构思 → 头脑风暴 → 需求审查 → 计划 → 计划审查 → 实现 → 代码审查 → 浏览器测试
```

| 步骤 | 入口 | 示例 | 产出 |
| --- | --- | --- | --- |
| 一键全链路 | `/ae-lfg 实现用户权限管理模块` | 输入需求描述，自动按步骤推进 | 代码 + 完整文档链 |
| 创意构思 | `/ae-ideate 如何提升开发者体验` | 在头脑风暴前先探索方向 | `docs/ae/ideation/*` |
| 需求探索 | `/ae-brainstorm 为管理后台添加审计日志` | 通过对话澄清需求并生成文档 | `docs/ae/brainstorms/*-requirements.md` |
| 需求审查 | `/ae-document-review` | 多角色审查需求文档质量 | findings / gate 结论 |
| 制定计划 | `/ae-plan` | 基于需求文档生成实现计划 | `docs/ae/plans/*-plan.md` |
| 执行实现 | `/ae-work docs/ae/plans/xxx-plan.md` | 按计划逐步实现代码 | 代码改动 |
| 代码审查 | `/ae-review mode:report-only` | 分层角色代理审查代码变更 | findings / gate 结论 |

**典型用法：**

```text
# 方式一：一键全链路（推荐新手使用）
/ae-lfg 实现一套文件上传与预览功能

# 方式二：逐步推进（适合需要精细控制的场景）
/ae-brainstorm 设计一个多租户数据隔离方案
/ae-document-review
/ae-plan
/ae-document-review
/ae-work
/ae-review
```

#### 跨会话恢复

所有主链路阶段支持跨会话恢复。关闭会话后重新打开，输入 `/ae-lfg` 即可从上次中断的阶段继续。

```text
# 昨天做到一半的计划，今天继续
/ae-lfg
```

---

### 二、前端开发场景

#### 2.1 环境准备

首次使用前端相关功能前，安装 `agent-browser`：

```text
/ae-setup
```

此命令会检测并安装前端设计所需的核心依赖（agent-browser CLI + Chromium）。

#### 2.2 从零构建 UI

适用于：着陆页、仪表盘、管理面板、Web 应用等前端界面构建。

```text
/ae-frontend-design 为我们的 SaaS 产品构建一个着陆页
```

**工作流程：**

1. **上下文检测** — 自动扫描项目中的设计令牌、组件库、CSS 框架、字体、配色等信号
2. **构建前规划** — 确定视觉主题、内容规划和交互规划
3. **构建实现** — 按设计指导原则生成代码（排版、色彩、构图、动效、可访问性）
4. **视觉验证** — 截图对比，一轮迭代修复明显问题

**设计原则：**
- 构图优先于组件，首屏当海报设计
- 避免千篇一律的 AI 美学（无紫色+白色偏好、无深色模式偏好、无通用卡片网格）
- 自动遵循已有项目的设计体系

#### 2.3 UI 迭代打磨

适用于：已有一版 UI，需要多轮视觉优化。

```text
@design-iterator 对着陆页的英雄区进行 10 轮迭代优化
```

**工作流程：** 截图 → 分析改进方向 → 代码修改 → 再截图 → 重复，每轮仅做 1-2 个针对性修改。

**参考风格：** 支持指定设计风格参考（如"类 Stripe"、"类 Linear"、"类 Vercel"）。

#### 2.4 Figma 设计稿还原

适用于：有 Figma 设计稿，需要确保代码实现与设计稿一致。

```text
@figma-design-sync 对比 Figma 设计稿与 http://localhost:3000 的实现差异
```

**工作流程：**
1. 通过 Figma MCP 采集设计规格
2. 通过 agent-browser 截取实现截图
3. 系统化对比（布局、排版、颜色、间距、阴影、圆角等）
4. 按严重度分级输出差异报告
5. 自动修复所有差异

#### 2.5 浏览器端到端测试

适用于：验证页面功能是否正常，包括渲染、交互和路由。

```text
# 测试指定页面
/ae-test-browser http://localhost:3000

# 自动检测变更范围并测试
/ae-test-browser
```

**工作流程：**
1. 分析 Git 变更，识别受影响的路由和页面
2. 逐一打开页面，验证关键元素和交互
3. 截图记录
4. 输出测试报告

#### 前端场景协作关系

```
/ae-setup           安装依赖（首次必须）
     ↓
/ae-frontend-design 构建界面（含一轮截图验证）
     ↓  效果不满意
@design-iterator    多轮迭代打磨
     ↓  有 Figma 设计稿
@figma-design-sync  设计稿还原度校验
     ↓  功能完成后
/ae-test-browser    端到端浏览器测试
```

---

### 三、后端开发场景

#### 3.1 数据库操作

适用于：查询数据、检查表结构、执行管理操作。

```text
# 查询数据
/ae-sql SELECT * FROM users WHERE status = 'active' LIMIT 10

# 查看表结构
/ae-sql DESCRIBE orders

# 执行 DDL（需用户确认）
/ae-sql ALTER TABLE users ADD COLUMN last_login_at TIMESTAMP
```

**支持的数据库：** MySQL、PostgreSQL、Oracle、SQL Server、SQLite、MariaDB、达梦、人大金仓、openGauss 等所有提供 JDBC 驱动的数据库。

**智能特性：**
- 自动检测 Spring Boot 项目中的数据库配置（`application.yml` / `application.properties`）
- 自动下载和匹配 JDBC 驱动
- 自动管理 JRE 运行时
- 写操作前强制确认（DROP、TRUNCATE、无 WHERE 的 DELETE/UPDATE）
- 大结果集自动建议添加 LIMIT

#### 3.2 探索性调试与修复

适用于：修复编译错误、环境搭建、遗留代码修复等目标明确但路径不确定的任务。

```text
/ae-task-loop 修复所有 TypeScript 编译错误
/ae-task-loop 让测试套件全部通过
/ae-task-loop 将项目从 Webpack 迁移到 Vite
```

**工作流程：** 每轮"执行 → 验证 → 判定"，直到目标达成或策略穷尽。支持无人值守运行（循环体禁言令）。

**与 `ae:work` 的区别：**
- `ae:work` — 有明确计划，按计划执行
- `ae:task-loop` — 目标明确但无计划，循环探索直到达成

---

### 四、质量保障场景

#### 4.1 文档审查

适用于：需求文档、计划文档的质量校验。

```text
/ae-document-review
```

**审查角色：** 一致性审查（章节矛盾、术语漂移）、可行性审查（架构冲突、依赖缺口）、产品视角审查（战略后果、机会成本）、范围守卫（不必要抽象、范围蔓延）、对抗性审查（质疑前提假设、条件性激活）、设计视角审查（交互状态缺口、条件性激活）、安全视角审查（认证假设、威胁模型、条件性激活）、步骤粒度审查（最小单元拆解）、批量操作审查（脚本化批量执行）。

#### 4.2 代码审查

适用于：提交 PR 前、迭代完成后的代码质量检查。

```text
# 交互式审查（默认）
/ae-review

# 只输出报告，不修改文件
/ae-review mode:report-only

# 自动修复安全类问题
/ae-review mode:autofix

# 指定 diff 基线
/ae-review base:main

# 结合计划做需求完整性校验
/ae-review plan:docs/ae/plans/xxx-plan.md
```

**审查模式：**

| 模式 | 行为 |
| --- | --- |
| `interactive` | 标准 interactive 审查，可交互决策 |
| `autofix` | 仅自动修复 `safe_auto` 类问题 |
| `report-only` | 只读，只输出报告 |
| `headless` | 程序模式，静默应用修复 |

**可单独调用的代码审查代理：**

| 代理 | 场景 |
| --- | --- |
| `@correctness-reviewer` | 审查逻辑错误、边界情况、状态管理 bug |
| `@testing-reviewer` | 审查测试覆盖缺口、弱断言、脆弱测试 |
| `@project-standards-reviewer` | 审查项目规范一致性 |
| `@agent-native-reviewer` | 审查代理操作能力对等性 |
| `@api-contract-reviewer` | 审查 API 契约破坏性变更 |
| `@reliability-reviewer` | 审查生产可靠性和故障模式 |
| `@adversarial-reviewer` | 对抗式构造故障场景 |
| `@maintainability-reviewer` | 审查过早抽象、耦合、命名模糊 |
| `@security-reviewer` | 审查可利用漏洞 |
| `@performance-reviewer` | 审查运行时性能和可扩展性 |
| `@architecture-strategist` | 评估架构模式合规与设计完整性 |
| `@pattern-recognition-specialist` | 分析设计模式、反模式、重复代码 |
| `@data-migrations-reviewer` | 审查数据完整性、迁移安全性 |
| `@kieran-typescript-reviewer` | 以严格标准审查 TypeScript 类型安全 |
| `@previous-comments-reviewer` | 复查历史审查评论处理情况 |
| `@cli-agent-readiness-reviewer` | 评估 CLI 代理友好度 |

---

### 五、研究与调研场景

| 代理 | 场景 | 示例 |
| --- | --- | --- |
| `@repo-research-analyst` | 仓库结构、文档、约定研究 | `@repo-research-analyst 分析这个项目的模块划分` |
| `@learnings-researcher` | 搜索过往解决方案 | `@learnings-researcher 总结项目中的错误处理模式` |
| `@best-practices-researcher` | 外部最佳实践、官方文档 | `@best-practices-researcher React Server Components 最佳实践` |
| `@framework-docs-researcher` | 框架完整文档与实现模式 | `@framework-docs-researcher Effect 框架的 Layer 用法` |
| `@web-researcher` | 网络搜索、竞品模式、跨领域类比 | `@web-researcher 对比 Zod 和 Valibot 的性能` |

---

### 六、项目管理与协作场景

#### 6.1 会话交接

适用于：需要将当前工作上下文交给其他会话或团队成员继续。

```text
/ae-handoff
```

自动提取当前会话的核心结论、决策、待办任务，创建独立新会话并注入上下文。

#### 6.2 保存项目规范

适用于：会话中产生了值得长期保存的项目规范（编码约定、架构决策等）。

```text
/ae-save-rules
```

将规范保存到 `.opencode/rules/` 目录，后续所有会话自动加载。

#### 6.3 创意构思

适用于：在深入头脑风暴之前，先探索各种可能方向。

```text
/ae-ideate 如何提升插件的性能
/ae-ideate 给我一些改进开发者体验的想法
/ae-ideate src/assets/skills/ 有什么可以优化的
```

**与头脑风暴的关系：**
- `ae:ideate` — 回答"哪些方向最值得探索？"
- `ae:brainstorm` — 回答"选定的方向具体意味着什么？"

---

## 技能与命令速查表

| 技能 | 命令 | 功能 | 支持恢复 |
| --- | --- | --- | --- |
| `ae:lfg` | `/ae-lfg` | 一键全链路 | 是 |
| `ae:ideate` | `/ae-ideate` | 创意构思 | 否 |
| `ae:brainstorm` | `/ae-brainstorm` | 需求探索 | 是 |
| `ae:document-review` | `/ae-document-review` | 需求/计划文档审查 | 是 |
| `ae:plan` | `/ae-plan` | 制定实现计划 | 是 |
| `ae:work` | `/ae-work` | 按计划执行实现 | 是 |
| `ae:review` | `/ae-review` | 代码审查 | 是 |
| `ae:task-loop` | `/ae-task-loop` | 目标驱动循环执行 | 否 |
| `ae:frontend-design` | `/ae-frontend-design` | 前端界面构建 | 否 |
| `ae:setup` | `/ae-setup` | 前端依赖安装 | 否 |
| `ae:test-browser` | `/ae-test-browser` | 浏览器测试 | 否 |
| `ae:sql` | `/ae-sql` | 数据库操作 | 否 |
| `ae:handoff` | `/ae-handoff` | 会话交接 | 否 |
| `ae:prompt-optimize` | `/ae-prompt-optimize` | 提示词优化 | 否 |
| `ae:save-rules` | `/ae-save-rules` | 保存项目规范 | 否 |
| `ae:help` | `/ae-help` | 查看帮助 | 否 |
| `ae:update` | `/ae-update` | 更新插件 | 否 |

## 可调用的代理速查表

所有代理通过 `@<代理名>` 调用，输入自由文本描述任务。

| 分类 | 代理 | 功能 |
| --- | --- | --- |
| **文档审查** | `@coherence-reviewer` | 章节间矛盾、术语漂移、结构性问题 |
| | `@feasibility-reviewer` | 架构冲突、依赖缺口、迁移风险 |
| | `@product-lens-reviewer` | 战略后果、采用动态、机会成本 |
| | `@scope-guardian-reviewer` | 不必要抽象、过早框架化、范围蔓延 |
| | `@adversarial-document-reviewer` | 质疑前提假设、揭示未声明预设（条件性） |
| | `@design-lens-reviewer` | 信息架构、交互状态、用户流程缺口 |
| | `@security-lens-reviewer` | 认证/授权假设、数据暴露风险、威胁模型 |
| | `@step-granularity-reviewer` | 步骤最小单元拆解、唯一产出物验证 |
| | `@batch-operation-reviewer` | 多文件操作脚本化批量执行 |
| **代码审查** | `@correctness-reviewer` | 逻辑错误、边界条件、状态管理 bug |
| | `@testing-reviewer` | 测试覆盖缺口、弱断言、脆弱测试 |
| | `@project-standards-reviewer` | 项目规范一致性审查 |
| | `@agent-native-reviewer` | 代理操作能力对等审查 |
| | `@api-contract-reviewer` | API 契约破坏性变更 |
| | `@reliability-reviewer` | 生产可靠性与故障模式 |
| | `@adversarial-reviewer` | 对抗式构造故障场景 |
| | `@maintainability-reviewer` | 过早抽象、耦合、命名模糊 |
| | `@security-reviewer` | 可利用漏洞审计 |
| | `@performance-reviewer` | 运行时性能与可扩展性 |
| | `@architecture-strategist` | 架构模式合规与设计完整性 |
| | `@pattern-recognition-specialist` | 设计模式、反模式、重复代码 |
| | `@data-migrations-reviewer` | 数据完整性、迁移安全性 |
| | `@kieran-typescript-reviewer` | TypeScript 类型安全与代码清晰度 |
| | `@previous-comments-reviewer` | 历史审查评论处理复查 |
| | `@cli-agent-readiness-reviewer` | CLI 代理友好度评估 |
| **研究分析** | `@repo-research-analyst` | 仓库结构、文档、约定和实现模式研究 |
| | `@learnings-researcher` | 搜索过往解决方案、发掘组织知识 |
| | `@best-practices-researcher` | 外部最佳实践、官方文档、框架指南 |
| | `@framework-docs-researcher` | 框架、库或依赖的完整文档与实现模式 |
| | `@web-researcher` | 迭代式网络研究、竞品模式、跨领域类比 |
| **工作流** | `@spec-flow-analyzer` | 用户流程完整性、边界用例发现、需求验证 |
| | `@design-iterator` | N 轮截图-分析-改进循环优化 UI 设计 |
| | `@figma-design-sync` | Web 实现与 Figma 设计视觉差异检测与修复 |

## 技能依赖关系

```
ae:lfg ───┬─→ ae:setup
           ├─→ ae:brainstorm ──→ ae:document-review
           │                 └──→ ae:plan ──→ ae:document-review ──→ ae:work ──→ ae:review
           └─→ ae:test-browser

ae:task-loop ──→ ae:work / ae:brainstorm / ae:review（按目标路由）
ae:ideate ─────→ ae:brainstorm（构思后引导进入头脑风暴）
ae:frontend-design ──→ @design-iterator（多轮迭代时）
                     ──→ /ae-test-browser（功能验证时）
```

## 提示词优化变体命令

每个基础命令（`/ae-prompt-optimize` 本身除外）自动生成两个变体：

| 后缀 | 行为 | 示例 |
| --- | --- | --- |
| `-po` | 先优化提示词，确认后再执行目标技能 | `/ae-plan-po 搞个权限系统` |
| `-pa` | 先优化提示词，自动模式跳过确认直接执行 | `/ae-lfg-pa 加个文件上传功能` |

共计 16 个 `-po` 命令 + 16 个 `-pa` 命令 = **32 个变体命令**。

加上 19 个基础命令，AE 共提供 **51 个命令**。

## 参数总表

| 入口 | 参数 | 说明 | 默认行为 |
| --- | --- | --- | --- |
| `ae:brainstorm` | 自由文本 | 需求描述或文档路径 | 无输入时要求补充 |
| `ae:document-review` | `mode:*` | 审查模式 | `interactive` |
| `ae:document-review` | 文档路径 | 要审查的文档 | 自动查找 |
| `ae:plan` | plan 路径 | 续写已有计划 | 自动查找 |
| `ae:plan` | requirements 路径 | 以需求生成计划 | 自动查找 |
| `ae:plan` | 自由文本 | 直接从描述规划 | bootstrap 模式 |
| `ae:work` | plan 路径 | 要执行的计划 | 自动查找 |
| `ae:work` | 自由文本 | 直接描述工作 | 建议先有计划 |
| `ae:review` | `mode:*` | `interactive` / `headless` / `report-only` / `autofix` | `interactive` |
| `ae:review` | `plan:<path>` | 用于需求完整性校验 | 仅审代码上下文 |
| `ae:review` | `base:<ref>` | diff 基线 | 自动推断 |
| `ae:lfg` | 自由文本 | 需求描述或产物路径 | 优先恢复 |
| `ae:task-loop` | 目标描述 | 一句话目标 | 要求补充 |
| `ae:frontend-design` | 描述或路径 | 前端设计描述 | 上下文推断 |
| `ae:test-browser` | URL 或路由 | 测试页面 | `http://localhost:3000` |
| `ae:sql` | SQL 语句 | 要执行的 SQL | 自动检测配置 |
| `ae:ideate` | 主题描述 | 构思方向 | 要求补充 |
| `ae:handoff` | _(无参数)_ | 会话交接 | 提取当前会话核心结论 |
| `ae:prompt-optimize` | `[auto] [提示词内容]` | 提示词优化 | 优化后确认再执行 |
| `ae:save-rules` | 规范类型 | 规范分类 | 自动推断 |
| `ae:update` | `project` | 项目级更新 | 全局更新 |
| `ae:commit` | _(无参数)_ | 智能提交变更 | 遵循项目 Git 提交规范 |

## 审查模式

| 模式 | 适用入口 | 行为 | Gate |
| --- | --- | --- | --- |
| `interactive` | 文档/计划/代码审查 | 标准 interactive 审查 | 是 |
| `headless` | 文档/计划/代码审查 | 供 pipeline 使用 | 由调用方决定 |
| `report-only` | 代码审查 | 只输出报告，不改文件 | 否 |
| `autofix` | 代码审查 | 仅修复 `safe_auto` 类问题 | 是 |

## 产物路径

| 路径 | 作用 |
| --- | --- |
| `docs/ae/brainstorms/` | 需求文档 |
| `docs/ae/plans/` | 计划文档 |
| `docs/ae/review/` | 审查运行产物 |
| `docs/ae/work/` | 执行运行产物 |
| `docs/ae/ideation/` | 创意构思产物 |

## 恢复规则

| 场景 | 行为 |
| --- | --- |
| 无产物 | 回到 `ae:brainstorm` |
| 单一候选 | 自动恢复 |
| 多个候选 | 要求显式选择 |
| 审查失败 | 停留在当前阶段，先修复再继续 |
| 用户中止 | 保留产物，下次可继续 |

## 构建与开发

| 项目 | 说明 |
| --- | --- |
| 开发真源 | 根目录 `package.json`、`src/`、`src/assets/skills/`、`src/assets/commands/`、`src/assets/agents/` |
| 运行时入口 | `.opencode/plugins/ae-server.js`、`.opencode/plugins/ae-tui.js` |
| 构建命令 | `npm run build` |
| 测试命令 | `npm run test` |
| 类型检查 | `npm run typecheck` |
| 全局插件目录 | `~/.config/opencode/plugins/`，opencode 自动加载该目录下的 `.js` / `.ts` 文件 |
