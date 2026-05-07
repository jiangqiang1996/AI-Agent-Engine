---
type: plan
status: drafted
date: 2026-05-07
title: feat-asset-health-protocol-experience
origin: docs/ae/brainstorms/2026-05-07-asset-health-markdown-protocol-and-knowledge-loop-requirements.md
originFingerprint: 2026-05-07-asset-health-markdown-protocol-and-knowledge-loop
depth: deep
---

# 资产健康巡检、Markdown 协议测试与经验沉淀计划

## 来源与目标

上游需求文档：`docs/ae/brainstorms/2026-05-07-asset-health-markdown-protocol-and-knowledge-loop-requirements.md`。

目标是为 AE 插件源码维护提供一个最小可交付闭环：先用可运行验证发现 `src/` 真源资产漂移和高风险 Markdown 协议遗漏，再补齐低成本经验沉淀入口。P0 验证能力优先交付，P1 `ae:save-experience` 不得阻塞 P0。

## 需求覆盖

- R1-R3：资产健康巡检，检查 `src/` 真源资产与常量、catalog、命令、代理和 help 输出的一致性；R1 中 tools 首版仅覆盖已有注册测试和协议相关检查，不纳入完整资产健康巡检。
- R4-R7：Markdown 协议测试，覆盖 setup gate、Git 写授权、破坏性本地操作、远程写边界和修复线索。
- R8-R15：`ae:save-experience` 统一经验沉淀入口，先保存 solution，再提炼 rules，并彻底移除 `ae:save-rules` 旧入口。
- R16-R18：交付前验证、失败项稳定引用和轻量范围边界。

## 关键决策

- P0 采用 Vitest 测试承载，必要的检查逻辑先放在测试 helper 中；只有出现复用需求时再抽为 `src/services/` 服务。
- 资产健康巡检显式检查 `src/` 真源，不通过运行时 manifest 自动选择 `dist/`，避免旧构建产物掩盖源码漂移。
- 首版资产健康巡检覆盖 skills、commands、agents、help；tools 和 rules 仅通过协议测试或已有注册测试覆盖，不在首版做完整描述一致性治理。
- 描述一致性采用分层策略：`name` 和 `argument-hint` 字面一致，`description` 只对关键协议短语做 must-contain，不要求所有自然语言描述逐字一致。
- Markdown 协议测试采用确定性文本契约：优先检查明确可执行代码块、高风险短语和已知浏览器消费方清单；禁止示例、只读 Git 命令和无法确定的自然语言冲突不作为硬失败。
- 失败项使用稳定 ID：`<domain>/<topic>/<asset-kind>/<asset-name>`，例如 `asset-health/skill-frontmatter/skill/ae-save-experience`。
- `ae:save-rules` 旧入口彻底移除；`ae:save-experience` 是唯一经验沉淀入口，rules 保存通过其内部 rules 分支完成。
- 同一技能资产允许存在多个 catalog 或命令入口，但必须显式建模为同一 `skillName` 的共享资产；共享 `SKILL.md` 的 frontmatter 只与主技能入口对齐，派生命令或兼容入口不重复参与 frontmatter 对齐，参数差异由 catalog 级例外表声明并测试。
- 协议测试优先证明“高风险可执行引导”具备门禁，不把禁止性描述、反例、只读研究、临时文件清理或 `ae:setup` 自身的安装检查误判为违规。

## 影响面

- 维护者：修改 `src/assets/`、`src/services/ae-catalog.ts`、`src/schemas/ae-asset-schema.ts` 或公开流程文案后，能通过测试提前发现资产和协议问题。
- AE 工作流代理：`research-reviewer`、`ae:plan`、`ae:review` 后续能稳定引用 `docs/ae/solutions/` 中的经验条目。
- 下游用户项目：不要求具备本仓库源码结构；`docs/ae/solutions/` 和 `.opencode/rules/` 作为用户项目中的可选工作流产物或规则入口处理。

## 实现单元

### 1. 建立资产健康巡检测试

- [ ] 目标：新增可运行测试，发现 skills、commands、agents、help 的注册和文件漂移。
- [ ] 需求：覆盖 R1、R2、R3、R16、R17。
- [ ] 依赖：无。
- [ ] 新增/修改文件：
  - `tests/assets/asset-health.test.ts`
