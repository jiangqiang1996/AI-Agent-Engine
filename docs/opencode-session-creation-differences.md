# OpenCode SDK 三套会话创建方式底层实现差异分析

> 生成时间：2026-07-19

## 一、三套 API 的服务端路由归属

| API | 路由组 | handler 包 | URL 前缀 | 服务层 |
|-----|--------|-----------|----------|--------|
| **v1** `client.session` | `groups/session.ts`（`SessionApi`） | `opencode/src/server/.../handlers/session.ts` | `/session` | `SessionPrompt.Service`（`opencode/src/session/prompt.ts`） |
| **v2** `client.v2.session` | `protocol/src/groups/session.ts`（`ServerApi`） | `server/src/handlers/session.ts` | `/api/session` | `core/src/session.ts`（`@opencode/v2/Session`） |
| **experimental** `client.experimental.session` | `groups/experimental.ts`（`ExperimentalApi`） | `opencode/src/server/.../handlers/experimental.ts` | `/experimental/session` | 复用 v1 `SessionPrompt.Service` |

> 三者互不继承，各自独立封装 HTTP 端点，但 v1 和 experimental 共享底层 `SessionPrompt.Service`，v2 走全新的 `core/src/session.ts` 实现。

---

## 二、v1 `client.session`（Session2）—— 同步流式 + 调用方注入 system/tools

### 2.1 create

**SDK 签名**（`sdk.gen.ts:3502`）：
```ts
create({ parentID?, title?, agent?, model?, metadata?, permission?, workspaceID? })
```

**handler**（`handlers/session.ts`）→ **服务层** `Session.create`（`session.ts:661`）：
- 传入的 `title/agent/model/metadata/permission/parentID` 全部写入会话记录
- `permission` 直接作为 `PermissionV1.Ruleset` 存储到会话

### 2.2 prompt

**SDK 签名**（`sdk.gen.ts:3802`）：
```ts
prompt({ sessionID, model?, agent?, tools?, format?, system?, variant?, parts? })
```

**handler**（`handlers/session.ts:293`）：
```ts
promptSvc.prompt({ ...ctx.payload, sessionID })  // 透传 system/tools/parts
```

**服务层** `SessionPrompt.prompt`（`prompt.ts:1052`）核心流程：

```
createUserMessage(input)
  ├─ info.system = input.system        // 调用方传入的 system 存到用户消息
  ├─ info.tools = input.tools          // 调用方传入的 tools 存到用户消息
  ├─ resolvePart(each part)            // 处理 file/text/agent parts
  └─ permission 转换：
      for ([t, enabled] of Object.entries(input.tools)) {
        permissions.push({ permission: t, action: enabled ? "allow" : "deny", pattern: "*" })
      }
      session.permission = permissions
      sessions.setPermission(...)
loop(sessionID) → runLoop → handle.process
  ├─ system = [...env, ...instructions, mcpInstructions, skills]  // 循环级 system
  └─ prepare(request)
      ├─ final system = [agent.prompt or providerPrompt, ...loopSystem, user.system].join("\n")
      │   ↑ user.system 就是调用方传入的 input.system，追加到链末尾
      └─ tools 按 session.permission 过滤
```

**关键**：v1 的 `system` 和 `tools` 是 **per-call 参数**，每次 prompt 调用都可以注入不同的 system prompt 和工具权限，覆盖会话默认值。

---

## 三、v2 `client.v2.session`（Session3）—— durable + agent 配置驱动 system/tools

### 3.1 create

**SDK 签名**（`sdk.gen.ts:5917`）：
```ts
create({ id?, agent?, model?, location? })
```

**handler**（`server/src/handlers/session.ts`）→ **服务层** `core/src/session.ts`：
- **无 `title`/`metadata`/`permission` 参数**：标题通过 `rename` 二次设置，权限通过 `permission` 子资源管理
- `agent` 参数指定会话使用的 agent，agent 的 `system` 和 `permissions` 配置成为会话的 system prompt 和工具权限来源
- `location` 统一取代 v1 的 `directory/workspace/workspaceID`

### 3.2 prompt

**SDK 签名**（`sdk.gen.ts:6189`）：
```ts
prompt({ sessionID, id?, text?, files?, agents?, metadata?, delivery?, resume? })
```

**payload schema**（`protocol/src/groups/session.ts:289`）使用 `PromptInput.Prompt.fields`：
```ts
// schema/src/prompt-input.ts
Prompt = Schema.Struct({
  text: Schema.String,
  files: Schema.Array(FileAttachment).pipe(optional),
  agents: Schema.Array(AgentAttachment).pipe(optional),
})
```

