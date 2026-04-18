---
title: feat: Build AE phase-one workflow plugin
type: feat
status: active
date: 2026-04-18
origin: docs/brainstorms/2026-04-18-ae-plugin-phase-one-requirements.md
---

# feat: Build AE phase-one workflow plugin

## Overview

为当前仓库建立一套可持续开发的 AE 插件基础：以 TypeScript + opencode plugin 为实现基座，交付 `ae:*` 技能真源、`/ae-*` 可发现命令入口、CE 风格的多 reviewer 审查骨架、文件驱动的跨会话恢复协议、以及覆盖公开入口与恢复路径的 README 和关键集成测试。

这不是单纯把 CE 文本资产搬进来，而是把 AE 一期 requirements 中已经锁定的产品边界，落成一个当前仓库可维护、可验证、可继续迭代的插件工程结构。

## Problem Frame

当前仓库在起草本计划前，只有 `opencode.json`、规则文档和一期 requirements 文档，尚无稳定的 `src/`、`README.md`、`docs/plans/` 体系、`.context/`、公开技能、公开命令或测试基线。与此同时，origin 文档已经把一期目标锁定为一个可发现、可恢复、可跨会话继续的工程工作流，而不是零散的 prompt 集合 (see origin: `docs/brainstorms/2026-04-18-ae-plugin-phase-one-requirements.md`)。

因此，这份计划既要补足“能运行的插件基座”，也要补足“能让用户真正用起来”的入口、文档、审查与恢复协议。如果没有统一的 source-of-truth、artifact 协议和命令/技能一致性契约，后续即使迁入大量 CE 内容，也会演变为不可恢复、不可测试、不可维护的资产堆积。

## Requirements Trace

- RT1. 交付统一的 `ae:*` 技能与 `/ae-*` 命令入口，并保证命令提示可发现、参数语义一致、帮助与恢复语义一致 (covers R1-R5, R31, R44-R48)
- RT2. 交付 `ae:brainstorm -> ae:document-review -> ae:plan -> ae:plan-review -> ae:work -> ae:review -> ae:lfg` 的主链路，并定义自动触发后的最小状态与停留规则 (covers R6-R10, R32)
- RT3. 交付 CE 风格的文档/计划/代码三类多 reviewer 审查骨架，且锁定一期最小 reviewer 契约与模式边界 (covers R11-R16, R33, R36-R37)
- RT4. 完整盘点、分桶并尽可能汉化 CE agents，避免一期 reviewer/agent 迁移遗漏 (covers R39-R43)
- RT5. 交付 CE 式 living plan、以子代理为主的小任务执行姿态，以及可暂停/可重入的执行流程 (covers R17-R21)
- RT6. 交付以 `docs/brainstorms/`、`docs/plans/`、`.context/ae/...` 为事实来源的文件驱动恢复协议 (covers R22-R24, R34)
- RT7. 交付完整使用手册型 `README.md`，表格化说明入口、参数、产物、模式与恢复方式 (covers R25-R27, R47)
- RT8. 先验证动态技能注册与命令提示可发现性的技术可行性，再以关键集成测试证明 discoverability、review orchestration 和跨会话恢复真实可用 (covers R28-R30, R35, R38)

## Scope Boundaries

- 一期不迁移与当前仓库无直接关系的 Rails、Python、data migration、Proof、todo 全家桶等外围能力
- 一期不构建通用工作流状态机平台；状态只定义到支持 AE 主链路和跨会话恢复所必需的最小粒度
- 一期不追求一次性把 CE 全部技能体系重命名迁入；只迁移 origin 明确要求的主链路技能、命令、agents 和其依赖引用
- 一期不把 generated runtime outputs 当作 source-of-truth；源码、markdown 资产、schemas 和 tests 才是长期维护对象

### Deferred to Separate Tasks

- 二期扩展更多栈特定 reviewer 与审查 persona：在一期最小 catalog 稳定后补充
- 二期接入更多非主链路 agent：如 `pr-comment-resolver`、migration 系列 reviewer、设计回路以外的扩展整合

## Context & Research

### Relevant Code and Patterns

- `docs/brainstorms/2026-04-18-ae-plugin-phase-one-requirements.md`：一期产品边界与 reviewer/agent 迁移清单
- `.opencode/rules/core/architecture.md`：当前仓库要求的 `src/index.ts -> tools/hooks/services/schemas/utils` 分层
- `.opencode/rules/core/code-style.md`：TypeScript strict、Effect/Zod、中文注释与命名约束
- `.opencode/rules/core/testing.md`：Vitest、同目录 `*.test.ts` 与覆盖率要求
- `opencode.json`：当前项目级 opencode 配置、权限策略与缺失的 `AGENTS.md` 引用
- `.opencode/node_modules/@opencode-ai/plugin/dist/index.d.ts`：验证 server plugin 支持 `config` hook、tool hooks、command execute hooks
- `.opencode/node_modules/@opencode-ai/plugin/dist/tui.d.ts`：验证 TUI plugin 支持 `command.register()`，可作为 `/ae-*` 命令提示入口能力基座

### Institutional Learnings

- 当前仓库仍是“requirements + rules”状态，必须先补齐工程与运行基座，再迁 workflow 内容
- 根 `.gitignore` 与 `.opencode/.gitignore` 当前忽略 `package.json` / `package-lock.json`，会直接阻断可复现开发，需要先收敛为可跟踪依赖清单
- `opencode.json` 当前引用 `AGENTS.md`，但仓库缺失该文件；若不补齐，项目级规范入口会持续悬空

