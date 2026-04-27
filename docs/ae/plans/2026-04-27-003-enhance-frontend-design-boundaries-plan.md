---
type: plan
status: drafted
date: 2026-04-27
title: enhance-frontend-design-boundaries
origin: docs/ae/brainstorms/2026-04-27-frontend-design-boundaries-requirements.md
originFingerprint: 2026-04-27-frontend-design-boundaries
depth: standard
---

# 强化前端设计相关技能与代理边界计划

## 来源需求

来源文档：`docs/ae/brainstorms/2026-04-27-frontend-design-boundaries-requirements.md`

本计划覆盖以下需求：
- R1：明确 `ae:frontend-design` 是前端设计与初版实现入口。
- R2：明确 `ae:test-browser` 是浏览器验收入口。
- R3：明确 `design-iterator` 是多轮审美迭代代理。
- R4：明确 `figma-design-sync` 是 Figma 对齐代理。
- R5：为相关资产加入条件性的“下一步提示”规则。
- R6：明确常见顺序链路清单。
- R7：建立四类场景的入口和转交矩阵。
- R8：避免重复验证链路。

## 计划目标

通过修改现有资产说明和入口描述，让四个前端相关能力在运行时具备更清晰的职责边界、非目标、条件性转交规则和下一步提示。改动不新增技能或代理，不改变工具执行逻辑或运行时行为。

## 高层设计

采用统一边界模型：

| 场景 | 首选入口 | 可选后续 | 不应使用 |
|------|----------|----------|----------|
| 无 Figma 的初版设计、新页面、新组件 | `/ae-frontend-design` | `@design-iterator`、`/ae-test-browser` | `@figma-design-sync` |
| 已实现 UI 需要多轮审美打磨 | `@design-iterator` | `/ae-test-browser`；如出现 Figma 对齐目标则转 `@figma-design-sync` | `/ae-frontend-design` 重新吞并流程 |
| 需要按 Figma 对齐 | `@figma-design-sync` | `/ae-test-browser` | `/ae-frontend-design` 自由设计、`@design-iterator` 主观打磨 |
| 浏览器交互验收、E2E、截图证据 | `/ae-test-browser` | 失败后按问题类型转修复、`@design-iterator` 或 `@figma-design-sync` | 让设计类能力承担完整 E2E |

下一步提示必须是条件性建议：只有当用户明确要求视觉打磨、Figma 对齐、交互验收，或当前结果自然暴露这些后续需求时才提示。简单任务完成且无后续风险时允许直接结束。

## 实现单元

- [ ] 单元 1：强化 `ae:frontend-design` 的边界与交接
  - 目标：让该技能清楚定位为“设计与初版实现入口”，并把多轮迭代、Figma 对齐、完整 E2E 转交给对应能力。
  - 需求：覆盖 R1、R5、R6、R7、R8。
  - 文件：`src/assets/skills/ae-frontend-design/SKILL.md`
  - 方法：同步检查 frontmatter `description` 与正文；在 `## 视觉验证` 前新增 `## 边界与交接`，使用短列表说明“负责 / 不负责 / 何时建议下一步”。
  - 需遵循的模式：保留现有“检测上下文 -> 规划设计 -> 构建 -> 视觉验证”流程；不要把一轮视觉验证扩展成完整测试流程。
  - 验收：frontmatter 与正文都明确 `ae:frontend-design` 负责初版设计实现和视觉质量闭环；用户明确要求多轮风格探索或初版可用后仍需主观审美优化时建议 `@design-iterator`；Figma 对齐建议 `@figma-design-sync`；完整浏览器验收建议 `/ae-test-browser`。
  - 测试场景：人工阅读确认四类场景均可从本技能找到正确后续；确认简单 UI 任务不会被强制串联后续流程。

