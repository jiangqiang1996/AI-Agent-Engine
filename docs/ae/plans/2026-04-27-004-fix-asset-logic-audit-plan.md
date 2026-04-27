---
type: plan
status: drafted
date: 2026-04-27
title: fix-asset-logic-audit
depth: deep
---

# AE 资产逻辑审查问题修复计划

## 来源材料

来源审查报告：`docs/ae/asset-logic-audit-2026-04-27.md`

本计划覆盖报告中的全部发现：
- P1：`architecture-strategist` 被错误限制为文档域，代码架构审查无法通过工具契约选中。
- P1：`pattern-recognition-specialist` 已定义但不会被审查契约选择。
- P2：主流程仍直接调用已合并的 `ae:document-review`。
- P2：审查契约暴露的多个条件参数未参与选择逻辑。
- P2：`agent-native-reviewer` 在代码审查中常驻，和代理触发说明不一致。
- P2：文档域 product-lens 触发条件在技能说明和工具矩阵中不一致。
- P2：Windows/PowerShell 环境下部分技能命令示例不可直接执行。
- P2：`ae:handoff` 文档描述了不存在的 `file_path` 参数和 `todoread` 能力。
- P2：帮助目录在传入自定义 repoRoot 时代理部分仍使用默认仓库根。
- P3：`agent-registration.ts` 存在未使用函数。
- P3：`ae:review` 文档域角色说明中 product-lens 重复。
- P3：`ae:work` 指示“逻辑单元完成且测试通过时提交”，和协作约束存在张力。

## 计划目标

以 AE 资产系统的原始目标为导向修复逻辑漂移：技能、代理、工具、目录和恢复建议应共同表达同一套能力边界；程序化契约应可预测、可测试；主流程不应依赖兼容入口；技能中的可执行命令应适配当前 Windows/PowerShell 环境；跨会话、帮助和工作流文档不得描述不存在的能力。

本计划不新增用户可见技能、代理或工具。默认采用最小修复：优先让现有实现和文档一致，只有当实现缺口影响核心目标时才扩展工具契约；`ae-handoff file_path` 不在本轮实现范围内。

## 原始目标模型

| 领域 | 原始目标 | 修复方向 |
|------|----------|----------|
| 审查契约 | 根据改动/文档特征选择合适审查者，让已注册审查代理可达且低噪音 | 补齐 `architecture-strategist`、`pattern-recognition-specialist`；把 `agent-native-reviewer` 收敛为条件触发；让公开参数要么影响选择，要么明确说明用途 |
| 文档审查统一入口 | `ae:review domain:document` 是新主路径，`ae:document-review` 仅是兼容入口 | 主流程、brainstorm 交接和 recovery 不再把旧技能作为下一跳 |
| 文档域产品审查 | product-lens 负责战略主张和范围复杂度，不应重复或只覆盖大文档 | 合并技能说明；让矩阵覆盖 plan、复杂文档和战略/产品主张信号 |
| 帮助目录 | `/ae-help` 是权威运行时目录，命令和代理来源应遵循同一个 manifest/root，技能条目以当前 catalog 真源为准 | 修复 `buildAgentEntries()` 忽略 repoRoot 的问题，不扩展为从任意 repoRoot 解析技能 frontmatter |
| Handoff | 创建新会话时注入准确上下文和待办，不描述工具不支持的参数 | 收敛文档到当前自动推断逻辑；多候选时要求显式上下文，不新增 `file_path` |
| 跨平台技能命令 | LLM 可直接执行技能文档中的命令 | 为 PowerShell 5.1 和 Unix shell 分平台给命令，避免通用步骤使用 bash-only 语法 |
| 工作技能 Git 行为 | 支持增量提交建议，但不越过用户授权 | 将提交表述改成“已获授权时提交，否则汇报建议提交点” |

## 高层设计

采用“三层一致性”修复方式：

1. 程序化契约层：修改 `review-catalog.ts`、`review-selector.ts`、`recovery-service.ts`、`help-catalog-service.ts` 等 TypeScript 逻辑，并用 Vitest 固定行为。
2. LLM 指令层：同步 `SKILL.md`、agent markdown 和 reference 文档，让技能执行时的人工/LLM 决策与程序化契约语义一致。
3. 验证层：增加针对可达性、参数映射、repoRoot、兼容入口和跨平台命令文本的测试或人工验收清单。

