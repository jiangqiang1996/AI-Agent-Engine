---
type: plan
status: drafted
date: 2026-05-21
title: unified-session-create-tool
depth: standard
---

# 通用新会话创建工具计划

## AI 解析契约
- canonicalKind: plan
- humanEquivalent: true
- stableIdsRequired: true
- implementationUnitsRequired: true
- noImplicitScope: true

## 来源与目标
来源：用户要求分析 `ae:handoff` 和 `ae:prompt-optimize` 的新会话创建工具，并抽取为一个通用创建新会话工具，通过参数决定新会话创建后是否自动执行；该工具不仅可被两个技能调用，也可被会话中的提示词主动调用。

目标：新增一个通用工具和服务，统一封装“创建新会话、可选注入上下文、可选发送提示词自动执行、可选导航、可选执行前确认”的能力，并迁移 `ae:handoff` 与 `ae:prompt-optimize` 复用该能力。

非目标：不新增新的 AE 技能或命令；不改变 `ae:handoff` 与 `ae:prompt-optimize` 的用户语义；不替换当前已验证的 `client.session.prompt` SDK 调用形态。

## 范围

### 包含
- 新增通用新会话创建服务。
- 新增通用工具 `ae-create-session`。
- 让 `ae:handoff` 和 `ae:prompt-optimize` 复用通用服务。
- 保留 `ae:handoff` 的 system 注入优先、普通消息降级、交接摘要输出。
- 保留 `ae:prompt-optimize` 的浏览器环境门禁注入和提示词失败回显。
- 补充服务层、工具层和回归测试。

### 不包含
- 不创建新技能或新命令。
- 不修改远程 Git、提交、推送或 PR。
- 不引入新的 SDK API，例如不直接替换为 `session.chat`。
- 不改变提示词优化阶段的确认流程。
- 不改变 `agent-browser` 环境证明硬门禁规则。

### 约束
- 面向插件用户的工具描述不得依赖本仓库 `.opencode/`、`AGENTS.md`、`opencode.json` 等源码仓库结构。
- `auto_execute` 默认必须为 `false`，避免工具被提示词主动调用时意外触发模型回复。
- 创建新会话是否需要执行前确认必须由调用方通过参数显式决定；工具本身不得按 `auto_execute`、`navigate` 或调用来源自行推断确认策略。
- 任何发送到新会话且可能触发浏览器能力的 `user_prompt` 都必须经过 `ensureBrowserEnvironmentGate()`。
- 导航失败不得阻断会话创建、上下文注入或提示词发送结果。
- system prompt 注入仍需保留降级路径，因为当前代码已显式兼容不同 OpenCode 版本。

## 需求追溯
| 需求 ID | 计划响应 |
|---------|----------|
| R1 抽取通用新会话创建能力 | U1, U2 |
| R2 支持参数控制是否自动执行 | U1, U2, U4 |
| R3 支持 `ae:handoff` 调用 | U3 |
| R4 支持 `ae:prompt-optimize` 调用 | U4 |
| R5 支持会话中提示词主动调用 | U2 |
| R6 保留浏览器环境门禁 | U1, U2, U4 |
| R7 保持现有行为兼容 | U3, U4, 最终验证与回归门禁 |
| R8 确认策略由调用方参数决定 | U2, U3, U4 |

## 高层技术设计
当前已有底层能力位于 `src/services/session.service.ts`：`createNewSession()`、`navigateToSession()`、`injectContextAsMessage()`。当前重复逻辑分散在 `src/services/handoff.service.ts` 和 `src/services/prompt-optimize.service.ts`。

新增 `src/services/session-create.service.ts`，只处理通用会话创建副作用，不承载 handoff 或 prompt optimize 的业务语义。

新增工具 `src/tools/ae-create-session.tool.ts`，注册名为 `ae-create-session`。它是工具，不是技能，不需要新增命令、catalog 或模型路由。

通用服务固定执行顺序：创建新会话 → 注入 system/context noReply 消息 → 尝试导航 → 可选发送 user prompt 自动执行。