**handler**（`server/src/handlers/session.ts:233`）：
```ts
session.prompt({
  sessionID, id, text, files, agents, metadata, delivery, resume
  // 无 system，无 tools
})
```

**服务层** `core/src/session.ts:234` 接口签名：
```ts
prompt(input: {
  id?, sessionID, text, files?, agents?, metadata?, delivery?, resume?
})  // 无 system，无 tools
```

**system 和 tools 的来源**（`core/src/session/model-request.ts:48-91`）：

```ts
const prepare = (input) => {
  const agent = input.context.agent        // 从会话的 agent 配置取
  const session = input.context.session

  // system 来自 agent.info.system（agent 配置的 system 字段），无则用 PROMPT_DEFAULT
  const system = [
    agent.info.system ? agent.info.system : PROMPT_DEFAULT,
    input.context.initial                 // 指令/规则/instructions
  ].filter(part => part.length > 0).map(SystemPart.make)

  // tools 来自 agent.info.permissions（agent 配置的 permissions 字段）
  const executableTools = yield* registry.materialize(agent.info.permissions)

  // plugin hook 可重塑 system 和 tools
  const contextEvent = yield* hooks.trigger("session", "context", {
    sessionID, agent: agent.id, model, system, messages, tools
  })

  const request = LLM.request({
    model, system: contextEvent.system, tools: hookedTools, ...
  })
}
```

**关键**：v2 的 `system` 和 `tools` **不是 per-call 参数**，而是来自 **agent 配置**（`ConfigV2.Agent.system` 和 `ConfigV2.Agent.permissions`）。调用方无法在 prompt 时覆盖，必须通过 `switchAgent` 切换 agent 或修改 agent 配置。

### 3.3 agent 配置 schema（`core/src/config/agent.ts:14`）

```ts
class Info extends Schema.Class("ConfigV2.Agent")({
  model: ConfigModel.Selection.pipe(optional),
  system: Schema.String.pipe(optional),           // ← system prompt 来源
  description: Schema.String.pipe(optional),
  mode: Literals(["subagent", "primary", "all"]).pipe(optional),
  steps: PositiveInt.pipe(optional),
  permissions: Permission.Ruleset.pipe(optional), // ← 工具权限来源
  ...
})
```

agent 的 `system` 和 `permissions` 在 agent 定义时确定（通过 `.opencode/agent/*.md` 或 plugin 注册），运行时不可通过 prompt 参数覆盖。

---

## 四、experimental `client.experimental.session`（Session）—— v1 的只读子集

**SDK 签名**（`sdk.gen.ts:897`）：
```ts
class Session extends HeyApiClient {
  list(...)    // GET /experimental/session
  background(...)  // POST /experimental/session/{id}/background
}
```

- **无 `create` 方法**：experimental 命名空间不提供会话创建能力
- `list` 跨项目列出会话（含 archived 过滤），v1 `list` 只列当前项目
- `background` 分离阻塞的同步子代理到后台，与 v1 `client.session` 无对应方法

**底层**：复用 v1 `SessionPrompt.Service`，但只暴露 list/background 两个端点。

---

## 五、核心差异对照：system 和 tools 的注入路径

### 5.1 system prompt

| 维度 | v1 `client.session.prompt` | v2 `client.v2.session.prompt` |
|------|---------------------------|-------------------------------|
| **参数存在性** | ✅ `system?: string` | ❌ 无此参数 |
| **注入位置** | per-call 参数，存入 `user.system` | 无，从 `agent.info.system` 读取 |
| **最终拼接**（`request.ts:58`） | `[agent.prompt, ...loopSystem, user.system].join("\n")` | `[agent.info.system or PROMPT_DEFAULT, context.initial]`（`model-request.ts:57`） |
| **覆盖能力** | 每次 prompt 可注入不同 system | 必须切换 agent 或改 agent 配置 |
| **plugin hook** | `experimental.chat.system.transform` | `session.context` hook 可重塑 |

### 5.2 tools / permission

| 维度 | v1 `client.session.prompt` | v2 `client.v2.session.prompt` |
|------|---------------------------|-------------------------------|
| **参数存在性** | ✅ `tools?: { [name]: boolean }` | ❌ 无此参数 |
| **注入位置** | per-call 参数，转为 `PermissionV1.Rule[]` 存入 `session.permission` | 无，从 `agent.info.permissions` 读取 |
| **转换逻辑**（`prompt.ts:1060`） | `{ "*": true, edit: false }` → `[{permission:"*",action:"allow"},{permission:"edit",action:"deny"}]` | `registry.materialize(agent.info.permissions)`（`model-request.ts:55`） |
| **覆盖能力** | 每次 prompt 可禁用/启用特定工具 | 必须切换 agent 或改 agent 配置 |
| **细粒度** | 仅 allow/deny + pattern | `Permission.Ruleset`（含 effect/action/resource 三维） |

