---
type: plan
status: completed
date: 2026-04-27
title: enhance-test-case-reviewer
depth: standard
---

# 完善测试用例审查代理计划

## 问题框架

`test-case-reviewer` 当前能审查测试用例文档的需求对齐、步骤可执行性、边界异常和预期结果，但审查焦点以平铺列表呈现，缺少系统化分类，也没有显式覆盖输入校验、必填字段、业务规则、权限与数据可见性、状态转换、关键组合场景和校验点充分性。

目标是将该代理重组为更完整、边界更清晰的测试用例文档审查者，同时避免与代码测试审查、测试自动化策略或需求文档审查职责重叠。

## 范围

包含：
- 重组 `src/assets/agents/review/test-case-reviewer.md` 的审查焦点。
- 同步公开描述，确保 agent frontmatter、review catalog 和 AE catalog 语义一致。
- 补充选择契约、描述一致性检查和提示词行为样例验收。
- 明确误报抑制边界：外部需求不可幻想、组合场景不可穷举、自动化策略不属于此代理职责。

不包含：
- 修改 `test-case-reviewer` 的激活条件。
- 新增代理或更改代理名称常量。
- 修改 `testing-reviewer` 的代码测试审查职责。
- 设计测试自动化框架、CI 流程或测试代码质量规则。

## 相关文件

- `src/assets/agents/review/test-case-reviewer.md`
- `src/services/review-catalog.ts`
- `src/services/ae-catalog.ts`
- `src/services/review-selector.test.ts`
- `src/tools/ae-review-contract.tool.ts`
- `src/tools/ae-review-contract.tool.test.ts`
- `README.md`
- `docs/ae/usage-guide.md`

## 技术设计

保持现有文档域激活机制不变：`documentType === 'test'` 时激活 `test-case-reviewer`。本次变更主要是提示词和公开目录描述的质量提升，不引入新的运行时选择逻辑。

推荐将审查焦点重组为 5 个一级维度；如果执行时发现 4 类或 6 类更自然，可以调整分组，但必须覆盖下面列出的能力和边界：

1. **结构完整性**：用例内部一致性、编号与引用体系、用例粒度。
2. **覆盖完备性**：需求与验收标准对齐、输入校验与字段约束、业务规则与决策表、状态转换与生命周期、角色权限与数据可见性、边界异常与关键组合。
3. **可执行性**：步骤可执行性、前置条件、数据准备与独立性、清理与隔离。
4. **可验证性**：预期结果明确性、校验点充分性、正负向结果区分、可观察性。
5. **经济性与风险对齐**：冗余与遗漏、优先级风险对齐、明确风险信号下的回归覆盖、延期/暂不测试声明与覆盖声明一致性。

关键边界：
- 需求对齐只能基于测试文档中显式列出的需求编号、验收标准或需求摘要；如果没有需求来源，只能报告可追踪性风险，不能断言具体需求缺失。
- 所有新增覆盖维度都必须有来源门控：只有当测试文档、需求摘要、验收标准、字段定义、角色模型、业务对象或流程描述显式涉及对应概念时，才检查输入约束、权限、状态、生命周期、租户、业务规则等覆盖。
- 关键组合场景只覆盖业务规则、权限、状态、输入边界之间有来源证据的高风险组合，不要求笛卡尔积穷举。
- 明确标注为“暂不测试”“后续版本验证”“已废弃”的低风险条目默认不作为缺陷报告；高风险延期项应进入 `residual_risks`，除非延期声明与完整覆盖声明互相矛盾，此时可作为 finding。
- 全局前置条件、公共测试数据或公共账号声明可被单个用例复用，不要求每个用例重复声明。

## 实现单元

### [ ] 单元 1：重组测试用例审查代理正文

目标：将 `test-case-reviewer` 从平铺审查点改为清晰分类框架，并补齐缺失角度。

需求：
- 保留当前代理定位：只审查测试用例文档，不评判代码实现。
- 新增输入校验与字段约束检查，覆盖文档有来源证据的必填/选填、类型、格式、长度、枚举、默认值、跨字段依赖。
- 新增业务规则与决策表覆盖，覆盖文档有来源证据的条件分支、计算规则、唯一性、阈值、互斥规则。
- 新增角色、权限与数据可见性覆盖，覆盖文档有来源证据的有权限、无权限、跨角色、跨组织/租户、访问他人数据。
- 新增状态转换与生命周期覆盖，覆盖文档有来源证据的合法转换、非法跳转、取消、回退、重复操作。
- 新增校验点充分性，避免只验证最终结果而遗漏关键中间状态。
- 保留置信度门控和 JSON 输出要求。

依赖：无。

文件：
- `src/assets/agents/review/test-case-reviewer.md`

