# opencode 资产注册与 LLM 智能触发机制分析

> 基于 opencode 源码（`packages/opencode/src`）深入分析 Tool、Skill、Rules、Agent、Command 五类资产的注册方式，以及 LLM 是否能通过 `description` 智能识别并自动触发。

## 核心结论速览

| 资产 | description 是否进入 LLM 上下文 | LLM 能否基于 description 智能触发 | 触发方式 |
|-------|------------------------------|--------------------------------|---------|
| **Tool** | ✅ 是（tools schema 字段） | ✅ 能 | LLM function calling |
| **Skill** | ✅ 是（system prompt 的 `<available_skills>` + skill tool 简略描述） | ✅ 能（两段式：先调 skill tool 加载，再按指令工作） | LLM 调 `skill` tool |
| **Agent** | ✅ 是（追加到 `task` tool 的 description） | ✅ 能（LLM 调 `task` tool 时选 `subagent_type`） | LLM 调 `task` tool |
| **Rules** | ✅ 是（作为 system prompt 静态注入） | ❌ 不能（无触发概念，始终全局生效） | 自动注入，无需触发 |
| **Command** | ❌ 否（仅 UI 推送） | ❌ 不能 | 用户输入 `/commandName` 显式触发 |

---

## 一、Tool（工具）

### 1.1 注册方式

**内置工具**在 `packages/opencode/src/tool/registry.ts:204-222` 逐一注册：

```typescript
const tool = yield* Effect.all({
  invalid: Tool.init(invalid),
  shell: Tool.init(shell),
  read: Tool.init(read),
  glob: Tool.init(globtool),
  grep: Tool.init(greptool),
  edit: Tool.init(edit),
  write: Tool.init(writetool),
  task: Tool.init(task),
  fetch: Tool.init(webfetch),
  todo: Tool.init(todo),
  search: Tool.init(websearch),
  skill: Tool.init(skilltool),
  patch: Tool.init(patchtool),
  question: Tool.init(question),
  lsp: Tool.init(lsptool),
  plan: Tool.init(plan),
  // ...
})
```

**插件工具**在 `registry.ts:120-199` 通过 `fromPlugin()` 注册，来源有两种：
- 文件系统扫描：`Glob.scanSync("{tool,tools}/*.{js,ts}")`（`registry.ts:178-192`）
- 插件 manifest：`plugin.list()` 遍历 `p.tool` 字典（`registry.ts:194-199`）

插件工具定义（`packages/plugin/src/tool.ts:45-51`）：

```typescript
export function tool<Args extends z.ZodRawShape>(input: {
  description: string    // 必填
  args: Args
  execute(args, context): Promise<ToolResult>
}) {
  return input
}
```

### 1.2 description 如何进入 LLM

```
registry.ts:309  →  description: tool.description
    ↓
session/tools.ts:100  →  tool({ description: item.description, ... })
    ↓
session/llm.ts:318  →  tools: prepared.tools  传给 streamText()
    ↓
AI SDK 最终把 description 作为 function schema 的一部分发给 LLM provider
```

### 1.3 LLM 智能触发能力

**✅ 可以**。LLM 在每轮推理时都能看到所有 tool 的 description，依据 function calling 协议自主决定调用。

- 用户无需说「用 X 工具」，只需描述任务
- 例如用户说「搜一下 React 19 的新特性」，LLM 读到 `websearch` 工具的 description 后自行调用
- opencode 本地无任何关键词匹配代码（已搜索 `autoTrigger`/`matchTool` 等模式，全部无命中）

---

## 二、Skill（技能）

### 2.1 注册方式

技能通过扫描 `SKILL.md` 文件注册（`packages/opencode/src/skill/index.ts`）：

```typescript
const OPENCODE_SKILL_PATTERN = "{skill,skills}/**/SKILL.md"
const EXTERNAL_SKILL_PATTERN = "skills/**/SKILL.md"
const SKILL_PATTERN = "**/SKILL.md"
```