### External References

- `superpowers`：动态技能注册、OpenCode 侧 plugin packaging、薄命令别名与用户发现体验
- `oh-my-openagent`：skill/command 统一描述、command discovery、slash command metadata shape
- `compound-engineering-plugin`：CE 主链路技能、review persona catalog、headless/report-only/autofix 契约、artifact 与 handoff 结构

本计划不额外引入 web research。当前仓库虽然缺少本地实现模式，但用户已明确提供三个高相关参考项目，加上已安装的 `@opencode-ai/plugin` 类型定义，足以支撑一期架构决策。

## Key Technical Decisions

- **以受版本控制的仓库根目录作为实现真源**：新增受版本控制的 `package.json`、`tsconfig.json`、`src/`、`skills/`、`commands/`、`agents/`、`tests/`；运行时 plugin entry 输出到 `.opencode/plugins/`，但 generated runtime 文件不是长期维护真源
- **锁定 phase-one 运行时依赖策略**：根目录 `package.json` 是开发真源；`.opencode/package.json` 在一期内作为受版本控制的 runtime shim 保留，并显式同步所有 phase-one 运行时依赖（包括新增的 `effect`、`zod`、frontmatter 解析依赖等），直到后续有自包含打包方案再收敛
- **锁定双 plugin 装载方案**：一期显式产出 `.opencode/plugins/ae-server.js` 与 `.opencode/plugins/ae-tui.js` 两个运行时入口，并在 `opencode.json` 中同时加载它们
- **以共享核心 + 双入口 runtime 的方式满足 discoverability 要求**：server plugin 负责动态技能、artifact 与 workflow glue；TUI command entry 负责 `/ae-*` 命令提示注册。两者共享同一份 AE catalog、参数契约和恢复语义，而不是各自实现一套逻辑
- **把 skill / command / agent 元数据集中到统一 catalog**：公开名称、CE 对应关系、argument-hint、token 语义、agent 分桶、README 映射和测试断言都从同一 catalog 派生，防止命令、技能、README、测试长期漂移
- **显式定义 source-to-runtime 映射**：根目录 `skills/` 通过 `skills.paths` 直接注入；根目录 `commands/` 作为真源并镜像到 `.opencode/commands/ae-*` 承担原生命令执行，TUI command entry 只负责 discoverability 并触发对应原生命令；根目录 `agents/` 作为 source-of-truth，在构建/同步阶段镜像到 `.opencode/agents/ae/` 供运行时发现
- **选择根目录 source-of-truth 是为了最小化长期维护成本**：`skills/` 和 `commands/` 都由 catalog 生成/约束，避免在 `opencode.json` 再手写一套平行定义；`agents/` 因运行时缺少 `agent.paths` 能力，才需要单向镜像到 `.opencode/agents/ae/`
- **命令执行与命令发现分离**：phase one 以 `.opencode/commands/ae-*` 承担原生命令执行与参数落地，TUI command entry 只承担命令提示发现与快捷触发，因此 `mode:*`、`plan:<path>` 等参数 contract 仍以原生命令模板和 command markdown 为准
- **自动阶段推进由 markdown skill + 共享服务共同承担，不依赖 plugin 生命周期 hook**：`SKILL.md` 资产拥有阶段推进与下游调用规则；TypeScript 侧只提供 artifact、恢复、命令注册和状态/选择能力，不假设 opencode 提供 skill after hook
- **markdown skills 通过薄工具层访问共享服务**：`SKILL.md` 不直接依赖 TypeScript service；phase-one 通过少量 plugin tools 暴露 review contract 与 artifact/recovery 能力，既满足 opencode 工具面约束，也避免为每个 skill 复制一套状态解析逻辑
- **`ae:plan-review` 复用 document-review agent family**：一期不单独建立 `plan-review` agent bucket，而是对 plan 文档使用 document-review reviewers + plan-specific classification 与 rules
- **以 `.context/ae/...` 定义最小恢复协议**：只存放跨会话恢复真正需要的 review/work 状态、上游引用、origin 指纹和 superseded 信息；恢复规则统一为“单候选自动继续，多候选强制选择，空/损坏/过期产物进入异常恢复，不静默猜测”
- **把 reviewer/agent 迁移视为 inventory-first 任务**：先盘点一期必需、镀金可选和 deferred agents，再迁入和汉化，避免边实现边补目录导致遗漏
- **默认用户入口锁定为 `/ae-lfg`**：新用户默认从 `/ae-lfg` 进入；阶段命令与技能用于已有产物后的定点重入、恢复和人工控制

## Open Questions

### Resolved During Planning

- **是否需要额外 web research？** 不需要。用户给出的三个参考项目与本地已安装类型定义，已经覆盖一期架构决策所需事实
- **如何同时满足动态技能注册与 `/ae-*` 命令提示入口？** 采用共享核心 + 双入口 runtime 方案：server plugin 管 skills/artifacts，TUI command entry 管 slash command discoverability
- **技能与命令的参数 contract 放在哪里最稳？** 放在共享 catalog 与 schema 层，由 skill frontmatter、command metadata、README 表格和测试共同消费
- **一期应把恢复规则做到什么粒度？** 先统一阶段状态与候选产物选择规则，而不是引入完整状态机平台

### Deferred to Implementation

- `.context/ae/...` 每类 artifact 的精确 frontmatter 字段命名与指纹算法，在 schema 固化时最终收口

## Output Structure

下列结构是**代表性布局**而非穷举清单；每个 Implementation Unit 的 `**Files:**` 仍然是该单元的权威变更列表。

