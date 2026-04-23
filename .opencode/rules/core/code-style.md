# 代码风格规范

## 命名约定

### 文件命名

| 类型 | 格式 | 示例 |
|------|------|------|
| 工具文件 | `kebab-case.tool.ts` | `ae-review-contract.tool.ts` |
| Hook 文件 | `kebab-case.hook.ts` | `chat-message.hook.ts` |
| 服务文件 | `kebab-case.ts` | `recovery-service.ts` |
| Schema 文件 | `kebab-case.ts` | `review-catalog.ts` |
| 工具函数 | `kebab-case.ts` | `string-utils.ts` |
| 测试文件 | `kebab-case.test.ts` | `recovery-service.test.ts` |

### 代码命名

| 类型 | 格式 | 示例 |
|------|------|------|
| 变量 | `camelCase` | `sessionID` |
| 常量 | `SCREAMING_SNAKE_CASE` | `MAX_RETRY_COUNT` |
| 函数 | `camelCase` | `processMessage` |
| 类/接口/类型 | `PascalCase` | `ToolContext` |
| Zod Schema | `PascalCase` + `Schema` 后缀 | `AgentConfigSchema` |
| Effect Service Tag | `PascalCase` + `Tag` 后缀 | `FileServiceTag` |
| 枚举 | `PascalCase` | `ErrorCode` |

## TypeScript 规范

### 严格模式

- 启用 `strict: true`
- 禁止使用 `any`，使用 `unknown` 替代
- 禁止非空断言 `!`，使用类型守卫
- 优先使用 `interface` 定义对象类型，`type` 用于联合类型和工具类型

### 类型导入

```typescript
// 使用 type 导入纯类型
import type { ToolContext } from "@opencode-ai/plugin"

// 运行时导入同时带类型
import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool"
```

### 导出规范

- 使用命名导出，禁止默认导出（入口文件除外）
- 每个文件只导出公共 API，内部实现不导出
- 使用 `satisfies` 运算符进行类型校验

## Effect 框架规范

### 优先使用 Effect

- 所有涉及 IO、异步、错误的操作使用 Effect
- 使用 `Effect.gen` 替代 async/await 处理复杂流程
- 使用 `Effect.catchAll` / `Effect.catchTag` 精确处理错误

```typescript
import { Effect } from "effect"

const program = Effect.gen(function* (_) {
  const data = yield* _(readFile(path))
  const result = yield* _(processData(data))
  return result
}).pipe(
  Effect.catchTag("FileNotFoundError", () =>
    Effect.succeed("文件未找到，使用默认配置")
  )
)
```

### Service 定义

```typescript
import { Context, Effect, Layer } from "effect"

class FileService extends Context.Tag("FileService")<
  FileService,
  { read: (path: string) => Effect.Effect<string> }
>() {}

const FileServiceLive = Layer.succeed(FileService, {
  read: (path) => Effect.tryPromise(() => fs.readFile(path, "utf-8")),
})
```

## Zod 规范

- 所有外部输入必须经过 Zod Schema 校验
- Schema 字段必须附带 `.describe()` 中文描述
- 使用 `z.infer<>` 推导类型，禁止手动定义重复类型

```typescript
import { z } from "zod"

const AgentConfigSchema = z.object({
  name: z.string().min(1).describe("Agent 名称"),
  model: z.string().default("gpt-4").describe("使用的模型"),
  temperature: z.number().min(0).max(2).default(0.7).describe("生成温度"),
})

type AgentConfig = z.infer<typeof AgentConfigSchema>
```

## 代码格式

- 缩进: 2 个空格
- 行宽: 120 字符
- 分号: 不使用分号
- 引号: 单引号
- 尾随逗号: 多行时使用
- 花括号: 单行语句也必须使用花括号

## 注释规范

- 代码注释使用中文
- 公共 API 必须包含 JSDoc 注释
- 注释说明 **为什么**，而非 **做了什么**
- 禁止无意义的注释或被注释掉的代码

```typescript
/**
 * 解析 Agent 配置文件
 * 支持 JSON 和 YAML 格式，自动检测文件扩展名
 */
export function parseConfig(content: string, ext: string): AgentConfig {
  // YAML 格式需要额外的预处理，将多文档合并为单文档
  if (ext === ".yaml" || ext === ".yml") {
    return parseYamlConfig(content)
  }
  return parseJsonConfig(content)
}
```
