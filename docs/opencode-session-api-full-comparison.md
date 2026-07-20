# OpenCode SDK 三套会话 API 全维度对比

> 生成时间：2026-07-19
> 三套 API：v1 `client.session`（Session2）、v2 `client.v2.session`（Session3）、experimental `client.experimental.session`（Session）

---

## 一、API 存在性矩阵

| 能力 | v1 `client.session` | v2 `client.v2.session` | experimental |
|------|:---:|:---:|:---:|
| **create** | ✅ | ✅ | ❌ |
| **fork** | ✅ | ✅ | ❌ |
| **delete/remove** | ✅ `delete` | ✅ `remove` | ❌ |
| **get** | ✅ | ✅ | ❌ |
| **list** | ✅ 偏移分页 | ✅ 游标分页 | ✅ 跨项目含 archived |
| **update/rename** | ✅ `update`（title/metadata/permission/time） | ✅ `rename`（仅 title） | ❌ |
| **switchAgent** | ❌ | ✅ | ❌ |
| **switchModel** | ❌ | ✅ | ❌ |
| **move**（跨项目） | ❌ | ✅ | ❌ |
| **prompt** | ✅ 同步流式 | ✅ durable admit | ❌ |
| **promptAsync** | ✅ | ❌（v2 prompt 本身即异步语义） | ❌ |
| **command** | ✅ | ✅ | ❌ |
| **shell** | ✅ | ✅ | ❌ |
| **synthetic** | ❌ | ✅ | ❌ |
| **skill** | ❌ | ✅ | ❌ |
| **generate**（不写历史） | ❌ | ✅ | ❌ |
| **compact** | ❌（仅 summarize） | ✅ | ❌ |
| **summarize** | ✅ | ❌（v2 用 compact） | ❌ |
| **revert / unrevert** | ✅ | ✅（子资源） | ❌ |
| **abort / interrupt** | ✅ `abort` | ✅ `interrupt` | ❌ |
| **wait** | ❌ | ✅ | ❌ |
| **background** | ❌ | ✅ | ✅ |
| **share / unshare** | ✅ | ❌ | ❌ |
| **init**（生成 AGENTS.md） | ✅ | ❌ | ❌ |
| **children** | ✅ | ❌（v2 list 用 parentID 过滤） | ❌ |
| **diff** | ✅ | ❌ | ❌ |
| **messages** | ✅ | ✅（`message` 子资源 + `Message.list`） | ❌ |
| **status** | ✅ `status` | ✅ `active` | ❌ |
| **context**（活跃上下文） | ❌ | ✅ | ❌ |
| **log**（durable 事件日志 SSE） | ❌ | ✅ | ❌ |
| **permission 子资源** | ❌（权限在 create/update 中设置） | ✅ 独立 CRUD | ❌ |

---

## 二、工具调用机制对比

### 2.1 工具注册与解析

| 维度 | v1 | v2 |
|------|-----|-----|
| **注册入口** | `ToolRegistry.Service`（`opencode/src/tool/registry.ts`） | `ToolRegistry.Service`（`core/src/tool/registry.ts`，`@opencode/v2/ToolRegistry`） |
| **解析调用** | `registry.tools({ modelID, providerID, agent, permission })`（`tools.ts:92`） | `registry.materialize(permissions)`（`model-request.ts:55`） |
| **返回结构** | `Record<string, AITool>`（AI SDK Tool 包装） | `Materialization { definitions, settle }`（定义 + 执行分离） |
| **工具过滤** | 按 `session.permission`（PermissionV1）过滤 | 按 `agent.info.permissions`（PermissionV2）过滤 |

### 2.2 工具执行链路

**v1 工具执行**（`tools.ts:99-133`）：

```
model 调用 tool → AITool.execute(args, options)
  ├─ plugin.trigger("tool.execute.before", { tool, sessionID, callID }, { args })
  ├─ item.execute(args, ctx)   // ctx 含 sessionID/abort/agent/messages/metadata/ask
  │   └─ ctx.ask(req) → permission.ask({ ...req, ruleset: Permission.merge(agent.permission, session.permission) })
  ├─ plugin.trigger("tool.execute.after", { tool, sessionID, callID, args }, output)
  └─ return output
```

**v2 工具执行**（`runner/llm.ts:150-191` + `registry.ts:111-234`）：

