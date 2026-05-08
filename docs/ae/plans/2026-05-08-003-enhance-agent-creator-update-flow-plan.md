---
type: plan
status: drafted
date: 2026-05-08
title: enhance-agent-creator-update-flow
origin: docs/ae/brainstorms/2026-05-08-agent-creator-update-flow-requirements.md
originFingerprint: 2026-05-08-agent-creator-update-flow
depth: standard
---

# 增强 Agent Creator 更新流程计划

## 背景

本计划基于 `docs/ae/brainstorms/2026-05-08-agent-creator-update-flow-requirements.md`。目标是扩展现有 `ae:agent-creator`，让它既能创建 OpenCode 原生代理，也能安全更新既有代理，同时保留稳定入口名称，不新增 `ae:agent-updater`。

当前研究结论：

- `src/assets/skills/ae-agent-creator/SKILL.md` 已在正文开头和适用场景中声明“创建或调整/更新”，但工作流仍主要指向初始化新代理。
- `docs/ae/plans/2026-05-08-002-enhance-skill-creator-update-flow-plan.md` 提供了可复用模式：保留 creator 入口，创建继续使用初始化脚本，更新通过读取旧内容、展示草案、确认后最小编辑完成。
- `src/assets/skills/ae-agent-creator/scripts/init_agent.mjs` 当前拒绝覆盖既有代理或命令，这是安全设计；本计划默认不改变脚本覆盖语义。
- `src/assets/skills/ae-agent-creator/scripts/quick_validate.mjs` 已校验代理 frontmatter、正文、弃用字段、同名命令 `agent` 绑定和 `$ARGUMENTS`，可复用于更新后结构校验。
- `src/assets/skills/ae-agent-creator/references/permission-patterns.md` 已包含权限和浏览器能力边界，应被更新流程显式引用或吸收。

## 目标

- 让 `ae:agent-creator` 明确支持“创建或更新 OpenCode 原生代理”。
- 保留技能名 `ae:agent-creator` 和命令入口 `ae-agent-creator`。
- 创建分支继续使用 `init_agent.mjs`；更新分支禁止通过初始化脚本覆盖既有文件。
- 更新既有代理时要求定位目标、读取旧内容、识别变更目标、展示草案或冲突点，并在用户确认后最小编辑。
- 覆盖项目级/全局级同名代理冲突、敏感字段变更、关联命令检查和校验失败处理。
- 明确普通代理更新不等于 AE 内置代理发布或 `ae:update` 插件更新。

## 非目标

- 不新增 `ae:agent-updater` 技能、命令、schema 常量或 catalog 条目。
- 不把 `init_agent.mjs` 改成默认覆盖或静默更新既有代理。
- 不新增 `--force`、`--update` 等覆盖式脚本参数。
- 不默认创建、重写或迁移命令；命令同步必须由用户明确要求。
- 不默认放宽 `tools`、`permission`、destructive Git、远程写操作或浏览器命令能力。
- 不要求普通用户项目存在本仓库的 `src/`、`dist/`、`.opencode/plugins/` 或 `docs/ae/` 结构。
- 不实现 AE 内置代理注册链路；涉及 `src/assets/agents/`、schema、catalog 的内置代理固化应由专门规划处理。

## 影响范围

### 必改文件

- `src/assets/skills/ae-agent-creator/SKILL.md`
- `src/services/ae-catalog.ts`

### 建议同步文件

- `src/assets/skills/ae-agent-creator/references/opencode-agent-conventions.md`
- `src/assets/skills/ae-agent-creator/references/agent-design-patterns.md`
- `src/assets/skills/ae-agent-creator/references/permission-patterns.md`

### 测试文件

- `tests/assets/asset-health.test.ts`
- `tests/services/ae-catalog.test.ts`
- `tests/schemas/ae-asset-schema.test.ts`

只有在脚本行为发生变化时才修改：

- `src/assets/skills/ae-agent-creator/scripts/init_agent.mjs`
- `src/assets/skills/ae-agent-creator/scripts/quick_validate.mjs`
- `tests/assets/agent-creator-scripts.test.ts`

## 技术设计

采用“文档流程增强优先”的方案：