### 关键决策
- D1. 新增独立 `session-create.service.ts`，不直接塞入 `session.service.ts` → 理由: 避免 `session.service.ts` 继续混合 handoff 格式化和通用流程，降低后续维护成本。
- D2. 新增工具而不新增技能/命令 → 理由: 用户要求“会话中的提示词主动调用”，工具注册即可满足；新增技能/命令会扩大资产同步面。
- D3. 自动执行采用显式参数，默认关闭 → 理由: 创建新会话和触发 AI 回复是明显副作用，默认自动执行风险高。
- D4. 浏览器门禁在通用工具的自动执行路径统一注入 → 理由: 避免绕过 `ae:prompt-optimize` 后直接用通用工具发送浏览器任务。
- D5. prompt 发送失败返回部分成功而非静默成功 → 理由: 当前 `prompt-optimize` fire-and-forget 会隐藏失败；通用工具应给调用方可观测状态，同时 `ae:prompt-optimize` 可保留原文回显恢复路径。
- D6. `ae-create-session` 不进入 `/ae-help` 技能/命令目录 → 理由: 本次目标是暴露给 LLM 主动调用的工具，不新增用户命令；若未来需要用户发现工具，应单独扩展 help catalog 的 tools 分组。
- D7. 通用工具的确认行为由调用方参数控制 → 理由: 创建会话、导航和自动执行的副作用边界应由调用该工具的一方决定；`ae-create-session` 只执行参数声明的确认策略，不再根据 `auto_execute` 或工具自身判断强制确认。

## 专项设计

### 工具参数
| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `title` | string optional | 自动生成 | 新会话标题 |
| `system_prompt` | string optional | 无 | 优先作为 system 上下文注入 |
| `context_message` | string optional | 无 | 普通 noReply 上下文消息，或 system 注入失败的降级内容 |
| `user_prompt` | string optional | 无 | 要发送到新会话的用户提示词 |
| `auto_execute` | boolean | false | 是否发送 `user_prompt` 并触发目标会话回复 |
| `navigate` | boolean | true | 是否自动切换到新会话 |
| `require_confirmation` | boolean required | 无默认值 | 是否在创建新会话前通过 `ctx.ask()` 请求确认；必须由调用方显式传入，工具不得自行改写 |
| `browser_gate_applied` | internal | 强制 | 自动执行前由服务内部强制注入浏览器 proof 门禁，不作为公开参数暴露 |

### 返回结构
| 字段 | 说明 |
|------|------|
| `success` | 整体是否成功 |
| `partial` | 是否部分成功 |
| `sessionId` | 新会话 ID |
| `sessionUrl` | 新会话 URL |
| `navigated` | 是否成功导航 |
| `contextInjected` | 是否成功注入上下文 |
| `fallbackMode` | system 注入是否降级为普通消息 |
| `promptSubmitted` | user prompt 是否已提交 |
| `promptAttempted` | 是否尝试提交 user prompt |
| `warnings` | 非阻断问题 |
| `error` | 阻断错误 |
| `recoverablePrompt` | 发送失败时可复制的 user prompt |
| `recoverableContext` | 注入失败时可复制的上下文 |

### 上下文注入语义
- `system_prompt` 存在时先尝试 system 注入。
- `context_message` 与 `system_prompt` 同时存在时，`context_message` 仅作为 system 注入失败后的 fallback 普通 noReply 消息，不得双重注入。
- 仅提供 `context_message` 且无 `system_prompt` 时，直接注入普通 noReply 消息。
- `recoverableContext` 必须返回实际尝试或可用于恢复的上下文文本。

### Prompt 自动执行语义
- `auto_execute=false` 时不得提交 `user_prompt`，即使调用方传入了 `user_prompt`。
- `auto_execute=true` 且 `user_prompt` 为空白时返回可恢复错误，不创建会触发回复的空任务。
- 浏览器门禁只在 `session-create.service.ts` 最终提交 prompt 前调用一次；迁移后 `ae-prompt-optimize.tool.ts` 不再直接调用 `ensureBrowserEnvironmentGate()`。
- `recoverablePrompt` 必须是实际尝试提交的 prompt，即经过 `ensureBrowserEnvironmentGate()` 后的文本；调用方如需展示用户确认原文，应单独保留原始 prompt。

### 工具确认边界
- `ae-create-session` 的确认行为只由 `require_confirmation` 参数决定；`require_confirmation=true` 时执行前通过 `ctx.ask()` 明确确认将创建新会话。
- `require_confirmation` 缺失时不得创建会话，返回中文可恢复错误，要求调用方明确传入 `true` 或 `false`。
- 确认请求需说明是否会导航、是否会自动发送 `user_prompt` 触发目标会话回复。
- 用户取消确认时，不创建会话，返回结构化可恢复结果或中文取消提示。
- `require_confirmation=false` 时不得调用 `ctx.ask()`，即使 `auto_execute=true`；调用方必须对跳过确认的上游交互语义负责。
- `ae:handoff` 和 `ae:prompt-optimize` 迁移为调用通用服务，不额外套用 `ae-create-session` 工具确认；如果未来改为调用工具层，必须显式传入 `require_confirmation=false` 以保持既有确认语义。