```
LLM stream 发出 tool-call event
  ├─ prepared.resolveToolCall(event.name)
  │   ├─ type: "reject" → publisher.failUnsettledTools(tool.error)
  │   └─ type: "settle" → tool.settle({ sessionID, agent, messageID, call, progress })
  │       └─ settleTool(input, registration.tool)
  │           ├─ ToolHooks.before（plugin hook）
  │           ├─ tool.execute(input.call.input, ctx)
  │           ├─ ToolHooks.after（plugin hook）
  │           └─ normalizeImages（图片输出归一化）
  └─ publish(LLMEvent.toolResult({ id, name, result, output }))
```

**关键差异**：

| 维度 | v1 | v2 |
|------|-----|-----|
| **执行模型** | 同步包装为 AI SDK `tool({ execute })`，在 stream 中内联执行 | `Materialization.settle` 分离定义与执行，工具在独立 fiber 中执行 |
| **并发模型** | 由 AI SDK stream 驱动，串行 | `FiberSet` 管理工具 fiber，支持并行工具调用 + `Semaphore` 串行化发布 |
| **权限检查时机** | `ctx.ask()` 在工具内部按需调用 | `resolveToolCall` 在调用前预检查（reject/settle 二分） |
| **权限合并** | `Permission.merge(agent.permission, session.permission)`（`tools.ts:87`） | `agent.info.permissions`（`model-request.ts:55`），无 session 级合并 |
| **hook 触发** | `plugin.trigger("tool.execute.before/after")` | `ToolHooks.before/after`（独立 hook 服务） |
| **图片输出** | 原样返回 | `normalizeImages` 归一化（resize/decode/size 检查） |
| **中断处理** | `abortSignal` 传播 | `uninterruptibleMask` + `FiberSet.clear` + `failUnsettledTools` |

### 2.3 权限模型

**v1 PermissionV1**（`opencode/src/permission/index.ts:28`）：

```ts
Rule = { permission: string, pattern: string, action: "ask" | "allow" | "deny" }
evaluate(permission, pattern, ...rulesets) → findLast match or { action: "ask" }
```

- 二维匹配：`permission`（工具名）× `pattern`（资源通配符）
- 三态：ask / allow / deny
- 来源：`agent.permission` + `session.permission`（per-call tools 转换）合并

**v2 PermissionV2**（`core/src/permission.ts:85`）：

```ts
Rule = { action: string, resource: string, effect: "ask" | "allow" | "deny" }
evaluate(action, resource, ...rulesets) → findLast match or { effect: "ask" }
```

- 三维匹配：`action`（操作类型，如 "edit"/"execute"/"skill"）× `resource`（资源通配符）
- 三态：ask / allow / deny
- 来源：`agent.info.permissions`（仅 agent 配置，无 per-call 合并）
- 独立子资源 API：`/api/session/{id}/permission` CRUD

**关键差异**：

| 维度 | v1 | v2 |
|------|-----|-----|
| **匹配维度** | permission × pattern（2D） | action × resource（2D，但 action 语义更丰富） |
| **per-call 覆盖** | ✅ `prompt({ tools: {"*":true, edit:false} })` → `session.permission` | ❌ 必须改 agent.permissions 或用 permission 子资源 |
| **合并策略** | `Permission.merge(agent.permission, session.permission)` | 仅 `agent.info.permissions` |
| **动态管理** | `update({ permission })` 改会话权限 | `permission` 子资源 CRUD + `assert`/`reply` 交互式审批 |
| **默认效果** | `ask` | `ask` |

---

## 三、system prompt 注入对比

### 3.1 v1 注入链路

```
调用方 prompt({ system: "你是乐观派..." })
  → createUserMessage: info.system = input.system        // 存入用户消息
  → loop → runLoop → prepare
  → request.ts:58:
    system = [
      agent.prompt or providerPrompt,       // agent 配置或 provider 默认
      ...loopSystem,                        // env + instructions + mcp + skills
      user.system                           // ← 调用方注入的 system
    ].filter(x => x).join("\n")
```

- **per-call 覆盖**：每次 prompt 可注入不同 system，追加到链末尾
- **plugin hook**：`experimental.chat.system.transform`（`request.ts:69`）可重塑

### 3.2 v2 注入链路

```
调用方 prompt({ text, files, agents })  // 无 system 参数
  → resolvePrompt → Prompt.make({ text, agents, files })
  → SessionExecution → SessionRunner → runStep
  → model-request.ts:57:
    system = [
      agent.info.system or PROMPT_DEFAULT,  // ← agent 配置的 system
      input.context.initial                 // 指令/规则/instructions
    ].filter(part => part.length > 0).map(SystemPart.make)
  → hooks.trigger("session", "context", { system, messages, tools })
  → LLM.request({ system: contextEvent.system, ... })
```

