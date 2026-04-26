---
date: 2026-04-25
topic: agent-routing-map
---

# 子代理路由关系全景图

本文档梳理 `ae:review` 和 `ae:document-review` 两个技能中所有子代理在不同路由、不同阶段之间的完整关系。

## 0. 核心原则

### 0.1 ae:review 核心原则

| # | 原则 | 说明 |
|---|------|------|
| 1 | 范围先行，审查在后 | 在调度任何审查者之前，必须完成范围确定、排除规则应用和用户确认。不得跳过范围确认直接审查 |
| 2 | 只读操作 | 代码审查子代理不得编辑项目文件或变更仓库状态。仅 `safe_auto` 修复在综合阶段由编排器应用 |
| 3 | 意图驱动 | 每个发现必须对照意图摘要判断相关性。与意图无关的预存问题标记 `pre_existing: true`，不计入审查结论 |
| 4 | 证据必须基于代码 | 每个发现至少包含一项来自实际代码的证据。无证据的泛泛建议必须抑制 |
| 5 | 排除规则不可绕过 | 敏感文件和 `.opencode/` 始终排除。需求/计划文档默认排除，仅在用户明确指定时纳入 |
| 6 | 文档文件委派给 ae:document-review | ae-review 不直接审查文档文件，一律委派 |

### 0.2 ae:document-review 核心原则

| # | 原则 | 说明 |
|---|------|------|
| 1 | 内容分类驱动审查者选择 | 文档类型（requirements/plan/test/general）通过内容分析判断，而非路径。不同类型激活不同审查角色 |
| 2 | 完整文档传递 | 向每个审查者传递完整文档，不按章节拆分。审查者需要全局上下文才能发现跨章节矛盾 |
| 3 | 只读操作 | 审查子代理不得编辑文档、创建文件或做出更改。仅 `auto` 修复在综合阶段由编排器应用 |
| 4 | 证据必须来自文档 | 每个发现至少包含一条文档中的直接引用。无引用的泛泛建议必须抑制 |
| 5 | `auto` vs `present` 的判断标准是修复确定性 | 判断标准不是"这个修复重要吗？"而是"是否有不止一种合理的修复方式？"。明确正确的修复 → `auto`；需要用户判断 → `present` |
| 6 | 排除规则不可绕过 | `.opencode/` 始终排除 |

## 1. 代理总表

### 1.1 代码审查代理（19 个）

当前归属：`ae:review` 技能、`src/assets/agents/review/` 目录（20 个 .md 文件，其中 `architecture-strategist.md` 和 `pattern-recognition-specialist.md` 不属于 ae:review 流程）、`review` stage。

#### 常驻代理（6 个）

每次代码审查都会派发，不依赖文件类型或内容特征。

| # | 代理名 | 人设 | 关注点 | findings schema |
|---|--------|------|--------|----------------|
| 1 | `correctness-reviewer` | `correctness` | 逻辑错误、边界情况、状态管理 bug、错误传播失败、意图与实现的不匹配 | 代码 schema（file + line 定位） |
| 2 | `testing-reviewer` | `testing` | 测试覆盖缺口、弱断言、与实现耦合的脆弱测试、缺失的边界情况覆盖 | 代码 schema（file + line 定位） |
| 3 | `maintainability-reviewer` | `maintainability` | 过早抽象、不必要的间接层、死代码、耦合、命名模糊、设计模式误用和代码重复 | 代码 schema（file + line 定位） |
| 4 | `project-standards-reviewer` | `project-standards` | CLAUDE.md 和 AGENTS.md 标准审计变更、frontmatter 规则、引用包含、命名约定、跨平台可移植性和工具选择策略 | 代码 schema（file + line 定位） |
| 5 | `agent-native-reviewer` | — | 验证新功能可被代理访问——用户能做的任何操作，代理也能通过工具或命令完成 | 代码 schema（file + line 定位） |
| 6 | `learnings-researcher` | — | 搜索 `docs/ae/solutions/` 查找历史问题和已有经验 | 代码 schema（file + line 定位） |

#### 条件激活代理（9 个）

由 `selectCodeReviewers()` 函数基于 `CodeReviewSelectionInput` 判断激活。

| # | 代理名 | 人设 | 条件激活规则 | 关注点 | findings schema |
|---|--------|------|-------------|--------|----------------|
| 7 | `security-reviewer` | `security` | `hasSecurity === true` | 可利用漏洞——认证中间件、公共端点、用户输入处理、权限检查 | 代码 schema（file + line 定位） |
| 8 | `performance-reviewer` | `performance` | `hasPerformance === true` | 运行时性能和可扩展性——数据库查询、循环密集的数据转换、缓存层、I/O 密集路径 | 代码 schema（file + line 定位） |
| 9 | `api-contract-reviewer` | `api-contract` | `hasApi === true` | 破坏性契约变更——API 路由、请求/响应类型、序列化、版本控制、导出的类型签名 | 代码 schema（file + line 定位） |
| 10 | `reliability-reviewer` | `reliability` | `hasReliability === true` | 生产可靠性和故障模式——错误处理、重试、熔断器、超时、健康检查、后台任务、异步处理器 | 代码 schema（file + line 定位） |
| 11 | `cli-agent-readiness-reviewer` | `cli-readiness` | `hasCli === true`（初始激活）；当 `cli-readiness` 人设发现系统性问题时追加深度审计（见 §13） | CLI 与代理调用体验——CLI 是否仅能被代理使用，还是真正为代理的使用场景做了优化 | 代码 schema（file + line 定位） |
| 12 | `previous-comments-reviewer` | `previous-comments` | `hasPrMetadata === true`（仅 PR 模式） | 先前审查评论是否已在当前 diff 中得到处理 | 代码 schema（file + line 定位） |
| 13 | `kieran-typescript-reviewer` | `kieran-typescript` | `hasTypescript === true` | 按严格 TS 标准审查——类型安全、代码清晰度和可维护性 | 代码 schema（file + line 定位） |
| 14 | `adversarial-reviewer` | `adversarial` | `changedLineCount >= 50` 或 `hasSecurity === true` 或 `hasApi === true` | 对抗式构造故障场景来破坏实现，而非对照已知模式进行检查 | 代码 schema（file + line 定位） |
| 15 | `data-migrations-reviewer` | `data-migrations` | `hasMigrations === true` | 数据完整性、迁移安全性、生产验证与隐私合规 | 代码 schema（file + line 定位） |

#### 领域专用代理（4 个）

不由 `selectCodeReviewers()` 函数激活，而由 SKILL.md 阶段 3 的文件路由逻辑按文件类型匹配激活。