- [ ] 读取来源：
  - `src/schemas/ae-asset-schema.ts`
  - `src/services/ae-catalog.ts`
  - `src/services/help-catalog-service.ts`
  - `src/assets/skills/**/SKILL.md`
  - `src/assets/agents/**/*.md`
- [ ] 方法：
  - 从 `getPhaseOneEntries()` 枚举技能和命令，检查 `skillFile` 指向的 `src/assets/skills/<slug>/SKILL.md` 存在。
  - 解析技能 frontmatter，断言 `name === catalog.skillName`，`argument-hint === catalog.argumentHint`。
  - 建立共享技能资产规则：按 `skillFile` 聚合 catalog entry，主 entry 负责 frontmatter 对齐；同一 `skillFile` 下的兼容 entry 或派生命令只检查自身 command 可发现性，不要求共享文件 frontmatter 重复匹配每个入口。
  - 主 entry 选择规则：优先选择 `commandName === skillName.replace(/^ae:/, 'ae-')` 的基础 entry；若不存在基础 entry，则必须在测试 helper 中显式声明主 entry，不能靠数组顺序隐式决定。
  - `-po` / `-pa` 派生命令只检查命令注册和 help 可发现性，不参与 `SKILL.md` frontmatter 参数对齐；`ae-prompt-optimize-auto` 这类非 `-po` / `-pa` 但共享主技能文件的 entry 才进入显式参数差异例外表。
  - 对已知参数差异建立显式例外表，例外项必须包含资产名、字段、原因和替代断言。例如 `ae:prompt-optimize` 的技能 frontmatter 可保留 `[auto] [提示词内容]`，但普通命令 catalog 可使用 `[提示词内容]`，测试应验证该差异被显式记录而不是静默忽略。
  - 从 `getAllAgentDefinitions()` 枚举代理，检查 `src/assets/agents/<stage>/<name>.md` 存在且 frontmatter 包含 `name` 和 `description`。
  - help 可发现性首版不直接调用默认 `buildHelpCatalog()`，因为当前运行时 manifest 可能优先读取 `dist/src/assets`；测试应基于 `src/services/ae-catalog.ts` 的 catalog 结构和命令注册输出做 src-only 检查，或在实现时为 help catalog 增加显式 src-only 注入点后再调用。
  - 测试只读取 `src/`，不得读取 `dist/` 或 `.opencode/` 作为通过依据。
- [ ] 测试场景：
  - 正常路径：当前所有技能、命令、代理和 help catalog 均通过。
  - 边界情况：`ae:document-review` 这类兼容入口允许 `customTemplate` 指向 `ae:review`；如果它共享 `ae:review` 的 `SKILL.md`，则只检查兼容入口可发现性，不要求共享文件 frontmatter 与兼容入口重复对齐。
  - 边界情况：共享 `skillFile` 或派生命令出现参数提示差异时，必须通过显式例外表或主 entry 规则解释差异。
  - 错误路径：测试断言失败信息包含资产名、字段名或预期路径，便于维护者修复。
  - 集成：运行 `npx vitest run tests/assets/asset-health.test.ts`。
- [ ] 验证：
  - `npx vitest run tests/assets/asset-health.test.ts`
  - `npm run typecheck`

### 2. 建立 Markdown 协议测试

- [ ] 目标：把最高风险 Markdown 硬约束转成可验证文本协议。
- [ ] 需求：覆盖 R4、R5、R6、R7、R16、R17、R18。
- [ ] 依赖：实现单元 1 的失败 ID 约定。
- [ ] 新增/修改文件：
  - `tests/assets/markdown-protocols.test.ts`
  - `src/assets/agents/workflow/figma-design-sync.md`
  - `src/assets/skills/ae-frontend-design/SKILL.md`
- [ ] 读取来源：
  - `src/assets/skills/**/*.md`
  - `src/assets/commands/*.md`
  - `src/assets/agents/**/*.md`
  - `src/assets/rules/**/*.md`