- **agent 配置驱动**：system 来自 `ConfigV2.Agent.system`（`config/agent.ts:17`）
- **plugin hook**：`session.context` hook 可重塑 system/messages/tools
- **无 per-call 覆盖**：必须 `switchAgent` 或改 agent 配置

### 3.3 对比

| 维度 | v1 | v2 |
|------|-----|-----|
| **注入位置** | per-call 参数 | agent 配置 |
| **拼接顺序** | `[agent.prompt, loopSystem, user.system]` | `[agent.system or DEFAULT, context.initial]` |
| **覆盖能力** | 每次 prompt 可变 | 需切换 agent |
| **hook** | `experimental.chat.system.transform` | `session.context` |
| **hook 能力** | 仅重塑 system | 可重塑 system + messages + tools |

---

## 四、消息驱动模型对比

### 4.1 v1 同步流式

```
prompt({ sessionID, parts, system, tools, model? })
  → createUserMessage（同步写入消息）
  → loop(sessionID)
    → runLoop: while(true) { status=busy; stream=llm.stream(request); Stream.runDrain; ... }
  → return SessionV1.WithParts（最终消息）
```

- **阻塞语义**：`prompt` 返回时 agent loop 已完成（或出错/中断）
- **`promptAsync`**：`Effect.forkIn` 后台执行，立即返回 `NoContent`
- **`noReply: true`**：仅创建用户消息，不启动 loop（`prompt.ts:1069`）
- **流式消费**：通过 `EventV2Bridge` 发布事件，客户端订阅 SSE

### 4.2 v2 durable + resume

```
prompt({ sessionID, text, files, agents, delivery?, resume? })
  → resolvePrompt（解析文件附件）
  → SessionPending.admit（durable 写入 pending 队列）
  → if resume !== false: SessionExecution.resume(sessionID)
    → coordinator.run → SessionRunner.run
      → runStep: 检查 pending steers/queues → promote → LLM stream → 工具执行
  → return SessionPending.User（admitted 记录）
```

- **非阻塞语义**：`prompt` 仅 admit 输入并可选启动 loop，立即返回 `SessionPending.User`
- **`resume: false`**：仅 durable 写入，不启动 loop（批量注入后统一执行）
- **`delivery: "steer"`**：转向正在运行的 loop（中途插入）
- **`delivery: "queue"`**：排队等待当前 loop 完成后执行
- **`wait`**：显式等待 agent loop 空闲
- **流式消费**：`log` SSE 端点 follow durable event log

### 4.3 对比

| 维度 | v1 | v2 |
|------|-----|-----|
| **返回值** | `SessionV1.WithParts`（完整消息） | `SessionPending.User`（admitted 记录） |
| **阻塞语义** | prompt 返回时 loop 已完成 | prompt 立即返回，loop 异步进行 |
| **异步变体** | `promptAsync` | 默认即异步，`resume` 控制 |
| **仅写入不执行** | `noReply: true` | `resume: false` |
| **中途插入** | ❌ | `delivery: "steer"` |
| **排队** | ❌ | `delivery: "queue"` |
| **等待 loop** | ❌ | `wait` 端点 |
| **事件流** | EventV2Bridge SSE | `log` SSE（durable event log，可 follow） |
| **执行协调** | `SessionRunState` 状态机 | `RunCoordinator`（doorbell + drain 模型） |

---

## 五、文件附件处理对比

### 5.1 v1 parts 处理（`prompt.ts:699-992`）

```
resolvePart(part):
  if part.type === "file":
    if source.type === "resource": → MCP resource 读取 → 拆分为 text + file parts
    switch url.protocol:
      case "data:":
        if mime === "text/plain": → 拆分为 [Read 调用文本, 解码内容, 原 file part]
        else: → break（直接透传）
      case "file:":
        if mime === "text/plain": → 调用 Read 工具读取 → [Read 调用文本, 读取结果, 附件]
        if mime === "application/x-directory": → 调用 Read 工具列目录
        else: → 读取文件 base64 编码 → [Read 调用文本, file part（data URL）]
  if part.type === "agent": → [agent part, "Use the above message..." 引导文本]
  if part.type === "text": → 直接透传
```

- **text/plain 特殊处理**：data URL 和 file URL 都会拆分并合成"Called Read tool"文本
- **二进制文件**：读取后 base64 编码为 data URL，附带合成文本
- **MCP resource**：读取并拆分为 text + file parts

### 5.2 v2 files 处理（`session.ts:874-929`）

