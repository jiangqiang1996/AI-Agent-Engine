---
date: 2026-04-24
status: active
topic: prompt-optimize
depth: standard
source: docs/ae/brainstorms/2026-04-24-prompt-optimize-requirements.md
---

# 提示词优化技能实施计划

## 概述

实现 `ae:prompt-optimize` 技能，将用户随意输入的提示词优化为结构化的 AI 对话提示词，经用户确认后在新会话中自动提交执行。支持 auto 模式跳过确认。

## 上游需求

来源：`docs/ae/brainstorms/2026-04-24-prompt-optimize-requirements.md`（R1-R16）

## 技术决策

- **复用 session.service.ts 公共函数**：`createNewSession()`、`navigateToSession()` 已封装会话创建和 TUI 导航逻辑，直接复用，不重复实现
- **不复用 handoff.service.ts**：handoff 的核心流程（系统上下文注入 + noReply）与本需求（用户消息发送 + 触发回复）路径不同，创建独立 service
- **auto 模式由 SKILL.md 驱动**：LLM 在解读技能指令时识别 auto 标记（`auto`/`自动`/`mode=auto`/`无需确认`），决定是否跳过确认环节。工具层不感知 auto 逻辑，保持单一职责
- **引用识别基于格式模式**：在 SKILL.md 中定义引用识别规则为格式模式匹配（`/xxx` 命令、`@xxx` 代理、包含 `:` 或 `-` 连接的多词标识符如 `ae:brainstorm` 技能/工具），匹配到的原样保留，不校验正确性，不当作英语单词对待
- **使用 SDK OpencodeClient 类型**：不复用 session.service.ts 的 SessionPromptClient 局部接口（其 noReply 为必填 boolean），直接使用 SDK 原始类型（与 ae-orchestrator.tool.ts 模式一致），设置 `noReply: false` 触发 AI 回复
- **命令文件自动生成**：`command-registration.ts` 从 catalog 条目自动生成命令模板，无需手动创建命令 .md 文件

## 实现单元

### 单元 1：资产常量注册

**目标：** 在 ae-asset-schema.ts 中注册新的 SKILL、COMMAND、TOOL 常量

**需求：** R15

**依赖：** 无

**文件：**
- `src/schemas/ae-asset-schema.ts`

**方法：**
1. 在 `SKILL` 对象中添加 `PROMPT_OPTIMIZE: 'ae:prompt-optimize'`（按 skill-list-order 规则，放在 HANDOFF 之后、TASK_LOOP 之前）
2. 在 `COMMAND` 对象中添加对应条目 `PROMPT_OPTIMIZE: 'ae-prompt-optimize'`
3. 在 `TOOL` 对象中添加 `AE_PROMPT_OPTIMIZE: 'ae-prompt-optimize'`
4. 将新值添加到 `AeSkillNameSchema` 和 `AeCommandNameSchema` 的 `.enum()` 数组中

**遵循模式：** 现有 SKILL/COMMAND/TOOL 常量定义和枚举注册模式

**验证：** `npm run typecheck` 通过

---

### 单元 2：技能目录条目

**目标：** 在 ae-catalog.ts 中添加提示词优化的目录条目

**需求：** R16

**依赖：** 单元 1

**文件：**
- `src/services/ae-catalog.ts`

**方法：**
1. 在 `PHASE_ONE_ENTRIES` 数组中添加新条目，使用单元 1 定义的常量
2. 条目内容：
   - `skillName: SKILL.PROMPT_OPTIMIZE`
   - `skillSlug: skillDir(SKILL.PROMPT_OPTIMIZE)`
   - `commandName: COMMAND.PROMPT_OPTIMIZE`
   - `description: '提示词优化：将用户随意输入优化为结构化 AI 对话提示词，确认后在新会话中自动执行'`
   - `argumentHint: '[auto] [提示词内容]'`
   - `defaultEntry: false`
   - `skillFile` 指向 SKILL.md

**遵循模式：** 现有 PHASE_ONE_ENTRIES 条目格式

**验证：** `npm run typecheck` 通过

---

### 单元 3：提示词优化服务

**目标：** 创建 service 层，封装会话创建和提示词自动提交逻辑

**需求：** R9-R11

**依赖：** 无（复用 session.service.ts）

**文件：**
- `src/services/prompt-optimize.service.ts`（新建）

