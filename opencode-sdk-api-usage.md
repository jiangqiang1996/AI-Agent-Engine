# OpenCode SDK API 使用分析

> 本文档基于对 `src/` 目录下源码的静态分析，汇总当前项目实际使用的 OpenCode SDK API。
>
> - 分析时间：2026-06-17
> - SDK 版本：`@opencode-ai/plugin@1.17.7`、`@opencode-ai/sdk@1.17.7`（见 `package.json`）
> - 分析范围：`src/` 目录下所有 `.ts` 文件
> - 文档真源：以 `src/` 下实际代码为准；本文档为汇总参考，不替代源码。

---

## 1. 概述

本项目作为 opencode 插件，通过两个官方包与 opencode 运行时交互：

| 包名 | 版本 | 角色 |
|------|------|------|
| `@opencode-ai/plugin` | 1.17.7 | 插件入口、工具定义、配置 Hook、工具上下文 |
| `@opencode-ai/sdk` | 1.17.7 | opencode 客户端类型、消息部件类型 |

依赖声明见 `package.json:13-14`。

---

## 2. `@opencode-ai/plugin` API

### 2.1 类型导入

| 类型 | 用途 | 使用位置 |
|------|------|----------|
| `Config` | opencode 运行时配置类型，用于访问 `Config['mcp']`、`Config['command']` 等子类型 | `src/index.ts:1`、`src/services/command-registration.ts:5`、`src/services/mcp-registration.ts:1`、`src/services/builtin-opencode-config-service.ts:5` |
| `Plugin` | 插件入口函数类型，签名 `(input) => PluginReturn` | `src/index.ts:1` |
| `ToolDefinition` | 工具定义类型，由 `tool()` 工厂返回，用于工具注册 | `src/tools/index.ts:1` 及 9 个 `*.tool.ts` 文件 |
| `ToolContext` | 工具执行上下文类型，描述 `ctx` 参数 | `src/services/handoff.service.ts:2` |

### 2.2 运行时导入：`tool` 工厂函数

`tool` 是工具定义的核心工厂函数，从 `@opencode-ai/plugin` 命名导出。

#### 2.2.1 `tool(options)` — 创建工具

调用形式（见 `src/tools/ae-handoff.tool.ts:85`、`src/tools/ae-timer.tool.ts:4` 等 20 个工具文件）：

```typescript
export const aeXxxTool: ToolDefinition = tool({
  description: ['工具描述', '', '功能说明：', '- 能力 1'].join('\n'),
  args: {
    param1: tool.schema.string().describe('参数描述'),
    param2: tool.schema.boolean().optional().describe('可选参数'),
  },
  async execute(args, ctx) {
    ctx.metadata({ title: '执行中...' })
    return { output: '结果', metadata: { key: 'value' } }
  },
})
```

`options` 字段：
- `description: string` — 工具描述，第一行为简短摘要
- `args: Record<string, ZodSchema>` — 参数 Schema（使用 `zod` 或 `tool.schema`）
- `execute: (args, ctx) => Promise<ToolResult>` — 执行函数

#### 2.2.2 `tool.schema` — Schema 构建命名空间

`tool.schema` 是 `tool` 的命名空间属性，提供与 zod 兼容的 Schema 构建方法。项目中实际使用的方法：

| 方法 | 使用位置 |
|------|----------|
| `tool.schema.string()` | `src/tools/ae-recovery.tool.ts:27`、`src/tools/ae-doc-extract.tool.ts:26`、`src/tools/ae-task-analyzer.tool.ts:600-602`、`src/tools/ae-review-contract.tool.ts:128-129,132-133,136-137,140-141` |
| `tool.schema.number()` | `src/tools/ae-review-contract.tool.ts:153,155` |
| `tool.schema.boolean()` | `src/tools/ae-review-contract.tool.ts:144-152,154,156-169`（24 处）、`src/tools/ae-doc-extract.tool.ts:29` |
| `tool.schema.enum()` | `src/tools/ae-recovery.tool.ts:24-25`、`src/tools/ae-task-analyzer.tool.ts:599`、`src/tools/ae-review-contract.tool.ts:124-125` |
| `tool.schema.array()` | `src/tools/ae-doc-extract.tool.ts:27-28` |