审查契约应优先保持低噪音：常驻角色只保留通用代码质量与规范审查；领域性角色通过明确条件激活。若某个参数仅用于下游提示而不改变团队，应在工具输出或描述中说明，避免调用方误解。

### 审查契约目标矩阵

| Reviewer | Domain | 触发目标 |
|----------|--------|----------|
| `architecture-strategist` | `both` | 代码域：`hasArchitectureDecision`、`hasNewAbstraction` 或 `changed_lines >= 50`；文档域：`documentType=plan` 且 `hasArchitectureDecision` |
| `pattern-recognition-specialist` | `code` | `hasNewAbstraction` 或 `changed_lines >= 50`；执行时如已有更精确的重构信号，可追加但不替代前两项 |
| `agent-native-reviewer` | `code` | `hasCli`、`hasUi`，或执行时派生出的 AE 资产变更信号（工具、代理、技能、TUI/CLI 配置），普通配置变更不得单独触发 |
| `product-lens-reviewer` | `document` | `documentType=plan`、`requirementCountGte5` 或新增/派生的 `hasProductClaim` 战略/产品主张信号 |

### 公开参数处置表

| 参数 | 目标状态 | 说明 |
|------|----------|------|
| `has_architecture_decision` | 选择条件 | 触发 `architecture-strategist` 和对抗审查相关路径 |
| `has_new_abstraction` | 选择条件 | 触发 `architecture-strategist`、`pattern-recognition-specialist` 和对抗审查相关路径 |
| `has_cli` | 选择条件 | 触发 `agent-native-reviewer` |
| `has_ui` | 选择条件 | 可触发 `agent-native-reviewer`；文档域仍保留 design-lens 触发 |
| `has_product_claim` | 新增选择条件 | 用于小型但战略性强的需求/方案文档触发 `product-lens-reviewer` |
| `has_config` | 默认非选择字段 | 仅普通配置变更不触发 `agent-native-reviewer`；如执行时能可靠派生 AE 资产配置变更，可用派生信号触发 |
| `has_script` | 默认非选择字段 | 不为“使用参数”硬绑定 reviewer；必要时仅在输出中声明供下游提示使用 |
| `has_typescript` | 默认非选择字段 | TypeScript 严格审查由常驻审查者内部执行，不单独改变团队 |

非选择字段必须在 `ae-review-contract` 的输出或工具描述中透明说明，避免调用方误以为它们改变审查团队。

## 利益相关者和影响

- 使用 `/ae-review` 和 `ae-review-contract` 的代理：会获得更准确的审查团队，减少无关审查噪音。
- 使用 `/ae-lfg`、`ae:brainstorm`、`ae-recovery` 的主流程：文档审查将直接走统一审查入口，降低兼容入口中断风险。
- Windows 用户和当前开发环境：`ae-setup`、`ae-test-browser` 的命令示例应可直接执行。
- 维护者和测试：帮助目录、自定义 repoRoot、agent 注册和矩阵可达性需要新增或调整测试。
- 旧用户：`ae:document-review` 兼容入口必须保留，不应删除技能、命令或 catalog 兼容项。

## 实现单元

- [ ] 单元 1：修复审查矩阵的代码架构和模式识别可达性
  - 目标：让 `architecture-strategist` 和 `pattern-recognition-specialist` 按原始定位进入自动审查契约。
  - 覆盖问题：P1 `architecture-strategist`、P1 `pattern-recognition-specialist`。
  - 文件：`src/services/review-catalog.ts`、`src/services/review-selector.ts`、`src/services/review-catalog.test.ts`、`src/services/review-selector.test.ts`、`src/tools/ae-review-contract.tool.test.ts`。
  - 方法：将 `architecture-strategist` 定稿为 `domain: 'both'` 条件角色，代码域由 `hasArchitectureDecision`、`hasNewAbstraction` 或 `changed_lines >= 50` 触发，文档域由 `documentType=plan` 且 `hasArchitectureDecision` 触发；将 `pattern-recognition-specialist` 加入代码域条件矩阵，在 `hasNewAbstraction` 或 `changed_lines >= 50` 下激活。
  - 需遵循的模式：资产名称使用 `AGENT` 常量；不要因为新增角色而扩大常驻团队；保持 `selectReviewers()` 去重和 domain 过滤行为。
  - 测试场景：`kind=code + has_architecture_decision=true` 包含 `architecture-strategist`；`kind=code + has_new_abstraction=true` 同时包含 `architecture-strategist` 和 `pattern-recognition-specialist`；`kind=code + changed_lines>=50` 同时包含 `architecture-strategist` 和 `pattern-recognition-specialist`；`kind=plan + has_architecture_decision=true` 包含 `architecture-strategist`。
  - 验证：`npm run test -- src/services/review-selector.test.ts src/services/review-catalog.test.ts src/tools/ae-review-contract.tool.test.ts`。