## 实现单元

### U1. 抽象通用会话创建服务
- [ ] 目标: 新增通用服务封装创建、注入、导航和可选自动执行流程。
- [ ] 覆盖需求: R1, R2, R6
- [ ] 依赖: 无
- [ ] 文件:
  - `src/services/session-create.service.ts`
  - `src/services/session.service.ts`
- [ ] 方法:
  - U1a 定义 `CreateSessionRequest`、`CreateSessionResult` 和结果状态语义，明确 `success`、`partial`、`warnings`、`recoverablePrompt`、`recoverableContext` 的返回条件。
  - U1b 在 `session.service.ts` 保留 SDK 原语并新增字符串级通用注入函数，例如 `injectNoReplyMessage(client, sessionId, text)` 和 system 优先注入 helper；不得让通用服务依赖 `SessionExtractResult`。
  - U1c 在 `session-create.service.ts` 复用 `createNewSession()` 与 `navigateToSession()` 编排创建、注入、导航和可选自动执行。
  - 自动执行前由 `session-create.service.ts` 调用 `ensureBrowserEnvironmentGate()`，并把实际提交文本写入 `recoverablePrompt`。
- [ ] 需遵循的模式:
  - 使用 Effect 风格。
  - SDK 返回形状兼容逻辑继续由 `createNewSession()` 承担。
  - 导航失败非致命。
  - system 注入失败降级普通 noReply 消息。
  - `session.service.ts` 只承载底层会话原语和字符串级注入能力；handoff 格式化逻辑不进入通用服务。
- [ ] 测试场景:
  - 正常路径: 仅创建、创建并注入、创建并自动执行。
  - 边界情况: 空标题、导航失败、system 不支持。
  - 错误路径: 客户端创建失败、返回缺少 id、注入双重失败、prompt 发送失败。
  - 集成场景: 浏览器 prompt 自动注入门禁。
- [ ] 验证:
  - `npx vitest run tests/services/session-create.service.test.ts`

### U2. 新增通用工具注册
- [ ] 目标: 暴露可被会话中模型主动调用的通用新会话创建工具。
- [ ] 覆盖需求: R1, R2, R5, R6, R8
- [ ] 依赖: U1
- [ ] 文件:
  - `src/tools/ae-create-session.tool.ts`
  - `src/tools/index.ts`
  - `src/schemas/ae-asset-schema.ts`
  - `tests/tools/ae-create-session.tool.test.ts`
  - `tests/schemas/ae-asset-schema.test.ts`
- [ ] 方法:
  - 在 `TOOL` 常量中新增工具名。
  - 在工具注册表中注册。
  - 工具层处理 `getGlobalClient()` 缺失。
  - 工具描述明确适用场景、副作用、自动执行默认关闭、浏览器门禁行为。
  - 新增公开必填参数 `require_confirmation`，无默认值；缺失时返回中文可恢复错误，要求调用方明确选择确认策略。
  - `require_confirmation=true` 时使用 `ctx.ask()` 确认创建新会话、副作用范围和自动执行行为；用户取消时不调用通用服务。
  - `require_confirmation=false` 时不得调用 `ctx.ask()`，直接按其他参数调用通用服务。
  - 同步编辑清单: 新增 `TOOL.AE_CREATE_SESSION` / `ae-create-session`，新增工具文件，在 `src/tools/index.ts` 导入并注册，补注册测试。
  - 不扩展 `help-catalog-service.ts`；该工具仅通过 OpenCode 工具注册暴露，不进入 AE 技能/命令帮助目录。
- [ ] 需遵循的模式:
  - 工具描述第一行不超过 50 字。
  - 参数使用 Zod 并带中文 `.describe()`。
  - 错误返回中文可恢复信息。