| # | 代理名 | 路由组 | 激活条件（文件路由匹配） | 关注点 | findings schema |
|---|--------|--------|------------------------|--------|----------------|
| 16 | `config-reviewer` | 配置路由 | 文件扩展名匹配 `.json` `.yaml` `.yml` `.toml` `.xml` | 语法正确性、schema 一致性、必填字段、敏感值检测 | 代码 schema（file + line 定位） |
| 17 | `infra-reviewer` | 基础设施路由 | 文件名匹配 `Dockerfile` `docker-compose.*` `*.tf` `*.tfvars` `.github/workflows/*` `Makefile` `Jenkinsfile` | 基础设施定义的最佳实践、安全性和完整性 | 代码 schema（file + line 定位） |
| 18 | `database-reviewer` | 数据库路由 | 文件扩展名匹配 `*.sql` `.prisma` 或为迁移文件 | 数据库 schema 变更、迁移安全性和数据完整性 | 代码 schema（file + line 定位） |
| 19 | `script-reviewer` | 脚本路由 | 文件扩展名匹配 `.sh` `.bash` `.ps1` `.bat` `.cmd` | 可移植性、幂等性、平台兼容性 | 代码 schema（file + line 定位） |

#### 不属于 ae:review 流程的代理

`review` 目录下有 2 个代理不属于 `ae:review` 技能的审查流程，未列入 `CODE_REVIEWERS`：

| 代理名 | 说明 |
|--------|------|
| `architecture-strategist` | 架构视角分析代码变更，独立使用（如 PR 审查），不通过 ae:review 调度 |
| `pattern-recognition-specialist` | 分析设计模式和反模式，独立使用，不通过 ae:review 调度 |

### 1.2 文档审查代理（10 个）

当前归属：`ae:document-review` 技能、`src/assets/agents/document-review/` 目录、`document-review` stage。

#### 常驻代理（2 个）

每次文档审查都会派发。

| # | 代理名 | 常驻 | 人设摘要 | findings schema |
|---|--------|------|---------|----------------|
| 1 | `coherence-reviewer` | **是** | 审查文档的内部一致性——章节间矛盾、术语漂移、结构性问题、导致理解分歧的歧义 | 文档 schema（section 定位） |
| 2 | `feasibility-reviewer` | **是** | 评估文档中提出的技术方法能否经受现实考验——架构冲突、依赖缺口、迁移风险和可实现性 | 文档 schema（section 定位） |

#### 条件激活代理（8 个）

由 `selectDocumentReviewers()` 函数基于 `DocumentReviewSelectionInput` 判断激活。

| # | 代理名 | 条件激活规则 | 人设摘要 | findings schema |
|---|--------|-------------|---------|----------------|
| 3 | `product-lens-reviewer` | `requirementCount >= 5` 或 `documentType === 'plan'` | 以高级产品负责人的视角审查文档——质疑前提主张、评估战略后果（发展轨迹、身份定位、采用动态、机会成本），揭示目标与工作的不一致 | 文档 schema（section 定位） |
| 4 | `scope-guardian-reviewer` | `requirementCount >= 5` 或 `documentType === 'plan'` | 审查文档的范围对齐和不合理的复杂度——质疑不必要的抽象、过早的框架化以及超出声明目标的范围 | 文档 schema（section 定位） |
| 5 | `adversarial-document-reviewer` | `requirementCount >= 5` 或 `hasArchitectureDecision === true` 或 `isHighRiskDomain === true` 或 `hasNewAbstraction === true` | 质疑前提假设、揭示未声明的预设、对决策进行压力测试 | 文档 schema（section 定位） |
| 6 | `design-lens-reviewer` | `hasUi === true` | 审查文档中缺失的设计决策——信息架构、交互状态、用户流程和 AI 模板化风险。使用维度评分识别缺口 | 文档 schema（section 定位） |
| 7 | `security-lens-reviewer` | `hasSecurity === true` | 评估文档中的安全缺口——认证/授权假设、数据暴露风险、API 表面漏洞和缺失的威胁模型要素 | 文档 schema（section 定位） |
| 8 | `step-granularity-reviewer` | `documentType === 'plan'` | 审查计划文档的步骤粒度——将每个步骤拆解至最小不可再分的单元，确保步骤具备唯一产出物且不共享可变中间状态 | 文档 schema（section 定位） |
| 9 | `batch-operation-reviewer` | `documentType === 'plan'` | 审查计划文档中多文件操作步骤——优先推荐脚本化批量执行方案，当条件依赖或规模过小时允许逐个操作 | 文档 schema（section 定位） |
| 10 | `test-case-reviewer` | `documentType === 'test'` | 审查测试用例文档的可测性、完备性、步骤可执行性和与需求的对齐程度 | 文档 schema（section 定位） |

#### 条件激活逻辑详解

`selectDocumentReviewers()` 按以下顺序叠加条件代理（最终去重）：

```
基础 = [coherence-reviewer, feasibility-reviewer]

如果 documentType === 'test'       → +test-case-reviewer
如果 documentType === 'plan'       → +product-lens-reviewer, +step-granularity-reviewer, +batch-operation-reviewer
如果 requirementCount >= 5         → +adversarial-document-reviewer
   或 hasArchitectureDecision      → +adversarial-document-reviewer
   或 isHighRiskDomain             → +adversarial-document-reviewer
   或 hasNewAbstraction            → +adversarial-document-reviewer
如果 requirementCount >= 5         → +product-lens-reviewer, +scope-guardian-reviewer
   或 documentType === 'plan'      → +product-lens-reviewer, +scope-guardian-reviewer
如果 hasUi                         → +design-lens-reviewer
如果 hasSecurity                   → +security-lens-reviewer

最终 = [...new Set([...基础, ...条件])]
```

注意：`product-lens-reviewer` 可从两个分支触发（`documentType === 'plan'` 和 `requirementCount >= 5`），去重后只出现一次。

### 1.3 代理数量汇总

| 技能 | 常驻 | 条件激活 | 领域专用 | 合计 |
|------|------|---------|---------|------|
| `ae:review` | 6 | 9 | 4 | 19 |
| `ae:document-review` | 2 | 8 | — | 10 |
| **合计（去重）** | — | — | — | **29** |

两个技能的代理集合无交集。

## 2. 代理路由关系图

### 2.1 ae:review 路由关系

