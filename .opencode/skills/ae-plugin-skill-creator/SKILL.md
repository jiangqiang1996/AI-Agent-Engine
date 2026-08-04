---
name: ae-plugin-skill-creator
description: 用于创建或更新 AE 插件内置技能，要求遵守 ae:skill-creator 约定和本仓库内置技能注册结构。
---

# AE 插件内置技能创建与更新器

使用本技能帮助维护 `ai-agent-engine` 源码仓库中的 AE 内置技能。它是当前仓库项目级 OpenCode 技能，不是 AE 插件内置技能，也不面向普通下游项目分发。

## 适用场景

- 用户要求为 AE 插件新增内置技能。
- 用户要求更新 `src/assets/skills/` 下既有 AE 内置技能的职责、流程、边界或验证方式。
- 用户要求同步内置技能的 catalog、命令注册、模型路由或结构校验。
- 用户明确要求创建的技能需要同时遵守 `ae:skill-creator` 和当前 AE 插件内置技能结构。

## 不适用场景

- 创建普通项目级或全局级 OpenCode 技能；这类任务使用 `ae:skill-creator`。
- 从当前会话沉淀技能；这类任务使用 `ae:skill-creator --from-session`。
- 创建或更新 OpenCode 代理；这类任务使用 `ae:agent-creator`。

## 范围边界

- 本技能自身路径：`.opencode/skills/ae-plugin-skill-creator/SKILL.md`。
- 本技能只服务当前 `ai-agent-engine` 源码仓库，不写入 `src/assets/skills/` 作为可分发内置能力。
- 被创建的 AE 内置技能路径：`src/assets/skills/<ae-skill-slug>/SKILL.md`。
- 被创建的 AE 内置技能名使用 `ae:<name>`，目录名使用对应的 `ae-<name>`。
- 被创建的 AE 内置命令默认由 `src/services/ae-catalog.ts` 生成，不额外创建 `src/assets/commands/<name>.md` 覆盖文件，除非确实需要自定义命令模板。
- 资产名称真源是 `src/schemas/ae-asset-schema.ts` 中的 `SKILL` 和 `COMMAND` 常量。
- catalog 真源是 `src/services/ae-catalog.ts`，新增内置技能必须添加 `PHASE_ONE_ENTRIES` 条目。
- 命令模型场景真源是 `src/services/asset-model-routing-catalog.ts`，新增内置命令必须添加 `COMMAND_SCENARIOS` 条目。
- 不把 `src/`、`dist/`、`.opencode/plugins/` 或本仓库构建命令写成普通下游项目要求；这些只属于 AE 插件源码维护语境。

## 输入处理

1. 识别用户是新增内置技能、更新内置技能，还是只需要解释结构。
2. 未明确创建目标时必须询问：新增内置技能、更新内置技能，或为既有内置技能补充自定义命令模板；不要把普通项目级技能的“只创建命令”模式套用到 AE 内置技能。
3. 将被创建的内置技能名规范化为 `ae:<lower-kebab>`，目录名规范化为 `ae-<lower-kebab>`；发现空格、大写、下划线、点号或路径片段时先要求确认或改名。
4. 读取 `ae:skill-creator` 当前 `SKILL.md`，继承仍适用的 OpenCode 原生技能结构要求。
5. 读取相近的内置技能、`ae-asset-schema.ts`、`ae-catalog.ts` 和模型路由文件，确认当前仓库结构后再编辑。

## 创建流程

1. 确认目标 `src/assets/skills/<slug>/SKILL.md` 不存在；若存在，转入更新流程，不覆盖。
2. 新建内置技能 `SKILL.md`，frontmatter 至少包含 `name`、`description` 和必要时的 `argument-hint`。
3. 正文必须包含目标或角色、适用场景、输入处理、执行流程、边界、输出要求和验证方式。
4. 在 `src/schemas/ae-asset-schema.ts` 中新增 `SKILL` 常量；`COMMAND` 由 `SKILL_COMMANDS` 派生时不手写重复命令名。
5. 在 `AeSkillNameSchema` 枚举中同步新增技能。
6. 在 `src/services/ae-catalog.ts` 添加 catalog 条目，保持同文件既有分组风格和技能发现顺序。
7. 在 `src/services/asset-model-routing-catalog.ts` 为命令添加模型场景；创建、更新、维护类技能通常使用 `standard`，规划、审查、执行类使用 `deep`。
8. 仅当用户明确要求自定义命令模板，或默认 catalog 包装无法表达必要流程时，才创建 `src/assets/commands/<command>.md`；命令 frontmatter 默认包含 `subtask`（布尔值，默认 `false`）和 `model` 场景变量（`$quick` 查询帮助类、`$standard` 创建交互类、`$deep` 规划审查执行类、`$vision` 浏览器视觉类、`$audio` 音频识别类、`$video` 视频识别类），命令正文必须保留 `$ARGUMENTS`。
9. 补充或更新相关测试，至少覆盖 schema 接受新技能、catalog 可发现和模型路由。

## 更新流程

1. 先读取既有 `SKILL.md`、catalog 条目、schema 常量和模型路由。
2. 列出 frontmatter 变化、正文结构变化、命令注册变化、模型路由变化和测试变化。
3. 涉及删除职责、放宽权限、增加 Git 写操作、浏览器命令或外部副作用时，必须单独确认。
4. 做最小编辑，保留仍有效的职责、流程、边界和验证要求。
5. 更新完成后检查 catalog 描述与 frontmatter description 是否一致。

## 输出要求

交付时说明：

- 创建或更新的是 AE 插件内置技能，不是普通项目级或全局级技能。
- 技能文件路径和是否存在自定义命令文件。
- 触及的 schema、catalog、模型路由和测试文件。
- 已运行的结构校验、测试、类型检查或构建命令。
- 未验证项、Git 操作状态和剩余风险。

## 验证方式

- 结构校验：`node src/assets/skills/ae-skill-creator/scripts/quick_validate.mjs src/assets/skills/<slug>`；如果创建了自定义命令文件，加 `--with-command` 或使用 `--command-file`。
- 相关测试：运行覆盖 schema、catalog、命令注册或模型路由的 Vitest 用例。
- 类型检查：涉及 TypeScript 注册链路时运行 `npm run typecheck`。
- 构建验证：涉及运行时资产复制或注册链路时优先运行 `npm run build`。

## 禁止事项

- 不把本技能自身加入 `src/assets/skills/`、`src/schemas/ae-asset-schema.ts`、`src/services/ae-catalog.ts` 或模型路由。
- 不写入 `~/.config/opencode/skills/`，除非用户明确要求全局技能并确认影响范围。
- 不把普通项目技能创建流程误写成 AE 内置技能流程。
- 不新增旧式 `ae:skill-updater` 或平行更新入口。
- 不跳过 `src/schemas/ae-asset-schema.ts`、`src/services/ae-catalog.ts` 和模型路由同步。