- [ ] 测试场景:
  - 正常路径: 仅创建、创建并注入、创建并自动执行、`require_confirmation=false` 时跳过 ask。
  - 边界情况: 导航失败、未提供标题时自动生成标题、浏览器门禁注入不破坏首 token 路由。
  - 错误路径: 客户端缺失、prompt 发送失败返回可复制 prompt、`auto_execute=true` 但 `user_prompt` 为空、`require_confirmation` 缺失、`require_confirmation=true` 但运行环境不支持 ask。
  - 集成场景: 工具调用通用服务，自动执行浏览器任务时强制注入 proof 门禁；最终提交给 `client.session.prompt` 的消息仍以原始首 token 开头，proof 检查要求位于首 token 之后，并保留原始用户提示词全文。
- [ ] 验证:
  - `npx vitest run tests/tools/ae-create-session.tool.test.ts`

### U3. 迁移 `ae:handoff` 复用通用服务
- [ ] 目标: 保持交接工具外部行为不变，同时移除专用创建/注入/导航重复逻辑。
- [ ] 覆盖需求: R3, R7, R8
- [ ] 依赖: U1
- [ ] 文件:
  - `src/services/handoff.service.ts`
  - `src/tools/ae-handoff.tool.ts`
  - `src/assets/skills/ae-handoff/SKILL.md`
  - `tests/services/handoff.service.test.ts`
  - `tests/tools/ae-handoff.tool.test.ts`
- [ ] 方法:
  - `handoff.service.ts` 继续负责生成交接标题和格式化交接 system/context。
  - 将 `formatSystemPrompt(extractResult)` 作为 `system_prompt` 传给通用服务，将 `formatContextMessage(extractResult)` 作为 fallback `context_message` 传给通用服务。
  - 调用通用服务执行创建、system 注入、降级和导航。
  - 工具输出继续展示 `fallbackMode`、新会话地址和提取摘要。
  - 如果现有测试文件不存在，新增最小测试覆盖服务迁移和工具输出，不重写整套 handoff 流程。
- [ ] 需遵循的模式:
  - 保留计划文件待办增强逻辑在 `ae-handoff.tool.ts`。
  - 不把 handoff 的结构化字段加入通用工具参数。
  - handoff 直接调用通用服务层时不触发 `ae-create-session` 工具确认；如果改为工具层调用，必须显式传入 `require_confirmation=false`。
  - system 注入失败仍整体成功但标记降级。
  - 不重复注入 system prompt 和普通 context message；普通 context 只在 system 注入失败时作为 fallback。
- [ ] 测试场景:
  - 正常路径: handoff 创建成功并返回新会话地址和交接摘要。
  - 边界情况: system 注入失败后普通 noReply 消息降级成功、导航失败但交接结果仍成功。
  - 错误路径: 客户端缺失、会话创建失败、system 与普通消息注入均失败。
  - 集成场景: `ae-handoff.tool.ts` 保留计划文件待办增强并调用通用服务。
- [ ] 验证:
  - `npx vitest run tests/services/handoff.service.test.ts tests/tools/ae-handoff.tool.test.ts`

### U4. 迁移 `ae:prompt-optimize` 复用通用服务
- [ ] 目标: 保持提示词优化提交行为，并统一使用通用会话创建服务。
- [ ] 覆盖需求: R4, R6, R7, R8
- [ ] 依赖: U1
- [ ] 文件:
  - `src/services/prompt-optimize.service.ts`
  - `src/tools/ae-prompt-optimize.tool.ts`
  - `src/assets/skills/ae-prompt-optimize/SKILL.md`
- [ ] 方法:
  - 保留 `generateSessionTitle()`。
  - `executePromptSubmit()` 改为调用通用服务并传入 `user_prompt`、`auto_execute: true`、`navigate: true`。
  - 浏览器门禁由通用服务在自动执行路径强制处理，不允许调用方关闭。
  - 从 `ae-prompt-optimize.tool.ts` 移除直接调用 `ensureBrowserEnvironmentGate()`，避免工具层和服务层重复注入。
  - `executePromptSubmit()` 必须检查通用服务结果；当 `partial === true && promptSubmitted === false` 时返回或抛出可由工具层识别的失败结果。
  - 工具层保留错误时返回已确认提示词原文。
- [ ] 需遵循的模式:
  - 不破坏 `-po`、`-pa`、`auto` 的技能流程。
  - prompt optimize 直接调用通用服务层时不触发 `ae-create-session` 工具确认；如果改为工具层调用，必须显式传入 `require_confirmation=false`，避免破坏 auto 模式跳过确认语义。
  - 首 token 路由不被浏览器门禁破坏；断言最终提交 prompt 仍以原始首 token 开头，门禁内容插入在首 token 之后。
  - 不递归触发 `ae:prompt-optimize`。
  - 服务层 `recoverablePrompt` 使用实际提交的安全 prompt；工具层失败文案可继续展示用户确认的原始提示词。
