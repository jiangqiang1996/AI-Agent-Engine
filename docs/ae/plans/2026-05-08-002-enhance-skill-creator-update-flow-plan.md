---
type: plan
status: drafted
date: 2026-05-08
title: enhance-skill-creator-update-flow
origin: docs/ae/brainstorms/2026-05-08-skill-creator-update-flow-requirements.md
originFingerprint: 2026-05-08-skill-creator-update-flow
depth: standard
---

# 增强 Skill Creator 更新流程计划

## 背景

本计划基于 `docs/ae/brainstorms/2026-05-08-skill-creator-update-flow-requirements.md`。目标是扩展现有 `ae:skill-creator`，让它既能创建 OpenCode 原生技能，也能安全更新既有技能，同时保留稳定入口名称，不新增 `ae:skill-updater`。

当前研究结论：

- `src/assets/skills/ae-skill-creator/SKILL.md` 当前主要描述创建流程，缺少更新既有技能的一等入口。
- `src/assets/skills/ae-agent-creator/SKILL.md` 已采用“创建或调整”的合并模型，可作为公开入口命名和职责边界参考。
- `src/assets/skills/ae-save-session-flow/SKILL.md` 已覆盖 AE 内置技能创建或更新注册链路，因此本计划不把普通 OpenCode 技能更新扩展为 AE 内置技能注册流程。
- `src/assets/skills/ae-skill-creator/scripts/init_skill.mjs` 当前拒绝覆盖既有文件，这是安全设计；本计划默认不改变脚本覆盖语义。
- `src/assets/skills/ae-skill-creator/scripts/quick_validate.mjs` 可复用于更新后结构校验。

## 目标

- 让 `ae:skill-creator` 明确支持“创建或更新 OpenCode 原生技能”。
- 保留技能名 `ae:skill-creator` 和命令入口 `ae-skill-creator`。
- 更新既有技能时要求先读取旧内容、识别变更目标、展示草案或冲突点，并在用户确认后写入。
- 保持项目级默认、全局级显式确认、技能与命令同级的既有边界。
- 明确普通技能更新不等于 AE 内置技能发布或 `ae:update` 插件更新。

## 非目标

- 不新增 `ae:skill-updater` 技能、命令、schema 常量或 catalog 条目。
- 不把 `init_skill.mjs` 改成默认覆盖或静默更新既有技能。
- 不新增 npm 依赖、TypeScript 运行器或 Python 脚本。
- 不要求普通用户项目存在本仓库的 `src/`、`dist/`、`.opencode/plugins/` 或 `docs/ae/` 结构。
- 不实现 AE 内置技能注册链路；涉及 `src/assets/skills/`、schema、catalog 的内置技能固化仍由对应维护流程处理。

## 影响范围

### 必改文件

- `src/assets/skills/ae-skill-creator/SKILL.md`
- `src/services/ae-catalog.ts`

### 建议同步文件

- `src/assets/skills/ae-skill-creator/references/opencode-skill-conventions.md`
- `src/assets/skills/ae-skill-creator/references/command-conventions.md`

### 测试文件

- `tests/assets/asset-health.test.ts`
- `tests/services/ae-catalog.test.ts`
- `tests/schemas/ae-asset-schema.test.ts`

只有在脚本行为发生变化时才修改：

- `src/assets/skills/ae-skill-creator/scripts/init_skill.mjs`
- `src/assets/skills/ae-skill-creator/scripts/quick_validate.mjs`
- `tests/assets/skill-creator-scripts.test.ts`

## 技术设计

采用“文档流程增强优先”的方案：

1. `ae:skill-creator` 继续是单一公开入口，frontmatter、标题、描述和帮助 catalog 改为“创建或更新”。
2. 新建技能仍走 `init_skill.mjs`，并继续拒绝覆盖既有目标。
3. 更新既有技能不通过初始化脚本覆盖，而由技能流程指导 LLM 读取旧文件、整理变更草案、确认后编辑，再运行 `quick_validate.mjs`。
4. 如既有技能有关联命令，流程要求检查同级命令是否需要同步，但默认不新增命令或脚本。
5. 测试重点放在资产一致性、catalog 可发现性和“不新增 updater 入口”。