方法：
- 将 `## 审查焦点` 改为 5 个加粗维度，每个维度下描述 2-6 个检查点。
- 调整 `## 不在标记范围内`，明确外部需求不可幻想、自动化策略不审查、低风险明确延期项默认不作为 finding，高风险延期项进入 `residual_risks`。
- 在置信度校准中加入“无外部需求来源时不能高置信断言具体需求缺失”的约束。

测试场景：
- 正常路径：测试用例文档列出 `R1/R2/R3`，但只有 `TC-01 -> R1`，代理应能指出 `R2/R3` 缺少对应测试。
- 边界情况：测试文档没有需求编号，但步骤和预期完整，代理不应凭空报告“R1 未覆盖”。
- 错误路径：测试文档列出了字段定义、必填规则、格式限制、角色差异或状态流转，但测试用例只写“提交成功”时，代理应能产出有证据的覆盖缺口。
- 负向路径：测试文档未出现字段规则、权限模型或状态机时，代理不应强行要求字段、权限或状态测试。

验证：
- 人工检查代理正文仍要求 findings schema JSON，且没有引导输出 Markdown 说明。
- 人工检查新维度不越界到自动化框架或代码测试质量。

### [ ] 单元 2：同步公开描述

目标：确保代理描述与新职责语义一致，避免目录和帮助信息弱化“步骤可执行性”和新增覆盖维度。

需求：
- frontmatter `description` 与 `review-catalog`、`ae-catalog` 描述保持语义一致。
- 描述应简洁，不把所有细分角度塞入单行描述。

依赖：单元 1。

文件：
- `src/assets/agents/review/test-case-reviewer.md`
- `src/services/review-catalog.ts`
- `src/services/ae-catalog.ts`
- `README.md`
- `docs/ae/usage-guide.md`

方法：
- 将公开描述统一为类似“审查测试用例文档的结构完整性、覆盖完备性、步骤可执行性、结果可验证性和需求对齐程度”。
- 如果 README 或 usage guide 中存在代理速查表，同步对应描述。
- 如果 README 或 usage guide 说明审查入口，补充“测试用例文档应以 `kind: 'test'` 或等价测试文档分类进入审查”的可发现性说明。
- 不修改 `src/schemas/ae-asset-schema.ts`，因为代理名称和数量不变。

测试场景：
- 正常路径：帮助目录中 `test-case-reviewer` 的描述与代理 frontmatter 语义一致。
- 边界情况：描述不应暗示该代理会审查测试代码、自动化策略或 CI。

验证：
- 搜索 `test-case-reviewer` 和旧描述片段，确认没有过期描述残留。

### [ ] 单元 3：补充选择逻辑回归测试

目标：保证文档类型为 `test` 时仍正确激活代理，其他文档类型不会误激活。

需求：
- `documentType: 'test'` 激活 `test-case-reviewer`。
- `requirements`、`plan`、`general` 不应仅因文档域而激活 `test-case-reviewer`。
- 多条件激活时 reviewers 不重复。

依赖：单元 2。

文件：
- `src/services/review-selector.test.ts`

方法：
- 扩展 `review-selector` 文档域负例测试。

测试场景：
- 正常路径：`documentType: 'test'` 返回 `test-case-reviewer`。
- 边界情况：`requirements`、`plan`、`general` 不返回 `test-case-reviewer`。
- 集成边界：`documentType: 'test' + requirementCount >= 5` 同时激活相关条件审查者且无重复。

验证：
- `npm run test`
- 可选聚焦：`npx vitest run src/services/review-selector.test.ts`

### [ ] 单元 4：补充审查契约工具测试

目标：固定 `ae-review-contract` 对测试文档入口的公开契约，避免增强后的代理不可达。

需求：
- `kind: 'test'` 返回 `documentType: 'test'` 且 reviewers 包含 `test-case-reviewer`。
- `kind: 'document'` 当前默认映射为 requirements，不应返回 `test-case-reviewer`，避免误解契约。
- `kind: 'plan'` 不返回 `test-case-reviewer`。
- 返回 JSON 可解析。

依赖：单元 3。

文件：
- `src/tools/ae-review-contract.tool.test.ts`

方法：
- 复用相邻工具测试模式调用工具 execute。
- 对 JSON 解析后的 `documentType`、`reviewers` 和 `kind` 做断言。

测试场景：
- 正常路径：`kind: 'test'` 包含 `test-case-reviewer`。
- 边界情况：`kind: 'document'` 和 `kind: 'plan'` 不包含 `test-case-reviewer`。
- 错误路径：返回不可解析 JSON 时测试失败。

验证：
- `npx vitest run src/tools/ae-review-contract.tool.test.ts`

### [ ] 单元 5：补充描述一致性检查

目标：确保公开目录描述没有过期，但避免把自然语言锁死到脆弱关键词。