**方法：**
1. 定义自定义错误类型：
   - `PromptSessionCreateError` —— 会话创建失败
   - `PromptSubmitError` —— 提示词提交失败
2. 定义 `PromptOptimizeResult` 接口，包含：success、sessionId、sessionUrl、navigated（非致命，可为 false）、error
3. 实现 `generateSessionTitle(prompt: string): string` —— 跳过提示词开头的命令引用和空白字符，从实际语义内容中提取前 15 字符生成标题，格式 `优化：[摘要]...`；若提取内容为空则使用时间戳回退
4. 实现 `executePromptSubmit(client: OpencodeClient, optimizedPrompt: string, sessionTitle?: string): Effect.Effect<PromptOptimizeResult, PromptSessionCreateError | PromptSubmitError>` —— 核心流程：
   a. 调用 `createNewSession()` 创建新会话
   b. 调用 `client.session.prompt()` 发送优化后的提示词作为用户消息，设置 `noReply: false`，触发 AI 自动回复（已有 ae-orchestrator.tool.ts 佐证此行为）
   c. 调用 `navigateToSession()` 导航到新会话（失败为非致命，navigated=false）
   d. 封装返回结果

**遵循模式：** `handoff.service.ts` 的 Effect.gen + Effect.tryPromise + 自定义错误类型模式；复用 `session.service.ts` 的 `createNewSession()` 和 `navigateToSession()`；client 参数使用 SDK `OpencodeClient` 类型

**测试场景：**
- 正常路径：创建会话、发送消息、导航成功
- 边界：空提示词、超长提示词
- 错误：客户端为 null、会话创建失败、导航失败（非致命，success 仍为 true）

**验证：** 单元测试通过

---

### 单元 4：自定义工具

**目标：** 创建 ae-prompt-optimize 工具，供 LLM 调用以提交优化后的提示词

**需求：** R14

**依赖：** 单元 1、单元 3

**文件：**
- `src/tools/ae-prompt-optimize.tool.ts`（新建）

**方法：**
1. 使用 `tool()` 定义工具，description 包含以下内容：
   - 简短摘要：将优化后的提示词提交到新会话并自动执行
   - 功能说明：创建新会话、发送提示词、触发 AI 回复、导航到新窗口
   - 适用场景：提示词优化完成后提交执行、auto 模式下自动提交
   - 不适用场景：需要注入系统上下文（用 ae-handoff）、需要多轮交互修改提示词（在 SKILL.md 层面处理）
2. 参数设计：
   - `optimized_prompt`: `z.string().min(1).max(50000)` — 优化后的完整提示词（超长返回友好错误）
   - `session_title`: `z.string().optional()` — 可选的会话标题
3. execute 函数：
   a. 获取 `getGlobalClient()`，检查 ctx.abort 状态
   b. 通过 `ctx.metadata()` 反馈进度：`正在创建新会话...`、`正在提交优化提示词...`、`正在导航到新会话...`
   c. 调用 `executePromptSubmit()` 提交提示词
   d. 返回中文结果消息（成功/失败 + 会话地址 + 导航状态降级提示）

**遵循模式：** `ae-handoff.tool.ts` 的 tool() 定义模式；增加 ctx.metadata() 和 ctx.abort 处理

**测试场景：**
- 正常路径：成功提交并导航
- 错误路径：客户端未初始化
- 边界：空提示词（被 Zod 拦截）、超长提示词（被 max 限制）
- 取消：ctx.abort 触发时的行为

**验证：** 单元测试通过

---

### 单元 5：工具注册

**目标：** 将新工具注册到工具注册表

**需求：** R14

**依赖：** 单元 1、单元 4

**文件：**
- `src/tools/index.ts`

**方法：**
1. 导入 `aePromptOptimizeTool`
2. 在 `createToolRegistry()` 返回对象中添加 `[TOOL.AE_PROMPT_OPTIMIZE]: aePromptOptimizeTool`

**遵循模式：** 现有工具注册模式

**验证：** `npm run typecheck` 通过，`npm run build` 通过

---

### 单元 6：SKILL.md 技能定义

**目标：** 创建技能定义文件，指导 LLM 执行提示词优化和提交流程

**需求：** R1-R8, R12, R13

**依赖：** 单元 1（命名一致性）