- [ ] 方法：
  - 扫描 `src/assets/**/*.md`，不扫描 `dist/`、`.opencode/` 或 `docs/ae/`。
  - 使用表驱动规则 runner，不逐文件手写断言；规则表包含 `id`、触发模式、必需语义组、负向上下文和失败 ID 生成方式。
  - 定义首批协议主题：`setup-gate`、`git-write-auth`、`destructive-local-auth`、`github-remote-write-boundary`、`skip-verification-boundary`。
  - 触发分层：硬触发只来自 fenced code block、缩进代码块、可复制命令区、明确“执行/运行/调用”语义附近的命令或高风险操作；软触发只生成待人工审查线索，不作为首版硬失败。
  - 现有浏览器消费方整改：如果 `figma-design-sync`、`ae:frontend-design` 或其他已存在消费方缺少 setup 失败停止/记录无法验证、安装状态不能替代、当前会话完成 setup 等完整语义，应在本单元同步补齐文案；P0 不假设“只新增测试即可通过”。
  - `setup-gate`：如果文档包含可执行或可复制的 `agent-browser` 命令，或命中浏览器消费方清单（如 `ae:test-browser`、截图、点击、浏览器验收、视觉验证、agent-browser 封装调用、子代理浏览器操作），必须包含当前会话完成 `ae:setup`、未完成不得执行、不能以安装状态或命令存在检查替代、setup 失败停止或记录无法验证。
  - `setup-gate` 豁免：`ae:setup` 技能自身允许描述安装、检查和复检 `agent-browser`；规则文件中对 setup gate 的禁止性说明或安全边界说明不要求再重复完整前置流程，但仍不得给出绕过 setup 的可复制命令。
  - `git-write-auth`：如果文档推荐 Git 写操作，必须包含目标仓库、目标分支、工作区、完整命令参数、风险说明、明确授权来源和未授权停止。
  - `destructive-local-auth`：如果文档推荐删除、覆盖、reset、clean、递归删除等破坏性本地操作，必须包含目标路径/工作区、风险说明和明确确认；首版硬触发聚焦递归删除、强制覆盖、`git reset --hard`、`git clean`、删除目录或删除通配路径。
  - `destructive-local-auth` 豁免：清理当前流程明确生成的临时单文件、缓存压缩包或失败后残留文件不作为破坏性本地操作硬失败，例如同一技能中下载后清理 `Remove-Item "jre.zip"`；但递归、通配、工作区级、用户数据路径、相对路径不明或跨流程来源不明的删除仍必须触发授权检查。
  - `github-remote-write-boundary`：面向插件用户的公开资产不得提供创建 PR、Issue、Release、远程 push 等可复制远程写操作流程；维护专项能力若提及本地 Git 更新，必须限定为插件维护语境。
  - `skip-verification-boundary`：不得引导跳过 hooks、审查或验证，除非明确要求用户单独授权且说明风险。
  - 对禁止项使用负向上下文过滤，例如“禁止使用 `--no-verify`”“不得执行 `git reset --hard`”“未完成 setup 前禁止运行 `agent-browser`”不触发危险建议失败。
  - 示例代码块只有在同时满足“明确标注为禁止/反例/不要执行”且上下文不提供执行步骤时才豁免；教程式、可复制式或没有禁止语义的危险示例仍按硬触发处理。
- [ ] 测试场景：
  - 正常路径：`ae:test-browser`、`setup-gate-rule.md` 的 setup 前置语义通过。
  - 边界情况：`git status`、`git diff`、`git log` 不触发 Git 写授权失败。
  - 边界情况：`ae:setup` 自身的 agent-browser 安装检查、禁止性安全描述、临时单文件清理和只读外部研究不触发硬失败。
  - 边界情况：标注为禁止/反例的危险命令不触发失败；未标注禁止语义的教程式危险命令仍触发对应协议检查。
  - 错误路径：构造内联 fixture 或测试 helper 中的缺失样例，验证失败 ID 和缺失语义输出。
  - 集成：运行 `npx vitest run tests/assets/markdown-protocols.test.ts`。
- [ ] 验证：
  - `npx vitest run tests/assets/markdown-protocols.test.ts`
  - `npm run test -- --run tests/assets/asset-health.test.ts tests/assets/markdown-protocols.test.ts`

### 3. 建立 solution 经验库文档结构

- [ ] 目标：让 `docs/ae/solutions/` 从“已被引用但不存在”变成可用的轻量经验库入口。
- [ ] 需求：覆盖 R8-R13、R18。
- [ ] 依赖：实现单元 1 和 2 可独立先交付；本单元不阻塞 P0。
- [ ] 文件：
  - `docs/ae/solutions/README.md`
  - `docs/ae/solutions/patterns/critical-patterns.md`
  - `tests/assets/research-reviewer-solutions-text.test.ts`