```text
AGENTS.md
README.md
package.json
tsconfig.json
vitest.config.ts
src/
  index.ts
  tui.ts
  tools/
    index.ts
    ae-recovery.tool.ts
    ae-review-contract.tool.ts
  services/
    ae-catalog.ts
    agent-sync.ts
    argument-contract.ts
    artifact-store.ts
    command-registration.ts
    runtime-asset-manifest.ts
    recovery-service.ts
    review-catalog.ts
    review-orchestration.ts
    review-selector.ts
  schemas/
    ae-asset-schema.ts
    artifact-schema.ts
    recovery-schema.ts
    review-finding-schema.ts
    review-schema.ts
  utils/
    frontmatter.ts
    path-utils.ts
skills/
  ae-brainstorm/
    SKILL.md
    references/
  ae-document-review/
    SKILL.md
    references/
  ae-plan/
    SKILL.md
    references/
  ae-plan-review/
    SKILL.md
    references/
  ae-work/
    SKILL.md
    references/
  ae-review/
    SKILL.md
    references/
  ae-lfg/
    SKILL.md
    references/
commands/
  ae-brainstorm.md
  ae-review-doc.md
  ae-plan.md
  ae-review-plan.md
  ae-work.md
  ae-review-code.md
  ae-lfg.md
agents/
  document-review/
  review/
  research/
  workflow/
tests/
  integration/
    runtime-entry-validation.test.ts
    review-orchestration.test.ts
docs/
  brainstorms/
  plans/
.opencode/
  agents/
    ae/
  commands/
    ae-*.md
  plugins/
    ae-server.js
    ae-tui.js
.context/
  ae/
    review/
    work/
```

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```mermaid
flowchart TD
  Catalog[AE catalog and schemas] --> Skills[skills/ae-*/SKILL.md]
  Catalog --> Commands[commands/ae-*.md]
  Catalog --> Agents[agents/**]

  Server[server plugin]
  Tui[TUI command entry]

  Skills --> Server
  Agents --> Server
  Catalog --> Server
  Catalog --> Tui
  Commands --> Tui

  Server --> Docs[docs/brainstorms + docs/plans]
  Server --> Context[.context/ae/...]
  Tui --> Prompt[/ae-* command prompt]

  Docs --> Recovery[recovery service]
  Context --> Recovery
  Recovery --> Server
  Recovery --> Tui
```

## Implementation Units

- [ ] **Unit 1: 前置验证 plugin 装载与命令 discoverability 闸门**

**Goal:**
在大规模迁入 CE 资产之前，用真实 opencode 运行时证明一期最承重的前提成立：动态技能注册、`/ae-*` 命令提示可发现、以及命令可直接触发。

**Requirements:**
RT1, RT8

**Dependencies:**
None

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `AGENTS.md`
- Create: `.opencode/package.json`
- Create: `src/index.ts`
- Create: `src/tui.ts`
- Create: `src/utils/path-utils.ts`
- Create: `tests/fixtures/runtime/smoke-skill/SKILL.md`
- Create: `tests/fixtures/runtime/smoke-command.md`
- Test: `src/utils/path-utils.test.ts`
- Test: `tests/integration/runtime-entry-validation.test.ts`
- Modify: `.gitignore`
- Modify: `.opencode/.gitignore`
- Modify: `opencode.json`

**Approach:**
- 建立最小可运行的根目录 Node/TypeScript/Vitest 工程，同时把 `.opencode/package.json` 转成受版本控制的 runtime shim，避免 `.opencode/plugins/*.js` 在当前装载路径下失去依赖解析基础
- 根目录 `package.json` 管开发与测试依赖；`.opencode/package.json` 明确同步并声明运行时依赖，避免把 `.opencode/plugins/*.js` 的依赖解析寄托在跨目录向上命中或未来 bundling 假设上
- 使用固定构建落地：`tsc` 先输出到 `dist/`，再由受版本控制的 postbuild 产物步骤生成 `.opencode/plugins/ae-server.js` 与 `.opencode/plugins/ae-tui.js`；`opencode.json` 只引用这两个最终路径
- 用受控 fixture 形式的最小 smoke skill 与最小 `/ae-*` command 完成真实 discoverability 验证，确认 skills 注入、命令提示注册和命令触发三件事同时成立后，再允许继续迁移 catalog/agents/skills 资产
- 补齐 `AGENTS.md`，让项目级 instructions 真正闭环

**Execution note:**
对 plugin 入口路径、discoverability 闸门和 Windows 路径解析采用 test-first；这是后续所有单元的 go/no-go 前提

**Patterns to follow:**
- `.opencode/rules/core/architecture.md`
- `.opencode/rules/core/testing.md`
- `.opencode/node_modules/@opencode-ai/plugin/dist/index.d.ts`
- `.opencode/node_modules/@opencode-ai/plugin/dist/tui.d.ts`

**Test scenarios:**
- Happy path: server plugin 注入最小 skills 路径后，runtime 能发现 smoke skill
- Happy path: TUI command entry 注册的最小 `/ae-*` 命令出现在命令提示中，并可直接触发
- Edge case: 在 Windows 风格目录下，plugin 入口与路径工具仍能生成正确的 repo-relative 路径
- Error path: 缺失 build output、缺失 plugin spec 或缺失 `AGENTS.md` 时，返回明确、中文、可操作的错误说明
- Integration: `opencode.json` 同时加载 server/TUI 两个 plugin 入口后，不会破坏现有 instructions 与 permissions 结构