扫描范围（`index.ts:173-233`）：
1. **外部目录**：`~/.claude/`、`~/.agents/`（全局）+ 向上查找（项目级）
2. **opencode 配置目录**：`config.directories()`
3. **用户配置路径**：`cfg.skills?.paths`
4. **远程 URL**：`cfg.skills?.urls`（通过 `discovery.pull` 拉取）

加载时解析 frontmatter（`index.ts:105-140`），提取 `name` 和 `description`：

```typescript
state.skills[md.data.name] = {
  name: md.data.name,
  description: md.data.description,
  location: match,
  content: md.content,
}
```

### 2.2 description 如何进入 LLM

**路径 A — system prompt 注入（详细版）**：

```
skill.available(agent)  →  过滤权限后的 skill 列表
    ↓
Skill.fmt(list, { verbose: true })  →  渲染为 <available_skills> XML
    ↓
SystemPrompt.skills  (system.ts:96-108)  →  拼入 system prompt
```

渲染格式（`skill/index.ts:325-337`）：

```xml
<available_skills>
  <skill>
    <name>ae:prd</name>
    <description>探索阶段：澄清目标、边界、约束…产出需求文档</description>
    <location>/path/to/SKILL.md</location>
  </skill>
  ...
</available_skills>
```

system prompt 前缀明确引导（`system.ts:101-103`）：

> Skills provide specialized instructions and workflows for specific tasks.
> Use the skill tool to load a skill when a task matches its description.

**路径 B — skill tool 的 description（简略版）**：

`tool/skill.txt` 的内容作为 `skill` 工具的 description 传给 LLM：

> Load a specialized skill when the task at hand matches one of the skills listed in the system prompt.

源码注释（`system.ts:104-106`）解释了双写设计意图：

> the agents seem to ingest the information about skills a bit better if we present a more verbose version of them here and a less verbose version in tool description, rather than vice versa.

### 2.3 LLM 智能触发能力

**✅ 可以（两段式触发）**：

1. **第一段**：LLM 读到 system prompt 里的 `<available_skills>` 列表 + description，判断用户任务匹配某个 skill
2. **第二段**：LLM 调用 `skill` tool（`tool/skill.ts:12-70`），传入 `name` 参数
3. `skill.execute` 调 `Skill.require(name)` 获取 SKILL.md 内容，注入下一轮对话
4. **后续轮次**：LLM 按 SKILL.md 指令工作

用户无需说「用 ae:prd 技能」，只需描述任务（如「帮我做一份需求文档」），LLM 会根据 description 智能匹配并加载。

---

## 三、Agent（代理 / 子代理）

### 3.1 注册方式

**内置代理**在 `packages/opencode/src/agent/agent.ts:140-265` 硬编码注册：

```typescript
const agents: Record<string, Info> = {
  build:    { name: "build",    description: "The default agent...", mode: "primary" },
  plan:     { name: "plan",     description: "Plan mode...",        mode: "primary" },
  general:  { name: "general",  description: "General-purpose...",   mode: "subagent" },
  explore:  { name: "explore",  description: "Fast agent...",       mode: "subagent" },
  compaction: { name: "compaction", hidden: true, mode: "primary" },
  title:    { name: "title",    hidden: true, mode: "primary" },
  summary:  { name: "summary",  hidden: true, mode: "primary" },
}
```

**用户配置代理**在 `agent.ts:267-294` 从 `cfg.agent` 合并：

```typescript
for (const [key, value] of Object.entries(cfg.agent ?? {})) {
  if (value.disable) { delete agents[key]; continue }
  // 合并 model, prompt, description, temperature, mode, hidden, permission 等
}
```

### 3.2 description 如何进入 LLM

Agent description **不直接进入 system prompt**，而是通过 `task` tool 的 description 间接暴露：