- [ ] 单元 2：收敛 `agent-native-reviewer` 和审查契约公开参数语义
  - 目标：让 `ae-review-contract` 暴露的特征参数与团队选择结果一致，减少普通代码审查噪音。
  - 覆盖问题：P2 未使用参数、P2 `agent-native-reviewer` 常驻不一致。
  - 文件：`src/services/review-catalog.ts`、`src/services/review-selector.ts`、`src/tools/ae-review-contract.tool.ts`、相关测试文件。
  - 方法：把 `agent-native-reviewer` 从代码域常驻改为条件激活，至少由 `hasCli`、`hasUi` 或执行时可可靠派生出的 AE 资产变更信号激活；按“公开参数处置表”固定 `hasTypescript`、`hasConfig`、`hasScript` 的非选择字段状态，并在工具描述或 JSON metadata 中明确“未参与团队选择，仅供下游提示使用”。
  - 需遵循的模式：不要删除仍有调用价值的工具参数，除非确认没有外部消费者；若修改返回结构，保持 JSON 可解析并更新测试。
  - 测试场景：普通小型代码审查不包含 `agent-native-reviewer`；`has_cli=true` 包含 `agent-native-reviewer`；普通 `has_config=true` 不单独触发 `agent-native-reviewer`；每个保留参数都有测试证明会影响 reviewer 或在输出中被声明为非选择字段。
  - 验证：`npm run test -- src/services/review-selector.test.ts src/tools/ae-review-contract.tool.test.ts`。

- [ ] 单元 3：同步 product-lens 契约、`ae:review` 技能和审查参考文档
  - 目标：让程序化矩阵和 LLM 指令层表达同一套文档域产品审查与角色选择规则。
  - 覆盖问题：P2 product-lens 条件不一致、P3 product-lens 重复，以及单元 1-2 引入的矩阵变化。
  - 文件：`src/services/review-catalog.ts`、`src/services/review-selector.ts`、`src/tools/ae-review-contract.tool.ts`、`src/assets/skills/ae-review/SKILL.md`、`src/assets/skills/ae-review/references/file-routing-table.md`、`src/assets/skills/ae-review/references/persona-catalog.md`、必要时 `src/services/ae-catalog.ts`。
  - 方法：为 `product-lens-reviewer` 增加 `hasProductClaim` 选择信号，保留 `documentType=plan` 和 `requirementCountGte5`；合并重复的 product-lens 条目，统一表述其触发条件为战略/产品主张、范围复杂度、计划文档或需求数量较高；同步说明 `architecture-strategist`、`pattern-recognition-specialist`、`agent-native-reviewer` 的触发边界。
  - 需遵循的模式：保留 SKILL.md 与 TypeScript 的双重决策机制，但语义一致；catalog description 与 frontmatter description 语义一致，`argument-hint` 不做无关改动。
  - 测试场景：`kind=document + has_product_claim=true` 包含 `product-lens-reviewer`；人工检查技能说明没有重复 product-lens 条目；参考文档不再把条件角色误写成常驻；技能文档中角色触发条件能解释 `ae-review-contract` 返回的团队。
  - 验证：如修改 TypeScript，运行 `npm run typecheck`；文档改动做文本核对。