此设计避免把安全的初始化脚本扩展成覆盖工具，同时满足用户提出的“技能更新”使用场景。

## 实现单元

### 1. 更新 `ae-skill-creator` 主技能说明

**目标**

让主技能文档清晰表达“创建或更新 OpenCode 原生技能”，并给出安全更新流程。

**需求**

- 覆盖 R1、R2、R3、R4、R5、R6。

**文件**

- `src/assets/skills/ae-skill-creator/SKILL.md`

**方法**

- 将 frontmatter `description` 从“创建 OpenCode 原生技能……”调整为“创建或更新 OpenCode 原生技能……”。
- 保留 `name: ae:skill-creator`，不改技能名和命令名。
- 标题改为更准确的“OpenCode 原生技能创建与更新器”或同等语义。
- 在适用范围中加入“更新既有项目级或全局级技能”。
- 保留现有路径边界：项目级 `.opencode/skills/<name>/SKILL.md`，全局级 `~/.config/opencode/skills/<name>/SKILL.md`。
- 增加更新工作流：定位目标 scope、读取既有 `SKILL.md`、必要时读取同级命令、识别保留内容和变更点、展示草案、等待明确确认、写入、校验、汇报。
- 明确全局级更新前必须说明影响范围并获得确认。
- 明确 `init_skill.mjs` 只用于初始化新技能，遇到既有文件拒绝覆盖是预期行为。
- 明确普通技能更新不处理 AE 内置技能注册链路；需要固化为 AE 内置技能时使用相应维护流程。
- 对照 `src/assets/skills/ae-agent-creator/SKILL.md` 的“创建或调整”模型，确保 `ae:skill-creator` 也在适用场景、默认决策和工作流中同时覆盖创建与更新，而不是只在描述中追加“更新”字样。

**测试场景**

- 正常路径：用户要求创建项目级技能，流程仍指向初始化脚本和项目级路径。
- 更新路径：用户要求更新既有技能，流程要求先读取旧文件并展示草案。
- 全局路径：用户要求更新全局技能，流程要求说明全局影响范围。
- 一致性路径：文档结构能对应 `ae:agent-creator` 的合并入口模型，至少包含创建和更新两类适用场景、scope 默认决策和安全边界。
- 边界：文档不引导创建 `ae:skill-updater`，不把 `ae:update` 描述为技能内容更新器。

**验证**

- 搜索 `ae-skill-creator/SKILL.md` 中是否仍存在只描述创建、不覆盖更新的关键句。
- 检查 frontmatter `name` 未变化。
- 对照 `src/assets/skills/ae-agent-creator/SKILL.md`，人工确认合并入口模型已覆盖适用场景、scope 决策和安全边界。
- catalog/frontmatter 一致性放到实现单元 3 和最终验证中确认。

### 2. 补充 reference 中的更新约定

**目标**

让主技能可以引用更详细的更新安全边界，而不把 `SKILL.md` 写得过长。

**需求**

- 覆盖 R2、R3、R6。

**文件**

- `src/assets/skills/ae-skill-creator/references/opencode-skill-conventions.md`
- `src/assets/skills/ae-skill-creator/references/command-conventions.md`

**方法**

- 在技能规范参考中补充“更新既有技能检查清单”：保留 frontmatter `name` 与目录一致、保留或改进 `description`、不删除仍有效的执行边界、写入前展示草案。
- 在命令规范参考中补充“更新技能时的命令同步”：只有存在同级命令或用户明确要求时才同步；命令正文必须继续加载同名技能并保留 `$ARGUMENTS`。
- 避免把本仓库 `src/assets/skills/` 写作普通用户项目路径。

**测试场景**

- 更新技能但不涉及命令：reference 不要求默认新增命令。
- 更新技能且已有命令：reference 提醒检查命令描述和 `$ARGUMENTS`。
- 边界：reference 不引入 AE 内置技能注册步骤。

**验证**

- 文本检索确认没有新增 `ae:skill-updater` 入口指引。
- 文本检索确认普通用户路径仍只使用 `.opencode/skills/` 和全局 OpenCode 配置路径。

### 3. 同步 catalog 帮助入口

**目标**