**Verification:**
- 动态技能注册、`/ae-*` 可发现、命令可触发三件事在真实 runtime 中被验证成立
- `.opencode/plugins/ae-server.js` 与 `.opencode/plugins/ae-tui.js` 的生成路径和 `opencode.json` 引用路径已经被固定，不再由实现者临场决定
- 根目录开发真源与 `.opencode/package.json` runtime shim 的角色分工已闭合，不会出现 build 成功但运行时缺依赖的断层
- 新增的 phase-one 运行时依赖有明确落点：开发依赖进根目录 package，运行时依赖同步进 `.opencode/package.json`
- 若验证失败，计划在此停留并回到装载方案调整，而不是继续迁移大批 assets

- [ ] **Unit 2: 固化共享 catalog 与 source-to-runtime 映射契约**

**Goal:**
建立 skills、commands、agents、README 与测试共同消费的 AE catalog，并把根目录资产如何映射到运行时路径写成明确 contract，而不是实现时临场猜测。

**Requirements:**
RT1, RT4, RT7, RT8

**Dependencies:**
Unit 1

**Files:**
- Create: `src/services/ae-catalog.ts`
- Create: `src/services/runtime-asset-manifest.ts`
- Create: `src/schemas/ae-asset-schema.ts`
- Create: `src/utils/frontmatter.ts`
- Test: `src/services/ae-catalog.test.ts`
- Test: `src/utils/frontmatter.test.ts`
- Test: `src/services/runtime-asset-manifest.test.ts`
- Create: `skills/.gitkeep`
- Create: `commands/.gitkeep`
- Create: `agents/.gitkeep`

**Approach:**
- 用 schema + catalog 明确一期公开 skill/command 列表、CE 对应名、argument-hint、mode/token 约定、agent 分桶和 README 暴露信息
- 明确 source-to-runtime 映射：根目录 `skills/` 通过 `skills.paths` 直接注入；根目录 `commands/` 在构建阶段镜像到 `.opencode/commands/ae-*` 承担原生命令执行，同时由 TUI command entry 读取同一 catalog 进行 discoverability；根目录 `agents/` 作为 source-of-truth，在构建/同步阶段镜像到 `.opencode/agents/ae/`
- 此单元只建立静态 contract、frontmatter 校验和路径映射，不提前抽象通用 asset loader 框架

**Execution note:**
从 catalog contract 与路径映射 contract 开始 test-first，尤其覆盖 skill/command 一一映射、重复命名、参数冲突和 runtime target 冲突

**Patterns to follow:**
- `docs/brainstorms/2026-04-18-ae-plugin-phase-one-requirements.md`
- `.opencode/rules/core/agent-design.md`
- `oh-my-openagent` 的 command metadata / discovery 思路

**Test scenarios:**
- Happy path: catalog 返回 origin 文档要求的全部一期公开 skills、commands 和 agent buckets
- Happy path: 同一能力的 skill 与 command 共用同一套参数 contract、argument-hint 与帮助元数据
- Edge case: duplicate skill name、duplicate slash alias、command 与 skill 映射缺失时被 schema 拒绝
- Error path: catalog 中存在未知 mode token、未知 agent bucket 或 runtime target 冲突时，返回结构化错误
- Integration: runtime-asset-manifest 能稳定给出 source path、runtime path 与消费方式，不需要额外常量表

**Verification:**
- 一期公开入口、agent 分桶与 source-to-runtime 映射都能从同一 catalog 推导
- 后续新增或删除公开入口时，不需要再发明第二套路径或描述规则

- [ ] **Unit 3: 迁入并汉化审查核心 agents 资产**

**Goal:**
先迁入一期主链路真正必需的 document-review 与 code-review 核心 agents，并完成中文用户可见说明，为后续 review orchestration 提供稳定资产基础。

**Requirements:**
RT3, RT4

**Dependencies:**
Unit 2

**Files:**
- Create: `agents/document-review/coherence-reviewer.md`
- Create: `agents/document-review/feasibility-reviewer.md`
- Create: `agents/document-review/product-lens-reviewer.md`
- Create: `agents/document-review/scope-guardian-reviewer.md`
- Create: `agents/document-review/adversarial-document-reviewer.md`
- Create: `agents/document-review/design-lens-reviewer.md`
- Create: `agents/document-review/security-lens-reviewer.md`
- Create: `agents/review/correctness-reviewer.md`
- Create: `agents/review/testing-reviewer.md`
- Create: `agents/review/maintainability-reviewer.md`
- Create: `agents/review/project-standards-reviewer.md`
- Create: `agents/review/agent-native-reviewer.md`
- Create: `agents/review/security-reviewer.md`
- Create: `agents/review/performance-reviewer.md`
- Create: `agents/review/api-contract-reviewer.md`
- Create: `agents/review/reliability-reviewer.md`
- Create: `agents/review/adversarial-reviewer.md`
- Test: `tests/integration/core-agent-inventory.test.ts`

**Approach:**
- 先迁入支撑 `ae:document-review`、`ae:plan-review` 与 `ae:review` 最小 contract 的核心审查 agents，而不是在一个单元里同时吞下全部 research/workflow/gilded agents
- 对所有用户可见描述、提示词与帮助文案做中文化，同时保留稳定英文标识作为内部 ID
- `ae:plan-review` 在 phase one 中复用 document-review agent family，不单独建立 plan-review asset bucket

**Execution note:**
agent inventory 与中文化 contract 采用 test-first；缺失文件、缺失中文说明或错误分桶必须被 contract test 直接打断