- [ ] 单元 4：把新主流程统一迁移到 `ae:review domain:document`
  - 目标：彻底将 `ae:document-review` 降级为兼容入口，避免自动流程绕旧技能。
  - 覆盖问题：P2 主流程仍调用旧技能。
  - 文件：`src/assets/skills/ae-lfg/SKILL.md`、`src/assets/skills/ae-lfg/references/pipeline.md`、`src/assets/skills/ae-brainstorm/SKILL.md`、`src/assets/skills/ae-brainstorm/references/handoff.md`、`src/assets/skills/ae-document-review/SKILL.md`、必要时 `docs/ae/usage-guide.md`。
  - 方法：将 LFG 和 brainstorm 中的新流程下一步改为 `ae:review domain:document <文档路径>`；保留 `ae-document-review` 自身的兼容说明，不删除兼容入口；确保文档路径传递要求明确，减少依赖最近文件搜索。
  - 需遵循的模式：多行自然语言中的技能名可直接写；不要破坏 `/ae-document-review` 命令兼容转发。
  - 测试场景：搜索主流程文档中除兼容技能自身外不再把 `ae:document-review` 作为执行下一步；旧 `/ae-document-review` 文档仍清楚指向 `ae:review domain:document`。
  - 验证：运行 `npm run build`，确认资产同步正常。

- [ ] 单元 5：修复 recovery 的文档审查恢复建议
  - 目标：让恢复工具从 plan/brainstorm 产物恢复时直接指向统一审查入口，并携带文档域语义。
  - 覆盖问题：P2 主流程仍调用旧技能中的 `recovery-service.ts` 部分。
  - 文件：`src/services/recovery-service.ts`、`src/schemas/recovery-schema.ts`、`src/tools/ae-recovery.tool.ts`、`src/services/recovery-service.test.ts`、必要时 `src/tools/ae-recovery.tool.test.ts`。
  - 方法：将 `nextSkillForArtifact()` 中 plan/brainstorm 到文档审查的返回从 `SKILL.DOCUMENT_REVIEW` 改为 `SKILL.REVIEW`，并在 `RecoveryResult` 增加结构化字段表达下一步参数，例如 `nextArguments?: string`，其值为 `domain:document <artifact-path>`。多个候选场景也要提供 `nextCommandTemplate` 或等价结构化模板，确保用户选中候选后路径能进入下一步调用。
  - 需遵循的模式：阶段找不到上游产物时回退到更早阶段是预期行为，不改 `fallbackSkillForPhase()` 的依赖链；技能名引用 `SKILL` 常量；若新增命令字段，命令名引用 `COMMAND` 常量，禁止硬编码资产字符串；`reason` 只做人类说明，不承载机器可执行语义。
  - 测试场景：`phase=review` 遇到 plan artifact 返回 `SKILL.REVIEW` 且 `nextArguments` 包含 `domain:document` 和该 artifact 路径；`phase=lfg` 遇到 plan/brainstorm artifact 返回 `SKILL.REVIEW` 和结构化文档域参数；多个候选返回 `needs-selection` 时包含选择后可套用的结构化命令模板。
  - 验证：`npm run test -- src/services/recovery-service.test.ts`，再运行 `npm run typecheck`。

- [ ] 单元 6：修复 help catalog 自定义 repoRoot 同源问题
  - 目标：让 `buildHelpCatalog(repoRoot)` 下命令和代理使用同一个仓库根或 manifest，并明确技能条目仍来自当前 catalog 真源。
  - 覆盖问题：P2 帮助目录忽略自定义 repoRoot。
  - 文件：`src/services/help-catalog-service.ts`、`src/services/help-catalog-service.test.ts`、必要时 `src/services/help-catalog-service.integration.test.ts`。
  - 方法：让 `buildAgentEntries()` 接收 `manifest` 或 `repoRoot` 参数，避免内部重新调用 `getRepoRoot()`；保持生产路径默认行为不变。技能目录仍以编译后的 `ae-catalog.ts` 为权威来源，不在本单元扩展为从任意 repoRoot 解析 SKILL.md frontmatter。
  - 需遵循的模式：help catalog 是 `/ae-help` 权威来源；不要通过手动扫描绕开 runtime manifest；测试使用临时 root 或 mock 验证命令和代理来源；技能静态 catalog 与 frontmatter 一致性由既有规范和相关测试约束。
  - 测试场景：传入自定义 repoRoot 时，命令和代理描述均来自该 root/manifest，技能条目仍来自当前 catalog 真源；查询过滤仍能返回对应条目；fallback 到 `ae-catalog.ts` 描述的优先级不变。
  - 验证：`npm run test -- src/services/help-catalog-service.test.ts src/services/help-catalog-service.integration.test.ts`。