```
ae:review
│
├─ 阶段 0：参数解析与模式检测
│   └─ 解析 mode:*/from:*/full/session 等标记
│
├─ 阶段 1：确定范围
│   ├─ Git 差异模式（from:/recent:）
│   ├─ 全量扫描模式（full/full:<path>）
│   ├─ 会话变更模式（session）
│   └─ 自动检测（无参数时）
│
├─ 阶段 2：意图发现与计划发现
│
├─ 阶段 3：文件路由与审查者选择  ◄── 核心路由决策
│   │
│   ├─ 文档文件（.md .rst .adoc .org .txt）
│   │   └─ 委派 ae:document-review ──────► 见 2.2
│   │
│   ├─ 源代码路由（.ts .tsx .js .jsx .py .java .go .rs ...）
│   │   ├─ 基础：correctness, testing, maintainability, project-standards
│   │   └─ 条件：security, performance, api-contract, reliability,
│   │            adversarial, cli-readiness, previous-comments, kieran-typescript
│   │
│   ├─ 配置路由（.json .yaml .yml .toml .xml）
│   │   ├─ 基础：correctness, maintainability, project-standards
│   │   ├─ 条件：security
│   │   └─ 领域：config-reviewer
│   │
│   ├─ 基础设施路由（Dockerfile docker-compose.* *.tf ...）
│   │   ├─ 基础：correctness, maintainability, project-standards
│   │   ├─ 条件：security, reliability
│   │   └─ 领域：infra-reviewer
│   │
│   ├─ 数据库路由（*.sql .prisma 迁移文件）
│   │   ├─ 基础：correctness, maintainability, project-standards
│   │   ├─ 条件：data-migrations, security
│   │   └─ 领域：database-reviewer
│   │
│   ├─ API 契约路由（.graphql .proto .openapi.* swagger.*）
│   │   ├─ 基础：correctness, maintainability, project-standards
│   │   └─ 条件：api-contract
│   │
│   ├─ 样式/UI 路由（.css .scss .less .html .vue .svelte）
│   │   ├─ 基础：correctness, maintainability
│   │   └─ 条件：security
│   │
│   ├─ 脚本路由（.sh .bash .ps1 .bat .cmd）
│   │   ├─ 基础：correctness, maintainability, project-standards
│   │   ├─ 条件：security, reliability
│   │   └─ 领域：script-reviewer
│   │
│   └─ 兜底路由（不匹配任何路由的文件）
│       ├─ 基础：correctness, maintainability, project-standards
│       └─ 条件：无
│
│   全局代理（跨所有路由）：
│   ├─ agent-native-reviewer（常驻）
│   └─ learnings-researcher（常驻）
│
│   合并规则：多个文件属于不同路由时，合并所有活跃审查者（含领域代理），去重后统一派发
│
├─ 阶段 4a：生成代码审查子代理（并行）
│
├─ 阶段 4b：委派文档审查
│   └─ Skill("ae:document-review", "mode:headless <文件路径>")
│       └─ 合并返回结果到统一报告
│
└─ 阶段 5-7：综合、展示和审查后
```

### 2.2 ae:document-review 路由关系

```
ae:document-review
│
├─ 阶段 0：检测模式
│   ├─ mode:headless → 无头模式
│   └─ 默认 → 交互模式
│
├─ 阶段 1：获取并分析文档
│   ├─ 文档类型分类（通过内容分析，而非路径）
│   │   ├─ requirements — 关注构建什么和为什么构建
│   │   ├─ plan — 关注如何构建
│   │   ├─ test — 关注如何验证
│   │   └─ general — 通用文档（默认）
│   │
│   └─ 条件角色激活
│       ├─ product-lens      ← requirementCount >= 5 或 documentType === 'plan'
│       ├─ design-lens       ← hasUi === true
│       ├─ security-lens     ← hasSecurity === true
│       ├─ scope-guardian    ← requirementCount >= 5 或 documentType === 'plan'
│       ├─ adversarial       ← requirementCount >= 5 或 hasArchitectureDecision
│       │                      或 isHighRiskDomain 或 hasNewAbstraction
│       ├─ step-granularity  ← documentType === 'plan'
│       ├─ batch-operation   ← documentType === 'plan'
│       └─ test-case         ← documentType === 'test'
│
├─ 阶段 2：公告并调度角色
│   ├─ 始终包含：coherence-reviewer, feasibility-reviewer
│   ├─ 添加已激活的条件角色
│   └─ 并行调度所有代理
│
└─ 阶段 3-5：综合、展示和下一步操作
```

## 3. 模式规则

### 3.1 ae:review 模式规则

| 模式 | 交互 | 自动修复 | 展示 | 产物 |
|------|------|---------|------|------|
| **交互**（默认） | 询问策略决策 | 仅 `safe_auto` | 完整报告 + 选项 | 写入 |
| **自动修复** | 无 | 仅 `safe_auto` | 仅结果摘要 | 写入 |
| **只读** | 无 | 无 | 完整报告 | 无 |
| **无头** | 无 | 仅 `safe_auto` | 结构化文本 | 写入，返回"审查完成" |

### 3.2 ae:document-review 模式规则

| 模式 | 交互 | 自动修复 | 展示 | 终止 |
|------|------|---------|------|------|
| **交互**（默认） | 展示后询问 | 仅 `auto` | 完整报告 + 选项 | 用户选择 |
| **无头** | 无 | 仅 `auto` | 结构化文本摘要 | 立即返回"审查完成" |

### 3.3 `auto` vs `present` / `safe_auto` vs `gated_auto` 判断标准

判断标准是**修复确定性**，而非修复重要性：
- **明确正确的修复** → `auto`/`safe_auto`（只有一种合理的修复方式）
- **需要用户判断** → `present`/`gated_auto`/`manual`（存在不止一种合理的修复方式）

代码审查的 `autofix_class` 四级：
- `safe_auto`：局部的、确定性的修复（提取辅助函数、添加空值检查、修复差一错误）
- `gated_auto`：存在修复但会更改契约或权限（添加认证、更改 API 响应结构）
- `manual`：需要设计决策或跨模块变更（重新设计数据模型）
- `advisory`：信息性事项（残余风险说明、部署注意事项）

文档审查的 `autofix_class` 两级：
- `auto`：有且仅有一个明确正确的修复方案
- `present`：存在多种合理的修复方式，需要用户判断

## 4. 排除规则

### 4.1 ae:review 排除规则

**始终排除（任何情况下不可覆盖）：**

| 类别 | 文件/路径 | 说明 |
|------|----------|------|
| 敏感文件 | `.env`、`.env.*`（保留 `.env.example`、`.env.template`） | 在文件收集阶段即从文件列表中移除，后续任何阶段不可读取或引用 |
| 运行时目录 | `.opencode/` | 始终排除，不可覆盖 |
| 受保护产物 | `docs/ae/review/*`、`docs/ae/solutions/*` | 审查结果和历史方案 |
| 全局排除 | 图片/字体/媒体/压缩包/数据/锁文件 | `.png .jpg .gif .svg .ico .webp .bmp`、`.woff .woff2 .ttf .eot .otf`、`.mp3 .mp4 .wav .avi .mov .webm`、`.zip .tar .gz .rar .7z`、`.csv .xlsx .xls .pdf .doc .docx`、`package-lock.json yarn.lock pnpm-lock.yaml` |

**默认排除（用户明确指定时纳入）：**

| 类别 | 路径 | 说明 |
|------|------|------|
| 需求文档 | `docs/ae/brainstorms/` | 由 `ae:document-review` 在核心流程中审查 |
| 计划文档 | `docs/ae/plans/` | 由 `ae:document-review` 在核心流程中审查 |

**用户意图识别——以下信号视为用户明确要求审查需求/计划文档：**
- 对话中明确提到"审查需求文档"、"审查计划文档"等
- `full:<path>` 参数指向 `docs/ae/brainstorms/` 或 `docs/ae/plans/` 目录
- `full:<path>` 参数指向的路径包含需求/计划文档
- 用户在范围确认阶段主动添加了需求/计划文件

