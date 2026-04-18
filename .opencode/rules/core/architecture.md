# 架构设计规范

## 模块划分

```
src/
├── index.ts              # 插件入口，导出 PluginModule
├── tools/                # 工具定义
│   ├── index.ts          # 工具注册汇总
│   └── *.tool.ts         # 单个工具定义
├── hooks/                # Hook 处理器
│   ├── index.ts          # Hook 注册汇总
│   └── *.hook.ts         # 单个 Hook 处理器
├── services/             # 业务服务层
│   └── *.ts              # 业务逻辑封装
├── schemas/              # Zod Schema 定义
│   └── *.ts              # 数据校验 Schema
└── utils/                # 工具函数
    └── *.ts              # 通用工具函数
```

## 分层原则

### 入口层 (`index.ts`)

- 实现唯一的 `PluginModule` 导出
- `server` 函数负责组装所有 Hook 和 Tool
- 不包含业务逻辑，仅做依赖注入和注册

```typescript
import type { PluginModule } from "@opencode-ai/plugin"

export default {
  server: async (input, options) => {
    return {
      tool: { ...registerTools(input) },
      event: handleEvent(input),
    }
  },
} satisfies PluginModule
```

### 工具层 (`tools/`)

- 每个工具一个文件，使用 `@opencode-ai/plugin/tool` 的 `tool()` 函数定义
- 工具描述必须清晰、准确，便于 LLM 理解
- 参数使用 Zod Schema 定义，提供完整的中文描述
- 执行函数仅编排业务逻辑，不直接实现细节

```typescript
import { tool } from "@opencode-ai/plugin/tool"
import { z } from "zod"

export const myTool = tool({
  description: "工具的中文描述",
  args: {
    input: z.string().describe("输入参数描述"),
  },
  execute: async (args, ctx) => {
    return "结果"
  },
})
```

### Hook 层 (`hooks/`)

- 每个 Hook 类型一个文件
- 遵循 `before` → `执行` → `after` 的处理模式
- 使用 Effect 管理副作用和错误

### 服务层 (`services/`)

- 封装核心业务逻辑
- 对外暴露纯函数接口
- 使用 Effect 处理 IO、错误和并发

### Schema 层 (`schemas/`)

- 集中管理所有 Zod Schema
- Schema 必须附带 `.describe()` 中文描述
- 复合 Schema 使用 `.extend()` 或 `.merge()` 组合

## 依赖方向

```
index.ts → tools/ → services/ → schemas/
                  → hooks/   → services/
                              → utils/
```

- 上层可以依赖下层，下层禁止依赖上层
- 同层之间最小化依赖
- 禁止循环依赖

## 错误处理

- 使用 Effect 的 `Schema.TaggedError` 定义业务错误
- 工具层捕获所有错误，返回用户友好的中文错误信息
- 禁止 `try/catch` 包裹整个函数体，精确捕获特定错误

```typescript
import { Schema } from "effect"

class FileNotFoundError extends Schema.TaggedError<FileNotFoundError>(
  "FileNotFoundError"
)("FileNotFoundError", { path: Schema.String }) {}
```

## 配置管理

- 通过 `PluginOptions` 接收配置
- 在 `PluginInput` 中获取运行时上下文
- 敏感配置通过环境变量传入，禁止硬编码