```
registry.ts:260-273  describeTask(agent)
    →  遍历所有非 primary 代理
    →  生成 "Available agent types and the tools they have access to:"
    →  "- explore: Fast agent specialized for exploring codebases..."
    ↓
registry.ts:320-326  拼接到 task tool 的 description
    →  description: [output.description, describeTask(agent), ...].filter(Boolean).join("\n")
    ↓
session/tools.ts:100  传给 AI SDK 的 tool({ description })
    ↓
LLM 在 task 工具的 description 中看到所有可用代理及其描述
```

渲染结果示例（LLM 实际看到的 task 工具 description）：

```
Launch a new agent to handle complex, multistep tasks autonomously.
...
Available agent types and the tools they have access to:
- explore: Fast agent specialized for exploring codebases. Use this when...
- general: General-purpose agent for researching complex questions...
- frontend-dev: 前端开发专精代理：视觉实现与交互逻辑...
```

### 3.3 LLM 智能触发能力

**✅ 可以**。LLM 调用 `task` tool 时，依据 description 中的代理列表选择 `subagent_type`：

- 用户说「帮我找到所有 API 端点」，LLM 读到 `explore` 代理的 description 匹配，调用 `task` tool 并传 `subagent_type: "explore"`
- `task.txt:19` 明确引导 LLM 主动使用：

  > If the agent description mentions that it should be used proactively, then you should try your best to use it without the user having to ask for it first.

**注意**：只有 `mode: "subagent"` 的代理才会出现在 `describeTask` 列表中（`registry.ts:261` 过滤 `item.mode !== "primary"`）。`primary` 代理（如 build、plan）不出现在列表中，由用户在 UI 切换。

---

## 四、Rules（规则 / 指令文件）

### 4.1 注册方式

opencode 中没有独立的 "rules" 资产类型。规则以**指令文件**（Instruction）形式存在，通过 `packages/opencode/src/session/instruction.ts` 加载。

内置识别的文件名（`instruction.ts:64-68`）：

```typescript
const globalFiles = [
  path.join(global.config, "AGENTS.md"),
  ...(!flags.disableClaudeCodePrompt ? [path.join(global.home, ".claude", "CLAUDE.md")] : []),
]
const instructionFiles = [
  "AGENTS.md",
  ...(!flags.disableClaudeCodePrompt ? ["CLAUDE.md"] : []),
  "CONTEXT.md",  // deprecated
]
```

加载范围（`instruction.ts:110-153`）：
1. **全局**：`~/.config/opencode/AGENTS.md` 或 `~/.claude/CLAUDE.md`（取第一个存在的）
2. **项目级**：从当前目录向上查找 `AGENTS.md` / `CLAUDE.md` / `CONTEXT.md`（取第一个匹配层）
3. **用户配置**：`cfg.instructions` 数组中的路径或 URL

### 4.2 description 如何进入 LLM

```
instruction.systemPaths()  →  收集所有指令文件路径
    ↓
instruction.system()  →  读取文件内容，包装为 "Instructions from: <path>\n<content>"
    ↓
session/prompt.ts:1259-1265  →  拼入 system prompt 的 instructions 部分
```

system prompt 拼装顺序（`prompt.ts:1263-1268`）：

```typescript
const system = [
  ...env,            // 环境信息
  ...instructions,   // ← 规则/指令文件内容
  ...(mcpInstructions ? [mcpInstructions] : []),
  ...(skills ? [skills] : []),  // 技能列表
]
```

### 4.3 LLM 智能触发能力

**❌ 不适用**。Rules 没有「触发」概念：

- Rules 是**静态环境上下文**，始终注入 system prompt，对每轮对话全局生效
- Rules 没有 description 字段，也没有 execute 函数
- Rules 不是可调用的资产，而是影响 LLM 行为的背景知识
- 用户无需触发，LLM 也无需选择——规则自动生效

**与 Skill 的关键区别**：Skill 是「按需加载的指令包」，有 description 让 LLM 判断是否加载；Rules 是「始终生效的指令」，不需要判断。

---

## 五、Command（命令 / 斜杠命令）