### 4.2 ae:document-review 排除规则

**始终排除（不可覆盖）：**

| 类别 | 路径 | 说明 |
|------|------|------|
| 运行时目录 | `.opencode/` | 始终排除 |
| 受保护产物 | `docs/ae/review/*`、`docs/ae/solutions/*` | 审查结果和历史方案 |

文档审查技能不审查代码文件——代码审查由 `ae:review` 负责。无默认排除类别（此技能本身即用于审查文档）。

## 5. 文档类型分类

`ae:document-review` 通过分析文档**内容**（而非路径）判断类型。

### 5.1 分类信号优先级

| 优先级 | 信号来源 | 说明 |
|--------|---------|------|
| 1 | frontmatter `topic` 字段 | 暗示内容主题 |
| 2 | 标题结构关键词 | 包含"需求"/"问题框架"→ requirements；包含"实现步骤"/"架构"→ plan；包含"测试用例"/"验收标准"/"预期结果"→ test |
| 3 | 路径提示（辅助） | `docs/ae/brainstorms/` → 倾向 requirements；`docs/ae/plans/` → 倾向 plan |

### 5.2 四种文档类型

| 类型 | 关注点 | 识别信号 |
|------|--------|---------|
| `requirements` | 构建什么和为什么构建 | 需求列表（R1、R2...编号）、问题框架、成功标准 |
| `plan` | 如何构建 | 实现步骤、架构决策、技术方案 |
| `test` | 如何验证 | 测试用例、验收标准、测试步骤与预期结果、边界与异常场景描述 |
| `general` | 通用文档 | 不匹配以上三种时的默认分类 |

## 6. 阶段流程说明

### 6.1 ae:review 阶段流程

| 阶段 | 名称 | 输入 | 核心动作 | 退出条件 |
|------|------|------|---------|---------|
| 0 | 参数解析与模式检测 | `$ARGUMENTS` | 解析参数标记，检测冲突（见下方详细说明） | 模式和范围标记解析完成，无冲突 |
| 1 | 确定范围 | 阶段 0 输出 | Git 差异/全量扫描/会话变更/自动检测，应用排除规则 | 文件列表已确定，排除规则已应用，用户已确认范围 |
| 2 | 意图发现与计划发现 | 对话上下文 | 编写意图摘要，查找计划文档（`plan:` 参数或 `docs/ae/plans/`） | 意图摘要已编写，计划发现已完成 |
| 3 | 文件路由与审查者选择 | 文件列表 + 意图摘要 | 按文件类型路由，确定基础/条件/领域审查者，分离代码与文档文件 | 审查团队已确定并公布，代码/文档文件列表已分离 |
| 4a | 生成代码审查子代理 | 审查团队 + 文件内容 | 并行调度代码审查子代理 | 所有代码审查子代理已返回（或超时） |
| 4b | 委派文档审查 | 文档文件列表 | 调用 `ae:document-review`（headless 模式），合并结果 | 所有文档审查结果已合并 |
| 5-7 | 综合、展示和审查后 | 所有子代理结果 | 验证/置信度门控/去重/解决分歧/排序/展示/修复 | 审查报告已输出 |

**阶段 0 参数标记完整列表：**

| 标记 | 作用 | 冲突规则 |
|------|------|---------|
| `mode:interactive` | 交互模式（默认） | — |
| `mode:autofix` | 自动修复模式 | — |
| `mode:report-only` | 只读模式 | — |
| `mode:headless` | 无头模式 | — |
| `from:<ref>` | Git 差异起始引用 | 与 `full`、`session` 互斥 |
| `recent:<n>` | 最近 n 次提交的差异 | 与 `full`、`session` 互斥 |
| `full` | 全量扫描整个仓库 | 与 `from`、`recent`、`session` 互斥 |
| `full:<path>` | 全量扫描指定路径 | 与 `from`、`recent`、`session` 互斥 |
| `session` | 会话变更模式 | 与 `from`、`recent`、`full` 互斥 |
| `plan:<path>` | 指定计划文档路径 | — |

**冲突检测规则：**
- 互斥标记同时出现 → 报错并列出冲突，要求用户选择
- 未知标记 → 忽略并警告（不阻断）
- 无范围标记 → 自动检测模式（优先级见 §6.4）

**非 Git 仓库降级：** 当项目不是 Git 仓库时，`from`、`recent`、`session` 模式不可用，自动降级为 `full` 全量扫描模式并告知用户。

### 6.2 ae:document-review 阶段流程

| 阶段 | 名称 | 输入 | 核心动作 | 退出条件 |
|------|------|------|---------|---------|
| 0 | 检测模式 | `$ARGUMENTS` | 检测 `mode:headless`，提取文档路径 | 模式已确定，文档路径已提取 |
| 1 | 获取并分析文档 | 文档路径 | 读取文档，分类类型，激活条件角色 | 文档已读取，类型已分类，条件角色已激活 |
| 2 | 公告并调度角色 | 审查团队 + 文档内容 | 公告团队，并行调度所有审查子代理 | 所有审查子代理已返回（或超时） |
| 3-5 | 综合、展示和下一步操作 | 所有子代理结果 | 验证/门控/去重/提升/解决矛盾/路由/展示/修复 | 审查报告已输出 |

**无文档路径时的处理：**
- 未指定文档路径（交互模式） → 搜索 `docs/ae/brainstorms/` 和 `docs/ae/plans/` 目录下的最新文档
- 搜索到多个文档 → 列出候选文档供用户选择（交互模式）或选择最新文档（无头模式）
- 搜索无结果 → 报告"未找到可审查的文档"，终止审查
- 未指定文档路径（无头模式） → 输出错误信息，不调度代理，立即终止

### 6.3 两个技能的委派关系

```
ae:review（阶段 3）
│
├─ 代码文件 ──→ 阶段 4a：直接调度代码审查子代理
│
└─ 文档文件 ──→ 阶段 4b：调用 ae:document-review（headless 模式）
                    │
                    ├─ ae:document-review 独立完成审查
                    ├─ 返回结构化发现
                    └─ ae:review 将文档发现合并到统一报告
                        ├─ 文档类发现的 file 设为文档路径
                        ├─ 文档类发现的 line 设为 null
                        ├─ 文档类发现的 section 保留原始章节信息
                         └─ autofix_class 和 severity 保留原文档审查判断
```

### 6.4 ae:review 范围检测优先级链

当 `ae:review` 未指定范围参数时，按以下优先级自动检测：

| 优先级 | 检测方式 | 条件 | 行为 |
|--------|---------|------|------|
| 1 | 状态文件 | `.opencode/review-state.json` 存在且分支匹配 | 根据 `lastReviewed` 确定差异范围（HEAD == lastReviewed 且无变更 → 审查最近 10 次提交；HEAD == lastReviewed 但有工作区变更 → 仅审查工作区变更；HEAD ≠ lastReviewed → `git diff lastReviewed..HEAD` + 工作区变更） |
| 2 | 项目配置 | 状态文件不存在或分支不匹配，且 `review.defaultBase` 存在 | 用 `review.defaultBase` 做 merge-base |
| 3 | resolve-base.sh | 状态文件不存在，无项目配置 | 运行 `references/resolve-base.sh` 自动检测基准 |
| 4 | 友好降级 | 以上均失败 | 提供选项：审查最近 N 次提交 / 仅审查工作区 / 手动指定 / 查看提交历史 |
| 5 | 全量扫描 | 非 Git 仓库 | 扫描整个项目目录（排除规则仍然适用） |