需求：
- agent frontmatter、`review-catalog`、`ae-catalog` 描述语义一致。
- 不强制完全相同措辞，避免同义改写导致测试脆弱。

依赖：单元 2。

文件：
- `src/services/review-catalog.test.ts`（如已有则扩展；如不存在则按项目测试规范新建）
- 相关 catalog/help 测试文件（执行时以现有测试模式为准）

方法：
- 优先使用现有 catalog/help 测试模式做宽松断言或快照检查。
- 如果没有合适测试模式，保留人工检查：搜索 `test-case-reviewer` 和旧描述片段，确认没有过期描述残留。

测试场景：
- 正常路径：目录描述表达测试用例文档的结构、覆盖、可执行、可验证和需求对齐能力。
- 边界情况：描述不暗示审查测试代码、自动化框架或 CI。

验证：
- `npm run test`

### [ ] 单元 6：补充提示词行为样例验收

目标：验证提示词改写不会导致代理幻想约束、误报不相关维度或忽略高风险延期。

需求：
- 无需求来源不得断言具体需求缺失。
- 显式列出 `R1/R2` 且缺对应测试时可报告。
- 高风险延期项进入 `residual_risks`，低风险明确延期项默认不作为 finding。
- 简单无权限模型、无字段规则、无状态机的场景不得要求权限/字段/状态测试。

依赖：单元 1。

文件：
- `src/assets/agents/review/test-case-reviewer.md`
- 可选：`docs/ae/` 下临时审查样例不应提交，除非项目已有样例测试目录。

方法：
- 准备最小人工验收清单或轻量样例文档，在执行审查时用于验证代理行为。
- 如果项目已有适合的 prompt/golden 测试模式，则将样例纳入自动测试；否则作为执行验收步骤记录。

测试场景：
- 无需求来源：只报告可追踪性风险，不断言具体 `R#` 缺失。
- 显式需求缺覆盖：可输出 finding。
- 高风险延期：进入 residual risks。
- 无权限/状态来源：不要求权限或状态测试。

验证：
- 人工检查或现有 golden 测试通过。

### [ ] 单元 7：执行全量验证和文档质量检查

目标：确认文本变更、目录同步和测试补充没有破坏构建或类型约束。

需求：
- 类型检查通过。
- 测试通过。
- 构建通过。
- 新代理正文符合审查代理格式，保留 `## 置信度校准`、`## 不在标记范围内`、`## 输出格式`。

依赖：单元 1、单元 2、单元 3、单元 4、单元 5、单元 6。

文件：
- 无新增业务文件。

方法：
- 运行项目标准验证命令。
- 对 `test-case-reviewer.md` 做人工检查，确认职责边界和输出格式未被破坏。

测试场景：
- 正常路径：所有验证命令通过。
- 边界情况：如果只改 Markdown 但测试失败，优先排查描述一致性或新增工具测试 mock 方式。

验证：
- `npm run typecheck`
- `npm run test`
- `npm run build`

## 风险与缓解

- **误报外部需求缺失**：在代理正文中明确只能基于当前测试文档显式需求判断覆盖。
- **误报未声明约束缺失**：所有新增维度都加入来源门控，无字段定义、权限模型或状态机时不得要求对应测试。
- **组合场景无限扩张**：限定为有来源证据的关键组合，不要求穷举所有排列组合。
- **高风险延期被沉默**：延期项不直接阻断，但高风险延期进入 `residual_risks`。
- **职责重叠**：保留“不审查测试自动化策略、代码层测试质量、测试风格偏好”的排除范围。
- **描述不一致**：同步更新 frontmatter、`review-catalog`、`ae-catalog` 和公开文档中的描述。
- **工具契约误解**：用测试固定 `kind: 'test'` 与 `kind: 'document'` 的不同行为。

## 推迟到实现时的问题

- `README.md` 和 `docs/ae/usage-guide.md` 是否存在对应代理速查表，执行时以搜索结果为准；不存在则无需创建新章节。
- `src/tools/ae-review-contract.tool.test.ts` 是否已有测试辅助函数，执行时先复用现有测试模式；若不存在，按相邻工具测试最小化新建。

## 成功标准

- `test-case-reviewer` 的审查焦点按清晰分类重组，并明确覆盖必填字段、输入约束、业务规则、权限可见性、状态转换和校验点充分性。
- 代理边界更清晰，不会要求自动化框架、不幻想外部需求、不要求未声明的字段/权限/状态测试、不要求穷举组合。
- 公开描述与代理实际职责语义一致。
- `kind: 'test'` 的审查契约和选择逻辑有测试保护。
- 至少完成最小行为样例验收，覆盖无来源不误报、显式需求缺覆盖可报告、高风险延期进入 residual risks、无权限/状态来源不强制要求。
- `npm run typecheck`、`npm run test`、`npm run build` 通过。

## 下一步

进入 `ae:work` 执行本计划。
