---
type: plan
status: drafted
date: 2026-05-19
title: ae-artifact-root-migration
depth: deep
---

# AE Artifact Root Migration

## AI 解析契约
- canonicalKind: plan
- humanEquivalent: true
- stableIdsRequired: true
- implementationUnitsRequired: true
- noImplicitScope: true

## 来源与目标
来源：用户要求将 AE 使用过程中的产物路径从 `docs/ae/**` 迁移到仓库根目录 `ae/**`，并将 `.opencode/ae/**` 运行产物也迁移到 `ae/**`。本轮不仅更新 AE 插件提示词、工具代码、服务代码和测试，还必须一次性迁移当前已有产物文件到新目录；相关提示词和代码不得兼容旧目录。

目标：
- R1. 所有原 `docs/ae/**` 产物生成、发现、校验、提示和测试改为根目录 `ae/**` 下的对应路径。
- R2. 所有原 `.opencode/ae/**` 运行产物生成、发现、校验、提示和测试改为根目录 `ae/**` 下的对应路径。
- R3. 彻底移除 `setup-proof.json`、`ae-setup-proof`、`ae:setup`、`/ae-setup` 相关兼容环境证明或配置语义，不保留兼容读取、兜底或迁移逻辑。
- R4. Worktree A→B 转移时按同步优先级同步需要同步的 `ae/**` 产物，不按 glob 粗暴复制整个 `ae/`。
- R5. 保持运行时独立性：只修改 `src/` 真源，不手工维护 `dist/`。
- R6. 构建知识图谱前快速枚举本次真实参与构建的文件范围，按路径段和扩展名发现潜在应过滤项，交给 AI 判断并在用户确认后写入排除或保留决策；同时维护固定硬排除列表，默认排除图片、可执行文件等无源码关系价值的文件。
- R7. 一次性迁移当前仓库已有 `docs/ae/**` 与 `.opencode/ae/**` 产物文件到 `ae/**` 对应目录；迁移完成后代码、提示词、测试和运行时发现逻辑不得兼容、读取、生成或回退到旧目录。

非目标：
- 不为旧路径提供长期兼容读取。
- 不把门禁、审查、环境证明等绑定当前 worktree 状态的产物作为可提交或可跨 worktree 复用资产。
- 不修改用户项目源码以外的全局安装目录。

## 范围

### 包含
- 更新路径常量与路径拼接服务，使 AE 产物根从 `docs/ae` 变为 `ae`。
- 更新 `.opencode/ae/**` 运行产物路径，使 agent-browser proof、截图、静态服务状态等产物写入 `ae/**`。
- 更新所有面向插件用户的技能、命令、代理、规则文案中的产物路径。
- 更新 worktree handoff 生成、校验、工具描述和 worktree 同步规则。
- 更新图谱构建、查询、存储、排除规则和预览复制路径。
- 更新图谱构建前的文件范围枚举、扩展名归类、路径段过滤建议、用户确认和固定硬排除规则。
- 更新 gate、review、artifact discovery 和 recovery 相关路径验证。
- 增加一次性文件迁移步骤，将现有 `docs/ae/**` 和 `.opencode/ae/**` 产物移动到 `ae/**`，并移除旧目录依赖。
- 更新测试覆盖与静态扫描，防止旧路径和 setup-proof 兼容语义残留。

### 不包含
- 不迁移、不改名、不改路径、不删除 `.opencode/ae.jsonc`。它是项目级配置文件，不是产出物；当前用户明确点名的是 `.opencode/ae` 子目录，不包含同级项目配置 `.opencode/ae.jsonc`。本轮图谱配置读写目标仍为项目级 `.opencode/ae.jsonc`。
- 不保留旧目录兼容读取、兼容写入、双写、自动回退或迁移后兜底逻辑；文件迁移是一次性执行步骤，不是运行时兼容层。
- 不改变 OpenCode 项目级 skill/agent 创建路径，例如 `.opencode/skills/**`、`.opencode/agents/**`。
- 不改变 AE 插件源码仓库维护产物，例如 `dist/**`、`.opencode/plugins/*.js`。

### 约束
- 面向插件用户的可分发能力以 `src/` 为真源，不能手工改 `dist/`。
- 运行时代码不得依赖本源码仓库布局，路径迁移必须仍支持分发后的插件运行。
- 图谱是派生快照，复用时必须允许在目标 worktree 增量或全量更新。
- agent-browser 环境证明绑定当前 worktree fingerprint，不应跨 worktree 同步。
- `setup-proof.json` 旧证明必须彻底移除，不允许兼容读旧文件。
- 图谱固定硬排除列表必须由代码维护，不依赖用户配置；用户 include 不能覆盖安全硬排除。`.opencode/ae.jsonc` 是项目级配置入口，不属于本轮迁移的 `.opencode/ae/**` 运行产物，任何实现单元不得把它迁移或改路径。

## 需求追溯
| 需求 ID | 计划响应 |
|---------|----------|
| R1 | U1, U2a, U2b, U2c, U3, U4, U5, U6, U8 |
| R2 | U3, U6, U7, U8 |
| R3 | U7, U8 |
| R4 | U5, U6, U8 |
| R5 | U1, U8 |
| R6 | U2b, U2c, U8 |
| R7 | U0, U1, U3, U4, U6, U8 |

## 高层技术设计
将 AE 用户侧产物根统一为 `ae/`，并把所有子目录视为同一产物命名空间：