### 5.1 注册方式

命令在 `packages/opencode/src/command/index.ts:65-157` 注册，来源有四种：

```typescript
// 1. 内置命令
commands[Default.INIT]   = { name: "init",   description: "guided AGENTS.md setup", ... }
commands[Default.REVIEW] = { name: "review", description: "review changes...", subtask: true, ... }

// 2. 用户配置命令（opencode.json 的 command 字段）
for (const [name, command] of Object.entries(cfg.command ?? {})) {
  commands[name] = { name, description: command.description, agent, model, template, subtask, ... }
}

// 3. MCP prompt 衍生命令
for (const [name, prompt] of Object.entries(yield* mcp.prompts())) {
  commands[name] = { name, description: prompt.description, source: "mcp", ... }
}

// 4. Skill 同名衍生命令
for (const item of yield* skill.all()) {
  commands[item.name] = { name: item.name, description: item.description, source: "skill", ... }
}
```

### 5.2 description 如何进入 LLM

**主对话流：不进入**。我已确认 `session/prompt.ts:1257-1268` 拼装 system prompt 时只拼接 `env + instructions + mcpInstructions + skills`，**不含 command 列表**。

description 的去向：
- **UI 推送**：`acp/service.ts:939-943` 通过 `available_commands_update` 事件推给前端，用于命令面板和自动补全
- **subtask 场景**：当 command 配置为 `subtask: true` 且被用户 `/` 触发后，`prompt.ts:1445` 把 `cmd.description` 作为 subtask 的描述传给子任务 agent

### 5.3 LLM 智能触发能力

**❌ 不可以**。命令的触发路径完全由用户主导：

```
用户输入 "/review uncommitted"
    ↓
app/src/components/prompt-input/submit.ts:460  →  检测 text.startsWith("/")
    ↓
client.session.command({ command: "review", arguments: "uncommitted" })
    ↓
session/prompt.ts:1356  →  SessionPrompt.command(input)
    ↓
commands.get("review")  →  精确匹配命令名
    ↓
渲染 template → 发送给 LLM
```

LLM 既看不到 command 列表（不在 system prompt 中），也没有「调 command」的 tool 入口。用户必须显式输入 `/commandName`。

**例外说明**：虽然 Skill 同名衍生出的 Command（`command/index.ts:134-152`）和 Skill 共享 description，但 Command 的触发路径仍然是用户 `/` 输入。Skill 的智能触发走 `skill` tool，Command 的显式触发走 `/`——两条路径互补但独立。

---

## 六、综合对比

### 6.1 资产注册来源汇总

| 资产 | 内置 | 用户配置 | 文件系统扫描 | 插件 | MCP |
|------|------|---------|-------------|------|-----|
| **Tool** | `registry.ts:204-222` | — | `{tool,tools}/*.ts` | `plugin.tool` | MCP tools |
| **Skill** | `customize-opencode` | `cfg.skills.paths` | `**/SKILL.md` | — | — |
| **Agent** | `agent.ts:140-265` | `cfg.agent` | — | — | — |
| **Rules** | `AGENTS.md`/`CLAUDE.md` | `cfg.instructions` | `findUp` 向上查找 | — | — |
| **Command** | `init`/`review` | `cfg.command` | — | — | `mcp.prompts()` |

### 6.2 description 在 LLM 上下文中的位置

```
System Prompt
├── env（环境信息）                        ← 固定
├── instructions（Rules / AGENTS.md）      ← Rules 内容，始终生效
├── mcp_instructions                       ← MCP 服务器指令
└── <available_skills>                     ← Skill 的 name + description
    └── "Use the skill tool when a task matches its description."

Tools Schema（传给 LLM 的 function 定义）
├── websearch  →  description: "Search the web..."
├── read       →  description: "Read a file..."
├── skill      →  description: "Load a specialized skill..."
├── task       →  description: "Launch a new agent...\nAvailable agent types:\n- explore: ..."
│                                          ← Agent description 追加在 task tool 的 description 末尾
└── ...
```