- [ ] 单元 2：强化 `ae:test-browser` 的验收边界与反向转交
  - 目标：让该技能清楚定位为“浏览器验收入口”，避免承担审美设计或 Figma 对齐。
  - 需求：覆盖 R2、R5、R6、R7、R8。
  - 文件：`src/assets/skills/ae-test-browser/SKILL.md`
  - 方法：同步检查 frontmatter `description` 与正文；在 `## 前提条件` 后新增 `## 边界`；在失败处理附近补充问题类型到后续能力的转交规则。
  - 需遵循的模式：保留安装检查、模式选择、路由推断、截图和测试总结流程。
  - 验收：文档明确功能/交互失败可报告或局部修复后重测；主观审美问题建议 `@design-iterator`；Figma 偏差建议 `@figma-design-sync`；不把测试截图解释为设计迭代主循环。
  - 测试场景：人工检查失败路径是否能区分交互失败、审美问题、Figma 偏差；确认测试总结仍是最终输出主线。

- [ ] 单元 3：强化 `design-iterator` 的入口限制与停止/转交阈值
  - 目标：让该代理只处理已实现 UI 的多轮小步视觉打磨，避免替代初版设计、Figma 对齐或完整 E2E。
  - 需求：覆盖 R3、R5、R6、R7。
  - 文件：`src/assets/agents/workflow/design-iterator.md`
  - 方法：同步检查 frontmatter `description` 与正文；在 `## 核心方法论` 后新增 `## 适用边界`；在输出格式或重要准则附近新增最终交接说明。
  - 需遵循的模式：保留“截图、分析、实现、记录、重复”的迭代方法；每轮仍只做 1-2 个针对性修改。
  - 验收：文档明确无已实现页面或目标区域时不应直接使用该代理；出现 Figma 标准时转 `@figma-design-sync`；需要完整交互验收时建议 `/ae-test-browser`；需要改变产品范围时回到上游设计或规划流程。
  - 测试场景：人工检查代理不会鼓励新增功能、重排信息架构或绕过 Figma 对齐。

- [ ] 单元 4：强化 `figma-design-sync` 的 Figma 优先边界与验收交接
  - 目标：让该代理以 Figma 为准进行视觉同步，避免自由发挥设计方向或承担完整 E2E。
  - 需求：覆盖 R4、R5、R6、R7。
  - 文件：`src/assets/agents/workflow/figma-design-sync.md`
  - 方法：同步检查 frontmatter `description` 与正文；扩展现有 `## 边界情况处理`，补充职责边界；在 `## 成功标准` 前新增 `## 交接输出`。
  - 需遵循的模式：保留 Figma 规格采集、实现截图采集、系统化对比、差异报告、精确修复、验证确认流程。
  - 验收：文档明确所有视觉修改应能追溯到 Figma 差异；主观美化转 `@design-iterator`；真实交互验收转 `/ae-test-browser`；缺少 Figma URL 或 Web URL 时先请求补充。
  - 测试场景：人工检查代理不会把“对齐 Figma”扩展成重新设计 Figma 或自由优化 UI。

- [ ] 单元 5：同步 catalog 入口描述
  - 目标：确认技能选择入口不会与新增正文边界冲突。
  - 需求：覆盖 R5、R7。
  - 文件：`src/services/ae-catalog.ts`
  - 方法：检查 `ae:frontend-design`、`ae:test-browser` 的 catalog 描述是否与 SKILL.md frontmatter 和正文边界语义一致；如果存在泛化或误导，直接同步描述。
  - 需遵循的模式：保持 `description` 与 SKILL.md frontmatter 语义一致，`argumentHint` 与 `argument-hint` 字面一致。
  - 验收：catalog 不把 `ae:frontend-design` 描述成完整测试能力，不把 `ae:test-browser` 描述成设计优化能力。
  - 测试场景：如修改 TypeScript，运行 `npm run typecheck`。

- [ ] 单元 6：同步用户手册入口说明
  - 目标：确认用户文档不会给出与资产边界冲突的选择建议。
  - 需求：覆盖 R5、R6、R7。
  - 文件：`docs/ae/usage-guide.md`
  - 方法：检查前端设计、浏览器测试、代理调用相关说明；如存在旧边界或错误调用格式，更新为统一入口矩阵和条件性下一步提示。
  - 需遵循的模式：保持文档简洁，不复制四个资产的完整提示词。
  - 验收：用户能从手册区分 `/ae-frontend-design`、`/ae-test-browser`、`@design-iterator`、`@figma-design-sync` 的首选场景和后续关系。
  - 测试场景：人工确认用户手册中的代理引用格式与项目实际调用格式一致。

