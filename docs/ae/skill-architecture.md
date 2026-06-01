# AE 技能架构全景

## 一、总体架构

AE（AI Agent Engine）是一个 opencode 插件，通过 OpenCode Plugin API 注册技能、命令、代理、工具和规则注入，为 LLM 会话提供结构化的工程工作流。

```
┌─────────────────────────────────────────────────────────────────────┐
│                         OpenCode Runtime                            │
│                                                                     │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────────┐   │
│  │  Commands  │  │  Skills   │  │  Agents   │  │  Instructions │   │
│  │  (用户入口) │  │ (SKILL.md)│  │ (子代理)  │  │  (规则注入)   │   │
│  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘  └──────┬────────┘   │
│        │              │              │                │             │
│        └──────────────┴──────┬───────┴────────────────┘             │
│                              │                                      │
│                     ┌───────▼───────┐                               │
│                     │  Plugin API   │                               │
│                     │  config()     │                               │
│                     │  tool()       │                               │
│                     │  hook()       │                               │
│                     └───────┬───────┘                               │
│                             │                                       │
└─────────────────────────────┼───────────────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────────────┐
│                     AE Plugin (src/index.ts)                         │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    注册流水线 (config 钩子)                    │   │
│  │                                                              │   │
│  │  1. registerSkillsPath()     → 注入技能目录到 config.skills  │   │
│  │  2. mergeCommandConfigWithRouting()                          │   │
│  │     ├─ buildCommandConfig()  → 从 catalog + 磁盘构建命令    │   │
│  │     ├─ mergeDynamicCommands()→ 合并动态/静态命令            │   │
│  │     └─ mergeProjectCommandOverrides() → 项目/全局覆盖       │   │
│  │  3. registerAgents()         → 注册内置+项目+全局代理       │   │
│  │  4. registerMcp()            → 注册 MCP 服务器              │   │
│  │  5. registerRulesInstructions() → 注入规则 glob 路径        │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌────────────────────┐  ┌─────────────────────────────────────┐   │
│  │  Tool Registry     │  │  Hooks                              │   │
│  │  (16 个工具)       │  │  system.transform → 规则注入        │   │
│  │                    │  │  command.execute.before → 参数去重  │   │
│  └────────────────────┘  └─────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

## 二、分层架构

AE 严格遵循四层架构，依赖方向为 `tools/ → services/ → schemas/ → utils/`。

```
┌────────────────────────────────────────────────────────────┐
│  tools/                     最接近用户的工具边界           │
│  ├─ 参数 Schema (Zod)                                    │
│  ├─ 调用 services 层业务逻辑                             │
│  └─ 捕获错误，返回可恢复中文提示                         │
├────────────────────────────────────────────────────────────┤
│  services/                  业务逻辑与运行时注册           │
│  ├─ ae-catalog.ts          技能/命令/代理目录真源         │
│  ├─ command-registration.ts 命令构建与模型路由            │
│  ├─ agent-registration.ts  代理构建与注册                 │
│  ├─ recovery-service.ts    阶段恢复与产物校验             │
│  ├─ review-catalog.ts      审查者激活矩阵                │
│  ├─ review-selector.ts     条件式审查者选择               │
│  ├─ domain-catalog-service.ts  域代理与专精目录          │
│  ├─ domain-dispatch-service.ts 域调度与结果聚合           │
│  ├─ graph-*.ts             图谱构建/查询/新鲜度           │
│  ├─ swagger-*.ts           OpenAPI 解析管线               │
│  └─ ...其他服务                                           │
├────────────────────────────────────────────────────────────┤
│  schemas/                   集中管理 Zod Schema 与常量     │
│  ├─ ae-asset-schema.ts     SKILL/COMMAND/AGENT/TOOL 常量  │
│  ├─ artifact-schema.ts     产物类型与 frontmatter 校验    │
│  ├─ recovery-schema.ts     恢复结果 Schema                │
│  ├─ model-scenario-schema.ts 模型场景枚举                 │
│  └─ orchestration-protocol.ts 编排协议类型                │
├────────────────────────────────────────────────────────────┤
│  utils/                     无业务状态的通用工具           │
│  ├─ frontmatter.ts         YAML frontmatter 解析          │
│  ├─ path-utils.ts          路径处理                       │
│  └─ ...其他工具                                           │
└────────────────────────────────────────────────────────────┘
```

## 三、技能实现原理

### 3.1 双层实现模型

AE 技能采用 **SKILL.md 提示词 + TypeScript 服务代码** 双层模型：

```
┌───────────────────────────────────────────────────────┐
│                   用户触发命令                          │
│                   (如 /ae-lfg)                        │
└───────────────────────┬───────────────────────────────┘
                        │
                        ▼