**Patterns to follow:**
- `docs/brainstorms/2026-04-18-ae-plugin-phase-one-requirements.md`
- `compound-engineering-plugin` 的 document-review / ce-review 必需 reviewer 结构

**Test scenarios:**
- Happy path: document-review / plan-review 核心 agents 全部存在且具备中文用户可见说明
- Happy path: code-review always-on 与核心高风险 conditional agents 全部存在且被正确分桶
- Edge case: document-review 与 code-review 资产不会误混到错误 bucket
- Error path: catalog 中标记为 phase-one 必需的 agent 文件缺失或未汉化时，inventory test 失败
- Integration: `ae:plan-review` 被显式映射到 document-review agent family，而不是悬空成第三套 reviewer 目录

**Verification:**
- phase-one 审查核心 agents 全部迁入、中文化并能被 runtime mapping 引用
- 计划中最关键的审查类型不再依赖“后面再补 reviewer 文件”

- [ ] **Unit 4: 补齐一期必需的 research / workflow / extended review agents**

**Goal:**
迁入一期 requirements 明确要求的其余必需 agents，完成完整盘点与分桶，确保 research、flow analysis 和 PR 场景能力不会在首发时遗漏。

**Requirements:**
RT3, RT4

**Dependencies:**
Unit 2, Unit 3

**Files:**
- Create: `agents/research/repo-research-analyst.md`
- Create: `agents/research/learnings-researcher.md`
- Create: `agents/research/framework-docs-researcher.md`
- Create: `agents/research/best-practices-researcher.md`
- Create: `agents/workflow/spec-flow-analyzer.md`
- Create: `agents/review/cli-readiness-reviewer.md`
- Create: `agents/review/previous-comments-reviewer.md`
- Create: `agents/review/kieran-typescript-reviewer.md`
- Create: `src/services/agent-sync.ts`
- Test: `tests/integration/required-agent-matrix.test.ts`
- Test: `tests/integration/agent-sync.test.ts`

**Approach:**
- 按 requirements 中“一期必需 / 镀金可选 / 暂不首发”三桶清单补齐剩余必需项
- 对 research 与 workflow agents 延续中文化策略，但不把镀金与 deferred 项伪装成一期已交付能力
- 用 agent matrix contract test 锁住“禁止遗漏”的要求，防止后续只迁核心 reviewer 而漏掉 research/workflow 资产
- 明确 `agents/ -> .opencode/agents/ae/` 的唯一方案：构建阶段做单向镜像并清理陈旧 runtime agents；源文件改名、删除或移动都会在同步时反映到 runtime 目录，不允许手工维护两份 agent 真源

**Patterns to follow:**
- `docs/brainstorms/2026-04-18-ae-plugin-phase-one-requirements.md`
- `compound-engineering-plugin` 的 agents inventory 组织方式

**Test scenarios:**
- Happy path: requirements 列为 phase-one 必需的 research/workflow/extended review agents 全部存在
- Edge case: gilded 或 deferred agent 不被错误纳入 phase-one 必需清单
- Error path: requirements 必需清单与实际 agent 文件不一致时，matrix contract test 失败
- Integration: review / research / workflow 三大目录的 phase-one inventory 可被 catalog 一次性读取并分类

**Verification:**
- phase-one 必需 agents 全部盘点、迁入并有测试保护
- `agents/` 到 `.opencode/agents/ae/` 的镜像策略、覆盖规则、删除同步和失败阻断条件已经被锁定并有测试覆盖
- “禁止遗漏” 从文档要求变成可执行 contract

- [ ] **Unit 5: 实现 CE 风格 review orchestration 与模式契约**

**Goal:**
把三类审查从“能选 reviewer”推进到“能并行执行 reviewer、汇总 findings、去重合并、路由 gate 与模式输出”的完整可消费编排层。

**Requirements:**
RT3, RT4, RT8

**Dependencies:**
Unit 3, Unit 4

**Files:**
- Create: `src/tools/index.ts`
- Create: `src/tools/ae-review-contract.tool.ts`
- Create: `src/services/review-catalog.ts`
- Create: `src/services/review-selector.ts`
- Create: `src/services/review-orchestration.ts`
- Create: `src/schemas/review-schema.ts`
- Create: `src/schemas/review-finding-schema.ts`
- Test: `src/services/review-selector.test.ts`
- Test: `src/services/review-orchestration.test.ts`
- Test: `tests/integration/review-orchestration.test.ts`

**Approach:**
- 用一个 `review-orchestration` 主服务承接“reviewer team contract -> finding schema 校验 -> 去重合并 -> gate 路由”整条链路，`review-selector` 与 schemas 作为可复用支撑层，避免一期过早拆成多层编排框架
- `ae:document-review` 与 `ae:plan-review` 共用 document-review orchestration，只在文档分类与命中条件上区分；`ae:review` 使用 code-review orchestration
- 在 phase one 中把 interactive、headless、report-only、autofix 的 mode contract 明确到 service 层，而不是让每个 markdown skill 自己拼装一套模式语义
- reviewer fan-out 由 markdown review skills 使用内置 Task / subagent 能力完成；`ae-review-contract` 工具只负责把 reviewer team 选择、mode contract、finding schema 与 artifact 路由暴露给 `SKILL.md`，随后由 `review-orchestration` 对回收结果做去重、合并和 gate 判定

**Execution note:**
对 findings schema、去重和 mode/gate 路由采用 test-first；这部分一旦偏离 CE 合同，后续 skills 和 README 都会失真

**Patterns to follow:**
- `compound-engineering-plugin` 的 `document-review` / `ce-review` findings schema 与 mode contract
- `docs/brainstorms/2026-04-18-ae-plugin-phase-one-requirements.md`