| 原路径 | 新路径 | 分类 |
|---|---|---|
| `docs/ae/brainstorms/**` | `ae/brainstorms/**` | 需求文档 |
| `docs/ae/plans/**` | `ae/plans/**` | 计划文档 |
| `docs/ae/work/**` | `ae/work/**` | 工作上下文 |
| `docs/ae/review/**` | `ae/review/**` | 旧 artifact-store 审查目录 |
| `docs/ae/reviews/**` | `ae/reviews/**` | 审查运行产物 |
| `docs/ae/gates/**` | `ae/gates/**` | 门禁证明 |
| `docs/ae/handoffs/**` | `ae/handoffs/**` | worktree 交接 |
| `docs/ae/graphs/**` | `ae/graphs/**` | 知识图谱 |
| `docs/ae/ideation/**` | `ae/ideation/**` | 创意文档 |
| `docs/ae/solutions/**` | `ae/solutions/**` | 经验库 |
| `docs/ae/work-reports/**` | `ae/work-reports/**` | 工作报告 |
| `.opencode/ae/agent-browser-proof.json` | `ae/agent-browser-proof.json` | 环境证明 |
| `.opencode/ae/screenshot/**` | `ae/screenshot/**` | 浏览器截图 |
| `.opencode/ae/static-server/**` | `ae/static-server/**` | 静态服务状态与日志 |

### 关键决策
- D1. 使用 `ae/` 作为唯一用户侧 AE 产物根 → 理由: 用户明确要求根目录 `ae`，同时可以统一文档、图谱、证明和运行产物。
- D2. 不提供旧路径兼容读取 → 理由: 用户要求“不是修改现有产物路径”且彻底移除兼容环境证明或配置；保留兼容会继续扩大路径双写和门禁歧义。
- D3. 不迁移、不改名、不改路径 `.opencode/ae.jsonc`，并继续将其作为本轮图谱 include/exclude 配置读写目标 → 理由: 用户明确说明 `ae.jsonc` 是配置文件，不是产出物，不应该迁移也不应该修改路径；`.opencode/ae.jsonc` 是同级项目配置，不在 `.opencode/ae/**` 子目录内。
- D4. Worktree 同步按优先级白名单复制 → 理由: `ae/` 将同时包含可复用文档、派生图谱、运行证明、审查和门禁，整体复制会误带不可复用状态。
- D5. `setup-proof.json` 不进入新路径 → 理由: 当前真源已使用 `agent-browser-proof.json`，旧 setup proof 应彻底移除而非迁移。
- D6. 图谱过滤建议基于“本次 target/scopeRoot 内真实参与构建的文件范围”而非全仓库静态猜测 → 理由: 全量构建、增量构建和子目录 target 的有效文件集合不同，只对本次会被解析或候选过滤的文件提出扩展名和路径段过滤建议，能减少无关确认和错误配置。
- D7. 现有产物采用一次性物理迁移，不做运行时兼容 → 理由: 用户明确要求迁移现有文件且提示词或代码不兼容过往目录；保留旧目录发现或自动迁移逻辑会违背重构目标。

## 专项设计

### Worktree 同步优先级
| 优先级 | 新路径 | 是否同步 | 说明 |
|---|---|---:|---|
| P0 | `ae/handoffs/*-worktree-handoff.md` | 是 | A→B 续执行唯一必需入口，由工具写入目标 worktree |
| P1 | `ae/brainstorms/*-requirements.md` | 是 | 当前任务需求基线，必须显式选择唯一相关文件 |
| P1 | `ae/plans/*-plan.md` | 是 | 当前任务计划基线，必须显式选择唯一相关文件 |
| P1 | 当前任务设计文档 | 是 | 仅同步真实存在且进入执行基线的设计文档 |
| P2 | `ae/graphs/graph.json`、`ae/graphs/version-*/chunk-*.json`、`ae/graphs/version-*/indexes/**`、`ae/graphs/index.html`、`ae/graphs/assets/**` | 建议 | 可复用派生图谱，进入 B 后允许增量更新；复制 P2/P3 目录前必须先应用 N0 排除 |
| P2 | `ae/solutions/**` | 建议 | 组织经验库，计划和审查可复用 |
| P3 | `ae/ideation/**` | 按需 | 仅当当前计划依赖创意背景时同步 |
| P3 | `ae/work/**` | 按需 | 仅当作为续执行基线时同步 |
| P3 | `ae/work-reports/**` | 按需 | 通常不是执行基线 |
| N0 | `ae/gates/**` | 否 | 绑定 worktree 指纹和验证状态 |
| N0 | `ae/reviews/**` | 否 | 绑定 HEAD、diff 和工作区状态，新 worktree 应重新审查 |
| N0 | `ae/agent-browser-proof.json` | 否 | 绑定 worktree fingerprint |
| N0 | `ae/screenshot/**` | 否 | 浏览器本地截图运行产物 |
| N0 | `ae/static-server/**` | 否 | 本地进程状态和日志 |
| N0 | `ae/graphs/*.lock` | 否 | 临时锁文件 |

### Git 忽略要求
迁移后必须更新项目忽略规则或提供等价防提交诊断，避免本地运行产物被误提交。至少忽略：
- `ae/gates/`
- `ae/handoffs/`
- `ae/reviews/`
- `ae/graphs/`
- `ae/agent-browser-proof.json`
- `ae/screenshot/`
- `ae/static-server/`
- `ae/graphs/*.lock`

迁移后不建议忽略：
- `ae/brainstorms/`
- `ae/plans/`
- `ae/ideation/`
- `ae/solutions/`