### 6.3 智能触发能力对比

| 资产 | 智能触发 | 触发机制 | 用户是否需提及资产名 |
|------|---------|---------|-------------------|
| **Tool** | ✅ | LLM 读完 tools schema 的 description 后 function calling | ❌ 不需要 |
| **Skill** | ✅ | LLM 读完 system prompt 的 `<available_skills>` 后调 `skill` tool | ❌ 不需要 |
| **Agent** | ✅ | LLM 读完 `task` tool description 中的代理列表后调 `task` tool | ❌ 不需要 |
| **Rules** | ❌ | 无触发概念，始终全局注入 | ❌ 不适用 |
| **Command** | ❌ | 用户输入 `/commandName` 显式触发 | ✅ 需要 |

### 6.4 设计哲学

opencode 的资产设计遵循「**给 LLM 用的 vs 给用户用的**」分层：

- **给 LLM 用的**（Tool、Skill、Agent）：description 暴露给模型，靠 function calling 智能选择
  - Tool 是「一段式」直接执行
  - Skill 是「两段式」先加载指令再执行
  - Agent 是「委托式」通过 task tool 委托子代理

- **给用户用的**（Command）：description 仅用于 UI，靠 `/` 语法显式触发
  - 命令是用户的快捷方式，不是 LLM 的能力

- **给所有人用的**（Rules）：无 description，无触发，始终作为背景知识生效
  - 规则影响 LLM 的行为倾向，但不提供可调用的能力

这也解释了为什么 AE 插件中 `ae:prd`、`ae:design`、`ae:work` 等核心流程**同时注册为 Skill 和 Command**——Skill 路径让 LLM 智能触发，Command 路径让用户显式触发，两条路径互补。

---

## 七、延迟加载模式：仅注入描述，使用时再读取整个

并非所有资产都把完整内容一次性塞进 system prompt。**Skill 和 Agent** 采用「注入时仅注入描述，真正使用时才读取/注入完整内容」的延迟加载（lazy loading）模式，以节省 token、避免上下文污染。其他三类资产不适用此模式。

### 7.1 各资产加载模式对比

| 资产 | 注入时（system prompt / tools schema） | 使用时（真正执行） | 是否延迟加载 |
|------|--------------------------------------|-------------------|:-:|
| **Tool** | description 全量注入 tools schema | execute 直接执行逻辑，无后续内容读取 | ❌ 即调即执行 |
| **Skill** | 仅 `<name>` + `<description>` + `<location>` | 读取完整 SKILL.md 正文 + 目录下采样文件列表 | ✅ |
| **Agent** | 仅 `- <name>: <description>` 列表 | 启动子会话，注入完整 `agent.prompt` | ✅ |
| **Rules** | 文件全文全量注入 system prompt | 无后续读取（已全量注入） | ❌ 全量预加载 |
| **Command** | description 不进 LLM | 用户 `/` 触发后渲染 template 全文 | ❌ 用户显式触发 |

### 7.2 Skill 的延迟加载

#### 注入阶段（system prompt，仅描述）

`Skill.fmt()`（`skill/index.ts:321-346`）渲染时只输出 name 和 description：

```xml
<available_skills>
  <skill>
    <name>ae:prd</name>
    <description>探索阶段：澄清目标、边界、约束…产出需求文档</description>
    <location>/path/to/SKILL.md</location>
  </skill>
  ...
</available_skills>
```

通过 `SystemPrompt.skills`（`system.ts:96-108`）拼入 system prompt，前缀引导：

> Skills provide specialized instructions and workflows for specific tasks.
> Use the skill tool to load a skill when a task matches its description.

#### 使用阶段（LLM 调 skill tool，读取完整内容）

LLM 判断任务匹配某个 skill 的 description 后，调用 `skill` tool（`tool/skill.ts:21-67`）：