**Test scenarios:**
- Happy path: markdown review skills 根据 `ae-review-contract` 提供的 reviewer team 并行派发 reviewer 后，`review-orchestration` 能按 severity 和 evidence 合并重复问题
- Happy path: `ae:plan-review` 对 plan 文档走 document-review reviewer family，但保留 plan-specific 分类与输出
- Edge case: 部分 reviewer 超时或失败时，orchestration 仍能基于成功结果继续，并在 coverage 输出中标记缺口
- Edge case: 两个 reviewer 对同一问题给出不同 autofix class 时，gate 选择更保守路由
- Error path: reviewer 返回不符合 finding schema 的结果时，被隔离并报告，而不污染最终审查结论
- Integration: document-review、plan-review、code-review 在 interactive / headless / report-only / autofix 下都返回一致、可消费的最终 contract

**Verification:**
- phase-one 三类审查已经具备 CE 风格“并行执行 -> 汇总去重 -> gate 路由”的可用骨架
- 审查模式不再只停留在 markdown 说明，而有共享 service、工具层入口和测试支撑

- [ ] **Unit 6: 迁入并汉化 phase-one skills 与薄命令别名**

**Goal:**
交付 `ae:brainstorm`、`ae:document-review`、`ae:plan`、`ae:plan-review`、`ae:work`、`ae:review`、`ae:lfg` 七个 phase-one skills，以及与其一一映射的 `/ae-*` 薄命令别名，并保持 CE 风格参数契约。

**Requirements:**
RT1, RT2, RT3, RT4, RT5, RT7

**Dependencies:**
Unit 2, Unit 5

**Files:**
- Create: `skills/ae-brainstorm/SKILL.md`
- Create: `skills/ae-brainstorm/references/`
- Create: `skills/ae-document-review/SKILL.md`
- Create: `skills/ae-document-review/references/`
- Create: `skills/ae-plan/SKILL.md`
- Create: `skills/ae-plan/references/`
- Create: `skills/ae-plan-review/SKILL.md`
- Create: `skills/ae-plan-review/references/`
- Create: `skills/ae-work/SKILL.md`
- Create: `skills/ae-work/references/`
- Create: `skills/ae-review/SKILL.md`
- Create: `skills/ae-review/references/`
- Create: `skills/ae-lfg/SKILL.md`
- Create: `skills/ae-lfg/references/`
- Create: `commands/ae-brainstorm.md`
- Create: `commands/ae-review-doc.md`
- Create: `commands/ae-plan.md`
- Create: `commands/ae-review-plan.md`
- Create: `commands/ae-work.md`
- Create: `commands/ae-review-code.md`
- Create: `commands/ae-lfg.md`
- Create: `src/services/argument-contract.ts`
- Test: `src/services/argument-contract.test.ts`
- Test: `tests/integration/skill-command-parity.test.ts`

**Approach:**
- 以 CE 的 skill/command 内容为基底，进行中文化、AE 命名替换、origin requirements 中新增边界补充，以及 parameter contract 收敛
- 将命令设计为 thin alias：负责 discoverability 与入口跳转，不承载第二套业务逻辑
- 对 `mode:*`、`plan:<path>`、自由文本输入、空参数默认行为、冲突模式错误等 contract 做统一收口，避免技能和命令各自解析
- 自动阶段推进写在 markdown skill orchestration 中：`SKILL.md` 资产拥有阶段推进规则；代码只提供 review contract 与 artifact/recovery services，而不是依赖 plugin lifecycle hooks
- 明确入口心智模型：新用户默认 `/ae-lfg`，阶段命令和 `ae:*` 技能用于已有 artifact 的定点重入与人工控制
- `ae:plan` 明确产出 living plan 格式与进度复选框约束；`ae:work` 明确使用 subagent-first 执行姿态，在有依赖关系时串行委派、无依赖时并行委派
- runtime 命令提示仅强制保证 `title`、`description`、`value` 和 slash alias 的 discoverability；`argument-hint` 作为 skill frontmatter、README 与测试的共享 contract，并在命令 `description` 中按需呈现摘要提示，而不是假设运行时有独立字段

**Execution note:**
参数 conflict、空输入默认行为和 command-skill parity 采用 test-first，防止迁移时出现“内容接近、contract 已漂”的问题

**Patterns to follow:**
- `docs/brainstorms/2026-04-18-ae-plugin-phase-one-requirements.md`
- `compound-engineering-plugin` 的 `ce:brainstorm`、`ce:plan`、`ce:work`、`ce:review`、`lfg`
- `superpowers` 的薄命令别名思路

**Test scenarios:**
- Happy path: 每个 `skills/ae-*/SKILL.md` 都带有与 CE 风格一致的 `name`、`description`、`argument-hint`；所有需要 references 的 skills 都具备对应 references 目录
- Happy path: `/ae-plan` 与 `ae:plan` 对空输入、路径输入和自由文本输入给出相同默认行为
- Happy path: `ae:plan` 生成的 plan 模板保留 living plan 所需的复选框、origin 引用与可重入字段；`ae:work` 的执行说明明确要求 subagent-first 任务拆分
- Edge case: `ae:review` / `/ae-review-code` 处理冲突 `mode:*` token 时，错误分类和消息一致
- Edge case: `/ae-lfg` 作为默认入口，在没有可恢复 artifact 时回到 `ae:brainstorm` / `/ae-brainstorm`，在已有单候选 artifact 时转到对应阶段
- Error path: command alias 指向缺失 skill、缺失 reference 或缺失 argument contract 时，parity 测试失败
- Integration: public catalog、skill frontmatter、command metadata 三者对七个 phase-one 能力保持完整一一映射