**文件：**
- `src/assets/skills/ae-prompt-optimize/SKILL.md`（新建）

**方法：**
编写 SKILL.md，包含以下章节：

1. **YAML frontmatter**：name=`ae:prompt-optimize`，description=技能描述
2. **功能说明**：概述优化目标和约束
3. **执行流程**：
   - 阶段 1：解析用户输入
     - 识别 auto 标记：`auto`、`自动`、`mode=auto`、`无需确认`、`跳过确认` 等等效表述
     - 从 auto 标记后的内容中提取实际提示词
     - 识别所有命令/技能/工具/代理引用
   - 阶段 2：优化提示词
     - 结构化模糊表述
     - 补充隐含上下文
     - 保持原始意图和逻辑不变
     - 保序规则：首个引用保持首位，中间引用保留但可调序
      - 引用识别范围：`/xxx`（命令）、`ae:<name>`（技能）、`@xxx`（代理）、已知工具名，不限于 AE 自有资产
   - 阶段 3：用户确认（auto 模式跳过）
      - 展示优化后的完整提示词，**干净输出，不得包含任何元描述**（如"这是优化后的提示词"、"优化结果如下"等引导语或标记文本），直接输出提示词内容本身
      - 支持多轮修改，用户反复提出意见直到满意
   - 阶段 4：提交执行
     - 调用 `ae-prompt-optimize` 工具
     - 传入优化后的提示词
4. **约束规则**：
   - 不得改变用户原始意图和逻辑
   - 命令/技能/工具/代理引用完整保留
   - auto 标记本身不出现在优化后的提示词中
   - 优化输出必须干净利落：不得包含"这是优化后的提示词"、"优化结果如下"等任何元描述或引导文本，直接输出提示词内容本身

**遵循模式：** `ae-handoff/SKILL.md` 的结构模式（frontmatter + 功能说明 + 执行流程 + 约束规则）

**验证：** 手动检查 SKILL.md 内容完整性

---

### 单元 7：测试

**目标：** 为新增的 service 和 tool 编写单元测试

**需求：** 覆盖率要求

**依赖：** 单元 3、单元 4

**文件：**
- `src/services/prompt-optimize.service.test.ts`（新建）
- `src/tools/ae-prompt-optimize.tool.test.ts`（新建）

**方法：**
1. **service 测试**：
   - Mock `OpencodeClient`（session.create、session.prompt、tui.publish）
   - Mock `createNewSession`、`navigateToSession`
   - 测试 `generateSessionTitle()` 各种输入（命令开头、纯文本、空内容回退）
   - 测试 `executePromptSubmit()` 正常路径和错误路径
   - 测试自定义错误类型（PromptSessionCreateError、PromptSubmitError）的精确捕获
2. **tool 测试**：
   - Mock `getGlobalClient` 返回 null → 验证错误返回
   - Mock `getGlobalClient` 返回有效客户端 → 验证成功路径
   - 验证 Zod 参数校验（空字符串、超长字符串）
   - 验证 ctx.metadata 调用

**遵循模式：** 测试规范中的 Vitest + vi.mock() + Layer.succeed 模式

**验证：** `npm run test` 通过，覆盖率达标

---

## 文件变更清单

| 文件 | 操作 | 单元 |
|------|------|------|
| `src/schemas/ae-asset-schema.ts` | 修改 | U1 |
| `src/services/ae-catalog.ts` | 修改 | U2 |
| `src/services/prompt-optimize.service.ts` | 新建 | U3 |
| `src/tools/ae-prompt-optimize.tool.ts` | 新建 | U4 |
| `src/tools/index.ts` | 修改 | U5 |
| `src/assets/skills/ae-prompt-optimize/SKILL.md` | 新建 | U6 |
| `src/services/prompt-optimize.service.test.ts` | 新建 | U7 |
| `src/tools/ae-prompt-optimize.tool.test.ts` | 新建 | U7 |

## 推迟到实现

- SKILL.md 中提示词优化的具体措辞和格式细节——在编写 SKILL.md（U6）时根据实际效果调整
- auto 标记的完整匹配列表——在 SKILL.md 中定义初始列表，后续按需扩展
- session.prompt() 设置 noReply: false 触发 AI 回复的行为已有 ae-orchestrator.tool.ts 佐证，U3 实现时做 smoke test 确认即可
