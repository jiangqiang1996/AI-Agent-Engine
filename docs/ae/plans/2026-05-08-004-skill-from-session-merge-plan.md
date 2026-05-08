---
type: plan
status: drafted
date: 2026-05-08
title: skill-from-session-merge
origin: docs/ae/brainstorms/2026-05-08-skill-from-session-merge-requirements.md
originFingerprint: 2026-05-08-skill-from-session-merge
depth: standard
---

# 合并会话沉淀与资产纠偏技能计划

## 目标

新增统一技能 `ae:skill-from-session`，用于从当前会话创建或更新 OpenCode 技能；删除 `ae:save-session-flow` 与 `ae:asset-debug` 两个公开入口，不保留转发兼容。

源需求：`docs/ae/brainstorms/2026-05-08-skill-from-session-merge-requirements.md`

## 决策

- 新技能名：`ae:skill-from-session`，命令名由 schema 派生为 `ae-skill-from-session`。
- 新技能默认创建或更新项目级技能；仅用户显式要求或传入 `--global` 时转交全局级需求。
- 新技能只整理会话流程、资产纠偏证据和创建/更新需求，并调用 `ae:skill-creator`；不直接写项目级或全局技能文件。
- 新技能不生成 `-po` / `-pa` prompt optimize 变体，保持公开入口只有基础命令。
- 旧入口彻底删除：不保留 schema 常量、catalog 条目、命令、帮助输出、模型路由或转发技能。
- 旧名称在历史 `docs/ae/brainstorms/` 和 `docs/ae/plans/` 中可作为背景保留；`src/` 运行时资产和测试正向断言不得继续暴露旧入口。

## 影响范围

- 受影响用户：使用 `/ae-save-session-flow` 或 `/ae-asset-debug` 的既有用户会失去旧入口，需要改用 `/ae-skill-from-session`。
- 受影响链路：技能资产、schema 常量、catalog、命令注册、帮助输出、模型路由、资产健康测试、使用文档。
- 不影响 `ae:skill-creator` 的创建/更新实现；本计划只核对并使用其现有更新/合并入口。

## 实现单元

### 1. 新增统一技能资产

- [ ] 创建 `src/assets/skills/ae-skill-from-session/SKILL.md`。

目标：定义面向用户的统一技能流程，覆盖普通会话沉淀和资产纠偏沉淀。

需求覆盖：R1、R2、R3、R4、R5、R9、R10。

方法：

- frontmatter 使用 `name: ae:skill-from-session`。
- `description` 表达“从当前会话创建或更新技能”。
- `argument-hint` 使用 `[目标技能名|流程关注点|资产名|纠偏摘要] [--global] [--no-command]` 或等价紧凑表达。
- 文档包含普通会话沉淀分支：提取用户目标、阶段划分、关键动作、确认点、验证方式和交付格式。
- 文档包含资产纠偏分支：收集入口、实际行为、期望行为、证据；归一化候选资产；区分入口资产与实际执行资产。
- 文档包含创建/更新判定：用户明确更新、指定已有技能名或发现同名技能存在时，转交 `ae:skill-creator` 的更新/合并流程。
- 文档包含作用域判定：默认项目级；显式 `--global` 时提示影响所有 OpenCode 项目并转交全局级。
- 文档包含 `--no-command` 语义：创建时不创建命令；更新时不新增命令，已有命令默认不触碰，除非用户明确要求同步或 `ae:skill-creator` 再次确认。
- 文档包含确认模板：确认创建/更新、修改后创建/更新、只输出流程摘要、只输出诊断、不创建/不更新、取消。
- 文档明确不得直接写入技能、命令、代理、规则、工具、hook、service、schema 或注册文件。

测试场景：

- 正常路径：普通会话沉淀创建新项目级技能。
- 正常路径：普通会话沉淀更新已有项目级技能。
- 正常路径：资产纠偏创建或更新纠偏技能。
- 边界路径：候选资产不唯一时暂停询问。
- 边界路径：用户只说“继续”或“看起来不错”时不视为明确确认。
- 边界路径：用户显式全局级时先提示影响范围。
- 错误路径：偏差不是资产问题时只输出诊断，不调用 `ae:skill-creator`。

验证：

- 资产健康测试应通过 frontmatter/catalog 一致性检查。
- 文档审查应确认两个分支不会互相污染，普通沉淀路径不强制资产定位。

### 2. 更新 schema 与命令枚举

- [ ] 修改 `src/schemas/ae-asset-schema.ts`。

目标：用 `ae:skill-from-session` 替换旧两个技能的公开常量和枚举。

需求覆盖：R1、R6、R7、R8。

方法：

- 在 `SKILL` 常量中新增 `SKILL_FROM_SESSION: 'ae:skill-from-session'`。
- 删除 `SAVE_SESSION_FLOW` 和 `ASSET_DEBUG` 常量。
- 在 `AeSkillNameSchema` 中新增 `SKILL.SKILL_FROM_SESSION`。
- 从 `AeSkillNameSchema` 中删除旧两个技能。
- 在 `PROMPT_OPTIMIZE_VARIANT_EXCLUDED_SKILLS` 中新增 `SKILL.SKILL_FROM_SESSION`。
- 从 `PROMPT_OPTIMIZE_VARIANT_EXCLUDED_SKILLS` 中删除旧两个技能。
- 确认 `COMMAND` 自动派生新命令 `ae-skill-from-session`，旧命令不再派生。