### 图谱构建前过滤建议流程
图谱构建工具在真正解析文件前应先得到本次构建的有效文件范围，所有范围都必须限定在当前 `target/scopeRoot` 内：
- 全量构建：枚举 `target/scopeRoot` 内被固定硬排除和 `.opencode/ae.jsonc` 图谱配置过滤后仍真实生效的全部文件。
- 增量构建：基于变更文件集合与 `target/scopeRoot` 的交集，套用固定硬排除和 `.opencode/ae.jsonc` 图谱配置后得到本次真实会参与增量解析的文件。
- 自动模式：按工具当前选择的 full/incremental 结果计算有效范围，并保持同样的 `target/scopeRoot` 限定。
- 解析前 raw 枚举阶段必须先统计 `target/scopeRoot` 内真实文件、扩展名和示例路径，再派生“候选统计集合”和“可解析文件集合”；不能直接把已按支持扩展名过滤后的解析集合当作扩展名发现真源。

有效范围得到后，工具应快速提取两类候选信息：
- 文件路径候选：真实参与构建文件的仓库相对路径，以及路径段中出现的 `tmp`、`temp`、`cache`、`coverage`、`dist`、`build`、`runs` 等高噪声目录信号。
- 扩展名候选：真实参与构建文件的所有扩展名，按扩展名统计数量并给出示例路径。

过滤建议决策规则：
- 固定硬排除列表命中的文件直接排除，不询问用户，也不允许 include 覆盖。
- 对未被固定硬排除且未被当前 `.opencode/ae.jsonc` 覆盖的扩展名候选，工具返回结构化候选摘要，交给 AI 模型判断哪些扩展名可能不应进入图谱。
- 对路径段中包含临时、缓存、构建或运行输出语义的候选路径，工具返回结构化候选摘要，交给 AI 模型判断是否应建议排除。
- AI 只能基于工具返回的真实有效范围提出建议，不得凭空添加未出现的扩展名或路径。
- 用户确认“需要排除”后，将对应规则写入 `.opencode/ae.jsonc` 的 `graph.exclude`；用户明确要求“作为 include 规则保留”时才写入 `graph.include`。普通“不排除/本次保留”不写入 `graph.include`，应记录为本次跳过或后续独立 suppressed suggestion，避免 include 反向覆盖未来 exclude。
- 写入配置前必须请求文件写入授权；未授权时只返回建议，不修改配置。
- 交互必须按扩展名和路径段分组批量确认，只展示 AI 判定为高噪声的候选；默认不修改配置，避免逐文件询问。

固定硬排除列表首版至少包含：
- 图片/光栅资源：`**/*.png`、`**/*.jpg`、`**/*.jpeg`、`**/*.gif`、`**/*.webp`、`**/*.ico`、`**/*.bmp`
- 字体：`**/*.woff`、`**/*.woff2`、`**/*.ttf`、`**/*.otf`、`**/*.eot`
- 音视频：`**/*.mp3`、`**/*.wav`、`**/*.mp4`、`**/*.webm`、`**/*.mov`、`**/*.avi`
- 压缩包：`**/*.zip`、`**/*.tar`、`**/*.gz`、`**/*.tgz`、`**/*.7z`、`**/*.rar`
- 可执行/二进制：`**/*.exe`、`**/*.dll`、`**/*.so`、`**/*.dylib`、`**/*.bin`
- 缓存/临时：`**/*.tmp`、`**/*.log`、`**/*.tsbuildinfo`

不进入固定硬排除、但应作为默认建议排除候选的类型至少包含：`**/*.svg`、`**/*.jar`、`**/*.class`。这些文件可能携带真实依赖关系，允许用户通过精确 include 保留。

## 实现单元

### U0. 一次性迁移现有 AE 产物文件
- [ ] 目标: 将当前仓库已有 `docs/ae/**` 与 `.opencode/ae/**` 产物物理移动到 `ae/**` 对应目录，作为后续代码和提示词切换到新路径的基线。
- [ ] 覆盖需求: R7
- [ ] 依赖: 无
- [ ] 文件:
  - `docs/ae/**`
  - `.opencode/ae/**`
  - `ae/**`
- [ ] 方法:
  - 在执行前枚举旧目录真实文件清单，按路径映射移动到 `ae/**`：`docs/ae/<subdir>/**` → `ae/<subdir>/**`，`.opencode/ae/<name>` → `ae/<name>`。
  - 不迁移、不改名、不改路径 `.opencode/ae.jsonc`，因为它是同级项目配置，不是产出物，不属于 `.opencode/ae/**` 运行产物。
  - 如存在 `.opencode/ae/setup-proof.json`，将其作为已废弃证明删除或纳入 U7 清理，不迁移到 `ae/**`。
  - 冲突处理必须显式失败并要求人工决策，不得自动覆盖 `ae/**` 已存在文件。
  - 迁移完成后删除空的旧产物目录；如旧目录仍有未迁移文件，必须列出原因并阻断交付。
  - 不在运行时代码中添加旧目录自动迁移、兼容读取或双写逻辑。
- [ ] 新契约验收:
  - 当前仓库产物真源只位于 `ae/**`；旧 `docs/ae/**` 和 `.opencode/ae/**` 目录不再承载 AE 产物。
  - `.opencode/ae.jsonc` 保留原位作为配置入口，不被视为迁移失败；任何代码、提示词或迁移脚本不得要求将它改到 `ae/` 下。
