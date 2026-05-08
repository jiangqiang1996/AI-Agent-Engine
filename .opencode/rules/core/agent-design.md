# AI Agent 与工具设计规范

## 工具设计原则

### 面向 LLM 设计

工具是为 LLM 设计的 API，必须考虑 LLM 的理解能力和使用方式：

1. **描述优先** - `description` 是 LLM 选择工具的唯一依据，必须清晰、准确、无歧义
2. **参数最小化** - 只暴露必要参数，减少 LLM 出错概率
3. **默认值友好** - 合理设置默认值，让 LLM 在简单场景下只需最少参数
4. **错误可恢复** - 返回结构化错误信息，便于 LLM 理解原因并重试

### 当前工具清单

- 本项目自定义工具，代码文件存放在 `src/tools/` 目录

### 工具定义模板

```typescript
import { tool } from '@opencode-ai/plugin/tool'
import { z } from 'zod'

export const myTool = tool({
  description: [
    '工具的简要描述（一句话）',
    '',
    '功能说明：',
    '- 具体能力 1',
    '- 具体能力 2',
    '',
    '注意事项：',
    '- 限制条件 1',
    '- 限制条件 2',
  ].join('\n'),
  args: {
    target: z.string().describe('目标路径，支持绝对路径和相对路径'),
    pattern: z.string().optional().describe('匹配模式，默认匹配所有'),
  },
  execute: async (args, ctx) => {
    ctx.metadata({ title: `正在处理: ${args.target}` })
    const result = await processTarget(args.target, args.pattern)
    return result
  },
})
```

### 工具描述规范

- 第一行为工具的简短摘要（不超过 50 字）
- 空行后列出功能说明和注意事项
- 使用列表格式提高可读性
- 必须说明工具的 **适用场景** 和 **不适用场景**
- 包含使用示例（可选，对复杂工具有帮助）

## Agent 设计模式

### Agent 组织

- 本项目自定义Agent，以 `.md` 文件存放在 `src/assets/agents/` 目录
- Agent 按职责分为：流程驱动、审查、计划、前端设计、测试等类别

### 工具组合

- 将复杂任务拆分为多个独立工具
- 每个工具只做一件事，通过 LLM 编排多个工具完成任务
- 避免创建"万能工具"，保持工具职责单一

### 上下文管理

- 通过 `ctx.metadata()` 实时反馈执行状态
- 返回结果包含足够的上下文信息供 LLM 决策
- 大量数据返回摘要，避免 Token 浪费

```typescript
execute: async (args, ctx) => {
  ctx.metadata({ title: '生成审查团队...', metadata: { kind: args.kind } })

  const team = await buildReviewTeam(args.kind, args.mode)
  return {
    output: formatTeam(team),
    metadata: { reviewerCount: team.length, mode: args.mode },
  }
}
```

### 错误策略

- 可恢复错误：返回中文提示，引导 LLM 重试或换方案
- 不可恢复错误：返回明确的失败原因
- 禁止在工具中抛出未捕获的异常

```typescript
execute: async (args, ctx) => {
  const file = await readFile(args.path)

  if (!file.exists) {
    return `文件 "${args.path}" 不存在。请检查路径是否正确，或先创建该文件。`
  }

  if (file.tooLarge) {
    return `文件 "${args.path}" 过大（${file.size} 字节），当前仅支持 1MB 以内的文件。建议使用 --lines 参数读取部分内容。`
  }

  return file.content
}
```

## Hook 设计规范

### Hook 注册

```typescript
import type { Hooks } from '@opencode-ai/plugin'

export function registerHooks(input: PluginInput): Partial<Hooks> {
  return {
    'tool.execute.before': async (input, output) => {
      // 工具执行前处理
    },
    'tool.execute.after': async (input, output) => {
      // 工具执行后处理
    },
    event: async ({ event }) => {
      // 事件监听
    },
  }
}
```

### Hook 处理原则

- Hook 函数必须快速返回，禁止长时间阻塞
- 使用 `output` 对象修改输出，不修改 `input`
- 异常必须被捕获，不能影响主流程
- `experimental_*` 前缀的 Hook 为实验性 API，需做好降级处理

## Prompt 工程规范

### System Prompt 设计

- 使用中文编写系统提示词
- 明确 Agent 的角色、能力边界和行为约束
- 提供具体的行为示例而非抽象规则
- 避免相互矛盾的指令

### 工具描述与 Prompt 协同

- 工具描述是 System Prompt 的延伸
- Prompt 中引用工具名称时，必须与工具 ID 完全一致
- 不要在 Prompt 中重复工具描述中已有的信息

## 安全规范

- 工具执行前通过 `ctx.ask()` 请求权限确认
- 敏感操作（文件删除、网络请求等）必须明确提示用户
- 禁止在工具返回中泄露系统路径、环境变量等敏感信息
- 使用 `ctx.abort` 响应取消操作，及时释放资源

## AE 技能列表编写顺序

所有列举多个 AE 技能的地方（代码数组、Markdown 表格、Markdown 列表）必须按以下规则排序。

### 排列原则