测试场景：

- `AeSkillNameSchema` 接受 `ae:skill-from-session`。
- `AeSkillNameSchema` 拒绝 `ae:save-session-flow` 和 `ae:asset-debug`。
- `AeCommandNameSchema` 接受 `ae-skill-from-session`。
- `AeCommandNameSchema` 拒绝 `ae-save-session-flow` 和 `ae-asset-debug`。
- `AeCommandNameSchema` 拒绝 `ae-skill-from-session-po` 和 `ae-skill-from-session-pa`。

验证：

- `npx vitest run tests/schemas/ae-asset-schema.test.ts`。
- `npm run typecheck`。

### 3. 更新 catalog、命令注册与帮助可发现性

- [ ] 修改 `src/services/ae-catalog.ts`。
- [ ] 按测试反馈更新命令注册和帮助相关测试；优先不改 `src/services/command-registration.ts` 和 `src/services/help-catalog-service.ts` 逻辑。

目标：公开 catalog 只暴露新技能，帮助和命令注册自然使用新入口。

需求覆盖：R1、R6、R7、R8。

方法：

- 在 `PHASE_ONE_ENTRIES` 中新增 `SKILL.SKILL_FROM_SESSION` 条目。
- 将新条目放在 `ae:save-experience` 后、`ae:skill-creator` 前，保持经验沉淀能力和创建器依赖邻近。
- 新条目 `description` 与 `SKILL.md` frontmatter 保持核心语义一致。
- 新条目 `argumentHint` 与 `SKILL.md` frontmatter 字面一致。
- 删除 `SKILL.SAVE_SESSION_FLOW` 和 `SKILL.ASSET_DEBUG` 条目。
- 确认 `getPhaseOnePoEntries()` 和 `getPhaseOnePaEntries()` 不为新技能生成变体。

测试场景：

- command config 包含 `ae-skill-from-session`。
- command config 不包含 `ae-save-session-flow`、`ae-asset-debug`、`ae-skill-from-session-po`、`ae-skill-from-session-pa`。
- help catalog 可查询到 `ae:skill-from-session`。
- help catalog 查询旧名称时不再暴露旧入口。
- catalog/frontmatter 描述和参数提示一致。

验证：

- `npx vitest run tests/services/ae-catalog.test.ts`。
- `npx vitest run tests/services/command-registration.test.ts`。
- `npx vitest run tests/services/help-catalog-service.test.ts tests/services/help-catalog-service.integration.test.ts`。

### 4. 更新模型路由和公开文档

- [ ] 修改 `src/services/asset-model-routing-catalog.ts`。
- [ ] 修改 `docs/usage-guide.md`。
- [ ] 修改 `docs/builtin-config.md`。

目标：模型路由和用户文档与新入口一致，不再推荐旧命令。

需求覆盖：R1、R7、R8。

方法：

- 在 `COMMAND_SCENARIOS` 中新增 `[COMMAND.SKILL_FROM_SESSION]: MODEL_SCENARIO.STANDARD`。
- 删除 `[COMMAND.SAVE_SESSION_FLOW]` 和 `[COMMAND.ASSET_DEBUG]`。
- 更新 `docs/usage-guide.md` 中旧命令说明，改为 `/ae-skill-from-session`。
- 更新 `docs/builtin-config.md` 中模型路由表，移除旧命令并添加新命令。
- 不在文档中提供旧入口转发或迁移命令。

测试场景：

- `getCommandModelScenario(COMMAND.SKILL_FROM_SESSION)` 返回 `standard`。
- 旧命令无法通过常量引用继续出现在模型路由。
- 文档中公开命令说明不再推荐旧入口。

验证：

- `npx vitest run tests/services/asset-model-routing-catalog.test.ts`。
- grep 检查 `docs/usage-guide.md` 和 `docs/builtin-config.md` 不再公开旧命令。

### 5. 删除旧技能资产并补充残留检测

- [ ] 删除 `src/assets/skills/ae-save-session-flow/SKILL.md`。
- [ ] 删除 `src/assets/skills/ae-asset-debug/SKILL.md`。
- [ ] 如目录为空，删除 `src/assets/skills/ae-save-session-flow/` 和 `src/assets/skills/ae-asset-debug/`。
- [ ] 更新 `tests/assets/asset-health.test.ts`。

目标：旧技能不再作为公开运行时资产存在，并通过测试防止残留。

需求覆盖：R6、R7、R8。

方法：

- 删除旧技能目录，避免被 skills path 发现。
- 在资产健康测试中增加旧入口负向断言，参考既有旧资产残留拒绝模式。
- 负向断言覆盖旧目录、旧 catalog、旧命令、旧 help 可发现性或可用的等价检查。