- [ ] 单元 7：收敛 `ae:handoff` 文档与工具契约
  - 目标：避免技能文档诱导 LLM 使用不存在的 `file_path` 参数或 `todoread` 能力。
  - 覆盖问题：P2 handoff 文档不一致。
  - 文件：`src/assets/skills/ae-handoff/SKILL.md`、必要时 `src/tools/ae-handoff.tool.ts` 和新增/更新测试。
  - 方法：默认选择低风险修复：删除 `file_path` 与 `todoread` 表述，改为准确描述“会话历史提到的计划文件优先，最新计划文件兜底，解析实现单元复选框并追加到 pending_tasks”。同时补充多计划安全规则：当历史或计划目录中出现多个候选且无法唯一判断目标时，不应静默追加自动待办，应要求调用方在 `pending_tasks` 中显式提供目标计划路径或待办摘要。
  - 需遵循的模式：`ToolContext.history` 属于运行时动态注入属性，允许类型守卫访问；工具层错误路径才可 toast，service 层不引入 UI 副作用。
  - 测试场景：文档不再出现不存在的 `file_path`/`todoread`；文档明确多候选时停止自动推断并要求显式上下文；本轮不实现 `file_path`。如未来用户明确要求显式指定计划文件，再新增独立计划覆盖 schema、路径安全和测试。
  - 验证：文档修复运行 `npm run build`；如改工具运行相关 Vitest 和 `npm run typecheck`。

- [ ] 单元 8：清理 `agent-registration.ts` 未使用函数
  - 目标：消除重复读取逻辑和维护噪音，不改变 agent 注册行为。
  - 覆盖问题：P3 未使用函数。
  - 文件：`src/services/agent-registration.ts`、必要时新增 `src/services/agent-registration.test.ts`。
  - 方法：删除 `loadAgentPrompt()`，或让 `buildAgentConfig()` 复用它；优先选择最小、可读性更高的方案。若新增测试，使用临时 manifest 验证 frontmatter description、正文 prompt 和 fallback description。
  - 需遵循的模式：不改变 `mode: 'subagent'`、权限配置和 agent markdown 解析行为；严格 TypeScript，不使用 `any`。
  - 测试场景：现有 agent markdown 仍能注册；缺失 description 时 fallback 行为不变；typecheck 无未使用代码。
  - 验证：`npm run typecheck`，如有测试运行 `npm run test -- src/services/agent-registration.test.ts`。

- [ ] 单元 9：修复 PowerShell/Unix 跨平台命令示例
  - 目标：让 `ae-setup` 和 `ae-test-browser` 中的命令示例可被 LLM 在 Windows PowerShell 5.1 下直接执行，同时保留 Unix 用户路径。
  - 覆盖问题：P2 Windows/PowerShell 示例不可执行。
  - 文件：`src/assets/skills/ae-setup/SKILL.md`、`src/assets/skills/ae-test-browser/SKILL.md`。
  - 方法：为命令检查、安装和端口推断分平台提供 `powershell` 与 `bash` 代码块；PowerShell 使用 `; if ($?) { ... }`、`Get-Command`、`$env:PORT` 或显式变量写法，避免裸 `&&`、`command -v`、`PORT=$(...)` 和 `${PORT:-3000}` 出现在通用步骤中。
  - 需遵循的模式：技能文档是 LLM 执行指令，示例必须直接可执行；不要把安装确认绕过用户授权。
  - 测试场景：人工核对 PowerShell 代码块无 bash-only 语法；Unix 代码块仍保留 macOS/Linux 可用写法；`ae:test-browser` 在未安装 agent-browser 或 dev server 未启动时有清晰停止/提示路径。
  - 验证：运行 `npm run build`；可选用 PowerShell 手动执行纯检查命令，不执行全局安装除非用户授权。

- [ ] 单元 10：修复 `ae:work` 的提交授权表述
  - 目标：保留增量提交建议，但明确 commit 动作必须由用户授权。
  - 覆盖问题：P3 `ae:work` 提交指示与协作约束冲突。
  - 文件：`src/assets/skills/ae-work/SKILL.md`。
  - 方法：将“逻辑单元完成且测试通过时提交”改为“如用户已明确授权提交，则按逻辑单元提交；否则保持工作区变更并汇报建议提交点”。同步检查子代理约束和主流程阶段描述，避免同一文档内部矛盾。
  - 需遵循的模式：不得在技能中鼓励未授权提交；提交规范仍引用项目 Git 工作流。
  - 测试场景：人工检查用户只说“执行计划”时不会被技能解释为 commit 授权；用户明确说“完成后提交”时仍有提交前检查路径。
  - 验证：运行 `npm run build`。