┌───────────────────────────────────────────────────────┐
│  OpenCode 命令系统                                    │
│  - command.template 定义命令模板                      │
│  - $ARGUMENTS 占位符传入用户参数                      │
│  - LLM 解读模板文本，决定执行流程                     │
└───────────────────────┬───────────────────────────────┘
                        │
            ┌───────────┴───────────┐
            │                       │
            ▼                       ▼
┌──────────────────┐    ┌──────────────────────┐
│  SKILL.md 提示词  │    │  Tool 调用           │
│  (LLM 可读指令)  │    │  (程序化能力)        │
│                  │    │                      │
│  - 角色与目标    │    │  ae-recovery         │
│  - 执行流程      │    │  ae-review-contract  │
│  - 门禁规则      │    │  ae-task-analyzer    │
│  - 交付标准      │    │  ae-graph-build      │
│  - 边界约束      │    │  ae-graph-query      │
│                  │    │  ae-doc-extract      │
│  references/     │    │  ae-handoff          │
│  - 子流程文档    │    │  ae-create-session   │
│                  │    │  ae-prompt-optimize  │
│  scripts/        │    │  ae-review-proof     │
│  - 辅助脚本      │    │  ae-chrome-devtools-   │
│                  │    │    proof              │
└──────────────────┘    │  ae-swagger-parser   │
                        │  ae-html-bundle      │
                        │  ae-worktree-handoff │
                        │  ae-domain-catalog   │
                        │  ae-help             │
                        └──────────────────────┘
```

**核心原理**：SKILL.md 是 LLM 的行为指南，定义了"做什么"和"怎么做"；Tool 是程序化的确定性能力，处理 LLM 不擅长或需要精确执行的操作（文件解析、条件计算、状态校验等）。两者协同实现结构化工作流。

### 3.2 技能分类与实现模式

#### A. 主流程技能（生命周期编排型）

这些技能构成 AE 的核心工程流程管道，按阶段串联执行：

```
ae:ideate → ae:brainstorm → ae:plan → ae:work → ae:review
    │             │             │          │          │
    │             │             │          │          │
    ▼             ▼             ▼          ▼          ▼
 ae/ideates/  ae/brainstorms/ ae/plans/ ae/ 产出   ae/reviews/
 (候选方向)   (需求文档)     (计划文档)  (代码等)  (审查报告)