**状态文件分支不匹配处理：** 当状态文件中的 `branch` 与当前分支不一致时，视为首次运行，不使用 `lastReviewed` 作为差异基准。这是预期行为而非错误——分支切换后上次的审查基准不再适用。

### 6.5 ae:review 子代理输出合约规则

代码审查子代理必须遵守以下输出合约规则（定义在 `<output-contract>` 块中）：

| # | 规则 | 说明 |
|---|------|------|
| 1 | 每个 finding 必须有 `file` 和 `line` | 不允许无定位的泛泛发现 |
| 2 | `file` 必须在变更文件列表中 | 超出范围的发现应抑制 |
| 3 | `confidence` 范围 0.00–1.00 | 超范围值视为无效，校验时丢弃 |
| 4 | `severity` 必须为 P0/P1/P2/P3 | 其他值校验时丢弃 |
| 5 | `autofix_class` 必须为四级之一 | `safe_auto`/`gated_auto`/`manual`/`advisory` |
| 6 | Diff 模式下 `pre_existing` 必须正确标记 | 与变更无关的发现标记 `true` |
| 7 | `suggested_fix` 仅在 `safe_auto`/`gated_auto` 时有意义 | `manual`/`advisory` 可选提供 |
| 8 | 证据必须来自实际代码 | 无代码证据的泛泛建议应抑制 |

**假阳性抑制分类（代码审查）：**

| 类别 | 说明 | 处理 |
|------|------|------|
| 无代码证据 | 发现未引用实际代码行 | 抑制 |
| 泛泛风格偏好 | "建议使用函数式风格"等无具体问题 | 抑制 |
| 与意图无关 | 发现与意图摘要描述的变更目的无关 | 标记 `pre_existing: true` |
| 超出范围 | `file` 不在变更文件列表中 | 抑制 |
| 低置信度 + 非可操作 | confidence < 0.60 且非 P0 | 抑制 |

### 6.6 ae:document-review 子代理输出合约规则

文档审查子代理必须遵守以下输出合约规则（定义在 `<output-contract>` 块中）：

| # | 规则 | 说明 |
|---|------|------|
| 1 | 每个 finding 必须有 `section` | 不允许无章节定位的泛泛发现 |
| 2 | `finding_type` 必须为 `error` 或 `omission` | 描述文档中的错误或遗漏 |
| 3 | `confidence` 范围 0.00–1.00 | 超范围值视为无效，校验时丢弃 |
| 4 | `severity` 必须为 P0/P1/P2/P3 | 其他值校验时丢弃 |
| 5 | `autofix_class` 必须为 `auto` 或 `present` | 其他值校验时丢弃 |
| 6 | 证据必须来自文档 | 每个发现至少一条文档中的直接引用 |
| 7 | `auto` 类必须有 `suggested_fix` | 无 `suggested_fix` 的 `auto` 发现降级为 `present` |
| 8 | `present` 类仅在有明显修复方案时包含 `suggested_fix` | 不要求必须提供，修复方案明显时可附 |
| 9 | `deferred_questions` 仅用于非阻断问题 | 不影响当前审查但应在后续关注的问题 |

### 6.7 错误处理规则

**ae:review 错误处理：**

| 场景 | 处理方式 |
|------|---------|
| Git 命令失败 | 降级为全量扫描模式，告知用户 |
| 子代理返回无效 JSON | 校验步骤丢弃无效条目，记录异常代理名称 |
| 子代理超时 | 跳过该代理，在报告中标注"未返回" |
| 排除规则误判 | 始终排除项不可覆盖；默认排除项在用户明确指定时纳入 |
| 范围为空（无文件可审查） | 报告"未找到可审查的文件"，终止审查 |

**ae:document-review 错误处理：**

| 场景 | 处理方式 |
|------|---------|
| 文档路径不存在 | 报告"文档路径不存在"，提示正确路径 |
| 文档内容为空 | 报告"文档内容为空"，终止审查 |
| 子代理返回无效 JSON | 校验步骤丢弃无效条目，记录异常代理名称 |
| 子代理超时 | 跳过该代理，在报告中标注"未返回" |
| 未找到文档（自动搜索时） | 报告"未找到可审查的文档"，终止审查 |

### 6.8 参考文件列表

**ae:review 参考文件（位于 `src/assets/skills/ae-review/references/`）：**

| 文件 | 用途 |
|------|------|
| `findings-schema.json` | 代码审查 findings schema 定义 |
| `file-routing-table.md` | 8 种文件路由定义及匹配模式 |
| `persona-catalog.md` | 审查者人设、选择条件、深度审计代理说明 |
| `scope-detection.md` | 范围检测优先级链、状态文件格式、分支不匹配处理 |
| `subagent-template.md` | 子代理模板结构、变量、输出合约、diff 范围分类、假阳性抑制 |
| `synthesis-and-presentation.md` | 10 步综合流水线、阶段 6 展示规则、禁止事项、审查后步骤 |
| `review-output-template.md` | 审查输出格式——区块结构、列格式、无头模式摘要 |

**ae:document-review 参考文件（位于 `src/assets/skills/ae-document-review/references/`）：**

| 文件 | 用途 |
|------|------|
| `findings-schema.json` | 文档审查 findings schema 定义 |
| `subagent-template.md` | 子代理模板结构、变量、输出合约 |
| `synthesis-and-presentation.md` | 8 步综合流水线、阶段 4-5 应用/展示、禁止事项、迭代优化 |
| `review-output-template.md` | 审查输出格式——区块结构、列格式、section 格式规则 |

## 7. Findings Schema 对比

两个技能使用不同的 findings schema，反映了代码审查与文档审查的关注点差异。

### 7.1 字段级对比

| 维度 | ae:review（代码 schema） | ae:document-review（文档 schema） |
|------|------------------------|-------------------------------|
| 定位方式 | `file` + `line`（行号定位） | `section`（章节定位） |
| 严重级别 | P0/P1/P2/P3 | P0/P1/P2/P3 |
| 自动修复分类 | `safe_auto` / `gated_auto` / `manual` / `advisory` | `auto` / `present` |
| 发现类型 | 无此字段 | `error`（文档错误）/ `omission`（文档遗漏） |
| 置信度阈值 | <0.60 抑制（P0 例外：0.50+ 保留），0.60-0.69 仅明确可操作时包含，0.70-0.84 完整报告，≥0.85 仅验证 | <0.50 抑制，存为 residual_risks |
| 预存标记 | `pre_existing: true`（与当前 diff 无关） | 无此字段 |
| 延迟问题 | 无此字段 | `deferred_questions`（应在后续工作流阶段解决） |
| 必填字段 | `title`, `severity`, `file`, `line`, `why_it_matters`, `autofix_class`, `owner`, `requires_verification`, `confidence`, `evidence`, `pre_existing` | `title`, `severity`, `section`, `why_it_matters`, `finding_type`, `autofix_class`, `confidence`, `evidence` |
| 可选字段 | `suggested_fix` | `suggested_fix`, `deferred_questions` |
| 置信度范围 | 0.00–1.00（浮点数） | 0.00–1.00（浮点数） |
| `owner` 字段 | 必填，值为后续行动角色（`review-fixer`/`downstream-resolver`/`human`/`release`） | 无此字段 |
| `requires_verification` | 必填，布尔值，标记修复是否需人工验证 | 无此字段 |