- [ ] 测试/验证方式:
  - 文件系统验证：旧产物文件均移动到对应 `ae/**` 目录。
  - 静态扫描：除迁移计划文档和负例测试外，运行时源码不再引用旧产物目录。
- [ ] 回滚信号:
  - 迁移后发现同名冲突、丢失文件、旧目录仍有未解释文件，必须停止后续实现并恢复到迁移前文件清单。

### U1. 统一 AE 产物根路径常量
- [ ] 目标: 将代码中的用户侧 AE 产物根从 `docs/ae` 统一改为 `ae`，并减少硬编码。
- [ ] 覆盖需求: R1, R5, R7
- [ ] 依赖: U0
- [ ] 文件:
  - `src/schemas/docs-ae-paths.ts`
  - `src/services/artifact-store.ts`
  - `src/services/gate-service.ts`
  - `src/services/worktree-handoff-generator.ts`
- [ ] 方法:
  - 将 `DOCS_AE_ROOT` 改为 `ae`，并更新注释说明为 AE 产物根路径。
  - 保留或重命名 `docsAePath()` 需要权衡；最小修改可保留函数名但更新注释，避免大范围无意义重命名。
  - 移除 `artifact-store.ts` 中 `join(repoRoot, 'docs', 'ae', ...)` 硬编码，改为统一路径常量。
  - 确认 gate、handoff 通过常量自动落到 `ae/gates`、`ae/reviews`、`ae/handoffs`。
  - 删除旧路径默认发现和回退逻辑；如发现旧路径输入，仅作为错误路径拒绝，不自动读取。
- [ ] 新契约验收:
  - 新代码只生成和发现 `ae/**`，不读取 `docs/ae/**` 作为兼容来源。
- [ ] 需遵循的模式:
  - `src/schemas/docs-ae-paths.ts` 是当前路径集中真源。
  - 最小修改优先，避免为了命名洁癖扩大 diff。
- [ ] 测试场景:
  - 正常路径: artifact discovery 能读取 `ae/brainstorms` 和 `ae/plans`。
  - 边界情况: 目录不存在时仍返回空候选而非抛错。
  - 错误路径: 无效 gate/review/handoff 路径继续被阻断。
  - 集成场景: `ae-gate` final proof 写入 `ae/gates`。
- [ ] 验证:
  - `npx vitest run tests/services/gate-service.test.ts tests/services/worktree-handoff-generator.test.ts`
  - `npm run typecheck`

### U2a. 迁移图谱生成、查询和存储路径
- [ ] 目标: 将图谱产物从 `docs/ae/graphs/**` 改为 `ae/graphs/**`，并更新图谱自排除规则。
- [ ] 覆盖需求: R1
- [ ] 依赖: U0, U1
- [ ] 文件:
  - `src/tools/ae-graph-build.tool.ts`
  - `src/tools/ae-graph-query.tool.ts`
  - `src/services/graph-storage-service.ts`
  - `src/services/graph-parse-service.ts`
  - `src/assets/skills/ae-graph-build/SKILL.md`
  - `src/assets/skills/ae-graph-query/SKILL.md`
- [ ] 方法:
  - 将 `copyGraphPreview()` 目标从硬编码 `docs/ae/graphs` 改为统一 `ae/graphs`。
  - 将 graph storage 中硬编码 `docs/ae/graphs` 改为统一路径。
  - 更新图谱自排除规则，避免 `ae/graphs` 被纳入扫描。
  - 更新工具描述和技能文案中的图谱路径。
  - 保持 `graph.json`、`version-*/chunk-*.json`、`version-*/indexes/**`、`index.html`、`assets` 结构不变。
- [ ] 需遵循的模式:
  - 图谱是派生产物，不作为源码真源。
  - 图谱空结果不能替代真实文件读取。
- [ ] 测试场景:
  - 正常路径: 构建后输出 `ae/graphs/graph.json` 和预览页。
  - 边界情况: 构建排除 `ae/graphs/**` 自身。
  - 错误路径: 图谱缺失时 query 返回可恢复诊断。
  - 集成场景: worktree 同步只同步允许的图谱文件清单，不同步 lock 文件。
- [ ] 验证:
  - `npx vitest run tests/tools/ae-graph-build.tool.test.ts tests/tools/ae-graph-query.tool.test.ts tests/services/graph-parse-service.test.ts`
  - `npm run typecheck`

### U2b. 实现图谱有效文件范围和固定硬排除
- [ ] 目标: 在解析前得到当前 `target/scopeRoot` 内的 raw 文件枚举、候选统计集合和可解析文件集合，并集中维护固定硬排除规则。
- [ ] 覆盖需求: R6
- [ ] 依赖: U2a
- [ ] 文件:
  - `src/services/graph-filter-suggestion-service.ts`
  - `src/services/graph-parse-service.ts`
  - `tests/services/graph-filter-suggestion-service.test.ts`
- [ ] 方法:
  - 固定服务文件名为 `graph-filter-suggestion-service.ts`，集中维护硬排除规则、target 范围限定、raw 文件枚举、扩展名统计和路径段候选摘要。
  - `graph-parse-service.ts` 只消费过滤结果或共享过滤服务，不复制硬排除规则。
  - 全量模式统计 `target/scopeRoot` 内全部真实生效文件；增量模式先将变更集合与 `target/scopeRoot` 求交。
  - include 不能覆盖固定硬排除；`svg`、`jar`、`class` 只作为建议排除候选，不作为不可覆盖硬排除。