- [ ] 单元 7：验证边界一致性
  - 目标：确认四个资产共同表达同一套边界模型。
  - 需求：覆盖 R1-R8。
  - 文件：上述所有修改文件。
  - 方法：按入口矩阵逐项核对每个资产的“做什么 / 不做什么 / 何时转交 / 允许就地处理的例外”，并在执行总结中留下四类场景的核对结果。
  - 验收：四个资产没有互相矛盾的转交规则；下一步提示均为条件性建议；简单任务可直接结束。
  - 测试场景：运行 `npm run build` 验证资产同步；如涉及 TypeScript，再运行 `npm run typecheck`。

- [ ] 单元 8：执行提示词级验收
  - 目标：验证新增边界不只是文本一致，也能支持正确入口选择和条件性转交判断。
  - 需求：覆盖 R5、R6、R7、R8。
  - 文件：修改过的资产和文档。
  - 方法：用代表性场景逐条人工验收推荐入口、允许就地处理和是否避免强制串联。
  - 需遵循的模式：验收不要求运行真实浏览器，只检查提示词和入口说明是否能导向正确能力。
  - 验收：至少覆盖无 Figma 初版、已实现 UI 打磨、Figma 对齐、浏览器验收、混合请求、简单任务结束六类提示词场景。
  - 测试场景：记录每个场景的期望入口与期望后续，例如“按 Figma 做一个新页面并验收交互”应先用 `/ae-frontend-design` 建立最小实现骨架，再用 `@figma-design-sync` 完成对齐，最后按需 `/ae-test-browser` 验收交互。

## 关键阈值

- `ae:frontend-design` 初版验收未达成时允许继续就地修正；只有在初版可用后，用户明确要求多轮风格探索、持续审美优化，或连续修复仍未达到视觉目标时，才建议 `design-iterator`。
- 用户提供 Figma URL 或明确要求匹配设计稿时，如果已有 Web 实现，优先使用 `@figma-design-sync`；如果尚无 Web 实现，先用 `/ae-frontend-design` 建立最小实现骨架，再使用 `@figma-design-sync` 对齐。
- 用户要求完整 E2E、关键交互测试、流程验收或截图证据时，使用 `/ae-test-browser`。
- `@design-iterator` 需要改变产品范围、信息架构或新增功能时，应回到 `/ae-frontend-design` 或上游规划流程。
- `/ae-test-browser` 发现功能/交互失败可报告或局部修复后重测；发现主观审美问题转 `@design-iterator`；发现 Figma 偏差转 `@figma-design-sync`。

## 风险与缓解

- 风险：下一步提示被理解为强制流程。缓解：所有新增提示使用“如需 / 如果 / 建议”表达，并明确简单任务可直接结束。
- 风险：边界强化导致代理拒绝处理可就地解决的小问题。缓解：为每个能力保留最小例外，如明显视觉破损、局部测试失败、为匹配 Figma 所需的轻微结构调整。
- 风险：只改正文无法影响所有入口选择。缓解：单元 5 检查 catalog 和用户手册，并同步入口描述。

## 验证计划

- 人工核对四类场景入口矩阵与四个资产正文一致。
- 在 `src/assets/skills/`、`src/assets/agents/workflow/`、`src/services/ae-catalog.ts`、`docs/ae/usage-guide.md` 中搜索 `frontend-design`、`test-browser`、`E2E`、`设计优化`、`Figma`、`截图验证` 和旧代理前缀，确认没有过期边界或错误代理引用。
- 用六类代表性提示词场景做入口选择验收：无 Figma 初版、已实现 UI 打磨、Figma 对齐、浏览器验收、混合请求、简单任务结束。
- 运行 `npm run build`，确认资产同步流程正常。
- 如果修改 `src/services/ae-catalog.ts`，运行 `npm run typecheck`。

## 推迟到执行时的事项

- 执行时根据资产原文选择最小措辞改动，避免重写大段提示词。
- 执行时确认 agent 引用格式使用项目实际支持的写法，保持现有风格一致。

## 下一步

-> /ae-work