### 7.2 代码审查 schema _meta 阈值

代码审查 findings schema 的 `_meta` 部分定义了综合阶段使用的阈值描述：

| 阈值 | 描述 | 用途 |
|------|------|------|
| `confidence_thresholds.suppress` | 低于 0.60——不报告。例外：0.50+ 的 P0 | 抑制低置信度发现 |
| `confidence_thresholds.flag` | 0.60-0.69——仅在明确可操作时包含 | 边际置信度处理 |
| `confidence_thresholds.confident` | 0.70-0.84——附完整证据报告 | 正常报告 |
| `confidence_thresholds.certain` | 0.85-1.00——仅从代码验证 | 高置信度处理 |
| `dedup.fingerprint` | `normalize(file) + normalize(title)` | 去重指纹计算方式（定义在综合流水线 5.3） |
| `consensus.boost` | 0.10 | 跨审查者共识提升值（定义在综合流水线 5.4） |
| `consensus.min_reviewers` | 2 | 触发共识提升的最少审查者数（定义在综合流水线 5.4） |

## 8. 条件激活对照表

### 8.1 ae:review 条件代理激活映射

代码来源：`src/services/review-selector.ts` → `selectCodeReviewers()`

| 输入参数 | 激活的代理 |
|---------|-----------|
| `hasSecurity` | `security-reviewer` |
| `hasPerformance` | `performance-reviewer` |
| `hasApi` | `api-contract-reviewer` |
| `hasReliability` | `reliability-reviewer` |
| `hasCli` | `cli-agent-readiness-reviewer` |
| `hasPrMetadata` | `previous-comments-reviewer` |
| `hasTypescript` | `kieran-typescript-reviewer` |
| `changedLineCount >= 50` 或 `hasSecurity` 或 `hasApi` | `adversarial-reviewer` |
| `hasMigrations` | `data-migrations-reviewer` |

领域代理由文件路由激活（SKILL.md 阶段 3 步骤 5），不由 `selectCodeReviewers()` 控制：

| 文件路由匹配 | 激活的领域代理 |
|------------|-------------|
| `.json` `.yaml` `.yml` `.toml` `.xml` | `config-reviewer` |
| `Dockerfile` `docker-compose.*` `*.tf` `.github/workflows/*` `Makefile` | `infra-reviewer` |
| `*.sql` `.prisma` 迁移文件 | `database-reviewer` |
| `.sh` `.bash` `.ps1` `.bat` `.cmd` | `script-reviewer` |

### 8.2 ae:document-review 条件代理激活映射

代码来源：`src/services/review-selector.ts` → `selectDocumentReviewers()`

| 输入参数 | 激活的代理 |
|---------|-----------|
| `documentType === 'test'` | `test-case-reviewer` |
| `documentType === 'plan'` | `product-lens-reviewer`, `step-granularity-reviewer`, `batch-operation-reviewer` |
| `requirementCount >= 5` | `adversarial-document-reviewer`, `product-lens-reviewer`, `scope-guardian-reviewer` |
| `hasArchitectureDecision` | `adversarial-document-reviewer` |
| `isHighRiskDomain` | `adversarial-document-reviewer` |
| `hasNewAbstraction` | `adversarial-document-reviewer` |
| `hasUi` | `design-lens-reviewer` |
| `hasSecurity` | `security-lens-reviewer` |

## 9. 代理目录与文件对应

### 9.1 src/assets/agents/ 目录结构

| 目录 | 代理数 | 归属技能 | 代理列表 |
|------|--------|---------|---------|
| `document-review/` | 10 | `ae:document-review` | coherence-reviewer, feasibility-reviewer, product-lens-reviewer, scope-guardian-reviewer, adversarial-document-reviewer, design-lens-reviewer, security-lens-reviewer, step-granularity-reviewer, batch-operation-reviewer, test-case-reviewer |
| `review/` | 20 | `ae:review`（18）+ 独立使用（2） | ae:review 使用：correctness-reviewer, testing-reviewer, maintainability-reviewer, project-standards-reviewer, agent-native-reviewer, security-reviewer, performance-reviewer, api-contract-reviewer, reliability-reviewer, cli-agent-readiness-reviewer, previous-comments-reviewer, kieran-typescript-reviewer, adversarial-reviewer, data-migrations-reviewer, config-reviewer, infra-reviewer, database-reviewer, script-reviewer；独立使用：architecture-strategist, pattern-recognition-specialist |
| `research/` | 5 | `ae:review`（1）+ 独立使用（4） | ae:review 使用：learnings-researcher；独立使用：repo-research-analyst, best-practices-researcher, web-researcher, framework-docs-researcher |
| `workflow/` | 3 | 独立使用 | spec-flow-analyzer, design-iterator, figma-design-sync |

注意：`learnings-researcher.md` 物理文件位于 `research/` 目录，但在 `CODE_REVIEWERS` 中作为 `ae:review` 的常驻代理列出。它兼具双重角色：在 `ae:review` 中是常驻代码审查代理（搜索历史经验），在其他场景中是独立使用的研究代理。

## 10. 子代理模板变量

### 10.1 ae:review 子代理模板

代码审查子代理模板结构：开场 → `<persona>` 块 → `<output-contract>` 块（规则 + schema 内联）→ `<review-context>` 块。

**模板变量：**

| 变量 | 值来源 |
|------|--------|
| `{persona_file}` | 代理 markdown 文件完整内容 |
| `{schema}` | findings-schema.json 内容 |
| `{intent_summary}` | 阶段 2 输出的意图摘要 |
| `{file_list}` | 变更文件列表 |
| `{content}` | diff 内容 / 完整文件内容 / 会话变更内容 |
| `{content_mode_label}` | 增量审查时为 `Diff:`，全量审查时为 `Full content:`，会话变更模式时为 `Session changes:` |
| `{run_id}` | 运行标识符 |
| `{reviewer_name}` | 审查者名称 |

**两层返回机制：**

| 层级 | 内容 | 去向 |
|------|------|------|
| 产物层（detail_tier） | 完整 JSON（含 `why_it_matters`、`evidence`） | 写入 `docs/ae/review/{run_id}/{reviewer_name}.json` |
| 返回层（merge_tier） | 精简 JSON（仅含 `title`、`severity`、`file`、`line`、`confidence`、`autofix_class`、`owner`、`requires_verification`、`pre_existing`、`suggested_fix`） | 返回给编排器合并 |