注意：项目同时使用 `zod`（`import { z } from 'zod'`）和 `tool.schema` 两种方式构建 Schema，不同工具选择其中一种，未混用（见 `src/tools/ae-review-contract.tool.ts` 使用 `tool.schema`，`src/tools/ae-handoff.tool.ts` 使用 `zod`）。`tool.schema` 在官方类型声明中为 `typeof z` 的别名（见 `node_modules/@opencode-ai/plugin/dist/tool.d.ts:57`），与 `zod` 在类型和运行时层面等价；版本一致（当前均为 4.1.8）时可安全替换。

### 2.3 `Plugin` 入口签名

插件入口定义在 `src/index.ts:116`：

```typescript
const plugin: Plugin = async (input) => {
  const manifest = createRuntimeAssetManifest(import.meta.url)
  const hostWorktree = resolveHostWorktree(input)
  setGlobalClient(input.client)

  return {
    config: async (config) => { /* 配置 hook */ },
    'experimental.chat.system.transform': async (_input, output) => { /* 系统提示词转换 */ },
    'command.execute.before': async (_input, output) => { /* 命令执行前处理 */ },
    tool: createToolRegistry(),
  }
}
export default plugin
```

#### 2.3.1 `input` 参数属性

| 属性 | 类型 | 用途 | 使用位置 |
|------|------|------|----------|
| `input.client` | `OpencodeClient` | opencode 客户端实例，存入全局 holder 供工具层调用 | `src/index.ts:119` |
| `input.worktree` | `string` | 主机工作区路径，缺失时回退到 `process.cwd()` | `src/index.ts:49-52`（`resolveHostWorktree`） |

#### 2.3.2 Plugin 返回对象字段

| 字段 | 类型 | 用途 | 使用位置 |
|------|------|------|----------|
| `config` | `async (config) => void` | 配置 hook，接收 `Config` 对象进行修改（注册 skills 路径、命令、MCP、规则、引用） | `src/index.ts:122-132` |
| `'experimental.chat.system.transform'` | `async (_input, output) => void` | 实验性 hook，在系统提示词发送前注入内置规则 | `src/index.ts:133-135` |
| `'command.execute.before'` | `async (_input, output) => void` | 命令执行前 hook，对命令参数 parts 去重 | `src/index.ts:136-138` |
| `tool` | `ToolRegistry` | 工具注册表，由 `createToolRegistry()` 构建 | `src/index.ts:139` |

### 2.4 `ToolContext`（`ctx`）API

工具 `execute(args, ctx)` 的第二个参数 `ctx` 提供以下能力：

| 属性/方法 | 签名 | 用途 | 使用位置 |
|-----------|------|------|----------|
| `ctx.metadata()` | `(payload: { title?: string; metadata?: { [key: string]: any } }) => void` | 实时反馈执行状态和进度 | 13 个工具文件，共 19 处调用 |
| `ctx.ask()` | `(request: AskInput) => Promise<void>` | 请求用户授权确认（文件写入、网络访问、会话创建等） | `src/tools/ae-create-session.tool.ts:67`、`src/tools/ae-swagger-parser.tool.ts:53`、`src/tools/ae-review-proof.tool.ts:471`、`src/tools/ae-html-bundle.tool.ts:69`、`src/tools/ae-graph-build.tool.ts:221,255,292` |
| `ctx.abort` | `AbortSignal` | 取消信号，用户中断时触发 | `src/tools/ae-timer.tool.ts:52-58` |
| `ctx.worktree` | `string` | 工作区根目录（绝对路径，类型声明属性） | `src/tools/ae-recovery.tool.ts:33`、`src/tools/ae-swagger-parser.tool.ts:64`、`src/tools/ae-graph-build.tool.ts:339`、`src/tools/ae-graph-query.tool.ts:66`、`src/tools/ae-html-bundle.tool.ts:57`、`src/tools/ae-doc-extract.tool.ts:36` |
| `ctx.worktree`（运行时动态属性访问） | `string` | 同上，但 `resolveWorktree(context: unknown)` 接收 `unknown` 类型参数，需通过类型断言 `(context as { worktree?: unknown }).worktree` 访问；`worktree` 本身是 `ToolContext` 的类型声明属性 | `src/tools/ae-review-proof.tool.ts:73`、`src/tools/ae-chrome-devtools-mcp.tool.ts:113` |
| `ctx.directory` | `string` | 当前目录（可能等于 worktree） | `src/tools/ae-handoff.tool.ts:121`（参数名为 `context`）、`src/tools/ae-background-exec.tool.ts:38`、`src/tools/ae-graph-build.tool.ts:340`、`src/tools/ae-graph-query.tool.ts:67`、`src/tools/ae-html-bundle.tool.ts:58`、`src/tools/ae-doc-extract.tool.ts:37` |
| `ctx.history` | `Array<{ content?: string }>` | 历史消息列表（运行时动态属性，非类型声明） | `src/tools/ae-handoff.tool.ts:126-127`（line 125 为 `ctx` 变量定义） |