测试场景：

- `src/assets/skills/ae-skill-from-session/SKILL.md` 存在且 frontmatter 合法。
- `src/assets/skills/ae-save-session-flow/` 不存在。
- `src/assets/skills/ae-asset-debug/` 不存在。
- 旧入口不在 catalog/help/command 中暴露。

验证：

- `npx vitest run tests/assets/asset-health.test.ts`。

### 6. 更新相关测试断言

- [ ] 更新 `tests/schemas/ae-asset-schema.test.ts`。
- [ ] 更新 `tests/services/command-registration.test.ts`。
- [ ] 更新 `tests/services/help-catalog-service.integration.test.ts`。
- [ ] 更新 `tests/services/asset-model-routing-catalog.test.ts`。
- [ ] 更新其他因旧技能名失败的测试。

目标：测试从旧入口迁移到新入口，并增加旧入口不可用断言。

需求覆盖：R1、R6、R7、R8。

方法：

- 把旧入口正向断言改为 `ae:skill-from-session` 正向断言。
- 增加旧技能名和旧命令名负向断言。
- 确认测试不再读取已删除的旧 `SKILL.md`。
- 如果测试中保留旧名，仅限迁移背景或负向断言，不能表达“旧入口可用”。

测试场景：

- 新 schema、catalog、help、model routing、命令注册全部可用。
- 旧 schema、catalog、help、model routing、命令注册全部不可用。
- prompt optimize 派生命令不会为新技能生成。

验证：

- `npx vitest run tests/schemas/ae-asset-schema.test.ts tests/services/command-registration.test.ts tests/services/help-catalog-service.integration.test.ts tests/services/asset-model-routing-catalog.test.ts tests/assets/asset-health.test.ts`。

### 7. 残留引用检查和最终验证

- [ ] 对 `src/` 执行旧入口残留搜索。
- [ ] 对 `tests/` 执行旧入口残留搜索。
- [ ] 对公开文档执行旧命令残留搜索。
- [ ] 运行类型检查和相关测试。

目标：证明旧入口已从公开运行时链路中移除，新入口可用。

需求覆盖：R6、R7、R8。

方法：

- 搜索旧技能名和旧常量：`ae:save-session-flow`、`ae-save-session-flow`、`SAVE_SESSION_FLOW`、`ae:asset-debug`、`ae-asset-debug`、`ASSET_DEBUG`。
- `src/` 中不应残留旧入口。
- `tests/` 中不应残留旧入口正向断言；负向断言允许保留旧字符串。
- `docs/ae/brainstorms/` 和 `docs/ae/plans/` 中的历史引用允许保留，不作为运行时残留。
- `docs/usage-guide.md`、`docs/builtin-config.md` 不应公开旧入口。

验证命令：

- `npm run typecheck`
- `npx vitest run tests/schemas/ae-asset-schema.test.ts tests/services/ae-catalog.test.ts tests/services/command-registration.test.ts tests/services/help-catalog-service.test.ts tests/services/help-catalog-service.integration.test.ts tests/services/asset-model-routing-catalog.test.ts tests/assets/asset-health.test.ts`
- 如相关测试暴露更广影响，再运行 `npm run test`。

## 风险与缓解

- 破坏性删除旧入口会影响已记住旧命令的用户。缓解：更新 `docs/usage-guide.md` 和 `docs/builtin-config.md`，并确保帮助只显示新入口。
- 新技能如果未加入 prompt optimize 排除列表，会意外新增 `-po` / `-pa` 入口。缓解：schema 排除列表和命令注册测试同时覆盖。
- 只删技能目录会导致 schema/catalog/help 仍暴露旧入口。缓解：按实现单元 2-5 覆盖所有注册链路，并运行资产健康测试。
- 新技能过度进入资产纠偏分支会增加普通沉淀负担。缓解：`SKILL.md` 明确先分流，普通沉淀路径不执行资产定位。
- 更新已有技能的转交语义如果不明确，会退化为创建冲突。缓解：`SKILL.md` 固定更新转交字段：已有技能名、当前会话新增内容、保留内容、冲突点、命令同步建议和写入前确认要求。

## 执行后验收清单

- [ ] `/ae-help` 或帮助工具可发现 `ae:skill-from-session`。
- [ ] `/ae-help` 不再显示 `ae:save-session-flow` 或 `ae:asset-debug`。
- [ ] `ae-skill-from-session` 命令存在。
- [ ] `ae-save-session-flow` 和 `ae-asset-debug` 命令不存在。
- [ ] `ae-skill-from-session-po` 和 `ae-skill-from-session-pa` 不存在。
- [ ] `src/assets/skills/ae-skill-from-session/SKILL.md` 存在。
- [ ] `src/assets/skills/ae-save-session-flow/` 和 `src/assets/skills/ae-asset-debug/` 不存在。
- [ ] 新技能文档覆盖普通沉淀、资产纠偏、创建、更新、默认项目级、显式全局级、`--no-command` 和确认点。
- [ ] 相关测试和 `npm run typecheck` 通过。