- [ ] 需遵循的模式:
  - 工具层不承载过滤业务规则。
  - 图谱候选统计不等同于最终可解析文件集合。
- [ ] 测试场景:
  - 正常路径: 全量模式输出 target 内扩展名统计和示例路径。
  - 边界情况: 增量模式只统计 target 内变更文件。
  - 错误路径: 固定硬排除命中文件不会进入候选统计或可解析集合。
  - 集成场景: include 不能覆盖固定硬排除。
- [ ] 验证:
  - `npx vitest run tests/services/graph-filter-suggestion-service.test.ts tests/services/graph-parse-service.test.ts`
  - `npm run typecheck`

### U2c. 实现图谱过滤建议交互和配置写入
- [ ] 目标: 基于 U2b 的候选摘要由 AI 判断高噪声扩展名和路径段，批量询问用户，并在授权后写入 `.opencode/ae.jsonc` 的 `graph.exclude` 或明确 include 规则。
- [ ] 覆盖需求: R6
- [ ] 依赖: U2b
- [ ] 文件:
  - `src/tools/ae-graph-build.tool.ts`
  - `src/services/graph-config-service.ts`
  - `src/services/graph-filter-suggestion-service.ts`
  - `tests/tools/ae-graph-build.tool.test.ts`
  - `tests/services/graph-config-service.test.ts`
  - `tests/services/graph-filter-suggestion-service.test.ts`
- [ ] 方法:
  - `ae-graph-build.tool.ts` 只负责参数解析、权限确认、用户确认和服务编排。
  - 用户确认排除时写入 `.opencode/ae.jsonc` 的 `graph.exclude`。
  - 只有用户明确要求“作为 include 规则保留”时写入 `graph.include`；普通“不排除/本次跳过”不写 include。
  - 按扩展名和路径段分组批量确认，只展示 AI 判定为高噪声的候选，默认不修改配置。
  - 写入配置前沿用现有配置写授权流程。
- [ ] 需遵循的模式:
  - `.opencode/ae.jsonc` 是本轮唯一配置写入目标，路径保持不变。
  - AI 只能基于工具返回的真实候选提出建议。
- [ ] 测试场景:
  - 正常路径: 用户确认排除写入 `graph.exclude`。
  - 边界情况: 用户选择本次跳过时不写入 `graph.include`。
  - 错误路径: 未授权写配置时仅返回建议，不修改配置。
  - 集成场景: 已配置覆盖的候选不重复询问。
- [ ] 验证:
  - `npx vitest run tests/tools/ae-graph-build.tool.test.ts tests/services/graph-config-service.test.ts tests/services/graph-filter-suggestion-service.test.ts`
  - `npm run typecheck`

### U3. 迁移 `.opencode/ae/**` 运行产物到 `ae/**`
- [ ] 目标: 将 agent-browser 环境证明、截图、静态服务器状态和日志迁移到根目录 `ae/**`。
- [ ] 覆盖需求: R2, R7
- [ ] 依赖: U0, U1
- [ ] 文件:
  - `src/services/agent-browser-proof-service.ts`
  - `src/tools/ae-agent-browser-proof.tool.ts`
  - `src/assets/skills/ae-agent-browser/SKILL.md`
  - `src/assets/skills/ae-agent-browser/references/environment-proof.md`
  - `src/assets/rules/setup-gate-rule.md`
  - `src/assets/skills/ae-test-browser/SKILL.md`
  - `src/assets/skills/ae-test-browser/references/login-detection.md`
  - `src/assets/skills/ae-static-server/SKILL.md`
  - `src/assets/agents/workflow/design-iterator.md`
  - `src/assets/agents/workflow/figma-design-sync.md`
- [ ] 方法:
  - 将 proof 目录常量从 `.opencode/ae` 改为 `ae`，最终路径为 `ae/agent-browser-proof.json`。
  - 更新 proof 工具授权 pattern、metadata target 和错误提示。
  - 将截图目录从 `.opencode/ae/screenshot/` 改为 `ae/screenshot/`。
  - 将静态服务登记与日志从 `.opencode/ae/static-server/` 改为 `ae/static-server/`。
  - 不把 `setup-proof.json` 迁移到 `ae/`。
  - 删除 `.opencode/ae/**` 运行产物兼容读取、兼容写入和自动迁移逻辑。
- [ ] 新契约验收:
  - agent-browser proof、截图和静态服务状态只写入 `ae/**`。
  - 旧 `.opencode/ae/**` proof 或状态文件不被接受为有效运行证据。
- [ ] 需遵循的模式:
  - 浏览器操作前仍必须先调用 `ae-agent-browser-proof action=check`。
  - `agent-browser --version` 复验不能删除。
- [ ] 测试场景:
  - 正常路径: complete 写入 `ae/agent-browser-proof.json`。
  - 边界情况: 缺 proof 时 check 返回未完成。
  - 错误路径: 缺少三条验证命令不能写 proof。
  - 集成场景: test-browser/agent 文案不再要求 `.opencode/ae/screenshot`。
- [ ] 验证:
  - `npx vitest run tests/services/agent-browser-proof-service.test.ts tests/tools/ae-agent-browser-proof.tool.test.ts tests/assets/static-server-script.test.ts`
  - `npm run typecheck`