#### `ctx.ask()` 的 `permission` 取值

项目中实际使用的权限值：

| permission 值 | 用途 | 使用位置 |
|---------------|------|----------|
| `'session'` | 创建新会话授权 | `src/tools/ae-create-session.tool.ts:68` |
| `'network'` | 远程网络访问授权 | `src/tools/ae-swagger-parser.tool.ts:54` |
| `'file'` | 文件写入授权 | `src/tools/ae-review-proof.tool.ts:472`、`src/tools/ae-html-bundle.tool.ts:70`、`src/tools/ae-graph-build.tool.ts:222,256,293` |

`ctx.ask()` 官方类型声明返回 `Promise<void>`（见 `node_modules/@opencode-ai/plugin/dist/tool.d.ts:23`），用户拒绝时会 reject。项目通过 `runAskResult()` 兼容可能返回 `Effect` 的运行时变体（见 `src/tools/ae-create-session.tool.ts:147-154`），属于防御性写法；当前 SDK 版本下仅触发 `Promise` 路径。

`request` 对象字段（官方 `AskInput` 类型，均必填，见 `node_modules/@opencode-ai/plugin/dist/tool.d.ts:25-32`）：
- `permission: string` — 权限标识，由调用方声明操作类别（如 `'file'`、`'network'`、`'session'`）
- `patterns: string[]` — 受 `permission` 约束的路径或 URL 模式列表，用于在授权范围与具体目标之间建立映射
- `always: string[]` — 需置为会话级"始终允许"的权限标识/模式列表；传空数组 `[]` 表示本次仅询问，不持久化
- `metadata: { [key: string]: any }` — 附加展示元数据

项目实际调用均传 `always: []`（见 `src/tools/ae-create-session.tool.ts:70`、`src/tools/ae-graph-build.tool.ts:224` 等），印证 `string[]` 类型。

### 2.5 Tool `execute` 返回值

工具执行函数支持两种返回形式：

| 返回形式 | 示例 | 使用位置 |
|----------|------|----------|
| `string` | `return '❌ 失败信息'` | `src/tools/ae-handoff.tool.ts:118`、`src/tools/ae-swagger-parser.tool.ts:77` 等错误路径 |
| `{ output: string; metadata?: { [key: string]: any }; title?: string; attachments?: ToolAttachment[] }` | `return { output: '结果', metadata: { tool: 'xxx' } }` | `src/tools/ae-create-session.tool.ts:112-114`、`src/tools/ae-help.tool.ts:41-43`、`src/tools/ae-timer.tool.ts:72-75` 等成功路径 |

`output` 为必填字符串，`metadata`、`title`、`attachments` 为可选字段；项目实际未使用 `title` 与 `attachments`，仅在类型签名中可见。`ToolAttachment` 结构为 `{ type: "file"; mime: string; url: string; filename?: string }`（见 `node_modules/@opencode-ai/plugin/dist/tool.d.ts:33-38`）。

---

## 3. `@opencode-ai/sdk` API

### 3.1 类型导入

