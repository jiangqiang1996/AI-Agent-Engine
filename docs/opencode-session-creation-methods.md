# OpenCode SDK 会话创建方式全景分析

> SDK 包：`packages/sdk/js/src/v2/`（对外暴露的 `@opencode-ai/sdk/v2`）
> 生成时间：2026-07-19

## 一、SDK 顶层结构

`OpencodeClient`（`sdk.gen.ts:8686`）暴露三个 session 命名空间：

| 访问路径 | 类 | URL 前缀 | 版本定位 |
|----------|----|----------|----------|
| `client.session` | `Session2` | `/session` | **v1 稳定 API**（AE 插件当前使用） |
| `client.v2.session` | `Session3` | `/api/session` | **v2 新一代 API**（durable + location + delivery） |
| `client.experimental.session`（仅 list/background） | `Session` | `/experimental/session` | 实验性，仅 list 与 background |

> 三个类互不继承，各自独立封装 HTTP 端点。

---

## 二、v1 `client.session`（Session2）—— AE 插件当前使用的方式

### 2.1 会话创建 / 生命周期

| 方法 | HTTP | 签名要点 | 说明 |
|------|------|----------|------|
| `create` | `POST /session` | `{ parentID?, title?, agent?, model?, metadata?, permission?, workspaceID? }` | 创建空会话，不触发任何 LLM 调用 |
| `fork` | `POST /session/{sessionID}/fork` | `{ messageID? }` | 从已有会话某消息点分叉，复制历史 |
| `delete` | `DELETE /session/{sessionID}` | — | 删除会话及所有消息 |
| `get` | `GET /session/{sessionID}` | — | 读取会话信息 |
| `update` | `PATCH /session/{sessionID}` | `{ title?, metadata?, permission?, time? }` | 更新标题/元数据/权限/归档 |
| `list` | `GET /session` | `{ search?, limit?, start?, scope?, path?, roots? }` | 列出会话 |
| `children` | `GET /session/{sessionID}/children` | — | fork 子会话列表 |
| `status` | `GET /session/status` | — | 全部会话状态 |
| `init` | `POST /session/{sessionID}/init` | `{ modelID?, providerID?, messageID? }` | 生成 AGENTS.md |
| `share` / `unshare` | `POST/DELETE /session/{sessionID}/share` | — | 分享/取消分享 |
| `summarize` | `POST /session/{sessionID}/summarize` | `{ providerID?, modelID?, auto? }` | AI 压缩摘要 |

### 2.2 会话内消息驱动（触发 LLM）

| 方法 | HTTP | 签名要点 | 与"创建会话"的关系 |
|------|------|----------|---------------------|
| `prompt` | `POST /session/{sessionID}/message` | `{ model?, agent?, tools?, format?, system?, variant?, parts? }` | **同步流式**发送消息并启动 agent loop |
| `promptAsync` | `POST /session/{sessionID}/prompt_async` | 同 prompt | **异步**发送消息，立即返回，不等待 agent loop |
| `command` | `POST /session/{sessionID}/command` | `{ command, arguments, agent?, model?, variant?, parts? }` | 执行 slash 命令，等价于"命令式创建消息" |
| `shell` | `POST /session/{sessionID}/shell` | `{ command?, agent?, model? }` | 在会话上下文执行 shell |
| `revert` / `unrevert` | `POST /session/{sessionID}/revert(unrevert)` | `{ messageID?, partID? }` | 回滚/恢复消息 |

### 2.3 AE 插件实际使用模式

`ae:brainstorm` 与 `ae:image` 都走 **v1 同步流式**：

```
client.session.create({ title })          // 1. 创建空会话
client.session.prompt({ sessionID, parts, system, tools, model? })  // 2. 同步驱动 LLM
client.session.delete({ sessionID })      // 3. 用完即删
```

> `ae-create-session` 工具（`session.service.ts`）同样使用 `client.session.create` + `client.session.prompt`，未使用 v2。

---

## 三、v2 `client.v2.session`（Session3）—— 新一代 durable API

### 3.1 会话创建 / 生命周期

| 方法 | HTTP | 签名要点 | 与 v1 对比 |
|------|------|----------|-----------|
| `create` | `POST /api/session` | `{ id?, agent?, model?, location? }` | **参数更精简**：用 `location` 取代 v1 的 `directory/workspace/workspaceID/parentID`；不再支持 `title/metadata/permission` 传入 |
| `fork` | `POST /api/session/{sessionID}/fork` | `{ messageID? }` | 语义同 v1 |
| `remove` | `DELETE /api/session/{sessionID}` | — | v1 叫 `delete`，v2 叫 `remove` |
| `get` | `GET /api/session/{sessionID}` | — | 同 v1 |
| `list` | `GET /api/session` | `{ order?, cursor?, parentID?, project?, subpath? }` | **游标分页**取代 v1 的 `start/limit` 偏移 |
| `active` | `GET /api/session/active` | — | v1 无此 API，列出本进程持有的前台 drain |
| `switchAgent` | `POST /api/session/{sessionID}/agent` | `{ agent? }` | v1 无独立切换端点 |
| `switchModel` | `POST /api/session/{sessionID}/model` | `{ model? }` | v1 无独立切换端点 |
| `rename` | `POST /api/session/{sessionID}/rename` | `{ title? }` | v1 走 `update` |
| `move` | `POST /api/session/{sessionID}/move` | `{ locationRefV2 }` | **跨项目移动会话**，v1 无此能力 |