**三种输入模式对应的内容范围分类：**

| 内容模式 | `{content_mode_label}` | 范围分类规则 |
|---------|----------------------|------------|
| Diff 模式 | `Diff:` | major（新增/修改行，完全置信度）、minor（相邻未变更代码，仅在上下文可见 bug 时报告）、pre-existing（与变更无关，标记 `pre_existing: true`） |
| 全量文件模式 | `Full content:` | 无范围分类，`pre_existing` 始终为 `false` |
| 会话变更模式 | `Session changes:` | 有 diff 信息时按 Diff 模式规则，否则按全量文件模式规则 |

### 10.2 ae:document-review 子代理模板

文档审查子代理模板结构：开场 → `<persona>` 块 → `<output-contract>` 块（规则 + schema 内联）→ `<review-context>` 块。

**模板变量：**

| 变量 | 值来源 |
|------|--------|
| `{persona_file}` | 代理 markdown 文件完整内容 |
| `{schema}` | findings-schema.json 内容 |
| `{document_type}` | `"requirements"` / `"plan"` / `"test"` / `"general"` |
| `{document_path}` | 文档路径 |
| `{document_content}` | 文档完整文本 |

**单层返回：** 仅返回完整 JSON（无两层分离，无产物文件写入）。

**与代码审查模板的差异：**
- 无 `{intent_summary}`、`{file_list}`、`{content_mode_label}`、`{run_id}`、`{reviewer_name}` 变量
- 无 diff 范围分类（始终传递完整文档）
- 无产物文件写入机制

## 11. 综合流水线

### 11.1 ae:review 综合流水线（阶段 5）

| 步骤 | 名称 | 规则 |
|------|------|------|
| 5.1 | 校验 | 检查 JSON 是否符合 schema，丢弃缺必填字段的条目，记录异常代理 |
| 5.2 | 置信度门控 | <0.60 抑制（P0 在 0.50+ 时保留） |
| 5.3 | 去重 | 指纹 = `normalize(file) + normalize(title)`。相反建议 → 保留两者；否则合并：取最高 severity + confidence，合并 evidence，记录同意审查者，归属最高置信度审查者 |
| 5.4 | 跨审查者共识 | 2+ 审查者标记同一问题 → confidence +0.10 |
| 5.5 | 分离预存 | `pre_existing: true` 的发现从结论中排除，单独展示 |
| 5.6 | 解决分歧 | 创建**合并发现**展示两种观点，采用最保守路由 |
| 5.7 | 合并文档审查发现 | 来自阶段 4b。文档发现使用 section/finding_type/auto/present schema；代码发现使用 file/line/safe_auto/gated_auto/manual/advisory schema。severity 和 confidence 可直接比较。文档发现**不参与**代码 autofix_class 路由 |
| 5.8 | 规范化路由 | 分歧时选择更保守的路由（仅代码审查发现） |
| 5.9 | 划分工作 | 见下表 |
| 5.10 | 排序 | severity → confidence → file path → line number |

**工作划分（代码审查发现）：**

| 队列 | 包含 | 动作 |
|------|------|------|
| 修复队列 | `safe_auto` | 自动应用 |
| 剩余可操作 | `gated_auto`、`manual` | 需审批/设计决策 |
| 只读 | `advisory` | 仅展示 |

**降级规则：** `safe_auto` 无 `suggested_fix` → 降级为 `gated_auto`

**受保护产物：** 丢弃建议删除以下路径的发现：`docs/ae/brainstorms/`、`docs/ae/plans/`、`docs/ae/solutions/`、`.opencode/`

### 11.2 ae:document-review 综合流水线（阶段 3）

| 步骤 | 名称 | 规则 |
|------|------|------|
| 3.1 | 校验 | 检查 JSON 是否符合 schema，丢弃缺必填字段的条目，记录异常代理 |
| 3.2 | 置信度门控 | <0.50 抑制，存为 residual_risks |
| 3.3 | 去重 | 指纹 = `normalize(section) + normalize(title)`。相反建议 → 保留两者；否则合并：取最高 severity + confidence，合并 evidence，记录同意审查者，归属最高置信度审查者 |
| 3.4 | 残余风险提升 | 跨审查者印证（审查者 A 的残余风险与审查者 B 的发现重叠）→ 提升为 P2；具体阻塞风险（会阻塞实现）→ 提升为 P2 |
| 3.5 | 解决矛盾 | 创建**合并发现**展示两种观点，设置 `autofix_class: present`、`finding_type: error` |
| 3.6 | 模式解析提升 | `present` → `auto` 提升条件（**三者必须全部满足**）：(1) 引用了代码库中已有的具体模式，(2) 包含遵循该模式的 `suggested_fix`，(3) 不存在真正的权衡取舍 |
| 3.7 | 按 autofix_class 路由 | `auto` → 自动应用；`present` → 单独展示供用户判断 |
| 3.8 | 排序 | P0 → P1 → P2 → P3，errors 优先于 omissions，confidence 降序，文档顺序 |

**降级规则：** `auto` 无 `suggested_fix` → 降级为 `present`

**受保护产物：** 丢弃建议删除以下路径的发现：`docs/ae/brainstorms/`、`docs/ae/plans/`、`docs/ae/solutions/`、`.opencode/`

### 11.3 综合流水线对比

| 维度 | ae:review | ae:document-review |
|------|-----------|-------------------|
| 置信度抑制阈值 | 0.60（P0 例外：0.50+） | 0.50 |
| 跨审查者共识 | 2+ 审查者标记 → +0.10 | 残余风险与发现重叠 → P2 提升 |
| 模式解析提升 | 无 | `present` → `auto`（三条件全满足时） |
| 预存发现分离 | 有（`pre_existing: true` 单独展示） | 无（无 `pre_existing` 字段） |
| 文档发现合并 | 独立步骤 5.7（文档发现不参与代码 autofix_class 路由） | 不适用（此技能仅审查文档） |

## 11b. 审查输出格式

### 11b.1 ae:review 审查输出格式

代码审查报告由以下区块按顺序组成：

| 区块 | 内容 | 条件 |
|------|------|------|
| 1. 头部 | 运行 ID、审查模式、范围摘要 | 始终输出 |
| 2. 修复队列 | `safe_auto` 类发现 | 有修复队列发现时输出 |
| 3. 可操作发现 | `gated_auto` + `manual` 类发现 | 有可操作发现时输出 |
| 4. 只读建议 | `advisory` 类发现 | 有只读发现时输出 |
| 5. 预存问题 | `pre_existing: true` 的发现 | 有预存发现时输出 |
| 6. 文档审查发现 | 来自 ae:document-review 的发现 | 有文档文件时输出 |
| 7. 摘要统计 | 按严重级别和队列分类的计数 | 始终输出 |

**发现行格式（交互/只读/自动修复模式）：**