| 类型 | 用途 | 使用位置 |
|------|------|----------|
| `OpencodeClient` | opencode 客户端类型，封装 `session`、`tui` 等子客户端 | `src/services/client-holder.ts:1`、`src/services/session.service.ts:2`、`src/services/session-create.service.ts:2`、`src/services/prompt-optimize.service.ts:2`、`src/services/handoff.service.ts:3` |
| `Part` | 消息部件类型，描述会话消息的组成部分 | `src/services/command-file-argument-dedupe-service.ts:1` |

### 3.2 `OpencodeClient` 方法调用

项目通过 `input.client` 获取 `OpencodeClient` 实例（`src/index.ts:119`），存入全局 holder（`src/services/client-holder.ts`），供工具层和服务层调用。

实际使用的方法：

#### 3.2.1 `client.session.create()`

创建新会话。见 `src/services/session.service.ts:97`：

```typescript
const res = await client.session.create({
  body: { title: options.title },
})
// SDK 与服务端版本返回形状不一致，兼容 data 包裹和直接返回两种结构
const payload = res as unknown as Record<string, unknown>
const session = (payload.data ?? payload) as { id: string; title?: string } | undefined
```

返回值兼容处理：`res.data ?? res`，取 `{ id, title }`。

#### 3.2.2 `client.session.prompt()`

向指定会话发送提示词。见 `src/services/session.service.ts:150,169,189`：

```typescript
await client.session.prompt({
  path: { id: sessionId },
  body: {
    noReply: true,           // 不触发模型回复
    system: systemPrompt,     // 可选，作为 system prompt 注入
    parts: [{ type: 'text', text }],  // 消息部件
  },
})
```

`body` 字段：
- `noReply?: boolean` — 为 `true` 时不触发模型回复（用于注入上下文）
- `system?: string` — 作为 system prompt 注入（优先路径）
- `parts: Array<{ type: 'text'; text: string }>` — 消息部件

项目封装了三个语义化函数复用此方法：
- `injectSystemPrompt()` — `src/services/session.service.ts:161`（带 `system` 字段）
- `injectNoReplyMessage()` — `src/services/session.service.ts:142`（不带 `system`，降级路径）
- `submitUserPrompt()` — `src/services/session.service.ts:181`（不带 `noReply`，触发模型回复）

实现说明：由于 `OpencodeClient` 类型未直接暴露 `session.prompt` 方法签名，项目通过本地接口类型断言别名调用，`promptClient = client as SessionPromptClient`（`session.service.ts:147,166,186`）；`client.tui.publish()` 同理通过 `tuiClient = client as TuiPublishClient`（`session.service.ts:203`）。

#### 3.2.3 `client.tui.publish()`

发布 TUI 事件，用于导航到指定会话。见 `src/services/session.service.ts:205`（调用行）；类型断言在 `:203`。同样通过类型断言别名调用（`tuiClient = client as TuiPublishClient`）：

```typescript
await client.tui.publish({
  body: {
    type: 'tui.session.select',
    properties: {
      sessionID: sessionId,
    },
  },
})
```

项目封装为 `navigateToSession()`（`src/services/session.service.ts:199`），在会话创建后自动切换窗口。

#### 3.2.4 `client.mcp.status()`

查询当前工作区已注册 MCP 的连接状态。见 `src/tools/ae-chrome-devtools-mcp.tool.ts:124`：

```typescript
const result = await client.mcp.status({ query: { directory: worktree } })
// result.data: { [name: string]: { status: string; error?: string } }（对象字典，非数组）
const statuses = result.data as Record<string, { status: string; error?: string }> | undefined
```

返回值为对象字典（key 为 MCP 名称，value 为状态对象），非数组；`status` 字段为字符串（运行时观察到的取值包括 `'connected'`、`'disabled'`、`'failed'`、`'needs_auth'`、`'needs_client_registration'`、`'not_registered'`）。用于 `ae:chrome-devtools` 技能门禁：消费方在执行任何 chrome-devtools-mcp 工具前必须先确认连接就绪。

#### 3.2.5 `client.mcp.add()`

动态注册 MCP 服务。见 `src/tools/ae-chrome-devtools-mcp.tool.ts:247,296,365`，三种连接模式均使用 `config.type: 'local'` + `command` 数组：