1. `ae:agent-creator` 继续是单一公开入口，frontmatter、标题、描述和帮助 catalog 改为“创建或更新/调整”。
2. 创建新代理仍走 `init_agent.mjs`，并继续拒绝覆盖既有目标。
3. 更新既有代理不通过初始化脚本覆盖，而由技能流程指导 LLM 读取旧文件、整理变更草案、确认后最小编辑，再运行 `quick_validate.mjs`。
4. 未指定 scope 时同时检查项目级和全局级代理候选；创建和更新分支都必须处理同名冲突，避免项目级代理意外遮蔽全局代理。
5. 更新草案固定展示目标路径、frontmatter 变化表、正文增删摘要、删除或重写段落、敏感字段和敏感正文指令变化、命令检查结果和确认问题。
6. `mode`、`tools`、`permission`、`model`、`temperature`、`top_p`、`steps`、`hidden` 变化必须展示；其中 `mode`、`tools`、`permission` 的放宽必须单独确认。
7. destructive Git、远程写操作、浏览器命令、权限放宽和外部副作用不只看 frontmatter；如果正文新增或删除这些能力指令，也必须单独列入敏感变化确认。
8. 关联命令默认先检查同级同名命令；当代理职责、名称或输入约定变化时，再搜索同级命令目录中 `agent: <name>` 的非同名绑定并报告风险。
8. 测试重点放在资产一致性、catalog 可发现性和“不新增 updater 入口”。

此设计保持与 `ae:skill-creator` 更新计划一致的安全模型，同时覆盖代理特有的 mode、权限、工具和命令绑定风险。

## 目标解析矩阵

| 用户意图 | 项目级存在 | 全局级存在 | 默认处理 |
|---|---:|---:|---|
| 创建新代理 | 否 | 否 | 走创建分支；全局仅在明确要求时使用 |
| 创建新代理 | 否 | 是 | 列出全局同名候选，询问创建项目级影子代理、改为更新全局代理、换名或取消 |
| 创建新代理 | 是 | 任意 | 停止并询问：改为更新、换名或取消 |
| 更新代理，明确项目级 | 是 | 任意 | 读取项目级代理并进入更新草案 |
| 更新代理，明确项目级 | 否 | 是 | 告知项目级不存在，询问是否改为全局或创建 |
| 更新代理，明确全局级 | 任意 | 是 | 说明全局影响并确认后进入更新草案 |
| 更新代理，未指定 scope | 是 | 否 | 展示项目级路径并确认后更新 |
| 更新代理，未指定 scope | 否 | 是 | 展示全局路径和影响范围，确认后更新 |
| 更新代理，未指定 scope | 是 | 是 | 列出两个候选，让用户选择；选择全局时再次确认影响范围 |
| 更新代理，未指定 scope | 否 | 否 | 不自动创建；询问修正名称、切换 scope 或改为创建 |

## 实现单元

### 1. 更新 `ae-agent-creator` 主技能工作流

**目标**

让主技能文档清晰表达“创建或更新 OpenCode 原生代理”，并产出完整的创建/更新工作流。

**需求**

- 覆盖 R1、R2、R3、R4、R5、R7、R8、R9。

**文件**

- `src/assets/skills/ae-agent-creator/SKILL.md`

**方法**

- 将 frontmatter `description` 从“创建 OpenCode 原生代理……”调整为“创建或更新 OpenCode 原生代理……”或同等语义。
- 保留 `name: ae:agent-creator`，不改技能名和命令名。
- 标题改为“OpenCode 代理创建与更新器”或同等语义。
- 保留默认项目级、显式全局级、默认 `mode: subagent`、默认不创建命令的现有决策。
- 将 `SKILL.md` 工作流一次性改造成共同前置、创建分支、更新分支、命令检查、校验与交付。
- 创建分支明确 `init_agent.mjs` 只用于初始化新代理，遇到既有文件拒绝覆盖是预期行为。
- 创建分支在项目级不存在但全局级存在同名代理时，必须询问创建项目级影子代理、改为更新全局代理、换名或取消，不直接创建。
- 更新分支明确必须先定位候选 scope、读取既有代理、必要时读取关联命令、展示草案、等待明确确认、写入、校验、汇报。
- 在 `SKILL.md` 中保留足够可执行的摘要：目标解析入口、草案确认步骤、敏感变化确认、命令检查和失败处理；详细清单放入 reference 并由主技能引用。
- 明确普通代理更新不处理 AE 内置代理注册链路；需要固化为 AE 内置代理时应进入专门维护流程。

**测试场景**

- 正常路径：用户要求创建项目级代理，流程仍指向初始化脚本和项目级路径。
- 更新路径：用户要求更新既有代理，流程要求先读取旧文件并展示草案。
- 全局路径：用户要求更新全局代理，流程要求说明全局影响范围。
- 边界：文档不引导创建 `ae:agent-updater`，不把 `ae:update` 描述为代理内容更新器。
- 冲突路径：创建项目级新代理但全局同名代理存在时，流程要求用户选择而不是直接创建。

**验证**