```
resolvePrompt(input):
  files = forEach(input.files, materializeAttachment, { concurrency: 8 })

materializeAttachment(file):
  if uri.startsWith("data:"): → decodeDataURL
  else: → readFileAttachment(fs, uri)
  if bytes > 20MB: → AttachmentError
  mime = detect(bytes) 或显式
  if text/plain && start/end: → 切片行范围
  normalized = normalizeImageAttachment（图片归一化）
  return FileAttachment.create({ data, mime, source, name })
```

- **统一 materialize**：所有附件走 `materializeAttachment`，并发 8
- **大小限制**：20MB 硬限制
- **图片归一化**：`normalizeImageAttachment` resize/格式转换
- **行范围切片**：text/plain 支持 start/end 行范围
- **不合成"Called Read tool"文本**：直接返回 FileAttachment

### 5.3 对比

| 维度 | v1 | v2 |
|------|-----|-----|
| **参数名** | `parts: Array<TextPart \| FilePart \| AgentPart \| SubtaskPart>` | `files: Array<FileAttachment>` + `text` + `agents` |
| **处理并发** | `concurrency: "unbounded"` | `concurrency: 8` |
| **text/plain data URL** | 拆分为 3 段（Read 文本 + 解码内容 + file part） | 解码为 bytes，不拆分 |
| **text/plain file URL** | 调用 Read 工具读取，合成"Called Read tool"文本 | 直接读取 bytes，不合成文本 |
| **二进制文件** | base64 data URL + 合成文本 | bytes + mime + name |
| **大小限制** | 无显式限制 | 20MB |
| **图片处理** | 无 | `normalizeImageAttachment` resize/格式转换 |
| **行范围** | URL searchParams `start`/`end` + LSP symbol 查找 | `start`/`end` 直接切片 |
| **MCP resource** | 支持（`source.type === "resource"`） | 不在此层处理 |
| **SubtaskPart** | 支持 | 不支持（通过 `agents` 参数） |

---

## 六、agent/model 切换对比

| 维度 | v1 | v2 |
|------|-----|-----|
| **agent 切换** | ❌ 无独立端点，prompt 时通过 `agent` 参数指定 | ✅ `switchAgent({ agent })` 独立端点 |
| **model 切换** | ❌ 无独立端点，prompt 时通过 `model` 参数指定 | ✅ `switchModel({ model })` 独立端点 |
| **切换时机** | 每次 prompt 调用 | 持久化到会话，影响后续所有 turn |
| **variant 支持** | ✅ prompt 时 `variant` 参数 | ❌ prompt 无 variant，通过 agent/model 配置 |

---

## 七、会话生命周期对比

| 维度 | v1 | v2 |
|------|-----|-----|
| **create 参数** | `title/agent/model/metadata/permission/parentID/workspaceID` | `id/agent/model/location` |
| **标题设置** | create 时直接传入 | create 后 `rename` 二次设置 |
| **元数据** | create/update 时传入 | ❌ create 无 metadata，prompt 时 `metadata` 传入 |
| **权限设置** | create/update 时 `permission` | `permission` 子资源 CRUD |
| **parentID（fork）** | create 参数 | `fork` 独立端点 |
| **workspaceID** | create 参数 | `location` 统一参数 |
| **删除** | `delete` | `remove` |
| **归档** | `update({ time: { archived } })` | ❌ 无归档端点 |
| **分享** | `share`/`unshare` | ❌ 无分享端点 |
| **跨项目移动** | ❌ | `move({ locationRefV2 })` |
| **子会话** | `children` 端点 | `list({ parentID })` 过滤 |

---

## 八、事件与可观测性对比

| 维度 | v1 | v2 |
|------|-----|-----|
| **事件总线** | `EventV2Bridge.Service`（桥接 v1 事件到 v2） | `EventV2.Service`（原生 v2 事件） |
| **事件类型** | `Session.Event.*`（Updated/Error/Diff/Compacted...） | `SessionEvent.*`（durable event log） |
| **事件日志** | ❌ 无独立日志端点 | ✅ `log` SSE（`/api/experimental/session/{id}/log`，支持 `after` + `follow`） |
| **状态查询** | `status` 端点（全部会话 busy/idle） | `active` 端点（本进程持有的前台 drain） |
| **上下文查询** | `messages` 端点 | `context` 端点（压缩后活跃上下文）+ `message` 子资源 |
| **diff** | `diff` 端点 | ❌ 无独立 diff 端点 |

---

## 九、plugin hook 对比