- [ ] 方法：
  - 新增 `docs/ae/solutions/README.md`，定义 solution 与 rules 的区别、适用语境、脱敏边界、文件命名和引用格式。
  - 新增 `docs/ae/solutions/patterns/critical-patterns.md` 作为高频风险和关键经验索引，不复制所有 solution 正文。
  - 建议 solution 文件格式：`docs/ae/solutions/YYYY-MM-DD-<slug>.md`。
  - 建议 frontmatter 字段：`type: solution`、`status: active`、`date`、`title`、`context`、`tags`、`source`、`sensitive_checked`。
  - 正文包含：适用场景、问题、证据摘要、已验证方案、权衡、不适用场景、后续引用方式。
  - 脱敏边界除凭证类秘密外，还必须覆盖 PII、客户/租户标识、内部 URL、私有工单或 PR 链接、绝对本机路径、专有数据样例和安全事件原始细节；只保存最小必要证据摘要。
- [ ] 测试场景：
  - 正常路径：README 明确 solution 与 rules 的边界。
  - 边界情况：`critical-patterns.md` 只维护索引和关键模式，不复制所有 solution 正文。
  - 错误路径：README 明确禁止保存 token、私钥、完整环境变量、含密 URL、原始敏感日志、PII、内部 URL、私有链接、绝对本机路径和客户数据。
- [ ] 验证：
  - `npx vitest run tests/assets/research-reviewer-solutions-text.test.ts`

### 4. 更新 `research-reviewer` 经验库降级语义

- [ ] 目标：让已有经验搜索流程在 `docs/ae/solutions/` 缺失或为空时自然降级，并满足 R15 的低成本提示要求。
- [ ] 需求：覆盖 R15、R18。
- [ ] 依赖：实现单元 3。
- [ ] 文件：
  - `src/assets/agents/review/research-reviewer.md`
  - `tests/assets/research-reviewer-solutions-text.test.ts`
- [ ] 方法：
  - 更新 `research-reviewer`，明确 `docs/ae/solutions/` 或 `critical-patterns.md` 缺失时应报告“无组织经验可用”，继续技能/文档/外部研究，不得失败。
  - 明确 R15 首版由 `research-reviewer` 承担低成本提示与引用职责，`ae:plan`、`ae:review` 通过既有调用链间接受益，不在首版逐个改写技能流程。
- [ ] 测试场景：
  - 正常路径：`research-reviewer` 仍优先搜索 `docs/ae/solutions/`。
  - 边界情况：缺失目录或 `critical-patterns.md` 时文本包含降级说明。
- [ ] 验证：
  - `npx vitest run tests/assets/research-reviewer-solutions-text.test.ts`

### 5. 注册 `ae:save-experience` 入口

- [ ] 目标：让 `ae:save-experience` 在 schema、catalog、command、模型路由和 help 中可发现。
- [ ] 需求：覆盖 R8、R14、R15。
- [ ] 依赖：实现单元 3。
- [ ] 文件：
  - `src/schemas/ae-asset-schema.ts`
  - `src/services/ae-catalog.ts`
  - `src/services/asset-model-routing-catalog.ts`
  - `tests/services/command-registration.test.ts`
  - `tests/services/help-catalog-service.test.ts`
- [ ] 方法：
  - 在 `SKILL` 中新增 `SAVE_EXPERIENCE: 'ae:save-experience'`，让 `COMMAND` 自动派生 `ae-save-experience`。
  - 将 `SKILL.SAVE_EXPERIENCE` 加入 `PROMPT_OPTIMIZE_VARIANT_EXCLUDED_SKILLS`，避免生成不适合的 `-po` / `-pa` 变体。
  - 在 `AeSkillNameSchema` 中加入新技能。
  - 在 `PHASE_ONE_ENTRIES` 中新增 `ae:save-experience` 条目，描述为统一经验沉淀入口。
  - 在 `COMMAND_SCENARIOS` 中为 `ae-save-experience` 声明 `standard` 场景。
- [ ] 测试场景：
  - 正常路径：`ae:save-experience` 在 schema、catalog、command、help 中可发现。
  - 边界情况：`ae:save-experience` 不生成 `-po` / `-pa`。
- [ ] 验证：
  - `npx vitest run tests/services/command-registration.test.ts tests/services/help-catalog-service.test.ts`

### 6. 新增 `ae:save-experience` 技能资产