```typescript
// skill.ts:34-61
const dir = path.dirname(info.location)
const files = yield* ripgrep.find({
  cwd: dir,
  pattern: "!**/SKILL.md",    // 排除 SKILL.md 本身
  hidden: true,
  limit: 10,                  // 最多采样 10 个文件
})

return {
  title: `Loaded skill: ${info.name}`,
  output: [
    `<skill_content name="${info.name}">`,
    `# Skill: ${info.name}`,
    "",
    info.content.trim(),     // ← 完整 SKILL.md 正文
    "",
    `Base directory for this skill: ${base}`,
    "<skill_files>",
    files.map((file) => `<file>${path.resolve(dir, file.path)}</file>`).join("\n"),
    "</skill_files>",
    "</skill_content>",
  ].join("\n"),
}
```

完整内容（`info.content` 即 SKILL.md 正文）作为 tool result 返回给 LLM，在后续轮次生效。

#### 设计意图

避免把所有 skill 的完整内容都塞进 system prompt 导致 token 爆炸。只在 LLM 判断「任务匹配某个 skill 的 description」后才加载该 skill 的完整指令。这是典型的「**摘要占位 + 按需展开**」模式。

### 7.3 Agent 的延迟加载

#### 注入阶段（task tool 的 description，仅列表）

`describeTask()`（`registry.ts:260-273`）只生成 name + description 列表：

```
Available agent types and the tools they have access to:
- explore: Fast agent specialized for exploring codebases. Use this when...
- general: General-purpose agent for researching complex questions...
```

通过 `registry.ts:320-326` 拼接到 `task` tool 的 description 末尾，LLM 只看到摘要列表。

#### 使用阶段（LLM 调 task tool，启动子会话注入完整 prompt）

LLM 调用 `task` tool 传入 `subagent_type` 后（`tool/task.ts:142-198`）：

```typescript
// task.ts:144-158  创建子会话
const nextSession = yield* sessions.create({
  parentID: ctx.sessionID,
  title: params.description + ` (@${next.name} subagent)`,
  agent: next.name,           // ← 指定子代理
  permission: [...],
})

// task.ts:186-198  在子会话中执行
const runTask = Effect.fn("TaskTool.runTask")(function* () {
  const parts = yield* ops.resolvePromptParts(params.prompt)
  const result = yield* ops.prompt({
    sessionID: nextSession.id,
    agent: next.name,          // ← 子会话使用该 agent
    parts,
  })
})
```

子会话走 `SessionPrompt.prompt` → `LLMRequestPrep.prepare`（`session/llm/request.ts:56-66`），在 prepare 里注入完整 `agent.prompt`：

```typescript
// request.ts:58-65
const system = [
  [
    ...(input.agent.prompt ? [input.agent.prompt] : SystemPrompt.provider(input.model)),
    //                ↑ 完整 agent prompt（如 PROMPT_EXPLORE 全文）在此注入
    ...input.system,
    ...(input.user.system ? [input.user.system] : []),
  ].filter((x) => x).join("\n"),
]
```

完整 `agent.prompt`（如 `PROMPT_EXPLORE`、`PROMPT_TITLE` 等全文）只在子会话内生效，不污染主对话上下文。

#### 设计意图

子代理的完整 prompt 可能很长（如 explore 代理的探索策略说明），若全部塞入主对话的 system prompt 会大幅消耗 token 且干扰主代理决策。延迟到子会话启动时才注入，实现上下文隔离。

### 7.4 为什么其他三类不是延迟加载

| 资产 | 不适用的原因 |
|------|-------------|
| **Tool** | 没有独立的「完整内容」需要后续读取——description 就是全部信息，execute 是直接执行逻辑，不返回待加载的指令文本 |
| **Rules** | 没有延迟加载——`instruction.system()`（`instruction.ts:155-169`）直接读取文件全文拼入 system prompt，始终全量生效 |
| **Command** | description 根本不进 LLM——用户 `/` 触发后直接渲染 template 全文发给 LLM，不存在「先注入描述」的阶段 |

### 7.5 延迟加载模式总结

```
┌─────────────────────────────────────────────────────────┐
│  主对话 System Prompt（每轮都存在）                       │
│  ┌───────────────────────────────────────────────────┐  │
│  │  <available_skills>                               │  │
│  │    仅 name + description（Skill 摘要）            │  │
│  │  </available_skills>                               │  │
│  ├───────────────────────────────────────────────────┤  │
│  │  task tool description                             │  │
│  │    仅 "- name: description"（Agent 摘要列表）      │  │
│  ├───────────────────────────────────────────────────┤  │
│  │  Rules 全文（始终全量注入，无延迟）                 │  │
│  ├───────────────────────────────────────────────────┤  │
│  │  tools schema（各 tool 的 description 全量注入）   │  │
│  └───────────────────────────────────────────────────┘  │
└───────────────────────────┬─────────────────────────────┘
                            │
              LLM 决定调用时 │
                            ▼