| 列 | 内容 |
|----|------|
| 1 | 序号 |
| 2 | 文件路径:行号 |
| 3 | 发现标题 |
| 4 | 标记该发现的审查者人设 |
| 5 | 置信度 |
| 6 | 路由（`autofix_class -> owner` 格式） |

**无头模式格式：** 不使用表格。发现使用 `[severity][autofix_class -> owner] File: <file:line> -- <title>` 格式，带 Why/Evidence 行。按 autofix_class 分组。结论在头部。

### 11b.2 ae:document-review 审查输出格式

文档审查报告由以下区块按顺序组成：

| 区块 | 内容 | 条件 |
|------|------|------|
| 1. 头部 | 文档路径、文档类型、审查团队 | 始终输出 |
| 2. 自动修复发现 | `auto` 类发现 | 有自动修复发现时输出 |
| 3. 需判断发现 | `present` 类发现 | 有需判断发现时输出 |
| 4. 残余风险 | 被抑制的低置信度发现 | 有残余风险时输出 |
| 5. 延迟问题 | `deferred_questions` | 有延迟问题时输出 |
| 6. 摘要统计 | 按严重级别和 `finding_type` 分类的计数 | 始终输出 |

**发现行格式：**

| 列 | 内容 |
|----|------|
| 1 | 序号 |
| 2 | section（章节标题） |
| 3 | 发现标题 |
| 4 | 标记该发现的审查者角色 |
| 5 | 置信度 |

**无头模式格式：** 结构化文本摘要：已应用自动修复列表、需判断发现（按 `[P0-P3] section — title` 格式）、残余风险、延迟问题。

## 12. 审查后步骤

### 12.1 ae:review 审查后（阶段 7）

| 步骤 | 动作 |
|------|------|
| 应用修复 | 单个修复器执行，`max_rounds: 2` |
| 写入运行产物 | `docs/ae/review/<run-id>/` 目录，含 metadata.json |
| 最终下一步操作 | PR 模式 → push/退出；分支模式 → 创建 PR（推荐）/继续/退出；默认分支 → 继续/退出 |
| 更新状态文件 | `.opencode/review-state.json`（写入当前 HEAD 到 `lastReviewed`） |

**审查状态文件格式：**

```json
{
  "branch": "<分支名>",
  "lastReviewed": "<commit hash>",
  "lastReviewTime": "<ISO-8601 时间戳>"
}
```

分支不匹配时视为首次运行（不使用 `lastReviewed` 作为差异基准，按新仓库处理）。

### 12.2 ae:document-review 审查后（阶段 5）

| 步骤 | 动作 |
|------|------|
| 应用修复 | `auto` 类发现**单次操作**应用（无需审批） |
| 下一步操作（无头模式） | 立即返回"审查完成"，无后续问题 |
| 下一步操作（交互模式） | 两个选项：(1) "再次优化"（处理发现后重新审查），(2) "审查完成"（继续）。**最多 2 次迭代优化**后推荐完成。重复发现跨迭代时推荐完成 |

## 12b. 展示与禁止规则

### 12b.1 ae:review 阶段 6 展示规则

| 规则 | 说明 |
|------|------|
| 按队列分组展示 | 修复队列 → 可操作发现 → 只读建议 → 预存问题 → 文档审查发现 |
| 严重级别排序 | 每个队列内部按 P0 → P1 → P2 → P3 排序 |
| 置信度排序 | 同一严重级别内按 confidence 降序 |
| 文件路径排序 | 同一置信度内按文件路径字母序，再按行号 |
| 修复队列优先 | `safe_auto` 发现始终最先展示，因为可立即应用 |
| 交互模式下询问 | 展示后询问用户：(1) 应用修复，(2) 查看详情，(3) 跳过 |
| 只读/自动修复模式下不询问 | 直接应用 `safe_auto` 修复，展示其余发现 |
| 受保护产物 | 丢弃建议删除 `docs/ae/brainstorms/`、`docs/ae/plans/`、`docs/ae/solutions/`、`.opencode/` 的发现 |

### 12b.2 ae:document-review 阶段 4 应用与展示

| 步骤 | 动作 | 说明 |
|------|------|------|
| 4.1 | 应用 `auto` 修复 | 单次操作应用所有 `auto` 类发现，无需用户确认 |
| 4.2 | 展示 `present` 发现 | 列出需用户判断的发现，每个发现附带修复方向 |
| 4.3 | 展示残余风险和延迟问题 | 信息性展示，无需操作 |

**交互模式下的迭代优化：**

| 规则 | 说明 |
|------|------|
| 最大迭代次数 | 2 次（首次审查 + 最多 2 次优化 = 3 轮） |
| 触发优化 | 用户选择"再次优化"时，处理发现后重新审查 |
| 推荐完成 | 超过 2 次迭代，或跨迭代出现重复发现时，推荐完成 |
| 终止条件 | 用户选择"审查完成"时终止 |

### 12b.3 禁止事项

**ae:review 禁止事项：**

| # | 禁止行为 | 原因 |
|---|---------|------|
| 1 | 子代理编辑项目文件 | 审查是只读操作，修复由编排器统一应用 |
| 2 | 跳过范围确认直接审查 | 核心原则：范围先行，审查在后 |
| 3 | 审查 `.env`/`.env.*` 文件 | 敏感文件始终排除 |
| 4 | 审查 `.opencode/` 目录 | 运行时目录始终排除 |
| 5 | 直接审查文档文件（不委派） | 文档文件必须委派给 `ae:document-review` |
| 6 | 自动应用非 `safe_auto` 修复 | `gated_auto`/`manual` 需用户确认 |
| 7 | 删除受保护产物 | `docs/ae/brainstorms/`、`docs/ae/plans/`、`docs/ae/solutions/` 受保护 |

**ae:document-review 禁止事项：**

| # | 禁止行为 | 原因 |
|---|---------|------|
| 1 | 子代理编辑文档 | 审查是只读操作，修复由编排器统一应用 |
| 2 | 审查代码文件 | 代码审查由 `ae:review` 负责 |
| 3 | 审查 `.opencode/` 目录 | 运行时目录始终排除 |
| 4 | 自动应用 `present` 修复 | `present` 需用户判断，不可自动应用 |
| 5 | 删除受保护产物 | `docs/ae/brainstorms/`、`docs/ae/plans/`、`docs/ae/solutions/` 受保护 |
| 6 | 超过 2 次迭代优化 | 防止无限循环 |

## 13. 深度审计代理

除常规常驻/条件/领域代理外，`ae:review` 还有一个深度审计代理，不由 `selectCodeReviewers()` 也不由文件路由直接激活：

| 代理 | 激活条件 | 说明 |
|------|---------|------|
| `cli-agent-readiness-reviewer` | 当 `cli-readiness` 人设（`hasCli === true`）已发现**系统性问题**时按需派发 | 比 `hasCli === true` 更深层的激活：先由常规 `cli-readiness` 审查，如发现系统性问题则追加此代理进行深度审计 |