- [ ] 目标：新增推荐入口，按“先保存 solution，再提炼 rules”编排经验沉淀。
- [ ] 需求：覆盖 R8、R9、R10、R11、R12、R13、R15。
- [ ] 依赖：实现单元 3 和 5。
- [ ] 文件：
  - `src/assets/skills/ae-save-experience/SKILL.md`
  - `src/assets/skills/ae-save-experience/references/save-solution.md`
  - `src/assets/skills/ae-save-experience/references/save-rules.md`
  - `tests/assets/ae-save-experience-text.test.ts`
- [ ] 方法：
  - 新增主技能 `SKILL.md`：只负责编排、分类、确认和交接，要求先读取 `references/save-solution.md` 再读取 `references/save-rules.md`。
  - 新增 `references/save-solution.md`：定义 solution 候选识别、去重、路径、frontmatter、脱敏、写入前确认和取消行为。
  - 新增 `references/save-rules.md`：迁移规则型经验流程，保留去重、历史验证、冲突提醒、用户确认和 `.opencode/rules/` 写入策略，不引用旧 `ae:save-rules` 技能入口。
  - rules 写入前必须包含与 solution 等价的敏感信息门禁：扫描并展示脱敏结果，禁止保存 token、私钥、完整环境变量、含密 URL、原始敏感日志、PII、客户数据和内部凭证路径；未通过脱敏或用户未确认时不得写入。
  - 如果用户取消 solution 写入但仍要保存 rules，流程应允许说明“无 solution 写入”后继续 rules 确认；不能强行写 solution。
- [ ] 测试场景：
  - 正常路径：主技能先执行 solution 分支，再执行 rules 分支。
  - 边界情况：用户取消 solution 写入但要求保存 rules 时，流程说明无 solution 写入后继续 rules 确认。
  - 错误路径：文本契约断言 solution 写入前必须展示目标路径、标题、语境标签、证据摘要和脱敏结果，未确认不得写入。
  - 安全：文本契约断言 solution 和 rules 写入都必须有敏感信息门禁。
- [ ] 验证：
  - `npx vitest run tests/assets/ae-save-experience-text.test.ts`

### 7. 移除 `ae:save-rules` 旧入口

- [ ] 目标：彻底移除旧入口，确保经验沉淀只通过 `ae:save-experience` 进入。
- [ ] 需求：覆盖 R11、R13、R14。
- [ ] 依赖：实现单元 6。
- [ ] 文件：
  - `src/schemas/ae-asset-schema.ts`
  - `src/services/ae-catalog.ts`
  - `src/services/asset-model-routing-catalog.ts`
  - `src/assets/skills/ae-save-rules/SKILL.md`
  - `tests/assets/asset-health.test.ts`
  - `tests/schemas/ae-asset-schema.test.ts`
  - `tests/services/command-registration.test.ts`
  - `tests/services/help-catalog-service.test.ts`
- [ ] 方法：
  - 从 schema、catalog、模型路由和帮助输出中移除 `ae:save-rules`。
  - 删除 `src/assets/skills/ae-save-rules/SKILL.md`，不得保留可被运行时技能发现的旧技能目录。
  - 保留 `references/save-rules.md` 作为 `ae:save-experience` 内部 rules 子流程，不暴露为独立技能。
  - 增加负向巡检：扫描 `src/assets/skills/**/SKILL.md` 和真实 `src/assets/commands`，确认没有 `ae:save-rules` 技能或命令残留。
- [ ] 测试场景：
  - 正常路径：`ae:save-experience` 基础命令可用，不生成 `-po` / `-pa`。
  - 边界情况：`ae:save-rules` 在 schema、catalog、help、模型路由、真实技能目录和真实命令目录中都不可见。
  - 安全：rules 子流程仍具备脱敏确认和项目语境判断。
- [ ] 验证：
  - `npx vitest run tests/assets/asset-health.test.ts tests/assets/ae-save-experience-text.test.ts tests/schemas/ae-asset-schema.test.ts tests/services/command-registration.test.ts tests/services/help-catalog-service.test.ts`

### 8. 更新用户文档中的 solution/rules 边界

- [ ] 目标：让用户文档明确 solution 是历史方案和研究沉淀，rules 是长期项目规范。
- [ ] 需求：覆盖 R16、R17、R18。
- [ ] 依赖：实现单元 3。
- [ ] 文件：
  - `docs/usage-guide.md`
- [ ] 方法：
  - 如 `docs/usage-guide.md` 已列出 `docs/ae/solutions/`，补充最小说明：solution 是历史方案和研究沉淀，rules 是长期项目规范。
  - 如果现有说明已足够，执行时记录不修改原因，不为了凑变更扩写文档。