**Verification:**
- 七个 phase-one skills 与七个 `/ae-*` 命令薄入口全部存在、中文化并符合 CE 风格参数约定
- 默认入口与阶段入口的心智模型已经在 skill/command 文案与测试里被锁定
- living plan 与 subagent-first 执行姿态已经在 `ae:plan` / `ae:work` 的 assets 和合同测试中被显式承接

- [ ] **Unit 7: 实现 artifact 协议、恢复矩阵与阶段 handoff glue**

**Goal:**
把 `docs/brainstorms/`、`docs/plans/`、`.context/ae/...` 变成真正可驱动跨会话恢复的事实来源，并为自动阶段推进、审查失败停留和上游不一致提供统一处理规则。

**Requirements:**
RT2, RT5, RT6, RT8

**Dependencies:**
Unit 1, Unit 2, Unit 5, Unit 6

**Files:**
- Create: `src/tools/ae-recovery.tool.ts`
- Create: `src/services/skills-path-service.ts`
- Create: `src/services/command-registration.ts`
- Create: `src/services/artifact-store.ts`
- Create: `src/services/recovery-service.ts`
- Create: `src/schemas/artifact-schema.ts`
- Create: `src/schemas/recovery-schema.ts`
- Test: `src/services/recovery-service.test.ts`
- Test: `src/services/command-registration.test.ts`
- Test: `tests/integration/command-discovery.test.ts`
- Test: `tests/integration/recovery-flow.test.ts`
- Test: `tests/integration/stage-handoff-matrix.test.ts`
- Modify: `src/index.ts`
- Modify: `src/tui.ts`
- Modify: `opencode.json`

**Approach:**
- server plugin 通过 `config` hook 注入 AE skills 目录，并提供后续 workflow 需要的 runtime glue；TUI command entry 从共享 catalog 注册 `/ae-*` 命令
- `artifact-store` 负责 `docs/brainstorms/`、`docs/plans/`、`.context/ae/...` 的查找、引用、superseded 关系与 origin 指纹；`recovery-service` 统一实现“单候选自动继续、多候选强制选择、空/损坏/过期产物异常恢复”的规则
- 明确统一状态矩阵：至少覆盖 `drafted`、`review-passed`、`review-needs-fix`、`blocked`、`aborted`、`completed`，并为成功、无产物、空产物、审查失败、用户中止、上游不一致、候选冲突定义停留点与下一动作
- 对 requirement-plan mismatch 与过期 artifact 做一等校验：当 plan 的上游 requirement 标识或指纹不再匹配时，自动恢复必须停在 `ae:plan` / `ae:plan-review`，而不是继续执行旧 plan
- `path-utils` 只负责 repo-relative 路径拼装；`runtime-asset-manifest` 负责 source-to-runtime contract；`skills-path-service` 是 server plugin 的薄适配层，只负责把 skills 目录安全暴露给 `config.skills.paths`
- 通过 `ae-recovery` 工具把 artifact 查找、候选选择、默认入口回退和阶段 handoff 状态暴露给 markdown skills，使 `ae:brainstorm`、`ae:plan`、`ae:work`、`ae:lfg` 无需在 prompt 内重复实现恢复规则

**Execution note:**
对 artifact 选择、过期判定、上游不一致和阶段停留矩阵采用 test-first；这些是一期最容易在真实用户路径里失真的 contract

**Patterns to follow:**
- `.opencode/node_modules/@opencode-ai/plugin/dist/index.d.ts`
- `.opencode/node_modules/@opencode-ai/plugin/dist/tui.d.ts`
- `superpowers` 的动态 skills 注册路径
- `oh-my-openagent` 的 command discovery / metadata 约束

**Test scenarios:**
- Happy path: server plugin 注入 AE skills 目录后，runtime 能发现七个 phase-one skills
- Happy path: TUI command entry 成功注册 `/ae-*` 命令，并保留 description / argument-hint / alias 信息
- Happy path: 只有一个最新 plan artifact 且其上游 requirement 指纹匹配时，`ae:work` 与 `ae:lfg` 都能自动恢复到同一个 plan
- Edge case: 多个候选 requirements 或 plans 并存时，recovery service 不自动猜测，而是要求显式选择
- Edge case: 空 artifact 与不存在 artifact 触发不同恢复路径，前者视为异常产物，后者视为缺少上游结果
- Edge case: requirement 与 plan 不一致、artifact 过期或 superseded 链断裂时，恢复停在上游修正阶段而不是继续执行
- Error path: 损坏 frontmatter、缺失上游引用或无效状态值时，返回可恢复错误而不是静默降级
- Integration: `/ae-plan`、`ae:plan`、`/ae-lfg`、`ae:lfg` 在“找不到产物 / 单候选 / 多候选 / 上游不一致 / 审查失败”五类场景下给出一致的恢复建议与停留点语义

**Verification:**
- 文件驱动恢复在主链路与直接阶段入口下都使用同一套状态矩阵和异常处理规则
- “跨会话继续” 已经覆盖真实用户中断态，而不是只覆盖 happy path 文件选择

- [ ] **Unit 8: 完成 README、验证矩阵与首要用户旅程合同测试**

**Goal:**
把一期能力写成完整使用手册，并用合同测试锁住 discoverability、README 完整性、review orchestration 与“已有需求文档 -> 计划 -> 执行 -> 代码审查 -> 跨会话继续”这条首要用户旅程。