注：ae:lfg 是上述核心流程的组合技能，将各阶段串联为一站式执行管道；各阶段技能均可独立通过命令使用。
```

| 技能 | 实现原理 | 产出 | 依赖工具 |
|------|---------|------|---------|
| ae:ideate | SKILL.md 引导 LLM 生成候选方向并批判评估 | 无强制产物 | 无 |
| ae:brainstorm | SKILL.md + references/ 引导需求澄清与文档编写 | `ae/brainstorms/*-requirements.md` | ae-doc-extract (读取上游) |
| ae:plan | SKILL.md + references/ 引导结构化计划分解 | `ae/plans/*-plan.md` | ae-doc-extract, ae-graph-query |
| ae:refactor | 复用 plan 结构 + 独立重构策略 | `ae/plans/*-plan.md` | ae-doc-extract |
| ae:work | 四阶段编排协议 + 域代理委托 | 代码/文档/测试等 | ae-task-analyzer, ae-worktree-handoff, ae-graph-query, ae-doc-extract |
| ae:review | 四阶段编排协议 + 审查域代理 | `ae/reviews/<run-id>/` | ae-review-contract, ae-review-proof, ae-graph-query, ae-doc-extract |
| ae:lfg | **核心流程组合技能**，串联 ae:brainstorm → ae:plan → ae:work → ae:review；各阶段技能也可独立使用 | 依阶段而定 | ae-recovery |

#### B. 浏览器能力技能

```
┌──────────────────────────────────────────────┐
│          chrome-devtools MCP 门禁              │
│                                              │
│  ae:chrome-devtools ──→ ae-chrome-devtools-proof │
│  (环境验证)            (证明写入/检查)        │
│         │                                    │
│         │ 证明就绪后                          │
│         ▼                                    │
│  ae:test-browser     (端到端验收)            │
│  ae:frontend-design  (前端设计+视觉验证)     │
└──────────────────────────────────────────────┘
```

| 技能 | 实现原理 | 关键约束 |
|------|---------|---------|
| ae:chrome-devtools | SKILL.md 引导安装验证和目标选择 | 唯一环境验证入口，MCP 注册校验后才允许浏览器命令 |
| ae:test-browser | SKILL.md + chrome-devtools-mcp 工具交互 | 强制先完成 chrome-devtools MCP 注册 |
| ae:frontend-design | SKILL.md + 设计体系检测 + 视觉验证 | 视觉验证路径依赖 chrome-devtools MCP 注册 |

#### C. 辅助与工具技能

| 技能 | 实现原理 | 核心工具/服务 |
|------|---------|-------------|
| ae:handoff | 提取会话上下文 → 创建新会话 → 注入 | ae-handoff, ae-create-session |
| ae:prompt-optimize | 优化提示词 → 确认 → 新会话执行 | ae-prompt-optimize, ae-create-session |
| ae:task-loop | SKILL.md 循环执行+验证直到目标达成 | 无专用工具（依赖被调度技能的工具） |
| ae:sql | SKILL.md + JDBC 连接 + SQL 执行 | 无内置工具（脚本驱动） |
| ae:swagger-parser | 解析 OpenAPI 规格并输出联调摘要 | ae-swagger-parser (完整解析管线) |
| ae:html-bundle | HTML + 本地资源 → 自包含 bundle.html | ae-html-bundle |
| ae:graph-build | 扫描文件 → 解析依赖 → 构建图谱 JSON | ae-graph-build |
| ae:graph-query | 查询图谱依赖/影响/健康/核心模块 | ae-graph-query |
| ae:save-experience | 保存 solution → 按需提炼 rules | 无内置工具（直接文件操作） |
| ae:skill-creator | 创建/更新 OpenCode 原生技能+命令 | 无内置工具（直接文件操作） |
| ae:skill-from-session | 从会话提取技能 | 无内置工具 |
| ae:agent-creator | 创建/更新 OpenCode 原生代理 | 无内置工具 |
| ae:static-server | 创建 HTTP 静态服务器 | 无内置工具（脚本驱动） |
| ae:help | 列出技能/命令/代理 | ae-help |
| ae:update | 插件源码仓库更新与重建 | 无内置工具（bash 操作） |
| ae:work-report | 基于 Git 生成工作总结 | 无内置工具 |
| ae:merge-branch | 合并分支 + AE 产物验证 | 无内置工具 |
| ae:document-review | ae:review domain:document 的别名 | 同 ae:review |

## 四、命令变体系统

每个技能对应一个基础命令，支持三种变体：

```
基础命令:     /ae-work      → "使用 ae:work 技能处理这次请求，并沿用参数：$ARGUMENTS"
-po 变体:    /ae-work-po   → "先使用 ae:prompt-optimize 技能优化用户输入，再用 ae:work 执行"
-pa 变体:    /ae-work-pa   → "先使用 ae:prompt-optimize 技能以 auto 模式优化，再执行"
-auto 变体:  仅 ae-prompt-optimize-auto → 跳过确认直接提交
```

**变体排除规则**：部分技能（如 ae:handoff、ae:review、ae:sql 等）不生成 -po/-pa 变体，定义在 `PROMPT_OPTIMIZE_VARIANT_EXCLUDED_SKILLS` 中。

## 五、代理体系与域调度

### 5.1 代理分类

```
┌─────────────────────────────────────────────────────────────────┐
│                        代理体系                                  │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  review/  审查专精 (18 个)                              │   │
│  │  ├─ 常驻: correctness, testing, maintainability,        │   │
│  │  │        standards, research (代码域)                   │   │
│  │  ├─ 常驻: coherence, feasibility (文档域)               │   │
│  │  └─ 条件: security, adversarial, performance,           │   │
│  │           api-contract, reliability, data-migrations,   │   │
│  │           agent-native, architecture, pattern,          │   │
│  │           previous-comments, product-lens,              │   │
│  │           step-granularity, design-lens, test-case      │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  research/  研究代理 (3 个)                             │   │
│  │  ├─ repo-research-analyst                               │   │
│  │  ├─ research-reviewer                                   │   │
│  │  └─ web-researcher                                      │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  workflow/  工作流代理 (3 个)                           │   │
│  │  ├─ spec-flow-analyzer                                  │   │
│  │  ├─ design-iterator (gilded)                            │   │
│  │  └─ figma-design-sync (gilded)                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  domain/  域代理 (2 个域 + 6 个专精)                    │   │
│  │  ├─ review-domain        → 审查域编排                   │   │
│  │  └─ development-domain   → 开发域编排                   │   │
│  │      ├─ frontend-dev      (前端专精)                    │   │
│  │      ├─ backend-dev       (后端专精)                    │   │
│  │      ├─ debug-fix         (调试修复专精)                │   │
│  │      └─ refactor-dev      (重构专精)                    │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 域调度机制

```
┌─────────────┐     ┌──────────────────────┐     ┌─────────────────────┐
│  ae:review   │────▶│  @review-domain      │────▶│  审查专精代理 × N   │
│  (编排技能)  │     │  (域代理)            │     │  (并行调度)         │
└─────────────┘     └──────────────────────┘     └─────────────────────┘
                           │
                           │  选择策略
                           ▼
                    ┌──────────────────┐
                    │ review-selector  │
                    │ (条件匹配引擎)   │
                    │                  │
                    │ REVIEW_MATRIX:   │
                    │ - alwaysOn 常驻  │
                    │ - conditionGroups│
                    │   条件激活       │
                    └──────────────────┘

┌─────────────┐     ┌──────────────────────┐     ┌─────────────────────┐
│  ae:work     │────▶│  @development-domain │────▶│  开发专精代理 × N   │
│  (编排技能)  │     │  (域代理)            │     │  (并行/流水线)      │
└─────────────┘     └──────────────────────┘     └─────────────────────┘
                           │
                           │  选择策略
                           ▼
                    ┌──────────────────────┐
                    │ domain-dispatch      │
                    │ (关键词+标记匹配)    │
                    │                      │
                    │ 协调策略:            │
                    │ - review: parallel   │
                    │ - development:       │
                    │   parallel-then-seq  │
                    │                      │
                    │ 聚合策略:            │
                    │ - review: union      │
                    │ - development: merge │
                    └──────────────────────┘
```

### 5.3 审查者选择算法

审查者选择基于 `REVIEW_MATRIX` 条件矩阵：

```typescript
// 常驻审查者：domain 匹配即选中
{ name: 'correctness-reviewer', domain: 'code', alwaysOn: true }

// 条件审查者：满足任一 conditionGroup 即选中
{
  name: 'security-reviewer',
  domain: 'both',
  alwaysOn: false,
  conditionGroups: [
    [{ field: 'hasSecurity', operator: 'truthy' }]
  ]
}

// 多条件组：组间 OR，组内 AND
{
  name: 'adversarial-reviewer',
  conditionGroups: [
    [{ field: 'changedLineCountGte50', operator: 'truthy' }],  // OR
    [{ field: 'hasSecurity', operator: 'truthy' }],             // OR
    [{ field: 'hasApi', operator: 'truthy' }]                   // OR
  ]
}
```

## 六、恢复机制

AE 支持跨会话恢复，基于 `ae/` 目录下的产物文档：

```
┌────────────────────────────────────────────────────────────┐
│                     恢复优先级                              │
│                                                            │
│  brainstorm: 无候选，直接从新需求开始                      │
│  plan:      优先恢复 brainstorm 产物                       │
│  work:      优先恢复 work 产物 → 退回 plan 产物           │
│  review:    优先恢复 review → work → plan 产物            │
│  lfg:       优先恢复 review → work → plan → brainstorm   │
│                                                            │
│  回退策略:                                                 │
│  plan 缺产物 → 回退 brainstorm                            │
│  work/review 缺产物 → 回退 plan                           │
├────────────────────────────────────────────────────────────┤
│  产物校验流程:                                             │
│                                                            │
│  1. listArtifacts() → 扫描 ae/ 子目录                     │
│  2. hasValidMetadata() → 校验 frontmatter.type            │
│  3. 过滤 supersededBy 标记的已废弃产物                    │
│  4. validateOriginFingerprint() → 校验上游产物指纹        │
│  5. 单一候选 → 自动恢复                                   │
│     多个候选 → 需要用户选择                                │
│     无候选   → 回退到上游阶段                              │
└────────────────────────────────────────────────────────────┘
```

## 七、模型路由系统

每个命令和代理在注册时自动解析模型场景：

```
┌────────────────────────────────────────────────────────────┐
│                   模型路由流程                              │
│                                                            │
│  命令/代理 frontmatter                                     │
│       │                                                    │
│       ├── model: "gpt-4"     → 直接使用                   │
│       ├── model: "$deep"     → 按场景解析                  │
│       └── 无 model 字段     → 按 COMMAND_SCENARIOS 解析    │
│                                                            │
│  场景优先级:                                               │
│  1. frontmatter 显式声明 → resolveModelReference()        │
│  2. COMMAND_SCENARIOS 映射 → resolveModelScenario()       │
│  3. 均无匹配 → 继承 opencode 默认模型                     │
│                                                            │
│  场景配置来源 (三层合并):                                  │
│  ├─ src/assets/config/ae.jsonc (内置)                      │
│  ├─ .opencode/ae.jsonc (项目级)                            │
│  └─ ~/.config/opencode/ae.jsonc (全局)                     │
└────────────────────────────────────────────────────────────┘

场景分类:
  quick     → 查询/帮助类 (ae:help, ae:graph-query)
  standard  → 创建/交互类 (ae:brainstorm, ae:skill-creator)
  deep      → 规划/审查/执行类 (ae:plan, ae:work, ae:review)
  vision    → 浏览器视觉类 (ae:chrome-devtools, ae:test-browser)
```

## 八、规则注入系统

AE 通过 opencode 的 `instructions` glob 机制注入规则文件：

```
┌────────────────────────────────────────────────────────────┐
│                   规则注入层次                              │
│                                                            │
│  1. 内置规则: src/assets/rules/**/*.md                     │
│     ├─ ai-coding-guidelines.md    (AI 编码规范)           │
│     ├─ ai-execution-guardrails.md (AI 执行护栏)           │
│     ├─ global-dev.md              (全局开发规范)           │
│     ├─ graph-first.md             (图谱优先规则)           │
│     └─ setup-gate-rule.md         (浏览器门禁规则)         │
│                                                            │
│  2. 项目规则: .opencode/rules/**/*.md                      │
│     (用户自定义项目级规则)                                 │
│                                                            │
│  3. 全局规则: ~/.config/opencode/rules/**/*.md             │
│     (用户自定义全局规则)                                   │
│                                                            │
│  注入方式: registerRulesInstructions()                     │
│  → config.instructions 追加 glob 路径                     │
│  → opencode 运行时 glob 展开并自动去重                    │
└────────────────────────────────────────────────────────────┘
```

## 九、运行时资产定位

插件运行时通过 `RuntimeAssetManifest` 定位所有资产，支持"桥接文件 + dist"独立运行：

```
┌────────────────────────────────────────────────────────────┐
│              RuntimeAssetManifest 路径解析                  │
│                                                            │
│  入口: createRuntimeAssetManifest(import.meta.url)         │
│                                                            │
│  解析顺序:                                                 │
│  1. 模块同级 assets/     (dist/src/assets/)               │
│  2. dist/src/assets/     (标准构建产物)                    │
│  3. src/assets/          (开发回退)                        │
│                                                            │
│  产出:                                                     │
│  ├─ skillsDir    → assets/skills/                          │
│  ├─ rulesDir     → assets/rules/                           │
│  ├─ commandsDir  → assets/commands/                        │
│  ├─ agentsDir    → assets/agents/                          │
│  ├─ builtinConfigFile → assets/config/ae.jsonc             │
│  └─ runtimeAgentFiles → 代理文件映射 (source → target)    │
└────────────────────────────────────────────────────────────┘
```

## 十、核心数据流

### 10.1 ae:lfg 核心流程组合执行流

```
用户输入: /ae-lfg 实现用户登录功能
         │
         ▼
