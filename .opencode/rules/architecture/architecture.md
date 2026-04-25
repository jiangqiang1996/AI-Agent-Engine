# 架构设计规范

## 模块划分

```
src/
├── index.ts              # 插件入口，导出 PluginModule
├── tools/                # 工具定义（3 个工具）
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

## 资产同步

构建过程负责将源资产同步到运行时目录：
- `src/assets/skills/` 通过 plugin `config.skills.paths` 注入到 `.opencode/skills/`
- `src/assets/commands/` 构建时同步到 `.opencode/commands/`
- `src/assets/agents/` 构建时同步到 `.opencode/agents/ae/`
- 插件产物输出到 `.opencode/plugins/`

## AE 资产名称常量化

所有 AE 插件的资产名称（技能名、命令名、代理名、工具名）必须在 `src/schemas/ae-asset-schema.ts` 中定义为 `as const` 对象常量，其他文件通过常量引用，禁止硬编码字符串字面量。

### 常量定义

| 常量 | 格式 | 数量 | 示例 |
|------|------|------|------|
| `SKILL` | `ae:xxx` | 17 | `SKILL.BRAINSTORM` → `'ae:brainstorm'` |
| `COMMAND` | `ae-xxx` | 17 | `COMMAND.BRAINSTORM` → `'ae-brainstorm'` |
| `AGENT` | `xxx-reviewer` 等 | 28 | `AGENT.CORRECTNESS_REVIEWER` → `'correctness-reviewer'` |
| `TOOL` | `ae-xxx` | 3 | `TOOL.AE_RECOVERY` → `'ae-recovery'` |

### 引用规则

- 服务层、工具层引用名称时必须通过常量（如 `SKILL.BRAINSTORM`），不得使用字符串字面量（如 `'ae:brainstorm'`）
- Zod Schema 的 `.enum()` 参数直接引用常量值，保持枚举顺序与常量定义一致
- 多行描述文本（如工具 description）中的技能名属于自然语言，豁免常量引用要求

### 新增资产时

新增技能、命令、代理或工具时，必须先在对应常量对象中添加条目，再在目录/注册文件中引用。禁止绕过常量直接使用字符串。

## SKILL.md 与代码的双重决策机制

AE 技能体系中，`SKILL.md` 和 TypeScript 服务代码可能对同一逻辑（如审查者选择）各自拥有一套决策机制。
这并非冗余或冲突，而是有意设计：
- `SKILL.md` 中的指令由 LLM 在执行技能时解读和遵循
- TypeScript 服务代码（如 `review-catalog.ts`、`review-selector.ts`）供工具（如 `ae-review-contract`）调用

两者应保持语义一致，但不应仅因为存在两套机制就报告为问题。当两者描述矛盾时，
应先确认哪一方的行为是预期的（优先参考上游参考项目的实现），再修正另一方。

涉及的文件：
- `src/assets/skills/ae-review/SKILL.md` - 定义审查流程的 LLM 指令
- `src/services/review-catalog.ts` - 定义审查者目录
- `src/services/review-selector.ts` - 定义审查者选择逻辑
- `src/tools/ae-review-contract.tool.ts` - 调用选择逻辑的工具

## ae-catalog 与 SKILL.md frontmatter 字段一致性

ae-catalog.ts 和各服务层文件中源自 SKILL.md frontmatter 的字段必须与 SKILL.md 保持一致。修改任一方时必须同步更新另一方。

### 字段一致性级别

| 字段 | 一致性要求 | 原因 |
|------|-----------|------|
| `argumentHint` ↔ `argument-hint` | **字面一致** | 参数格式说明无精简空间，两处值必须完全相同 |
| `description` ↔ `description` | **语义一致** | catalog 可有意精简用于 TUI 显示，但语义方向不可偏离 |

### 服务层注释一致性

review-catalog.ts、review-selector.ts 等服务文件中的注释描述技能定位时，必须与对应 SKILL.md 的定位声明语义一致。定位描述变更时必须同步更新注释。

### 涉及文件

- `src/services/ae-catalog.ts` — 技能目录（argumentHint、description）
- `src/services/review-catalog.ts` — 审查者目录（定位注释）
- `src/services/review-selector.ts` — 审查者选择（定位注释）
- `src/assets/skills/*/SKILL.md` — 技能 frontmatter（argument-hint、description）

### 与双重决策机制的关系

此规范是 SKILL.md 与代码双重决策机制的延伸，将语义一致原则从审查者选择逻辑扩展到 catalog 字段和服务层定位注释。

## 阶段回退策略

AE 流程中，当某个阶段找不到可恢复的上游产物时，回退到更早的阶段是有意设计而非错误。
例如 `plan` 阶段没有 brainstorm 产物时回退到 `ae:brainstorm`，因为 plan 依赖上游需求文档。

原则：
- 有上游依赖的阶段，找不到上游产物时应回退到上游阶段
- `recovery-service.ts` 中的 `fallbackSkillForPhase` 映射体现了这一依赖链
- 不应将"回退到更早阶段"报告为逻辑错误

阶段依赖链示例：
- `work` → 依赖 `plan` → 依赖 `brainstorm`
- `review` → 依赖代码变更，可直接执行
- `document-review` → 可审查需求文档和计划文档

当 `recovery-service.ts` 的恢复逻辑回退到更早阶段时，这是预期行为而非缺陷。