### U4. 更新用户侧技能、命令、代理和规则文案
- [ ] 目标: 将面向用户的提示词中所有 AE 产物路径同步为 `ae/**`，避免路径真源和操作指令分裂。
- [ ] 覆盖需求: R1, R2
- [ ] 依赖: U0, U1, U2a, U2b, U2c, U3
- [ ] 文件:
  - `src/assets/skills/ae-lfg/SKILL.md`
  - `src/assets/skills/ae-brainstorm/SKILL.md`
  - `src/assets/skills/ae-brainstorm/references/requirements-capture.md`
  - `src/assets/skills/ae-plan/SKILL.md`
  - `src/assets/skills/ae-refactor/SKILL.md`
  - `src/assets/skills/ae-doc-humanize/SKILL.md`
  - `src/assets/skills/ae-doc-structure/SKILL.md`
  - `src/assets/skills/ae-review/SKILL.md`
  - `src/assets/skills/ae-review/references/*`
  - `src/assets/skills/ae-work/SKILL.md`
  - `src/assets/skills/ae-work/references/*`
  - `src/assets/skills/ae-work-report/SKILL.md`
  - `src/assets/skills/ae-save-experience/SKILL.md`
  - `src/assets/skills/ae-ideate/SKILL.md`
  - `src/assets/commands/ae-work-continue.md`
  - `src/assets/skills/ae-merge-branch/SKILL.md`
  - `src/assets/agents/review/research-reviewer.md`
- [ ] 方法:
  - 用语义替换而非盲目全局替换，区分源码仓库开发说明和用户侧产物路径。
  - 将 `docs/ae/brainstorms`、`docs/ae/plans`、`docs/ae/reviews`、`docs/ae/gates`、`docs/ae/handoffs`、`docs/ae/graphs` 等全部改为 `ae/<subdir>`。
  - 更新 `ae:plan` 自身输出文件名规则为 `ae/plans/YYYY-MM-DD-NNN-<type>-<descriptive-name>-plan.md`。
  - 更新 `ae-work-continue` 的 handoff 查找目录为 `ae/handoffs`。
  - 移除任何“如果找不到新路径则回退到 docs/ae 或 .opencode/ae”的用户指令。
- [ ] 需遵循的模式:
  - 面向插件用户的能力不得引用当前源码仓库 `docs/ae` 作为通用前提。
  - 不修改 `dist/`。
- [ ] 测试场景:
  - 正常路径: 文案检查不再出现用户侧旧 `docs/ae` 产物路径。
  - 边界情况: 允许历史说明或本计划文档中描述旧路径，但 `src/assets` 用户侧真源不得残留旧指令。
  - 错误路径: 不得出现 `setup-proof` 旧入口。
  - 集成场景: help/catalog 展示的新路径与工具行为一致。
- [ ] 验证:
  - `rg -n "docs/ae|setup-proof|ae-setup-proof|setup-proof\.json|ae:setup|/ae-setup" src/assets`
  - `rg -n "\.opencode/ae/" src/assets`
  - `npx vitest run tests/assets/ae-work-artifact-text.test.ts tests/assets/ae-work-worktree-text.test.ts`

### U5. 更新 Worktree A→B 同步和交接规则
- [ ] 目标: 将 A→B 交接路径改为 `ae/handoffs/**`，并按同步优先级同步需要同步的文件。
- [ ] 覆盖需求: R1, R4
- [ ] 依赖: U1, U2a, U4
- [ ] 文件:
  - `src/services/worktree-handoff-generator.ts`
  - `src/tools/ae-worktree-handoff.tool.ts`
  - `src/assets/skills/ae-work/SKILL.md`
  - `src/assets/skills/ae-work/references/startup-and-worktree-workflow.md`
  - `src/assets/skills/ae-work/references/shipping-workflow.md`
  - `src/assets/skills/ae-work/references/input-routing-workflow.md`
  - `src/assets/commands/ae-work-continue.md`
  - `src/assets/skills/ae-merge-branch/SKILL.md`
- [ ] 方法:
  - 修改交接文件生成路径为 `ae/handoffs/<timestamp>-worktree-handoff.md`。
  - 更新工具参数描述中的需求、计划、图谱、交接路径示例。
  - 明确同步白名单：P0/P1 必须同步，P2 建议同步，P3 按需同步，N0 禁止同步。
  - 禁止按 `ae/**` glob 批量复制；每个迁移产物必须真实存在并在交接文件中显式记录。
  - 复制任何 P2/P3 目录前必须先应用 N0 排除；图谱同步只复制允许清单，不能复制 `ae/graphs/*.lock`。
  - 保留 `.opencode/ae.jsonc` 为可选项目级配置，说明它不属于 `.opencode/ae/**` 运行产物，本轮不迁移、不改路径，也不作为 handoff 产物同步。
- [ ] 需遵循的模式:
  - A 会话创建 B worktree 后不得继续实现。
  - 交接 Markdown 必须由工具生成，不得自行拼接。
- [ ] 测试场景:
  - 正常路径: handoff 生成到 `ae/handoffs`。
  - 边界情况: 未传入的可选上下文不出现在交接文件。
  - 错误路径: `source_session_id=unavailable` 且无 `session_evidence` 失败。
  - 集成场景: B 续执行以 `ae/handoffs/*-worktree-handoff.md` 作为入口。
- [ ] 验证:
  - `npx vitest run tests/services/worktree-handoff-generator.test.ts tests/tools/ae-worktree-handoff.tool.test.ts tests/assets/ae-work-worktree-text.test.ts`