┌────────────────────────────────────────────────────────────┐
│ 1. 命令模板展开                                            │
│    "使用 ae:lfg 技能处理这次请求，并沿用参数：实现用户登录"│
│    → LLM 加载 SKILL.md                                    │
└────────────────────────┬───────────────────────────────────┘
                         │
                         ▼
┌────────────────────────────────────────────────────────────┐
│ 2. 任务分类 (S1-S7)                                       │
│    → S4: 多步骤任务，走完整管道                            │
└────────────────────────┬───────────────────────────────────┘
                         │
                         ▼
┌────────────────────────────────────────────────────────────┐
│ 3. 恢复检查                                               │
│    → ae-recovery 工具检查 ae/ 目录                        │
│    → 无产物，从 brainstorm 开始                            │
└────────────────────────┬───────────────────────────────────┘
                         │
                         ▼
┌────────────────────────────────────────────────────────────┐
│ 4. ae:brainstorm → 需求文档                               │
│    产出: ae/brainstorms/2026-06-01-user-login-req.md      │
└────────────────────────┬───────────────────────────────────┘
                         │
                         ▼
┌────────────────────────────────────────────────────────────┐
│ 5. ae:review domain:document → 需求审查                   │
│    → ae-review-contract 工具选择审查者                     │
│    → 审查专精并行执行 → 审查报告                          │
└────────────────────────┬───────────────────────────────────┘
                         │
                         ▼