| hook | v1 | v2 |
|------|-----|-----|
| **system transform** | `experimental.chat.system.transform`（仅 system） | `session.context`（system + messages + tools） |
| **message transform** | `experimental.chat.messages.transform` | `session.context` |
| **tool execute before** | `tool.execute.before` | `ToolHooks.before` |
| **tool execute after** | `tool.execute.after` | `ToolHooks.after` |
| **chat message** | `chat.message` | `session.context` |
| **compacting** | `experimental.session.compacting` | `session.compaction` 相关 hook |

**关键差异**：v2 的 `session.context` hook 统一了 system/messages/tools 重塑，比 v1 的分散 hook 更结构化。

---

## 十、experimental 命名空间定位

| 维度 | 说明 |
|------|------|
| **能力范围** | 仅 `list`（跨项目含 archived）+ `background`（分离阻塞子代理） |
| **底层服务** | 复用 v1 `SessionPrompt.Service` |
| **URL 前缀** | `/experimental/session` |
| **定位** | 跨项目运维 + 子代理后台化，不用于创建/驱动会话 |
| **与 v1/v2 关系** | 不提供任何 v1/v2 独有的创建或 prompt 能力 |

---

## 十一、AE 插件影响与迁移评估

### 11.1 AE 插件当前使用模式

```
ae:brainstorm / ae:image / ae-create-session:
  client.session.create({ title })
  client.session.prompt({ parts, system, tools: {"*":true, edit:false, ...}, model? })
  client.session.delete({ sessionID })
```

强依赖 v1 per-call `system`（角色提示词）+ `tools`（禁用 edit/write/patch/question）。

### 11.2 迁移到 v2 的改造点

| 需求 | v1 当前做法 | v2 迁移方案 |
|------|------------|-------------|
| **注入角色 system** | `prompt({ system: "你是乐观派..." })` | 为每个视角创建独立 agent（`ConfigV2.Agent.system`），prompt 时 `switchAgent` 或 create 时指定 `agent` |
| **禁用 edit/write** | `prompt({ tools: {"*":true, edit:false, write:false} })` | 在 agent 配置中设置 `permissions: [{ action: "edit", resource: "*", effect: "deny" }, ...]` |
| **指定模型** | `prompt({ model: { providerID, modelID } })` | create 时 `model` 参数 或 `switchModel` |
| **文件附件** | `parts: [{ type: "file", mime, url: dataUrl }]` | `files: [{ uri: dataUrl, name }]` |
| **临时会话清理** | `session.delete` | `session.remove` |
| **同步获取结果** | `prompt` 返回完整消息 | `prompt` + `wait` + `log` SSE 或 `generate`（不写历史） |

### 11.3 迁移收益

1. **durable + resume**：可批量注入上下文后统一执行，适合 brainstorm 多视角并行
2. **`generate` 端点**：vision 识别等一次性问答可不写历史，省去 create+delete 临时会话
3. **`synthetic` 端点**：注入合成消息传递前轮摘要，无需塞进 user prompt
4. **`delivery: steer`**：可中途转向正在运行的 loop，实现动态调整
5. **PermissionV2 三维权限**：比 v1 二维更细粒度

### 11.4 迁移风险

1. **改造量大**：每个视角需独立 agent 配置，不能再 per-call 注入 system
2. **v2 无 `title` create 参数**：临时会话标题需 `rename` 二次调用
3. **v2 无 `share`/`init`/`diff`**：若 AE 插件依赖这些能力则无法迁移
4. **v2 API 路径 `/api/`**：需确认 server 启用 v2 路由
5. **v2 仍在演进**：`log` 端点带 `experimental` 前缀

---

## 十二、总结矩阵

| 维度 | v1 | v2 | experimental |
|------|-----|-----|-----|
| **设计哲学** | per-call 参数驱动 | agent 配置驱动 + durable | 跨项目运维 |
| **system 注入** | per-call 参数 | agent 配置 + hook | — |
| **tools 权限** | per-call 参数 → PermissionV1 | agent 配置 → PermissionV2 | — |
| **执行模型** | 同步流式 | durable admit + resume | — |
| **工具执行** | AI SDK 内联 | FiberSet 并行 + settle 分离 | — |
| **文件附件** | parts 内联 + Read 合成 | files 独立 + materialize | — |
| **中断/等待** | abort | interrupt + wait + background | background |
| **事件** | EventV2Bridge | durable event log SSE | — |
| **plugin hook** | 分散 | 统一 session.context | — |
| **稳定性** | 稳定（AE 当前使用） | 新一代 | 实验性 |