### U6. 更新门禁、审查和恢复路径校验
- [ ] 目标: 使 gate/review/recovery 只接受和生成 `ae/**` 下的新产物路径。
- [ ] 覆盖需求: R1, R2, R4, R7
- [ ] 依赖: U1, U4, U5
- [ ] 文件:
  - `src/services/gate-service.ts`
  - `src/tools/ae-gate.tool.ts`
  - `src/services/recovery-service.ts`
  - `src/tools/ae-recovery.tool.ts`
  - `src/assets/skills/ae-review/SKILL.md`
  - `src/assets/skills/ae-review/references/*`
- [ ] 方法:
  - gate proof 写入 `ae/gates`。
  - review metadata path 校验改为 `ae/reviews/<run-id>/metadata.json`。
  - handoff path 校验改为 `ae/handoffs/*-worktree-handoff.md`。
  - latest requirements/plan 查找改为 `ae/brainstorms` 和 `ae/plans`。
  - recovery 查询和恢复建议改为新路径。
  - 旧 `docs/ae/**` review/gate/handoff/plan/requirements 路径作为错误路径拒绝，不作为恢复兜底。
- [ ] 新契约验收:
  - gate/review/recovery 不接受旧目录作为有效新流程证据。
- [ ] 需遵循的模式:
  - gate proof 是本地机器证明，不跨 worktree 复用。
  - review 绑定 worktree 指纹，新 worktree 不复用旧审查作为通过证据。
- [ ] 测试场景:
  - 正常路径: final gate 写入 `ae/gates`。
  - 边界情况: B 续执行无 `plan_path` 但有有效 `ae/handoffs` 文件可作为基线。
  - 错误路径: 传旧 `docs/ae/reviews` metadata path 应被拒绝。
  - 集成场景: review report path 能被 gate 引用。
- [ ] 验证:
  - `npx vitest run tests/services/gate-service.test.ts tests/tools/ae-gate.tool.test.ts tests/services/recovery-service.test.ts`

### U7. 移除旧 setup-proof 兼容语义
- [ ] 目标: 确保 `setup-proof.json`、`ae-setup-proof`、`ae:setup`、`/ae-setup` 不在 `src/` 真源中作为可用能力、兼容证明或兜底路径存在。
- [ ] 覆盖需求: R3
- [ ] 依赖: U3, U4
- [ ] 文件:
  - `src/tools/index.ts`
  - `src/schemas/ae-asset-schema.ts`
  - `src/services/agent-browser-proof-service.ts`
  - `src/assets/rules/setup-gate-rule.md`
  - `src/assets/skills/ae-agent-browser/**`
  - `tests/**`
- [ ] 方法:
  - 全量扫描 `src/` 和 `tests/`，删除旧 setup proof 相关注册、说明、测试和兼容分支。
  - 保留 `agent-browser-proof.json` 唯一路径和 `ae-agent-browser-proof` 唯一工具。
  - 不添加旧路径迁移提示或自动读取旧 proof。
  - 若测试或快照仍引用旧入口，改为断言不存在。
- [ ] 需遵循的模式:
  - 旧运行环境暴露的工具不等于当前 `src/` 真源。
  - 不手工修补 `dist/`。
- [ ] 测试场景:
  - 正常路径: help/catalog 不暴露旧 setup 入口。
  - 边界情况: 存在旧 `.opencode/ae/setup-proof.json` 时不被接受为 proof。
  - 错误路径: 新 proof 缺失时必须要求 `ae:agent-browser`，不能提示 `ae:setup`。
  - 集成场景: 浏览器消费方只检查 `ae-agent-browser-proof`。
- [ ] 验证:
  - `rg -n "setup-proof|ae-setup-proof|setup-proof\.json|ae:setup|/ae-setup" src tests`
  - `npx vitest run tests/services/agent-browser-proof-service.test.ts tests/tools/ae-agent-browser-proof.tool.test.ts tests/services/command-registration.test.ts`

### U8. 更新测试、构建和发布前扫描
- [ ] 目标: 用测试和静态扫描锁定新路径，避免 `docs/ae`、`.opencode/ae/` 运行产物、`setup-proof` 回归，同时允许项目级 `.opencode/ae.jsonc` 作为配置入口。
- [ ] 覆盖需求: R1, R2, R3, R4, R5, R6, R7
- [ ] 依赖: U0, U1, U2a, U2b, U2c, U3, U4, U5, U6, U7
- [ ] 文件:
  - `tests/services/agent-browser-proof-service.test.ts`
  - `tests/tools/ae-agent-browser-proof.tool.test.ts`
  - `tests/services/graph-config-service.test.ts`
  - `tests/services/graph-filter-suggestion-service.test.ts`
  - `tests/tools/ae-graph-build.tool.test.ts`
  - `tests/tools/ae-graph-query.tool.test.ts`
  - `tests/services/graph-parse-service.test.ts`
  - `tests/services/gate-service.test.ts`
  - `tests/services/worktree-handoff-generator.test.ts`
  - `tests/tools/ae-worktree-handoff.tool.test.ts`
  - `tests/assets/ae-work-artifact-text.test.ts`
  - `tests/assets/ae-work-worktree-text.test.ts`
  - `tests/assets/static-server-script.test.ts`
  - `tests/services/command-registration.test.ts`