1. **用户流程优先** 主流程包括：ideate brainstorm document-review plan/refactor work review；`lfg` 是默认入口，允许紧随主流程放置，也允许在面向入口选择的列表中前置。
2. **浏览器/设计能力成组** `setup`、`test-browser`、`frontend-design` 这类需要环境准备或视觉验证的能力可作为一组，组内按执行依赖排序：setup → test-browser/frontend-design。
3. **辅助与维护能力随后** handoff、prompt-optimize、task-loop、sql、swagger-parser、save-rules、save-session-flow、asset-debug、help、update 等按功能执行顺序或用户发现成本排序。
4. **不同展示面可有不同优化目标** catalog、帮助输出、命令别名、文档总览可以为了默认入口、常用程度或分组展示做局部调整；审查时只在顺序会造成发现性、依赖或注册错误时报告。

### 适用范围

- ts代码中的数组
- 提示词文件以及各种文档中的技能列举

### 审查要求

- 不要仅因 `lfg`、`setup` 或维护类技能的位置与某个示例顺序不同就判为违规。
- 若报告顺序问题，必须说明该顺序导致的具体后果，例如命令注册错误、帮助信息误导、依赖能力后置导致用户无法发现，或同一文件内相互矛盾。
- 新增资产时仍应优先保持同一文件内已有分组风格，避免为了机械排序打散语义相关能力。

## 面向插件使用者的能力边界

面向插件使用者的运行时能力、技能、工具和规则不得写入只能用于 `ai-agent-engine` 插件源码仓库自身的假设。

适用范围：
- 技能提示词、命令说明、公开工具描述、用户侧运行时规则
- 会被下游项目直接使用或触发的诊断、门禁、交付证明能力

豁免范围：
- 本仓库开发规范、测试、构建脚本和内部维护文档
- 仅服务插件源码维护者的资产图谱、CI 建议和仓库诊断脚本
- 用户明确触发的插件安装、更新、从会话创建技能、项目级 opencode 配置管理等专项维护能力；这些能力的目标本身就是管理 AE 插件安装或配置，而不是作为下游项目的通用工程流程

执行要求：
- 面向用户的能力不得硬编码本仓库的 `src/assets/`、`.opencode/plugins/`、`npm run build` 等源码仓库结构或命令作为通用前提
- 如需引用当前仓库结构、构建命令或内部维护流程，必须明确标注为插件源码仓库开发语境
- 用户侧提示和错误信息应描述通用操作证据，而不是要求目标项目符合本仓库布局
- 专项维护能力可以引用 `.opencode/plugins/`、`~/.config/opencode/ai-agent-engine`、`src/assets/`、`npm run build`、桥接文件等路径或命令，但必须满足三点：能力名称或开头说明明确这是 AE 插件安装/更新/源码维护/配置管理语境；不能把这些路径描述为普通下游项目必须具备的业务结构；涉及覆盖、删除、重置、拉取等写操作时必须遵守 Git 与文件写入授权边界。

### 能力分类判定

- **通用运行时能力**：`ae:lfg`、`ae:brainstorm`、`ae:plan`、`ae:work`、`ae:review`、门禁、审查者和普通工具描述。必须完全避免把本仓库布局当作用户项目前提。
- **插件维护专项能力**：`ae:update`、安装/桥接/配置管理说明。允许引用插件源码仓库或安装目录，但必须把引用限定在维护目标上。
- **混合能力**：同一技能同时支持普通项目和 AE 内置模式时，必须在文案中先分流，再分别应用对应边界；不要用普通项目规则否定 AE 内置分支，也不要让 AE 内置分支污染普通项目分支。

审查公开资产时，先判断能力分类，再套用边界。只有当源码仓库假设泄漏到通用运行时路径，或专项维护能力缺少语境/授权说明时，才报告违规。

## GitHub 远程操作边界

- 面向插件用户的技能、命令、代理、工具和流程文案可以从 GitHub 只读获取信息，例如搜索公开代码、研究仓库实践、读取已有 PR 评论。
- 面向插件用户的资产不得提供创建 Issue、创建 Pull Request、创建 Release、推送远程分支等远程写操作流程或可复制命令。
- 当用户需要外部协作或跟踪时，用户侧流程只输出摘要、证据、路径或后续建议，由用户在外部系统自行处理。
- 本边界限制 GitHub 远程写操作，不禁止插件维护专项能力执行本地 Git 更新流程；本地 `git pull`、`git reset`、`git clean` 等仍必须按 Git 工作流规范取得明确授权并限定目标仓库。

## 通用门禁与交付证明

面向插件使用者的 AE 自诊断、硬门禁和交付证明必须依赖通用工作流证据，不得硬编码特定项目的脚本、目录、业务名或测试命令。

允许作为通用证据的来源：
- 需求或计划产物路径
- 用户提供或计划中声明的验证命令
- 审查状态和审查结论
- Git 操作是否获得用户明确授权
- 工作区变更、验证结果和未完成项

禁止作为用户侧通用门禁前提的内容：
- 固定要求目标项目存在某个脚本名、目录名或业务模块名
- 固定使用本仓库的测试、构建或资产生成命令替代用户项目的验证命令
- 把插件源码仓库的维护约定描述为所有下游项目必须满足的条件

此规则不限制本仓库内部维护脚本和开发文档使用仓库专用信息；内部能力若提升为用户侧运行时能力，必须先完成通用化改造。
