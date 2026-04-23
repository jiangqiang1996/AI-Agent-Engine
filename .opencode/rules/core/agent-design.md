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
import { tool } from "@opencode-ai/plugin/tool"
import { z } from "zod"

export const myTool = tool({
  description: [
    "工具的简要描述（一句话）",
    "",
    "功能说明：",
    "- 具体能力 1",
    "- 具体能力 2",
    "",
    "注意事项：",
    "- 限制条件 1",
    "- 限制条件 2",
  ].join("\n"),
  args: {
    target: z.string().describe("目标路径，支持绝对路径和相对路径"),
    pattern: z.string().optional().describe("匹配模式，默认匹配所有"),
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

- 本项目自定义Agent，以 `.md` 文件存放在 `agents/` 目录
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
  ctx.metadata({ title: "生成审查团队...", metadata: { kind: args.kind } })

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
import type { Hooks } from "@opencode-ai/plugin"

export function registerHooks(input: PluginInput): Partial<Hooks> {
  return {
    "tool.execute.before": async (input, output) => {
      // 工具执行前处理
    },
    "tool.execute.after": async (input, output) => {
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