- [ ] 方法:
  - 更新测试夹具和断言到 `ae/**`。
  - 增加一次性文件迁移验证：旧产物文件被移动到 `ae/**`，旧目录不再作为运行时来源。
  - 增加图谱有效文件范围测试：全量模式统计 target 内全部真实生效文件，增量模式只统计 target 内变更后真实生效文件。
  - 增加固定硬排除测试：图片、可执行文件、字体、压缩包等默认排除，include 不得覆盖。
  - 增加过滤建议写入测试：用户确认排除写入 `graph.exclude`，普通保留不写 `graph.include`，明确 include 才写入 `graph.include`。
  - 增加或调整静态文本测试，确保用户侧 `src/assets` 不再指导生成 `docs/ae/**` 或 `.opencode/ae/**` 运行产物。
  - 增加 `.gitignore` 或等价防提交诊断测试，确保本地运行产物不会被误提交。
  - 增加 setup-proof 禁止残留测试或命令注册测试。
  - 运行构建刷新 `dist/`，但不手工编辑 `dist/`。
- [ ] 需遵循的模式:
  - 测试文件中文描述。
  - 禁止使用 `any` 和非空断言。
- [ ] 测试场景:
  - 正常路径: 新产物路径测试全部通过。
  - 边界情况: 旧路径输入被拒绝或不再作为默认发现路径；测试中的旧路径字符串仅允许出现在负例夹具或断言中。
  - 错误路径: setup-proof 不被接受；硬排除命中文件不会进入图谱构建。
  - 集成场景: build 后分发资产与 `src/` 真源一致。
- [ ] 验证:
  - `npm run typecheck`
  - `npx vitest run tests/services/agent-browser-proof-service.test.ts tests/tools/ae-agent-browser-proof.tool.test.ts`
  - `npx vitest run tests/tools/ae-graph-build.tool.test.ts tests/tools/ae-graph-query.tool.test.ts tests/services/graph-parse-service.test.ts`
  - `npx vitest run tests/services/graph-config-service.test.ts tests/services/graph-filter-suggestion-service.test.ts`
  - `npx vitest run tests/services/gate-service.test.ts tests/services/worktree-handoff-generator.test.ts tests/tools/ae-worktree-handoff.tool.test.ts`
  - `npx vitest run tests/assets/ae-work-artifact-text.test.ts tests/assets/ae-work-worktree-text.test.ts tests/assets/static-server-script.test.ts tests/services/command-registration.test.ts`
  - `npm run build`
  - `rg -n "docs/ae|setup-proof|ae-setup-proof|setup-proof\.json|ae:setup|/ae-setup" src/assets src/tools src/services src/schemas tests --glob "!**/*negative*"`
  - `rg -n "\.opencode/ae/" src/assets src/tools src/services src/schemas tests --glob "!**/*negative*"`
  - `rg -n "['\"]docs['\"]\s*,\s*['\"]ae['\"]|['\"]\.opencode['\"]\s*,\s*['\"]ae['\"]" src/tools src/services src/schemas tests --glob "!**/*negative*"`

## 风险与应对
| 风险 | 影响 | 应对措施 |
|------|------|----------|
| 旧路径残留在提示词中 | 用户继续生成 `docs/ae/**` 或 `.opencode/ae/**` 运行产物 | 增加资产文本扫描测试，执行最终 `rg`；显式允许 `.opencode/ae.jsonc` 项目级配置 |
| 路径常量名称仍叫 `docsAePath` | 命名和语义不一致 | 本轮可保留最小修改；后续单独重命名，不阻断行为 |
| `.opencode/ae.jsonc` 被误当作运行产物迁移或改路径 | 图谱配置路径、授权提示和测试断言分裂 | 本计划明确不迁移、不改名、不改路径同级配置；`.opencode/ae.jsonc` 继续作为本轮唯一图谱配置写入目标 |
| Worktree 同步过宽 | 误带 gate/review/proof/static-server 状态 | 使用同步优先级白名单，不允许 `ae/**` 整体复制 |
| 移除旧 setup proof 影响旧用户 | 旧 proof 失效，需要重新验证 | 明确只支持 `ae-agent-browser-proof`，失败时引导运行 `ae:agent-browser` |
| 图谱迁移后自引用扫描 | `ae/graphs` 被纳入图谱导致噪声和膨胀 | 更新 hard exclude 和测试覆盖 |
| 图谱过滤建议过度依赖 AI 猜测 | 错误排除源码文件或重复打扰用户 | 工具只提供 target 内真实有效范围中的扩展名和路径段候选；按组批量确认；最终写配置前必须用户确认 |
| 固定硬排除被 include 覆盖 | 图片、可执行文件等进入图谱造成噪声和性能问题 | 硬排除优先级高于 include，并用测试锁定；存在依赖价值的 SVG/JAR/CLASS 不进硬排除 |
| `graph.include` 被用于记录普通保留决策 | 后续 exclude 被反向覆盖，配置膨胀 | 普通“不排除/本次跳过”不写 include；仅用户明确要求 include 覆盖时写入 |
| 本地运行产物进入 Git | proof、截图、静态服务状态、gate/review 等被误提交 | 将忽略规则或等价防提交诊断列为必做验证 |
| 只改源码未构建 | `dist/` 分发面仍旧 | 最终必须运行 `npm run build` |

## 待定问题

### 推迟到执行
- Q1. 是否新增自动化文本扫描测试的具体测试文件位置，由执行阶段根据现有测试结构选择。
- Q2. 图谱过滤建议是否需要新增工具参数控制交互强度，例如 `filterSuggestionMode: off|summary|ask`，由执行阶段在不增加复杂度的前提下判断。

## 等价性检查
- implementationUnitsCount: 11
- tracedRequirementsCount: 7
- decisionsCount: 7
- risksCount: 11