- [ ] 单元 11：全量一致性和回归验证
  - 目标：确认全部资产、契约、文档和测试共同满足原始目标。
  - 覆盖问题：全部 P1-P3。
  - 文件：所有修改文件。
  - 方法：按审查报告逐条回扫；使用 PowerShell 或 Node.js 脚本化生成关键词命中清单，覆盖 `src/assets/skills/`、`src/assets/agents/`、`src/services/` 中的 `ae:document-review`、`product-lens`、`agent-native`、`architecture-strategist`、`pattern-recognition-specialist`、`file_path`、`todoread`、`&&`、`PORT=$(` 等关键字，并为每个残留命中标注“允许保留/需修复/兼容说明”。
  - 需遵循的模式：兼容入口保留；文档和代码双重决策语义一致；未授权不提交。
  - 测试场景：运行重点测试后再运行完整 `npm run test`、`npm run typecheck`、`npm run build`。
  - 验证：输出逐项映射表，说明审查报告每个发现已修复、保留兼容或有意推迟。

## 关键决策

- `ae:document-review` 不删除，只从新主流程和 recovery 下一跳中移除。
- `agent-native-reviewer` 默认不再常驻；普通配置变更不得单独触发它，AE 资产变更需要更精确的派生信号或明确测试。
- `ae-handoff` 本轮采用文档收敛而不是新增 `file_path` 参数；多候选时不允许静默选择错误计划，应要求显式上下文。新增 `file_path` 留给后续独立计划。
- 对 `has_typescript`、`has_config`、`has_script` 这类参数，默认作为非选择字段并在输出中透明声明；只有与 reviewer 职责存在强关联时才新增触发关系。
- product-lens 的原始目标不是“只看大型文档”，而是审查产品主张、战略后果和范围复杂度；矩阵和文档应共同反映这一点。

## 风险与缓解

- 风险：新增审查者导致团队过大。缓解：新增角色采用条件激活，常驻团队不扩大。
- 风险：recovery 只返回 `SKILL.REVIEW` 但调用方不知道 `domain:document`。缓解：优先增加或明确输出完整下一步参数，测试覆盖 plan/brainstorm artifact。
- 风险：只改技能文档未同步 reference 或 catalog。缓解：单元 3 和单元 11 做关键词回扫。
- 风险：跨平台命令文档测试容易过脆。缓解：以人工验收加少量文本检查为主，不用复杂正则锁死自然语言。
- 风险：用户仍需要显式指定旧计划进行 handoff。缓解：本轮不实现 `file_path`，多候选时要求在 `pending_tasks` 中显式提供目标计划路径或待办摘要；如未来要支持参数，另起计划处理路径安全。

## 验证计划

- 重点测试：`npm run test -- src/services/review-selector.test.ts src/services/review-catalog.test.ts src/tools/ae-review-contract.tool.test.ts`。
- 恢复测试：`npm run test -- src/services/recovery-service.test.ts`。
- 帮助目录测试：`npm run test -- src/services/help-catalog-service.test.ts src/services/help-catalog-service.integration.test.ts`。
- 类型检查：`npm run typecheck`。
- 完整测试：`npm run test`。
- 构建验证：`npm run build`。
- 文档验收：逐项核对 `docs/ae/asset-logic-audit-2026-04-27.md` 中 12 个发现，确认每项都有对应修复或有意保留说明。

## 推迟到执行时的事项

- 执行时根据实际测试结构决定是否新增 `agent-registration.test.ts` 或只依赖 typecheck。
- 执行时根据 `RecoveryResult` 当前消费者决定结构化字段命名，但不能退化为只强化 `reason` 文本。
- 执行时可以细化 AE 资产变更派生信号，但不得让普通 `has_config`、`has_script`、`has_typescript` 为了“使用参数”硬触发不相关 reviewer。
- `ae-handoff file_path` 不在本轮执行；如未来要做，需要先创建独立计划并补路径安全测试。

## 下一步

-> /ae-work