┌─────────────────────────────────────────────────────────┐
│  Skill 使用时：skill tool execute                       │
│    → 读取完整 SKILL.md 正文 + 采样文件列表              │
│    → 作为 tool result 注入后续轮次                      │
├─────────────────────────────────────────────────────────┤
│  Agent 使用时：task tool execute                        │
│    → 创建子会话，指定 agent                             │
│    → 子会话 system prompt 注入完整 agent.prompt         │
│    → 上下文隔离，不回传主对话                           │
└─────────────────────────────────────────────────────────┘
```

**Skill 是「摘要占位 + 按需展开内容」**，**Agent 是「摘要占位 + 按需启动隔离上下文」**。两者都用 description 作为「索引」，把完整内容延迟到真正需要时才加载，是 opencode 控制 token 消耗和上下文污染的核心设计模式。

---

## 附：关键源码索引

| 关注点 | 文件路径 | 行号 |
|-------|---------|------|
| Tool 定义结构 | `packages/opencode/src/tool/tool.ts` | 55-65 |
| Tool 注册（内置+插件） | `packages/opencode/src/tool/registry.ts` | 120-248 |
| Tool description 传给 LLM | `packages/opencode/src/session/tools.ts` | 99-133 |
| Skill 加载与注册 | `packages/opencode/src/skill/index.ts` | 105-319 |
| Skill description 渲染 | `packages/opencode/src/skill/index.ts` | 321-346 |
| Skill 注入 system prompt | `packages/opencode/src/session/system.ts` | 96-108 |
| skill tool 定义 | `packages/opencode/src/tool/skill.ts` | 12-70 |
| Agent 注册（内置+配置） | `packages/opencode/src/agent/agent.ts` | 140-294 |
| Agent description 暴露给 LLM | `packages/opencode/src/tool/registry.ts` | 260-273, 320-326 |
| task tool 定义 | `packages/opencode/src/tool/task.ts` | 81-345 |
| Rules / 指令文件加载 | `packages/opencode/src/session/instruction.ts` | 60-169 |
| Rules 注入 system prompt | `packages/opencode/src/session/prompt.ts` | 1256-1268 |
| Command 注册 | `packages/opencode/src/command/index.ts` | 65-157 |
| Command 触发（用户 `/` 输入） | `packages/app/src/components/prompt-input/submit.ts` | 460-481 |
| Command 执行 | `packages/opencode/src/session/prompt.ts` | 1356-1481 |
| system prompt 拼装 | `packages/opencode/src/session/prompt.ts` | 1256-1268 |
| 插件 Tool 定义 schema | `packages/plugin/src/tool.ts` | 45-51 |
| Skill 延迟加载：execute 读取完整内容 | `packages/opencode/src/tool/skill.ts` | 34-61 |
| Agent 延迟加载：task tool 创建子会话 | `packages/opencode/src/tool/task.ts` | 142-198 |
| Agent prompt 注入子会话 system | `packages/opencode/src/session/llm/request.ts` | 56-66 |