- [ ] 测试场景：
  - 文档能区分 `docs/ae/solutions/` 和 `.opencode/rules/` 的用途。
- [ ] 验证：
  - 文档变更时运行相关文本测试或人工审查；无文档变更时说明原因。

## 全局验收标准

- 新增测试文件使用 Vitest，测试描述使用中文。
- P0 测试失败必须包含稳定 ID、资产路径或资产名、协议主题和修复线索。
- 完整交付前运行 `npm run typecheck` 和相关 Vitest 命令。

## 风险与缓解

- 风险：Markdown 协议测试误报过多。缓解：首版只检查明确可执行代码块和强风险短语；禁止示例和只读命令加入白名单或负向上下文过滤。
- 风险：间接浏览器消费方未出现 `agent-browser` 字面命令而漏检 setup gate。缓解：维护浏览器消费方关键词/资产清单，并对新增消费方要求文本契约证明 setup gate。
- 风险：共享技能资产或派生命令造成资产健康巡检误判。缓解：按 `skillFile` 聚合 catalog entry，主 entry 与 frontmatter 对齐，参数差异必须进入显式例外表并具备替代断言。
- 风险：协议测试把维护技能自身、禁止性描述或临时文件清理误判为越权引导。缓解：区分硬触发和软触发，为 `ae:setup` 自身、禁止性语境和同流程临时单文件清理建立窄豁免。
- 风险：P0 协议测试揭示现有浏览器消费方缺少完整 setup gate 语义。缓解：本计划把现有消费方文案整改纳入实现单元 2，不把这些失败视为测试误报。
- 风险：help catalog 测试误读 `dist/`。缓解：首版 help 可发现性使用 catalog/命令注册的 src-only 结构检查；若需要真实 help 输出，先增加显式 src-only 注入点。
- 风险：旧文档或用户习惯仍引用 `ae:save-rules`。缓解：运行时彻底移除旧入口，并在文档中明确经验沉淀只通过 `ae:save-experience`；若用户提到旧入口，由助手解释迁移路径而不是恢复旧技能。
- 风险：solution 或 rules 持久化敏感信息。缓解：两个写入分支都要求脱敏扫描、脱敏结果展示和用户确认；敏感内容未处理时不得写入。
- 风险：AE 源码维护经验污染普通下游项目。缓解：solution 和 rules 都要求语境标签；写 rules 前判断目标项目语境，AE 源码维护专用规则不得写入普通下游项目自动注入 rules。
- 风险：资产健康巡检和运行时 manifest 目标混淆。缓解：巡检固定 `src/` 真源，运行时 manifest 测试继续独立覆盖分发结构。
- 风险：P1 延误 P0。缓解：实现单元 1 和 2 可独立交付；如果时间不足，先交付 P0，P1 作为后续工作。

## 推迟到实现时的说明

- 协议测试的同义短语列表可以在实现时根据现有资产文本微调，但不得削弱 R5/R6 的授权和 setup 语义。
- 资产健康巡检的共享资产例外表应尽量短，只收录现有且有明确理由的参数差异；新增差异默认要求修正 catalog 或 frontmatter，而不是自动加入例外。
- Markdown 协议测试的软触发结果可以先作为测试输出中的维护提示或注释性 helper，不作为 P0 阻断项；只有硬触发缺失门禁语义才失败。
- 如果 `docs/usage-guide.md` 中现有描述已经足够，执行时可以只补测试和技能文案，不做额外文档扩写。
- 如果现有 help 测试通过 mock 难以覆盖真实 catalog，可优先在 `command-registration.test.ts` 和新增资产文本测试中覆盖可发现性。

## 交付门禁

- P0 最小交付：实现单元 1 和 2 通过，且 `npm run typecheck` 通过。
- 完整交付：实现单元 1-8 通过，相关 Vitest 命令通过。
- 建议完整验证命令：`npm run test -- --run tests/assets/asset-health.test.ts tests/assets/markdown-protocols.test.ts tests/assets/research-reviewer-solutions-text.test.ts tests/assets/ae-save-experience-text.test.ts tests/schemas/ae-asset-schema.test.ts tests/services/command-registration.test.ts tests/services/help-catalog-service.test.ts`。
- 不要求提交、推送、PR 或远程写操作；如需 Git 写操作，必须另行取得用户明确授权。