- 搜索 `src/assets/skills/ae-agent-creator/SKILL.md` 中是否仍存在只描述创建、不覆盖更新的关键句。
- 检查 frontmatter `name` 未变化。
- 人工确认创建分支和更新分支均可从工作流直接识别，且 `SKILL.md` 明确引用支撑 reference。

### 2. 补充 reference 更新规则

**目标**

把更新流程中最容易误用的分支沉淀到 reference，作为主技能工作流的支撑说明。

**需求**

- 覆盖 R2、R3、R4、R5、R9。

**文件**

- `src/assets/skills/ae-agent-creator/references/opencode-agent-conventions.md`
- `src/assets/skills/ae-agent-creator/references/permission-patterns.md`
- `src/assets/skills/ae-agent-creator/references/agent-design-patterns.md`

**方法**

- 在 `opencode-agent-conventions.md` 中补充 scope 解析和同名候选规则：创建目标已存在、创建时全局同名已存在、更新目标不存在、未指定 scope 但同名候选存在时的默认处理。
- 在 `opencode-agent-conventions.md` 中定义更新草案最小格式：目标路径、scope、frontmatter 变化表、正文增删摘要、删除或重写段落、敏感变化、命令检查结果、确认问题。
- 在 `permission-patterns.md` 中补充敏感变化确认规则：`mode`、`tools`、`permission`、`model`、`temperature`、`top_p`、`steps`、`hidden` 的字段变化，以及正文中 destructive Git、远程写操作、浏览器命令、权限放宽和外部副作用指令变化。
- 在 `permission-patterns.md` 中明确 `mode` 扩大触发范围、`tools` 或 `permission` 放宽、destructive Git、远程写操作、浏览器能力都需要单独确认；浏览器能力仍受 `ae:setup` 当前会话前置门禁约束，不能提供绕过方式。
- 在 `agent-design-patterns.md` 中补充更新既有代理时的最小编辑原则：保留仍有效的职责边界、禁用项、工作流和输出契约，不把代理改成万能助手。
- 明确写入前保留旧内容作为会话内恢复依据；校验失败时报告失败原因，涉及语义、权限或命令绑定变化时再次确认后再修复。

**测试场景**

- 同名项目级和全局级代理同时存在：流程要求列候选并选择。
- 创建项目级新代理但全局同名代理存在：流程要求说明影子代理风险并让用户选择。
- 更新目标不存在：流程询问修正名称、切换 scope 或改为创建，不自动创建。
- `mode: subagent -> all`、权限放宽或正文新增 destructive Git 指令：流程要求单独确认。
- 校验失败：流程要求报告失败并控制后续修复范围。

**验证**

- 文本检索确认 reference 包含“同名”“候选”“草案”“敏感”“正文指令”“确认”等关键流程。
- 人工对照目标解析矩阵，确认没有自动覆盖或静默转创建路径。

### 3. 补充关联命令更新边界

**目标**

让代理更新时能发现命令入口漂移，但不把命令同步扩大为默认写操作。

**需求**

- 覆盖 R6、R7。

**文件**

- `src/assets/skills/ae-agent-creator/SKILL.md`
- `src/assets/skills/ae-agent-creator/references/opencode-agent-conventions.md`
- 视执行判断：`src/assets/skills/ae-agent-creator/references/agent-design-patterns.md`

**方法**

- 在 `SKILL.md` 中只保留关联命令检查入口和默认不自动写入的边界。
- 在 `opencode-agent-conventions.md` 中明确默认检查同级同名命令：项目级代理对应 `.opencode/commands/<name>.md`，全局级代理对应 `~/.config/opencode/commands/<name>.md`。
- 当代理职责、名称或输入约定变化时，搜索同级命令目录中 `agent: <name>` 的非同名绑定并报告风险。
- 命令存在时读取并检查 `agent: <name>`、`$ARGUMENTS`、描述是否仍匹配代理职责。
- 命令不存在时只报告“未发现同级命令”，不默认创建。
- 命令绑定错误或描述过期时默认报告风险；只有用户明确要求同步时，才展示命令草案并确认写入。
- 不跨 scope 搜索或修改命令；项目级代理只检查项目级命令目录，全局级代理只检查全局命令目录。

**测试场景**

- 代理更新但没有命令：流程不要求创建命令。
- 代理更新且同级命令存在：流程要求检查绑定和 `$ARGUMENTS`。
- 代理职责变化且存在非同名命令绑定：流程要求报告绑定入口风险。
- 命令绑定错误：流程提示风险，不自动重写。

**验证**

- 文本检索确认“默认不创建或重写命令”仍存在。
- 文本检索确认同级命令路径没有混用项目级和全局级，并说明非同名绑定只在同一 scope 内搜索。

### 4. 同步 catalog 帮助入口

**目标**