┌────────────────────────────────────────────────────────────┐
│ 6. ae:plan → 计划文档                                     │
│    → ae-doc-extract 读取需求                              │
│    → ae-graph-query 了解项目结构                          │
│    产出: ae/plans/2026-06-01-user-login-plan.md           │
└────────────────────────┬───────────────────────────────────┘
                         │
                         ▼
┌────────────────────────────────────────────────────────────┐
│ 7. ae:work → 实施                                         │
│    → ae-task-analyzer 分析任务并行度                      │
│    → @development-domain 域代理调度专精                   │
│    → 验证 + 代码审查                                      │
└────────────────────────┬───────────────────────────────────┘
                         │
                         ▼
┌────────────────────────────────────────────────────────────┐
│ 8. ae:review → 结果审查                                   │
│    → ae-review-contract 选择审查团队                      │
│    → ae-review-proof 写入审查证明                         │
└────────────────────────┬───────────────────────────────────┘
                         │
                         ▼
                  交付完成
```

### 10.2 审查契约生成流

```
ae-review-contract 工具调用
         │
         ▼
┌─────────────────────────┐
│ 1. 解析 kind 和 mode   │
│    kind=code|document   │
│    mode=interactive|    │
│    headless|report-only │
│    |autofix             │
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│ 2. selectReviewers()    │
│    遍历 REVIEW_MATRIX   │
│    ├─ alwaysOn → 选中   │
│    └─ conditionGroups   │
│       ├─ domain 匹配    │
│       └─ 谓词求值       │
│         (OR 组间,       │
│          AND 组内)      │
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│ 3. 返回审查契约 JSON    │
│    {                     │
│      kind, documentType, │
│      mode,               │
│      reviewers: [...],   │
│      gate: "P0/P1阻断"  │
│    }                     │
└─────────────────────────┘
```

## 十一、技能间依赖关系图

```
                    ┌─────────┐
                    │ ae:lfg  │ (核心流程组合技能)
                    └────┬────┘
                         │
          ┌──────────────┼──────────────┐
          │              │              │
          ▼              ▼              ▼
    ┌──────────┐  ┌──────────┐  ┌──────────┐
    │ae:ideate │  │ae:brain- │  │ae:review │
    │          │  │storm     │  │(只读)    │
    └────┬─────┘  └────┬─────┘  └──────────┘
         │              │
         │              ▼
         │        ┌──────────┐
         └───────▶│ ae:plan  │
                  │ ae:refactor│
                  └────┬─────┘
                       │
                       ▼
                  ┌──────────┐
                  │ ae:work  │──────┐
                  └────┬─────┘      │
                       │            │
                       ▼            ▼
                  ┌──────────┐ ┌──────────────┐
                  │ ae:review│ │ ae:merge-    │
                  │(结果审查)│ │ branch       │
                  └──────────┘ └──────────────┘

  ┌─────────────────────────────────────────────┐
  │           浏览器能力链                       │
  │                                             │
  │  ae:chrome-devtools ──┬──▶ ae:test-browser    │
  │  (环境验证)         └──▶ ae:frontend-design │
  └─────────────────────────────────────────────┘

  ┌─────────────────────────────────────────────┐
  │           会话管理链                         │
  │                                             │
  │  ae:handoff        (会话交接)               │
  │  ae:prompt-optimize (提示词优化)            │
  │  ae:task-loop      (循环执行)               │
  └─────────────────────────────────────────────┘

  ┌─────────────────────────────────────────────┐
  │           独立工具技能                       │
  │                                             │
  │  ae:sql             ae:swagger-parser       │
  │  ae:html-bundle     ae:graph-build          │
  │  ae:graph-query     ae:static-server        │
  │  ae:work-report     ae:save-experience      │
  └─────────────────────────────────────────────┘

  ┌─────────────────────────────────────────────┐
  │           资产创建技能                       │
  │                                             │
  │  ae:skill-creator    ae:skill-from-session  │
  │  ae:agent-creator                            │
  └─────────────────────────────────────────────┘

  ┌─────────────────────────────────────────────┐
  │           维护技能                           │
  │                                             │
  │  ae:help            ae:update               │
  └─────────────────────────────────────────────┘