### 3.2 会话内消息驱动

| 方法 | HTTP | 签名要点 | 与 v1 对比 |
|------|------|----------|-----------|
| `prompt` | `POST /api/session/{sessionID}/prompt` | `{ id?, text?, files?, agents?, metadata?, delivery?, resume? }` | **参数模型完全不同**：用 `text/files/agents` 取代 v1 的 `parts`；新增 `delivery: "steer"\|"queue"`（转向/排队）和 `resume: boolean`（是否启动 agent loop） |
| `command` | `POST /api/session/{sessionID}/command` | `{ command?, arguments?, agent?, model?, files?, agents?, delivery?, resume? }` | 同上，支持 delivery/resume |
| `synthetic` | `POST /api/session/{sessionID}/synthetic` | `{ id?, text?, description?, metadata?, delivery?, resume? }` | **合成消息**注入，v1 无此能力 |
| `skill` | `POST /api/session/{sessionID}/skill` | `{ id?, skill?, resume? }` | **激活技能**并恢复执行，v1 无此能力 |
| `shell` | `POST /api/session/{sessionID}/shell` | `{ id?, command? }` | 精简版 shell |
| `compact` | `POST /api/session/{sessionID}/compact` | `{ id? }` | 显式触发压缩 |
| `wait` | `POST /api/session/{sessionID}/wait` | — | **等待 agent loop 空闲**，v1 无此 API |
| `interrupt` | `POST /api/session/{sessionID}/interrupt` | — | 中断执行 |
| `background` | `POST /api/session/{sessionID}/background` | — | 将可后台化的工具转入后台 |
| `generate` | `POST /api/session/{sessionID}/generate` | `{ prompt? }` | **基于会话上下文生成临时文本，不写入历史**，v1 无此能力 |
| `context` | `GET /api/session/{sessionID}/context` | — | 读取活跃上下文消息（压缩后） |
| `log` | `GET /api/experimental/session/{sessionID}/log` (SSE) | `{ after?, follow? }` | **durable 事件日志**，可 follow 实时流 |
| `message` | `GET /api/session/{sessionID}/message/{messageID}` | — | 读取单条投影消息 |

### 3.3 v2 子资源

`Session3` 还聚合了子资源 getter：`revert`、`pending`、`instructions`、`form`、`permission`、`question`，对应 v2 细粒度权限/表单/指令体系。

---

## 四、实验性 `client.experimental.session`（Session）

仅两个方法，URL 前缀 `/experimental/session`：

| 方法 | HTTP | 说明 |
|------|------|------|
| `list` | `GET /experimental/session` | 跨项目列出会话（含 archived 过滤） |
| `background` | `POST /experimental/session/{sessionID}/background` | 分离阻塞的同步子代理到后台 |

> 不提供 `create`。实验性命名空间面向跨项目运维，不用于新建会话。

---

## 五、Plugin 层 `ctx.client` 暴露的会话能力

`packages/plugin/src/index.ts:57` 定义 plugin 上下文的 `client: ReturnType<typeof createOpencodeClient>`，即与 `OpencodeClient` 同构。插件代码通过 `getGlobalClient()` 拿到该 client，可访问上述全部 v1/v2/experimental API。

v2 plugin SDK（`packages/plugin/src/v2/promise/session.ts`）额外定义了 `SessionDomain` 类型：

```ts
type SessionDomain = Pick<
  SessionApi,
  "create" | "get" | "prompt" | "generate" | "command" | "synthetic" | "interrupt"
> & { readonly hook: Hooks<SessionHooks> }
```

即 v2 plugin 上下文只暴露 7 个核心方法 + `hook`，比 HTTP SDK 更收敛。

---

## 六、底层服务层（`packages/opencode/src/session/`）

SDK 端点最终落到 Effect 服务：

| 服务 | 文件 | 对应 SDK 能力 |
|------|------|---------------|
| `Session.Service` | `session.ts` | `create`/`fork`/`get`/`list`/`remove`/`setAgentModel`/`setPermission` 等 |
| `SessionPrompt.Service` | `prompt.ts` | `prompt`/`loop`/`shell`/`command`/`cancel` |
| `SessionCompaction.Service` | `compaction.ts` | `summarize`/`compact` |
| `SessionRevert.Service` | `revert.ts` | `revert`/`unrevert` |
| `SessionSummary.Service` | `summary.ts` | 自动摘要 |
| `SessionRunState.Service` | `run-state.ts` | 运行状态机 |
| `SessionStatus.Service` | `status.ts` | busy/idle 状态 |