保证 `/ae-help` 和命令注册中展示的 `ae:agent-creator` 描述与 `SKILL.md` frontmatter 一致。

**需求**

- 覆盖 R1、R7。

**文件**

- `src/services/ae-catalog.ts`

**方法**

- 更新 `SKILL.AGENT_CREATOR` 对应 entry 的 `description`，与 `SKILL.md` frontmatter 语义保持一致。
- 仅在 `SKILL.md` 的 `argument-hint` 有调整时同步 `argumentHint`；否则保持现状，减少改动。
- 不新增 `SKILL.AGENT_UPDATER`、`COMMAND.AGENT_UPDATER` 或任何 catalog entry。

**测试场景**

- `/ae-help` 能继续发现 `ae:agent-creator`。
- catalog 中没有 `ae:agent-updater`。
- `ae:agent-creator` 的描述与 frontmatter 不发生测试失配。

**验证**

- 运行 `npx vitest run tests/assets/asset-health.test.ts tests/services/ae-catalog.test.ts`。

### 5. 补充最小测试断言

**目标**

用测试固定本次关键决策：增强现有 agent creator，不新增 updater 入口。

**需求**

- 覆盖 R1、R7 和成功标准中的入口稳定性。

**文件**

- `tests/services/ae-catalog.test.ts`
- `tests/schemas/ae-asset-schema.test.ts`
- 必要时：`tests/assets/asset-health.test.ts`

**方法**

- 在 catalog 测试中补充或扩展 `ae:agent-creator` entry 存在且描述包含创建和更新语义。
- 在 schema 测试中补充 `AeSkillNameSchema` 接受 `ae:agent-creator`，并拒绝 `ae:agent-updater`；`AeCommandNameSchema` 拒绝 `ae-agent-updater`。
- 如实现阶段选择用文本断言固定安全流程，在资产健康或 catalog 测试中增加轻量断言：`ae-agent-creator` 文档包含全局同名候选、敏感正文指令、默认不覆盖和不新增 updater 入口等关键短语。
- 如果已有资产健康测试已覆盖 frontmatter 与 catalog 一致性，不重复添加同类测试。
- 不修改 `agent-creator-scripts.test.ts`，除非执行阶段决定改变脚本行为。

**测试场景**

- 正常路径：`ae:agent-creator` 仍是合法技能。
- 边界：`ae:agent-updater` 不是合法内置技能或命令。
- 帮助入口：catalog 描述反映更新能力。

**验证**

- 运行 `npx vitest run tests/services/ae-catalog.test.ts tests/schemas/ae-asset-schema.test.ts`。
- 运行 `npx vitest run tests/assets/asset-health.test.ts`。

## 推迟到执行时的说明

- 如果执行阶段发现 `SKILL.md` 和 reference 文档更新即可满足需求，不要改脚本。
- 如果执行阶段发现 `quick_validate.mjs` 无法覆盖必要的命令绑定检查，优先保留人工检查流程和文本断言；只有明确需要自动校验时才规划脚本改动并补充 `tests/assets/agent-creator-scripts.test.ts`。
- 如果执行阶段考虑新增 `--update`、`--force` 或扫描所有命令绑定的脚本功能，必须先暂停并重新确认，因为这会改变当前计划的安全模型和实现范围。

## 验证计划

执行完成后至少运行：

- `npx vitest run tests/assets/asset-health.test.ts tests/services/ae-catalog.test.ts tests/schemas/ae-asset-schema.test.ts`
- `npm run typecheck`

如果修改脚本，再运行：

- `npx vitest run tests/assets/agent-creator-scripts.test.ts`

若修改范围扩大到注册、命令模板或生成逻辑，优先追加：

- `npm run test`
- `npm run build`

## 风险与缓解

- 静默覆盖风险：通过保留 `init_agent.mjs` 拒绝覆盖、更新流程要求读取旧文件和确认草案来缓解。
- 同名 scope 冲突风险：通过目标解析矩阵和全局二次确认来缓解。
- 权限放大风险：通过敏感字段变化表和 `mode`、`tools`、`permission` 单独确认来缓解。
- 命令入口漂移风险：通过同级命令检查和默认不自动重写命令来缓解。
- 入口分裂风险：通过不新增 `ae:agent-updater`、同步测试断言来缓解。
- 用户侧运行时边界泄漏风险：公开文案只使用 OpenCode 项目级和全局级路径，不把本仓库源码结构写成普通用户前提。
- 过度实现风险：默认只改文档、reference、catalog 和测试，不改脚本行为；脚本变更需执行阶段重新确认。

## 交接

下一步执行：

```bash
/ae-work docs/ae/plans/2026-05-08-003-enhance-agent-creator-update-flow-plan.md
```