---

## 六、为什么 v2 移除了 per-call system/tools？

### 设计意图（从源码推断）

1. **system prompt 归属 agent，而非 per-call**：v2 把 agent 作为 system prompt 的唯一来源，强制调用方通过 agent 配置而非 prompt 参数控制 system。这避免了 v1 中"同一会话每次 prompt 注入不同 system"导致的状态不一致问题。

2. **权限归属 agent，而非 session-per-call**：v2 用 `Permission.Ruleset`（含 effect/action/resource 三维）取代 v1 的 `{ [name]: boolean }`，权限在 agent 定义时确定，运行时通过 `permission` 子资源动态管理，而非 prompt 参数。

3. **durable + resume 模型**：v2 prompt 是"durable admit + schedule execution"，`resume: false` 可仅写入不启动 loop。per-call system/tools 会破坏 durable 语义（同一条消息在不同 resume 时刻应有相同行为）。

4. **plugin hook 兜底**：v2 通过 `session.context` hook 允许 plugin 重塑 system 和 tools，提供了比 v1 per-call 参数更结构化的扩展点。

### 对 AE 插件的影响

AE 插件的 `ae:brainstorm` 和 `ae:image` 强依赖 v1 per-call `system` 和 `tools`：
- brainstorm：每个视角注入不同的 `system`（乐观派/批评者/...）+ `tools: { edit:false, write:false, ... }`
- image：注入 vision 识别 `system` + 同样的 `tools` 禁用

迁移到 v2 需要：
1. 为每个视角/识别场景创建独立的 agent（含 `system` 和 `permissions` 配置）
2. `prompt` 时通过 `agent` 参数指定 agent，而非 `system`/`tools` 参数
3. 或通过 plugin `session.context` hook 动态注入 system

---

## 七、三套实现的全景对照

| 维度 | v1 `client.session` | v2 `client.v2.session` | experimental |
|------|---------------------|------------------------|--------------|
| **URL 前缀** | `/session` | `/api/session` | `/experimental/session` |
| **create 参数** | `title/agent/model/metadata/permission/parentID/workspaceID` | `id/agent/model/location` | 无 create |
| **prompt 参数** | `parts/system/tools/format/variant/model/agent` | `text/files/agents/delivery/resume/metadata` | 无 prompt |
| **system 来源** | per-call `system` 参数 | `agent.info.system` 配置 | — |
| **tools 来源** | per-call `tools` 参数 → `PermissionV1` | `agent.info.permissions` → `Permission.Ruleset` | — |
| **驱动模型** | 同步流式（prompt）/ 异步即返（promptAsync） | durable admit + `resume` 控制 loop | — |
| **文件附件** | `parts` 内联 `FilePartInput` | `files: FileAttachment[]` 独立参数 | — |
| **合成消息** | 无 | `synthetic` 端点 | — |
| **技能激活** | 无 | `skill` 端点 | — |
| **临时生成** | 无 | `generate` 端点（不写历史） | — |
| **等待/中断** | `abort` | `wait`/`interrupt`/`background` | `background` |
| **事件日志** | 无 | `log` SSE（durable event log） | — |
| **跨项目移动** | 无 | `move` 端点 | — |
| **底层服务** | `SessionPrompt.Service`（`opencode/src/session/prompt.ts`） | `@opencode/v2/Session`（`core/src/session.ts`） | 复用 v1 |
| **plugin hook** | `experimental.chat.system.transform` | `session.context` | — |
| **稳定性** | 稳定（AE 插件当前使用） | 新一代（durable + location） | 实验性 |

---

## 八、结论

**v2 移除 per-call `system`/`tools` 不是"功能缺失"，而是"架构重新归属"**：

- **功能仍在**：system prompt 和工具权限在 v2 中完全保留，且能力更强（Permission.Ruleset 三维权限 vs v1 二维 allow/deny）
- **归属变更**：从 **per-call 参数** 移到 **agent 配置 + plugin hook + permission 子资源**
- **设计哲学**：v2 强制"agent 即人格"——system prompt 和工具权限是 agent 的固有属性，而非每次调用的临时参数。这提升了 durable 语义的一致性，但要求调用方通过 agent 维度而非 call 维度管理 system/tools

**experimental 命名空间**只是 v1 的只读运维子集（list + background），不提供创建能力，面向跨项目会话管理场景。