- [ ] 测试场景:
  - 正常路径: 成功提交、使用自定义标题。
  - 边界情况: 导航失败不阻断、浏览器任务门禁注入且不破坏首 token。
  - 错误路径: 创建失败、prompt 发送失败、空白提示词拒绝自动执行。
  - 集成场景: `ae-prompt-optimize.tool.ts` 保留错误时返回已确认提示词原文。
- [ ] 验证:
  - `npx vitest run tests/services/prompt-optimize.service.test.ts tests/tools/ae-prompt-optimize.tool.test.ts tests/services/prompt-optimize-browser-environment-gate.test.ts`

## 最终验证与回归门禁
- 依赖: U1-U4 全部完成。
- 检查项:
  - `TOOL.AE_CREATE_SESSION === 'ae-create-session'`。
  - `createToolRegistry()[TOOL.AE_CREATE_SESSION]` 存在。
  - 不新增 `SKILL` 或 `COMMAND`，因此不新增命令模型路由条目。
  - 不修改 `ae-catalog.ts` 或 `help-catalog-service.ts`，除非执行时发现现有测试已显式要求工具帮助目录。
  - 旧工具 `ae-handoff` 与 `ae-prompt-optimize` 仍可调用，并保留可观察输出语义。
  - `ae-create-session` 是否调用 `ctx.ask()` 仅由 `require_confirmation` 参数决定；`auto_execute=true` 本身不触发额外确认判断。
- 验证命令:
  - `npm run typecheck`
  - `npx vitest run tests/services/session-create.service.test.ts tests/tools/ae-create-session.tool.test.ts tests/services/prompt-optimize.service.test.ts tests/tools/ae-prompt-optimize.tool.test.ts tests/services/prompt-optimize-browser-environment-gate.test.ts`
  - `npx vitest run tests/schemas/ae-asset-schema.test.ts`

## 风险与应对
| 风险 | 影响 | 应对措施 |
|------|------|----------|
| 自动执行默认开启导致意外模型调用 | 用户只想创建会话却触发目标会话回复 | `auto_execute` 默认 false，工具描述强调副作用 |
| 通用工具绕过浏览器 proof 门禁 | 目标新会话可能直接执行 `agent-browser` | 通用服务在自动执行路径统一调用 `ensureBrowserEnvironmentGate()` |
| system 注入 API 兼容性不稳定 | 交接上下文无法作为系统信息注入 | 保留普通 noReply 消息降级，并返回 `fallbackMode` |
| prompt 发送失败被误报成功 | 用户以为目标新会话已自动执行 | 通用服务返回 `partial`、`promptAttempted`、`promptSubmitted` 和可复制 prompt |
| 抽象过度混入 handoff 业务语义 | 通用工具变复杂且难维护 | handoff 结构化字段保留在 handoff 工具和服务中 |
| 新增工具注册遗漏 | 会话中无法主动调用工具 | 同步 `TOOL` 常量和 `createToolRegistry()`，补注册测试 |
| 通用服务依赖 handoff 业务模型 | 通用会话创建能力被交接场景污染 | `session-create.service.ts` 只接收字符串级 system/context/user prompt，handoff 格式化留在 handoff 服务 |
| 失败回显使用未注入门禁 prompt | 用户手动复制后绕过浏览器 proof 门禁 | `recoverablePrompt` 返回实际提交的安全 prompt，工具层另保留原始提示词展示 |
| 调用方误传 `require_confirmation=false` | 用户未确认就创建会话、导航或触发目标会话回复 | 工具描述明确该参数的副作用责任；无默认值，调用方必须显式承担跳过确认的上游交互语义 |

## 待定问题

### 推迟到执行
- Q1. 如果现有 SDK 类型不接受 `system` 字段，执行时用最小类型断言保留兼容写法。
- Q2. 如果现有测试没有 handoff 覆盖，执行时新增最小测试，不为了覆盖率重写整套 handoff 流程。
- Q3. 如果执行时发现 `/ae-help` 已展示工具列表，再单独扩展 help catalog 的 tools 分组；否则不把 `ae-create-session` 塞入技能或命令目录。

## 等价性检查
- implementationUnitsCount: 4
- tracedRequirementsCount: 8
- decisionsCount: 7
- risksCount: 9