保证 `/ae-help` 和命令注册中展示的 `ae:skill-creator` 描述与 `SKILL.md` frontmatter 一致。

**需求**

- 覆盖 R1、R4。

**文件**

- `src/services/ae-catalog.ts`

**方法**

- 更新 `SKILL.SKILL_CREATOR` 对应 entry 的 `description`，与 `SKILL.md` frontmatter 语义保持一致。
- 仅在 `SKILL.md` 的 `argument-hint` 有调整时同步 `argumentHint`；否则保持现状，减少改动。
- 不新增 `SKILL_UPDATER`、`COMMAND.SKILL_UPDATER` 或任何 catalog entry。

**测试场景**

- `/ae-help` 能继续发现 `ae:skill-creator`。
- catalog 中没有 `ae:skill-updater`。
- `ae:skill-creator` 的描述与 frontmatter 不发生资产健康测试失配。
- `tests/services/ae-catalog.test.ts` 能捕获 `ae:skill-creator` catalog 描述与 frontmatter 语义漂移；如果现有资产健康测试不校验 description，应在 catalog 测试中补足。

**验证**

- 运行 `npx vitest run tests/assets/asset-health.test.ts tests/services/ae-catalog.test.ts`。

### 4. 补充最小测试断言

**目标**

用测试固定本次关键决策：增强现有技能，不新增 updater 入口。

**需求**

- 覆盖 R4 和成功标准中的入口稳定性。

**文件**

- `tests/services/ae-catalog.test.ts`
- `tests/schemas/ae-asset-schema.test.ts`
- 必要时：`tests/assets/asset-health.test.ts`

**方法**

- 在 catalog 测试中补充 `ae:skill-creator` entry 存在且描述包含创建和更新语义。
- 在 schema 测试中补充 `AeSkillNameSchema` 接受 `ae:skill-creator`，并拒绝 `ae:skill-updater`。
- 如果已有资产健康测试已覆盖 frontmatter 与 catalog 一致性，不重复添加同类测试。
- 不修改 `skill-creator-scripts.test.ts`，除非执行阶段决定改变脚本行为。

**测试场景**

- 正常路径：`ae:skill-creator` 仍是合法技能。
- 边界：`ae:skill-updater` 不是合法内置技能。
- 帮助入口：catalog 描述反映更新能力。

**验证**

- 运行 `npx vitest run tests/services/ae-catalog.test.ts tests/schemas/ae-asset-schema.test.ts`。
- 运行 `npx vitest run tests/assets/asset-health.test.ts`。

## 推迟到执行时的说明

- 如果执行阶段发现 `SKILL.md` 仅需文档更新即可满足需求，不要改脚本。
- 如果执行阶段发现 `quick_validate.mjs` 无法校验更新后允许的 frontmatter 字段，优先做最小字段兼容修复，并补充 `tests/assets/skill-creator-scripts.test.ts`。
- 如果执行阶段考虑新增 `--update` 或 `--force` 参数，必须先暂停并重新确认，因为这会改变当前计划的安全模型。

## 验证计划

执行完成后至少运行：

- `npx vitest run tests/assets/asset-health.test.ts tests/services/ae-catalog.test.ts tests/schemas/ae-asset-schema.test.ts`
- `npm run typecheck`

如果修改脚本，再运行：

- `npx vitest run tests/assets/skill-creator-scripts.test.ts`

若修改范围扩大到注册、命令模板或生成逻辑，优先追加：

- `npm run test`
- `npm run build`

## 风险与缓解

- 静默覆盖风险：通过保留 `init_skill.mjs` 拒绝覆盖、更新流程要求读取旧文件和确认草案来缓解。
- 入口分裂风险：通过不新增 `ae:skill-updater`、同步测试断言来缓解。
- catalog/frontmatter 不一致风险：通过资产健康测试和 catalog 专项测试缓解。
- 用户侧运行时边界泄漏风险：公开文案只使用 OpenCode 项目级和全局级路径，不把本仓库源码结构写成普通用户前提。
- 过度实现风险：默认只改文档和 catalog，不改脚本行为；脚本变更需执行阶段重新确认。

## 交接

下一步执行：

```bash
/ae-work docs/ae/plans/2026-05-08-002-enhance-skill-creator-update-flow-plan.md
```