`Session.create`（`session.ts:661`）签名：

```ts
create(input?: {
  parentID?: SessionID
  title?: string
  agent?: string
  model?: Model
  metadata?: Metadata
  permission?: PermissionV1.Ruleset
  workspaceID?: WorkspaceV2.ID
})
```

`SessionPrompt.prompt`（`prompt.ts:1052`）核心流程：`createUserMessage → resolvePart → loop → runLoop → prepare`，其中 `resolvePart` 对 file part 按 `data:`/`file:` 协议分叉处理。

---

## 七、v1 vs v2 创建会话核心差异对照

| 维度 | v1 `client.session.create` + `prompt` | v2 `client.v2.session.create` + `prompt` |
|------|--------------------------------------|------------------------------------------|
| **URL** | `/session` + `/session/{id}/message` | `/api/session` + `/api/session/{id}/prompt` |
| **create 参数** | `title/agent/model/metadata/permission/parentID/workspaceID` | `id/agent/model/location`（无 title/metadata/permission） |
| **prompt 参数** | `parts: TextPartInput\|FilePartInput\|AgentPartInput\|SubtaskPartInput` + `system/tools/format/variant` | `text/files/agents` + `delivery/resume/metadata`（无 system/tools/format） |
| **驱动模型** | 同步流式（prompt）或异步即返（promptAsync） | durable admit + `resume` 控制是否启动 loop；`delivery` 控制转向/排队 |
| **system prompt** | 调用方可通过 `system` 字段注入 | v2 prompt 无 `system` 字段，system 由 agent/skill 上下文决定 |
| **tools 权限** | 调用方传 `tools: { [name]: boolean }` | v2 prompt 无 `tools` 字段，权限走 `permission` 子资源 |
| **文件附件** | `parts` 内联 `FilePartInput` | `files: PromptInputFileAttachment[]` 独立参数 |
| **合成消息** | 无 | `synthetic` 端点 |
| **技能激活** | 无 | `skill` 端点 |
| **临时生成** | 无 | `generate` 端点（不写历史） |
| **等待/中断** | 仅 `abort` | `wait`/`interrupt`/`background` |
| **事件日志** | 无 | `log` SSE（durable event log） |
| **跨项目移动** | 无 | `move` 端点 |

---

## 八、AE 插件当前使用的创建方式汇总

| 工具/服务 | 文件 | 使用方式 |
|-----------|------|----------|
| `ae:brainstorm` | `services/brainstorm-service.ts:146,170` | v1 `session.create({title})` + `session.prompt({parts:[text], system, tools, model?})` + `session.delete`，N×R+1 个临时会话 |
| `ae:image`/`ae:audio`/`ae:video` | `services/vision-service.ts:116,149` | v1 `session.create({title})` + `session.prompt({parts:[text,file], system, tools, model?})` + `session.delete`，1 个临时会话 |
| `ae-create-session` 工具 | `services/session.service.ts:94,156,171,187` | v1 `session.create({title})` + `session.prompt(...)`，不删除 |
| `ae-review-scope-analyze` | `tools/ae-review-scope-analyze.tool.ts:442,448` | v1 `session.create` + `session.prompt`，用于子会话内容分析 |

**结论**：AE 插件全部使用 **v1 `client.session.create` + `client.session.prompt`**，未使用 v2 `client.v2.session.*`、`fork`、`promptAsync`、`command`、`shell`、`synthetic`、`skill`、`generate` 等任何其他创建/驱动方式。

---

## 九、迁移到 v2 的潜在收益与风险

### 收益

1. **durable + resume**：v2 prompt 默认持久化输入，可通过 `resume: false` 仅写入不启动 loop，适合"先批量注入上下文再统一执行"
2. **delivery: steer/queue**：steer 可中途转向正在运行的 loop，queue 排队等待，比 v1 的同步流式更灵活
3. **synthetic**：可注入合成消息，适合 brainstorm 的"前轮摘要"传递，无需塞进 user prompt
4. **generate**：基于会话上下文生成临时文本不写历史，适合 vision 识别等"一次性问答"
5. **log SSE**：可 follow 实时事件，替代 v1 的流式响应
6. **location**：统一的位置模型，取代 v1 的 directory/workspace 散落参数

### 风险

1. **v2 prompt 无 `system`/`tools` 字段**：brainstorm/image 当前依赖 `system` 注入角色提示词、`tools` 禁用 edit/write/question，迁移到 v2 需改用 agent 配置或 permission 子资源，改造量大
2. **v2 create 无 `title`**：临时会话的标题需通过 `rename` 二次调用
3. **v2 API 路径 `/api/`**：可能要求 server 启用 v2 路由，需确认部署兼容性
4. **v2 仍在演进**：`log` 端点带 `experimental` 前缀，稳定性待评估