**Requirements:**
RT1, RT3, RT6, RT7, RT8

**Dependencies:**
Unit 2, Unit 5, Unit 6, Unit 7

**Files:**
- Create: `README.md`
- Test: `tests/integration/phase-one-primary-journey.test.ts`
- Test: `tests/integration/agent-matrix-contract.test.ts`
- Test: `tests/integration/readme-contract.test.ts`
- Modify: `AGENTS.md`

**Approach:**
- 按 requirements 中的 README 约定，表格化写清 skills、commands、参数、模式、artifact 路径、恢复方式、典型用法和 skill/command 对应关系
- 把默认入口策略明确写死：新用户默认 `/ae-lfg`，阶段命令与 `ae:*` 技能用于已有 artifact 的重入与人工控制
- 将 README 与 catalog 做 contract testing，确保新增或删除公开入口不会让 README 过期
- 用首要用户旅程合同测试锁住一期真正的 adoption wedge，而不是只验证单点函数
- 在 `AGENTS.md` 中补充对本仓库 AE 插件实现和测试方式的最小项目说明，保证后续 review 与 planning 都能读到统一项目上下文

**Patterns to follow:**
- `docs/brainstorms/2026-04-18-ae-plugin-phase-one-requirements.md`
- `.opencode/rules/core/testing.md`
- `superpowers/README.md` 的能力导览与安装叙事方式

**Test scenarios:**
- Happy path: README 为七个 phase-one skills 和七个 `/ae-*` 命令都提供完整表格行与参数说明
- Happy path: README 中的 artifact 路径、恢复说明、默认入口与命令/技能对应关系与 catalog 一致
- Edge case: catalog 中存在 deferred 或 gilded agents 时，README 不误报为一期已交付公开能力
- Error path: 公共技能、命令、参数、模式或默认入口策略发生变更而 README 未同步时，readme-contract test 失败
- Integration: 首要用户旅程从 requirements artifact 出发，经过 plan、work、review，再到跨会话恢复，使用的入口名、artifact 路径、恢复规则与 README 一致

**Verification:**
- 一个首次进入仓库的用户只读 `README.md` 和 `AGENTS.md` 就能知道默认从哪里进入、何时该切换到阶段入口、怎样恢复工作、每个命令接受什么参数
- 关键合同测试能在后续迭代中及时暴露 discoverability、README、默认入口或恢复协议漂移

## System-Wide Impact

- **Interaction graph:** catalog 同时服务于 skills、commands、agents、README、runtime 注册和测试；server plugin、TUI command entry、artifact/recovery 服务共同构成主链路入口层
- **Error propagation:** 参数冲突、缺失产物、多候选产物、损坏产物和缺失 runtime assets 都必须返回中文、可恢复、入口一致的错误说明
- **State lifecycle risks:** plan / review / work artifacts 需要明确 superseded 关系，否则跨会话恢复极易命中旧版本；`ae:lfg` 不能私自发明第二套阶段状态
- **API surface parity:** `ae:*` 与 `/ae-*` 必须保持 argument-hint、mode token、恢复语义和帮助语义一致；README 与测试也必须基于同一 contract
- **Integration coverage:** 单元测试不足以证明命令 discoverability、跨会话恢复、多 reviewer 选择和 README contract；一期必须保留这些集成测试
- **Unchanged invariants:** 用户可见文案、文档和 README 继续使用中文；所有 plan/artifact 文件路径继续使用 repo-relative 形式；一期不引入通用状态机平台或与当前仓库无关的 reviewer 生态

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| 当前仓库几乎无实现，直接迁入大量 CE 资产容易变成无基座的内容堆积 | 先完成 Unit 1 和 Unit 2，再迁移 assets，避免内容先于基座落地 |
| 命令提示 discoverability 与动态 skills 注册在运行时层面耦合不清 | 先用 Unit 1 做真实 runtime 验证闸门，再通过 Unit 7 的注册/恢复合同测试持续固化行为 |
| CE agent/skill 汉化过程中容易遗漏或只迁一部分 | inventory-first 迁移，所有一期必需/镀金/deferred agent 都进入 catalog 或 docs，并用 contract tests 验证完整性 |
| 文件驱动恢复如果规则不确定，会在跨会话路径中失真 | 统一 recovery service 和 artifact schema，强制“多候选先选、不静默猜测” |
| README 与真实入口、参数、模式长期漂移 | 让 README 从 catalog 派生关键字段，并用 readme-contract test 锁定 |

## Documentation / Operational Notes

- `README.md` 是一期正式交付物，不是最后补一篇概览。需要覆盖安装/接入、skills/commands、参数、模式、artifact 路径、恢复方式和示例
- `AGENTS.md` 需要补齐为项目级说明入口，避免 `opencode.json` 指向缺失文件
- 运行时 plugin 输出路径与本地开发路径需要在 README 或开发说明中清楚区分：哪些是 source-of-truth，哪些是构建产物

## Sources & References

- **Origin document:** `docs/brainstorms/2026-04-18-ae-plugin-phase-one-requirements.md`
- Related code: `.opencode/node_modules/@opencode-ai/plugin/dist/index.d.ts`
- Related code: `.opencode/node_modules/@opencode-ai/plugin/dist/tui.d.ts`
- Related code: `.opencode/rules/core/architecture.md`
- Related code: `.opencode/rules/core/testing.md`
- External reference: `superpowers`
- External reference: `oh-my-openagent`
- External reference: `compound-engineering-plugin`
