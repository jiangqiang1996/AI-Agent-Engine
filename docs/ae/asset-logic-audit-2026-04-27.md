# AE 技能、代理、工具逻辑审查报告

> 日期：2026-04-27  
> 范围：`src/assets/skills/`、`src/assets/agents/`、`src/tools/`、`src/services/ae-catalog.ts`、`src/services/review-catalog.ts`、`src/services/review-selector.ts`、`src/services/command-registration.ts`、`src/schemas/ae-asset-schema.ts`  
> 目标：检查技能、代理、工具之间是否存在逻辑错误、契约不一致、触发条件缺口或值得优化的地方。

## 总体结论

当前资产完整性基础良好：18 个技能、26 个代理、5 个工具均存在对应源文件，工具注册表和资产常量未发现缺失项。主要问题不是资产缺失，而是编排逻辑和说明之间存在若干不一致：审查者选择矩阵没有覆盖部分已定义代理，部分条件参数未生效，主流程仍引用已合并的旧技能，少数技能中的命令示例在 Windows/PowerShell 环境不可直接执行，更新与 SQL 技能存在安全确认和敏感信息暴露风险。

## 发现列表

### P1：`architecture-strategist` 被错误限制为文档域，代码架构审查无法通过工具契约选中

- 位置：`src/services/review-catalog.ts:127-133`
- 位置：`src/assets/agents/review/architecture-strategist.md`
- 位置：`src/assets/skills/ae-review/SKILL.md:166-179`

`architecture-strategist` 的代理定位是“从架构视角分析代码变更，检查模式合规性和设计完整性”，但 `REVIEW_MATRIX` 将它设置为 `domain: 'document'`，并且只在 `hasArchitectureDecision` 为真时对文档域激活。结果是 `ae-review-contract` 在代码审查中即使传入 `has_architecture_decision: true`，也不会选择 `architecture-strategist`。

影响：涉及服务新增、结构性重构、模块边界调整的代码审查缺少架构视角，只会触发 `adversarial-reviewer` 等其他角色，覆盖不完整。

建议：将 `architecture-strategist` 改为 `domain: 'code'` 或 `domain: 'both'`，并用 `hasArchitectureDecision`、`hasNewAbstraction`、较大改动量等条件激活。若文档域也需要架构可行性审查，应明确描述其文档域职责，避免与 `feasibility-reviewer` 重叠。

### P1：`pattern-recognition-specialist` 已定义但不会被审查契约选择

- 位置：`src/schemas/ae-asset-schema.ts:55`
- 位置：`src/services/ae-catalog.ts:224`
- 位置：`src/assets/agents/review/pattern-recognition-specialist.md`
- 位置：`src/services/review-catalog.ts`

`pattern-recognition-specialist` 已在常量、代理目录和帮助目录中注册，但没有出现在 `REVIEW_MATRIX` 中。通过 `ae-review-contract` 生成审查团队时，该代理永远不会被自动选择。

影响：新增代码是否遵循既有模式、命名约定和重复代码识别这类能力无法进入统一审查流程，代理只能被用户手动 `@pattern-recognition-specialist` 调用。

建议：为其增加代码域条件条目。可在 `hasNewAbstraction`、较大改动量、重构、跨文件重复风险时激活；如果希望它常驻，也应在 `ae-review` 的角色说明中同步更新。

### P2：主流程仍直接调用已合并的 `ae:document-review`

- 位置：`src/assets/skills/ae-lfg/SKILL.md:47-67`
- 位置：`src/assets/skills/ae-brainstorm/SKILL.md:142-148`
- 位置：`src/services/recovery-service.ts:58-74`
- 位置：`src/assets/skills/ae-document-review/SKILL.md:7-16`

`ae-document-review` 已声明合并到 `ae:review domain:document`，但 LFG、brainstorm 和 recovery 仍把它作为下一步技能或执行步骤。虽然命令层对 `/ae-document-review` 做了 customTemplate 转发，但技能内部或恢复工具返回 `ae:document-review` 时，仍会多一次“旧技能提示再转发”的间接层。