```typescript
const result = await client.mcp.add({
  body: {
    name: 'chrome-devtools',
    config: {
      type: 'local',              // 'local'（本地命令）或 'remote'（远程 URL）
      command: ['npx', ...args],  // local 模式为 string[]；remote 模式用 url 字段替代
    },
  },
  query: { directory: worktree },
})
// result.data: { [name: string]: { status: string } }
```

- `connect` 模式：通过 `browser` + `port` 构造 `--wsEndpoint` 或 `--browserUrl` 参数（`:365`）
- `autoConnect` 模式：自动发现已运行的 Chrome，构造 `--wsEndpoint` 或默认 `AUTOCONNECT_COMMAND`（`:296`）
- `isolated` 模式：启动独立浏览器实例，构造 `--executablePath` 参数（`:247`）

#### 3.2.6 `client.mcp.disconnect()`

断开已注册的 MCP 连接。见 `src/tools/ae-chrome-devtools-mcp.tool.ts:410`：

```typescript
await client.mcp.disconnect({
  path: { name: 'chrome-devtools' },
  query: { directory: worktree },
})
```

用于 `ae:chrome-devtools` 技能的 `disconnect` 操作。

### 3.3 `Part` 类型

`Part` 是消息部件联合类型，项目通过 `Extract` 提取变体（见 `src/services/command-file-argument-dedupe-service.ts:3-4`）：

```typescript
type MutableTextPart = Extract<Part, { type: 'text' }>
type MutableFilePart = Extract<Part, { type: 'file' }>
```

实际接触的 `Part` 变体：

| 变体 | 结构 | 使用位置 |
|------|------|----------|
| `{ type: 'text', text: string }` | 文本消息部件 | `src/services/command-file-argument-dedupe-service.ts:3`、`src/services/session.service.ts:154,174,192` |
| `{ type: 'file', url?: string, source?: { text: { value: string } } }` | 文件消息部件 | `src/services/command-file-argument-dedupe-service.ts:4,6-12` |

`Part` 主要用于 `command.execute.before` hook 中对命令参数 parts 去重（`src/services/command-file-argument-dedupe-service.ts:86`）。

---

## 4. 配置 Hook 中的 `Config` 子类型使用

`config` hook 接收 `Config` 对象，项目通过 `Config['xxx']` 访问子类型：

| 子类型 | 用途 | 使用位置 |
|--------|------|----------|
| `Config['mcp']` | MCP 配置类型，用于注册内置 MCP | `src/index.ts:44`、`src/services/mcp-registration.ts:9,12,26`、`src/services/builtin-opencode-config-service.ts:12` |
| `Config['command']` | 命令配置类型，用于注册内置命令 | `src/services/command-registration.ts:92,93,161,162,163,172,173,175,189,192,193`（共 11 处） |

`Config` 对象在 `config` hook 中被直接修改（mutation），而非返回新对象（见 `src/index.ts:122-132`）。

---

## 5. Hook 接口使用汇总

项目通过 Plugin 返回对象注册以下 Hook：

| Hook 名称 | 触发时机 | 签名 | 用途 | 使用位置 |
|-----------|----------|------|------|----------|
| `config` | 插件加载时 | `(config) => Promise<void>` | 注册 skills 路径、命令、MCP、规则、引用 | `src/index.ts:122` |
| `experimental.chat.system.transform` | 系统提示词发送前 | `(_input, output) => Promise<void>` | 注入内置规则到系统提示词 | `src/index.ts:133` |
| `command.execute.before` | 命令执行前 | `(_input, output) => Promise<void>` | 对命令参数 parts 去重（file part 重复移除） | `src/index.ts:136` |

注意：项目未使用 `tool.execute.before`、`tool.execute.after`、`event` 等 Hook（虽在 `.opencode/rules/core/opencode-native-assets.md` 中有提及）。

---

## 6. 使用统计

### 6.1 按包统计