```

## 十二、工具与技能映射

| 工具 | 消费技能 | 功能 |
|------|---------|------|
| ae-recovery | ae:lfg, ae:work, ae:review | 阶段恢复与产物发现 |
| ae-review-contract | ae:review | 生成审查团队与门控规则 |
| ae-review-proof | ae:review | 写入审查证明元数据 |
| ae-task-analyzer | ae:work | 分析任务并行度与冲突 |
| ae-doc-extract | ae:plan, ae:work, ae:review | 读取分片文档结构 |
| ae-graph-build | ae:graph-build | 构建文件关系图谱 |
| ae-graph-query | ae:plan, ae:work, ae:review | 查询图谱依赖/影响 |
| ae-handoff | ae:handoff | 会话交接与上下文注入 |
| ae-create-session | ae:handoff, ae:prompt-optimize | 创建独立新会话 |
| ae-prompt-optimize | ae:prompt-optimize | 提交优化提示词到新会话 |
| ae-worktree-handoff | ae:work | A→B worktree 交接文件生成 |
| ae-chrome-devtools-proof | ae:chrome-devtools, ae:test-browser | chrome-devtools MCP 注册管理 |
| ae-swagger-parser | ae:swagger-parser | OpenAPI 规格解析 |
| ae-html-bundle | ae:html-bundle | HTML 资源内联打包 |
| ae-domain-catalog | ae:review, ae:work | 查询域代理与专精目录 |
| ae-help | ae:help | 列出所有技能/命令/代理 |