影响：流程语义不够直接；在自动化链路中可能出现“调用废弃技能后仅提示使用 ae:review”的中断风险，尤其是恢复工具返回 `nextSkill: ae:document-review` 时。

建议：将主流程和 `recovery-service.ts` 中的下一步技能统一改为 `SKILL.REVIEW`，并在传参中明确 `domain:document`。保留 `ae-document-review` 作为兼容入口即可。

### P2：审查契约暴露的多个条件参数未参与选择逻辑

- 位置：`src/tools/ae-review-contract.tool.ts:40-57`
- 位置：`src/services/review-selector.ts:3-26`
- 位置：`src/services/review-catalog.ts:19-134`

`ae-review-contract` 接收 `has_cli`、`has_typescript`、`has_config`、`has_script` 等参数，但 `REVIEW_MATRIX` 没有使用这些字段。部分字段可能只是供常驻审查者内部使用，但工具描述暗示它们会影响审查团队生成。

影响：调用方可能误以为这些参数会改变团队。例如传入 `has_cli: true` 不会条件性激活 `agent-native-reviewer`，因为它当前总是常驻；传入 `has_config: true` 不会改变 `standards-reviewer`，因为它也总是常驻。

建议：删除不会影响选择的参数，或让它们真正参与选择逻辑。若保留参数是为了未来扩展，应在工具返回的 metadata 中标注“团队选择未使用，仅供下游提示使用”。

### P2：`agent-native-reviewer` 在代码审查中常驻，和代理触发说明不一致

- 位置：`src/services/review-catalog.ts:24`
- 位置：`src/assets/agents/review/agent-native-reviewer.md`

代理说明是“添加 UI 功能、自定义工具或代理配置后使用”，但矩阵将其设为所有代码审查 always-on。

影响：普通业务代码审查也会调用 agent-native 角色，增加噪音和成本，并可能输出与当前改动无关的 CLI/代理能力建议。

建议：改为条件激活：`hasCli`、工具变更、代理/技能配置变更、TUI/UI 变更时启用。若项目希望所有代码审查都检查 agent-native 就绪度，应同步修改代理说明和 catalog 描述。

### P2：文档域 product-lens 触发条件在技能说明和工具矩阵中不一致

- 位置：`src/assets/skills/ae-review/SKILL.md:187-193`
- 位置：`src/services/review-catalog.ts:93-102`

`ae-review` 说明中 product-lens 会在“文档对构建什么和为什么构建做出可质疑主张，或具有战略影响力”时激活，同时又重复列出一次 product-lens 条件。工具矩阵实际只在 `documentType === 'plan'` 或 `requirementCount >= 5` 时激活。

影响：小型但战略性强的需求文档不会通过契约激活 product-lens；技能文档也存在重复条目，容易让维护者误解真实行为。

建议：去重技能说明中的 product-lens 条目，并在工具参数中增加能表达“战略/产品主张”的布尔字段，或将 requirements 文档默认纳入 product-lens。

### P2：Windows/PowerShell 环境下部分技能命令示例不可直接执行

- 位置：`src/assets/skills/ae-setup/SKILL.md:15-17`
- 位置：`src/assets/skills/ae-setup/SKILL.md:42-46`
- 位置：`src/assets/skills/ae-test-browser/SKILL.md:32-34`
- 位置：`src/assets/skills/ae-test-browser/SKILL.md:87-90`

项目当前运行环境是 Windows，默认 shell 是 PowerShell 5.1，但部分技能示例使用 Unix shell 语法，如 `command -v ... || where ...`、`npm install -g agent-browser && npx agent-browser install`、`PORT=$(...)`。PowerShell 5.1 不支持 `&&`，也不支持 bash 风格变量赋值。

影响：LLM 按技能说明直接执行时会失败，影响 `/ae-setup` 和 `/ae-test-browser` 的可用性。

建议：为 Windows 和 Unix 分别提供命令块，并明确在 PowerShell 下使用 `; if ($?) { ... }` 或原生 PowerShell 写法。避免在通用步骤中混用 bash 与 PowerShell 语法。