| 包 | 类型导入种类 | 运行时 API | 调用文件数 |
|----|-------------|-----------|-----------|
| `@opencode-ai/plugin` | 4（`Config`、`Plugin`、`ToolDefinition`、`ToolContext`） | 2（`tool`、`tool.schema`） | 26 |
| `@opencode-ai/sdk` | 2（`OpencodeClient`、`Part`） | 6（`session.create`、`session.prompt`、`tui.publish`、`mcp.status`、`mcp.add`、`mcp.disconnect`） | 7（6 个显式 import 类型 + 1 个通过 `client-holder` 间接调用 `client.mcp.*` 的 `ae-chrome-devtools-mcp.tool.ts`） |

### 6.2 工具文件统计

共 20 个 `*.tool.ts` 文件使用 `tool()` 工厂创建工具，其中：
- 9 个同时导入 `tool` 和 `ToolDefinition`
- 11 个仅导入 `tool`

### 6.3 `tool.schema` vs `zod`

项目混合使用两种 Schema 构建方式，但单个工具内不混用：
- `tool.schema.*`：主要用于 `ae-recovery`、`ae-doc-extract`、`ae-task-analyzer`、`ae-review-contract` 等工具
- `z.*`（zod）：用于 `ae-handoff`、`ae-prompt-optimize`、`ae-timer`、`ae-swagger-parser`、`ae-create-session` 等工具

`tool.schema` 在官方类型声明中为 `typeof z` 的别名（见 `node_modules/@opencode-ai/plugin/dist/tool.d.ts:57`），与 `zod` 在类型和运行时层面等价；版本一致时可安全替换。

---

## 7. 参考文档

OpenCode 官方文档（见 `.opencode/rules/core/opencode-api-reference.md`）：

| 场景 | 文档地址 |
|------|----------|
| SDK 参考 | https://opencode.ai/docs/zh-cn/sdk/ |
| 插件开发 | https://opencode.ai/docs/zh-cn/plugins/ |
| 自定义工具 | https://opencode.ai/docs/zh-cn/custom-tools/ |

---

## 8. 变更记录

| 日期 | 变更 |
|------|------|
| 2026-06-17 | 初版，基于 `src/` 静态分析汇总 |
| 2026-06-17 | 第一轮 ae:review autofix 修复：补全 `client.mcp` 三个方法；修正工具文件数（21→20）、`ToolDefinition` 文件数（13→9）、`tool` 仅导入数（8→11）、plugin 调用文件数（25→26）、SDK 运行时 API 数（3→6）；修正 `tool.schema` 行号与处数；澄清 `tool.schema` 与 `zod` 不混用语义；修正 `ctx.ask()` 返回类型为 `Promise<void>` 并补全 `request` 字段语义；补充 `ToolResult` 可选字段 `title`/`attachments`；修正 `ctx.metadata()` 调用统计 |
| 2026-06-17 | 第二轮 ae:review autofix 修复：修正 `ctx.ask()` 的 `AskInput` 字段（`patterns`/`always`/`metadata` 均必填，`always: string[]` 非 `boolean`）；重写 `client.mcp.status/add/disconnect` 三处示例代码以匹配真实源码（`body`/`config`/`path`/`query` 嵌套结构，返回对象字典非数组）；修正 `ToolAttachment` 字段（`filename` 非 `name`，补 `type`/`mime`）；修正 `ctx.metadata()` 签名为 `{ [key: string]: any }`；统一 2.2.1 示例为 `tool.schema` 消除混用矛盾；区分 `ctx.worktree` 类型声明属性与运行时动态属性访问；修正 `ctx.history` 行号为 126-127；补全 `Config['command']` 11 处行号；补充 `session.prompt`/`tui.publish` 类型断言别名调用说明；补充 6.1 节 SDK 调用文件数统计口径 |
| 2026-06-17 | 第三轮 ae:review autofix 修复：修正 `ctx.worktree`（运行时动态属性访问）描述——"非类型声明属性"与 `tool.d.ts:15` 矛盾，改为说明真实原因是 `resolveWorktree(context: unknown)` 接收 `unknown` 类型参数需类型断言，`worktree` 本身是 `ToolContext` 类型声明属性；修正 3.2.3 节类型名 `TuiClient`→`TuiPublishClient`（术语漂移，代码中仅存在 `TuiPublishClient`）；修正 3.2.2 节 `tuiClient` 类型断言行号 `:205`→`:203`（`:205` 为调用行，`:203` 为断言行） |