### P2：`ae:handoff` 文档描述了不存在的 `file_path` 参数和 `todoread` 能力

- 位置：`src/assets/skills/ae-handoff/SKILL.md:40-50`
- 位置：`src/tools/ae-handoff.tool.ts:103-114`

技能文档称支持通过 `file_path` 参数指定计划文件，并称工具内置 `todoread` 能力；实际工具参数没有 `file_path`，实现是从会话历史或最新计划文件推断并解析“实现单元”复选框。

影响：调用者可能传入不存在的参数，或误以为能精确指定计划文件，导致交接待办来源不符合预期。

建议：要么在工具参数中增加 `file_path` 并实现指定读取；要么修改技能文档，删除 `file_path` 和 `todoread` 表述，改为描述当前的历史/最新计划推断逻辑。

### P2：帮助目录在传入自定义 repoRoot 时代理部分仍使用默认仓库根

- 位置：`src/services/help-catalog-service.ts:100-109`
- 位置：`src/services/help-catalog-service.ts:128-136`

`buildHelpCatalog(repoRoot)` 为技能和命令构建了指定 root 的 manifest，但 `buildAgentEntries()` 内部重新调用 `getRepoRoot()`，忽略传入的 repoRoot。

影响：测试或项目级安装场景中，如果使用非默认 root 生成帮助信息，技能/命令来自一个 root，代理描述可能来自另一个 root，造成帮助内容不一致。

建议：让 `buildAgentEntries` 接收 `manifest` 或 `repoRoot` 参数，避免内部重新解析根目录。

### P3：`agent-registration.ts` 存在未使用函数

- 位置：`src/services/agent-registration.ts:17-21`

`loadAgentPrompt` 未被调用，和 `buildAgentConfig` 内部读取 prompt 的逻辑重复。

影响：无直接运行时错误，但增加维护噪音。

建议：删除未使用函数，或在 `buildAgentConfig` 中复用它。

### P3：`ae:review` 文档域角色说明中 product-lens 重复

- 位置：`src/assets/skills/ae-review/SKILL.md:187-193`

文档域条件角色列表中 `product-lens` 出现两次，第二次更偏范围复杂度，第一次更偏战略主张。

影响：不影响工具运行，但会造成角色选择规则重复和维护歧义。

建议：合并为一个 product-lens 条目，列出所有触发条件。

### P3：`ae:work` 指示“逻辑单元完成且测试通过时提交”，和助手默认不主动提交的协作约束存在张力

- 位置：`src/assets/skills/ae-work/SKILL.md:88-91`

技能说明鼓励增量提交，但当前协作规范要求只有用户明确要求时才创建 Git commit。

影响：如果 LLM 严格遵循技能，可能在用户未明确要求提交时尝试提交。

建议：改为“如用户已授权提交，则逻辑单元完成且测试通过时提交；否则仅保持工作区变更并汇报建议提交点”。

## 资产完整性检查

- 技能目录：18 个，均有 `SKILL.md`。
- 代理目录：26 个，均有 Markdown 文件和 frontmatter description。
- 工具目录：5 个运行时工具均已在 `src/tools/index.ts` 注册。
- 常量定义：技能、代理、工具常量未发现明显缺项。
- 参考文件：技能中主要 `@./references/...` 引用均存在；`ae-sql` 中的反引号导致简单正则检查出现误报，但实际文件存在。

## 优化建议

1. 先修复审查矩阵：补齐 `architecture-strategist` 和 `pattern-recognition-specialist`，收敛 always-on 角色。
2. 将 `ae-document-review` 彻底降级为兼容入口，主流程和恢复服务统一改用 `ae:review domain:document`。
5. 系统性为技能命令示例补充 PowerShell 写法，避免 Windows 默认环境下失败。
6. 增加测试覆盖：`review-selector` 应覆盖所有审查代理的可达性；`help-catalog-service` 应覆盖自定义 repoRoot；`ae-handoff` 应覆盖计划文件指定或文档说明一致性。
